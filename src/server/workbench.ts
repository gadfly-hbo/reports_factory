import type { WorkspaceStore } from '../storage/workspace.js';
import {
  resolveOutboundPolicy,
  approvalKey,
  OUTBOUND_MODES,
  type OutboundMode,
} from '../model/outbound.js';
import { modelChainAvailable, piTransport } from '../model/pi-transport.js';
import { LlmStageClient, chainFromEnv, DEFAULT_TIMEOUT_MS } from '../model/client.js';
import { replayTransport, loadRecordings } from '../model/recording.js';
import { resolveBudget, checkBudget, type BudgetEntry } from '../model/budget.js';
import { PptStepSchema, type PptStep, type Project, type SourceAsset } from '../schema/project.js';
import { UnderstandingSchema, UNDERSTAND_INSTRUCTION, type Understanding } from '../schema/understanding.js';
import { FrameworkGenSchema, FrameworkSchema, FRAMEWORK_INSTRUCTION, type Framework, type FrameworkPage } from '../schema/framework.js';
import { buildWorkerRequest } from '../model/agent-kernel.js';
import { getTemplate } from '../schema/template.js';

/**
 * 工作台服务（M10 六步）：上传资料 → 读取理解 → 确认框架 → 生成 → 逐页编辑 → 审核发布。
 * 本文件是用例层主缝（S-A）：对上承接路由，对下编排模型运输/围栏/存储。
 * 围栏三件套（预算三线封顶/出站门/审计留痕）在此收敛，六步全部模型调用必须过 gateOrThrow。
 */

/** 六步项目 work 态：逐段落盘 work/state.json，重启可恢复（checkpoint 基础） */
export interface PptWorkState {
  /** S3 读取理解：source_id → 理解摘要（要点/数据要点/主题标签）；G11 逐文件 checkpoint */
  understanding?: Record<string, Understanding>;
  /** S4 框架：页序列；确认后不可变（framework_confirmed） */
  framework?: Framework;
  framework_confirmed?: boolean;
  /** S5/S6 页内容与逐页 checkpoint */
  pages?: Record<string, unknown>;
  page_states?: Record<string, 'pending' | 'running' | 'done' | 'failed'>;
  /** 生成任务态（S5）：running 僵尸按 stale_at 回收 */
  generation?: { status: 'running' | 'done' | 'failed'; stale_at?: string; note?: string };
}

export const PPT_STEPS = PptStepSchema.options;

export interface StepState {
  key: PptStep;
  unlocked: boolean;
  /** 当前进行到的一步（最远已解锁），用于 /project/:id 重定向 */
}

/** 步骤解锁规则（ui-contract S-RT，顺序不可变——proposal D2）：由项目数据推导，不落盘 */
export function stepsFor(project: Project | null, sources: SourceAsset[], work: PptWorkState): Record<PptStep, boolean> {
  const sourceList = sources ?? [];
  const understanding = work.understanding ?? {};
  // 理解完成 = 每份资料都有 LLM 理解摘要（S3 落数据）；解析失败文件无摘要 → 阻塞（M-U1 移除后解锁）
  const allUnderstood = sourceList.length > 0 && sourceList.every((s) => understanding[s.source_id] != null);
  const pageStates = Object.values(work.page_states ?? {});
  const pagesDone = pageStates.length > 0 && pageStates.every((s) => s === 'done');
  return {
    upload: true,
    understand: sourceList.length > 0,
    framework: allUnderstood,
    generate: work.framework_confirmed === true,
    'page-edit': Object.values(pageStates).some((s) => s === 'done'),
    publish: pagesDone,
  };
}

export class WorkbenchService {
  constructor(private readonly store: WorkspaceStore) {}

  // ---- 模型运输（懒加载；replay env 供测试/冒烟离线驱动）----

  private _modelClient: Promise<LlmStageClient> | undefined;

  modelClient(): Promise<LlmStageClient> {
    if (!this._modelClient) {
      this._modelClient = (async () => {
        const replayPath = process.env['REPORT_STUDIO_MODEL_REPLAY'];
        const timeoutMs = Number(process.env['REPORT_STUDIO_MODEL_TIMEOUT_MS'] ?? DEFAULT_TIMEOUT_MS);
        // 多录制文件用逗号分隔（如 S3 理解 + S4 框架两份夹具）
        const recordings = replayPath ? (await Promise.all(replayPath.split(',').filter(Boolean).map((p) => loadRecordings(p.trim())))).flat() : [];
        const transport = replayPath ? replayTransport(recordings) : piTransport({ timeoutMs });
        return new LlmStageClient({ transport, chain: chainFromEnv(), timeoutMs });
      })();
      // 初始化失败（如模型链配置非法）不缓存拒绝——下次调用重试
      this._modelClient.catch(() => {
        this._modelClient = undefined;
      });
    }
    return this._modelClient;
  }

  // ---- 围栏：预算三线封顶 + 出站门 + 审计 ----

  /** 出站门统一入口：预算三线封顶 + 批准检查；拒绝时记录零内容阻断审计并抛 403 */
  async gateOrThrow(projectId: string, mode: OutboundMode, stage: string): Promise<void> {
    const log = await this.store.readOutboundLog(projectId);
    const project = await this.store.getProject(projectId);
    const budget = resolveBudget(project ?? {}, process.env);
    const verdict = checkBudget(log as BudgetEntry[], budget, stage, Date.now());
    if (!verdict.allowed) {
      await this.store.appendOutboundLog(projectId, {
        at: new Date().toISOString(), stage, provider: 'none', modelId: '', mode, itemCount: 0, bytes: 0, cost: 0, blocked: true,
      });
      await this.store.appendAuditLog(projectId, { at: new Date().toISOString(), kind: 'gate_decision', stage, status: 'budget_blocked', detail: { line: verdict.line } });
      throw Object.assign(new Error(verdict.reason ?? '预算超帽'), { statusCode: 403, budgetLine: verdict.line });
    }
    const gate = await this.checkOutbound(projectId, mode);
    if (!gate.allowed) {
      await this.store.appendOutboundLog(projectId, {
        at: new Date().toISOString(), stage, provider: 'none', modelId: '', mode, itemCount: 0, bytes: 0, cost: 0, blocked: true,
      });
      const policy = await this.policyFor(projectId);
      throw Object.assign(new Error(gate.reason ?? 'AI 出站被拒绝'), {
        statusCode: 403,
        needsApproval: policy.disabled ? undefined : policy.needsApproval,
      });
    }
  }

  /** 会话批准缓存：`projectId|mode`（不同发送类别分开批准）；持久化源在 workspace，重启不失效 */
  private readonly outboundApproved = new Set<string>();

  private async isApproved(projectId: string, mode: OutboundMode): Promise<boolean> {
    const key = approvalKey(projectId, mode);
    if (this.outboundApproved.has(key)) return true;
    const persisted = await this.store.readOutboundApprovals(projectId);
    if (persisted[mode]) {
      this.outboundApproved.add(key);
      return true;
    }
    return false;
  }

  policyFor(projectId: string) {
    return this.store.getProject(projectId).then((p) => resolveOutboundPolicy(p?.privacy_policy ?? 'local_only'));
  }

  /** 出站门：disabled / 未批准 → 拒绝（六步所有模型调用必须先过这道） */
  async checkOutbound(projectId: string, mode: OutboundMode): Promise<{ allowed: boolean; reason?: string }> {
    const policy = await this.policyFor(projectId);
    if (policy.disabled) return { allowed: false, reason: '项目隐私策略为仅本地，AI 出站已关闭' };
    if (policy.needsApproval && !(await this.isApproved(projectId, mode))) {
      return { allowed: false, reason: '本次会话尚未批准该类出站内容' };
    }
    return { allowed: true };
  }

  async approveOutbound(projectId: string, mode: OutboundMode): Promise<void> {
    const policy = await this.policyFor(projectId);
    if (policy.disabled) throw Object.assign(new Error('项目隐私策略为仅本地，AI 出站已关闭'), { statusCode: 403 });
    this.outboundApproved.add(approvalKey(projectId, mode));
    // 持久化：重启不失效、随数据同步；记录批准时间
    const approvals = await this.store.readOutboundApprovals(projectId);
    approvals[mode] = new Date().toISOString();
    await this.store.writeOutboundApprovals(projectId, approvals);
    await this.store.appendAuditLog(projectId, { at: new Date().toISOString(), kind: 'outbound_approval', stage: 'gate', status: 'approved', detail: { mode } });
  }

  /** capabilities（项目详情携带，驱动前端 AI 入口渲染） */
  async aiCapabilities(projectId: string) {
    const project = await this.store.getProject(projectId);
    const policy = resolveOutboundPolicy(project?.privacy_policy ?? 'local_only');
    if (!policy.disabled) for (const m of OUTBOUND_MODES) await this.isApproved(projectId, m);
    return {
      ai: {
        enabled: !policy.disabled,
        needsApproval: policy.disabled ? false : policy.needsApproval,
        modelAvailable: modelChainAvailable(),
        approvedModes: policy.disabled ? [] : OUTBOUND_MODES.filter((m) => this.outboundApproved.has(approvalKey(projectId, m))),
      },
    };
  }

  /** 记录一次真实出站调用（零内容审计 + 成本聚合；阻断尝试由 gateOrThrow 记录） */
  async recordOutboundCall(
    projectId: string,
    entry: { at: string; stage: string; provider: string; modelId: string; mode: string; itemCount: number; bytes: number; cost: number; blocked?: boolean },
  ): Promise<void> {
    await this.store.appendOutboundLog(projectId, entry);
  }

  // ---- 六步状态（S1 骨架）----

  async readWork(projectId: string): Promise<PptWorkState> {
    return ((await this.store.readWorkState(projectId)) as PptWorkState | null) ?? {};
  }

  async writeWork(projectId: string, work: PptWorkState): Promise<void> {
    await this.store.writeWorkState(projectId, work);
  }

  // ---- 第 3 步：确认框架（S4）----

  /** 材料摘要合集（语义投影第 1 层产物，供框架与页级生成消费） */
  private async materialDigest(projectId: string): Promise<Array<{ filename: string; gist: string; points: Understanding['points'] }>> {
    const sources = await this.store.listSourceAssets(projectId);
    const work = await this.readWork(projectId);
    return sources
      .filter((s) => work.understanding?.[s.source_id])
      .map((s) => ({
        filename: s.filename,
        gist: work.understanding![s.source_id]!.gist,
        points: work.understanding![s.source_id]!.points,
      }));
  }

  /** 生成框架（单发工人）：理解摘要合集 + 简介 + 模板页型倾向 → 框架（未确认态） */
  async generateFramework(
    projectId: string,
    deps: { client?: Awaited<ReturnType<WorkbenchService['modelClient']>> } = {},
  ): Promise<Framework> {
    const project = await this.store.getProject(projectId);
    if (!project) throw Object.assign(new Error('项目不存在'), { statusCode: 404 });
    const work0 = await this.readWork(projectId);
    if (work0.framework_confirmed) {
      throw Object.assign(new Error('框架已确认锁定：如需重新生成请新建项目'), { statusCode: 422 });
    }
    const digest = await this.materialDigest(projectId);
    if (digest.length === 0) throw Object.assign(new Error('尚无资料理解摘要：先完成读取理解'), { statusCode: 400 });
    await this.gateOrThrow(projectId, 'authorized-summary', 'framework');

    const template = getTemplate(project.template_id);
    const req = await buildWorkerRequest({
      skillName: 'ppt-report',
      stageInstruction: FRAMEWORK_INSTRUCTION,
      payload: {
        title: project.title,
        purpose: project.purpose ?? '',
        template_page_plan: template?.page_plan ?? [],
        sources: digest,
      },
    });
    const client = deps.client ?? (await this.modelClient());
    let framework: Framework;
    try {
      const outcome = await client.complete({
        stage: 'framework',
        callKey: `framework:${projectId}:${(await this.readWork(projectId)).framework ? 'regen' : 'gen'}:${digest.length}`,
        system: req.system,
        user: req.user,
        schema: FrameworkGenSchema,
      });
      framework = outcome.output as Framework;
      await this.recordOutboundCall(projectId, {
        at: new Date().toISOString(), stage: 'framework', provider: outcome.provider, modelId: outcome.modelId,
        mode: 'authorized-summary', itemCount: framework.pages.length, bytes: req.user.length, cost: outcome.cost,
      });
    } catch (e) {
      await this.recordOutboundCall(projectId, {
        at: new Date().toISOString(), stage: 'framework', provider: 'none', modelId: '',
        mode: 'authorized-summary', itemCount: 1, bytes: 0, cost: 0,
      });
      throw e;
    }
    // page_id 补齐（01…序）；确认前可编辑
    const pages = framework.pages.map((p, i) => ({ ...p, page_id: `page_${String(i + 1).padStart(2, '0')}` }));
    const work = await this.readWork(projectId);
    await this.writeWork(projectId, { ...work, framework: { pages }, framework_confirmed: false });
    await this.store.appendAuditLog(projectId, {
      at: new Date().toISOString(), kind: 'framework', stage: 'framework', status: 'generated',
      detail: { pages: pages.length },
    });
    return { pages };
  }

  /** 框架编辑（确认前）：整体替换页序列（改题/删页/调序/加页均为前端组装后的整表提交）；确认后拒绝（422） */
  async updateFramework(projectId: string, pages: Array<Omit<FrameworkPage, 'page_id'> & { page_id?: string }>): Promise<Framework> {
    const work = await this.readWork(projectId);
    if (work.framework_confirmed) {
      throw Object.assign(new Error('框架已确认锁定，不可修改'), { statusCode: 422 });
    }
    if (!work.framework) {
      throw Object.assign(new Error('尚未生成框架'), { statusCode: 400 });
    }
    const framework = FrameworkGenSchema.parse({ pages });
    const withIds = framework.pages.map((p, i) => ({ ...p, page_id: `page_${String(i + 1).padStart(2, '0')}` }));
    await this.writeWork(projectId, { ...work, framework: { pages: withIds } });
    return { pages: withIds };
  }

  /** 确认框架（人决策点 1）：锁定；未生成框架时 400 */
  async confirmFramework(projectId: string): Promise<Framework> {
    const work = await this.readWork(projectId);
    if (!work.framework || work.framework.pages.length === 0) {
      throw Object.assign(new Error('尚未生成框架'), { statusCode: 400 });
    }
    if (!work.framework_confirmed) {
      await this.writeWork(projectId, { ...work, framework_confirmed: true });
      await this.store.appendAuditLog(projectId, {
        at: new Date().toISOString(), kind: 'framework', stage: 'framework', status: 'confirmed',
        detail: { pages: work.framework.pages.length },
      });
    }
    return work.framework;
  }

  /** 项目详情聚合：project + sources + steps + capabilities（路由 GET /api/projects/:id 的数据源） */

  /** 理解请求载荷（§4.6 上下文装配单点）：文本材料带确定性提炼；图片走 vision（M-U4） */
  private async understandingPayload(projectId: string, asset: SourceAsset): Promise<{
    payload: Record<string, unknown>;
    images?: Array<{ data: string; mimeType: string }>;
  }> {
    const content = await this.store.readSourceContent(projectId, asset.source_id);
    if (asset.kind === 'image') {
      return {
        payload: {
          filename: asset.filename,
          kind: asset.kind,
          media_type: asset.media_type,
          note: '图片材料：请基于图片内容提炼要点（图表请读数据，文字请读结论）',
        },
        images: [{ data: content.toString('base64'), mimeType: asset.media_type }],
      };
    }
    const derived = await this.store.readDerivedAssets(projectId, asset.source_id);
    const text = content.toString('utf-8');
    // 长文档分段摘要（map）留待页级增强；当前单发上限 60k 字符，超出截断并明示
    const truncated = text.length > 60_000;
    return {
      payload: {
        filename: asset.filename,
        kind: asset.kind,
        text: truncated ? `${text.slice(0, 60_000)}\n【材料超长，已截断】` : text,
        deterministic_extraction: derived
          ? {
              claims: (derived['claims'] as unknown[] | undefined)?.length ?? 0,
              tables: (derived['tables'] as unknown[] | undefined)?.length ?? 0,
              notes: (derived['notes'] as unknown[] | undefined)?.length ?? 0,
            }
          : null,
        truncated,
      },
    };
  }

  /** 单文件理解（G11 checkpoint：已完成文件由调用方跳过）；失败上抛由路由转译 */
  async understandSource(
    projectId: string,
    sourceId: string,
    deps: { client?: Awaited<ReturnType<WorkbenchService['modelClient']>> } = {},
  ): Promise<Understanding> {
    const project = await this.store.getProject(projectId);
    if (!project) throw Object.assign(new Error('项目不存在'), { statusCode: 404 });
    const asset = (await this.store.listSourceAssets(projectId)).find((a) => a.source_id === sourceId);
    if (!asset) throw Object.assign(new Error(`资料不存在：${sourceId}`), { statusCode: 404 });
    await this.gateOrThrow(projectId, 'authorized-summary', 'understand');

    const { payload, images } = await this.understandingPayload(projectId, asset);
    const req = await buildWorkerRequest({ skillName: 'ppt-report', stageInstruction: UNDERSTAND_INSTRUCTION, payload });
    const client = deps.client ?? (await this.modelClient());
    let understanding: Understanding;
    try {
      const outcome = await client.complete({
        stage: 'understand',
        callKey: `understand:${projectId}:${asset.source_id}:${asset.version}`,
        system: req.system,
        user: req.user,
        images,
        schema: UnderstandingSchema,
      });
      understanding = outcome.output;
      await this.recordOutboundCall(projectId, {
        at: new Date().toISOString(), stage: 'understand', provider: outcome.provider, modelId: outcome.modelId,
        mode: 'authorized-summary', itemCount: understanding.points.length, bytes: req.user.length, cost: outcome.cost,
      });
    } catch (e) {
      // 失败的真实调用也计量（预算不失真）
      await this.recordOutboundCall(projectId, {
        at: new Date().toISOString(), stage: 'understand', provider: 'none', modelId: '',
        mode: 'authorized-summary', itemCount: 1, bytes: 0, cost: 0,
      });
      await this.store.appendAuditLog(projectId, {
        at: new Date().toISOString(), kind: 'understand', stage: 'understand', status: 'failed',
        detail: { source_id: sourceId, reason: 'error' },
      });
      throw e;
    }
    const work = await this.readWork(projectId);
    await this.writeWork(projectId, {
      ...work,
      understanding: { ...(work.understanding ?? {}), [sourceId]: understanding },
    });
    await this.store.appendAuditLog(projectId, {
      at: new Date().toISOString(), kind: 'understand', stage: 'understand', status: 'done',
      detail: { source_id: sourceId, points: understanding.points.length },
    });
    return understanding;
  }

  /** 全部待理解文件（checkpoint：已有摘要的跳过）；逐文件独立成败，不因单文件中断整批 */
  async understandAllPending(
    projectId: string,
    deps: { client?: Awaited<ReturnType<WorkbenchService['modelClient']>> } = {},
  ): Promise<{ done: string[]; failed: Array<{ source_id: string; reason: string }> }> {
    const sources = await this.store.listSourceAssets(projectId);
    const work = await this.readWork(projectId);
    const done: string[] = [];
    const failed: Array<{ source_id: string; reason: string }> = [];
    for (const asset of sources) {
      if (work.understanding?.[asset.source_id]) { done.push(asset.source_id); continue; }
      try {
        await this.understandSource(projectId, asset.source_id, deps);
        done.push(asset.source_id);
      } catch (e) {
        failed.push({ source_id: asset.source_id, reason: e instanceof Error ? e.message.slice(0, 120) : String(e) });
      }
    }
    return { done, failed };
  }

  /** 资料移除（M-U1）：原件/派生/理解摘要一并清除；失败文件移除后不再阻塞框架解锁 */
  async removeSource(projectId: string, sourceId: string): Promise<void> {
    const asset = (await this.store.listSourceAssets(projectId)).find((a) => a.source_id === sourceId);
    if (!asset) throw Object.assign(new Error(`资料不存在：${sourceId}`), { statusCode: 404 });
    await this.store.deleteSourceAsset(projectId, sourceId);
    const work = await this.readWork(projectId);
    if (work.understanding?.[sourceId]) {
      const { [sourceId]: _removed, ...rest } = work.understanding;
      void _removed;
      await this.writeWork(projectId, { ...work, understanding: rest });
    }
    await this.store.appendAuditLog(projectId, {
      at: new Date().toISOString(), kind: 'source_removed', stage: 'upload', status: 'done',
      detail: { source_id: sourceId },
    });
  }

  /** 项目详情聚合：project + sources + steps + capabilities（路由 GET /api/projects/:id 的数据源） */
  async projectDetail(projectId: string) {
    const project = await this.store.getProject(projectId);
    if (!project) throw Object.assign(new Error('项目不存在'), { statusCode: 404 });
    const [sources, work, capabilities, exports] = await Promise.all([
      this.store.listSourceAssets(projectId),
      this.readWork(projectId),
      this.aiCapabilities(projectId),
      this.store.listExports(projectId),
    ]);
    const unlocked = stepsFor(project, sources, work);
    return {
      project,
      sources,
      exports,
      capabilities,
      steps: PPT_STEPS.map((key) => ({ key, unlocked: unlocked[key] })),
      understanding: work.understanding ?? {},
      framework: work.framework ?? null,
      framework_confirmed: work.framework_confirmed === true,
    };
  }
}

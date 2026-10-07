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

/**
 * 工作台服务（M10 六步）：上传资料 → 读取理解 → 确认框架 → 生成 → 逐页编辑 → 审核发布。
 * 本文件是用例层主缝（S-A）：对上承接路由，对下编排模型运输/围栏/存储。
 * 围栏三件套（预算三线封顶/出站门/审计留痕）在此收敛，六步全部模型调用必须过 gateOrThrow。
 */

/** 六步项目 work 态：逐段落盘 work/state.json，重启可恢复（checkpoint 基础） */
export interface PptWorkState {
  /** S3 读取理解：source_id → 理解摘要（要点/数据要点/主题标签） */
  understanding?: Record<string, unknown>;
  /** S4 框架：页序列（{page_id,title,page_type,intent,source_hint?}[]）；确认后不可变 */
  framework?: Array<{ page_id: string; title: string; page_type: string; intent?: string; source_hint?: string }>;
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
        const transport = replayPath ? replayTransport(await loadRecordings(replayPath)) : piTransport({ timeoutMs });
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
    };
  }
}

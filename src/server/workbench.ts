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
import { PageDraftSchema, PAGE_DRAFT_INSTRUCTION, type PageDraft } from '../schema/page-draft.js';
import { buildWorkerRequest } from '../model/agent-kernel.js';
import { checkPrivacy, type PrivacyReport, type PrivacyCheckItem } from '../checks/privacy.js';
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
  /** S5/S6 页内容（page_id → 草稿）与逐页 checkpoint */
  pages?: Record<string, PageDraft>;
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

  // ---- 第 4 步：生成（S5）----

  /** 投影不足时的 Top-K 兜底宽度（检索单发兜底为样张盲评后的增强，M-U 披露过阶梯） */
  static readonly PROJECTION_TOP_K = 14;

  /**
   * 语义投影（材料投影三层机制第 2 层，PRD 动工审批门决议）：
   * 页意图（title+intent+source_hint）× 理解要点主题标签评分，Top-K 装配材料上下文。
   * 评分不足时扩大到全量 Top-K 兜底（保证模型拿到足够材料）。
   */
  projectMaterials(
    digest: Array<{ filename: string; gist: string; points: Array<{ text: string; topic_tag: string; kind: string; value?: number; unit?: string }> }>,
    page: { title: string; intent?: string; source_hint?: string[] },
  ): { materials: string[]; text: string } {
    const hints = new Set((page.source_hint ?? []).map((h) => h.toLowerCase()));
    const intentWords = `${page.title} ${page.intent ?? ''}`;
    const scored = digest.flatMap((src) =>
      src.points.map((pt) => {
        let score = 0;
        if (hints.has(pt.topic_tag.toLowerCase())) score += 3;
        for (const w of pt.topic_tag.split(/、|\s+/)) {
          if (w.length >= 2 && intentWords.includes(w)) score += 2;
        }
        return { src, pt, score };
      }),
    );
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, WorkbenchService.PROJECTION_TOP_K);
    const materials = top.map(({ src, pt }) =>
      `「${pt.topic_tag}」${pt.text}${pt.value != null ? `（${pt.value}${pt.unit ?? ''}）` : ''} —— 来源 ${src.filename}`,
    );
    const text = materials.join('\n');
    return { materials, text };
  }

  /**
   * 数字护栏（后校验，M7 范式）：输出中的数字必须能在投影材料文本中找到。
   * 豁免：年份（19xx/20xx）、页数结构数字。违规列表非空 = 护栏拒绝。
   */
  static digitGuardViolations(draft: PageDraft, materialText: string): string[] {
    const out = JSON.stringify(draft);
    const violations: string[] = [];
    for (const m of out.matchAll(/(?<![\d.])(\d{1,9}(?:\.\d+)?)(?![\d])/g)) {
      const n = m[1]!;
      if (/^(19|20)\d\d$/.test(n)) continue; // 年份
      if (!materialText.includes(n.replace(/^0+(?=\d)/, ''))) violations.push(n);
    }
    return violations;
  }

  /** 框架页型 → ReportSpec 页型（渲染层封闭枚举；未知映射按位置语义兜底） */
  private static toReportPageType(pageType: string, index: number, total: number): 'cover' | 'summary' | 'metrics_overview' | 'trend' | 'issue_breakdown' | 'option_comparison' | 'action_items' | 'evidence_appendix' {
    const t = pageType.toLowerCase();
    if (/cover|封面/.test(pageType) || (index === 0 && /title|标题/.test(pageType))) return 'cover';
    if (/summary|摘要|exec/.test(t)) return 'summary';
    if (/metric|指标|kpi|data|数据/.test(t)) return 'metrics_overview';
    if (/trend|chart|图表|趋势/.test(t)) return 'trend';
    if (/issue|problem|洞察|原因|限制/.test(t)) return 'issue_breakdown';
    if (/option|comparison|方案|比较/.test(t)) return 'option_comparison';
    if (/action|next|行动|收尾|下一步/.test(t)) return 'action_items';
    if (/appendix|附录|evidence|证据/.test(t)) return 'evidence_appendix';
    return index === total - 1 ? 'action_items' : 'summary';
  }

  /** 页草稿 → ReportSpec（渲染/导出适配层；draftToReportSpec 单一实现） */
  pagesToReportSpec(project: Project, framework: Framework, pages: Record<string, PageDraft>): import('../schema/report-spec.js').ReportSpec {
    const specPages = framework.pages.map((fp, i) => {
      const draft = pages[fp.page_id];
      const chart = draft?.chart
        ? {
            chart_id: `chart_${fp.page_id}`,
            type: draft.chart.type,
            title: draft.chart.title,
            series: draft.chart.series.map((s) => ({
              name: s.name,
              data: draft.chart!.categories.map((label, vi) => ({ label, value: s.values[vi] ?? 0 })),
            })),
            source_ref: undefined,
          }
        : undefined;
      return {
        page_id: fp.page_id,
        type: WorkbenchService.toReportPageType(fp.page_type, i, framework.pages.length),
        headline: draft?.headline ?? fp.title,
        body: draft?.body,
        bullets: draft?.bullets.map((b) => ({ text: b.text, status: 'confirmed' as const })),
        chart,
        claim_refs: [] as string[],
        metric_refs: [] as string[],
        evidence_refs: [] as string[],
        locked: false,
      };
    });
    return {
      schema_version: '1.0',
      report_id: `deck_${project.project_id}`,
      revision_id: 'rev_001',
      brief: {
        audience: project.purpose ?? '阅读者',
        purpose: project.title,
        page_budget: framework.pages.length,
        language: 'zh-CN',
      },
      source_snapshot: [],
      metrics: [],
      claims: [],
      pages: specPages,
      theme: { brand: project.brand },
    } as import('../schema/report-spec.js').ReportSpec;
  }

  /** 逐页生成（M5 核心）：确认框架 → 语义投影 → 逐页单发（checkpoint/预算逐页复查/数字护栏/页级重试） */
  async generatePages(
    projectId: string,
    opts: { page_id?: string } = {},
    deps: { client?: Awaited<ReturnType<WorkbenchService['modelClient']>> } = {},
  ): Promise<{ states: NonNullable<PptWorkState['page_states']>; done: number; failed: number }> {
    const project = await this.store.getProject(projectId);
    if (!project) throw Object.assign(new Error('项目不存在'), { statusCode: 404 });
    const work0 = await this.readWork(projectId);
    if (!work0.framework || !work0.framework_confirmed) {
      throw Object.assign(new Error('框架未确认：不可生成'), { statusCode: 422 });
    }
    // 并发守卫：running 且 10 分钟内有 checkpoint → 返回当前态（僵尸自愈由 stale_at 判定）
    const gen = work0.generation;
    if (gen?.status === 'running' && gen.stale_at && Date.now() - Date.parse(gen.stale_at) < 10 * 60_000 && !opts.page_id) {
      const states = work0.page_states ?? {};
      return { states, done: Object.values(states).filter((s) => s === 'done').length, failed: Object.values(states).filter((s) => s === 'failed').length };
    }
    await this.gateOrThrow(projectId, 'authorized-summary', 'page-draft');
    const client = deps.client ?? (await this.modelClient());
    const digest = await this.materialDigest(projectId);
    if (digest.length === 0) throw Object.assign(new Error('尚无资料理解摘要'), { statusCode: 400 });

    const targets = opts.page_id
      ? work0.framework.pages.filter((p) => p.page_id === opts.page_id)
      : work0.framework.pages;
    if (targets.length === 0) throw Object.assign(new Error(`页不存在：${opts.page_id}`), { statusCode: 404 });

    const budget = resolveBudget(project, process.env);
    let work = work0;
    const states: NonNullable<PptWorkState['page_states']> = { ...(work.page_states ?? {}) };
    for (const t of targets) if (states[t.page_id] !== 'done') states[t.page_id] = 'pending';
    const audit = (status: string, detail: Record<string, unknown>) =>
      this.store.appendAuditLog(projectId, { at: new Date().toISOString(), kind: 'page_generation', stage: 'page-draft', status, detail });

    for (const fp of targets) {
      if (states[fp.page_id] === 'done' && work.pages?.[fp.page_id]) continue; // checkpoint：已完成页不重跑
      // 预算逐页复查（超帽停止，剩余页保持 pending 明示）
      const log = await this.store.readOutboundLog(projectId);
      const verdict = checkBudget(log as BudgetEntry[], budget, 'page-draft', Date.now());
      if (!verdict.allowed) {
        await audit('budget_stop', { page_id: fp.page_id, line: verdict.line });
        break;
      }
      states[fp.page_id] = 'running';
      // 每次迭代先重读：上一页的成功写盘刚落了 draft，用陈旧快照写盘会抹掉它（pages 丢失根因）
      work = await this.readWork(projectId);
      await this.writeWork(projectId, { ...work, page_states: { ...states }, generation: { status: 'running', stale_at: new Date().toISOString() } });

      const { materials, text: materialText } = this.projectMaterials(digest, fp);
      if (materials.length === 0) {
        states[fp.page_id] = 'failed';
        await this.writeWork(projectId, { ...work, page_states: { ...states } });
        await audit('page_failed', { page_id: fp.page_id, reason: 'no_materials' });
        continue;
      }
      const req = await buildWorkerRequest({ skillName: 'ppt-report', stageInstruction: PAGE_DRAFT_INSTRUCTION, payload: { page: { page_id: fp.page_id, title: fp.title, intent: fp.intent, page_type: fp.page_type }, materials, boundaries: [] } });
      let done = false;
      let lastReason = '';
      for (let attempt = 0; attempt < 2 && !done; attempt++) {
        try {
          const outcome = await client.complete({
            stage: 'page-draft',
            callKey: `page-draft:${projectId}:${fp.page_id}:${attempt}`,
            system: req.system,
            user: req.user,
            schema: PageDraftSchema,
          });
          const draft = outcome.output;
          const violations = WorkbenchService.digitGuardViolations(draft, materialText);
          if (draft.uncovered || draft.bullets.length === 0) {
            // uncovered = 材料未覆盖该页主题：明示失败（不产「待补充」占位，契约红线）
            lastReason = '材料未覆盖该页主题';
            await audit('page_failed', { page_id: fp.page_id, reason: 'uncovered' });
            break;
          }
          if (violations.length > 0) {
            lastReason = `数字护栏拒绝：${violations.join(', ')}`;
            await this.recordOutboundCall(projectId, { at: new Date().toISOString(), stage: 'page-draft', provider: outcome.provider, modelId: outcome.modelId, mode: 'authorized-summary', itemCount: 1, bytes: req.user.length, cost: outcome.cost });
            await audit('digit_guard', { page_id: fp.page_id, attempt });
            continue; // 重试一次
          }
          const w = await this.readWork(projectId);
          await this.writeWork(projectId, { ...w, pages: { ...(w.pages ?? {}), [fp.page_id]: draft }, page_states: { ...states, [fp.page_id]: 'done' }, generation: { status: 'running', stale_at: new Date().toISOString() } });
          states[fp.page_id] = 'done';
          done = true;
          await this.recordOutboundCall(projectId, { at: new Date().toISOString(), stage: 'page-draft', provider: outcome.provider, modelId: outcome.modelId, mode: 'authorized-summary', itemCount: 1, bytes: req.user.length, cost: outcome.cost });
          await audit('page_done', { page_id: fp.page_id });
        } catch (e) {
          lastReason = e instanceof Error ? e.message.slice(0, 120) : String(e);
          // 失败的真实调用也计量（次数/轮次不失真）
          await this.recordOutboundCall(projectId, { at: new Date().toISOString(), stage: 'page-draft', provider: 'none', modelId: '', mode: 'authorized-summary', itemCount: 1, bytes: 0, cost: 0 });
        }
      }
      if (!done && states[fp.page_id] !== 'done') {
        states[fp.page_id] = 'failed';
        await this.writeWork(projectId, { ...(await this.readWork(projectId)), page_states: { ...states } });
        await audit('page_failed', { page_id: fp.page_id, reason: lastReason.slice(0, 60) || 'error' });
      }
    }
    const finalWork = await this.readWork(projectId);
    const finalStates = finalWork.page_states ?? states;
    const allDone = finalWork.framework!.pages.every((p) => finalStates[p.page_id] === 'done');
    const anyFailed = Object.values(finalStates).some((s) => s === 'failed');
    const doneCount = Object.values(finalStates).filter((s) => s === 'done').length;
    const failedCount = Object.values(finalStates).filter((s) => s === 'failed').length;
    await this.writeWork(projectId, { ...finalWork, page_states: finalStates, generation: { status: allDone ? 'done' : anyFailed ? 'failed' : 'running', stale_at: new Date().toISOString(), note: allDone ? undefined : failedCount > 0 ? `${failedCount} 页失败，可单独重试` : undefined } });
    void doneCount;
    return { states: finalStates, done: doneCount, failed: failedCount };
  }

  // ---- 第 5 步：逐页编辑（S6）----

  /** 手工直改（G8：仅纯文字字段；emoji 不过滤——用户意图优先，M-U6）；内容变更时间供发布批准失效判定 */
  async updatePageManual(
    projectId: string,
    pageId: string,
    patch: { headline?: string; bullets?: Array<{ text: string; source_hint?: string }>; body?: string; table_note?: string },
  ): Promise<PageDraft> {
    const work = await this.readWork(projectId);
    const draft = work.pages?.[pageId];
    if (!draft) throw Object.assign(new Error(`页不存在或未生成：${pageId}`), { statusCode: 404 });
    const next: PageDraft = {
      ...draft,
      ...(patch.headline !== undefined ? { headline: patch.headline } : {}),
      ...(patch.bullets !== undefined ? { bullets: patch.bullets } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.table_note !== undefined ? { table_note: patch.table_note } : {}),
    };
    await this.writeWork(projectId, { ...work, pages: { ...(work.pages ?? {}), [pageId]: next } });
    await this.store.appendAuditLog(projectId, {
      at: new Date().toISOString(), kind: 'page_edit', stage: 'page-edit', status: 'manual_edit',
      detail: { page_id: pageId, fields: Object.keys(patch) },
    });
    return next;
  }

  /** agent 整页重写（单发变换）：指令 + 当前页 + 语义投影材料 → 出站白名单（PageDraftSchema）fail-closed + 数字护栏 */
  async rewritePage(
    projectId: string,
    pageId: string,
    instruction: string,
    deps: { client?: Awaited<ReturnType<WorkbenchService['modelClient']>> } = {},
  ): Promise<PageDraft> {
    const project = await this.store.getProject(projectId);
    if (!project) throw Object.assign(new Error('项目不存在'), { statusCode: 404 });
    const work0 = await this.readWork(projectId);
    const draft = work0.pages?.[pageId];
    if (!draft) throw Object.assign(new Error(`页不存在或未生成：${pageId}`), { statusCode: 404 });
    if (!work0.framework) throw Object.assign(new Error('框架不存在'), { statusCode: 400 });
    const fp = work0.framework.pages.find((p) => p.page_id === pageId)!;
    await this.gateOrThrow(projectId, 'authorized-summary', 'page-rewrite');
    const digest = await this.materialDigest(projectId);
    const { materials, text: materialText } = this.projectMaterials(digest, fp);
    const req = await buildWorkerRequest({
      skillName: 'ppt-report',
      stageInstruction: PAGE_DRAFT_INSTRUCTION,
      payload: {
        page: { page_id: pageId, title: fp.title, intent: fp.intent, page_type: fp.page_type },
        current_page: draft,
        user_instruction: instruction.slice(0, 500),
        materials,
        boundaries: [],
      },
    });
    const client = deps.client ?? (await this.modelClient());
    let next: PageDraft | undefined;
    try {
      const outcome = await client.complete({
        stage: 'page-rewrite',
        callKey: `page-rewrite:${projectId}:${pageId}`,
        system: req.system,
        user: req.user,
        schema: PageDraftSchema,
      });
      const candidate = outcome.output;
      const violations = WorkbenchService.digitGuardViolations(candidate, materialText);
      if (candidate.uncovered || candidate.bullets.length === 0) {
        throw Object.assign(new Error('改写结果判定材料未覆盖该页主题，已拒绝应用'), { statusCode: 422 });
      }
      if (violations.length > 0) {
        // 白名单/护栏 fail-closed：拒绝应用原页保持不变（N4：面板明示原因）
        throw Object.assign(new Error(`改写被拒（数字护栏）：以下数字未见于材料——${violations.join(', ')}`), { statusCode: 422 });
      }
      next = candidate;
      await this.recordOutboundCall(projectId, {
        at: new Date().toISOString(), stage: 'page-rewrite', provider: outcome.provider, modelId: outcome.modelId,
        mode: 'authorized-summary', itemCount: 1, bytes: req.user.length, cost: outcome.cost,
      });
    } catch (e) {
      if (!(e instanceof Error && e.message.startsWith('改写被拒'))) {
        await this.recordOutboundCall(projectId, { at: new Date().toISOString(), stage: 'page-rewrite', provider: 'none', modelId: '', mode: 'authorized-summary', itemCount: 1, bytes: 0, cost: 0 });
      }
      throw e;
    }
    const work = await this.readWork(projectId);
    await this.writeWork(projectId, { ...work, pages: { ...(work.pages ?? {}), [pageId]: next } });
    await this.store.appendAuditLog(projectId, {
      at: new Date().toISOString(), kind: 'page_edit', stage: 'page-edit', status: 'agent_rewrite',
      detail: { page_id: pageId, instruction_len: instruction.length },
    });
    return next;
  }

  /** 删页（G8 沿用 M6 语义）：封面页与最后一页拒删；page_id 不重排；已批准外发的内容变更失效在发布门判定 */
  async deletePage(projectId: string, pageId: string): Promise<void> {
    const work = await this.readWork(projectId);
    if (!work.framework) throw Object.assign(new Error('框架不存在'), { statusCode: 400 });
    const pages = work.framework.pages;
    const idx = pages.findIndex((p) => p.page_id === pageId);
    if (idx < 0) throw Object.assign(new Error(`页不存在：${pageId}`), { statusCode: 404 });
    if (idx === 0) throw Object.assign(new Error('封面页不可删除'), { statusCode: 422 });
    if (pages.length <= 1) throw Object.assign(new Error('最后一页不可删除'), { statusCode: 422 });
    const { [pageId]: _dp, ...restPages } = work.pages ?? {};
    const { [pageId]: _ds, ...restStates } = work.page_states ?? {};
    void _dp; void _ds;
    await this.writeWork(projectId, {
      ...work,
      framework: { pages: pages.filter((p) => p.page_id !== pageId) },
      pages: restPages,
      page_states: restStates,
      generation: { status: Object.values(restStates).every((s) => s === 'done') ? 'done' : 'failed', stale_at: new Date().toISOString() },
    });
    await this.store.appendAuditLog(projectId, {
      at: new Date().toISOString(), kind: 'page_edit', stage: 'page-edit', status: 'page_deleted',
      detail: { page_id: pageId },
    });
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

  // ---- 第 6 步：审核发布（S7）----

  /** 内容哈希：sources 计数 + page 标题 + bullets 文本哈希（任一变化即失效） */
  private async contentHash(projectId: string, work: PptWorkState): Promise<string> {
    const { createHash } = await import('node:crypto');
    const sources = await this.store.listSourceAssets(projectId);
    const parts = [
      `sources:${sources.length}`,
      ...sources.map((s) => `${s.source_id}@${s.version}:${s.parse_status}`),
    ];
    if (work.framework) parts.push(`framework:${work.framework.pages.map((p) => p.title).join('|')}`);
    if (work.pages) parts.push(`pages:${Object.entries(work.pages).map(([pid, d]) => `${pid}:${d.headline}|${d.bullets.map((b) => b.text).join(';')}`).join('|')}`);
    return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 16);
  }

  /** 发布门审批：内容变更集哈希（材料增删/页内容变 → 失效） */
  async approvalState(projectId: string): Promise<{ approved_at?: string; content_hash?: string; revoked?: boolean; reason?: string }> {
    const project = await this.store.getProject(projectId);
    if (!project) return {};
    if (project.privacy_policy === 'local_only') return {};
    const approvals = await this.store.readOutboundApprovals(projectId);
    if (!approvals['formal-export']) return {};
    const work = await this.readWork(projectId);
    const curHash = await this.contentHash(projectId, work);
    if (approvals['content_hash'] && approvals['content_hash'] !== curHash) {
      return { approved_at: approvals['formal-export'], content_hash: approvals['content_hash'], revoked: true, reason: '内容已变更，需重新批准' };
    }
    return { approved_at: approvals['formal-export'], content_hash: curHash };
  }

  /** 隐私检查（发布门前置，N3 fail-closed） */
  async privacyCheck(projectId: string): Promise<PrivacyReport> {
    const work = await this.readWork(projectId);
    if (!work.framework || !work.framework_confirmed) {
      throw Object.assign(new Error('框架未确认：不可发布'), { statusCode: 422 });
    }
    const sources = await this.store.listSourceAssets(projectId);
    const project = await this.store.getProject(projectId);
    if (!project) throw Object.assign(new Error('项目不存在'), { statusCode: 404 });
    const spec = this.pagesToReportSpec(project, work.framework, work.pages ?? {});
    const flaggableBullets = Object.values(work.pages ?? {}).some((d) => d.uncovered);
    const hasCharts = spec.pages.some((p) => !!p.chart);
    return checkPrivacy(spec, {
      sources: sources.map((s) => ({ sensitivity: s.sensitivity })),
      hasEditableCharts: hasCharts,
      chartDataMode: 'aggregate_only',
      pagesHaveSpeculativeBullets: flaggableBullets,
    });
  }

  /** 批准外发：内容哈希随审批持久化；内容变更后失效态自动呈现 */
  async approveFormalExport(projectId: string): Promise<void> {
    const project = await this.store.getProject(projectId);
    if (!project) throw Object.assign(new Error('项目不存在'), { statusCode: 404 });
    if (project.privacy_policy === 'local_only') throw Object.assign(new Error('local_only 项目不可外发'), { statusCode: 403 });
    const work = await this.readWork(projectId);
    if (!work.framework || !work.framework_confirmed) throw Object.assign(new Error('框架未确认：不可外发'), { statusCode: 422 });
    const check = await this.privacyCheck(projectId);
    if (check.has_flags) throw Object.assign(new Error('隐私检查未通过：' + check.items.filter((i: PrivacyCheckItem) => i.status === 'flag').map((i: PrivacyCheckItem) => `${i.item}(${i.detail ?? ''})`).join('; ')), { statusCode: 422 });
    const hash = await this.contentHash(projectId, work);
    const approvals = await this.store.readOutboundApprovals(projectId);
    approvals['formal-export'] = new Date().toISOString();
    approvals['content_hash'] = hash;
    await this.store.writeOutboundApprovals(projectId, approvals);
    await this.store.appendAuditLog(projectId, { at: new Date().toISOString(), kind: 'outbound_approval', stage: 'publish', status: 'approved', detail: { mode: 'formal-export', content_hash: hash } });
  }

  /** 导出三格式（PPTX/HTML/PDF）；内用草稿无需检查/批准，外发需批准且未失效 */
  async exportPublish(
    projectId: string,
    input: { formats: Array<'pptx' | 'html' | 'pdf'>; level: 'internal' | 'external' },
  ): Promise<{ exports: Array<{ format: string; export_id: string }>; revoked?: boolean }> {
    const work = await this.readWork(projectId);
    if (!work.framework || !work.framework_confirmed) throw Object.assign(new Error('框架未确认：不可发布'), { statusCode: 422 });
    if (Object.values(work.page_states ?? {}).some((s) => s !== 'done')) {
      throw Object.assign(new Error('存在未就绪页面：先完成或重试失败页'), { statusCode: 422 });
    }
    if (input.level === 'external') {
      const ap = await this.approvalState(projectId);
      if (!ap.approved_at) throw Object.assign(new Error('外发未批准'), { statusCode: 422 });
      if (ap.revoked) throw Object.assign(new Error(`外发批准已失效：${ap.reason}`), { statusCode: 422 });
    }
    const project = await this.store.getProject(projectId);
    if (!project) throw Object.assign(new Error('项目不存在'), { statusCode: 404 });
    const spec = this.pagesToReportSpec(project, work.framework, work.pages ?? {});
    const exports: Array<{ format: string; export_id: string }> = [];
    for (const fmt of input.formats) {
      const artifact = await this.renderExport(spec, fmt);
      const rec = await this.store.saveExport(projectId, {
        revision_id: spec.revision_id,
        format: fmt,
        artifact,
        checks: { privacy: await this.privacyCheck(projectId) },
        is_draft: input.level === 'internal',
        export_scope: input.level,
      });
      exports.push({ format: fmt, export_id: rec.export_id });
      await this.store.appendAuditLog(projectId, { at: new Date().toISOString(), kind: 'export', stage: 'publish', status: 'done', detail: { format: fmt, level: input.level } });
    }
    return { exports };
  }

  /** 单一格式渲染（PPTX/HTML/PDF） */
  private async renderExport(spec: import('../schema/report-spec.js').ReportSpec, fmt: 'pptx' | 'html' | 'pdf'): Promise<Buffer> {
    if (fmt === 'pptx') return (await import('../render/pptx.js')).renderReportPptx(spec);
    if (fmt === 'html') return Buffer.from((await import('../render/deck-html.js')).renderDeckHtml(spec), 'utf-8');
    if (fmt === 'pdf') return (await import('../render/deck-pdf.js')).renderDeckPdf(spec);
    throw new Error(`不支持的导出格式：${fmt}`);
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
    const approval_state = await this.approvalState(projectId);
    return {
      project,
      sources,
      exports,
      capabilities,
      steps: PPT_STEPS.map((key) => ({ key, unlocked: unlocked[key] })),
      understanding: work.understanding ?? {},
      framework: work.framework ?? null,
      framework_confirmed: work.framework_confirmed === true,
      pages: work.pages ?? {},
      page_states: work.page_states ?? {},
      approval_state,
      generation: work.generation ?? null,
    };
  }
}

import { createHash, randomUUID } from 'node:crypto';
import type { WorkspaceStore } from '../storage/workspace.js';
import type { BrandConfig } from '../schema/brand.js';
import type { Claim, ReportBrief, ReportSpec } from '../schema/report-spec.js';
import type { SourceConflict, TableAsset, EvidenceRef } from '../schema/assets.js';
import { EditorialStateSchema, type EditorialDecision, type EditorialState, type EditorialStatus, type EvidenceRequest, type FindingCard, type G1Approval, type Placement } from '../schema/editorial.js';
import type { PagePlanItem, OutlineDraft } from '../model/gateway.js';
import { createDeterministicGateway } from '../model/gateway.js';
import { recommendPlacements } from '../model/editorial-recommend.js';
import type { PlacementRecommendation } from '../schema/editorial.js';
import { PrivacyGate } from '../model/privacy-gate.js';
import { assembleReportSpec, type AssembleContext } from '../compose/assemble.js';
import { pagesImpactedBySource } from '../compose/impact.js';
import { diffSpecs, type SpecDiff } from '../compose/diff.js';
import { type EditOp } from '../compose/edit.js';
import { evaluateProposal, type ProposalOutcome } from '../compose/proposal.js';
import { runChecks, type CheckReport } from '../checks/engine.js';
import { runEditorialChecks, affectedPagesForUpdates, type PendingUpdateLike } from '../checks/editorial.js';
import { detectConflicts } from '../ingest/conflicts.js';
import { renderReportHtml } from '../render/html.js';

/**
 * 工作台服务：把存储里的材料派生资产重新聚合为可用状态。
 * 会话态（大纲/当前 spec）落盘在项目 work/ 下，重启可恢复；
 * 一切内容都可从材料重建（确定性模式）。
 */

interface DerivedAssets {
  claims: Claim[];
  evidence: EvidenceRef[];
  tables: TableAsset[];
  notes: string[];
  confirmations: { field: string; question: string }[];
  /** M4 bundle 派生扩展：指标/发现原文（含限制与反证），普通材料为空 */
  metrics: Array<Record<string, any>>;
  findings: Array<Record<string, any>>;
}

interface WorkState {
  outline?: OutlineDraft;
  brief?: ReportBrief;
  spec?: ReportSpec;
}

/** 发现卡片（F02）：组合视图，不另建事实对象；类型定义在 schema/editorial.ts */

export class WorkbenchService {
  constructor(private readonly store: WorkspaceStore) {}

  private async loadDerived(projectId: string): Promise<{ all: DerivedAssets; perSource: Record<string, DerivedAssets> }> {
    const sources = await this.store.listSourceAssets(projectId);
    const empty = (): DerivedAssets => ({ claims: [], evidence: [], tables: [], notes: [], confirmations: [], metrics: [], findings: [] });
    const all: DerivedAssets = empty();
    const perSource: Record<string, DerivedAssets> = {};
    for (const s of sources) {
      if (s.parse_status !== 'parsed' && s.kind !== 'image') continue;
      let derived: DerivedAssets = empty();
      try {
        const raw = (await this.store.readDerivedAssets(projectId, s.source_id)) as Record<string, any> | null;
        if (!raw) throw new Error('no derived');
        derived = {
          claims: raw.claims ?? [],
          evidence: raw.evidence ?? [],
          tables: raw.tables ?? [],
          notes: raw.notes ?? [],
          confirmations: raw.confirmations ?? [],
          metrics: raw.metrics ?? [],
          findings: raw.findings ?? [],
        };
      } catch {
        if (s.kind === 'image') derived.notes.push(`${s.filename}：图片材料（无底层数据）`);
      }
      perSource[s.source_id] = derived;
      all.claims.push(...derived.claims);
      all.evidence.push(...derived.evidence);
      all.tables.push(...derived.tables);
      all.notes.push(...derived.notes);
      all.confirmations.push(...derived.confirmations);
      all.metrics.push(...derived.metrics);
      all.findings.push(...derived.findings);
    }
    return { all, perSource };
  }

  // ---- M4 编审层：发现卡片 + 编排决定（F02/F03）----

  private async readEditorialState(projectId: string) {
    const raw = await this.store.readEditorial(projectId);
    return EditorialStateSchema.parse(raw ?? {});
  }

  private async writeEditorialState(projectId: string, state: EditorialState): Promise<void> {
    await this.store.writeEditorial(projectId, state);
  }

  /** 发现卡片：Claim/Metric/Evidence 组合视图 + 本次编排位置（placement 按报告隔离，G5） */
  async findings(projectId: string, reportId?: string): Promise<FindingCard[]> {
    const rid = reportId ?? `report_${projectId}`;
    const { perSource } = await this.loadDerived(projectId);
    const state = await this.readEditorialState(projectId);
    const decisionByLogical = new Map(
      (state.decisions?.[rid] ?? []).map((d) => [d.logical_key, d] as const),
    );

    const cards: FindingCard[] = [];
    for (const [sourceId, derived] of Object.entries(perSource)) {
      const findingsVerbatim = new Map(
        derived.findings.map((f) => [String(f['finding_id']), f] as const),
      );
      for (const claim of derived.claims) {
        const logicalKey = claim.logical_key ?? claim.claim_id;
        const findingId = logicalKey.split('::').at(-1)!;
        const verbatim = findingsVerbatim.get(findingId);
        const metricRefs = new Set(claim.metric_refs ?? []);
        const metrics = derived.metrics
          .filter((m) => {
            const mk = String(m['logical_key'] ?? '');
            return metricRefs.has(mk.split('::').at(-1) ?? mk);
          })
          .map((m) => ({
            metric_id: String(m['metric_id']),
            logical_key: m['logical_key'] ? String(m['logical_key']) : undefined,
            value: Number(m['value']),
            unit: String(m['unit']),
            period: m['period'] ? String(m['period']) : undefined,
            scope: m['scope'] ? String(m['scope']) : undefined,
            formula: m['formula'] ? String(m['formula']) : undefined,
          }));
        const evidence = (claim.evidence_refs ?? [])
          .map((id) => derived.evidence.find((e) => e.evidence_id === id))
          .filter((e): e is EvidenceRef => !!e)
          .map((e) => ({ evidence_id: e.evidence_id, locator: e.locator, excerpt: e.excerpt }));
        const decision = decisionByLogical.get(logicalKey);
        cards.push({
          logical_key: logicalKey,
          claim_id: claim.claim_id,
          source_id: sourceId,
          kind: claim.kind,
          text: claim.text,
          verification_state: claim.verification_state,
          uncertainty: claim.uncertainty,
          metrics,
          evidence,
          limitations: (verbatim?.['limitations'] as string[] | undefined) ?? [],
          counter_evidence: (verbatim?.['counter_evidence'] as string[] | undefined) ?? [],
          placement: decision?.placement ?? 'candidate',
          decision: decision ? { reason: decision.reason, operator: decision.operator, decided_at: decision.decided_at } : undefined,
        });
      }
    }
    return cards;
  }

  /** 取舍推荐（F03）：确定性规则，产出决定草案（不落盘）；人工决定粘性 */
  async recommend(projectId: string, reportId?: string): Promise<PlacementRecommendation[]> {
    const rid = reportId ?? `report_${projectId}`;
    const state = await this.readEditorialState(projectId);
    const brief = (state.brief as ReportBrief | undefined) ?? (await this.readWork(projectId)).brief;
    const findings = await this.findings(projectId, rid);
    return recommendPlacements(brief, findings, state.decisions?.[rid] ?? []);
  }

  /** 保存任务书草稿（F01）：编审状态与工作区双写，重启可恢复（T21） */
  async saveBrief(projectId: string, brief: ReportBrief): Promise<void> {
    const state = await this.readEditorialState(projectId);
    await this.writeEditorialState(projectId, { ...state, brief });
    await this.advanceStatus(projectId, 'brief_draft');
    const work = await this.readWork(projectId);
    await this.writeWork(projectId, { ...work, brief });
  }

  /** 编审状态视图（状态机 + brief 草稿 + 当前报告决定 + G1/G2 记录 + 待复核更新） */
  async editorial(projectId: string, reportId?: string): Promise<{
    status: EditorialStatus;
    brief?: ReportBrief;
    decisions: EditorialDecision[];
    approval?: G1Approval;
    g2?: unknown;
    pending_review: { updates: unknown[]; affected_pages: string[]; repropose: string[] };
  }> {
    const rid = reportId ?? `report_${projectId}`;
    const state = await this.readEditorialState(projectId);
    const updates = (await this.store.readPendingUpdates(projectId)) as PendingUpdateLike[];
    const spec = await this.getSpec(projectId);
    const affectedPages = affectedPagesForUpdates(spec, updates);

    // 复核重提（§7.3 后半）：被排除的发现若其依据的发现出现新版本 → 建议人工复核，不静默恢复
    const touchedKeys = new Set(updates.flatMap((u) => [...(u.changed ?? []), ...(u.removed ?? [])]));
    const decidedKeys = new Map((state.decisions?.[rid] ?? []).map((d) => [d.logical_key, d.placement] as const));
    const repropose = [...touchedKeys].filter((k) => decidedKeys.get(k) === 'excluded');

    return {
      status: state.status ?? 'organizing',
      brief: (state.brief as ReportBrief | undefined) ?? undefined,
      decisions: state.decisions?.[rid] ?? [],
      approval: state.approval,
      g2: state.g2,
      pending_review: { updates, affected_pages: affectedPages, repropose },
    };
  }

  /** 待复核解除（§7.7：用户复核后放行；不自动改写任何内容）——按逻辑键或受影响页匹配 */
  async resolvePendingUpdates(projectId: string, input: { logical_keys?: string[]; affected_pages?: string[] }): Promise<void> {
    const updates = (await this.store.readPendingUpdates(projectId)) as PendingUpdateLike[];
    const keys = new Set(input.logical_keys ?? []);
    const pages = new Set(input.affected_pages ?? []);
    const kept = updates.filter((u) => {
      const updateKeys = [...(u.changed ?? []), ...(u.added ?? []), ...(u.removed ?? [])];
      const keyHit = updateKeys.some((k) => keys.has(k));
      const pageHit = (u.affected_pages ?? []).some((p) => pages.has(p));
      return !keyHit && !pageHit; // 命中任一即解除
    });
    await this.store.writePendingUpdates(projectId, kept);
  }

  /** 状态机前进（G9：service 层强制；仅沿链前进，published 后的实质修改走派生回 draft_editing） */
  private async advanceStatus(projectId: string, target: EditorialStatus): Promise<void> {
    const state = await this.readEditorialState(projectId);
    const order: EditorialStatus[] = ['organizing', 'brief_draft', 'blueprint_review', 'g1_approved', 'draft_editing', 'published'];
    const current = state.status ?? 'organizing';
    if (order.indexOf(target) <= order.indexOf(current)) return; // 不回退
    await this.writeEditorialState(projectId, { ...state, status: target });
  }

  /** G1 人工编审（§8.1）：冻结当时任务书/蓝图/取舍/来源快照，绑定批准人与时间 */
  async approveG1(projectId: string, input: { approver: string; scope?: string }): Promise<{ approval: G1Approval; warnings: string[] }> {
    const work = await this.readWork(projectId);
    if (!work.outline || !work.brief) {
      throw Object.assign(new Error('G1 需要先完成任务书与逐页蓝图（先生成大纲）'), { statusCode: 400 });
    }
    const state = await this.readEditorialState(projectId);
    const decisions = state.decisions?.[`report_${projectId}`] ?? [];
    const sources = await this.store.listSourceAssets(projectId);

    // G5 一致性预警：大纲页引用了已被排除（excluded）的发现
    const { all } = await this.loadDerived(projectId);
    const place = new Map(decisions.map((d) => [d.logical_key, d.placement] as const));
    const warnings: string[] = [];
    for (const page of work.outline.pages) {
      for (const id of page.claim_refs) {
        const claim = all.claims.find((c) => c.claim_id === id);
        const p = claim ? place.get(claim.logical_key ?? claim.claim_id) : undefined;
        if (p === 'excluded') warnings.push(`第 ${page.page_id} 页引用了已排除的发现（${claim!.logical_key ?? id}），组装时将被投影移除，建议更新大纲`);
      }
    }

    const approval: G1Approval = {
      approval_id: `g1_${randomUUID().slice(0, 8)}`,
      approver: input.approver,
      brief_hash: createHash('sha256').update(JSON.stringify(work.brief)).digest('hex'),
      blueprint_pages: work.outline.pages,
      decisions_snapshot: decisions,
      source_snapshot: sources.map((s) => ({ source_id: s.source_id, version: s.version, logical_key: s.logical_key })),
      scope: input.scope,
      approved_at: new Date().toISOString(),
      revision_ids: [],
    };
    await this.writeEditorialState(projectId, { ...state, status: 'g1_approved', approval });
    return { approval, warnings };
  }

  /** 记录编排决定（合并持久化；excluded 粘性由"决定存在且不被覆盖"保证，T06） */
  async saveDecisions(
    projectId: string,
    input: { report_id?: string; decisions: Array<{ logical_key: string; placement: Placement; reason?: string; operator?: string }> },
  ): Promise<EditorialDecision[]> {
    const rid = input.report_id ?? `report_${projectId}`;
    const state = await this.readEditorialState(projectId);
    const decisions = { ...(state.decisions ?? {}) };
    const existing = [...(decisions[rid] ?? [])];
    for (const d of input.decisions) {
      const prev = existing.findIndex((x) => x.logical_key === d.logical_key);
      const next: EditorialDecision = {
        decision_id: prev >= 0 ? existing[prev]!.decision_id : `dec_${randomUUID().slice(0, 8)}`,
        report_id: rid,
        logical_key: d.logical_key,
        placement: d.placement,
        reason: d.reason,
        operator: d.operator ?? 'user',
        decided_at: new Date().toISOString(),
      };
      if (prev >= 0) existing[prev] = next;
      else existing.push(next);
    }
    decisions[rid] = existing;
    await this.writeEditorialState(projectId, { ...state, decisions });
    return existing;
  }

  async getConflicts(projectId: string): Promise<SourceConflict[]> {
    const { all } = await this.loadDerived(projectId);
    return detectConflicts(all.tables);
  }

  /** 合并用户解决记录后的冲突（用于检查、导出与 UI 展示；大纲仍用原始冲突提问） */
  async getResolvedConflicts(projectId: string): Promise<SourceConflict[]> {
    const conflicts = await this.getConflicts(projectId);
    const resolutions = await this.store.readConflictResolutions(projectId);
    return conflicts.map((c) => {
      const r = resolutions[c.conflict_id];
      if (r && (r.resolution === 'source_a' || r.resolution === 'source_b' || r.resolution === 'manual_value')) {
        return { ...c, resolution: r.resolution };
      }
      return c;
    });
  }

  /** 应用品牌：只改 spec.theme（视觉 token），内容字段零变化（换品牌不重生成内容） */
  async applyBrand(projectId: string, brand: BrandConfig): Promise<ReportSpec> {
    const work = await this.readWork(projectId);
    if (!work.spec) throw Object.assign(new Error('尚未组装报告'), { statusCode: 400 });
    const next = { ...work.spec, theme: { brand } };
    await this.store.updateProject(projectId, { brand });
    await this.store.saveRevision(projectId, next, '品牌更新（仅视觉）');
    await this.writeWork(projectId, { ...work, spec: next });
    return next;
  }

  /** 版本比较：两个修订的结构化差异；数字或绑定变化时重触发检查（§5.3 后半句） */
  async diff(projectId: string, revA: string, revB: string): Promise<{ diff: SpecDiff; recheck?: CheckReport }> {
    const a = await this.store.getRevision(projectId, revA);
    const b = await this.store.getRevision(projectId, revB);
    if (!a || !b) throw Object.assign(new Error('修订不存在'), { statusCode: 404 });
    const diff = diffSpecs(a.spec, b.spec);
    if (diff.metrics_changed.length > 0 || diff.claims_changed.length > 0) {
      const recheck = runChecks(b.spec, { conflicts: await this.getResolvedConflicts(projectId) });
      return { diff, recheck };
    }
    return { diff };
  }

  /** 来源替换影响面（§13.2）：每个来源影响的页面 */
  async impactMap(projectId: string): Promise<Record<string, string[]>> {
    const spec = await this.getSpec(projectId);
    const sources = await this.store.listSourceAssets(projectId);
    if (!spec) return {};
    const impact: Record<string, string[]> = {};
    for (const s of sources) {
      impact[s.source_id] = pagesImpactedBySource(spec, s.source_id);
    }
    return impact;
  }

  private async readWork(projectId: string): Promise<WorkState> {
    return ((await this.store.readWorkState(projectId)) as WorkState | null) ?? {};
  }

  private async writeWork(projectId: string, work: WorkState): Promise<void> {
    await this.store.writeWorkState(projectId, work);
  }

  /** 确定性大纲（模型经 PrivacyGate 包装：local_only 下也只有本地确定性通道可用） */
  async composeOutline(projectId: string, brief: ReportBrief): Promise<OutlineDraft> {
    const { all } = await this.loadDerived(projectId);
    const conflicts = await this.getConflicts(projectId);
    const project = await this.store.getProject(projectId);
    const gateway = new PrivacyGate(createDeterministicGateway(), {
      policy: () => project?.privacy_policy ?? 'local_only',
    });
    const draft = await gateway.composeOutline({
      brief, claims: all.claims, tables: all.tables, evidence: all.evidence,
      conflicts, notes: all.notes, confirmations: all.confirmations,
    });
    const work = await this.readWork(projectId);
    await this.writeWork(projectId, { ...work, outline: draft, brief });
    await this.store.updateProject(projectId, { stage: 'outline' });
    await this.advanceStatus(projectId, 'blueprint_review');
    return draft;
  }

  /** 确认大纲（可编辑页计划）→ 组装 spec；有编排决定时按决定投影（G5：决定层为源，spec 为投影） */
  async assemble(projectId: string, pages?: PagePlanItem[]): Promise<ReportSpec> {
    const work = await this.readWork(projectId);
    if (!work.outline || !work.brief) throw new Error('尚未生成大纲，请先设置汇报目标并生成大纲');
    let pagePlans = pages ?? work.outline.pages;
    const { all } = await this.loadDerived(projectId);
    const sources = await this.store.listSourceAssets(projectId);

    // 编排投影（§7.2）：一旦存在编排决定，报告即决定驱动——
    // excluded/deferred 不进报告；候选（未决定）不进正文；无决定 = 旧行为（全部资产可用）
    let claims = all.claims;
    const state = await this.readEditorialState(projectId);
    const decisions = state.decisions?.[`report_${projectId}`] ?? [];
    if (decisions.length > 0) {
      const place = new Map(decisions.map((d) => [d.logical_key, d.placement] as const));
      const placeOf = (c: Claim) => place.get(c.logical_key ?? c.claim_id);
      claims = all.claims.filter((c) => {
        const p = placeOf(c);
        return p === 'body' || p === 'appendix' || p === 'speaker_notes';
      });
      const byId = new Map(claims.map((c) => [c.claim_id, c] as const));
      pagePlans = pagePlans.map((p) => ({
        ...p,
        claim_refs: p.claim_refs.filter((id) => {
          const c = byId.get(id);
          if (!c) return false; // 被排除的对象不进页面
          const placement = placeOf(c);
          return p.type === 'evidence_appendix' ? placement === 'appendix' || placement === 'body' : placement === 'body';
        }),
      }));
    }

    const ctx: AssembleContext = {
      brief: work.brief,
      claims,
      tables: all.tables,
      evidence: all.evidence,
      conflicts: await this.getConflicts(projectId),
      notes: all.notes,
      pagePlans,
      sourceSnapshot: sources.map((s) => ({ source_id: s.source_id, version: s.version, is_demo: s.has_data !== false })),
    };
    const spec = assembleReportSpec({ report_id: `report_${projectId}`, ctx });
    // 品牌配置注入（项目级 → spec 冻结快照）
    const project = await this.store.getProject(projectId);
    if (project?.brand) spec.theme = { brand: project.brand };
    await this.writeWork(projectId, { ...work, outline: { ...work.outline, pages: pagePlans }, spec });
    await this.store.updateProject(projectId, { stage: 'draft' });
    // G1 后首次生成 = 初稿编辑；G1 前组装只是草拟预览，不推进状态（T07）
    if ((state.status ?? 'organizing') === 'g1_approved') await this.advanceStatus(projectId, 'draft_editing');
    // 漂移基线（G6）：G1 批准后的首个组装 spec 作为批准范围基准；重新 G1 后重建
    const stateAfter = await this.readEditorialState(projectId);
    if (stateAfter.approval && !stateAfter.approval.baseline_spec) {
      await this.writeEditorialState(projectId, { ...stateAfter, approval: { ...stateAfter.approval, baseline_spec: spec } });
    }
    return spec;
  }

  /** 变更控制器入口（§12.2）：版本→范围→锁定→原子应用→审计；失败不产生半状态 */
  async propose(projectId: string, input: { op: EditOp; expected_revision: string }): Promise<ProposalOutcome> {
    const work = await this.readWork(projectId);
    if (!work.spec) throw new Error('尚未组装报告');
    const { all } = await this.loadDerived(projectId);
    const ctx: AssembleContext = {
      brief: work.brief!,
      claims: all.claims,
      tables: all.tables,
      evidence: all.evidence,
      conflicts: await this.getConflicts(projectId),
      notes: all.notes,
      pagePlans: work.outline?.pages ?? [],
      sourceSnapshot: [],
    };
    const state = await this.readEditorialState(projectId);
    const outcome = evaluateProposal(work.spec, { ...input, report_id: `report_${projectId}` }, ctx, state.status);
    await this.store.appendProposal(projectId, outcome.proposal);

    if (outcome.ok && outcome.spec) {
      const note = `提案 ${outcome.proposal.proposal_id}：${input.op.kind}${'page_id' in input.op ? ` ${input.op.page_id}` : ''}`;
      const meta = await this.store.saveRevision(projectId, outcome.spec, note);
      const next = { ...outcome.spec, revision_id: meta.revision_id }; // 版本令牌回写（T15 的协调基准）
      await this.writeWork(projectId, { ...work, spec: next });
      // §8.3：published 后的修改=派生新修订，回到 draft_editing（不把已发布版本退回可变草稿）
      if (state.status === 'published') await this.writeEditorialState(projectId, { ...state, status: 'draft_editing' });
      return { ...outcome, spec: next };
    }
    return outcome;
  }

  // ---- M4 补证管理（F07/§11.2）----

  /** 草拟补证请求；同 request_id 重复提交幂等返回既有请求（T17） */
  async createEvidenceRequest(
    projectId: string,
    input: { request_id?: string; question: string; gap?: string; affected_objects?: string[]; required_evidence?: string },
  ): Promise<EvidenceRequest> {
    const requests = (await this.store.readEvidenceRequests(projectId)) as EvidenceRequest[];
    if (input.request_id) {
      const existing = requests.find((r) => r.request_id === input.request_id);
      if (existing) return existing; // 幂等：不重复创建
    }
    const now = new Date().toISOString();
    const request: EvidenceRequest = {
      request_id: input.request_id ?? `ereq_${randomUUID().slice(0, 8)}`,
      report_id: `report_${projectId}`,
      affected_objects: input.affected_objects ?? [],
      question: input.question,
      gap: input.gap,
      required_evidence: input.required_evidence,
      result_refs: [],
      state: 'draft',
      created_at: now,
      updated_at: now,
    };
    requests.push(request);
    await this.store.writeEvidenceRequests(projectId, requests);
    return request;
  }

  async listEvidenceRequests(projectId: string): Promise<EvidenceRequest[]> {
    return (await this.store.readEvidenceRequests(projectId)) as EvidenceRequest[];
  }

  /** 批准=记录批准人与时间；不授权任何代码执行/外发（上游执行仍走其原有门禁，T16） */
  async approveEvidenceRequest(projectId: string, requestId: string, approver: string): Promise<EvidenceRequest> {
    const requests = (await this.store.readEvidenceRequests(projectId)) as EvidenceRequest[];
    const request = requests.find((r) => r.request_id === requestId);
    if (!request) throw Object.assign(new Error(`补证请求不存在：${requestId}`), { statusCode: 404 });
    request.state = 'approved';
    request.user_approval = { approver, approved_at: new Date().toISOString() };
    request.updated_at = new Date().toISOString();
    await this.store.writeEvidenceRequests(projectId, requests);
    return request;
  }

  /** 无上游连接时的文件导出（§5.4：请求保留本地，可导出交由其他工具处理） */
  async exportEvidenceRequest(projectId: string, requestId: string): Promise<Record<string, unknown>> {
    const requests = (await this.store.readEvidenceRequests(projectId)) as EvidenceRequest[];
    const request = requests.find((r) => r.request_id === requestId);
    if (!request) throw Object.assign(new Error(`补证请求不存在：${requestId}`), { statusCode: 404 });
    if (request.state === 'draft' || request.state === 'approved') {
      request.state = 'exported';
      request.updated_at = new Date().toISOString();
      await this.store.writeEvidenceRequests(projectId, requests);
    }
    return {
      schema_version: '1.0',
      request_id: request.request_id,
      report_id: request.report_id,
      question: request.question,
      gap: request.gap,
      affected_objects: request.affected_objects,
      required_evidence: request.required_evidence,
      user_approval: request.user_approval,
    };
  }

  /** 旧编辑通道 = 控制器薄壳（expected=当前修订，G1 前自动应用留审计，G2 决议） */
  async edit(projectId: string, op: EditOp): Promise<ReportSpec> {
    const spec = await this.getSpec(projectId);
    if (!spec) throw new Error('尚未组装报告');
    const outcome = await this.propose(projectId, { op, expected_revision: spec.revision_id });
    if (!outcome.ok || !outcome.spec) throw new Error(outcome.reason ?? '编辑被拒绝');
    return outcome.spec;
  }

  async proposals(projectId: string): Promise<unknown[]> {
    return this.store.readProposals(projectId);
  }

  /** 导出回执（§11.3）：修订/文件/哈希/检查/来源映射/交付状态；幂等重取 */
  async exportReceipt(projectId: string, exportId: string): Promise<Record<string, unknown>> {
    const record = await this.store.getExport(projectId, exportId);
    if (!record) throw Object.assign(new Error(`导出记录不存在：${exportId}`), { statusCode: 404 });
    const revision = await this.store.getRevision(projectId, record.revision_id);
    return {
      schema_version: '1.0',
      report_id: revision?.spec.report_id ?? `report_${projectId}`,
      revision_id: record.revision_id,
      export_id: record.export_id,
      format: record.format,
      artifact_path: record.artifact_path,
      artifact_hash: record.artifact_hash,
      checks: record.checks,
      is_draft: record.is_draft,
      delivery_status: record.delivery_status ?? (record.is_draft ? 'draft' : 'formal'),
      source_snapshot: revision?.spec.source_snapshot ?? [],
      created_at: record.created_at,
    };
  }

  /** 解决冲突并记录采用的口径值（§10.2：展示冲突并由用户确认处理，留痕） */
  async resolveConflict(
    projectId: string,
    resolutions: Record<string, string | { resolution: 'manual_value'; value: number }>,
  ): Promise<void> {
    const conflicts = await this.getConflicts(projectId);
    const byId = new Map(conflicts.flatMap((c) => c.values.map((v) => [c.conflict_id, c] as const)).map(([id, c]) => [id, c]));
    // 逐次解决不得覆盖之前的决定：先读历史记录再合并
    const record = await this.store.readConflictResolutions(projectId);
    for (const [id, r] of Object.entries(resolutions)) {
      const conflict = byId.get(id);
      if (!conflict) throw Object.assign(new Error(`冲突不存在：${id}`), { statusCode: 400 });
      if (r === 'source_a' || r === 'source_b') {
        const picked = conflict.values[r === 'source_a' ? 0 : 1];
        if (!picked) throw Object.assign(new Error(`冲突 ${id} 无 ${r} 值`), { statusCode: 400 });
        record[id] = { resolution: r, adopted_value: Number(picked.value) };
      } else if (typeof r === 'object' && r.resolution === 'manual_value') {
        if (typeof r.value !== 'number' || !Number.isFinite(r.value)) {
          throw Object.assign(new Error('manual_value 必须提供数值'), { statusCode: 400 });
        }
        record[id] = { resolution: 'manual_value', adopted_value: r.value };
      } else {
        throw Object.assign(new Error(`非法的解决方式：${JSON.stringify(r)}`), { statusCode: 400 });
      }
    }
    await this.store.writeConflictResolutions(projectId, record as Record<string, { resolution: string; adopted_value?: number }>);
  }

  async getSpec(projectId: string): Promise<ReportSpec | null> {
    return (await this.readWork(projectId)).spec ?? null;
  }

  async checks(projectId: string, exportScope?: 'internal' | 'external'): Promise<CheckReport> {
    const spec = await this.getSpec(projectId);
    if (!spec) throw new Error('尚未组装报告');
    const report = runChecks(spec, { conflicts: await this.getResolvedConflicts(projectId), exportScope });
    const state = await this.readEditorialState(projectId);
    const decisions = state.decisions?.[`report_${projectId}`] ?? [];
    const editorialIssues = runEditorialChecks(spec, {
      brief: state.brief as ReportBrief | undefined,
      decisions,
      approval: state.approval,
    });
    if (editorialIssues.length > 0) {
      return {
        issues: [...report.issues, ...editorialIssues],
        blockers: report.blockers + editorialIssues.filter((i) => i.severity === 'blocker').length,
        warnings: report.warnings + editorialIssues.filter((i) => i.severity === 'warning').length,
      };
    }
    return report;
  }

  async previewHtml(projectId: string): Promise<string> {
    const spec = await this.getSpec(projectId);
    if (!spec) throw new Error('尚未组装报告');
    // document 管线（研究报告）走 A4 文档流预览
    let html: string;
    if (spec.brief.deliverable_type === 'research_report') {
      const { renderDocumentHtml } = await import('../render/document-html.js');
      html = renderDocumentHtml(spec);
    } else {
      html = renderReportHtml(spec);
    }
    // 预览 iframe 比页面基准宽(deck 1280 / A4 文档流)窄:按视口宽整体缩放,只在预览端注入,不影响导出产物
    const fit = `<script>(function(){var d=document,b=d.body;function fit(){var z=b.style.zoom?parseFloat(b.style.zoom):1;var base=Math.max(b.scrollWidth/z,210);b.style.zoom=Math.min(1,d.documentElement.clientWidth/base);}fit();addEventListener('resize',fit);})();</script>`;
    return html.replace('</body>', `${fit}</body>`);
  }
}

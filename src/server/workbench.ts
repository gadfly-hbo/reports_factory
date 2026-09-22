import type { WorkspaceStore } from '../storage/workspace.js';
import type { Claim, ReportBrief, ReportSpec } from '../schema/report-spec.js';
import type { SourceConflict, TableAsset, EvidenceRef } from '../schema/assets.js';
import type { PagePlanItem, OutlineDraft } from '../model/gateway.js';
import { createDeterministicGateway } from '../model/gateway.js';
import { PrivacyGate } from '../model/privacy-gate.js';
import { assembleReportSpec, type AssembleContext } from '../compose/assemble.js';
import { pagesImpactedBySource } from '../compose/impact.js';
import { applyEdit, type EditOp } from '../compose/edit.js';
import { runChecks, type CheckReport } from '../checks/engine.js';
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
}

interface WorkState {
  outline?: OutlineDraft;
  brief?: ReportBrief;
  spec?: ReportSpec;
}

export class WorkbenchService {
  constructor(private readonly store: WorkspaceStore) {}

  private async loadDerived(projectId: string): Promise<{ all: DerivedAssets; perSource: Record<string, DerivedAssets> }> {
    const sources = await this.store.listSourceAssets(projectId);
    const all: DerivedAssets = { claims: [], evidence: [], tables: [], notes: [], confirmations: [] };
    const perSource: Record<string, DerivedAssets> = {};
    for (const s of sources) {
      if (s.parse_status !== 'parsed' && s.kind !== 'image') continue;
      let derived: DerivedAssets = { claims: [], evidence: [], tables: [], notes: [], confirmations: [] };
      try {
        const raw = (await this.store.readDerivedAssets(projectId, s.source_id)) as Record<string, any> | null;
        if (!raw) throw new Error('no derived');
        derived = {
          claims: raw.claims ?? [],
          evidence: raw.evidence ?? [],
          tables: raw.tables ?? [],
          notes: raw.notes ?? [],
          confirmations: raw.confirmations ?? [],
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
    }
    return { all, perSource };
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
    return draft;
  }

  /** 确认大纲（可编辑页计划）→ 组装 spec */
  async assemble(projectId: string, pages?: PagePlanItem[]): Promise<ReportSpec> {
    const work = await this.readWork(projectId);
    if (!work.outline || !work.brief) throw new Error('尚未生成大纲，请先设置汇报目标并生成大纲');
    const pagePlans = pages ?? work.outline.pages;
    const { all } = await this.loadDerived(projectId);
    const sources = await this.store.listSourceAssets(projectId);
    const ctx: AssembleContext = {
      brief: work.brief,
      claims: all.claims,
      tables: all.tables,
      evidence: all.evidence,
      conflicts: await this.getConflicts(projectId),
      notes: all.notes,
      pagePlans,
      sourceSnapshot: sources.map((s) => ({ source_id: s.source_id, version: s.version, is_demo: s.has_data !== false })),
    };
    const spec = assembleReportSpec({ report_id: `report_${projectId}`, ctx });
    await this.writeWork(projectId, { ...work, outline: { ...work.outline, pages: pagePlans }, spec });
    await this.store.updateProject(projectId, { stage: 'draft' });
    return spec;
  }

  async edit(projectId: string, op: EditOp): Promise<ReportSpec> {
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
    const next = applyEdit(work.spec, op, ctx);
    // §10.2 用户修改行：每次实质修改产生新修订（parent 链），保留人工修改记录
    await this.store.saveRevision(projectId, next, `编辑：${op.kind}${'page_id' in op ? ` ${op.page_id}` : ''}`);
    await this.writeWork(projectId, { ...work, spec: next });
    return next;
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
    return runChecks(spec, { conflicts: await this.getResolvedConflicts(projectId), exportScope });
  }

  async previewHtml(projectId: string): Promise<string> {
    const spec = await this.getSpec(projectId);
    if (!spec) throw new Error('尚未组装报告');
    return renderReportHtml(spec);
  }
}

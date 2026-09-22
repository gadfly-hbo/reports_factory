import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { WorkspaceStore } from '../storage/workspace.js';
import type { Claim, ReportBrief, ReportSpec } from '../schema/report-spec.js';
import type { SourceConflict, TableAsset, EvidenceRef } from '../schema/assets.js';
import type { PagePlanItem, OutlineDraft } from '../model/gateway.js';
import { createDeterministicGateway } from '../model/gateway.js';
import { PrivacyGate } from '../model/privacy-gate.js';
import { assembleReportSpec, type AssembleContext } from '../compose/assemble.js';
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
        const raw = JSON.parse(
          await readFile(join(this.store.root, projectId, 'sources', `${s.source_id}.assets.json`), 'utf-8'),
        );
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
    let resolutions: Record<string, string> = {};
    try {
      resolutions = JSON.parse(
        await readFile(join(this.store.root, projectId, 'work', 'conflict-resolutions.json'), 'utf-8'),
      );
    } catch {
      // 无解决记录
    }
    return conflicts.map((c) => {
      const r = resolutions[c.conflict_id];
      if (r === 'source_a' || r === 'source_b' || r === 'manual_value') {
        return { ...c, resolution: r };
      }
      return c;
    });
  }

  private async readWork(projectId: string): Promise<WorkState> {
    try {
      return JSON.parse(await readFile(join(this.store.root, projectId, 'work', 'state.json'), 'utf-8'));
    } catch {
      return {};
    }
  }

  private async writeWork(projectId: string, work: WorkState): Promise<void> {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const dir = join(this.store.root, projectId, 'work');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'state.json'), JSON.stringify(work, null, 2));
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
    await this.writeWork(projectId, { ...work, spec: next });
    return next;
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

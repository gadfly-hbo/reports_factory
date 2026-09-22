import type { PagePlanItem } from '../model/gateway.js';
import type { Claim, Page, ReportBrief, ReportSpec, SourceRef } from '../schema/report-spec.js';
import type { EvidenceRef } from '../schema/assets.js';
import type { SourceConflict, TableAsset } from '../schema/assets.js';
import { ReportSpecSchema } from '../schema/report-spec.js';

/**
 * ReportSpec 组装（F06）：已确认页计划 + 资产 → 结构化报告。
 * 页与资产之间是稳定引用（claim_refs / table → chart 同源），
 * 组装是确定性的：同一输入永远同一输出。
 */

export interface AssembleContext {
  brief: ReportBrief;
  claims: Claim[];
  tables: TableAsset[];
  evidence: EvidenceRef[];
  conflicts: SourceConflict[];
  notes: string[];
  pagePlans: PagePlanItem[];
  sourceSnapshot: SourceRef[];
}

function bulletStatus(c: Claim): 'confirmed' | 'needs_review' | 'unverified' | 'pending' {
  switch (c.verification_state) {
    case 'arithmetic_checked':
      return 'confirmed';
    case 'bound_to_source':
      return 'needs_review'; // 绑定来源 ≠ 真实（proposal §10.1）
    case 'unverified':
      return 'unverified';
    default:
      return c.kind === 'recommendation' ? 'pending' : 'needs_review';
  }
}

function tableToPageTable(t: TableAsset): NonNullable<Page['table']> {
  return {
    columns: t.columns.map((c) => ({
      key: c.key,
      label: c.label,
      align: t.rows.some((r) => typeof r.cells[t.columns.indexOf(c)] === 'number')
        ? ('right' as const)
        : undefined,
    })),
    rows: t.rows.map((r) => ({ key: r.key, cells: r.cells.map((cell) => String(cell ?? '')) })),
    source_ref: t.source_id,
  };
}

function tableToChart(t: TableAsset): Page['chart'] {
  const numericIdx = t.columns
    .map((c, i) => ({ c, i }))
    .filter(({ i }) => t.rows.some((r) => typeof r.cells[i] === 'number'));
  if (numericIdx.length === 0) return undefined;
  const keyCol = t.columns[0];
  const primary = numericIdx[0]!;
  const secondary = numericIdx[1];
  const series = [
    {
      name: primary.c.label,
      data: t.rows.map((r) => ({ label: String(r.cells[0] ?? ''), value: Number(r.cells[primary.i]) })),
    },
    ...(secondary
      ? [{
          name: secondary.c.label,
          data: t.rows.map((r) => ({ label: String(r.cells[0] ?? ''), value: Number(r.cells[secondary.i]) })),
        }]
      : []),
  ];
  return {
    chart_id: `chart_${t.table_id}`,
    type: 'bar',
    title: `${primary.c.label} × ${keyCol?.label ?? ''}`,
    series,
    source_ref: t.source_id,
  };
}

function claimsToBullets(claims: Claim[], defaultLabel?: string): NonNullable<Page['bullets']> {
  return claims.map((c) => ({
    label: c.kind === 'fact_statement' ? '发现' : c.kind === 'inference' ? '限制' : c.kind === 'recommendation' ? (defaultLabel ?? '建议') : '说明',
    text: c.text,
    claim_ref: c.claim_id,
    status: bulletStatus(c),
  }));
}

export function assemblePage(plan: PagePlanItem, ctx: AssembleContext, pageNum: number): Page {
  const claims = (ids: string[]) => ctx.claims.filter((c) => ids.includes(c.claim_id));
  const tables = (ids: string[]) => ctx.tables.filter((t) => ids.includes(t.table_id));
  const n = String(pageNum).padStart(2, '0');
  const demoNote = ctx.sourceSnapshot.some((s) => s.is_demo) ? '演示数据，非真实经营结论' : undefined;
  const gapNote = plan.gap_notes.length > 0 ? plan.gap_notes.join('；') : undefined;

  const base: Page = {
    page_id: plan.page_id || `page_${n}`,
    type: plan.type,
    headline: plan.headline,
    claim_refs: plan.claim_refs,
    metric_refs: [],
    evidence_refs: [],
    locked: false,
  };

  switch (plan.type) {
    case 'cover':
      return { ...base, subtitle: ctx.brief.purpose, meta: { audience: ctx.brief.audience, version: '草稿' }, required_note: demoNote };
    case 'summary': {
      const cl = claims(plan.claim_refs);
      return { ...base, bullets: claimsToBullets(cl), required_note: gapNote ?? demoNote };
    }
    case 'metrics_overview': {
      const t = tables(plan.table_ids)[0];
      return { ...base, table: t ? tableToPageTable(t) : undefined, required_note: gapNote ?? demoNote };
    }
    case 'trend': {
      const t = tables(plan.table_ids)[0];
      const cl = claims(plan.claim_refs);
      return {
        ...base,
        body: cl[0]?.text,
        chart: t ? tableToChart(t) : undefined,
        layout_id: 'headline_chart_note',
        required_note: gapNote ?? demoNote,
      };
    }
    case 'issue_breakdown':
      return { ...base, bullets: claimsToBullets(claims(plan.claim_refs)), required_note: gapNote };
    case 'option_comparison':
      return { ...base, bullets: claimsToBullets(claims(plan.claim_refs), '方案'), required_note: gapNote };
    case 'action_items': {
      const cl = claims(plan.claim_refs);
      return {
        ...base,
        table: {
          columns: [
            { key: 'item', label: '事项' },
            { key: 'owner', label: '责任人' },
            { key: 'due', label: '时间' },
            { key: 'status', label: '状态' },
          ],
          rows: cl.map((c) => ({
            key: c.claim_id,
            cells: [c.text, '待定', '待确认', '待批准'], // 缺失项明确标待确认，不编造
          })),
        },
        required_note: gapNote,
      };
    }
    case 'evidence_appendix': {
      const notes = claims(plan.claim_refs);
      const bullets: NonNullable<Page['bullets']> = [
        ...claimsToBullets(notes).map((b) => ({ ...b, label: '口径' })),
        ...ctx.sourceSnapshot.map((s) => ({
          label: '来源',
          text: `${s.source_id}@${s.version}${s.is_demo ? '（演示）' : ''}`,
        })),
      ];
      if (ctx.conflicts.length > 0) {
        bullets.push({
          label: '冲突',
          text: ctx.conflicts.map((c) => `${c.row_key}「${c.column_label}」口径不一致`).join('；'),
          status: 'needs_review' as const,
        });
      }
      return { ...base, bullets, required_note: demoNote };
    }
  }
}

export function assembleReportSpec(input: { report_id: string; ctx: AssembleContext }): ReportSpec {
  const { ctx } = input;
  const pages = ctx.pagePlans.map((plan, i) => assemblePage(plan, ctx, i + 1));
  // 组装时按页计划顺序重排页号 ID，保持稳定
  const renumbered = pages.map((p, i) => ({ ...p, page_id: `page_${String(i + 1).padStart(2, '0')}` }));
  return ReportSpecSchema.parse({
    schema_version: '1.0',
    report_id: input.report_id,
    revision_id: 'rev_pending', // 由存储层落盘时分配
    brief: ctx.brief,
    source_snapshot: ctx.sourceSnapshot,
    metrics: [],
    claims: ctx.claims,
    pages: renumbered,
    export_policy: { freeze_revision: true, include_source_notes: true, external_share_allowed: false },
  });
}

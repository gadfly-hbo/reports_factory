import type { Claim, PageType, ReportBrief } from '../schema/report-spec.js';
import type { EvidenceRef, SourceConflict, TableAsset } from '../schema/assets.js';

/**
 * 模型适配层（G16）：大纲编排通过 ModelGateway 接口调用。
 * 默认实现为确定性模式——模板驱动 + 资产分类规则（G11），
 * 手动编辑永远保留；外部模型接入时经 PrivacyGate 包装。
 */

export interface PagePlanItem {
  page_id: string;
  type: PageType;
  /** 预填主旨，用户可在排版前修改 */
  headline: string;
  /** 结论页 / 资料说明页（proposal §5.2：用户可将页标为资料说明） */
  intent: 'conclusion' | 'evidence' | 'decision' | 'info';
  claim_refs: string[];
  table_ids: string[];
  /** 材料不足处的待补充提示（不编造） */
  gap_notes: string[];
  locked: boolean;
}

/** 待用户回答的问题（结构化：UI 按 kind 过滤而非子串猜测） */
export interface OpenQuestion {
  text: string;
  kind: 'conflict' | 'confirmation' | 'gap';
  ref?: string;
}

export interface OutlineDraft {
  pages: PagePlanItem[];
  /** 需要用户回答的口径/冲突/缺口问题 */
  open_questions: OpenQuestion[];
}

export interface OutlineContext {
  brief: ReportBrief;
  claims: Claim[];
  tables: TableAsset[];
  evidence: EvidenceRef[];
  conflicts: SourceConflict[];
  notes: string[];
  confirmations: { field: string; question: string }[];
}

export interface ModelGateway {
  id: string;
  /** 是否会把内容发送到本机之外（决定 PrivacyGate 行为） */
  external: boolean;
  composeOutline(ctx: OutlineContext, opts?: { approval?: string }): Promise<OutlineDraft>;
}

function page(
  n: number,
  type: PageType,
  headline: string,
  intent: PagePlanItem['intent'],
  claim_refs: string[] = [],
  table_ids: string[] = [],
  gap_notes: string[] = [],
): PagePlanItem {
  return {
    page_id: `page_${String(n).padStart(2, '0')}`,
    type,
    headline,
    intent,
    claim_refs,
    table_ids,
    gap_notes,
    locked: false,
  };
}

export function createDeterministicGateway(): ModelGateway {
  return {
    id: 'deterministic',
    external: false,
    async composeOutline(ctx: OutlineContext): Promise<OutlineDraft> {
      const facts = ctx.claims.filter((c) => c.kind === 'fact_statement');
      const inferences = ctx.claims.filter((c) => c.kind === 'inference');
      const recommendations = ctx.claims.filter((c) => c.kind === 'recommendation');
      const dataNotes = ctx.claims.filter((c) => c.kind === 'data_note');

      const firstTable = ctx.tables[0];
      const headline = (c: Claim | undefined, fallback = '待补充') =>
        c ? c.text.split(/[，。；;]/)[0]!.slice(0, 32) : fallback;

      const pages: PagePlanItem[] = [
        page(1, 'cover', `${ctx.brief.purpose}（${ctx.brief.audience}）`, 'info'),
        page(
          2,
          'summary',
          facts[0] ? headline(facts[0]) : '待补充：尚无已确认的主要发现',
          'conclusion',
          [...facts.slice(0, 2).map((c) => c.claim_id), ...inferences.slice(0, 1).map((c) => c.claim_id)],
          [],
          facts.length === 0 ? ['材料中未找到明确的结论标记（## 结论），请补充材料或手动填写'] : [],
        ),
        page(
          3,
          'metrics_overview',
          firstTable ? `关键指标（${firstTable.columns.filter((c) => c.unit).length} 个可量化列）` : '待补充：尚无汇总表格',
          'evidence',
          [],
          firstTable ? [firstTable.table_id] : [],
          !firstTable ? ['缺少汇总表（CSV）材料，无法生成指标总览'] : [],
        ),
        page(
          4,
          'trend',
          firstTable && firstTable.rows.length > 2 ? `${firstTable.columns[0]?.label ?? ''}维度趋势` : '待补充：尚无趋势数据',
          'evidence',
          [],
          firstTable && firstTable.rows.length > 2 ? [firstTable.table_id] : [],
          !firstTable ? ['缺少时间序列表格，无法生成趋势页'] : [],
        ),
        page(
          5,
          'issue_breakdown',
          inferences[0] ? `可能原因待验证：${headline(inferences[0])}` : '待补充：尚无推断类材料',
          'conclusion',
          inferences.map((c) => c.claim_id),
          [],
          inferences.length === 0 ? ['材料中未找到推断标记（## 推断）'] : [],
        ),
        page(
          6,
          'option_comparison',
          recommendations[0] ? `方案讨论：${headline(recommendations[0])}` : '待补充：尚无方案比较材料',
          'decision',
          recommendations.map((c) => c.claim_id),
          [],
          recommendations.length === 0
            ? ['材料中未找到建议标记（## 建议）；方案比较不补造投入产出与负责人']
            : [],
        ),
        page(
          7,
          'action_items',
          recommendations[0] ? `建议行动：${headline(recommendations[0])}` : '待补充：尚无行动建议',
          'decision',
          recommendations.map((c) => c.claim_id),
          [],
          recommendations.length === 0 ? ['待决事项待人工补充（责任人/时间不编造）'] : [],
        ),
        page(
          8,
          'evidence_appendix',
          '附录：口径、来源与说明',
          'info',
          dataNotes.map((c) => c.claim_id),
          ctx.tables.slice(1).map((t) => t.table_id),
          dataNotes.length === 0 && ctx.notes.length === 0
            ? ['尚无口径（## 口径）或来源说明材料，建议补充']
            : [],
        ),
      ];

      // 无法分类的材料 → 附录资料说明（G11）
      if (ctx.notes.length > 0) {
        pages[7]!.gap_notes.push(...ctx.notes.slice(0, 5));
      }

      const open_questions: OpenQuestion[] = [
        ...(ctx.claims.length === 0 && ctx.tables.length === 0
          ? [{ text: '当前没有任何可用材料——请先导入材料，或从空白大纲手动开始（不编造内容）', kind: 'gap' as const }]
          : []),
        ...ctx.confirmations.map((c) => ({ text: c.question, kind: 'confirmation' as const, ref: c.field })),
        ...ctx.conflicts.map((c) => ({
          text: `材料冲突：${c.row_key}「${c.column_label}」在不同来源中为 ${c.values
            .map((v) => `${v.value}（${v.source_id}）`)
            .join(' vs ')}，请确认采用哪个口径`,
          kind: 'conflict' as const,
          ref: c.conflict_id,
        })),
      ];

      return { pages, open_questions };
    },
  };
}

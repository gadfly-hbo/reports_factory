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

/** 研究报告 7 节文档主线（§4.1：问题→口径→方法→发现→证据→限制→建议），全部映射现有页型 */
function researchOutline(ctx: OutlineContext, page: typeof buildPage): OutlineDraft {
  const facts = ctx.claims.filter((c) => c.kind === 'fact_statement');
  const inferences = ctx.claims.filter((c) => c.kind === 'inference');
  const recommendations = ctx.claims.filter((c) => c.kind === 'recommendation');
  const dataNotes = ctx.claims.filter((c) => c.kind === 'data_note');
  const firstTable = ctx.tables[0];
  const emptyNote = (what: string) => [`材料中未找到${what}——该节留待补充，不编造`];

  // §4.1 主线：问题→口径→方法→发现（每发现一节）→证据→限制→建议；单条建议不构成方案比较
  const pages: PagePlanItem[] = [
    page(1, 'cover', `${ctx.brief.purpose}`, 'info'),
    // 问题与背景 = 沟通任务与问题陈述（来自汇报目标，非材料主张）；主要事实集中在"主要发现"各节，不重复绑定
    page(2, 'summary', '问题与背景', 'conclusion', [], [], ['本节为沟通任务与问题陈述（来自汇报目标）；主要事实见下方"主要发现"各节']),
    page(3, 'evidence_appendix', '口径与方法', 'evidence', dataNotes.map((c) => c.claim_id), [], dataNotes.length === 0 ? emptyNote('口径说明') : []),
  ];
  // 发现：每事实主张一节（M3-G2）+ 指标与趋势证据页
  facts.slice(0, 3).forEach((c, i) => {
    pages.push(page(pages.length + 1, 'summary', `主要发现：${c.text.split(/[，。；;]/)[0]!.slice(0, 28)}`, 'conclusion', [c.claim_id], [], []));
    void i;
  });
  pages.push(page(pages.length + 1, 'metrics_overview', '主要发现：关键指标', 'evidence', [], firstTable ? [firstTable.table_id] : [], firstTable ? [] : ['缺少汇总表格，本节留待补充']));
  pages.push(page(pages.length + 1, 'trend', '主要发现：趋势', 'evidence', [], firstTable && firstTable.rows.length > 2 ? [firstTable.table_id] : [], firstTable && firstTable.rows.length > 2 ? [] : ['缺少时间序列数据，本节留待补充']));
  pages.push(page(pages.length + 1, 'evidence_appendix', '证据附录', 'info', dataNotes.map((c) => c.claim_id), ctx.tables.slice(1).map((t) => t.table_id), []));
  pages.push(page(pages.length + 1, 'issue_breakdown', '限制与不确定性', 'conclusion', inferences.map((c) => c.claim_id), [], inferences.length === 0 ? emptyNote('推断/假设标记') : []));
  if (recommendations.length >= 2) {
    pages.push(page(pages.length + 1, 'option_comparison', '可选方案', 'decision', recommendations.map((c) => c.claim_id), [], []));
  }
  pages.push(page(pages.length + 1, 'action_items', '建议', 'decision', recommendations.map((c) => c.claim_id), [], recommendations.length === 0 ? emptyNote('建议标记') : []));
  return {
    pages,
    open_questions: [
      ...(ctx.claims.length === 0 && ctx.tables.length === 0
        ? [{ text: '当前没有任何可用材料——请先导入材料（不编造内容）', kind: 'gap' as const }]
        : []),
      ...ctx.confirmations.map((c) => ({ text: c.question, kind: 'confirmation' as const, ref: c.field })),
      ...ctx.conflicts.map((c) => ({
        text: `材料冲突：${c.row_key}「${c.column_label}」${c.values.map((v) => v.value).join(' vs ')}，请确认口径`,
        kind: 'conflict' as const,
        ref: c.conflict_id,
      })),
    ],
  };
}

function buildPage(
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
      const page = buildPage;
      if (ctx.brief.deliverable_type === 'research_report') {
        return researchOutline(ctx, page);
      }
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

export { retailReviewSpec as allPageTypesSpec } from '../../src/samples/retail-review.js';

/** 中等超长标题：应在两行内缩号容纳（不低于下限、不标记拆页） */
export const mediumLongHeadline =
  '上半年整体销售额在多重因素叠加下出现连续六个月的同比下降趋势且降幅逐月扩大，需要结合库存、价格与客流三个维度进一步验证根本原因并同步评估各品类结构变化影响';

/** 极端超长标题：触底仍放不下 → 字号止于下限并标记需拆页，绝不无限缩小 */
export const extremeLongHeadline =
  '上半年整体销售额在多重因素叠加下出现连续六个月的同比下降趋势且降幅逐月扩大，需要结合库存、价格与客流三个维度进一步验证根本原因并制定针对性应对方案，同时评估各品类与门店层面的差异化表现及其对整体业绩的贡献结构变化，最终形成分阶段的验证计划与决策建议';

/** 空数据图表 fixture：图表存在但 series 无数据，必须占位不得伪造 */
export const emptyChartSpec: ReportSpec = {
  schema_version: '1.0',
  report_id: 'report_m0_empty_chart',
  revision_id: 'rev_001',
  brief: { audience: '商品经营负责人', purpose: '演示', page_budget: 1 },
  pages: [
    {
      page_id: 'page_empty',
      type: 'trend',
      headline: '客流数据待补充来源',
      chart: { chart_id: 'chart_traffic', type: 'line', title: '月度客流', series: [{ name: '客流', data: [] }] },
      required_note: '演示数据',
      locked: false,
    },
  ],
};

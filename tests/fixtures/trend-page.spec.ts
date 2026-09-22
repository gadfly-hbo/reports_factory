import type { ReportSpec } from '../../src/schema/report-spec.js';

/**
 * M0 tracer 契约 fixture：单页"趋势/对比"报告，手工编写。
 * 数值为虚构演示数据（proposal §9.3 口径）：6月销售额 498 → 452 万元，
 * 同比变化率 (452-498)/498 ≈ -9.2%，仅反映算术关系，不代表真实业务。
 */
export const trendPageSpec: ReportSpec = {
  schema_version: '1.0',
  report_id: 'report_m0_tracer',
  revision_id: 'rev_001',
  brief: {
    audience: '商品经营负责人',
    purpose: '讨论销售变化并批准补充验证',
    page_budget: 8,
    language: 'zh-CN',
  },
  source_snapshot: [
    { source_id: 'src_sales_summary', version: 'v1', is_demo: true },
  ],
  metrics: [
    {
      metric_id: 'sales_change_rate_jun',
      value: -0.0924,
      unit: 'ratio',
      display_format: '0.0%',
      scope: '去年6月与今年6月销售额同比（万元）',
      formula: '(current - previous) / previous',
      inputs: { previous: 498, current: 452 },
      source_ref: 'src_sales_summary@v1',
    },
  ],
  claims: [
    {
      claim_id: 'claim_sales_drop',
      kind: 'computed_statement',
      text: '示例：6月销售额同比下降 9.2%，下降原因尚未证实。',
      metric_refs: ['sales_change_rate_jun'],
      verification_state: 'arithmetic_checked',
      source_truth_verified: false,
    },
  ],
  pages: [
    {
      page_id: 'page_01',
      type: 'trend',
      headline: '销售额出现下降，需要进一步验证原因',
      body: '示例：6月销售额同比下降 9.2%，下降原因尚未证实。',
      claim_refs: ['claim_sales_drop'],
      metric_refs: ['sales_change_rate_jun'],
      required_note: '演示数据，非真实经营结论',
      chart: {
        chart_id: 'chart_sales_trend',
        type: 'bar',
        title: '月度销售额对比（万元）',
        series: [
          {
            name: '去年同期',
            data: [
              { label: '1月', value: 520 }, { label: '2月', value: 535 },
              { label: '3月', value: 548 }, { label: '4月', value: 530 },
              { label: '5月', value: 512 }, { label: '6月', value: 498 },
            ],
          },
          {
            name: '本期',
            data: [
              { label: '1月', value: 505 }, { label: '2月', value: 510 },
              { label: '3月', value: 498 }, { label: '4月', value: 486 },
              { label: '5月', value: 470 }, { label: '6月', value: 452 },
            ],
          },
        ],
        source_ref: 'src_sales_summary@v1',
      },
      layout_id: 'headline_chart_note',
      locked: false,
    },
  ],
};

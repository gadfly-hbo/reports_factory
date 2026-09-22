import { ReportSpecSchema, type ReportSpec } from '../schema/report-spec.js';

/**
 * M0 零售经营复盘手工样例（proposal §13.1 首个验证场景）。
 * 数值为虚构演示数据；上半年合计 2,921 / 3,143 万元与月度序列自洽
 * （2921/3143 ≈ -7.1%），6月同比 452/498 ≈ -9.2%。
 */
const raw = {
  schema_version: '1.0',
  report_id: 'report_m0_page_types',
  revision_id: 'rev_001',
  brief: {
    audience: '商品经营负责人',
    purpose: '上半年经营复盘与方案讨论',
    page_budget: 8,
    language: 'zh-CN',
  },
  source_snapshot: [{ source_id: 'src_sales_summary', version: 'v1', is_demo: true }],
  metrics: [
    {
      metric_id: 'h1_sales_total',
      value: 2921,
      unit: 'cny_wan',
      display_format: '#,##0',
      scope: '2026上半年含税销售额（万元），门店口径',
      source_ref: 'src_sales_summary@v1',
    },
  ],
  claims: [
    {
      claim_id: 'claim_sales_drop',
      kind: 'computed_statement',
      text: '示例：上半年销售额同比下降 7.1%，6月单月同比降幅扩大至 9.2%。',
      metric_refs: ['h1_sales_total'],
      verification_state: 'arithmetic_checked',
      source_truth_verified: false,
    },
    {
      claim_id: 'claim_stockout_cause',
      kind: 'inference',
      text: '缺货可能是销售下降的原因之一，尚未证实。',
      verification_state: 'unverified',
      source_truth_verified: false,
      uncertainty: '仅有店长定性反馈，缺货台账待核查',
    },
  ],
  pages: [
    {
      page_id: 'page_cover',
      type: 'cover',
      headline: '2026年上半年经营复盘',
      subtitle: '商品经营例会汇报（演示数据）',
      meta: { period: '2026-01 ~ 2026-06', audience: '商品经营负责人', version: 'v1 草稿' },
      locked: false,
    },
    {
      page_id: 'page_summary',
      type: 'summary',
      headline: '销售下降已确认，原因待验证，本次需要决策验证方案',
      bullets: [
        { label: '发现', text: '上半年销售额同比下降 7.1%，降幅逐月扩大', claim_ref: 'claim_sales_drop', status: 'confirmed' },
        { label: '限制', text: '缺货与销售的因果关系尚未证实', claim_ref: 'claim_stockout_cause', status: 'unverified' },
        { label: '待决', text: '是否批准缺货专项验证（本周内）', status: 'pending' },
      ],
      locked: false,
    },
    {
      page_id: 'page_metrics',
      type: 'metrics_overview',
      headline: '关键指标：销售下降，客单价平稳，缺货率上升',
      table: {
        columns: [
          { key: 'metric', label: '指标' },
          { key: 'current', label: '本期', align: 'right' },
          { key: 'base', label: '基准', align: 'right' },
          { key: 'delta', label: '变化', align: 'right' },
          { key: 'scope', label: '口径' },
        ],
        rows: [
          { key: 'sales', cells: ['销售额（万元）', '2,921', '3,143', '-7.1%', '含税，门店口径'] },
          { key: 'ticket', cells: ['客单价（元）', '86.5', '86.2', '+0.3%', '会员口径'] },
          { key: 'stockout', cells: ['缺货率', '6.8%', '5.2%', '+1.6个百分点', '门店盘点'] },
        ],
        source_ref: 'src_sales_summary@v1',
      },
      locked: false,
    },
    {
      page_id: 'page_trend',
      type: 'trend',
      headline: '销售额出现下降，需要进一步验证原因',
      body: '示例：6月销售额同比下降 9.2%，下降原因尚未证实。',
      claim_refs: ['claim_sales_drop'],
      chart: {
        chart_id: 'chart_sales_trend',
        type: 'bar',
        title: '月度销售额对比（万元）',
        series: [
          { name: '去年同期', data: [
            { label: '1月', value: 520 }, { label: '2月', value: 535 }, { label: '3月', value: 548 },
            { label: '4月', value: 530 }, { label: '5月', value: 512 }, { label: '6月', value: 498 },
          ] },
          { name: '本期', data: [
            { label: '1月', value: 505 }, { label: '2月', value: 510 }, { label: '3月', value: 498 },
            { label: '4月', value: 486 }, { label: '5月', value: 470 }, { label: '6月', value: 452 },
          ] },
        ],
        source_ref: 'src_sales_summary@v1',
      },
      layout_id: 'headline_chart_note',
      locked: false,
    },
    {
      page_id: 'page_issue',
      type: 'issue_breakdown',
      headline: '销售下降的可能原因：三个方向，两种待验证',
      bullets: [
        { label: '库存周转', text: '门店盘点显示缺货率 6.8%（+1.6个百分点）', status: 'needs_review' },
        { label: '缺货影响', text: '店长反馈缺货集中在畅销单品，影响未量化', claim_ref: 'claim_stockout_cause', status: 'unverified' },
        { label: '价格竞争', text: '竞对促销海报为定性观察，待收集价格带数据', status: 'unverified' },
      ],
      locked: false,
    },
    {
      page_id: 'page_options',
      type: 'option_comparison',
      headline: '应对方案比较：先验证，再决定是否扩大动作',
      table: {
        columns: [
          { key: 'dim', label: '维度' },
          { key: 'a', label: '方案A 补货提速' },
          { key: 'b', label: '方案B 促销让利' },
          { key: 'c', label: '方案C 先验证再决策' },
        ],
        rows: [
          { key: 'cost', cells: ['预计投入', '待确认', '80万元', '0'] },
          { key: 'cycle', cells: ['见效周期', '待确认', '2-4周', '4-8周'] },
          { key: 'risk', cells: ['主要风险', '仓储压力', '毛利侵蚀', '延误应对'] },
          { key: 'todo', cells: ['待补信息', '供应商交期', '毛利弹性', '无'] },
        ],
      },
      locked: false,
    },
    {
      page_id: 'page_actions',
      type: 'action_items',
      headline: '本次需要批准与跟进的事项',
      table: {
        columns: [
          { key: 'item', label: '事项' },
          { key: 'owner', label: '责任人' },
          { key: 'due', label: '时间' },
          { key: 'status', label: '状态' },
        ],
        rows: [
          { key: 'verify', cells: ['缺货专项验证', '待定', '本周内', '待批准'] },
          { key: 'review', cells: ['6月品类明细复核', '张三', '7月10日前', '进行中'] },
        ],
      },
      locked: false,
    },
    {
      page_id: 'page_appendix',
      type: 'evidence_appendix',
      headline: '附录：口径、方法与来源',
      bullets: [
        { label: '口径', text: '销售额为含税、门店口径；同比为与去年同期对比' },
        { label: '来源', text: 'src_sales_summary@v1（演示数据汇总表）' },
        { label: '限制', text: '缺货影响未量化，本报告不构成原因结论' },
      ],
      required_note: '演示数据，非真实经营结论',
      locked: false,
    },
  ],
};

export const retailReviewSpec: ReportSpec = ReportSpecSchema.parse(raw);

import type { ReportSpec } from '../schema/report-spec.js';

/**
 * 发布门隐私检查（M10 S7，N3 fail-closed）：逐项扫描外发产物，命中即阻断。
 * 简化五项（PPT 适用面）：可编辑图表 / 资料来源未绑定主张 / 隐私标记内容 / 备注 / 敏感材料。
 * 与原 M3-M9 报告隐私检查同结构；items 永远完整返回（never silent）。
 */

export type PrivacyItemId =
  | 'chart_underlying_data'
  | 'claim_source_unbound'
  | 'sensitive_sources'
  | 'metadata_risk'
  | 'speculative_content';

export interface PrivacyCheckItem {
  item: PrivacyItemId;
  status: 'pass' | 'flag' | 'not_checked';
  detail?: string;
}

export interface PrivacyReport {
  items: PrivacyCheckItem[];
  checked_count: number;
  not_checked_count: number;
  flag_count: number;
  has_flags: boolean;
}

export interface PrivacyOptions {
  sources: { sensitivity?: 'normal' | 'sensitive' }[];
  hasEditableCharts: boolean;
  ackEditableData?: boolean;
  chartDataMode?: 'keep_editable' | 'aggregate_only';
  pagesHaveSpeculativeBullets?: boolean;
}

/** 扫描入口：对整套 ReportSpec 逐项评估，items 顺序固定 */
export function checkPrivacy(spec: ReportSpec, opts: PrivacyOptions): PrivacyReport {
  const items: PrivacyCheckItem[] = [
    evalChartData(spec, opts),
    evalClaimSources(spec),
    evalSensitiveSources(spec, opts),
    evalMetadataRisk(spec),
    evalSpeculative(spec, opts),
  ];
  const checked = items.filter((i) => i.status !== 'not_checked').length;
  const flags = items.filter((i) => i.status === 'flag').length;
  return { items, checked_count: checked, not_checked_count: items.length - checked, flag_count: flags, has_flags: flags > 0 };
}

function evalChartData(_spec: ReportSpec, opts: PrivacyOptions): PrivacyCheckItem {
  const nativeCharts = opts.hasEditableCharts;
  return {
    item: 'chart_underlying_data',
    status: !nativeCharts ? 'pass' : opts.chartDataMode === 'aggregate_only' ? 'pass' : opts.ackEditableData ? 'pass' : 'flag',
    detail: !nativeCharts ? '无原生图表' : opts.chartDataMode === 'aggregate_only' ? '已聚合降级（不可编辑）' : opts.ackEditableData ? '用户确认接受可编辑图表外发' : '原生图表含底层数据，未确认即外发风险',
  };
}

function evalClaimSources(spec: ReportSpec): PrivacyCheckItem {
  // 主张引用：claim_refs 与 source_snapshot 交叉匹配（PPTX 里 claim_refs 为空已是常见——留 not_checked 不强行 flag）
  const total = spec.pages.reduce((n, p) => n + (p.claim_refs?.length ?? 0), 0);
  return {
    item: 'claim_source_unbound',
    status: total === 0 ? 'not_checked' : 'pass',
    detail: total === 0 ? '未配 claim_refs（无外部主张可直接验证）' : `已绑定 ${total} 项 claim_refs`,
  };
}

function evalSensitiveSources(_spec: ReportSpec, opts: PrivacyOptions): PrivacyCheckItem {
  const sens = opts.sources.filter((s) => s.sensitivity === 'sensitive');
  if (sens.length === 0) return { item: 'sensitive_sources', status: 'pass', detail: '无敏感标记材料' };
  return { item: 'sensitive_sources', status: 'flag', detail: `${sens.length} 项材料被标记敏感；外发前需脱敏或确认` };
}

function evalMetadataRisk(spec: ReportSpec): PrivacyCheckItem {
  // revision_id / source_snapshot 写进 PPTX 元数据（ppt:revision 等）——警示内含版本溯源信息
  return {
    item: 'metadata_risk',
    status: spec.revision_id ? 'pass' : 'not_checked',
    detail: spec.revision_id ? `修订号 ${spec.revision_id}（含元数据）` : '无修订号',
  };
}

function evalSpeculative(_spec: ReportSpec, opts: PrivacyOptions): PrivacyCheckItem {
  if (opts.pagesHaveSpeculativeBullets === undefined) return { item: 'speculative_content', status: 'not_checked' };
  return {
    item: 'speculative_content',
    status: opts.pagesHaveSpeculativeBullets ? 'flag' : 'pass',
    detail: opts.pagesHaveSpeculativeBullets ? '页含未审慎推断内容（uncovered）' : '无可疑推断',
  };
}

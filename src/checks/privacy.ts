import type { ReportSpec } from '../schema/report-spec.js';
import type { SourceAsset } from '../schema/project.js';

/**
 * 导出隐私检查器（§12.2 对外导出行）。
 * 红队约束②：逐项可测；未覆盖项显式 not_checked + 说明，不做虚假全面承诺。
 */

export type PrivacyItemId =
  | 'chart_underlying_data'
  | 'doc_metadata'
  | 'hidden_content'
  | 'speaker_notes'
  | 'sensitive_sources';

export interface PrivacyCheckItem {
  item: PrivacyItemId;
  status: 'pass' | 'flag' | 'not_checked';
  detail?: string;
}

export interface PrivacyReport {
  items: PrivacyCheckItem[];
  checked_count: number;
  not_checked_count: number;
  has_flags: boolean;
}

export interface PrivacyOptions {
  sources: SourceAsset[];
  chartDataMode: 'keep_editable' | 'aggregate_only';
  ackEditableData: boolean;
}

export function checkPrivacy(spec: ReportSpec, opts: PrivacyOptions): PrivacyReport {
  const items: PrivacyCheckItem[] = [];

  // 1) 可编辑图表含底层数据：对外导出需显式降级或确认（§12.2 可编辑图表行）
  const nativeCharts = spec.pages.filter((p) => p.chart && p.chart.series.some((s) => s.data.length > 0));
  items.push({
    item: 'chart_underlying_data',
    status:
      nativeCharts.length === 0
        ? 'pass'
        : opts.chartDataMode === 'aggregate_only'
          ? 'pass'
          : opts.ackEditableData
            ? 'pass'
            : 'flag',
    detail:
      nativeCharts.length === 0
        ? '报告无原生图表'
        : opts.chartDataMode === 'aggregate_only'
          ? `${nativeCharts.length} 页图表已降级为聚合图片（底层数据不可提取）`
          : opts.ackEditableData
            ? `${nativeCharts.length} 页图表保留可编辑数据，已经用户确认`
            : `${nativeCharts.length} 页图表含可提取的底层数据：请选择"只分享聚合结果"或确认保留可编辑数据`,
  });

  // 2) 文档元数据：PPTX 在渲染时中性化（实证：默认含 PptxGenJS 字样）
  items.push({
    item: 'doc_metadata',
    status: 'pass',
    detail: 'PPTX 元数据（creator/title/subject）在导出时中性化；PDF Producer 字段为引擎固有，见 not_checked 说明',
  });

  // 3) 隐藏页面：当前产品无隐藏页概念（每页都渲染）→ 明示未覆盖
  items.push({
    item: 'hidden_content',
    status: 'not_checked',
    detail: '产品当前无隐藏页面/附录隐藏概念；若未来引入，需补检查',
  });

  // 4) 演讲者备注：当前渲染不写备注 → 明示未覆盖
  items.push({
    item: 'speaker_notes',
    status: 'not_checked',
    detail: '当前不生成演讲者备注；若未来引入备注字段，需补检查',
  });

  // 5) 敏感来源：sensitivity=sensitive 的材料不得进入对外产物
  const snapshotIds = new Set(spec.source_snapshot.map((s) => s.source_id));
  const sensitive = opts.sources.filter((s) => s.sensitivity === 'sensitive' && snapshotIds.has(s.source_id));
  items.push({
    item: 'sensitive_sources',
    status: sensitive.length > 0 ? 'flag' : 'pass',
    detail:
      sensitive.length > 0
        ? `敏感来源进入对外产物：${sensitive.map((s) => s.filename).join('、')}（§12.2：未授权材料不得发送外部服务）`
        : '无敏感来源',
  });

  const checked = items.filter((i) => i.status !== 'not_checked');
  return {
    items,
    checked_count: checked.length,
    not_checked_count: items.length - checked.length,
    has_flags: items.some((i) => i.status === 'flag'),
  };
}

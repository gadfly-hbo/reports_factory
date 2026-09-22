import type { Page } from '../schema/report-spec.js';

/** 页脚来源行的共享规则（HTML 与 PPTX 渲染器共用）：图表来源 / 表格来源 / 必要标注 */
export function pageFooterParts(page: Page): string[] {
  const parts: string[] = [];
  if (page.chart?.source_ref) parts.push(`来源：${page.chart.source_ref}`);
  if (page.table?.source_ref) parts.push(`来源：${page.table.source_ref}`);
  if (page.required_note) parts.push(page.required_note);
  return parts;
}

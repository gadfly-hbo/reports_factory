import type { Page, ReportSpec } from '../schema/report-spec.js';
import { renderChartSvg } from './charts.js';
import { pageTypeLabels, slide, tokens } from './theme.js';

export function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** 页脚来源行：图表来源 + 必要标注（演示数据等） */
function sourceLine(page: Page): string {
  const parts: string[] = [];
  if (page.chart?.source_ref) parts.push(`来源：${page.chart.source_ref}`);
  if (page.required_note) parts.push(page.required_note);
  return parts.join('　|　');
}

function renderPageHtml(page: Page): string {
  const chartSvg = page.chart ? renderChartSvg(page.chart) : '';
  const chartPanel = page.chart
    ? `<div class="chart-panel">${chartSvg}</div>`
    : '';
  const notePanel = page.body
    ? `<div class="note-panel"><p>${escapeHtml(page.body)}</p></div>`
    : '';
  const footer = sourceLine(page)
    ? `<footer class="slide-footer"><span>${escapeHtml(sourceLine(page))}</span></footer>`
    : '';
  return `
  <section class="slide" data-page-id="${escapeHtml(page.page_id)}">
    <header class="slide-header">
      <p class="kicker">${escapeHtml(pageTypeLabels[page.type] ?? page.type)}</p>
      <h1 class="headline">${escapeHtml(page.headline)}</h1>
    </header>
    <div class="slide-body">
      ${chartPanel}
      ${notePanel}
    </div>
    ${footer}
  </section>`;
}

/** ReportSpec → 自包含 HTML 预览（应用内预览与 PDF 打印共用一份渲染） */
export function renderReportHtml(spec: ReportSpec): string {
  const slides = spec.pages.map(renderPageHtml).join('\n');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(spec.report_id)}</title>
<style>
@page { size: ${slide.widthPx}px ${slide.heightPx}px; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: ${tokens.font.stack}; color: ${tokens.color.ink}; background: ${tokens.color.surface}; }
.slide { width: ${slide.widthPx}px; height: ${slide.heightPx}px; padding: 44px 64px 36px; display: flex; flex-direction: column; page-break-after: always; background: ${tokens.color.surface}; }
.slide:last-child { page-break-after: auto; }
.kicker { font-size: ${tokens.size.kicker}px; letter-spacing: 0.12em; color: ${tokens.color.accent}; font-weight: 600; }
.headline { font-size: ${tokens.size.headline}px; line-height: 1.3; margin-top: 10px; font-weight: 700; }
.slide-body { flex: 1; display: flex; gap: 28px; margin-top: 22px; min-height: 0; align-items: stretch; }
.chart-panel { flex: 1.7; display: flex; min-width: 0; }
.chart-panel svg { width: 100%; height: 100%; }
.note-panel { flex: 1; background: ${tokens.color.accentSoft}; border-radius: 10px; padding: 22px 24px; font-size: ${tokens.size.body}px; line-height: 1.8; display: flex; align-items: center; }
.slide-footer { margin-top: 14px; padding-top: 12px; border-top: 1px solid ${tokens.color.grid}; font-size: ${tokens.size.footnote}px; color: ${tokens.color.muted}; }
</style>
</head>
<body>
${slides}
</body>
</html>`;
}

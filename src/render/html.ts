import type { Page, ReportSpec } from '../schema/report-spec.js';
import { isChartEmpty, renderChartSvg } from './charts.js';
import { fitHeadline } from './text-fit.js';
import { pageFooterParts } from './footer.js';
import {
  fontSize,
  fontStack,
  pageTypeLabels,
  palette,
  resolveFonts,
  slide,
  statusVisual,
  withBrand,
} from './theme.js';

export function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** 内容区宽度（px）：画布减去左右内边距，标题测量的基准 */
const CONTENT_WIDTH_PX = slide.widthPx - 128;

function sourceLine(page: Page): string {
  return pageFooterParts(page).join('　|　');
}

function statusBadge(status?: string): string {
  if (!status) return '';
  const v = statusVisual[status];
  if (!v) return '';
  return `<span class="badge" style="color:${v.fg};background:${v.bg}">${v.label}</span>`;
}

function bulletsHtml(page: Page): string {
  if (!page.bullets || page.bullets.length === 0) return '';
  const items = page.bullets
    .map((b) => {
      const label = b.label ? `<span class="bullet-label">${escapeHtml(b.label)}</span>` : '';
      return `<li>${label}<span class="bullet-text">${escapeHtml(b.text)}</span>${statusBadge(b.status)}</li>`;
    })
    .join('\n');
  return `<ul class="bullets">${items}</ul>`;
}

function tableHtml(page: Page): string {
  const t = page.table;
  if (!t) return '';
  const head = t.columns
    .map((c) => `<th${c.align ? ` style="text-align:${c.align}"` : ''}>${escapeHtml(c.label)}</th>`)
    .join('');
  const rows = t.rows
    .map(
      (r) =>
        `<tr>${t.columns
          .map((c, i) => `<td${c.align ? ` style="text-align:${c.align}"` : ''}>${escapeHtml(r.cells[i] ?? '')}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  return `<table class="data-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function chartHtml(page: Page): string {
  if (!page.chart) return '';
  if (isChartEmpty(page.chart)) {
    return `<div class="chart-placeholder">图表待补充数据<span>缺少结构化数据，不生成图表（不伪造数值）</span></div>`;
  }
  return `<div class="chart-panel">${renderChartSvg(page.chart)}</div>`;
}

function noteHtml(page: Page): string {
  if (!page.body) return '';
  return `<div class="note-panel"><p>${escapeHtml(page.body)}</p></div>`;
}

function renderCoverHtml(page: Page, brand?: { logo_data_url?: string }): string {
  const metaParts = [page.meta?.period, page.meta?.audience, page.meta?.version].filter(Boolean);
  const logo = brand?.logo_data_url
    ? `<img class="cover-logo" src="${brand.logo_data_url}" alt="logo" style="height:44px;margin-bottom:22px" />`
    : '';
  return `
  <section class="slide cover" data-page-id="${escapeHtml(page.page_id)}">
    <div class="cover-block">
      ${logo}
      <p class="cover-kicker">${escapeHtml(pageTypeLabels.cover)}</p>
      <h1 class="cover-title">${escapeHtml(page.headline)}</h1>
      ${page.subtitle ? `<p class="cover-subtitle">${escapeHtml(page.subtitle)}</p>` : ''}
      ${metaParts.length > 0 ? `<p class="cover-meta">${escapeHtml(metaParts.join('　|　'))}</p>` : ''}
    </div>
    ${page.required_note ? `<footer class="slide-footer"><span>${escapeHtml(page.required_note)}</span></footer>` : ''}
  </section>`;
}

function renderPageHtml(page: Page, brand?: { logo_data_url?: string }): string {
  if (page.type === 'cover') return renderCoverHtml(page, brand);

  const fit = fitHeadline(page.headline, {
    base: fontSize.headlineBase,
    floor: fontSize.headlineFloor,
    maxWidth: CONTENT_WIDTH_PX,
  });
  const needsSplit = fit.needsSplit ? ' data-needs-split="true"' : '';

  const chart = chartHtml(page);
  const notes = bulletsHtml(page) || noteHtml(page);
  const table = tableHtml(page);

  // 布局组合：有图有注 → 双栏（headline_chart_note）；图满幅（headline_chart_full）→ 注释下沉；
  // 其余 → 单栏堆叠
  let body: string;
  if (chart && page.layout_id === 'headline_chart_full') {
    body = `<div class="slide-body column">${chart}${notes}</div>`;
  } else if (chart && notes) {
    body = `<div class="slide-body">${chart}<div class="side-panel">${notes}</div></div>`;
  } else if (chart || notes) {
    body = `<div class="slide-body column">${chart}${notes}</div>`;
  } else {
    body = `<div class="slide-body column">${table}</div>`;
  }
  // 表格与图注可共存（如指标总览含表、附录含列）：表格追加在双栏之后
  if (table && (chart || notes)) body += `<div class="slide-body column table-area">${table}</div>`;

  const footer = sourceLine(page)
    ? `<footer class="slide-footer"><span>${escapeHtml(sourceLine(page))}</span></footer>`
    : '';

  return `
  <section class="slide"${needsSplit} data-page-id="${escapeHtml(page.page_id)}">
    <header class="slide-header">
      <p class="kicker">${escapeHtml(pageTypeLabels[page.type] ?? page.type)}</p>
      <h1 class="headline" style="font-size: ${fit.fontSize}px">${escapeHtml(page.headline)}</h1>
    </header>
    ${body}
    ${footer}
  </section>`;
}

const baseCss = `
@page { size: ${slide.widthPx}px ${slide.heightPx}px; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: ${fontStack}; color: ${palette.text}; background: ${palette.surface}; font-variant-numeric: tabular-nums; }
.slide { width: ${slide.widthPx}px; height: ${slide.heightPx}px; padding: 44px 64px 36px; display: flex; flex-direction: column; page-break-after: always; background: ${palette.surface}; }
.slide:last-child { page-break-after: auto; }
.kicker { font-size: ${fontSize.kicker}px; letter-spacing: 0.12em; color: ${palette.primary}; font-weight: 600; }
.headline { line-height: 1.3; margin-top: 10px; font-weight: 600; }
.slide-body { flex: 1; display: flex; gap: 28px; margin-top: 22px; min-height: 0; align-items: stretch; }
.slide-body.column { flex-direction: column; gap: 18px; }
.chart-panel { flex: 1.7; display: flex; min-width: 0; }
.chart-panel svg { width: 100%; height: 100%; }
.chart-placeholder { flex: 1.7; border: 1.5px dashed ${palette.borderStrong}; background: ${palette.surface2}; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: ${palette.muted}; font-size: 18px; }
.chart-placeholder span { font-size: 13px; color: ${palette.soft}; }
.side-panel { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; overflow: hidden; }
.note-panel { background: ${palette.primarySoft}; border-radius: 8px; padding: 22px 24px; font-size: ${fontSize.body}px; line-height: 1.8; display: flex; align-items: center; }
.bullets { list-style: none; display: flex; flex-direction: column; gap: 14px; }
.bullets li { display: flex; align-items: baseline; gap: 10px; font-size: ${fontSize.body}px; line-height: 1.6; flex-wrap: wrap; }
.bullet-label { flex-shrink: 0; font-weight: 600; color: ${palette.primaryInk}; }
.bullet-text { flex: 1; min-width: 240px; }
.badge { flex-shrink: 0; font-size: 12px; padding: 2px 10px; border-radius: 999px; }
.table-area { flex: 0 1 auto; }
.data-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.data-table th { text-align: left; background: ${palette.surface3}; color: ${palette.primaryInk}; font-weight: 600; padding: 10px 14px; border-bottom: 1.5px solid ${palette.borderStrong}; }
.data-table td { padding: 10px 14px; border-bottom: 1px solid ${palette.border}; }
.slide-footer { margin-top: 14px; padding-top: 12px; border-top: 1px solid ${palette.border}; font-size: ${fontSize.footnote}px; color: ${palette.muted}; }
.cover { justify-content: center; align-items: flex-start; }
.cover-block { border-left: 6px solid ${palette.primary}; padding-left: 36px; }
.cover-kicker { font-size: ${fontSize.kicker}px; letter-spacing: 0.2em; color: ${palette.primary}; font-weight: 600; margin-bottom: 18px; }
.cover-title { font-size: ${fontSize.coverTitle}px; font-weight: 600; line-height: 1.25; }
.cover-subtitle { font-size: ${fontSize.coverSubtitle}px; color: ${palette.muted}; margin-top: 14px; }
.cover-meta { font-size: ${fontSize.coverMeta}px; color: ${palette.soft}; margin-top: 28px; }
`;

/** ReportSpec → 自包含 HTML 预览（应用内预览与 PDF 打印共用一份渲染） */
export function renderReportHtml(spec: ReportSpec): string {
  const p = withBrand(spec.theme?.brand);
  const f = resolveFonts(spec.theme?.brand);
  const css = baseCss.replaceAll(palette.primary, p.primary).replaceAll(palette.primaryInk, p.primaryInk).replaceAll(palette.primarySoft, p.primarySoft).replaceAll(palette.teal, p.teal).replaceAll(fontStack, f.stack);
  const slides = spec.pages.map((pg) => renderPageHtml(pg, spec.theme?.brand)).join('\n');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(spec.report_id)}</title>
<style>${css}</style>
</head>
<body>
${slides}
</body>
</html>`;
}

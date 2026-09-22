import type { ChartSpec, Page, ReportSpec } from '../schema/report-spec.js';
import { escapeHtml } from './html.js';
import { pageFooterParts } from './footer.js';
import { pageTypeLabels, resolveFonts, statusSuffix, withBrand } from './theme.js';

/**
 * document 管线：A4 文档流 HTML（研究报告——可独立分发的自包含单文件）。
 * 图表以数值表格呈现（PRD A2：不做图片图表，数据可读性优先）。
 */

function chartToTableHtml(chart: ChartSpec): string {
  const head = `<th>${escapeHtml(chart.series[0]?.data[0] ? '项目' : '项目')}</th>${chart.series
    .map((ser) => `<th>${escapeHtml(ser.name)}</th>`)
    .join('')}`;
  const labels = chart.series[0]?.data.map((d) => d.label) ?? [];
  const rows = labels
    .map(
      (label, i) =>
        `<tr><td>${escapeHtml(label)}</td>${chart.series.map((ser) => `<td class="num">${escapeHtml(String(ser.data[i]?.value ?? ''))}</td>`).join('')}</tr>`,
    )
    .join('');
  return `<table class="data-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function tableHtml(page: Page): string {
  const t = page.table;
  if (!t) return '';
  const head = t.columns.map((c) => `<th${c.align ? ` style="text-align:${c.align}"` : ''}>${escapeHtml(c.label)}</th>`).join('');
  const rows = t.rows
    .map((r) => `<tr>${t!.columns.map((c, i) => `<td${c.align ? ` style="text-align:${c.align}"` : ''}>${escapeHtml(r.cells[i] ?? '')}</td>`).join('')}</tr>`)
    .join('');
  return `<table class="data-table"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function sectionHtml(page: Page, idx: number): string {
  const kicker = pageTypeLabels[page.type] ?? page.type;
  const parts: string[] = [];
  if (page.body) parts.push(`<p>${escapeHtml(page.body)}</p>`);
  if (page.bullets?.length) {
    parts.push(
      `<ul>${page.bullets
        .map((b) => {
          const label = b.label ? `<b>${escapeHtml(b.label)}：</b>` : '';
          return `<li>${label}${escapeHtml(b.text)}${statusSuffix(b.status)}</li>`;
        })
        .join('')}</ul>`,
    );
  }
  if (page.table) parts.push(tableHtml(page));
  if (page.chart) parts.push(chartToTableHtml(page.chart));
  const footer = pageFooterParts(page).join('　|　');
  return `
  <section id="sec-${idx}">
    <p class="kicker">${escapeHtml(kicker)}</p>
    <h2>${escapeHtml(page.headline)}</h2>
    ${parts.join('\n')}
    ${footer ? `<p class="source-line">${escapeHtml(footer)}</p>` : ''}
  </section>`;
}

export function renderDocumentHtml(spec: ReportSpec): string {
  const [cover, ...sections] = spec.pages;
  // 品牌覆盖（无品牌时与默认 palette 完全一致）
  const palette = withBrand(spec.theme?.brand);
  const fontStack = resolveFonts(spec.theme?.brand).stack;
  const logo = spec.theme?.brand?.logo_data_url
    ? `<img src="${spec.theme.brand.logo_data_url}" alt="logo" style="height:36px;margin-bottom:8px" />`
    : '';
  const metaParts = [spec.brief.audience, spec.brief.purpose].filter(Boolean);
  const nav = sections
    .map((p, i) => `<a href="#sec-${i + 1}">${escapeHtml(p.headline)}</a>`)
    .join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(cover?.headline ?? spec.report_id)}</title>
<style>
@page { size: A4; margin: 2cm; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: ${fontStack}; color: ${palette.text}; font-size: 14px; line-height: 1.75; background: #fff; font-variant-numeric: tabular-nums; }
.doc-header { border-bottom: 3px solid ${palette.primary}; padding-bottom: 18px; margin-bottom: 8px; }
.doc-header .kicker { color: ${palette.primary}; font-weight: 600; letter-spacing: 0.15em; font-size: 12px; }
.doc-header h1 { font-size: 26px; margin: 8px 0 10px; color: ${palette.primaryInk}; }
.doc-header .meta { color: ${palette.muted}; font-size: 12.5px; }
nav.doc-nav { padding: 10px 0 14px; border-bottom: 1px solid ${palette.border}; margin-bottom: 18px; font-size: 12.5px; }
nav.doc-nav a { color: ${palette.primary}; text-decoration: none; margin-right: 14px; }
section { margin-bottom: 22px; page-break-inside: avoid; }
section .kicker { color: ${palette.primary}; font-size: 11.5px; font-weight: 600; letter-spacing: 0.1em; }
section h2 { font-size: 18px; color: ${palette.primaryInk}; margin: 4px 0 10px; }
p { margin: 6px 0; }
ul { margin: 6px 0 6px 20px; }
li { margin: 4px 0; }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 10px 0; }
.data-table th { background: ${palette.surface3}; color: ${palette.primaryInk}; font-weight: 600; padding: 6px 10px; border: 1px solid ${palette.border}; text-align: left; }
.data-table td { padding: 6px 10px; border: 1px solid ${palette.border}; }
.data-table td.num { text-align: right; }
.source-line { color: ${palette.soft}; font-size: 11.5px; margin-top: 8px; }
</style>
</head>
<body>
<div class="doc-header">
  ${logo}
  <p class="kicker">研究报告</p>
  <h1>${escapeHtml(cover?.headline ?? spec.report_id)}</h1>
  ${cover?.subtitle ? `<p class="meta">${escapeHtml(cover.subtitle)}</p>` : ''}
  <p class="meta">${escapeHtml(metaParts.join('　|　'))}${cover?.required_note ? `　|　${escapeHtml(cover.required_note)}` : ''}</p>
</div>
<nav class="doc-nav">${nav}</nav>
${sections.map((p, i) => sectionHtml(p, i + 1)).join('\n')}
</body>
</html>`;
}

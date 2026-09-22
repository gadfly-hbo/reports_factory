import PptxGenJS from 'pptxgenjs';
import type { ChartSpec, Page, ReportSpec } from '../schema/report-spec.js';
import { pageTypeLabels, slide, tokens } from './theme.js';

/**
 * ReportSpec → 基础可编辑 PPTX。
 * 标题/正文为原生文本框，表格为原生表格，图表为原生 chart 对象
 * （proposal §4.3：不接受每页一张图片放入 PPTX）。
 */

function addChart(pptx: PptxGenJS, slide: ReturnType<PptxGenJS["addSlide"]>, chart: ChartSpec, area: PptxGenJS.PositionProps) {
  const data = chart.series.map((ser) => ({
    name: ser.name,
    labels: ser.data.map((d) => d.label),
    values: ser.data.map((d) => d.value),
  }));
  const common: PptxGenJS.IChartOpts = {
    ...area,
    showLegend: true,
    legendPos: 't',
    legendFontFace: tokens.font.pptx,
    showTitle: false,
    chartColors: [tokens.color.accent, '#94A3B8'],
    catAxisLabelFontFace: tokens.font.pptx,
    valAxisLabelFontFace: tokens.font.pptx,
  };
  const t = pptx.ChartType;
  switch (chart.type) {
    case 'bar':
      slide.addChart(t.bar, data, common);
      break;
    case 'line':
      slide.addChart(t.line, data, common);
      break;
    case 'pie':
      slide.addChart(t.pie, data, { ...common, chartColors: undefined });
      break;
    case 'donut':
      slide.addChart(t.doughnut, data, { ...common, holeSize: 50 });
      break;
  }
}

function addPage(pptx: PptxGenJS, slide: ReturnType<PptxGenJS["addSlide"]>, page: Page) {
  slide.addText(pageTypeLabels[page.type] ?? page.type, {
    x: 0.6, y: 0.32, w: 12.1, h: 0.3,
    fontSize: 11, bold: true, color: tokens.color.accent,
    fontFace: tokens.font.pptx,
  });
  slide.addText(page.headline, {
    x: 0.6, y: 0.62, w: 12.1, h: 1.0,
    fontSize: 26, bold: true, color: tokens.color.ink,
    fontFace: tokens.font.pptx, valign: 'top',
  });
  if (page.chart) {
    addChart(pptx, slide, page.chart, { x: 0.6, y: 1.9, w: 7.7, h: 4.5 });
  }
  if (page.body) {
    slide.addText(page.body, {
      x: 8.6, y: 2.1, w: 4.1, h: 4.1,
      fontSize: 13, color: tokens.color.ink, fontFace: tokens.font.pptx,
      fill: { color: tokens.color.accentSoft }, valign: 'middle',
      lineSpacingMultiple: 1.4, margin: 10,
    });
  }
  const footerParts: string[] = [];
  if (page.chart?.source_ref) footerParts.push(`来源：${page.chart.source_ref}`);
  if (page.required_note) footerParts.push(page.required_note);
  if (footerParts.length > 0) {
    slide.addText(footerParts.join('　|　'), {
      x: 0.6, y: 6.85, w: 12.1, h: 0.35,
      fontSize: 10, color: tokens.color.muted, fontFace: tokens.font.pptx,
    });
  }
}

export async function renderReportPptx(spec: ReportSpec): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'W16x9', width: slide.widthIn, height: slide.heightIn });
  pptx.layout = 'W16x9';
  for (const page of spec.pages) {
    addPage(pptx, pptx.addSlide(), page);
  }
  const out = await pptx.write({ outputType: 'nodebuffer' });
  return out as Buffer;
}

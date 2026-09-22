import PptxGenJS from 'pptxgenjs';
import type { ChartSpec, Page, ReportSpec, TableSpec } from '../schema/report-spec.js';
import { isChartEmpty } from './charts.js';
import { fitHeadline } from './text-fit.js';
import {
  pageTypeLabels,
  palette,
  pptxFont,
  pptxFontSize,
  slide,
  statusVisual,
} from './theme.js';

/**
 * ReportSpec → 基础可编辑 PPTX。
 * 标题/正文为原生文本框，表格为原生表格（a:tbl），图表为原生 chart 对象
 * （proposal §4.3：不接受每页一张图片放入 PPTX）。
 */

type Slide = ReturnType<PptxGenJS['addSlide']>;

/** 内容区宽度（pt），标题测量基准：12.1in × 72 */
const CONTENT_WIDTH_PT = 12.1 * 72 - 20;

function addChart(pptx: PptxGenJS, s: Slide, chart: ChartSpec, area: PptxGenJS.PositionProps) {
  const data = chart.series.map((ser) => ({
    name: ser.name,
    labels: ser.data.map((d) => d.label),
    values: ser.data.map((d) => d.value),
  }));
  const common: PptxGenJS.IChartOpts = {
    ...area,
    showLegend: true,
    legendPos: 't',
    legendFontFace: pptxFont,
    showTitle: false,
    catAxisLabelFontFace: pptxFont,
    valAxisLabelFontFace: pptxFont,
  };
  const t = pptx.ChartType;
  switch (chart.type) {
    case 'bar':
      s.addChart(t.bar, data, common);
      break;
    case 'line':
      s.addChart(t.line, data, common);
      break;
    case 'pie':
      s.addChart(t.pie, data, common);
      break;
    case 'donut':
      s.addChart(t.doughnut, data, { ...common, holeSize: 50 });
      break;
  }
}

function addTable(s: Slide, table: TableSpec, area: PptxGenJS.PositionProps) {
  const headerRow = table.columns.map((c) => ({
    text: c.label,
    options: {
      bold: true,
      color: palette.primaryInk.replace('#', ''),
      fill: { color: palette.surface3.replace('#', '') },
      align: c.align ?? 'left',
      fontFace: pptxFont,
      fontSize: pptxFontSize.table,
    },
  }));
  const bodyRows = table.rows.map((r) =>
    table.columns.map((c, i) => ({
      text: r.cells[i] ?? '',
      options: {
        align: c.align ?? 'left',
        color: palette.text.replace('#', ''),
        fontFace: pptxFont,
        fontSize: pptxFontSize.table,
      },
    })),
  );
  const tableWidth = typeof area.w === 'number' ? area.w : 12.1;
  s.addTable([headerRow, ...bodyRows], {
    ...area,
    colW: Array(table.columns.length).fill(tableWidth / table.columns.length),
    border: { type: 'solid', color: palette.border.replace('#', ''), pt: 0.5 },
    rowH: 0.42,
    valign: 'middle',
  });
}

function bulletTexts(page: Page) {
  return (page.bullets ?? []).map((b) => {
    const label = b.label ? `${b.label}：` : '';
    const status = b.status ? `（${statusVisual[b.status]?.label ?? b.status}）` : '';
    return { text: `${label}${b.text}${status}`, options: { bullet: true, breakLine: true } };
  });
}

function addFooter(s: Slide, page: Page) {
  const parts: string[] = [];
  if (page.chart?.source_ref) parts.push(`来源：${page.chart.source_ref}`);
  if (page.table?.source_ref) parts.push(`来源：${page.table.source_ref}`);
  if (page.required_note) parts.push(page.required_note);
  if (parts.length > 0) {
    s.addText(parts.join('　|　'), {
      x: 0.6, y: 6.9, w: 12.1, h: 0.35,
      fontSize: pptxFontSize.footnote, color: palette.muted.replace('#', ''), fontFace: pptxFont,
    });
  }
}

function addCover(pptx: PptxGenJS, page: Page) {
  const s = pptx.addSlide();
  s.addText(pageTypeLabels.cover, {
    x: 0.9, y: 2.0, w: 11.5, h: 0.4, align: 'left',
    fontSize: pptxFontSize.kicker + 1, bold: true, color: palette.primary.replace('#', ''), fontFace: pptxFont,
  });
  s.addText(page.headline, {
    x: 0.9, y: 2.5, w: 11.5, h: 1.5, align: 'left',
    fontSize: pptxFontSize.coverTitle, bold: true, color: palette.text.replace('#', ''), fontFace: pptxFont,
  });
  if (page.subtitle) {
    s.addText(page.subtitle, {
      x: 0.9, y: 4.05, w: 11.5, h: 0.5, align: 'left',
      fontSize: pptxFontSize.coverSubtitle, color: palette.muted.replace('#', ''), fontFace: pptxFont,
    });
  }
  const metaParts = [page.meta?.period, page.meta?.audience, page.meta?.version].filter(Boolean);
  if (metaParts.length > 0) {
    s.addText(metaParts.join('　|　'), {
      x: 0.9, y: 4.75, w: 11.5, h: 0.4, align: 'left',
      fontSize: pptxFontSize.coverMeta, color: palette.soft.replace('#', ''), fontFace: pptxFont,
    });
  }
  if (page.required_note) addFooter(s, page);
}

function addContentPage(pptx: PptxGenJS, page: Page) {
  const s = pptx.addSlide();
  s.addText(pageTypeLabels[page.type] ?? page.type, {
    x: 0.6, y: 0.32, w: 12.1, h: 0.3,
    fontSize: pptxFontSize.kicker, bold: true, color: palette.primary.replace('#', ''), fontFace: pptxFont,
  });

  const fit = fitHeadline(page.headline, {
    base: pptxFontSize.headlineBase,
    floor: pptxFontSize.headlineFloor,
    maxWidth: CONTENT_WIDTH_PT,
  });
  s.addText(page.headline, {
    x: 0.6, y: 0.62, w: 12.1, h: 1.15, valign: 'top',
    fontSize: fit.fontSize, bold: true, color: palette.text.replace('#', ''), fontFace: pptxFont,
  });

  const hasBullets = (page.bullets?.length ?? 0) > 0;
  const hasChart = !!page.chart;
  const chartEmpty = page.chart ? isChartEmpty(page.chart) : false;

  if (hasChart && !chartEmpty) {
    addChart(pptx, s, page.chart!, { x: 0.6, y: 1.95, w: 7.7, h: 4.6 });
    if (page.body) {
      s.addText(page.body, {
        x: 8.6, y: 2.15, w: 4.1, h: 4.2, valign: 'middle',
        fontSize: pptxFontSize.body, color: palette.text.replace('#', ''), fontFace: pptxFont,
        fill: { color: palette.primarySoft.replace('#', '') },
        lineSpacingMultiple: 1.4, margin: 10,
      });
    } else if (hasBullets) {
      s.addText(bulletTexts(page), {
        x: 8.6, y: 2.15, w: 4.1, h: 4.2, valign: 'top',
        fontSize: pptxFontSize.bullet, color: palette.text.replace('#', ''), fontFace: pptxFont,
        lineSpacingMultiple: 1.3, margin: 6,
      });
    }
  } else if (hasChart && chartEmpty) {
    s.addText(
      [
        { text: '图表待补充数据', options: { fontSize: 18, bold: true, color: palette.muted.replace('#', ''), breakLine: true } },
        { text: '缺少结构化数据，不生成图表（不伪造数值）', options: { fontSize: 11, color: palette.soft.replace('#', '') } },
      ],
      {
        x: 0.6, y: 2.4, w: 12.1, h: 2.6, align: 'center', valign: 'middle',
        fontFace: pptxFont, fill: { color: palette.surface2.replace('#', '') },
        line: { type: 'solid', color: palette.borderStrong.replace('#', ''), pt: 0.75 },
      },
    );
    if (hasBullets) {
      s.addText(bulletTexts(page), {
        x: 0.6, y: 5.2, w: 12.1, h: 1.5, valign: 'top',
        fontSize: pptxFontSize.bullet, color: palette.text.replace('#', ''), fontFace: pptxFont,
      });
    }
  } else if (page.table) {
    addTable(s, page.table, { x: 0.6, y: 2.0, w: 12.1, h: 4.4 });
  } else if (hasBullets) {
    s.addText(bulletTexts(page), {
      x: 0.6, y: 2.1, w: 12.1, h: 4.4, valign: 'top',
      fontSize: pptxFontSize.bullet, color: palette.text.replace('#', ''), fontFace: pptxFont,
      lineSpacingMultiple: 1.4,
    });
  } else if (page.body) {
    s.addText(page.body, {
      x: 0.6, y: 2.1, w: 12.1, h: 4.4, valign: 'top',
      fontSize: pptxFontSize.body + 1, color: palette.text.replace('#', ''), fontFace: pptxFont,
      lineSpacingMultiple: 1.5,
    });
  }
  addFooter(s, page);
}

export async function renderReportPptx(spec: ReportSpec): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'W16x9', width: slide.widthIn, height: slide.heightIn });
  pptx.layout = 'W16x9';
  for (const page of spec.pages) {
    if (page.type === 'cover') addCover(pptx, page);
    else addContentPage(pptx, page);
  }
  const out = await pptx.write({ outputType: 'nodebuffer' });
  return out as Buffer;
}

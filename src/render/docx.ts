import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { ChartSpec, Page, ReportSpec, TableSpec } from '../schema/report-spec.js';
import { pageFooterParts } from './footer.js';
import { palette, pptxFont, withBrand } from './theme.js';
import { ImageRun } from 'docx';

/**
 * document 管线：DOCX 渲染（研究报告）。
 * A4 纵向、Heading1/2、原生段落与表格、节尾来源行（M3-G3）；
 * 图表以数值表格呈现（A2）。docx 库为纯生成器——无宏、无脚本执行面。
 */

const A4_TWIPS = { width: 11906, height: 16838 };
const MARGIN_TWIPS = { top: 1418, right: 1418, bottom: 1418, left: 1418 };

const hex = (c: string) => c.replace('#', '').toUpperCase();
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const tableBorders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: hex(palette.border) },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: hex(palette.border) },
  left: { style: BorderStyle.SINGLE, size: 4, color: hex(palette.border) },
  right: { style: BorderStyle.SINGLE, size: 4, color: hex(palette.border) },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: hex(palette.border) },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: hex(palette.border) },
};

function cell(text: string, opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; header?: boolean } = {}, p = palette) {
  return new TableCell({
    borders: tableBorders,
    shading: opts.header ? { fill: hex(p.surface3) } : undefined,
    children: [
      new Paragraph({
        alignment: opts.align,
        children: [
          new TextRun({
            text,
            bold: opts.bold ?? opts.header,
            color: opts.header ? hex(p.primaryInk) : hex(p.text),
            font: pptxFont,
            size: 21, // 10.5pt
          }),
        ],
      }),
    ],
  });
}

function specTableToDocx(t: TableSpec, p = palette): Table {
  const header = new TableRow({
    tableHeader: true,
    children: t.columns.map((c) =>
      cell(c.label, { header: true, align: c.align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT }),
    ),
  });
  const rows = t.rows.map(
    (r) =>
      new TableRow({
        children: t.columns.map((c, i) =>
          cell(r.cells[i] ?? '', { align: c.align === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT }),
        ),
      }),
  );
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...rows] });
}

/** 图表 → 数值表格（A2：数据可读性优先，不做图片图表） */
function chartToDocxTable(chart: ChartSpec, p = palette): Table {
  const header = new TableRow({
    tableHeader: true,
    children: [cell('项目', { header: true }), ...chart.series.map((ser) => cell(ser.name, { header: true }))],
  });
  const labels = chart.series[0]?.data.map((d) => d.label) ?? [];
  const rows = labels.map(
    (label, i) =>
      new TableRow({
        children: [cell(label), ...chart.series.map((ser) => cell(String(ser.data[i]?.value ?? ''), { align: AlignmentType.RIGHT }))],
      }),
  );
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...rows] });
}

function sectionChildren(page: Page, p = palette): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  out.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: page.headline, font: pptxFont, bold: true, color: hex(p.primaryInk), size: 30 })],
    }),
  );
  if (page.body) {
    out.push(new Paragraph({ children: [new TextRun({ text: page.body, font: pptxFont, size: 24 })] }));
  }
  for (const b of page.bullets ?? []) {
    const status = b.status && b.status !== 'confirmed' ? `（${b.status === 'unverified' ? '待验证' : b.status === 'needs_review' ? '待复核' : '待决'}）` : '';
    out.push(
      new Paragraph({
        bullet: { level: 0 },
        children: [
          new TextRun({ text: `${b.label ? `${b.label}：` : ''}${b.text}${status}`, font: pptxFont, size: 24 }),
        ],
      }),
    );
  }
  if (page.table) out.push(specTableToDocx(page.table, p));
  if (page.chart) out.push(chartToDocxTable(page.chart, p));
  const footer = pageFooterParts(page).join('　|　');
  if (footer) {
    out.push(
      new Paragraph({
        children: [new TextRun({ text: footer, font: pptxFont, size: 18, color: hex(palette.soft), italics: true })],
        spacing: { before: 120 },
      }),
    );
  }
  out.push(new Paragraph({ text: '' }));
  return out;
}

export async function renderReportDocx(spec: ReportSpec): Promise<Buffer> {
  const [cover, ...sections] = spec.pages;
  const p = withBrand(spec.theme?.brand);
  const children: (Paragraph | Table)[] = [];

  // 文档头（封面信息 + 品牌 Logo）
  if (spec.theme?.brand?.logo_data_url) {
    const b64 = spec.theme.brand.logo_data_url.split(',')[1] ?? '';
    const ext = spec.theme.brand.logo_data_url.match(/^data:image\/(png|jpe?g)/)?.[1] ?? 'png';
    children.push(
      new Paragraph({
        children: [new ImageRun({ type: ext === 'jpg' ? 'jpg' : 'png', data: Buffer.from(b64, 'base64'), transformation: { width: 72, height: 28 } })],
        spacing: { after: 120 },
      }),
    );
  }
  children.push(
    new Paragraph({
      children: [new TextRun({ text: '研究报告', font: pptxFont, bold: true, color: hex(p.primary), size: 22 })],
      spacing: { after: 120 },
    }),
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: cover?.headline ?? spec.report_id, font: pptxFont, bold: true, color: hex(p.primaryInk), size: 44 })],
      spacing: { after: 160 },
    }),
  );
  if (cover?.subtitle) {
    children.push(new Paragraph({ children: [new TextRun({ text: cover.subtitle, font: pptxFont, size: 26, color: hex(palette.muted) })] }));
  }
  const metaParts = [spec.brief.audience, spec.brief.purpose].filter(Boolean);
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: [metaParts.join('　|　'), cover?.required_note].filter(Boolean).join('　|　'),
          font: pptxFont, size: 20, color: hex(palette.soft),
        }),
      ],
      spacing: { after: 360 },
    }),
  );

  for (const page of sections) {
    children.push(...sectionChildren(page, p));
  }

  const doc = new Document({
    creator: '',
    title: spec.report_id,
    description: '',
    sections: [
      {
        properties: {
          page: { size: { width: A4_TWIPS.width, height: A4_TWIPS.height, orientation: 'portrait' }, margin: MARGIN_TWIPS },
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc) as unknown as Promise<Buffer>;
}

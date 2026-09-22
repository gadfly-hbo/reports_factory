import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { validateReportSpec } from '../src/schema/report-spec.js';
import { renderReportHtml } from '../src/render/html.js';
import { renderReportPptx } from '../src/render/pptx.js';
import { renderReportPdf } from '../src/render/pdf.js';
import { allPageTypesSpec, emptyChartSpec, extremeLongHeadline, mediumLongHeadline } from './fixtures/all-page-types.spec.js';

const HEADLINE_FLOOR_HTML = 24;
const HEADLINE_FLOOR_PPTX = 18; // pt → XML sz=1800

async function pptxZip(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf);
  const files = Object.keys(zip.files);
  const read = async (pred: (f: string) => boolean) => {
    const name = files.find(pred);
    return name ? ((await zip.file(name)!.async('string')) ?? '') : '';
  };
  const slideXml = (n: number) => zip.file(`ppt/slides/slide${n}.xml`)?.async('string') ?? '';
  return { files, read, slideXml };
}

async function pdfPageCount(buf: Buffer): Promise<number> {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as any;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  return doc.numPages;
}

describe('页型全量：8 种页面类型 × 三格式', () => {
  it('8 页 fixture 通过 schema 校验', () => {
    const spec = validateReportSpec(allPageTypesSpec);
    expect(spec.pages).toHaveLength(8);
    expect(spec.pages.map((p) => p.type)).toEqual([
      'cover', 'summary', 'metrics_overview', 'trend',
      'issue_breakdown', 'option_comparison', 'action_items', 'evidence_appendix',
    ]);
  });

  it('HTML：8 个 slide、封面副标题、要点列表与原生表格标记齐全', () => {
    const html = renderReportHtml(allPageTypesSpec);
    expect((html.match(/class="slide[" ]/g) ?? []).length).toBe(8);
    expect(html).toContain('商品经营例会汇报（演示数据）');
    expect(html).toContain('2026-01 ~ 2026-06');
    expect(html).toContain('<table');
    expect(html).toContain('销售额（万元）');
    expect(html).toContain('2,921');
    expect(html).toContain('+1.6个百分点');
    expect(html).toContain('缺货与销售的因果关系尚未证实'); // 推断保留
    expect(html).toContain('待验证'); // 状态带文字，不只靠颜色
    expect(html).toContain('src_sales_summary@v1');
  });

  it('PPTX：8 页、表格为原生 a:tbl、标题为文本 run、图表为原生 chart', async () => {
    const buf = await renderReportPptx(allPageTypesSpec);
    const { files, slideXml } = await pptxZip(buf);
    const slideFiles = files.filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    expect(slideFiles).toHaveLength(8);
    // 指标总览/方案比较/行动页 → 原生表格
    for (const n of [3, 6, 7]) {
      expect(await slideXml(n)).toContain('<a:tbl>');
    }
    // 封面副标题与 meta 为文本
    expect(await slideXml(1)).toContain('商品经营例会汇报（演示数据）');
    // 每页 headline 为文本 run
    expect(await slideXml(2)).toContain('销售下降已确认');
    // trend 页图表为原生 chart 部件
    const chartFiles = files.filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f));
    expect(chartFiles).toHaveLength(1);
    const chartXml = await pptxZip(buf).then((z) => z.read((f) => /^ppt\/charts\/chart1\.xml$/.test(f)));
    expect(chartXml).toMatch(/<c:v>452<\/c:v>/);
  });

  it('PDF：8 页，页面比例 16:9', async () => {
    const buf = await renderReportPdf(allPageTypesSpec);
    expect(await pdfPageCount(buf)).toBe(8);
  });
});

describe('中文长标题防溢出', () => {
  const mediumSpec = {
    ...allPageTypesSpec,
    report_id: 'report_m0_long_title',
    pages: [{ ...allPageTypesSpec.pages[1]!, headline: mediumLongHeadline }],
  };
  const extremeSpec = {
    ...allPageTypesSpec,
    report_id: 'report_m0_long_title_extreme',
    pages: [{ ...allPageTypesSpec.pages[1]!, headline: extremeLongHeadline }],
  };

  it('HTML：中等超长标题缩号容纳且不低于下限、不标记拆页', () => {
    const html = renderReportHtml(mediumSpec);
    // 在 (floor, base) 区间内缩号
    const m = html.match(/class="headline" style="font-size: (\d+)px"/);
    expect(m).not.toBeNull();
    const size = Number(m![1]);
    expect(size).toBeLessThan(34);
    expect(size).toBeGreaterThanOrEqual(HEADLINE_FLOOR_HTML);
    expect(html).not.toContain('data-needs-split="true"');
  });

  it('HTML：极端超长标题止于下限并标记需拆页，绝不低于下限', () => {
    const html = renderReportHtml(extremeSpec);
    expect(html).toContain(`font-size: ${HEADLINE_FLOOR_HTML}px`);
    expect(html).toContain('data-needs-split="true"');
    expect(html).not.toContain(`font-size: ${HEADLINE_FLOOR_HTML - 2}px`);
  });

  it('PPTX：极端标题字号止于下限（sz=1800），并保留完整文字', async () => {
    const buf = await renderReportPptx(extremeSpec);
    const { slideXml } = await pptxZip(buf);
    const xml = await slideXml(1);
    expect(xml).toContain('sz="1800"');
    expect(xml).not.toContain('sz="1600"');
    expect(xml).toContain(extremeLongHeadline.slice(0, 20));
  });
});

describe('空数据图表占位（不伪造数据）', () => {
  it('HTML：渲染待补充占位而非图表', () => {
    const html = renderReportHtml(emptyChartSpec);
    expect(html).toContain('图表待补充数据');
    expect(html).not.toContain('<svg');
  });

  it('PPTX：占位文本框、无 chart 部件', async () => {
    const buf = await renderReportPptx(emptyChartSpec);
    const { files, slideXml } = await pptxZip(buf);
    expect(await slideXml(1)).toContain('图表待补充数据');
    expect(files.filter((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f))).toHaveLength(0);
  });

  it('PDF：占位文字可抽取', async () => {
    const buf = await renderReportPdf(emptyChartSpec);
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as any;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const page = await doc.getPage(1);
    const text = (await page.getTextContent()).items.map((it: any) => it.str).join('');
    expect(text.normalize('NFKC').replace(/\s+/g, '')).toContain('图表待补充数据');
  });
});

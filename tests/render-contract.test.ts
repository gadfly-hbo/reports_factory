import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { validateReportSpec } from '../src/schema/report-spec.js';
import { renderReportHtml } from '../src/render/html.js';
import { renderReportPptx } from '../src/render/pptx.js';
import { renderReportPdf } from '../src/render/pdf.js';
import { trendPageSpec } from './fixtures/trend-page.spec.js';

/** 从 PPTX 解包文本（<a:t> 文本 run 之和）与部件清单 */
async function pptxParts(buf: Buffer) {
  const zip = await JSZip.loadAsync(buf);
  const files = Object.keys(zip.files);
  const slideXml = await zip.file('ppt/slides/slide1.xml')?.async('string');
  const chartFile = files.find((f) => /^ppt\/charts\/chart\d+\.xml$/.test(f));
  const chartXml = chartFile ? await zip.file(chartFile)?.async('string') : undefined;
  return { files, slideXml: slideXml ?? '', chartXml: chartXml ?? '', chartFile };
}

/** 从 PDF 抽取全部文本。Chromium 产物的 ToUnicode 会把部分汉字映射为康熙部首码位
 *  （如 ⼀→一）并在字符间插空格；NFKC 归一 + 去空白后即为实际渲染内容。 */
function normalizePdfText(s: string): string {
  return s.normalize('NFKC').replace(/\s+/g, '');
}

async function pdfText(buf: Buffer): Promise<string> {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as any;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  return content.items.map((it: any) => it.str).join(' ');
}

describe('渲染契约：同一 ReportSpec → HTML / PPTX / PDF', () => {
  it('ReportSpec fixture 通过 schema 校验并保留稳定引用', () => {
    const spec = validateReportSpec(trendPageSpec);
    expect(spec.metrics[0]!.metric_id).toBe('sales_change_rate_jun');
    expect(spec.metrics[0]!.source_ref).toBe('src_sales_summary@v1');
    expect(spec.claims[0]!.verification_state).toBe('arithmetic_checked');
    expect(spec.pages[0]!.claim_refs).toContain('claim_sales_drop');
  });

  it('HTML 包含结论标题、图表 SVG 与来源脚注，无外部网络依赖', () => {
    const html = renderReportHtml(trendPageSpec);
    expect(html).toContain('销售额出现下降，需要进一步验证原因');
    expect(html).toContain('<svg');
    expect(html).toContain('src_sales_summary@v1');
    expect(html).toContain('演示数据，非真实经营结论');
    expect(html).not.toMatch(/(src|href)="https?:\/\//);
  });

  it('PPTX 标题/正文为原生文本，图表为原生 chart 对象（非图片）', async () => {
    const buf = await renderReportPptx(trendPageSpec);
    const { slideXml, chartXml, chartFile } = await pptxParts(buf);
    expect(slideXml).toContain('<a:t>');
    expect(slideXml).toContain('销售额出现下降，需要进一步验证原因');
    expect(slideXml).toContain('演示数据，非真实经营结论');
    expect(chartFile).toBeDefined();
    expect(chartXml).toMatch(/<c:v>452<\/c:v>/);
    // 非截图式页面：幻灯片不因图表而只剩图片
    expect(slideXml).not.toMatch(/<p:pic>.*chart/s);
  });

  it('PDF 文本含标题与关键数字，页面为 16:9', async () => {
    const buf = await renderReportPdf(trendPageSpec);
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as any;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    expect(Math.abs(vp.width / vp.height - 16 / 9)).toBeLessThan(0.01);
    const text = normalizePdfText(await pdfText(buf));
    expect(text).toContain(normalizePdfText('销售额'));
    expect(text).toContain(normalizePdfText('9.2%'));
  });

  it('三产物关键内容一致（同标题出现在三种格式中）', async () => {
    const html = renderReportHtml(trendPageSpec);
    const pptx = await pptxParts(await renderReportPptx(trendPageSpec));
    const pdf = normalizePdfText(await pdfText(await renderReportPdf(trendPageSpec)));
    const headline = '销售额出现下降，需要进一步验证原因';
    expect(html).toContain(headline);
    expect(pptx.slideXml).toContain(headline);
    expect(pdf).toContain(normalizePdfText(headline));
  });
});

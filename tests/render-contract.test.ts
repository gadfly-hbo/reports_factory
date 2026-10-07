import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { validateReportSpec } from '../src/schema/report-spec.js';
import { renderReportPptx } from '../src/render/pptx.js';
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

describe('渲染契约：ReportSpec → PPTX（M10 主导出格式）', () => {
  it('ReportSpec fixture 通过 schema 校验并保留稳定引用', () => {
    const spec = validateReportSpec(trendPageSpec);
    expect(spec.metrics[0]!.metric_id).toBe('sales_change_rate_jun');
    expect(spec.metrics[0]!.source_ref).toBe('src_sales_summary@v1');
    expect(spec.claims[0]!.verification_state).toBe('arithmetic_checked');
    expect(spec.pages[0]!.claim_refs).toContain('claim_sales_drop');
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
});

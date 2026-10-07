import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { withBrand, palette } from '../src/render/theme.js';
import { renderReportPptx } from '../src/render/pptx.js';
import { trendPageSpec } from './fixtures/trend-page.spec.js';
import { validateReportSpec, type ReportSpec } from '../src/schema/report-spec.js';

const LOGO_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const brand = { primary: '#8B1E3F', accent: '#1E608B', logo_data_url: LOGO_1PX, font_name: 'DemoSans' };

function withBrandSpec(): ReportSpec {
  const spec = structuredClone(trendPageSpec);
  // 封面页承载品牌 Logo 渲染（addCover 仅封面挂 logo_data_url）
  (spec.pages as ReportSpec['pages']) = [
    { page_id: 'page_00', type: 'cover', headline: '品牌测试封面', claim_refs: [] },
    ...spec.pages,
  ];
  spec.theme = { brand };
  return validateReportSpec(spec);
}

describe('品牌 token（换品牌不重生成内容的前提）', () => {
  it('无品牌 → 与默认 palette 完全一致（回归零漂移基础）', () => {
    expect(withBrand(undefined)).toBe(palette);
  });

  it('有品牌 → 覆盖主色/墨色/软色，其余语义色不动', () => {
    const p = withBrand(brand);
    expect(p.primary).toBe('#8B1E3F');
    expect(p.primaryInk).toBe('#8B1E3F');
    expect(p.teal).toBe('#1E608B');
    expect(p.primarySoft).not.toBe(palette.primarySoft);
    expect(p.green).toBe(palette.green); // 语义状态色不随品牌变
  });
});

describe('品牌在 PPTX 产物中可见（M10 主导出格式）', () => {
  it('PPTX：品牌色文本 + Logo 图片部件', async () => {
    const buf = await renderReportPptx(withBrandSpec());
    const zip = await JSZip.loadAsync(buf);
    const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f));
    const allXml = (await Promise.all(slides.map((f) => zip.file(f)!.async('string')))).join('');
    expect(allXml).toContain('8B1E3F');
    expect(Object.keys(zip.files).some((f) => /^ppt\/media\/image/.test(f))).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { withBrand, palette } from '../src/render/theme.js';
import { renderReportHtml } from '../src/render/html.js';
import { renderReportPptx } from '../src/render/pptx.js';
import { renderReportDocx } from '../src/render/docx.js';
import { renderDocumentHtml } from '../src/render/document-html.js';
import { retailReviewSpec } from '../src/samples/retail-review.js';
import { validateReportSpec, type ReportSpec } from '../src/schema/report-spec.js';

const LOGO_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const brand = { primary: '#8B1E3F', accent: '#1E608B', logo_data_url: LOGO_1PX, font_name: 'DemoSans' };

function withBrandSpec(): ReportSpec {
  const spec = structuredClone(retailReviewSpec);
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

describe('品牌在四类产物中可见', () => {
  it('deck HTML：品牌色与 Logo 出现', () => {
    const html = renderReportHtml(withBrandSpec());
    expect(html.toLowerCase()).toContain('#8b1e3f');
    expect(html).toContain(LOGO_1PX);
  });

  it('document HTML：品牌色与 Logo 出现', () => {
    const html = renderDocumentHtml(withBrandSpec());
    expect(html.toLowerCase()).toContain('#8b1e3f');
    expect(html).toContain(LOGO_1PX);
  });

  it('PPTX：品牌色文本 + Logo 图片部件', async () => {
    const buf = await renderReportPptx(withBrandSpec());
    const zip = await JSZip.loadAsync(buf);
    const slide1 = await zip.file('ppt/slides/slide1.xml')!.async('string');
    expect(slide1).toContain('8B1E3F');
    expect(Object.keys(zip.files).some((f) => /^ppt\/media\/image/.test(f))).toBe(true);
  });

  it('DOCX：品牌色文本 + Logo 图片部件', async () => {
    const buf = await renderReportDocx(withBrandSpec());
    const zip = await JSZip.loadAsync(buf);
    const docXml = await zip.file('word/document.xml')!.async('string');
    expect(docXml).toContain('8B1E3F');
    expect(Object.keys(zip.files).some((f) => /^word\/media\//.test(f))).toBe(true);
  });
});

describe('默认（无品牌）产物不变', () => {
  it('deck HTML 与 golden 基线一致（regression 已覆盖，此处快速断言无品牌泄漏）', () => {
    const html = renderReportHtml(retailReviewSpec);
    expect(html.toLowerCase()).not.toContain('#8b1e3f');
    expect(html).not.toContain('data:image/');
  });
});

describe('换品牌不重生成内容（§5.3：风格变化不触发内容重生成）', () => {
  it('applyBrand：theme 变化、pages/claims/metrics 逐字不变', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { WorkspaceStore } = await import('../src/storage/workspace.js');
    const { WorkbenchService } = await import('../src/server/workbench.js');
    const dir = mkdtempSync(join(tmpdir(), 'rs-brand-'));
    try {
      const store = new WorkspaceStore(dir);
      const wb = new WorkbenchService(store);
      const project = await store.createProject({ title: '品牌测试' });
      // 直接写 work spec（绕过 outline 流程，聚焦品牌语义）
      const { writeFile, mkdir } = await import('node:fs/promises');
      await mkdir(join(dir, project.project_id, 'work'), { recursive: true });
      await writeFile(join(dir, project.project_id, 'work', 'state.json'), JSON.stringify({ spec: retailReviewSpec }));
      const before = JSON.parse(JSON.stringify(retailReviewSpec));

      const next = await wb.applyBrand(project.project_id, brand);
      expect(next.theme?.brand?.primary).toBe('#8B1E3F');
      // 内容字段零变化
      expect(next.pages).toEqual(before.pages);
      expect(next.claims).toEqual(before.claims);
      expect(next.metrics).toEqual(before.metrics);
      // 品牌进了项目与修订快照（冻结）
      const p2 = await store.getProject(project.project_id);
      expect(p2!.brand?.primary).toBe('#8B1E3F');
      const revs = await store.listRevisions(project.project_id);
      expect(revs.at(-1)!.spec.theme?.brand?.primary).toBe('#8B1E3F');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

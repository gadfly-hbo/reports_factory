import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ingestCsv, ingestMarkdown } from '../src/ingest/index.js';
import { createDeterministicGateway, type OutlineContext } from '../src/model/gateway.js';
import { assembleReportSpec, type AssembleContext } from '../src/compose/assemble.js';
import { renderDocumentHtml } from '../src/render/document-html.js';
import { renderReportDocx } from '../src/render/docx.js';
import { renderDocumentPdf } from '../src/render/document-pdf.js';
import { validateReportSpec, type Claim } from '../src/schema/report-spec.js';

const MAT = join(import.meta.dirname, 'fixtures/materials');

/** 从 fixtures 构建"研究报告"交付物 spec（deliverable_type=research_report） */
async function buildResearchSpec() {
  const md = await readFile(join(MAT, 'conclusion.md'), 'utf-8');
  const csv = await readFile(join(MAT, 'sales.csv'), 'utf-8');
  const mdRes = ingestMarkdown(md, 'src_md');
  const csvRes = ingestCsv(csv, 'src_csv');
  const brief = {
    audience: '商品经营负责人',
    purpose: '上半年销售变化分析（供传阅复核）',
    page_budget: 9,
    deliverable_type: 'research_report' as const,
  };
  const outlineCtx: OutlineContext = {
    brief,
    claims: mdRes.claims as Claim[],
    tables: csvRes.tables,
    evidence: mdRes.evidence,
    conflicts: [],
    notes: [],
    confirmations: csvRes.confirmations,
  };
  const draft = await createDeterministicGateway().composeOutline(outlineCtx);
  const ctx: AssembleContext = {
    brief: outlineCtx.brief,
    claims: outlineCtx.claims,
    tables: outlineCtx.tables,
    evidence: outlineCtx.evidence,
    conflicts: [],
    notes: [],
    pagePlans: draft.pages,
    sourceSnapshot: [
      { source_id: 'src_md', version: 'v1', is_demo: true },
      { source_id: 'src_csv', version: 'v1', is_demo: true },
    ],
  };
  const spec = assembleReportSpec({ report_id: 'report_m3_research', ctx });
  return { spec: validateReportSpec(spec), draft };
}

describe('研究报告大纲（deliverable_type=research_report）', () => {
  it('确定性编排走文档主线：问题→口径→发现→限制→建议→附录', async () => {
    const { spec } = await buildResearchSpec();
    expect(spec.brief.deliverable_type).toBe('research_report');
    const headlines = spec.pages.map((p) => p.headline);
    expect(headlines.some((h) => h.includes('问题与背景'))).toBe(true);
    expect(headlines.some((h) => h.includes('口径与方法'))).toBe(true);
    expect(headlines.some((h) => h.includes('主要发现'))).toBe(true);
    expect(headlines.some((h) => h.includes('限制与不确定性'))).toBe(true);
    expect(headlines.some((h) => h.includes('建议'))).toBe(true);
    // 证据绑定：推断进"限制"，不进"发现"
    const limitPage = spec.pages.find((p) => p.headline.includes('限制与不确定性'))!;
    expect(limitPage.bullets?.some((b) => b.status === 'unverified')).toBe(true);
  });
});

describe('document 管线：独立 HTML（A4 文档流）', () => {
  it('自包含、含节导航与关键内容、无外链', async () => {
    const { spec } = await buildResearchSpec();
    const html = renderDocumentHtml(spec);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('问题与背景');
    expect(html).toContain('nav');
    expect(html).not.toMatch(/(src|href)="https?:\/\//);
    expect(html).toContain('@page'); // A4 打印
    // 图表以数值表格呈现（A2：不做图片图表）
    expect(html).toContain('<table');
    expect(html).toContain('452');
  });
});

describe('document 管线：DOCX（原生可编辑）', () => {
  it('解包断言：原生段落/表格、关键数字、节尾来源行、A4', async () => {
    const { spec } = await buildResearchSpec();
    const buf = await renderReportDocx(spec);
    const zip = await JSZip.loadAsync(buf);
    const docXml = await zip.file('word/document.xml')!.async('string');
    expect(docXml).toContain('<w:p>'); // 原生段落
    expect(docXml).toContain('<w:tbl>'); // 原生表格
    expect(docXml).toContain('问题与背景');
    expect(docXml).toContain('452'); // 表格数值可追溯
    expect(docXml).toContain('来源'); // 节尾来源行
    // A4（twips：11906 × 16838）
    expect(docXml).toMatch(/w:w="11906"/);
    expect(docXml).toMatch(/w:h="16838"/);
  });
});

describe('document 管线：PDF（A4 文档流）', () => {
  it('A4 比例且关键文本可抽取', async () => {
    const { spec } = await buildResearchSpec();
    const buf = await renderDocumentPdf(spec);
    const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as any;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 1 });
    expect(Math.abs(vp.width / vp.height - 210 / 297)).toBeLessThan(0.02);
    let text = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const p = await doc.getPage(i);
      text += (await p.getTextContent()).items.map((it: any) => it.str).join('');
    }
    expect(text.normalize('NFKC').replace(/\s+/g, '')).toContain('问题与背景');
  });
});

import JSZip from 'jszip';
import type { Page, ReportSpec } from '../schema/report-spec.js';

/**
 * 跨格式一致性校验（proposal §11.4）：
 * 同一 ReportSpec 的 HTML / PPTX / PDF 产物必须信息一致——
 * 每条 authored 文本（标题/正文/要点/表格单元）在三种产物中均可定位，
 * 页数一致。不一致时定位到 page_id + 字段 + 缺失格式。
 */

/**
 * NFKC 归一（康熙部首 U+2F00 区/全角标点抽取伪影）+ 去空白。
 * Chromium 合成字体的 ToUnicode 还会把个别汉字映射到 CJK 部首补充区
 * （U+2E80–U+2EFF），NFKC 不覆盖 —— 只映射实证出现过的字符；
 * 未映射的部首字符会显式报不一致，而不是静默放过。
 */
const RADICAL_SUPPLEMENT_MAP: Record<string, string> = {
  '\u2EC5': '见', // ⻅
  '\u2ED3': '长', // ⻓
  '\u2ED4': '门', // ⻔
  '\u2EDB': '风', // ⻛
};

export function normalizeText(s: string): string {
  const nfkc = s.normalize('NFKC').replace(/\s+/g, '');
  let out = '';
  for (const ch of nfkc) out += RADICAL_SUPPLEMENT_MAP[ch] ?? ch;
  return out;
}

function unescapeHtml(s: string): string {
  return s
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&');
}

export function extractHtmlText(html: string): { text: string; pages: number } {
  const body = html.replace(/<style[\s\S]*?<\/style>/g, ' ');
  return {
    text: normalizeText(unescapeHtml(body.replace(/<[^>]+>/g, ' '))),
    pages: (html.match(/class="slide[" ]/g) ?? []).length,
  };
}

export async function extractPptxText(buf: Buffer): Promise<{ text: string; pages: number }> {
  const zip = await JSZip.loadAsync(buf);
  const slideFiles = Object.keys(zip.files)
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort(
      (a, b) =>
        Number(a.match(/slide(\d+)\.xml$/)![1]) - Number(b.match(/slide(\d+)\.xml$/)![1]),
    );
  const parts: string[] = [];
  for (const f of slideFiles) {
    const xml = await zip.file(f)!.async('string');
    const runs = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]!);
    parts.push(normalizeText(runs.join('')));
  }
  return { text: parts.join('\n'), pages: slideFiles.length };
}

export async function extractPdfText(buf: Buffer): Promise<{ text: string; pages: number }> {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as any;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    parts.push(normalizeText(content.items.map((it: any) => it.str).join('')));
  }
  return { text: parts.join('\n'), pages: doc.numPages };
}

/** spec 中所有"应出现在产物里"的 authored 文本 */
function authoredTexts(spec: ReportSpec): { page_id: string; field: string; text: string }[] {
  const out: { page_id: string; field: string; text: string }[] = [];
  for (const page of spec.pages as Page[]) {
    if (page.headline) out.push({ page_id: page.page_id, field: 'headline', text: page.headline });
    if (page.subtitle) out.push({ page_id: page.page_id, field: 'subtitle', text: page.subtitle });
    if (page.body) out.push({ page_id: page.page_id, field: 'body', text: page.body });
    for (const b of page.bullets ?? []) {
      out.push({ page_id: page.page_id, field: 'bullets', text: b.text });
    }
    for (const r of page.table?.rows ?? []) {
      for (const c of r.cells) {
        if (c.trim()) out.push({ page_id: page.page_id, field: 'table', text: c });
      }
    }
    for (const v of Object.values(page.meta ?? {})) {
      if (v) out.push({ page_id: page.page_id, field: 'meta', text: v });
    }
  }
  return out;
}

export interface ConsistencyIssue {
  page_id: string;
  field: string;
  text: string;
  missing_in: ('html' | 'pptx' | 'pdf')[];
}

export interface ConsistencyResult {
  issues: ConsistencyIssue[];
  pageCounts: { html: number; pptx: number; pdf: number };
  pageCountMismatch: boolean;
}

export async function checkConsistency(
  spec: ReportSpec,
  artifacts: { html: string; pptx: Buffer; pdf: Buffer },
): Promise<ConsistencyResult> {
  const [html, pptx, pdf] = await Promise.all([
    Promise.resolve(extractHtmlText(artifacts.html)),
    extractPptxText(artifacts.pptx),
    extractPdfText(artifacts.pdf),
  ]);
  const texts: Record<string, string> = { html: html.text, pptx: pptx.text, pdf: pdf.text };

  const issues: ConsistencyIssue[] = [];
  for (const item of authoredTexts(spec)) {
    const needle = normalizeText(item.text);
    if (!needle) continue;
    const missing_in = (['html', 'pptx', 'pdf'] as const).filter(
      (fmt) => !texts[fmt]!.includes(needle),
    );
    if (missing_in.length > 0) {
      issues.push({ ...item, missing_in: [...missing_in] });
    }
  }

  const pageCounts = { html: html.pages, pptx: pptx.pages, pdf: pdf.pages };
  const expected = spec.pages.length;
  const pageCountMismatch = Object.values(pageCounts).some((n) => n !== expected);

  return { issues, pageCounts, pageCountMismatch };
}

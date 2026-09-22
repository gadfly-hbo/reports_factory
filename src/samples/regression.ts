import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReportSpec } from '../schema/report-spec.js';
import { renderReportHtml } from '../render/html.js';
import { renderReportPptx } from '../render/pptx.js';
import { renderReportPdf, closePdfBrowser } from '../render/pdf.js';
import { extractHtmlText, extractPptxText, extractPdfText, normalizeText } from '../render/consistency.js';

/**
 * 回归 golden 机制（红队约束①）：比对归一化文本与对象形状，禁止字节哈希
 * （已实证：PPTX/PDF 字节随次变化——时间戳/zip 元数据；归一化文本稳定）。
 */

export const GOLDEN_DIR = join(process.cwd(), 'samples', 'retail-review', 'golden');

export interface NormalizedArtifacts {
  html: { text: string; pages: number };
  pptx: { text: string; pages: number };
  pdf: { text: string; pages: number };
  pages_expected: number;
}

export async function generateNormalizedTexts(spec: ReportSpec): Promise<NormalizedArtifacts> {
  const htmlStr = renderReportHtml(spec);
  const pptxBuf = await renderReportPptx(spec);
  const pdfBuf = await renderReportPdf(spec);
  await closePdfBrowser();
  return {
    html: await extractHtmlText(htmlStr),
    pptx: await extractPptxText(pptxBuf),
    pdf: await extractPdfText(pdfBuf),
    pages_expected: spec.pages.length,
  };
}

export interface Mismatch {
  format: 'html' | 'pptx' | 'pdf' | 'docx';
  detail: string;
}

export interface GoldenResult {
  ok: boolean;
  mismatches: Mismatch[];
}

/** 逐行 diff 摘要：找出 golden 没有的行（新内容）与丢失的行 */
function lineDiff(golden: string, actual: string): string {
  const g = new Set(golden.split('\n'));
  const a = new Set(actual.split('\n'));
  const added = [...a].filter((l) => !g.has(l)).slice(0, 5);
  const removed = [...g].filter((l) => !a.has(l)).slice(0, 5);
  const parts: string[] = [];
  if (added.length) parts.push(`新增: ${added.join(' / ')}`);
  if (removed.length) parts.push(`丢失: ${removed.join(' / ')}`);
  return parts.join('；') || '内容差异（长度不同）';
}

export async function compareWithGolden(spec: ReportSpec, goldenDir = GOLDEN_DIR): Promise<GoldenResult> {
  const actual = await generateNormalizedTexts(spec);
  const mismatches: Mismatch[] = [];
  for (const fmt of ['html', 'pptx', 'pdf'] as const) {
    let golden: string;
    try {
      golden = await readFile(join(goldenDir, `${fmt}.txt`), 'utf-8');
    } catch {
      mismatches.push({ format: fmt, detail: 'golden 基线缺失（先跑 npm run regression -- --update）' });
      continue;
    }
    if (golden !== actual[fmt].text) {
      mismatches.push({ format: fmt, detail: lineDiff(golden, actual[fmt].text) });
    }
    if (actual[fmt].pages !== actual.pages_expected) {
      mismatches.push({ format: fmt, detail: `页数 ${actual[fmt].pages} ≠ 期望 ${actual.pages_expected}` });
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

export async function updateGolden(spec: ReportSpec, goldenDir = GOLDEN_DIR): Promise<void> {
  const actual = await generateNormalizedTexts(spec);
  await mkdir(goldenDir, { recursive: true });
  for (const fmt of ['html', 'pptx', 'pdf'] as const) {
    await writeFile(join(goldenDir, `${fmt}.txt`), actual[fmt].text, 'utf-8');
  }
}

/** DOCX 文本抽取（word/document.xml 的 w:t run 之和） */
export async function extractDocxText(buf: Buffer): Promise<{ text: string; parts: number }> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')!.async('string');
  const runs = [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]!);
  return { text: normalizeText(runs.join(' ')), parts: 1 };
}

/** document 管线（研究报告）的归一化产物：独立 HTML / DOCX / A4 PDF */
export async function generateDocumentNormalizedTexts(spec: ReportSpec): Promise<{
  html: { text: string; pages: number };
  docx: { text: string; parts: number };
  pdf: { text: string; pages: number };
  pages_expected: number;
}> {
  const { renderDocumentHtml } = await import('../render/document-html.js');
  const { renderDocumentPdf, closeDocumentPdfBrowser } = await import('../render/document-pdf.js');
  const { renderReportDocx } = await import('../render/docx.js');
  const htmlStr = renderDocumentHtml(spec);
  const docxBuf = await renderReportDocx(spec);
  const pdfBuf = await renderDocumentPdf(spec);
  await closeDocumentPdfBrowser();
  return {
    html: await extractHtmlText(htmlStr),
    docx: await extractDocxText(docxBuf),
    pdf: await extractPdfText(pdfBuf),
    pages_expected: spec.pages.length,
  };
}

export async function compareDocumentGolden(spec: ReportSpec, goldenDir: string): Promise<GoldenResult> {
  const actual = await generateDocumentNormalizedTexts(spec);
  const mismatches: Mismatch[] = [];
  for (const fmt of ['html', 'docx', 'pdf'] as const) {
    let golden: string;
    try {
      golden = await readFile(join(goldenDir, `${fmt}.txt`), 'utf-8');
    } catch {
      mismatches.push({ format: fmt, detail: 'golden 基线缺失（先跑 --update）' });
      continue;
    }
    if (golden !== actual[fmt].text) {
      mismatches.push({ format: fmt, detail: lineDiff(golden, actual[fmt].text) });
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

export async function updateDocumentGolden(spec: ReportSpec, goldenDir: string): Promise<void> {
  const actual = await generateDocumentNormalizedTexts(spec);
  await mkdir(goldenDir, { recursive: true });
  for (const fmt of ['html', 'docx', 'pdf'] as const) {
    await writeFile(join(goldenDir, `${fmt}.txt`), actual[fmt].text, 'utf-8');
  }
}

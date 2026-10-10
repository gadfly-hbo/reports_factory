import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { fallbackPreviewHtml } from './deck-preview.js';
import { listDeckPages } from './deck-files.js';

/**
 * deck 导出（T5，D8/G8）：三格式——pptx=agent 工件直出（不再重渲染）；
 * html=页面 HTML 合集（缺预览页用近似 fallback）；pdf=Playwright 单次打印合集（@page 1280×720）。
 * 供 export_deck 工具（agent 侧）与导出路由（用户侧）共用。
 */

export interface DeckExport {
  format: 'pptx' | 'html' | 'pdf';
  artifact: Buffer;
}

function pageSection(bodyHtml: string): string {
  return `<section style="width:1280px;height:720px;overflow:hidden;position:relative;box-sizing:border-box">${bodyHtml}</section>`;
}

function extractBody(html: string): string {
  const m = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  return m ? m[1]! : html;
}

async function collectPageHtmls(projectRoot: string): Promise<Array<{ name: string; html: string }>> {
  const out: Array<{ name: string; html: string }> = [];
  for (const p of await listDeckPages(projectRoot)) {
    const htmlPath = join(projectRoot, p.html ?? '');
    const html = p.html ? await readFile(htmlPath, 'utf-8') : fallbackPreviewHtml(await readFile(join(projectRoot, p.code), 'utf-8'), p.name);
    out.push({ name: p.name, html });
  }
  return out;
}

export async function buildDeckHtml(projectRoot: string): Promise<string> {
  const pages = await collectPageHtmls(projectRoot);
  if (pages.length === 0) throw new Error('deck/pages 下没有页面文件');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>deck</title><style>
  body { margin: 0; }
  section { page-break-after: always; }
  section:last-child { page-break-after: auto; }
  @media print { @page { size: 1280px 720px; margin: 0; } }
</style><body>${pages.map((p) => pageSection(extractBody(p.html))).join('\n')}</body></html>`;
}

export async function buildDeckPdf(projectRoot: string): Promise<Buffer> {
  const html = await buildDeckHtml(projectRoot);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent(html, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(200);
    return await page.pdf({ width: '1280px', height: '720px', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  } finally {
    await browser.close();
  }
}

export async function buildDeckExports(projectRoot: string, formats: ReadonlyArray<'pptx' | 'html' | 'pdf'>): Promise<DeckExport[]> {
  const out: DeckExport[] = [];
  for (const fmt of formats) {
    if (fmt === 'pptx') {
      const pptxPath = join(projectRoot, 'deck', 'deck.pptx');
      if (!existsSync(pptxPath)) throw new Error('deck/deck.pptx 不存在：先完成生成与 render_deck');
      out.push({ format: 'pptx', artifact: await readFile(pptxPath) });
    } else if (fmt === 'html') {
      out.push({ format: 'html', artifact: Buffer.from(await buildDeckHtml(projectRoot), 'utf-8') });
    } else {
      out.push({ format: 'pdf', artifact: await buildDeckPdf(projectRoot) });
    }
  }
  return out;
}

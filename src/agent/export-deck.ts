import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { fallbackPreviewHtml } from './deck-preview.js';
import { listDeckPages } from './deck-files.js';
import { repairChartTableRanges } from './pptx-compat.js';

/**
 * deck 导出（T5，D8/G8）：三格式——pptx=agent 工件直出（不再重渲染）；
 * html=页面 HTML 合集（缺预览页用近似 fallback）；pdf=Playwright 单次打印合集（@page 1280×720）。
 * 供 export_deck 工具（agent 侧）与导出路由（用户侧）共用。
 */

export interface DeckExport {
  format: 'pptx' | 'html' | 'pdf';
  artifact: Buffer;
}

/** 保留各页完整文档：合并 CSS 会让一页样式重排另一页。iframe srcdoc 为原生独立文档容器，
 *  逐页样式（同名 class/id、html/body/*、:root 变量、print 媒体规则）各自作用本页。
 *  注意：这是样式隔离，不是安全沙箱。 */
function pageSection(html: string, name: string): string {
  const attribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<section style="width:1280px;height:720px;overflow:hidden;position:relative;box-sizing:border-box"><iframe title="${attribute(name)}" srcdoc="${attribute(html)}" style="display:block;width:100%;height:100%;border:0"></iframe></section>`;
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
</style><body>${pages.map((p) => pageSection(p.html, p.name)).join('\n')}</body></html>`;
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
      // 修复锁定 PptxGenJS 4.0.1 原生图表嵌入工作簿的 table ref 尾部多引号（仅导出副本；独立版同样生效）
      out.push({ format: 'pptx', artifact: await repairChartTableRanges(await readFile(pptxPath)) });
    } else if (fmt === 'html') {
      out.push({ format: 'html', artifact: Buffer.from(await buildDeckHtml(projectRoot), 'utf-8') });
    } else {
      out.push({ format: 'pdf', artifact: await buildDeckPdf(projectRoot) });
    }
  }
  return out;
}

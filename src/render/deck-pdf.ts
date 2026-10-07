import { chromium } from 'playwright';
import type { ReportSpec } from '../schema/report-spec.js';

/**
 * 打印 PDF（M10 S7，US12）：用 Chromium 把 deck HTML 经 headless 渲染输出 16:9 多页 PDF。
 * HTML 渲染层 = render/deck-html.ts；HTML 单文件可独立打开（不依赖 Playwright 在场）。
 */

export async function renderDeckPdf(spec: ReportSpec): Promise<Buffer> {
  const { renderDeckHtml } = await import('../render/deck-html.js');
  const html = renderDeckHtml(spec);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  const buf = await page.pdf({ format: 'A4', printBackground: true });
  await browser.close();
  return buf;
}

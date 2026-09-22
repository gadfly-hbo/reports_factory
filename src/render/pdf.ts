import type { Browser } from 'playwright';
import { chromium } from 'playwright';
import type { ReportSpec } from '../schema/report-spec.js';
import { renderReportHtml } from './html.js';
import { slide } from './theme.js';

/**
 * ReportSpec → PDF 定稿：Chromium 无头打印与 HTML 预览同一份渲染
 * （proposal §11.4：共享内容与证据，允许不同布局适配器）。
 */
let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) browser = await chromium.launch();
  return browser;
}

export async function closePdfBrowser(): Promise<void> {
  await browser?.close();
  browser = null;
}

export async function renderReportPdf(spec: ReportSpec): Promise<Buffer> {
  const html = renderReportHtml(spec);
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    return (await page.pdf({
      width: `${slide.widthPx}px`,
      height: `${slide.heightPx}px`,
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
    })) as Buffer;
  } finally {
    await page.close();
  }
}

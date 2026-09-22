import type { Browser } from 'playwright';
import { chromium } from 'playwright';
import type { ReportSpec } from '../schema/report-spec.js';
import { renderDocumentHtml } from './document-html.js';

/**
 * document 管线：A4 PDF（Chromium 打印与独立 HTML 同一份渲染，§11.4 共享内容）。
 */
let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) browser = await chromium.launch();
  return browser;
}

export async function closeDocumentPdfBrowser(): Promise<void> {
  await browser?.close();
  browser = null;
}

export async function renderDocumentPdf(spec: ReportSpec): Promise<Buffer> {
  const html = renderDocumentHtml(spec);
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    return (await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '2cm', bottom: '2cm', left: '2cm', right: '2cm' },
    })) as Buffer;
  } finally {
    await page.close();
  }
}

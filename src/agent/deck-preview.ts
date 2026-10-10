import { chromium } from 'playwright';

/** deck 页 HTML 预览 → PNG（1280×720；本地单用户：每请求独立浏览器，简单可靠）。 */
export async function renderHtmlFilePng(htmlPath: string): Promise<Buffer> {
  return shootHtml(await (await import('node:fs/promises')).readFile(htmlPath, 'utf-8'));
}

/** 视觉自检用：JPEG q80（体积≈PNG 的 1/5~1/10，控制多页进上下文的 token 成本）。 */
export async function shootHtmlJpeg(html: string): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent(html, { waitUntil: 'load', timeout: 15_000 });
    await page.waitForTimeout(150);
    return await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 720 }, type: 'jpeg', quality: 80 });
  } finally {
    await browser.close();
  }
}

export async function shootHtml(html: string): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.setContent(html, { waitUntil: 'load', timeout: 15_000 });
    await page.waitForTimeout(150); // 字体/布局稳定
    return await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 720 } });
  } finally {
    await browser.close();
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 近似预览 fallback（T4，T3 遗留）：agent 未写同名 HTML 时，从 page .mjs 源码提取 addText 文本生成近似页。
 *  明示「近似」；真实视觉以导出 PPTX 为准。 */
export function fallbackPreviewHtml(source: string, page: string): string {
  const texts: string[] = [];
  for (const m of source.matchAll(/addText\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g)) {
    const t = m[2]!.replace(/\\n/g, '\n').replace(/\n/g, ' ').trim();
    if (t) texts.push(t);
  }
  const bg = /background\s*=\s*\{[^}]*color:\s*'([0-9a-fA-F]{6})'/.exec(source)?.[1];
  const dark = bg && ['263442', '242830'].includes(bg.toLowerCase());
  const ink = dark ? '#ffffff' : '#242830';
  const paper = bg ? `#${bg}` : '#f7f6f3';
  const [head, ...rest] = texts;
  const bullets = rest.slice(0, 8).map((t) => `<li>${esc(t)}</li>`).join('');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><body style="margin:0;width:1280px;height:720px;box-sizing:border-box;padding:64px 72px;background:${paper};color:${ink};font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;display:flex;flex-direction:column">
<div style="position:absolute;top:18px;right:24px;font-size:12px;color:${dark ? '#9fb3c0' : '#9aa1ab'};border:1px solid ${dark ? '#3c4f60' : '#dedcd6'};border-radius:4px;padding:3px 10px">近似预览（该页无 agent HTML）</div>
<h1 style="font-size:${head && head.length > 26 ? 30 : 40}px;font-weight:700;line-height:1.3;margin:0 0 8px">${esc(head ?? page)}</h1>
<div style="width:56px;height:5px;background:#b44626;border-radius:2px;margin:18px 0 30px"></div>
<ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:16px;font-size:20px;line-height:1.55">${bullets}</ul>
${texts.length === 0 ? '<p style="margin-top:40px;font-size:15px;color:#9aa1ab">（未能从页面源码提取文本）</p>' : ''}
</body></html>`;
}

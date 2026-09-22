// 将样例 HTML 的每个 .slide 元素截图为 PNG（视觉验收与回归用）
// 用法：node scripts/snapshots.mjs [sample-dir]（默认 samples/retail-review）
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const dir = process.argv[2] ?? 'samples/retail-review';
const html = await readFile(join(dir, 'report.html'), 'utf-8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.setContent(html, { waitUntil: 'load' });
const slides = page.locator('.slide');
const n = await slides.count();
for (let i = 0; i < n; i++) {
  const num = String(i + 1).padStart(2, '0');
  await slides.nth(i).screenshot({ path: join(dir, `page-${num}.png`) });
  console.log(`page-${num}.png`);
}
await browser.close();

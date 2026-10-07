import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// 服务在 8787
await page.goto('http://127.0.0.1:8787/', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/ui-projects.png', fullPage: false });

// 进第一个项目（准备屏）
const link = page.locator('table .btn-ghost').first();
if (await link.count() > 0) {
  await link.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/ui-prepare.png', fullPage: true });
}
// 生成与编辑屏（直接走 hash 路由）
await page.goto('http://127.0.0.1:8787/#/project/proj_ff9421af/generate', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/ui-build.png', fullPage: true });
await browser.close();
console.log('shots done');

import { chromium } from 'playwright';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = mkdtempSync(join(tmpdir(), 'rs-vgate-'));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('file:///Users/bendandebaba/DevWorkSpace/Projects/reports-factory/prototype/m10-ui-demo.html');
await page.waitForTimeout(400);
// 重点：审核发布页（核心复杂页）
for (const [view] of [
  ['projects', null],
  ['upload', null],
  ['understand', null],
  ['framework', null],
  ['generate', null],
  ['page-edit', null],
  ['publish', null],
]) {
  if (view === 'projects') await page.click('#btnNewProject');
  else if (view === 'settings') await page.click('[data-goto="settings"]');
  else await page.click(`#stepNav .nav-item[data-step="${view}"]`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `tests/fixtures/m10-visual/${view}.png`, fullPage: true });
}
await browser.close();
console.log('shots done:', dir);

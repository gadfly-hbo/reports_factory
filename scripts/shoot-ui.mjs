// 关键视图截图(视觉验收用):走一遍 项目→材料→大纲→组装→检查→导出→Inspector→⌘K→设置,逐屏存 /tmp/rs-shots/
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 8792;
const OUT = '/tmp/rs-shots';
mkdirSync(OUT, { recursive: true });
const dataDir = mkdtempSync(join(tmpdir(), 'rs-shoot-'));
const server = spawn('node', ['dist/server/start.js'], {
  env: { ...process.env, REPORT_STUDIO_HOME: dataDir, REPORT_STUDIO_NO_SYNC: '1', PORT: String(PORT) },
  stdio: 'ignore',
});
await sleep(800);
let ready = false;
for (let i = 0; i < 40 && !ready; i++) {
  try { ready = (await fetch(`http://127.0.0.1:${PORT}/api/projects`)).ok; } catch { await sleep(500); }
}
if (!ready) { console.error('服务未就绪'); server.kill(); process.exit(1); }

const base = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });

try {
  await page.goto(base);
  await page.waitForSelector('.sidebar');
  await shot('01-home');
  await page.click('.sb-new');
  await sleep(300);
  await shot('02-home-new');

  await page.fill('#np-title', '零售业态季度复盘');
  await page.click('button:has-text("创建")');
  await page.waitForSelector('.stagebar');
  await page.setInputFiles('input[type=file]', [
    'tests/fixtures/materials/conclusion.md',
    'tests/fixtures/materials/sales.csv',
    'tests/fixtures/materials/sales-conflict.csv',
  ]);
  await page.waitForSelector('table.tbl tr:has-text("sales-conflict.csv")');
  await shot('03-materials');

  await page.click('.stage:has-text("大纲")');
  await page.click('button:has-text("生成大纲")');
  await page.waitForSelector('.outline-page');
  await sleep(3500); // 等 toast 消散再截
  await shot('04-outline');

  await page.click('button:has-text("确认大纲")');
  await page.waitForSelector('.preview-frame');
  await sleep(900); // 预览 iframe 渲染
  await shot('05-compose');

  // 产生修订 2,供版本页签比较
  await page.selectOption('#edit-page', { index: 1 });
  await page.fill('#edit-text', '品类结构:从流量到毛利');
  await page.click('button:has-text("修改标题")');
  await sleep(800);

  await page.click('.stage:has-text("检查")');
  await page.click('button:has-text("运行检查")');
  await page.waitForSelector('.issue');
  await shot('06-check');

  await page.click('.stage:has-text("材料")');
  await page.click('button:has-text("采用前者")');
  await page.waitForSelector('.card:has-text("材料冲突")', { state: 'detached' });
  await page.click('.stage:has-text("导出")');
  await page.click('button:has-text("草稿导出")');
  await page.waitForSelector('table.tbl td:has-text("草稿")');
  await page.click('button:has-text("正式导出")');
  await page.waitForSelector('table.tbl td:has-text("定稿")');
  await sleep(400);
  await shot('07-export');

  await page.click('.insp-tab:has-text("主张与证据")');
  await sleep(3500); // 等 toast 消散
  await shot('08-inspector-evidence');
  await page.click('.insp-tab:has-text("指标")');
  await sleep(300);
  await shot('09-inspector-metrics');
  await page.click('.insp-tab:has-text("版本")');
  await page.locator('.insp-item select').nth(0).selectOption({ index: 1 });
  await page.locator('.insp-item select').nth(1).selectOption({ index: 2 });
  await page.click('.insp-item button:has-text("比较")');
  await page.waitForSelector('.diff-field');
  await shot('10-inspector-versions');

  await page.keyboard.press('Meta+k');
  await page.waitForSelector('.palette');
  await page.fill('.palette input', '导出');
  await sleep(300);
  await shot('11-palette');
  await page.keyboard.press('Escape');

  await page.goto(`${base}/#/settings`);
  await page.waitForSelector('.home-title');
  await shot('12-settings');

  console.log(`截图完成 → ${OUT}`);
} catch (e) {
  console.error('中断:', e instanceof Error ? e.message : String(e));
  await page.screenshot({ path: `${OUT}/fail.png` });
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
}

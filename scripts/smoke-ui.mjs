// UI 冒烟走查：真实浏览器中走通 建项目→传材料→大纲→组装→预览→检查→导出
// 前置：npm run build && npm run build:web；用法：node scripts/smoke-ui.mjs
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 8791;
const dataDir = mkdtempSync(join(tmpdir(), 'rs-smoke-'));
const server = spawn('node', ['dist/server/start.js'], {
  env: { ...process.env, REPORT_STUDIO_HOME: dataDir, PORT: String(PORT) },
  stdio: 'ignore',
});
await sleep(1200);

let failed = 0;
const ok = (name) => console.log(`  ✓ ${name}`);
const bad = (name, e) => { failed++; console.error(`  ✗ ${name}: ${e}`); };

try {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`http://127.0.0.1:${PORT}`);

  // 1) 新建项目（处理 prompt 对话框）
  page.once('dialog', (d) => d.accept('冒烟测试项目'));
  await page.click('button:has-text("新建汇报")');
  await page.waitForSelector('h1:has-text("冒烟测试项目")');
  ok('新建项目并进入工作区');

  // 2) 上传 md + csv + 冲突 csv
  await page.setInputFiles('input[type=file]', [
    'tests/fixtures/materials/conclusion.md',
    'tests/fixtures/materials/sales.csv',
    'tests/fixtures/materials/sales-conflict.csv',
  ]);
  await page.waitForSelector('tr:has-text("conclusion.md")');
  await page.waitForSelector('tr:has-text("sales.csv")');
  ok('上传 3 份材料并显示解析状态');

  // 3) 冲突提示出现
  await page.waitForSelector('.notice.warn:has-text("材料冲突")');
  ok('材料冲突在 UI 中可见（不静默）');

  // 4) 生成大纲 → 确认
  await page.click('button:has-text("生成大纲")');
  await page.waitForSelector('.outline-page');
  const pageCount = await page.locator('.outline-page').count();
  if (pageCount !== 8) throw new Error(`大纲页数 ${pageCount} ≠ 8`);
  ok('大纲 8 页生成，主旨可编辑');
  await page.click('button:has-text("确认大纲")');
  await page.waitForSelector('button:has-text("运行检查")');
  ok('确认大纲并组装报告');

  // 5) 预览 iframe 加载出报告内容
  const frame = page.frameLocator('iframe.preview-frame');
  await frame.locator('.slide').first().waitFor();
  const slideCount = await frame.locator('.slide').count();
  if (slideCount !== 8) throw new Error(`预览页数 ${slideCount} ≠ 8`);
  ok('HTML 预览 8 页渲染');

  // 6) 检查：阻断 > 0（冲突未解决）
  await page.click('button:has-text("运行检查")');
  await page.waitForSelector('.badge.red');
  ok('检查显示阻断项（冲突未解决）');

  // 7) 正式导出被阻断 → 处理冲突 → 草稿导出成功
  await page.click('button:has-text("正式导出")');
  await page.waitForSelector('.notice.error');
  ok('未解决冲突时正式导出被阻断');
  await page.click('button:has-text("采用前者")');
  await page.click('button:has-text("草稿导出")');
  await page.waitForSelector('tr:has-text("草稿")');
  ok('冲突处理后草稿导出成功（带草稿标识）');

  // 8) 冲突解决后再检查 → 阻断清零 → 正式导出
  await page.click('button:has-text("运行检查")');
  await page.waitForSelector('.badge.green:has-text("0 阻断")');
  await page.click('button:has-text("正式导出")');
  await page.waitForSelector('tr:has-text("定稿")');
  ok('阻断清零后正式导出成功');

  await browser.close();
  console.log(failed === 0 ? '\nUI 冒烟走查：全部通过 ✅' : `\nUI 冒烟走查：${failed} 项失败 ❌`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (e) {
  bad('走查中断', e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
} finally {
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
}

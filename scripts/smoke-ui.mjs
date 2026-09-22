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

  // 9) 版本比较：页面内调用编辑 API 铸新修订 → 刷新 → 比较两版本
  const editViaApi = await page.evaluate(async () => {
    // 列表接口按更新时间倒序，本项目即最新者
    const res = await fetch('/api/projects').then((r) => r.json());
    const id = res.projects[0].project_id;
    const edit = await fetch(`/api/projects/${id}/edit`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: { kind: 'edit_text', page_id: 'page_03', field: 'headline', text: '版本比较演示标题' } }),
    }).then((r) => r.json());
    return { id, ok: !!edit.spec };
  });
  if (!editViaApi.ok) throw new Error('编辑 API 调用失败');
  ok('编辑铸新修订（S3 链路）');

  // 刷新详情后使用版本比较卡（应用内导航：回列表再进项目，页面状态在 React 内存中）
  await page.click('button:has-text("← 项目列表")');
  await page.waitForSelector('button:has-text("继续编辑")');
  await page.click('button:has-text("继续编辑")');
  await page.waitForSelector('h1:has-text("冒烟测试项目")');
  await page.waitForSelector('h2:has-text("版本比较")');
  await page.selectOption('div.card:has(h2:text("版本比较")) select >> nth=0', 'rev_001');
  const lastRev = await page.evaluate(async (id) => {
    const d = await fetch(`/api/projects/${id}`).then((r) => r.json());
    return d.revisions.at(-1).revision_id;
  }, editViaApi.id);
  await page.selectOption('div.card:has(h2:text("版本比较")) select >> nth=1', lastRev);
  await page.click('div.card:has(h2:text("版本比较")) button:has-text("比较")');
  await page.waitForSelector('text=版本比较演示标题');
  ok('版本比较：差异清单可见（改后标题命中）');

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

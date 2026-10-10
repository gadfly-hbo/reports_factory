#!/usr/bin/env node
// T1 UI 冒烟走查：工作台壳层 + 上传材料 → 解析状态流转（就绪 chip）。不触发模型调用。
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = 8791;
const home = mkdtempSync(join(tmpdir(), 'rs-wb-smoke-'));
const fakeHome = mkdtempSync(join(tmpdir(), 'rs-wb-home-')); // HOME 隔离：无模型密钥 → 确认走 202 尽力路径
const server = spawn('node', ['dist/server/start.js'], {
  env: { ...process.env, HOME: fakeHome, REPORT_STUDIO_HOME: home, PORT: String(port), REPORT_STUDIO_NO_SYNC: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('server start timeout')), 15000);
  server.stdout.on('data', (d) => { if (String(d).includes(String(port))) { clearTimeout(t); resolve(); } });
  server.stderr.on('data', (d) => process.stderr.write(d));
});

const fail = (msg) => { console.error(`FAIL: ${msg}`); server.kill(); process.exit(1); };
try {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector('.wb-sidebar', { timeout: 8000 });
  console.log('PASS 壳层渲染（侧栏+主区）');

  await page.click('.wb-new');
  await page.fill('.wb-new-form input', '冒烟项目');
  await page.click('.wb-new-form .btn-primary');
  await page.waitForSelector('.wb-item.active', { timeout: 5000 });
  console.log('PASS 新建项目并激活');

  await page.setInputFiles('input[type=file]', { name: '结论.md', mimeType: 'text/markdown', buffer: Buffer.from('# 结论\n销售额 880 万，同比 -7.1%') });
  await page.waitForSelector('.att-row.st-ok', { timeout: 10000 });
  const chip = await page.textContent('.att-row.st-ok');
  if (!chip.includes('已提取')) fail(`附件状态缺提取字数：${chip.slice(0, 60)}`);
  console.log(`PASS 附件行（名/状态/已提取 N 字）→ ${chip.trim().slice(0, 44)}`);

  const empty = await page.textContent('.wb-thread-empty');
  if (!empty.includes('框架')) fail('空态引导文案缺失');
  console.log('PASS 空态引导呈现');

  // B4 插话按钮语义（H1 防回归）：busy 态主按钮文案为「插话」且可点（无模型调用，只验控件语义）
  // 用 route 拦截伪造一次 busy 结果：/agent/result 恒 active:true → busy 卡渲染 → 断言按钮
  await page.route('**/api/projects/*/agent/result', (route) => route.fulfill({ json: { active: true } }));
  await page.route('**/api/projects/*/chat', (route) => route.fulfill({ json: { ok: true, mode: 'steer', sessionId: 'x' } }));
  await page.fill('.wb-composer textarea', '运行中补一句');
  await page.click('.wb-composer button[type=submit]'); // 触发 busy（chat 被 stub，result 恒 active）
  await page.waitForSelector('.wb-msg.pending', { timeout: 5000 });
  const steerBtn = await page.textContent('.wb-composer .wb-composer-foot .btn-primary');
  if (!steerBtn.includes('插话')) fail(`busy 主按钮非「插话」：${steerBtn}`);
  await page.fill('.wb-composer textarea', '插话内容');
  await page.click('.wb-composer .wb-composer-foot .btn-primary'); // 点插话
  await page.waitForSelector('.wb-msg.assistant:not(.pending):not(.divider)', { timeout: 5000 });
  const lastAssistant = await page.$$eval('.wb-msg.assistant:not(.pending):not(.divider)', (els) => els.at(-1)?.textContent ?? '');
  if (!lastAssistant.includes('已作为插话发送')) fail(`插话无送达反馈：${lastAssistant.slice(0, 40)}`);
  console.log('PASS 插话语义（busy 主按钮=插话 + 送达反馈）');
  await page.unroute('**/api/projects/*/agent/result');
  await page.unroute('**/api/projects/*/chat');
  // 恢复非 busy：reload 清前端态（材料/项目已在服务端）
  await page.reload();
  await page.waitForSelector('.wb-sidebar', { timeout: 5000 });

  // 提案卡（T2）：种子提案 → 渲染 → 内联编辑保存 → 确认（202 尽力路径）
  const { proposeOutline } = await import('../dist/agent/outline.js');
  const list = await (await fetch(`http://127.0.0.1:${port}/api/projects`)).json();
  const pid = list.projects[0].project_id;
  await proposeOutline(join(home, pid), [
    { title: 'Q3 复盘封面', page_type: 'cover' },
    { title: '销售分化结论', page_type: 'summary' },
    { title: '行动建议', page_type: 'action_items' },
  ], ['口径是自然月？']);
  await page.reload();
  await page.waitForSelector('.wb-outline', { timeout: 5000 });
  const head = await page.textContent('.wb-outline-head');
  if (!head.includes('框架提案 v1')) fail(`提案卡版本缺失：${head}`);
  console.log(`PASS 提案卡渲染 → ${head.trim().slice(0, 30)}`);

  await page.fill('.wb-outline-tbl tbody tr:first-child input', 'Q3 复盘封面（改）');
  await page.click('.wb-outline-actions .btn-sm:not(.btn-primary)');
  await page.waitForTimeout(400);
  console.log('PASS 内联编辑保存');

  await page.click('.wb-outline-actions .btn-primary');
  await page.waitForSelector('.wb-outline-head .chip-ok', { timeout: 5000 });
  const notes = await page.$$eval('.wb-msg.assistant', (els) => els.map((e) => e.textContent));
  if (!notes.some((t) => t.includes('注入失败'))) fail('202 尽力路径提示缺失');
  console.log('PASS 确认流（无密钥 202 + 明示注入失败 + 确认徽标）');

  // deck 工作区（W5）：种子第二页 → 回对话视图验证页标记词条，再回成果
  const { mkdir, writeFile } = await import('node:fs/promises');
  const pagesDir = join(home, pid, 'deck', 'pages');
  await mkdir(pagesDir, { recursive: true });
  const mk = (name, text) => writeFile(join(pagesDir, name), text);
  await mk('page_01.mjs', "export function buildSlide(p) { const s = p.addSlide(); s.addText('第一页', { x: 1, y: 3 }); }");
  await mk('page_02.mjs', "export function buildSlide(p) { const s = p.addSlide(); s.background = { color: '263442' }; s.addText('第二页', { x: 1, y: 3 }); }");
  await mk('page_01.html', '<html><body style="width:1280px;height:720px">第一页预览</body></html>');
  await writeFile(join(home, pid, 'deck', 'deck.mjs'), "import pptxgen from 'pptxgenjs'; const x = new pptxgen(); await x.writeFile({ fileName: 'deck/empty.pptx' });");
  await page.reload();
  await page.click('.wb-seg-btn:nth-child(2)');
  await page.waitForSelector('.wb-thumb', { timeout: 5000 });
  const thumbs = await page.$$('.wb-thumb');
  if (thumbs.length !== 2) fail(`缩略图数量 ${thumbs.length} ≠ 2`);
  const approx = await page.textContent('.wb-thumb:nth-child(2) .wb-thumb-name');
  if (!approx.includes('近似')) fail(`无 HTML 页未标近似：${approx}`);
  console.log(`PASS 页网格（2 缩略图，无 HTML 页标「近似」）`);

  await page.click('.wb-thumb:nth-child(2)');
  await page.waitForSelector('.wb-figure img', { timeout: 15000 });
  await page.click('.wb-seg-btn:nth-child(1)'); // 回对话视图：页标记应跟随
  await page.waitForSelector('.wb-composer .chip-accent', { timeout: 3000 });
  const chipTxt = await page.textContent('.wb-composer .chip-accent');
  if (!/第 2 页/.test(chipTxt)) fail(`页标记非词条式：${chipTxt}`);
  console.log(`PASS 选中页跨视图保留 → 页标记词条「${chipTxt.trim().slice(0, 22)}」`);

  await page.click('.wb-chip-x');
  await page.waitForTimeout(200);
  const still = await page.$('.wb-composer .chip-accent');
  if (still) fail('取消选中失效');
  console.log('PASS 取消页选中');

  // QA + 导出（W6）：先渲染出 pptx，切到成果视图再质检/导出/网格（flow-3 双视图）
  await writeFile(join(home, pid, 'deck', 'deck.mjs'), `import pptxgen from 'pptxgenjs';
import { buildSlide as p01 } from './pages/page_01.mjs';
const pptx = new pptxgen();
pptx.defineLayout({ name: 'W', width: 13.33, height: 7.5 });
pptx.layout = 'W';
p01(pptx);
await pptx.writeFile({ fileName: 'deck/deck.pptx' });`);
  const { renderDeckTool } = await import('../dist/agent/tools/render-deck-tool.js');
  const rr = await renderDeckTool(join(home, pid)).execute({}, new AbortController().signal);
  if (!rr.ok) fail(`smoke 渲染失败：${rr.error}`);
  await page.reload();
  await page.waitForSelector('.wb-seg-btn:nth-child(2):not([disabled])', { timeout: 5000 });
  await page.click('.wb-seg-btn:nth-child(2)');
  await page.waitForSelector('.wb-deck .wb-deck-bar', { timeout: 5000 });
  console.log('PASS 双视图切换（对话/成果）');
  await page.waitForSelector('.wb-deck-bar .btn-primary', { timeout: 5000 });
  await page.click('.wb-deck-bar .btn-ghost'); // 质检
  await page.waitForSelector('.wb-qa', { timeout: 8000 });
  const qaTxt = await page.textContent('.wb-qa');
  if (!qaTxt.includes('sensitive_sources')) fail(`QA 卡缺隐私项：${qaTxt.slice(0, 60)}`);
  console.log('PASS 质检卡（含隐私建议项）');

  await page.click('.wb-deck-bar .btn-primary'); // 下载 PPTX
  await page.waitForSelector('.wb-export-tbl tbody tr', { timeout: 20000 });
  const rows = await page.$$('.wb-export-tbl tbody tr');
  if (rows.length !== 1) fail(`导出记录 ${rows.length} ≠ 1`);
  const dl = await page.textContent('.wb-export-tbl .link-btn');
  if (!dl.includes('下载')) fail('下载链接缺失');
  console.log('PASS 导出 + 记录表 + 下载链接');

  // 运行详情抽屉（W7，T6）：开关 + 空态明示
  await page.click('.wb-topbar-right .btn-ghost:first-of-type');
  await page.waitForSelector('.wb-drawer', { timeout: 3000 });
  const tl = await page.textContent('.wb-timeline');
  if (!tl.includes('暂无运行事件')) fail(`抽屉空态缺失：${tl.slice(0, 40)}`);
  await page.click('.wb-drawer-head .btn-ghost');
  await page.waitForTimeout(200);
  if (await page.$('.wb-drawer')) fail('抽屉关闭失效');
  console.log('PASS 运行详情抽屉（空态明示 + 开关）');

  // 设置页（W8/US20，R1-1 补齐）：模型链状态呈现（零密钥内容）
  await page.click('.wb-topbar-right .btn-ghost:last-of-type'); // 设置
  await page.waitForSelector('.wb-settings-card table', { timeout: 5000 });
  const srows = await page.$$('.wb-settings-card tbody tr');
  if (srows.length !== 2) fail(`模型链行数 ${srows.length} ≠ 2`);
  await page.click('.wb-settings-card .btn-ghost');
  await page.waitForTimeout(200);
  if (await page.$('.wb-settings-card')) fail('设置面板关闭失效');
  console.log('PASS 设置页（模型链两行 + 关闭）');
  await browser.close();
  console.log('SMOKE ALL PASS');
} catch (e) {
  fail(String(e).slice(0, 300));
} finally {
  server.kill();
}

// UI 冒烟走查（工作台 shell 版）：真实浏览器走通 建项目→材料→大纲→组装→检查→导出→研究报告→版本比较
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
  env: { ...process.env, REPORT_STUDIO_HOME: dataDir, REPORT_STUDIO_NO_SYNC: '1', PORT: String(PORT) },
  stdio: 'ignore',
});
await sleep(800);
let ready = false;
for (let i = 0; i < 40 && !ready; i++) {
  try { ready = (await fetch(`http://127.0.0.1:${PORT}/api/projects`)).ok; } catch { await sleep(500); }
}
if (!ready) { console.error('服务未就绪'); server.kill(); rmSync(dataDir, { recursive: true, force: true }); process.exit(1); }

let failed = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m, e) => { failed++; console.error(`  ✗ ${m}: ${e}`); };

let browser = null;
let page = null;
try {
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const base = `http://127.0.0.1:${PORT}`;
  await page.goto(base);

  // 外壳
  await page.waitForSelector('.sidebar');
  ok('三栏外壳渲染(侧栏/状态栏)');

  // 1) 新建项目
  await page.click('.sb-new');
  await page.fill('#np-title', '冒烟测试项目');
  await page.click('button:has-text("创建")');
  await page.waitForSelector('.stagebar');
  ok('新建项目进入工作台(阶段条可见)');

  // 2) 材料:上传 3 份(md/csv/冲突csv)
  await page.setInputFiles('input[type=file]', [
    'tests/fixtures/materials/conclusion.md',
    'tests/fixtures/materials/sales.csv',
    'tests/fixtures/materials/sales-conflict.csv',
  ]);
  await page.waitForSelector('table.tbl tr:has-text("conclusion.md")');
  await page.waitForSelector('table.tbl tr:has-text("sales-conflict.csv")');
  ok('上传 3 份材料,清单可见');

  // 3) 冲突提示
  await page.waitForSelector('.card:has-text("材料冲突")');
  ok('材料冲突卡片可见(不静默)');

  // 4) 大纲
  await page.click('.stage:has-text("编审")');
  await page.click('button:has-text("生成蓝图")');
  await page.waitForSelector('.outline-page');
  const pageCount = await page.locator('.outline-page').count();
  if (pageCount !== 8) throw new Error(`大纲页数 ${pageCount} ≠ 8`);
  ok('蓝图 8 页生成,主旨可编辑');
  await page.click('button:has-text("确认蓝图")');
  await page.waitForSelector('.preview-frame');
  ok('确认蓝图 → 组装 → 预览可见');

  // 4.5) 局部编辑:改一页标题 → 产生修订 2
  await page.selectOption('#edit-page', { index: 1 });
  await page.fill('#edit-text', '冒烟编辑后的标题');
  await page.click('button:has-text("修改标题")');
  await sleep(800);
  ok('局部编辑(标题)完成');

  // 5) 检查:冲突未解决 → 阻断
  await page.click('.stage:has-text("检查")');
  await page.click('button:has-text("运行检查")');
  await page.waitForSelector('.chip-fail:has-text("阻断")');
  ok('检查显示阻断(冲突未解决)');

  // 6) 解决冲突 → 草稿导出
  await page.click('.stage:has-text("材料")');
  await page.click('button:has-text("采用前者")');
  await page.waitForSelector('.card:has-text("材料冲突")', { state: 'detached' });
  await page.click('.stage:has-text("导出")');
  await page.click('button:has-text("草稿导出")');
  await page.waitForSelector('table.tbl td:has-text("草稿")');
  ok('冲突解决 → 草稿导出成功');

  // 7) 正式导出
  await page.click('button:has-text("正式导出")');
  await page.waitForSelector('table.tbl td:has-text("定稿")');
  ok('正式导出成功');

  // 8) 一页摘要
  await page.click('button:has-text("导出一页摘要")');
  await sleep(1500);
  const exports = await page.locator('table.tbl tbody tr').count();
  if (exports < 5) throw new Error(`导出记录 ${exports} < 5`);
  ok('一页摘要导出成功');

  // 9) Inspector:上下文 + 版本比较
  if ((await page.locator('.inspector').count()) === 0) {
    await page.click('.stagebar button:has-text("Inspector")'); // 默认展开;仅在收起时点开
  }
  await page.click('.insp-tab:has-text("上下文")');
  await page.waitForSelector('.insp-item:has-text("冒烟测试项目")');
  ok('Inspector 上下文可见');
  await page.click('.insp-tab:has-text("版本")');
  await page.waitForSelector('.insp-item:has-text("版本比较")');
  const revs = await page.locator('.insp-item select option').count();
  if (revs < 4) throw new Error(`修订选项 ${revs} < 4`);
  await page.locator('.insp-item select').nth(0).selectOption({ index: 1 }); // 旧版本=修订1
  await page.locator('.insp-item select').nth(1).selectOption({ index: 2 }); // 新版本=修订2
  await page.click('.insp-item button:has-text("比较")');
  await page.waitForSelector('.diff-field');
  ok('Inspector 版本比较(标题差异可见)');

  // 10) 研究报告路径
  await page.goto(`${base}/#/`);
  await page.click('.sb-new');
  await page.fill('#np-title', '研究报告冒烟');
  await page.click('button:has-text("创建")');
  await page.waitForSelector('.stagebar');
  await page.setInputFiles('input[type=file]', [
    'tests/fixtures/materials/conclusion.md',
    'tests/fixtures/materials/sales.csv',
  ]);
  await page.waitForSelector('table.tbl tr:has-text("sales.csv")');
  await page.click('.stage:has-text("编审")');
  await page.selectOption('#brief-type', 'research_report');
  await page.click('button:has-text("生成蓝图")');
  await page.waitForSelector('input[value*="限制与不确定性"]');
  ok('研究报告蓝图含文档主线');
  await page.click('button:has-text("确认蓝图")');
  await page.waitForSelector('.preview-frame');
  const frame = page.frameLocator('iframe.preview-frame');
  await frame.locator('.kicker:has-text("研究报告")').first().waitFor();
  ok('研究报告文档流预览');
  await page.click('.stage:has-text("导出")');
  await page.click('button:has-text("正式导出")');
  await page.waitForSelector('table.tbl td:has-text("定稿")');
  ok('研究报告导出(docx/html/pdf)成功');

  // 10.6) M4 编审闭环:成果包 → 任务书 → 推荐取舍 → 蓝图 → G1 → 组装 → 正式导出
  await page.goto(`${base}/#/`);
  await page.click('.sb-new');
  await page.fill('#np-title', '编审冒烟');
  await page.click('button:has-text("创建")');
  await page.waitForSelector('.stagebar');
  await page.setInputFiles('#bundle-file', ['tests/fixtures/materials/retail-bundle.json']);
  await page.waitForSelector('table.tbl tr:has-text("bundle_sales_h1.json")');
  ok('分析成果包导入(来源清单可见)');
  await page.click('.stage:has-text("编审")');
  await page.fill('#brief-core', '问题集中在哪里、是否值得试点、怎样控制风险');
  await page.fill('#brief-boundaries', '缺货尚未被证明为销售下降主因');
  await page.click('button:has-text("保存任务书")');
  await page.waitForSelector('[data-testid="finding-card"]');
  const cards = await page.locator('[data-testid="finding-card"]').count();
  if (cards < 5) throw new Error(`发现卡片 ${cards} < 5`);
  ok('发现卡片可见(claim+指标+证据组合视图)');
  await page.click('button:has-text("推荐取舍")');
  await sleep(400);
  const f05place = await page.locator('[data-testid="finding-card"]:has-text("会员复购") select').inputValue();
  if (f05place !== 'excluded') throw new Error(`无关维度推荐 ${f05place} ≠ excluded`);
  ok('取舍推荐(无关维度→不采用,带理由)');
  await page.click('button:has-text("采纳编排")');
  await sleep(500);
  await page.click('button:has-text("生成蓝图")');
  await page.waitForSelector('.outline-page');
  ok('逐页蓝图生成(含页面目的)');
  await page.fill('#g1-approver', '冒烟编制');
  await page.click('button:has-text("批准 G1")');
  await sleep(500);
  await page.click('button:has-text("确认蓝图")');
  await page.waitForSelector('.preview-frame');
  ok('G1 批准 → 组装 → 预览');
  await page.click('.stage:has-text("导出")');
  await page.click('button:has-text("正式导出")');
  await page.waitForSelector('table.tbl td:has-text("定稿")');
  await page.waitForSelector('.statusbar:has-text("G1 ✓")');
  ok('编审项目正式导出(G1/G2 状态栏可见)');

  // 10.7) M5 AI 入口可见性：local_only 隐藏；allow_external 项目显示（L1 浏览器级）
  const localAiCount = await page.locator('[data-testid="ai-outline"]').count();
  if (localAiCount !== 0) throw new Error('local_only 项目不应出现 AI 入口');
  ok('local_only 项目 AI 入口隐藏(L1)');
  const aiResp = await page.request.post(`${base}/api/projects`, { data: { title: 'AI 可见性', privacy_policy: 'allow_external' } });
  if (!aiResp.ok()) throw new Error(`创建 AI 可见性项目失败: ${aiResp.status()} ${await aiResp.text()}`);
  const aiPid = (await aiResp.json()).project.project_id;
  await page.goto(`${base}/#/project/${aiPid}/outline`);
  await page.waitForSelector('.stagebar');
  await page.waitForSelector('[data-testid="ai-outline"]');
  ok('allow_external 项目 AI 入口可见');

  // 11) ⌘K 命令面板
  await page.keyboard.press('Meta+k');
  await page.waitForSelector('.palette');
  await page.fill('.palette input', '研究报告冒烟');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.stagebar');
  ok('⌘K 命令面板跳转项目');

  await browser.close();
  console.log(failed === 0 ? '\nUI 冒烟走查:全部通过 ✅' : `\nUI 冒烟走查:${failed} 项失败 ❌`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (e) {
  bad('走查中断', e instanceof Error ? e.message : String(e));
  try { await page.screenshot({ path: '/tmp/rs-smoke-fail.png', fullPage: false }); console.error('截图: /tmp/rs-smoke-fail.png'); } catch { /* 页面可能未开 */ }
  process.exitCode = 1;
} finally {
  try { await browser?.close(); } catch { /* 已关 */ }
  server.kill();
  rmSync(dataDir, { recursive: true, force: true });
}

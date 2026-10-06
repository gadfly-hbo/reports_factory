// M7 视觉验收截图:主路径三步（生成/编辑/审批导出）+ 高级折叠 + 命令面板 → /tmp/rs-m7-shots/
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = 8793;
const OUT = '/tmp/rs-m7-shots';
mkdirSync(OUT, { recursive: true });
rmSync(`${OUT}/.keep`, { force: true });
const dataDir = mkdtempSync(join(tmpdir(), 'rs-m7-'));
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
const MAT = 'tests/fixtures/materials';
const b64 = async (f) => (await readFile(join(MAT, f))).toString('base64');

// 准备项目：建项目 + 传两份材料
const createRes = await fetch(`${base}/api/projects`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'Q3 经营复盘（M7 视觉验收）', purpose: '季度经营例会', template_id: 'ops_review_deck' }),
}).then((r) => r.json());
const pid = createRes.project.project_id;
for (const f of [
  { filename: 'conclusion.md', kind: 'markdown', media_type: 'text/markdown' },
  { filename: 'sales.csv', kind: 'csv', media_type: 'text/csv' },
]) {
  await fetch(`${base}/api/projects/${pid}/sources`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: f.filename, content_base64: await b64(f.filename), kind: f.kind, media_type: f.media_type }),
  });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const shot = async (name) => {
  await page.evaluate(() => document.getElementById('main')?.scrollTo(0, 0));
  await sleep(250);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('shot:', name);
};

// 01 主路径第一步：生成页（表单 + 材料摘要 + 模版结构）
await page.goto(`${base}/#/project/${pid}/generate`);
await sleep(600);
await page.fill('#gen-purpose', 'Q3 经营复盘：重点门店承压与补货试点');
await shot('01-generate-form');

// 02 生成进度（local_only → 规则版回退路径，进度卡 + 明示）
await page.click('[data-testid="generate-now"]');
await sleep(1800);
await shot('02-generate-progress');

// 03 主路径第二步：编辑页（成稿 + 单页编辑操作）
await page.click('[data-testid="goto-edit"]');
await sleep(1200);
await shot('03-edit');

// 04 主路径第三步：审批导出（G1 关口 + 体检卡 + 导出选项）
await page.goto(`${base}/#/project/${pid}/export`);
await sleep(800);
await shot('04-export-approval');

// 05 高级折叠组展开（侧栏）
await page.click('[data-testid="advanced-toggle"]');
await sleep(300);
await shot('05-sidebar-advanced');

// 06 命令面板（主路径/高级跳转）
await page.click('.sb-search');
await sleep(300);
await shot('06-palette');

await browser.close();
server.kill();
rmSync(dataDir, { recursive: true, force: true });
console.log('done →', OUT);

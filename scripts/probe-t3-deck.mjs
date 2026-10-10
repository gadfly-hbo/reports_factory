#!/usr/bin/env node
// 红队#1 最便宜测试（T3 验收）：真调端到端样张。
// 上传样例材料 → 对话 → 框架提案 → 确认注入 → agent 自主写 deck → render_deck → deck.pptx 校验。
// 真实 Provider 调用（minimax 主链）；不进 CI。用法：node scripts/probe-t3-deck.mjs [页数上限提示]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

const port = 8793;
const home = mkdtempSync(join(tmpdir(), 'rs-t3-probe-'));
const server = spawn('node', ['dist/server/start.js'], {
  env: { ...process.env, REPORT_STUDIO_HOME: home, PORT: String(port), REPORT_STUDIO_NO_SYNC: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('server start timeout')), 20000);
  server.stdout.on('data', (d) => { if (String(d).includes(String(port))) { clearTimeout(t); resolve(); } });
});
const fail = (msg) => { console.error(`FAIL: ${msg}`); server.kill(); process.exit(1); };
const api = async (path, init) => {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
};
const post = (path, body) => api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });

// 等待本轮结束（最长 ms）；期间报告 deck 产物出现
async function waitResult(pid, label, maxMs) {
  const started = Date.now();
  for (;;) {
    if (Date.now() - started > maxMs) fail(`${label} 超时（${Math.round(maxMs / 1000)}s）`);
    const { body } = await api(`/api/projects/${pid}/agent/result`);
    const deck = await api(`/api/projects/${pid}/deck`);
    if (deck.body.pptx) console.log(`  [${label}] deck.pptx 出现（${Math.round(deck.body.pptx.bytes / 1024)}KB，${Math.round((Date.now() - started) / 1000)}s）`);
    if (!body.active) return body;
    await new Promise((r) => setTimeout(r, 3000));
  }
}

try {
  const created = await post('/api/projects', { title: 'T3 真调样张' });
  const pid = created.body.project.project_id;
  console.log(`PASS 项目创建 ${pid}`);

  const md = await readFile('tests/fixtures/materials/m10-understand-fixture.md', 'utf-8');
  const up = await post(`/api/projects/${pid}/sources`, { filename: 'q3-运营材料.md', content_base64: Buffer.from(md).toString('base64'), kind: 'markdown' });
  if (up.body.material?.status !== 'ready') fail(`材料未就绪：${JSON.stringify(up.body).slice(0, 200)}`);
  console.log('PASS 材料上传并提取就绪');

  const sent = await post(`/api/projects/${pid}/chat`, { text: '根据材料做一份零售门店 Q3 经营复盘 PPT（5 页左右），先给我框架提案。' });
  if (!sent.body.ok) fail(`chat 失败：${JSON.stringify(sent.body)}`);
  const r1 = await waitResult(pid, '框架轮', 8 * 60_000);
  if (r1.status !== 'succeeded') fail(`框架轮失败：${r1.reason}`);

  const outline = (await api(`/api/projects/${pid}/outline`)).body;
  if (!outline.current) fail('无框架提案');
  console.log(`PASS 框架提案 v${outline.current.version}（${outline.current.pages.length} 页）: ${outline.current.pages.map((p) => p.title).join(' / ').slice(0, 120)}`);
  if (outline.current.questions.length) console.log(`  澄清问题：${outline.current.questions.join(' | ')}（无人值守 probe → 直接确认）`);

  const confirm = await post(`/api/projects/${pid}/outline/confirm`);
  if (!confirm.body.confirmed) fail('确认失败');
  if (!confirm.body.injected) fail(`确认注入失败：${confirm.body.inject_error}`);
  console.log('PASS 确认注入，agent 自主生成中…');

  const r2 = await waitResult(pid, '生成轮', 20 * 60_000);
  if (r2.status !== 'succeeded') fail(`生成轮失败：${r2.reason}`);

  const deck = (await api(`/api/projects/${pid}/deck`)).body;
  if (!deck.pptx) fail('生成轮结束但无 deck.pptx');
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await readFile(join(home, pid, 'deck', 'deck.pptx')));
  const slides = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  const texts = [];
  for (const n of slides) {
    const xml = await zip.files[n].async('string');
    texts.push(...[...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]));
  }
  const emoji = texts.filter((t) => /\p{Extended_Pictographic}/u.test(t));
  if (emoji.length) fail(`发现 emoji：${emoji[0]}`);
  console.log(`PASS deck.pptx 校验：${slides.length} slide / ${texts.length} 文本框 / 0 emoji / ${deck.pages.filter((p) => p.preview_ready).length} 页预览`);

  // 视觉抽查：截图第一页预览（若有）
  const withPreview = deck.pages.find((p) => p.preview_ready);
  if (withPreview) {
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
    await page.goto(`http://127.0.0.1:${port}/api/projects/${pid}/deck/preview/${withPreview.name}`);
    await page.screenshot({ path: '/tmp/rs-t3-preview.png' });
    await browser.close();
    console.log(`PASS 预览路由截图 → /tmp/rs-t3-preview.png（${withPreview.name}）`);
  }
  console.log('T3 真调样张 ALL PASS');
} catch (e) {
  fail(String(e).slice(0, 300));
} finally {
  server.kill();
}

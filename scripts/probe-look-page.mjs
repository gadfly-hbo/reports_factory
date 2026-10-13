#!/usr/bin/env node
// B2 效果验证实验（flow-13，真调不进 CI）：look_page 盲测——8 夹具页走生产截图管线，
// 主链模型带图真调裁决（镜像 skill 检查单），评分召回/误报。
// 用法：node scripts/probe-look-page.mjs [--dry] [--limit N]
//   --dry   只跑截图管线自检（页数/字节数），不发模型调用
//   --limit 只跑前 N 页（调试用）
// 先 npm run build（脚本依赖 dist/）。
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { candidateChain } from '../dist/agent/model.js';
import { shootHtmlJpeg } from '../dist/agent/deck-preview.js';

const dry = process.argv.includes('--dry');
const limitIdx = process.argv.indexOf('--limit');
const limit = limitIdx > 0 ? Number(process.argv[limitIdx + 1]) : Infinity;

const FIXTURE_DIR = join(import.meta.dirname, '..', 'tests', 'fixtures', 'look-page');
// 镜像 assets/skills/ppt/SKILL.md look_page 检查单原文（G1：不重述归纳）
const PROMPT = [
  '你是 PPT 排版质检员，检查这页幻灯片的截图。检查项：文字遮挡、溢出边界、对齐、留白失衡、字号过小。',
  '有问题：第一行输出 VERDICT: BAD，随后逐条列出问题；',
  '没问题：第一行输出 VERDICT: GOOD，随后一句话说明布局状况。',
].join('');

const parseVerdict = (text) => /VERDICT:\s*(GOOD|BAD)/i.exec(text)?.[1]?.toUpperCase() ?? null;

const files = (await readdir(FIXTURE_DIR)).filter((f) => f.endsWith('.html')).sort();
if (files.length !== 8) { console.error(`FAIL: 夹具应为 8 页，实得 ${files.length}`); process.exit(1); }
const fixtures = files.map((f) => ({ name: f.replace('.html', ''), expected: f.startsWith('bad-') ? 'BAD' : 'GOOD' })).slice(0, Number.isFinite(limit) ? limit : 8);

const shots = new Map();
for (const f of fixtures) {
  const html = await readFile(join(FIXTURE_DIR, f.name + '.html'), 'utf-8');
  shots.set(f.name, await shootHtmlJpeg(html));
}
const kb = (b) => `${Math.round(b.length / 1024)}KB`;
console.log(`截图管线：${fixtures.length} 页 -> ${[...shots.values()].map(kb).join(', ')}`);
if (dry) { console.log('DRY OK（未发模型调用）'); process.exit(0); }

let chain;
try { chain = candidateChain(); } catch (e) { console.error('FAIL: 模型链不可用：', e.message); process.exit(1); }
const cand = chain[0];
console.log(`判定模型：${cand.model.provider}/${cand.model.id}`);

const call = async (name, isRetry = false) => {
  const reply = await cand.transport({
    model: cand.model,
    messages: [{ role: 'user', text: PROMPT, images: [{ mimeType: 'image/jpeg', data: shots.get(name).toString('base64') }] }],
    maxOutputTokens: 1024,
    signal: AbortSignal.timeout(120_000),
  });
  const text = reply.content.filter((b) => b.kind === 'text').map((b) => b.text).join('').trim();
  const verdict = parseVerdict(text);
  // G5：不可解析重试一次（重试仍不可解析 → 该轮 inconclusive）
  if (verdict === null && !isRetry) return call(name, true);
  return { verdict, text, usage: reply.usage };
};

// 预检早退（K1）：首张带图真调 sanity
const sanity = await call(fixtures[0].name).catch((e) => ({ error: String(e).slice(0, 200) }));
if (sanity.error || !sanity.text) { console.error(`FAIL: 预检带图调用失败——${sanity.error ?? '空回复'}`); process.exit(1); }
console.log(`预检 OK：${fixtures[0].name} -> ${sanity.verdict ?? '(未解析)'} in=${sanity.usage.inputTokens} out=${sanity.usage.outputTokens}`);

// 稳定性预检（K3）：好页 ×2，翻转则全量每页 ×2 取多数（limit 截断后无好页则跳过）
const probe = fixtures.find((f) => f.expected === 'GOOD');
const s1 = probe ? await call(probe.name) : null;
const s2 = probe ? await call(probe.name) : null;
const repeat = !probe ? false : s1.verdict !== s2.verdict;
console.log(probe ? `稳定性：${probe.name} 两次 ${s1.verdict ?? '?'}/${s2.verdict ?? '?'} -> ${repeat ? '翻转，全量 ×2 取多数' : '稳定，每页 ×1'}` : '稳定性：limit 截断后无好页，跳过预探（每页 ×1）');

const results = [];
for (const f of fixtures) {
  const rounds = repeat ? [await call(f.name), await call(f.name)] : [await call(f.name)];
  const verdicts = rounds.map((r) => r.verdict);
  const bad = verdicts.filter((v) => v === 'BAD').length;
  const good = verdicts.filter((v) => v === 'GOOD').length;
  const verdict = bad > good ? 'BAD' : good > bad ? 'GOOD' : null; // 平票/未解析 -> inconclusive
  const first = rounds.find((r) => r.verdict) ?? rounds[0];
  results.push({ ...f, verdict, verdicts, reason: first.text.slice(0, 220).replace(/\n/g, ' ⏎ ') });
  console.log(`${f.name.padEnd(18)} 期望=${f.expected} 裁决=${verdict ?? 'INCONCLUSIVE'}（${verdicts.join('/')}）`);
  console.log(`  ${results.at(-1).reason}`);
}

const badPages = results.filter((r) => r.expected === 'BAD');
const goodPages = results.filter((r) => r.expected === 'GOOD');
const recall = badPages.filter((r) => r.verdict === 'BAD').length;
const fp = goodPages.filter((r) => r.verdict === 'BAD').length;
const inconclusive = results.filter((r) => r.verdict === null);
// G5：inconclusive 排除出分母单列（重试后仍不可解析才可能出现在此处）
const badScored = badPages.length - inconclusive.filter((r) => r.expected === 'BAD').length;
const goodScored = goodPages.length - inconclusive.filter((r) => r.expected === 'GOOD').length;
console.log(`\n评分：召回 ${recall}/${badPages.length}（可解析分母 ${badScored}）  误报 ${fp}/${goodPages.length}（可解析分母 ${goodScored}）  inconclusive ${inconclusive.length}${inconclusive.length ? '：' + inconclusive.map((r) => r.name).join('、') : ''}`);
if (recall >= 3 && fp === 0) console.log('决策规则：机制有效（召回 ≥3/4 且误报 0）——证据落盘');
else if (recall <= 2) console.log('决策规则：机制不可靠（召回 ≤2/4）——实施 layout_budget 预检兜底');
else console.log('决策规则：中间态/误报>0——记录 + 校准建议');

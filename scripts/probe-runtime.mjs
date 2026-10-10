#!/usr/bin/env node
// S1 验收：经 pi-agent-runtime createPiTransport 直调主备供应商（各 1 轮真调，单轮短输出）。
// 用法：node scripts/probe-runtime.mjs [all|minimax|xiaomi]
import { candidateChain } from '../dist/agent/model.js';

const only = process.argv[2] ?? 'all';
let chain;
try {
  chain = candidateChain();
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}

const nameOf = (c) => `${c.model.provider}/${c.model.id}`;
const targets = chain.filter((c) => only === 'all' || c.model.provider.startsWith(only));
if (targets.length === 0) {
  console.error(`SKIP: 无匹配候选（${chain.map(nameOf).join(', ') || '链为空'}）`);
  process.exit(0);
}

let failed = 0;
for (const c of targets) {
  const started = Date.now();
  try {
    const reply = await c.transport({
      model: c.model,
      messages: [{ role: 'user', text: '只输出两个字：正常' }],
      maxOutputTokens: 512,
      signal: AbortSignal.timeout(120_000),
    });
    const text = reply.content.filter((b) => b.kind === 'text').map((b) => b.text).join('').trim();
    console.log(`PASS ${nameOf(c)} stop=${reply.stop} in=${reply.usage.inputTokens} out=${reply.usage.outputTokens} ${((Date.now() - started) / 1000).toFixed(1)}s text=${text.slice(0, 40)}`);
  } catch (e) {
    failed += 1;
    console.error(`FAIL ${nameOf(c)} ${((Date.now() - started) / 1000).toFixed(1)}s: ${String(e).slice(0, 200)}`);
  }
}
process.exit(failed > 0 ? 1 : 0);

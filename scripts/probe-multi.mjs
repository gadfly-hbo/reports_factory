import { argv, exit } from 'node:process';
import { LlmStageClient } from '/Users/bendandebaba/DevWorkSpace/Projects/reports-factory/dist/model/client.js';
import { piTransport } from '/Users/bendandebaba/DevWorkSpace/Projects/reports-factory/dist/model/pi-transport.js';
import { z } from 'zod';
const args = argv.slice(2);
const arg = (n, f) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : f; };
const provider = arg('provider'); const modelId = arg('model');
if (!provider || !modelId) { console.error('--provider --model [--api --base-url]'); exit(1); }
const cfg = { provider, modelId, ...(arg('api') ? { api: arg('api'), baseUrl: arg('base-url') } : {}) };
const Turn = z.object({
  summary: z.string().min(8),
  action: z.string().min(8),
  refs_prev: z.array(z.string()).default([]),
});
const SYSTEM = `你是招聘助手。基于上下文给结构化判断。回答必须输出 JSON：
{"summary":"≥8字摘要","action":"≥8字建议","refs_prev":["引用上轮的关键词"]}
无上文时 refs_prev 为空数组。`;
const TURNS = [
  '我上周面试了一个 Python 后端候选人。给我评估。',
  '如果对方主要做 Go 呢？',
  '回到第一个候选人的事，他最薄弱的一面是什么？',
  '总结：第一个候选人该不该发 offer？',
];
const client = new LlmStageClient({ transport: piTransport({ timeoutMs: 120000 }), chain: [cfg], timeoutMs: 120000 });
let nOk = 0, refOk = 0;
const prev = [];
const startedAt = Date.now();
for (let i = 0; i < TURNS.length; i++) {
  const ctx = prev.length > 0 ? `上文摘要：${prev.join(' | ')}\n本轮问：${TURNS[i]}` : TURNS[i];
  const t0 = Date.now();
  try {
    const r = await client.complete({ stage: 'multi', callKey: `multi-${provider}-${modelId}-${i}`, system: SYSTEM, user: ctx, schema: Turn });
    nOk += 1;
    const refs = r.output.refs_prev ?? [];
    const ok = refs.length >= 1 && refs.some((x) => prev.some((p) => p.includes(x) || x.includes(p)));
    if (ok) refOk += 1;
    prev.push(r.output.summary);
    console.log(`  turn${i + 1} [${Date.now() - t0}ms, refOk=${ok}]: summary="${r.output.summary.slice(0, 50)}..." refs=${refs.length}`);
  } catch (e) {
    console.log(`  ✗ turn${i + 1}: ${String(e).slice(0, 160)}`);
  }
}
console.log(`== ${provider}/${modelId}: schema ${nOk}/${TURNS.length}, refs ${refOk}/${TURNS.length - 1} | ${((Date.now() - startedAt) / 1000).toFixed(1)}s ==`);

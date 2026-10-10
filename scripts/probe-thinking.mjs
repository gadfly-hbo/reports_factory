#!/usr/bin/env node
// U0：thinking=medium 真调验证（M3 主链 + mimo 备链，各 1 轮）。不进 CI。
import { createPiTransport } from 'pi-agent-runtime';
import { MINIMAX_M3, MIMO_FLASH, envKeyFor } from '../dist/agent/model.js';

const ask = '9.11 和 9.9 哪个大？先思考再一句话回答。';
let failed = 0;
for (const base of [MINIMAX_M3, MIMO_FLASH]) {
  const model = { ...base, reasoning: true }; // pi 注册表全系 reasoning=true；本 probe 实证
  const apiKey = process.env[envKeyFor(model.provider)];
  if (!apiKey) { console.log(`SKIP ${model.provider}/${model.id}（无密钥）`); continue; }
  const t0 = Date.now();
  try {
    const transport = createPiTransport({ model, apiKey });
    const reply = await transport({
      model,
      messages: [{ role: 'user', text: ask }],
      maxOutputTokens: 2048,
      thinkingLevel: 'medium',
      signal: AbortSignal.timeout(180_000),
    });
    const text = reply.content.filter((b) => b.kind === 'text').map((b) => b.text).join('').trim();
    console.log(`PASS ${model.provider}/${model.id} thinking=medium ${((Date.now() - t0) / 1000).toFixed(1)}s in=${reply.usage.inputTokens} out=${reply.usage.outputTokens} text=${text.slice(0, 60)}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${model.provider}/${model.id} ${((Date.now() - t0) / 1000).toFixed(1)}s: ${String(e).slice(0, 200)}`);
  }
}
process.exit(failed > 0 ? 1 : 0);

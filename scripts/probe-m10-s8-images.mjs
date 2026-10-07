import { LlmStageClient, chainFromEnv, DEFAULT_TIMEOUT_MS } from '../dist/model/client.js';
import { piTransport } from '../dist/model/pi-transport.js';
import { z } from 'zod';
import { readFileSync } from 'node:fs';

const PNG_PATH = 'tests/fixtures/materials/m10-understand-fixture.md'; // 仅作占位
// 用 1x1 PNG（128 base64）
const PNG = readFileSync('tests/agent-kernel.test.ts', 'utf-8').length > 0
  ? 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  : 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const ShapeSchema = z.object({ color: z.string(), shape: z.string() });
const transport = piTransport({ timeoutMs: 300_000 });

async function probe(provider, modelId, extra) {
  const cfg = { provider, modelId, ...(extra ? { api: 'openai-completions', baseUrl: 'https://token-plan-cn.xiaomimimo.com/v1' } : {}) };
  const client = new LlmStageClient({ transport, chain: [cfg], timeoutMs: DEFAULT_TIMEOUT_MS });
  try {
    const outcome = await client.complete({
      stage: 'vision-probe', callKey: `vision:${provider}:${modelId}`,
      system: '你是视觉助手。看图后用 JSON 回答：{"color":"主色","shape":"形状"}。只用 JSON。',
      user: '图是什么形状？主色？',
      images: [{ data: PNG, mimeType: 'image/png' }],
      schema: ShapeSchema,
    });
    console.log(`${provider}/${modelId}: ${JSON.stringify(outcome.output)} cost=${outcome.cost}`);
    return true;
  } catch (e) { console.log(`${provider}/${modelId}: FAIL — ${e instanceof Error ? e.message.slice(0, 80) : 'unknown'}`); return false; }
}

const r1 = await probe('minimax-cn', 'MiniMax-M3', false);
const r2 = await probe('xiaomi-token-plan-cn', 'mimo-v2.6-flash', true);
const ok = r1 && r2;
void chainFromEnv; void ShapeSchema; void PNG_PATH;
process.exit(ok ? 0 : 1);

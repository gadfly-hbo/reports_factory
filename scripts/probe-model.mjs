// S1 模型探针（手动，不进测试/CI）：对指定 provider/model 发固定合成任务，测连通性与 schema 遵从率。
// 用法（密钥经 with-model-env.sh 注入，不落仓）：
//   npm run build && scripts/with-model-env.sh node scripts/probe-model.mjs \
//     --provider minimax-cn --model MiniMax-M2.7 --runs 3 [--out tests/fixtures/recordings/s1-probe.json]
// 合成任务 = fixtures 内嵌清单（无任何真实业务数据），录制文件可安全入库供 replay 测试。
import { argv, exit } from 'node:process';
import { writeFileSync } from 'node:fs';
import { LlmStageClient } from '../dist/model/client.js';
import { piTransport } from '../dist/model/pi-transport.js';
import { recordingTransport, saveRecordings } from '../dist/model/recording.js';
import { PROBE_SYSTEM, PROBE_USER, ProbeSchema } from '../dist/model/probe-task.js';

const args = argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const provider = arg('provider');
const modelId = arg('model');
if (!provider || !modelId) {
  console.error('用法：node scripts/probe-model.mjs --provider <p> --model <m> [--runs N] [--out <path>] [--api a] [--base-url u]');
  exit(1);
}
const runs = Number(arg('runs', 3));
const out = arg('out');

// 合成任务：从给定候选中挑与目标最相关的一项（纯 fixture 词汇，与 replay 测试共享）
const SYSTEM = PROBE_SYSTEM;
const USER = PROBE_USER;
const PickSchema = ProbeSchema;

const cfg = { provider, modelId, ...(arg('api') ? { api: arg('api'), baseUrl: arg('base-url') } : {}) };
const calls = [];
const live = piTransport({ timeoutMs: 120_000 });
const transport = out ? recordingTransport(live, { push: (c) => calls.push(c) }, { synthetic: true }) : live;
const client = new LlmStageClient({ transport, chain: [cfg], timeoutMs: 120_000 });

let schemaOk = 0;
for (let i = 0; i < runs; i++) {
  const started = Date.now();
  try {
    const r = await client.complete({ stage: 'probe', callKey: `probe-${provider}-${modelId}-${i}`, system: SYSTEM, user: USER, schema: PickSchema });
    schemaOk += 1;
    console.log(`  ✓ run${i + 1}: ${JSON.stringify(r.output)} cost=${r.cost} ${Date.now() - started}ms`);
  } catch (e) {
    console.log(`  ✗ run${i + 1}: ${String(e.message).slice(0, 160)} ${Date.now() - started}ms`);
  }
}
console.log(`== ${provider}/${modelId}: schema 遵从 ${schemaOk}/${runs} ==`);
if (out) {
  await saveRecordings(out, calls);
  console.log(`录制已写入 ${out}（合成数据，可入库）`);
}

// M10 S4 框架生成录制（手动）：理解走 S3 夹具回放（保证摘要一致），框架真调录制。
// 用法：npm run build && scripts/with-model-env.sh node scripts/record-m10-s4.mjs
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { WorkspaceStore } from '../dist/storage/workspace.js';
import { ingestAndSave } from '../dist/ingest/persist.js';
import { WorkbenchService } from '../dist/server/workbench.js';
import { LlmStageClient, chainFromEnv, DEFAULT_TIMEOUT_MS } from '../dist/model/client.js';
import { piTransport } from '../dist/model/pi-transport.js';
import { recordingTransport, loadRecordings, saveRecordings } from '../dist/model/recording.js';

const S3 = 'tests/fixtures/recordings/m10-s3-understand.json';
const OUT = 'tests/fixtures/recordings/m10-s4-framework.json';
const dir = mkdtempSync(join(tmpdir(), 'rs-rec4-'));
const store = new WorkspaceStore(dir);
const p0 = await store.createProject({ title: '理解测试' }); // 与 understand.test.ts 的项目名一致（payload 一致性）
await store.updateProject(p0.project_id, { privacy_policy: 'allow_external' });
const mat = readFileSync('tests/fixtures/materials/m10-understand-fixture.md', 'utf-8');
await ingestAndSave(store, p0.project_id, { filename: 'm10-understand-fixture.md', content: Buffer.from(mat, 'utf-8'), kind: 'markdown', media_type: 'text/markdown' });

// 理解：回放 S3 夹具（摘要内容与测试运行时一致）
const replayTransportU = (await import('../dist/model/recording.js')).replayTransport(await loadRecordings(S3));
const clientReplay = new LlmStageClient({ transport: replayTransportU, chain: chainFromEnv(), timeoutMs: DEFAULT_TIMEOUT_MS });
const wb = new WorkbenchService(store);
const u = await wb.understandAllPending(p0.project_id, { client: clientReplay });
console.log('understanding done:', u.done.length, 'failed:', u.failed.length);

// 框架：真调录制
const calls = [];
const live = piTransport({ timeoutMs: 300_000 });
const transport = recordingTransport(live, { push: (c) => calls.push(c) }, { synthetic: true });
const clientLive = new LlmStageClient({ transport, chain: chainFromEnv(), timeoutMs: DEFAULT_TIMEOUT_MS });
const fw = await wb.generateFramework(p0.project_id, { client: clientLive });
console.log('framework pages:', fw.pages.length, '|', fw.pages.map((p) => p.title).join(' / ').slice(0, 120));
const prior = await loadRecordings(OUT).catch(() => []);
await saveRecordings(OUT, [...prior, ...calls]);
console.log('saved to', OUT, 'total:', prior.length + calls.length);

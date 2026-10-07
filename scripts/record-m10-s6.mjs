// M10 S6 agent 改写录制（手动）：前三夹具回放到生成态，单页改写真调录制。
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { WorkspaceStore } from '../dist/storage/workspace.js';
import { ingestAndSave } from '../dist/ingest/persist.js';
import { WorkbenchService } from '../dist/server/workbench.js';
import { LlmStageClient, chainFromEnv, DEFAULT_TIMEOUT_MS } from '../dist/model/client.js';
import { piTransport } from '../dist/model/pi-transport.js';
import { recordingTransport, replayTransport, loadRecordings, saveRecordings } from '../dist/model/recording.js';

const OUT = 'tests/fixtures/recordings/m10-s6-rewrite.json';
const dir = mkdtempSync(join(tmpdir(), 'rs-rec6-'));
const store = new WorkspaceStore(dir);
const p0 = await store.createProject({ title: '理解测试' });
await store.updateProject(p0.project_id, { privacy_policy: 'allow_external' });
const mat = readFileSync('tests/fixtures/materials/m10-understand-fixture.md', 'utf-8');
await ingestAndSave(store, p0.project_id, { filename: 'm10-understand-fixture.md', content: Buffer.from(mat, 'utf-8'), kind: 'markdown', media_type: 'text/markdown' });
const recordings = (await Promise.all([
  loadRecordings('tests/fixtures/recordings/m10-s3-understand.json'),
  loadRecordings('tests/fixtures/recordings/m10-s4-framework.json'),
  loadRecordings('tests/fixtures/recordings/m10-s5-pages.json'),
])).flat();
const clientReplay = new LlmStageClient({ transport: replayTransport(recordings), chain: chainFromEnv(), timeoutMs: DEFAULT_TIMEOUT_MS });
const wb = new WorkbenchService(store);
await wb.understandAllPending(p0.project_id, { client: clientReplay });
await wb.generateFramework(p0.project_id, { client: clientReplay });
await wb.confirmFramework(p0.project_id);
const gen = await wb.generatePages(p0.project_id, {}, { client: clientReplay });
console.log('gen done:', gen.done, 'states:', JSON.stringify(gen.states));
const wdbg = await wb.readWork(p0.project_id);
console.log('work.pages keys:', JSON.stringify(Object.keys(wdbg.pages ?? {})));
console.log('framework ids:', JSON.stringify((wdbg.framework?.pages ?? []).map((p) => p.page_id)));

const calls = [];
const live = piTransport({ timeoutMs: 300_000 });
const transport = recordingTransport(live, { push: (c) => calls.push(c) }, { synthetic: true });
const clientLive = new LlmStageClient({ transport, chain: chainFromEnv(), timeoutMs: DEFAULT_TIMEOUT_MS });
const before = (await wb.readWork(p0.project_id)).pages['page_02'];
const next = await wb.rewritePage(p0.project_id, 'page_02', '这页强调环比变化而不是绝对值，语气更克制', { client: clientLive });
console.log('before headline:', before.headline);
console.log('after  headline:', next.headline);
import { unlinkSync } from 'node:fs'; try { unlinkSync(OUT); } catch {}; const prior = [];
await saveRecordings(OUT, [...prior, ...calls]);
console.log('saved:', OUT, 'total:', prior.length + calls.length);

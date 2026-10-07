// M10 S3 理解调用录制（手动，不进 CI）：合成 fixture 材料一次性真调录制，测试离线重放。
// 用法：npm run build && scripts/with-model-env.sh node scripts/record-m10-s3.mjs
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { WorkspaceStore } from '../dist/storage/workspace.js';
import { ingestAndSave } from '../dist/ingest/persist.js';
import { WorkbenchService } from '../dist/server/workbench.js';
import { LlmStageClient, chainFromEnv, DEFAULT_TIMEOUT_MS } from '../dist/model/client.js';
import { piTransport } from '../dist/model/pi-transport.js';
import { recordingTransport, loadRecordings, saveRecordings } from '../dist/model/recording.js';

const OUT = 'tests/fixtures/recordings/m10-s3-understand.json';
const dir = mkdtempSync(join(tmpdir(), 'rs-rec-'));
const store = new WorkspaceStore(dir);
const project0 = await store.createProject({ title: '录制夹具' });
const project = await store.updateProject(project0.project_id, { privacy_policy: 'allow_external' });
const mat = readFileSync('tests/fixtures/materials/m10-understand-fixture.md', 'utf-8');
const src = await ingestAndSave(store, project.project_id, {
  filename: 'm10-understand-fixture.md',
  content: Buffer.from(mat, 'utf-8'),
  kind: 'markdown',
  media_type: 'text/markdown',
});
const prior = await loadRecordings(OUT).catch(() => []);
const calls = [];
const live = piTransport({ timeoutMs: 300_000 });
const transport = recordingTransport(live, { push: (c) => calls.push(c) }, { synthetic: true });
const client = new LlmStageClient({ transport, chain: chainFromEnv(), timeoutMs: DEFAULT_TIMEOUT_MS });
const wb = new WorkbenchService(store);
const understanding = await wb.understandSource(project.project_id, src.source_id, { client });
console.log('points:', understanding.points.length, 'uncovered:', understanding.uncovered, 'gist:', understanding.gist.slice(0, 60));
await saveRecordings(OUT, [...prior, ...calls]);
console.log('saved to', OUT, 'total calls:', prior.length + calls.length);

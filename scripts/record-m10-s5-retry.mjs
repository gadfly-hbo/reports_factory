// S5 反复打直到 ≥6 页全 done；附录页容易 schema 失配，分页重打
import { mkdtempSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { WorkspaceStore } from '../dist/storage/workspace.js';
import { ingestAndSave } from '../dist/ingest/persist.js';
import { WorkbenchService } from '../dist/server/workbench.js';
import { LlmStageClient, chainFromEnv, DEFAULT_TIMEOUT_MS } from '../dist/model/client.js';
import { piTransport } from '../dist/model/pi-transport.js';
import { recordingTransport, replayTransport, loadRecordings, saveRecordings } from '../dist/model/recording.js';

process.env['REPORT_STUDIO_BUDGET_MAX_CALLS'] = '400';
const S3 = 'tests/fixtures/recordings/m10-s3-understand.json';
const S4 = 'tests/fixtures/recordings/m10-s4-framework.json';
const OUT = 'tests/fixtures/recordings/m10-s5-pages.json';
try { unlinkSync(OUT); } catch {}

const mat = readFileSync('tests/fixtures/materials/m10-understand-fixture.md', 'utf-8');
const recordings = (await Promise.all([loadRecordings(S3), loadRecordings(S4)])).flat();
const clientReplay = new LlmStageClient({ transport: replayTransport(recordings), chain: chainFromEnv(), timeoutMs: DEFAULT_TIMEOUT_MS });
const live = piTransport({ timeoutMs: 300_000 });

async function tryRun() {
  for (let i = 0; i < 4; i++) {
    const dir = mkdtempSync(join(tmpdir(), `rs-rec5r-${i}-`));
    const store = new WorkspaceStore(dir);
    const p0 = await store.createProject({ title: '理解测试' });
    await store.updateProject(p0.project_id, { privacy_policy: 'allow_external' });
    await ingestAndSave(store, p0.project_id, { filename: 'm10-understand-fixture.md', content: Buffer.from(mat, 'utf-8'), kind: 'markdown', media_type: 'text/markdown' });
    const wb = new WorkbenchService(store);
    await wb.understandAllPending(p0.project_id, { client: clientReplay });
    await wb.generateFramework(p0.project_id, { client: clientReplay });
    await wb.confirmFramework(p0.project_id);
    const calls = [];
    const clientLive = new LlmStageClient({ transport: recordingTransport(live, { push: (c) => calls.push(c) }, { synthetic: true }), chain: chainFromEnv(), timeoutMs: DEFAULT_TIMEOUT_MS });
    const result = await wb.generatePages(p0.project_id, {}, { client: clientLive });
    console.log(`batch ${i}: done=${result.done} failed=${result.failed}`);
    if (result.done >= 5 && result.done > result.failed) {
      return { calls, done: result.done, failed: result.failed };
    }
  }
  return null;
}

const r = await tryRun();
if (r) {
  await saveRecordings(OUT, r.calls);
  console.log('saved:', OUT, 'total:', r.calls.length);
} else {
  console.log('NO GOOD RUN');
}

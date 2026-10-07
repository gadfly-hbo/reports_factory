// M10 S5 页起草录制（手动）：理解/框架走夹具回放，逐页真调录制 + 产出样张 PPTX（KA-1 盲评样张）。
// 用法：npm run build && scripts/with-model-env.sh node scripts/record-m10-s5.mjs
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { WorkspaceStore } from '../dist/storage/workspace.js';
import { ingestAndSave } from '../dist/ingest/persist.js';
import { WorkbenchService } from '../dist/server/workbench.js';
import { LlmStageClient, chainFromEnv, DEFAULT_TIMEOUT_MS } from '../dist/model/client.js';
import { piTransport } from '../dist/model/pi-transport.js';
import { recordingTransport, replayTransport, loadRecordings, saveRecordings } from '../dist/model/recording.js';
import { renderReportPptx } from '../dist/render/pptx.js';

const S3 = 'tests/fixtures/recordings/m10-s3-understand.json';
const S4 = 'tests/fixtures/recordings/m10-s4-framework.json';
const OUT = 'tests/fixtures/recordings/m10-s5-pages.json';
const dir = mkdtempSync(join(tmpdir(), 'rs-rec5-'));
const store = new WorkspaceStore(dir);
const p0 = await store.createProject({ title: '理解测试' });
await store.updateProject(p0.project_id, { privacy_policy: 'allow_external' });
const mat = readFileSync('tests/fixtures/materials/m10-understand-fixture.md', 'utf-8');
await ingestAndSave(store, p0.project_id, { filename: 'm10-understand-fixture.md', content: Buffer.from(mat, 'utf-8'), kind: 'markdown', media_type: 'text/markdown' });

const recordings = (await Promise.all([loadRecordings(S3), loadRecordings(S4)])).flat();
const clientReplay = new LlmStageClient({ transport: replayTransport(recordings), chain: chainFromEnv(), timeoutMs: DEFAULT_TIMEOUT_MS });
const wb = new WorkbenchService(store);
await wb.understandAllPending(p0.project_id, { client: clientReplay });
await wb.generateFramework(p0.project_id, { client: clientReplay });
await wb.confirmFramework(p0.project_id);

const calls = [];
const live = piTransport({ timeoutMs: 300_000 });
const transport = recordingTransport(live, { push: (c) => calls.push(c) }, { synthetic: true });
const clientLive = new LlmStageClient({ transport, chain: chainFromEnv(), timeoutMs: DEFAULT_TIMEOUT_MS });
const result = await wb.generatePages(p0.project_id, {}, { client: clientLive });
{
  const wd = await wb.readWork(p0.project_id);
  console.log('MID-CHECK pages keys:', JSON.stringify(Object.keys(wd.pages ?? {})));
}
console.log('pages done:', result.done, 'failed:', result.failed);
const audit = await store.readAuditLog(p0.project_id);
for (const e of audit.filter((x) => x.status.startsWith('page_') || x.status === 'digit_guard')) {
  console.log('AUDIT:', e.status, JSON.stringify(e.detail));
}
const work = await wb.readWork(p0.project_id);
for (const [pid, st] of Object.entries(result.states)) {
  console.log(' ', pid, st, work.pages?.[pid]?.headline ?? '');
}
// 样张（KA-1 盲评产物）
const spec = wb.pagesToReportSpec(p0, work.framework, work.pages ?? {});
const buf = await renderReportPptx(spec);
writeFileSync('/tmp/m10-sample-deck.pptx', buf);
console.log('sample deck written: /tmp/m10-sample-deck.pptx bytes=', buf.length);
import { unlinkSync } from 'node:fs'; try { unlinkSync(OUT); } catch {}; const prior = [];
await saveRecordings(OUT, [...prior, ...calls]);
console.log('saved to', OUT, 'total:', prior.length + calls.length);

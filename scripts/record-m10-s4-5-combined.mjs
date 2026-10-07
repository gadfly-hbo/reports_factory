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
import { renderReportPptx } from '../dist/render/pptx.js';

process.env['REPORT_STUDIO_BUDGET_MAX_CALLS'] = '400';
const S3 = 'tests/fixtures/recordings/m10-s3-understand.json';
const OUT_S4 = 'tests/fixtures/recordings/m10-s4-framework.json';
const OUT_S5 = 'tests/fixtures/recordings/m10-s5-pages.json';
try { unlinkSync(OUT_S4); } catch {}
try { unlinkSync(OUT_S5); } catch {}

const mat = readFileSync('tests/fixtures/materials/m10-understand-fixture.md', 'utf-8');
const s3 = await loadRecordings(S3);
const clientReplay = new LlmStageClient({ transport: replayTransport(s3), chain: chainFromEnv(), timeoutMs: DEFAULT_TIMEOUT_MS });
const live = piTransport({ timeoutMs: 300_000 });

for (let i = 0; i < 6; i++) {
  const dir = mkdtempSync(join(tmpdir(), `rs-comb-${i}-`));
  const store = new WorkspaceStore(dir);
  const p0 = await store.createProject({ title: '理解测试' });
  await store.updateProject(p0.project_id, { privacy_policy: 'allow_external' });
  await ingestAndSave(store, p0.project_id, { filename: 'm10-understand-fixture.md', content: Buffer.from(mat, 'utf-8'), kind: 'markdown', media_type: 'text/markdown' });
  const wb = new WorkbenchService(store);
  await wb.understandAllPending(p0.project_id, { client: clientReplay });

  // S4 真调（必须恰好 6 页）
  const s4calls = [];
  const s4client = new LlmStageClient({ transport: recordingTransport(live, { push: (c) => s4calls.push(c) }, { synthetic: true }), chain: chainFromEnv(), timeoutMs: DEFAULT_TIMEOUT_MS });
  const fw = await wb.generateFramework(p0.project_id, { client: s4client });
  if (fw.pages.length !== 6) { console.log(`batch ${i}: S4 pages=${fw.pages.length}, skip`); continue; }
  await wb.confirmFramework(p0.project_id);

  // S5 接着录（用同一 framework，page_id 一致）
  const s5calls = [];
  const s5client = new LlmStageClient({ transport: recordingTransport(live, { push: (c) => s5calls.push(c) }, { synthetic: true }), chain: chainFromEnv(), timeoutMs: DEFAULT_TIMEOUT_MS });
  const result = await wb.generatePages(p0.project_id, {}, { client: s5client });
  console.log(`batch ${i}: S4=6 S5 done=${result.done} failed=${result.failed}`);
  if (result.done >= 5 && result.done > result.failed) {
    await saveRecordings(OUT_S4, s4calls);
    await saveRecordings(OUT_S5, s5calls);
    // 样张
    const finalWork = await wb.readWork(p0.project_id);
    const project = await store.getProject(p0.project_id);
    const spec = wb.pagesToReportSpec(project, finalWork.framework, finalWork.pages ?? {});
    const buf = await renderReportPptx(spec);
    writeFileSync('/tmp/m10-sample-deck.pptx', buf);
    console.log('sample bytes=', buf.length, 'saved:', OUT_S4, OUT_S5);
    break;
  }
}

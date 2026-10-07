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

process.env['REPORT_STUDIO_BUDGET_MAX_CALLS'] = '200';
const S3 = 'tests/fixtures/recordings/m10-s3-understand.json';
const S4 = 'tests/fixtures/recordings/m10-s4-framework.json';
const OUT = 'tests/fixtures/recordings/m10-s5-pages.json';
try { unlinkSync(OUT); } catch {}

async function main() {
  const mat = readFileSync('tests/fixtures/materials/m10-understand-fixture.md', 'utf-8');
  const recordings = (await Promise.all([loadRecordings(S3), loadRecordings(S4)])).flat();
  const clientReplay = new LlmStageClient({ transport: replayTransport(recordings), chain: chainFromEnv(), timeoutMs: DEFAULT_TIMEOUT_MS });
  let bestCalls = [];
  for (let i = 0; i < 3; i++) {
    const subDir = mkdtempSync(join(tmpdir(), `rs-rec5full-${i}-`));
    const sub = new WorkspaceStore(subDir);
    const p0 = await sub.createProject({ title: '理解测试' });
    await sub.updateProject(p0.project_id, { privacy_policy: 'allow_external' });
    await ingestAndSave(sub, p0.project_id, { filename: 'm10-understand-fixture.md', content: Buffer.from(mat, 'utf-8'), kind: 'markdown', media_type: 'text/markdown' });
    const wb = new WorkbenchService(sub);
    await wb.understandAllPending(p0.project_id, { client: clientReplay });
    await wb.generateFramework(p0.project_id, { client: clientReplay });
    await wb.confirmFramework(p0.project_id);
    const calls = [];
    const live = piTransport({ timeoutMs: 300_000 });
    const clientLive = new LlmStageClient({ transport: recordingTransport(live, { push: (c) => calls.push(c) }, { synthetic: true }), chain: chainFromEnv(), timeoutMs: DEFAULT_TIMEOUT_MS });
    const result = await wb.generatePages(p0.project_id, {}, { client: clientLive });
    console.log(`attempt ${i}: done=${result.done} failed=${result.failed}`);
    if (result.done >= result.failed && result.done >= 5) {
      bestCalls = calls;
      const finalWork = await wb.readWork(p0.project_id);
      const project = await sub.getProject(p0.project_id);
      const spec = wb.pagesToReportSpec(project, finalWork.framework, finalWork.pages ?? {});
      const buf = await renderReportPptx(spec);
      writeFileSync('/tmp/m10-sample-deck.pptx', buf);
      console.log('sample deck bytes=', buf.length);
      break;
    }
  }
  if (bestCalls.length === 0) { console.log('NO GOOD ATTEMPT'); return; }
  await saveRecordings(OUT, bestCalls);
  console.log('saved:', OUT, 'total:', bestCalls.length);
}
main().catch((e) => { console.error(e); process.exit(1); });

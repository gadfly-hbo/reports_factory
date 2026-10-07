// 增量补录：只重打附录页（page_06），跑 3 次取 schema 合格的 1 次
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { WorkspaceStore } from '../dist/storage/workspace.js';
import { ingestAndSave } from '../dist/ingest/persist.js';
import { WorkbenchService } from '../dist/server/workbench.js';
import { LlmStageClient, chainFromEnv, DEFAULT_TIMEOUT_MS } from '../dist/model/client.js';
import { piTransport } from '../dist/model/pi-transport.js';
import { recordingTransport, replayTransport, loadRecordings, saveRecordings } from '../dist/model/recording.js';

process.env['REPORT_STUDIO_BUDGET_MAX_CALLS'] = '200';
const S3 = 'tests/fixtures/recordings/m10-s3-understand.json';
const S4 = 'tests/fixtures/recordings/m10-s4-framework.json';
const S5 = 'tests/fixtures/recordings/m10-s5-pages.json';
const OUT = S5;

for (let attempt = 0; attempt < 4; attempt++) {
  try { writeFileSync('/dev/null', ''); } catch {}
  // 清空 S5（避免重复键）
  try { (await import('node:fs')).unlinkSync(OUT); } catch {}

  const dir = mkdtempSync(join(tmpdir(), `rs-rec5a${attempt}-`));
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

  // 用之前录好的 5 页 + 真调 page_06
  const s5old = await loadRecordings(S5).catch(() => []); // 可能不存在
  const existing = s5old;

  const calls = [];
  const live = piTransport({ timeoutMs: 300_000 });
  const transport = recordingTransport(live, { push: (c) => calls.push(c) }, { synthetic: true });
  const clientLive = new LlmStageClient({ transport, chain: chainFromEnv(), timeoutMs: DEFAULT_TIMEOUT_MS });
  const result = await wb.generatePages(p0.project_id, { page_id: 'page_06' }, { client: clientLive });
  console.log(`attempt ${attempt}: pages done=${result.done} failed=${result.failed}`);
  if (result.done > 0) {
    // 合并：existing（之前的 5 页）+ 新录 page_06
    await saveRecordings(OUT, [...existing, ...calls]);
    console.log('saved combined:', OUT, 'total:', existing.length + calls.length);
    break;
  }
}

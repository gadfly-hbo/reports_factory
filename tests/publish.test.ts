import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import type { FastifyInstance } from 'fastify';

/**
 * M10 S7：审核发布 + 三格式导出（内用 draft 无门，外发需隐私检查 + 批准 + 内容失效判定）。
 */
const S3 = join(import.meta.dirname, 'fixtures/recordings/m10-s3-understand.json');
const S4 = join(import.meta.dirname, 'fixtures/recordings/m10-s4-framework.json');
const S5 = join(import.meta.dirname, 'fixtures/recordings/m10-s5-pages.json');
const S6 = join(import.meta.dirname, 'fixtures/recordings/m10-s6-rewrite.json');
const FIXTURE_MD = join(import.meta.dirname, 'fixtures/materials/m10-understand-fixture.md');

async function setupReadyProject(app: FastifyInstance, store: WorkspaceStore, replay: string): Promise<string> {
  process.env['REPORT_STUDIO_MODEL_REPLAY'] = replay;
  const create = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '理解测试' } });
  const id = create.json().project.project_id;
  await store.updateProject(id, { privacy_policy: 'allow_external' });
  await app.inject({
    method: 'POST', url: `/api/projects/${id}/sources`,
    payload: { filename: 'm10-understand-fixture.md', content_base64: readFileSync(FIXTURE_MD).toString('base64'), kind: 'markdown', media_type: 'text/markdown' },
  });
  await app.inject({ method: 'POST', url: `/api/projects/${id}/understand`, payload: {} });
  await app.inject({ method: 'POST', url: `/api/projects/${id}/framework/generate`, payload: {} });
  await app.inject({ method: 'POST', url: `/api/projects/${id}/framework/confirm`, payload: {} });
  const g = await app.inject({ method: 'POST', url: `/api/projects/${id}/pages/generate`, payload: {} });
  // 容忍模型概率性失败：重试失败页最多 2 次
  for (let i = 0; i < 2; i++) {
    const detail = (await app.inject({ url: `/api/projects/${id}` })).json();
    const failed = Object.entries(detail.page_states).filter(([, v]) => v === 'failed').map(([k]) => k);
    if (failed.length === 0) break;
    for (const pid of failed) {
      await app.inject({ method: 'POST', url: `/api/projects/${id}/pages/generate`, payload: { page_id: pid } });
    }
  }
  return id;
}

describe('S7 审核发布与三格式导出', () => {
  let app: FastifyInstance;
  let dir: string;
  let store: WorkspaceStore;
  const saved = process.env['REPORT_STUDIO_MODEL_REPLAY'];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rs-pub-'));
    store = new WorkspaceStore(dir);
    app = buildServer(store);
  });
  afterEach(() => {
    process.env['REPORT_STUDIO_MODEL_REPLAY'] = saved;
    app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('内用草稿：无需检查/批准，PPTX/HTML/PDF 三格式均可导，is_draft=true', async () => {
    const id = await setupReadyProject(app, store, `${S3},${S4},${S5},${S6}`);
    const exp = await app.inject({ method: 'POST', url: `/api/projects/${id}/export`, payload: { formats: ['pptx', 'html', 'pdf'], level: 'internal' } });
    expect(exp.statusCode).toBe(200);
    const body = exp.json();
    expect(body.exports.length).toBe(3);
    expect(body.exports.map((e: { format: string }) => e.format)).toEqual(['pptx', 'html', 'pdf']);
    const list = (await app.inject({ url: `/api/projects/${id}` })).json();
    expect(list.exports.every((e: { export_scope: string; is_draft: boolean }) => e.is_draft && e.export_scope === 'internal')).toBe(true);
  });

  it('外发未批准 422（N2）；批准 + 隐私检查 → 导出 is_draft=false', async () => {
    const id = await setupReadyProject(app, store, `${S3},${S4},${S5},${S6}`);
    const denied = await app.inject({ method: 'POST', url: `/api/projects/${id}/export`, payload: { formats: ['pptx'], level: 'external' } });
    expect(denied.statusCode).toBe(422);

    const pc = await app.inject({ method: 'POST', url: `/api/projects/${id}/privacy-check`, payload: {} });
    expect(pc.statusCode).toBe(200);
    expect(pc.json().report.checked_count).toBeGreaterThan(0);

    const ap = await app.inject({ method: 'POST', url: `/api/projects/${id}/approve-formal`, payload: {} });
    expect(ap.statusCode).toBe(200);

    const exp = await app.inject({ method: 'POST', url: `/api/projects/${id}/export`, payload: { formats: ['pptx'], level: 'external' } });
    expect(exp.statusCode).toBe(200);
    const list = (await app.inject({ url: `/api/projects/${id}` })).json();
    const formal = list.exports.find((e: { is_draft: boolean }) => !e.is_draft);
    expect(formal).toBeDefined();
  });

  it('内容变更后批准自动失效（422 + approval-state.revoked=true）', async () => {
    const id = await setupReadyProject(app, store, `${S3},${S4},${S5},${S6}`);
    await app.inject({ method: 'POST', url: `/api/projects/${id}/approve-formal`, payload: {} });
    const ap0 = (await app.inject({ url: `/api/projects/${id}/approval-state` })).json();
    expect(ap0.revoked).toBeFalsy();

    await app.inject({ method: 'PUT', url: `/api/projects/${id}/pages/page_02`, payload: { headline: '改了标题导致审批失效' } });
    const ap1 = (await app.inject({ url: `/api/projects/${id}/approval-state` })).json();
    expect(ap1.revoked).toBe(true);
    expect(ap1.reason).toContain('内容');

    const denied = await app.inject({ method: 'POST', url: `/api/projects/${id}/export`, payload: { formats: ['pptx'], level: 'external' } });
    expect(denied.statusCode).toBe(422);
    expect(denied.json().error).toContain('失效');
  });

  it('local_only 项目不允许外发（403）', async () => {
    const id = await setupReadyProject(app, store, `${S3},${S4},${S5},${S6}`);
    await store.updateProject(id, { privacy_policy: 'local_only' });
    const ap = await app.inject({ method: 'POST', url: `/api/projects/${id}/approve-formal`, payload: {} });
    expect(ap.statusCode).toBe(403);
  });

  it('隐私 sensitive 命中：has_flags=true 且 approve-formal 422（N3）', async () => {
    const id = await setupReadyProject(app, store, `${S3},${S4},${S5},${S6}`);
    const sources = await store.listSourceAssets(id);
    const target = sources[0]!;
    await writeFile(join(dir, id, 'sources', `${target.source_id}.json`), JSON.stringify({ ...target, sensitivity: 'sensitive' }));
    const pc = await app.inject({ method: 'POST', url: `/api/projects/${id}/privacy-check`, payload: {} });
    expect(pc.json().report.has_flags).toBe(true);
    expect(pc.json().report.flag_count).toBeGreaterThan(0);
    const ap = await app.inject({ method: 'POST', url: `/api/projects/${id}/approve-formal`, payload: {} });
    expect(ap.statusCode).toBe(422);
  });

  it('HTML 产物单文件且含翻页脚本（US11）', async () => {
    const id = await setupReadyProject(app, store, `${S3},${S4},${S5},${S6}`);
    const res = await app.inject({ method: 'POST', url: `/api/projects/${id}/export`, payload: { formats: ['html'], level: 'internal' } });
    expect(res.statusCode).toBe(200);
    const list = (await app.inject({ url: `/api/projects/${id}` })).json();
    expect(list.exports.length).toBe(1);
  });
});

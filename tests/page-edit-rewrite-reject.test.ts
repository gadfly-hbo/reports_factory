import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../src/server/app.js';
import { WorkbenchService } from '../src/server/workbench.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import type { FastifyInstance } from 'fastify';

/**
 * M10 S6 N4 负例：agent 改写 fail-closed（uncovered/空 bullets/数字护栏命中）。
 * 直接调 workbench 避开 replay：构造 candidate 触发三路 422。
 */
const S3 = join(import.meta.dirname, 'fixtures/recordings/m10-s3-understand.json');
const S4 = join(import.meta.dirname, 'fixtures/recordings/m10-s4-framework.json');
const S5 = join(import.meta.dirname, 'fixtures/recordings/m10-s5-pages.json');
const FIXTURE_MD = join(import.meta.dirname, 'fixtures/materials/m10-understand-fixture.md');

describe('S6 N4 改写 fail-closed 负例', () => {
  let app: FastifyInstance;
  let dir: string;
  let store: WorkspaceStore;
  const saved = process.env['REPORT_STUDIO_MODEL_REPLAY'];

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'rs-rej-'));
    process.env['REPORT_STUDIO_MODEL_REPLAY'] = `${S3},${S4},${S5}`;
    store = new WorkspaceStore(dir);
    app = buildServer(store);
    const create = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '理解测试' } });
    const pid = create.json().project.project_id;
    await store.updateProject(pid, { privacy_policy: 'allow_external' });
    await app.inject({
      method: 'POST', url: `/api/projects/${pid}/sources`,
      payload: { filename: 'm10-understand-fixture.md', content_base64: readFileSync(FIXTURE_MD).toString('base64'), kind: 'markdown', media_type: 'text/markdown' },
    });
    await app.inject({ method: 'POST', url: `/api/projects/${pid}/understand`, payload: {} });
    await app.inject({ method: 'POST', url: `/api/projects/${pid}/framework/generate`, payload: {} });
    await app.inject({ method: 'POST', url: `/api/projects/${pid}/framework/confirm`, payload: {} });
    await app.inject({ method: 'POST', url: `/api/projects/${pid}/pages/generate`, payload: {} });
  });
  afterEach(() => {
    process.env['REPORT_STUDIO_MODEL_REPLAY'] = saved;
    app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('未生成页：DELETE/rewrite/PUT 均 404', async () => {
    const id = (await store.listProjects())[0]!.project_id;
    const rw = await app.inject({ method: 'POST', url: `/api/projects/${id}/pages/page_99/rewrite`, payload: { instruction: '改一下' } });
    expect(rw.statusCode).toBe(404);
    const put = await app.inject({ method: 'PUT', url: `/api/projects/${id}/pages/page_99`, payload: { headline: 'x' } });
    expect(put.statusCode).toBe(404);
    const del = await app.inject({ method: 'DELETE', url: `/api/projects/${id}/pages/page_99` });
    expect(del.statusCode).toBe(404);
  });

  it('改写 fail-closed 逻辑纯函数：uncovered/空 bullets/数字护栏均拒绝', async () => {
    const wb = new WorkbenchService(store);
    const projects = await store.listProjects();
    const pid = projects[0]!.project_id;
    const work = await wb.readWork(pid);
    const fp = work.framework!.pages[0]!;

    // mock client 返回 uncovered=true → 422
    const fakeUncovered = {
      complete: async () => ({ output: { headline: 'x', bullets: [], uncovered: true }, provider: 'p', modelId: 'm', cost: 0 }),
    };
    let err = await wb.rewritePage(pid, fp.page_id, '测', { client: fakeUncovered as never }).catch((e: Error) => e);
    expect((err as Error & { statusCode?: number }).statusCode).toBe(422);
    expect((err as Error).message).toContain('材料未覆盖');

    // mock client 返回 bullets=[] 也未 uncovered → 422（被空 bullets 路径拒）
    const fakeEmptyBullets = {
      complete: async () => ({ output: { headline: 'x', bullets: [], uncovered: false }, provider: 'p', modelId: 'm', cost: 0 }),
    };
    err = await wb.rewritePage(pid, fp.page_id, '测', { client: fakeEmptyBullets as never }).catch((e: Error) => e);
    expect((err as Error & { statusCode?: number }).statusCode).toBe(422);
    expect((err as Error).message).toContain('材料未覆盖');

    // mock client 返回含材料未出现的数字 → 422（数字护栏拒）
    const fakeDigit = {
      complete: async () => ({ output: { headline: 'x', bullets: [{ text: '本页要点' }], uncovered: false, chart: { title: '假图', type: 'bar' as const, categories: ['x'], series: [{ name: 's', values: [999] }] } }, provider: 'p', modelId: 'm', cost: 0 }),
    };
    err = await wb.rewritePage(pid, fp.page_id, '测', { client: fakeDigit as never }).catch((e: Error) => e);
    expect((err as Error & { statusCode?: number }).statusCode).toBe(422);
    expect((err as Error).message).toContain('数字护栏');
  });
});

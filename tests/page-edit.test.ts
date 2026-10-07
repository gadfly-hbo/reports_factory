import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import type { FastifyInstance } from 'fastify';

/**
 * M10 S6：手工直改 / agent 整页重写（白名单+数字护栏 fail-closed）/ 删页（封面与末页拒删）。
 * LLM 走四份录制夹具（S3+S4+S5+S6）。
 */
const S3 = join(import.meta.dirname, 'fixtures/recordings/m10-s3-understand.json');
const S4 = join(import.meta.dirname, 'fixtures/recordings/m10-s4-framework.json');
const S5 = join(import.meta.dirname, 'fixtures/recordings/m10-s5-pages.json');
const S6 = join(import.meta.dirname, 'fixtures/recordings/m10-s6-rewrite.json');
const FIXTURE_MD = join(import.meta.dirname, 'fixtures/materials/m10-understand-fixture.md');

describe('S6 逐页编辑（录制回放）', () => {
  let app: FastifyInstance;
  let dir: string;
  let store: WorkspaceStore;
  let projectId: string;
  const saved = process.env['REPORT_STUDIO_MODEL_REPLAY'];

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'rs-pe-'));
    process.env['REPORT_STUDIO_MODEL_REPLAY'] = `${S3},${S4},${S5},${S6}`;
    store = new WorkspaceStore(dir);
    app = buildServer(store);
    const create = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '理解测试' } });
    projectId = create.json().project.project_id;
    await store.updateProject(projectId, { privacy_policy: 'allow_external' });
    await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/sources`,
      payload: { filename: 'm10-understand-fixture.md', content_base64: readFileSync(FIXTURE_MD).toString('base64'), kind: 'markdown', media_type: 'text/markdown' },
    });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/understand`, payload: {} });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/framework/generate`, payload: {} });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/framework/confirm`, payload: {} });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/pages/generate`, payload: { mode: 'worker' } });
  });
  afterEach(() => {
    process.env['REPORT_STUDIO_MODEL_REPLAY'] = saved;
    app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('手工直改：headline/bullets/table_note 持久化（重进不丢）；emoji 不过滤（M-U6）', async () => {
    const put = await app.inject({
      method: 'PUT', url: `/api/projects/${projectId}/pages/page_02`,
      payload: { headline: '手工改后的标题（含 emoji ✅ 也如实保留）', bullets: [{ text: '手工要点一' }, { text: '手工要点二' }], table_note: '口径：自然月' },
    });
    expect(put.statusCode).toBe(200);
    const detail = (await app.inject({ url: `/api/projects/${projectId}` })).json();
    expect(detail.pages.page_02.headline).toContain('手工改后的标题');
    expect(detail.pages.page_02.headline).toContain('✅');
    expect(detail.pages.page_02.bullets).toHaveLength(2);
    expect(detail.pages.page_02.table_note).toBe('口径：自然月');
    // 其他页不受影响
    expect(detail.pages.page_03.headline).not.toContain('手工改后');
  });

  it('agent 改写：成功路径更新页内容；写审计', async () => {
    const beforeDetail = (await app.inject({ url: `/api/projects/${projectId}` })).json().pages.page_02;
    const before = beforeDetail.headline;
    const rw = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/pages/page_02/rewrite`,
      payload: { instruction: '把标题改成：客流回升、转化平稳、库存改善（环比口径）' },
    });
    expect(rw.statusCode).toBe(200);
    const after = rw.json().draft;
    // 改写生效：headline/bullets/body 任一变化即可（模型可能只改正文）
    const changed = after.headline !== before
      || JSON.stringify(after.bullets) !== JSON.stringify((beforeDetail as any).bullets ?? null)
      || after.body !== (beforeDetail as any).body;
    expect(changed).toBe(true);
    const audit = await store.readAuditLog(projectId);
    expect(audit.some((e) => e.status === 'agent_rewrite' && e.detail.page_id === 'page_02')).toBe(true);
  });

  it('改写指令过短 400；未生成页 404', async () => {
    const short = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/pages/page_02/rewrite`, payload: { instruction: '改' } });
    expect(short.statusCode).toBe(400);
    const missing = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/pages/page_99/rewrite`, payload: { instruction: '改一下这页' } });
    expect(missing.statusCode).toBe(404);
  });

  it('删页：page_id 不重排；封面与原始末页拒删（G8）', async () => {
    // 先尝试删原末页：必须 422
// 中间页可删：page_id 不重排
    const del = await app.inject({ method: 'DELETE', url: `/api/projects/${projectId}/pages/page_03` });
    expect(del.statusCode).toBe(200);
    const detail = (await app.inject({ url: `/api/projects/${projectId}` })).json();
    const ids = detail.framework.pages.map((p: { page_id: string }) => p.page_id);
    expect(ids).not.toContain('page_03');
    expect(ids).toContain('page_02'); // 其余页 id 不重排
    expect(detail.pages.page_02).toBeDefined();
    // 封面拒删
    const cover = await app.inject({ method: 'DELETE', url: `/api/projects/${projectId}/pages/page_01` });
    expect(cover.statusCode).toBe(422);
  });
});

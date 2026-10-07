import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

/**
 * M10 S1 骨架测试：PPT 项目创建/kind 过滤/六步解锁/隐私策略/旧报告路由退场。
 * 六步业务行为（理解/框架/生成/发布）在 S3–S7 各自切片内逐步锁定。
 */
describe('M10 API 骨架：纯 PPT 报告生成器', () => {
  let app: FastifyInstance;
  let dir: string;
  let store: WorkspaceStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rs-m10-'));
    store = new WorkspaceStore(dir);
    app = buildServer(store);
  });
  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('创建 PPT 项目：kind 持久化、隐私策略可设、详情带六步状态', async () => {
    const create = await app.inject({
      method: 'POST', url: '/api/projects',
      payload: { title: '会员运营深度研究', purpose: '经营例会汇报', privacy_policy: 'allow_external_with_approval' },
    });
    expect(create.statusCode).toBe(200);
    const project = create.json().project;
    expect(project.kind).toBe('ppt');
    expect(project.privacy_policy).toBe('allow_external_with_approval');

    const detail = (await app.inject({ url: `/api/projects/${project.project_id}` })).json();
    expect(detail.project.title).toBe('会员运营深度研究');
    expect(detail.steps.map((s: { key: string; unlocked: boolean }) => s.key)).toEqual(
      ['upload', 'understand', 'framework', 'generate', 'page-edit', 'publish'],
    );
    const byKey = Object.fromEntries(detail.steps.map((s: { key: string; unlocked: boolean }) => [s.key, s.unlocked]));
    expect(byKey.upload).toBe(true);
    expect(byKey.understand).toBe(false); // 无资料
    expect(byKey.framework).toBe(false);
    expect(byKey.generate).toBe(false);
    expect(byKey.publish).toBe(false);
  });

  it('列表只列 PPT 项目：旧报告项目（无 kind）不出现但数据保留（G6）', async () => {
    // 旧项目：直接以旧 schema 形态落盘（无 kind、旧 stage 枚举值）
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(join(dir, 'proj_legacy001'), { recursive: true });
    await writeFile(
      join(dir, 'proj_legacy001', 'project.json'),
      JSON.stringify({
        project_id: 'proj_legacy001', title: '旧报告项目', created_at: '2026-09-01T00:00:00Z',
        updated_at: '2026-09-01T00:00:00Z', privacy_policy: 'local_only', stage: 'exported', template_id: 'ops_review_deck',
      }),
    );
    const created = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '新 PPT 项目' } });
    const newId = created.json().project.project_id;

    const list = (await app.inject({ url: '/api/projects' })).json().projects;
    expect(list.map((p: { project_id: string }) => p.project_id)).toEqual([newId]);
    // 旧项目数据完好：直接读取仍在（只是列表不可见）
    expect(await store.getProject('proj_legacy001')).not.toBeNull();
    expect((await store.getProject('proj_legacy001'))!.title).toBe('旧报告项目');
  });

  it('上传资料后 understand 步解锁；框架/生成仍锁定', async () => {
    const create = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '解锁测试' } });
    const id = create.json().project.project_id;
    const up = await app.inject({
      method: 'POST', url: `/api/projects/${id}/sources`,
      payload: { filename: 'a.md', content_base64: Buffer.from('# 结论\n销售额下降。').toString('base64'), kind: 'markdown', media_type: 'text/markdown' },
    });
    expect(up.statusCode).toBe(200);
    const detail = (await app.inject({ url: `/api/projects/${id}` })).json();
    const byKey = Object.fromEntries(detail.steps.map((s: { key: string; unlocked: boolean }) => [s.key, s.unlocked]));
    expect(byKey.understand).toBe(true);
    expect(byKey.framework).toBe(false);
    expect(byKey.publish).toBe(false);
  });

  it('旧报告路由退场：findings/outline/assemble/checks/generate/ppt 均不再存在', async () => {
    const create = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '退场验证' } });
    const id = create.json().project.project_id;
    for (const url of [
      `/api/projects/${id}/findings`, `/api/projects/${id}/outline`, `/api/projects/${id}/assemble`,
      `/api/projects/${id}/checks`, `/api/projects/${id}/editorial`, `/api/projects/${id}/preview`,
    ]) {
      const res = await app.inject({ url, method: 'POST' });
      expect(res.statusCode, url).toBe(404);
    }
    const gen = await app.inject({ method: 'POST', url: `/api/projects/${id}/generate`, payload: {} });
    expect(gen.statusCode).toBe(404);
    const ppt = await app.inject({ method: 'POST', url: `/api/projects/${id}/ppt/from-md`, payload: { markdown: 'x' } });
    expect(ppt.statusCode).toBe(404);
  });

  it('隐私策略切换（M-U2）：PUT /privacy 更新并回显', async () => {
    const create = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '隐私切换' } });
    const id = create.json().project.project_id;
    const put = await app.inject({
      method: 'PUT', url: `/api/projects/${id}/privacy`, payload: { privacy_policy: 'allow_external' },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().project.privacy_policy).toBe('allow_external');
    const detail = (await app.inject({ url: `/api/projects/${id}` })).json();
    expect(detail.capabilities.ai.enabled).toBe(true);
  });

  it('非法 template_id 被拒（400）；模板列表可用', async () => {
    const bad = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: 'X', template_id: 'nope' } });
    expect(bad.statusCode).toBe(400);
    const templates = (await app.inject({ url: '/api/templates' })).json().templates;
    expect(templates.length).toBeGreaterThanOrEqual(3);
  });
});

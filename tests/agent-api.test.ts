import { buildServer } from '../src/server/app.js';
import { proposeOutline } from '../src/agent/outline.js';
import { resolve } from 'node:path';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';

/** S2 Agent 路由冒烟：status 形状 / 404 / 未启动态；真实会话行为在 host 级测试锁定。 */
describe('S2 Agent 会话路由', () => {
  let app: FastifyInstance;
  let dir: string;
  let store: WorkspaceStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rs-agent-api-'));
    store = new WorkspaceStore(dir);
    app = buildServer(store);
  });
  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('GET /api/ai/status：链与密钥存在性（零密钥内容）', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/ai/status' });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { chain: string[]; providers: Array<{ provider: string; key: boolean }>; modelAvailable: boolean };
    expect(body.chain.length).toBe(2);
    expect(body.providers.every((p) => typeof p.key === 'boolean')).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/sk-[A-Za-z0-9]{8}/);
  });

  it('POST /chat 对不存在项目 → 404；未启动时 status/result/history 为空态', async () => {
    const missing = await app.inject({ method: 'POST', url: '/api/projects/proj_none/chat', payload: { text: 'hi' } });
    expect(missing.statusCode).toBe(404);

    const created = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '测试' } });
    const id = (created.json() as { project: { project_id: string } }).project.project_id;

    const status = await app.inject({ method: 'GET', url: `/api/projects/${id}/agent/status` });
    expect(status.json()).toMatchObject({ started: false, busy: false });

    const result = await app.inject({ method: 'GET', url: `/api/projects/${id}/agent/result` });
    expect(result.json()).toMatchObject({ active: false });

    const history = await app.inject({ method: 'GET', url: `/api/projects/${id}/agent/history` });
    expect(history.json()).toMatchObject({ entries: [] });
  });

  it('上传材料 → 提取落盘 + manifest 路由可读（T1 材料通道）', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '材料测试' } });
    const id = (created.json() as { project: { project_id: string } }).project.project_id;

    const up = await app.inject({
      method: 'POST', url: `/api/projects/${id}/sources`,
      payload: { filename: '结论.md', content_base64: Buffer.from('# 结论\n销售额 880 万', 'utf-8').toString('base64'), kind: 'markdown' },
    });
    expect(up.statusCode).toBe(200);
    const body = up.json() as { ok: boolean; material: { status: string; extract_file: string; source_id: string } };
    expect(body.ok).toBe(true);
    expect(body.material.status).toBe('ready');
    expect(body.material.extract_file).toContain('.extract.md');

    const mats = await app.inject({ method: 'GET', url: `/api/projects/${id}/materials` });
    const manifest = mats.json() as { materials: Array<{ source_id: string; status: string }> };
    expect(manifest.materials).toHaveLength(1);
    expect(manifest.materials[0]!.status).toBe('ready');
  });

  it('outline 路由：无提案 404 / 编辑保存 / 确认（注入尽力，无密钥 202）', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '提案测试' } });
    const id = (created.json() as { project: { project_id: string } }).project.project_id;

    const missing = await app.inject({ method: 'PUT', url: `/api/projects/${id}/outline`, payload: { pages: [{ title: 'a', page_type: 'cover' }, { title: 'b', page_type: 'content' }] } });
    expect(missing.statusCode).toBe(404);

    await proposeOutline(resolve(dir, id), [
      { title: '页甲', page_type: 'summary' }, { title: '页乙', page_type: 'content' },
    ], ['口径？']);

    const bad = await app.inject({ method: 'PUT', url: `/api/projects/${id}/outline`, payload: { pages: [{ title: '唯一页', page_type: 'cover' }] } });
    expect(bad.statusCode).toBe(422);

    const put = await app.inject({ method: 'PUT', url: `/api/projects/${id}/outline`, payload: { pages: [{ title: '页甲改', page_type: 'summary' }, { title: '页乙', page_type: 'content' }] } });
    expect(put.statusCode).toBe(200);
    expect((put.json() as { proposal: { version: number } }).proposal.version).toBe(1);

    // 无密钥环境注入尽力：确认态持久、202 + injected:false
    delete process.env['MINIMAX_CN_API_KEY'];
    delete process.env['MINIMAX_API_KEY'];
    delete process.env['XIAOMI_TOKEN_PLAN_CN_API_KEY'];
    const confirm = await app.inject({ method: 'POST', url: `/api/projects/${id}/outline/confirm` });
    expect(confirm.statusCode).toBe(202);
    const body = confirm.json() as { confirmed: boolean; injected: boolean; version: number };
    expect(body.confirmed).toBe(true);
    expect(body.injected).toBe(false);
    expect(body.version).toBe(1);
  });

  it('T6 服务重启后历史可恢复（惰性建 host 找回 JSONL 会话）', async () => {
    // 前一用例删除了 env 密钥：惰性建 host 需要——重新装载（只填缺失，不动显式值）
    const { loadKeysFromDisk } = await import('../src/agent/model.js');
    loadKeysFromDisk();

    const created = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '恢复测试' } });
    const id = (created.json() as { project: { project_id: string } }).project.project_id;

    // 模拟前一进程：用合成 transport 在同一存储目录留下一轮会话
    const { SessionHost } = await import('../src/agent/session-host.js');
    const { MINIMAX_M3 } = await import('../src/agent/model.js');
    const prevHost = await SessionHost.create({
      projectRoot: join(dir, id),
      skillsDir: resolve('assets', 'skills', 'ppt'),
      model: MINIMAX_M3,
      transport: async () => ({ content: [{ kind: 'text', text: '之前一轮的回复。' }], stop: 'complete', usage: { inputTokens: 5, outputTokens: 2 } }),
      auditFile: join(dir, 'prev-audit.jsonl'),
      budgetFile: join(dir, 'prev-budget.json'),
    });
    await prevHost.send('之前一轮的用户消息：做一份复盘 PPT');
    const r = await prevHost.currentResult();
    expect(r?.status).toBe('succeeded');
    await prevHost.close();

    // 新进程视角：未发消息直接取历史（惰性建 host → list 找回会话）
    const h = await app.inject({ method: 'GET', url: `/api/projects/${id}/agent/history` });
    expect(h.statusCode).toBe(200);
    const entries = (h.json() as { entries: Array<{ kind: string; message?: { text?: string } }> }).entries;
    expect(entries.some((e) => e.message?.text?.includes('之前一轮的用户消息'))).toBe(true);
    expect(entries.some((e) => e.message?.text?.includes('之前一轮的回复'))).toBe(true);
  });
});

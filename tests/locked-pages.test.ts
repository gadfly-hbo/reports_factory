import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ModelReply, ModelTransport } from 'pi-agent-runtime';
import { SessionHost } from '../src/agent/session-host.js';
import { MINIMAX_M3 } from '../src/agent/model.js';
import { readLockedPages, writeLockedPages, isLockedPath } from '../src/agent/locked-pages.js';
import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { mkdtempSync, rmSync } from 'node:fs';

async function tmpRoot(tag: string): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), `rs-lk-${tag}-`));
  const root = join(base, 'proj_l');
  await mkdir(join(root, 'work'), { recursive: true });
  return root;
}

describe('页锁定（flow-10 P2-2）', () => {
  it('存储与路径匹配', async () => {
    const root = await tmpRoot('store');
    try {
      expect(await readLockedPages(root)).toEqual([]);
      await writeLockedPages(root, ['page_03', 'page_07']);
      expect(await readLockedPages(root)).toEqual(['page_03', 'page_07']);
      expect(isLockedPath(['page_03'], 'deck/pages/page_03.mjs')).toBe(true);
      expect(isLockedPath(['page_03'], 'deck/pages/page_03.html')).toBe(true);
      expect(isLockedPath(['page_03'], 'deck/pages/page_04.mjs')).toBe(false);
      expect(isLockedPath(['page_03'], 'deck/deck.mjs')).toBe(false);
    } finally { await rm(root, { recursive: true, force: true }).catch(() => {}); }
  });

  it('SessionHost 缝：write 锁定页被拦截（agent 收到错误文本可自纠）+ system 注入锁定列表', async () => {
    const root = await tmpRoot('seam');
    try {
      await writeLockedPages(root, ['page_01']);
      const requests: string[] = [];
      let call = 0;
      const transport: ModelTransport = async (req) => {
        for (const m of req.messages) requests.push(m.text);
        call += 1;
        if (call === 1) return { content: [{ kind: 'tool', id: 'c1', name: 'write', arguments: { path: 'deck/pages/page_01.mjs', content: ' hacked' } }], stop: 'tools', usage: { inputTokens: 5, outputTokens: 2 } } as unknown as ModelReply;
        return { content: [{ kind: 'text', text: '明白，跳过锁定页。' }], stop: 'complete', usage: { inputTokens: 5, outputTokens: 2 } } as unknown as ModelReply;
      };
      const host = await SessionHost.create({ projectRoot: root, skillsDir: root, model: MINIMAX_M3, transport, auditFile: join(root, 'a.jsonl'), budgetFile: join(root, 'b.json') });
      await host.send('改一页');
      const result = await host.currentResult();
      expect(result?.status).toBe('succeeded');
      // system 注入锁定列表
      expect(requests.some((t) => t.includes('页锁定') && t.includes('page_01'))).toBe(true);
      // agent 收到拦截错误（未实际写入）
      expect(requests.some((t) => t.includes('已锁定') && t.includes('不可修改'))).toBe(true);
      await host.close();
    } finally { await rm(root, { recursive: true, force: true }).catch(() => {}); }
  });

  it('API：PUT/GET locked-pages + 逐页修改/rewrite 拦锁定 422', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rs-lk-api-'));
    const store = new WorkspaceStore(dir);
    let app: FastifyInstance | null = buildServer(store);
    try {
      const created = await app!.inject({ method: 'POST', url: '/api/projects', payload: { title: '锁定' } });
      const id = (created.json() as { project: { project_id: string } }).project.project_id;

      const put = await app!.inject({ method: 'PUT', url: `/api/projects/${id}/locked-pages`, payload: { locked: ['page_02'] } });
      expect(put.statusCode).toBe(200);
      const get = await app!.inject({ method: 'GET', url: `/api/projects/${id}/locked-pages` });
      expect((get.json() as { locked: string[] }).locked).toEqual(['page_02']);

      const bad = await app!.inject({ method: 'PUT', url: `/api/projects/${id}/locked-pages`, payload: { locked: ['not_a_page!!'] } });
      expect(bad.statusCode).toBe(400);

      // 注：PUT/POST pages/:pid 路由已随六步清理删除；锁定防御在 session-host 工具层（见上方 seam 测试）
      // API 层验证 PUT 锁定列表 schema 与 GET 回显即可
    } finally { await app!.close(); rmSync(dir, { recursive: true, force: true }); }
  });
});

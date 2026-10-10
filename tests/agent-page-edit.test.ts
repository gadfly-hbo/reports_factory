import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { ModelReply, ModelTransport } from 'pi-agent-runtime';
import { SessionHost } from '../src/agent/session-host.js';
import { MINIMAX_M3 } from '../src/agent/model.js';
import { composeChatPrompt } from '../src/agent/prompts.js';
import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { mkdtempSync, rmSync } from 'node:fs';

const PAGE_V1 = `import pptxgen from 'pptxgenjs';
export function buildSlide(pptx) {
  const s = pptx.addSlide();
  s.addText('旧标题', { x: 1, y: 3, w: 11, h: 1, fontSize: 30, fontFace: 'PingFang SC' });
}`;
const PAGE_V2 = PAGE_V1.replace('旧标题', '新标题：Q3 客流回暖');
const DECK = `import pptxgen from 'pptxgenjs';
import { buildSlide as p01 } from './pages/page_01.mjs';
const pptx = new pptxgen();
pptx.defineLayout({ name: 'W', width: 13.33, height: 7.5 });
pptx.layout = 'W';
p01(pptx);
await pptx.writeFile({ fileName: 'deck/deck.pptx' });`;

describe('逐页对话编辑（T4）', () => {
  it('composeChatPrompt：选中页注入页上下文 + 重渲染提醒；无页则原文', () => {
    const withPage = composeChatPrompt('把这页标题改成结论式', 'page_02');
    expect(withPage).toContain('【针对 page_02】');
    expect(withPage).toContain('deck/pages/page_02.mjs');
    expect(withPage).toContain('render_deck');
    expect(composeChatPrompt('普通消息', undefined)).toBe('普通消息');
  });

  it('SessionHost 缝 E2E：原生 write 改 page js → render_deck → 产物更新', async () => {
    const base = await mkdtemp(join(tmpdir(), 'rs-p4-'));
    const root = join(base, 'proj_e');
    await mkdir(join(root, 'deck', 'pages'), { recursive: true });
    await writeFile(join(root, 'deck', 'pages', 'page_01.mjs'), PAGE_V1, 'utf-8');
    await writeFile(join(root, 'deck', 'deck.mjs'), DECK, 'utf-8');
    try {
      let call = 0;
      const requests: string[] = [];
      const transport: ModelTransport = async (req) => {
        for (const m of req.messages) requests.push(m.text);
        call += 1;
        if (call === 1) {
          return { content: [{ kind: 'tool', id: 'c1', name: 'write', arguments: { path: 'deck/pages/page_01.mjs', content: PAGE_V2 } }], stop: 'tools', usage: { inputTokens: 20, outputTokens: 40 } } as unknown as ModelReply;
        }
        if (call === 2) {
          return { content: [{ kind: 'tool', id: 'c2', name: 'render_deck', arguments: { expected_slides: 1 } }], stop: 'tools', usage: { inputTokens: 20, outputTokens: 4 } } as unknown as ModelReply;
        }
        return { content: [{ kind: 'text', text: '第 1 页已改并重渲染。' }], stop: 'complete', usage: { inputTokens: 20, outputTokens: 4 } } as unknown as ModelReply;
      };
      const host = await SessionHost.create({ projectRoot: root, skillsDir: root, model: MINIMAX_M3, transport, auditFile: join(root, 'a.jsonl'), budgetFile: join(root, 'b.json') });
      const sent = await host.send(composeChatPrompt('把这页标题改成结论式', 'page_01'));
      expect(sent.mode).toBe('run');
      const result = await host.currentResult();
      expect(result?.status).toBe('succeeded');

      const updated = await readFile(join(root, 'deck', 'pages', 'page_01.mjs'), 'utf-8');
      expect(updated).toContain('新标题：Q3 客流回暖');
      expect(existsSync(join(root, 'deck', 'deck.pptx'))).toBe(true);
      expect(requests.some((t) => t.includes('渲染成功'))).toBe(true);
      await host.close();
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('预览 fallback：无 agent HTML 时从 page .mjs 提取文本出近似 PNG', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rs-p4-api-'));
    const store = new WorkspaceStore(dir);
    let app: FastifyInstance | null = buildServer(store);
    try {
      const created = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '逐页测试' } });
      const id = (created.json() as { project: { project_id: string } }).project.project_id;
      const pagesDir = join(dir, id, 'deck', 'pages');
      await mkdir(pagesDir, { recursive: true });
      await writeFile(join(pagesDir, 'page_01.mjs'), PAGE_V1, 'utf-8');

      const r = await app.inject({ method: 'GET', url: `/api/projects/${id}/deck/preview/page_01` });
      expect(r.statusCode).toBe(200);
      expect(r.headers['content-type']).toBe('image/png');
      expect(r.rawPayload.length).toBeGreaterThan(1000);

      const missing = await app.inject({ method: 'GET', url: `/api/projects/${id}/deck/preview/page_99` });
      expect(missing.statusCode).toBe(404);
    } finally {
      await app!.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

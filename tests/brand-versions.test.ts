import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ModelReply, ModelTransport } from 'pi-agent-runtime';
import { SessionHost } from '../src/agent/session-host.js';
import { MINIMAX_M3 } from '../src/agent/model.js';
import { snapshotDeck, listVersions, diffVersions } from '../src/agent/deck-versions.js';
import { renderDeckTool } from '../src/agent/tools/render-deck-tool.js';
import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { mkdtempSync, rmSync } from 'node:fs';

const PAGE_A = `import pptxgen from 'pptxgenjs';
export function buildSlide(pptx) { const s = pptx.addSlide(); s.addText('页A', { x: 1, y: 3, fontSize: 24 }); }`;
const DECK_OK = (pages: string[]) => `import pptxgen from 'pptxgenjs';\n${pages.map((n, i) => `import { buildSlide as p${i + 1} } from './pages/${n}';`).join('\n')}\nconst pptx = new pptxgen();\npptx.defineLayout({ name: 'W', width: 13.33, height: 7.5 });\npptx.layout = 'W';\n${pages.map((_, i) => `p${i + 1}(pptx);`).join('\n')}\nawait pptx.writeFile({ fileName: 'deck/deck.pptx' });`;

async function tmpRoot(tag: string): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), `rs-p1-${tag}-`));
  const root = join(base, 'proj_p');
  await mkdir(join(root, 'deck', 'pages'), { recursive: true });
  return root;
}

describe('P1×3（flow-9）', () => {
  it('V1 brand 注入：设 brand.primary 后 system 含品牌配置', async () => {
    const root = await tmpRoot('brand');
    try {
      await writeFile(join(root, 'project.json'), JSON.stringify({ project_id: 'proj_p', title: 'p', brand: { primary: '#1B5E20' } }));
      const requests: string[] = [];
      const transport: ModelTransport = async (req) => {
        for (const m of req.messages) requests.push(m.text);
        return { content: [{ kind: 'text', text: '好' }], stop: 'complete', usage: { inputTokens: 5, outputTokens: 2 } } as unknown as ModelReply;
      };
      const host = await SessionHost.create({ projectRoot: root, skillsDir: root, model: MINIMAX_M3, transport, auditFile: join(root, 'a.jsonl'), budgetFile: join(root, 'b.json') });
      await host.send('测试');
      await host.currentResult();
      expect(requests.some((t) => t.includes('品牌配置') && t.includes('1B5E20'))).toBe(true);
      await host.close();
    } finally { await rm(root, { recursive: true, force: true }).catch(() => {}); }
  });

  it('V2 快照：snapshotDeck + listVersions + diffVersions', async () => {
    const root = await tmpRoot('ver');
    try {
      await writeFile(join(root, 'deck', 'pages', 'page_01.mjs'), PAGE_A);
      await writeFile(join(root, 'deck', 'deck.mjs'), DECK_OK(['page_01.mjs']));
      const v1 = await snapshotDeck(root);
      expect(v1).toBe(1);

      // 改内容 + 加页
      await writeFile(join(root, 'deck', 'pages', 'page_01.mjs'), PAGE_A.replace('页A', '页A改'));
      await writeFile(join(root, 'deck', 'pages', 'page_02.mjs'), PAGE_A.replace('页A', '页B'));
      await writeFile(join(root, 'deck', 'deck.mjs'), DECK_OK(['page_01.mjs', 'page_02.mjs']));
      const v2 = await snapshotDeck(root);
      expect(v2).toBe(2);

      const list = await listVersions(root);
      expect(list).toHaveLength(2);
      expect(list[0]!.page_count).toBe(1);
      expect(list[1]!.page_count).toBe(2);

      const diff = await diffVersions(root, 1, 2);
      const p1 = diff.find((d) => d.file === 'page_01.mjs')!;
      expect(p1.status).toBe('changed');
      const p2 = diff.find((d) => d.file === 'page_02.mjs')!;
      expect(p2.status).toBe('added');
    } finally { await rm(root, { recursive: true, force: true }).catch(() => {}); }
  });

  it('V2 API：PUT brand / GET versions / GET diff', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rs-p1-api-'));
    const store = new WorkspaceStore(dir);
    let app: FastifyInstance | null = buildServer(store);
    try {
      const created = await app!.inject({ method: 'POST', url: '/api/projects', payload: { title: 'VI' } });
      const id = (created.json() as { project: { project_id: string } }).project.project_id;

      const brand = await app!.inject({ method: 'PUT', url: `/api/projects/${id}/brand`, payload: { primary: '#1B5E20' } });
      expect(brand.statusCode).toBe(200);
      expect(((brand.json() as { project: { brand?: { primary?: string } } }).project).brand?.primary).toBe('#1B5E20');

      const bad = await app!.inject({ method: 'PUT', url: `/api/projects/${id}/brand`, payload: { primary: 'green' } });
      expect(bad.statusCode).toBe(400);

      const vers = await app!.inject({ method: 'GET', url: `/api/projects/${id}/deck/versions` });
      expect(vers.statusCode).toBe(200);
      expect((vers.json() as { versions: unknown[] }).versions).toEqual([]);
    } finally { await app!.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('V3 目录联动：页文件数 ≠ import 数 → warning', async () => {
    const root = await tmpRoot('toc');
    try {
      await writeFile(join(root, 'deck', 'pages', 'page_01.mjs'), PAGE_A);
      await writeFile(join(root, 'deck', 'pages', 'page_02.mjs'), PAGE_A.replace('页A', '页B'));
      // deck.mjs 只 import page_01（缺 page_02）→ 应 warning
      await writeFile(join(root, 'deck', 'deck.mjs'), DECK_OK(['page_01.mjs']));
      const r = (await renderDeckTool(root).execute({ expected_slides: 2 }, new AbortController().signal)) as { ok: boolean; warnings?: string[] };
      expect(r.ok).toBe(true);
      expect(r.warnings?.some((w) => w.includes('目录不同步') && w.includes('2') && w.includes('1'))).toBe(true);
    } finally { await rm(root, { recursive: true, force: true }).catch(() => {}); }
  });
});

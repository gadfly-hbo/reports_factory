import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { qaDeck } from '../src/agent/qa-deck.js';
import { buildDeckExports } from '../src/agent/export-deck.js';
import { renderDeckTool } from '../src/agent/tools/render-deck-tool.js';
import { exportDeckTool } from '../src/agent/tools/export-deck-tool.js';
import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { mkdtempSync, rmSync } from 'node:fs';

const PAGE = `import pptxgen from 'pptxgenjs';
export function buildSlide(pptx) {
  const s = pptx.addSlide();
  s.addText('页一标题', { x: 1, y: 3, w: 11, h: 1, fontSize: 30, fontFace: 'PingFang SC' });
}`;
const DECK = `import pptxgen from 'pptxgenjs';
import { buildSlide as p01 } from './pages/page_01.mjs';
const pptx = new pptxgen();
pptx.defineLayout({ name: 'W', width: 13.33, height: 7.5 });
pptx.layout = 'W';
p01(pptx);
await pptx.writeFile({ fileName: 'deck/deck.pptx' });`;

async function seedGoodDeck(root: string, withHtml = true): Promise<void> {
  await mkdir(join(root, 'deck', 'pages'), { recursive: true });
  await writeFile(join(root, 'deck', 'pages', 'page_01.mjs'), PAGE, 'utf-8');
  if (withHtml) await writeFile(join(root, 'deck', 'pages', 'page_01.html'), '<html><body style="width:1280px;height:720px"><h1>页一标题</h1></body></html>', 'utf-8');
  await writeFile(join(root, 'deck', 'deck.mjs'), DECK, 'utf-8');
  const t = renderDeckTool(root);
  const r = (await t.execute({}, new AbortController().signal)) as { ok: boolean; error?: string };
  if (!r.ok) throw new Error(`seed render 失败：${r.error}`);
}

async function tmpRoot(tag: string): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), `rs-x-${tag}-`));
  const root = join(base, 'proj_x');
  await mkdir(root, { recursive: true });
  return root;
}

describe('QA 与导出（T5）', () => {
  it('qaDeck：好 deck pass；坏 zip flag；敏感材料 flag', async () => {
    const root = await tmpRoot('qa');
    try {
      const missing = await qaDeck(root);
      expect(missing.ok).toBe(false);
      expect(missing.items[0]!.item).toBe('deck_artifact');

      await seedGoodDeck(root);
      const good = await qaDeck(root);
      expect(good.ok).toBe(true);
      expect(good.slides).toBe(1);
      expect(good.text_boxes).toBeGreaterThan(0);
      expect(good.items.find((i) => i.item === 'sensitive_sources')!.status).toBe('pass');

      await mkdir(join(root, 'sources'), { recursive: true });
      await writeFile(join(root, 'sources', 'src_s1.json'), JSON.stringify({ source_id: 'src_s1', filename: '机密表.xlsx', sensitivity: 'sensitive' }), 'utf-8');
      const flagged = await qaDeck(root);
      expect(flagged.items.find((i) => i.item === 'sensitive_sources')!.status).toBe('flag');
      expect(flagged.ok).toBe(true); // 隐私建议不阻断（G8）

      await writeFile(join(root, 'deck', 'deck.pptx'), 'not a zip', 'utf-8');
      const corrupt = await qaDeck(root);
      expect(corrupt.ok).toBe(false);
      expect(corrupt.items[0]!.item).toBe('zip_integrity');
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('export_deck 工具：三格式落 deck/export/；qa 不过则拒', async () => {
    const root = await tmpRoot('tool');
    try {
      const t = exportDeckTool(root);
      const blocked = (await t.execute({}, new AbortController().signal)) as { ok: boolean };
      expect(blocked.ok).toBe(false);

      await seedGoodDeck(root);
      const r = (await t.execute({}, new AbortController().signal)) as { ok: boolean; files: string[] };
      expect(r.ok).toBe(true);
      expect(r.files.length).toBe(3);
      for (const f of ['deck.pptx', 'deck.html', 'deck.pdf']) {
        expect(existsSync(join(root, 'deck', 'export', f))).toBe(true);
      }
      const html = await readFile(join(root, 'deck', 'export', 'deck.html'), 'utf-8');
      expect(html).toContain('页一标题');
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('导出路由：三格式入 exports 记录，列表与下载可用', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rs-x-api-'));
    const store = new WorkspaceStore(dir);
    let app: FastifyInstance | null = buildServer(store);
    try {
      const created = await app!.inject({ method: 'POST', url: '/api/projects', payload: { title: '导出测试' } });
      const id = (created.json() as { project: { project_id: string } }).project.project_id;
      await seedGoodDeck(join(dir, id));

      const exp = await app!.inject({ method: 'POST', url: `/api/projects/${id}/export`, payload: { formats: ['pptx', 'html', 'pdf'] } });
      expect(exp.statusCode).toBe(200);
      const body = exp.json() as { ok: boolean; qa: { ok: boolean }; exports: Array<{ format: string; export_id: string }> };
      expect(body.ok).toBe(true);
      expect(body.qa.ok).toBe(true);
      expect(body.exports).toHaveLength(3);

      const list = await app!.inject({ method: 'GET', url: `/api/projects/${id}/exports` });
      expect((list.json() as { exports: unknown[] }).exports.length).toBe(3);

      const eid = body.exports.find((e) => e.format === 'pptx')!.export_id;
      const file = await app!.inject({ method: 'GET', url: `/api/projects/${id}/exports/${eid}/file` });
      expect(file.statusCode).toBe(200);
      expect(file.headers['content-type']).toContain('presentationml');
      expect(file.rawPayload[0]).toBe(0x50); // PK

      const noDeck = await app!.inject({ method: 'POST', url: `/api/projects/proj_none/export`, payload: { formats: ['pptx'] } });
      expect(noDeck.statusCode).toBeGreaterThanOrEqual(400);
    } finally {
      await app!.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

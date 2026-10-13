import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { snapshotRenderOutline, detectOutlineDrift } from '../src/agent/outline-drift.js';
import { renderDeckTool } from '../src/agent/tools/render-deck-tool.js';

const P = (title: string) => ({ title, page_type: 'content' });

async function seedOutline(root: string, titles: string[], confirmed = true) {
  const pages = titles.map(P);
  await writeFile(join(root, 'outline.json'), JSON.stringify({
    version: 1,
    current: { version: 3, pages, questions: [], proposed_at: '2026-10-13T00:00:00Z', origin: 'agent' },
    confirmed,
    ...(confirmed ? { confirmed_at: '2026-10-13T00:01:00Z', confirmed_pages: pages } : {}),
  }), 'utf-8');
}

async function seedPages(root: string, n: number) {
  await mkdir(join(root, 'deck', 'pages'), { recursive: true });
  for (let i = 1; i <= n; i++) {
    await writeFile(join(root, 'deck', 'pages', `page_${String(i).padStart(2, '0')}.mjs`), `export function buildSlide(p){p.addSlide();}`);
  }
}

async function tmpRoot(tag: string): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), `rs-od-${tag}-`));
  const root = join(base, 'proj_d');
  await mkdir(root, { recursive: true });
  return root;
}

describe('大纲变更联动 outline-drift（B4 / 痛点 #5）', () => {
  it('无基线 / 未确认 → 静默 changed:false', async () => {
    const root = await tmpRoot('silent');
    try {
      await seedOutline(root, ['A', 'B', 'C']);
      await seedPages(root, 3);
      expect((await detectOutlineDrift(root)).changed).toBe(false); // 无基线

      await snapshotRenderOutline(root);
      await seedOutline(root, ['A', 'B2', 'C'], false); // 未确认（讨论中）
      expect((await detectOutlineDrift(root)).changed).toBe(false);
    } finally { await rm(root, { recursive: true, force: true }).catch(() => {}); }
  });

  it('同位标题变 → changed_pages 命中；affected 只含存在页文件', async () => {
    const root = await tmpRoot('change');
    try {
      await seedOutline(root, ['封面', '经营概览', '风险与展望']);
      await seedPages(root, 3);
      await snapshotRenderOutline(root);
      await seedOutline(root, ['封面', '经营概览（修订）', '风险与展望', '附录']); // 第 2 章改题 + 新增附录
      const d = await detectOutlineDrift(root);
      expect(d.changed).toBe(true);
      expect(d.changed_pages).toEqual([{ page: 'page_02', old_title: '经营概览', new_title: '经营概览（修订）' }]);
      expect(d.added_titles).toEqual(['附录']);
      expect(d.affected_pages).toEqual(['page_02']); // 附录无页文件不进 affected
    } finally { await rm(root, { recursive: true, force: true }).catch(() => {}); }
  });

  it('大纲缩短 → removed_pages 列多余页并进 affected', async () => {
    const root = await tmpRoot('shrink');
    try {
      await seedOutline(root, ['A', 'B', 'C', 'D']);
      await seedPages(root, 4);
      await snapshotRenderOutline(root);
      await seedOutline(root, ['A', 'B']);
      const d = await detectOutlineDrift(root);
      expect(d.removed_pages).toEqual([{ page: 'page_03', title: 'C' }, { page: 'page_04', title: 'D' }]);
      expect(d.affected_pages).toEqual(['page_03', 'page_04']);
    } finally { await rm(root, { recursive: true, force: true }).catch(() => {}); }
  });

  it('重生成后重新快照 → 自愈 changed:false；affected 过滤不存在的页文件', async () => {
    const root = await tmpRoot('heal');
    try {
      await seedOutline(root, ['A', 'B', 'C']);
      await seedPages(root, 2); // page_03 不存在
      await snapshotRenderOutline(root);
      await seedOutline(root, ['A', 'B2', 'C2']);
      let d = await detectOutlineDrift(root);
      expect(d.changed_pages.map((c) => c.page)).toEqual(['page_02', 'page_03']);
      expect(d.affected_pages).toEqual(['page_02']); // page_03 无文件被过滤

      await snapshotRenderOutline(root); // 重生成后再渲染 → 基线追平
      d = await detectOutlineDrift(root);
      expect(d.changed).toBe(false);
    } finally { await rm(root, { recursive: true, force: true }).catch(() => {}); }
  });

  it('render_deck 成功 → 写大纲基线快照（真渲染链）', async () => {
    const root = await tmpRoot('render');
    try {
      await seedOutline(root, ['封面', '概览']);
      await mkdir(join(root, 'deck', 'pages'), { recursive: true });
      await writeFile(join(root, 'deck', 'pages', 'page_01.mjs'), `import pptxgen from 'pptxgenjs';\nexport function buildSlide(p) { const s = p.addSlide(); s.addText('封面', { x: 1, y: 3, w: 11, h: 1 }); }`);
      await writeFile(join(root, 'deck', 'pages', 'page_02.mjs'), `import pptxgen from 'pptxgenjs';\nexport function buildSlide(p) { const s = p.addSlide(); s.addText('概览', { x: 1, y: 3, w: 11, h: 1 }); }`);
      await writeFile(join(root, 'deck', 'deck.mjs'), `import pptxgen from 'pptxgenjs';\nimport { buildSlide as p1 } from './pages/page_01.mjs';\nimport { buildSlide as p2 } from './pages/page_02.mjs';\nconst pptx = new pptxgen();\npptx.defineLayout({ name: 'W', width: 13.33, height: 7.5 });\npptx.layout = 'W';\np1(pptx);\np2(pptx);\nawait pptx.writeFile({ fileName: 'deck/deck.pptx' });`);
      const r = await renderDeckTool(root).execute({ expected_slides: 2 }, new AbortController().signal);
      expect((r as { ok: boolean }).ok).toBe(true);
      const baseline = JSON.parse(await readFile(join(root, 'work', 'render-outline.json'), 'utf-8')) as { titles: string[] };
      expect(baseline.titles).toEqual(['封面', '概览']);
    } finally { await rm(root, { recursive: true, force: true }).catch(() => {}); }
  });
});

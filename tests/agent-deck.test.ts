import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { ModelReply, ModelTransport } from 'pi-agent-runtime';
import { renderDeckTool } from '../src/agent/tools/render-deck-tool.js';
import { SessionHost } from '../src/agent/session-host.js';
import { MINIMAX_M3 } from '../src/agent/model.js';

const PAGE_A = `import pptxgen from 'pptxgenjs';
export function buildSlide(pptx) {
  const s = pptx.addSlide();
  s.background = { color: 'f7f6f3' };
  s.addText('Q3 复盘封面', { x: 1, y: 3, w: 11, h: 1, fontSize: 30, bold: true, color: '263442', fontFace: 'PingFang SC' });
}`;
const PAGE_B = `import pptxgen from 'pptxgenjs';
export function buildSlide(pptx) {
  const s = pptx.addSlide();
  s.addText('行动建议', { x: 1, y: 3, w: 11, h: 1, fontSize: 26, color: '242830', fontFace: 'PingFang SC' });
}`;
const DECK = `import pptxgen from 'pptxgenjs';
import { buildSlide as p01 } from './pages/page_01.mjs';
import { buildSlide as p02 } from './pages/page_02.mjs';
const pptx = new pptxgen();
pptx.defineLayout({ name: 'W', width: 13.33, height: 7.5 });
pptx.layout = 'W';
p01(pptx);
p02(pptx);
await pptx.writeFile({ fileName: 'deck/deck.pptx' });
console.log('deck written');`;

async function seedDeck(root: string, files: Record<string, string>): Promise<void> {
  for (const [name, content] of Object.entries(files)) {
    const full = join(root, 'deck', name);
    await mkdir(join(full, '..'), { recursive: true });
    await writeFile(full, content, 'utf-8');
  }
}

async function tmpRoot(): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), 'rs-deck-'));
  const root = join(base, 'proj_d');
  await mkdir(root, { recursive: true });
  return root;
}

describe('render_deck（T3）', () => {
  it('好 js → deck.pptx 落盘 + slide 计数 + 预览清单（缺预览给 warning）', async () => {
    const root = await tmpRoot();
    try {
      await seedDeck(root, {
        'pages/page_01.mjs': PAGE_A,
        'pages/page_02.mjs': PAGE_B,
        'pages/page_01.html': '<html><body>封面</body></html>',
        'deck.mjs': DECK,
      });
      const t = renderDeckTool(root);
      const r = (await t.execute({}, new AbortController().signal)) as { ok: boolean; slides: number; warnings?: string[]; pages: Array<{ html_preview: string | null }> };
      expect(r.ok).toBe(true);
      expect(r.slides).toBe(2);
      expect(existsSync(join(root, 'deck', 'deck.pptx'))).toBe(true);
      expect(r.pages[0]!.html_preview).toBe('deck/pages/page_01.html');
      expect(r.pages[1]!.html_preview).toBeNull();
      expect(r.warnings?.some((w) => w.includes('1 页缺少同名 .html 预览'))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('坏 js（语法错）→ stderr 详情返回模型（自纠素材）', async () => {
    const root = await tmpRoot();
    try {
      await seedDeck(root, { 'pages/page_01.mjs': 'const x = {', 'deck.mjs': "import './pages/page_01.mjs';" });
      const t = renderDeckTool(root);
      const r = (await t.execute({}, new AbortController().signal)) as { ok: boolean; error: string; hint: string };
      expect(r.ok).toBe(false);
      expect(r.error).toContain('执行失败');
      expect(r.hint).toContain('edit');
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('无产物 / 无 slide / 页数偏差', async () => {
    const root = await tmpRoot();
    try {
      const t = renderDeckTool(root);
      const none = (await t.execute({}, new AbortController().signal)) as { ok: boolean; error: string };
      expect(none.ok).toBe(false);
      expect(none.error).toContain('deck.mjs 不存在');

      await seedDeck(root, {
        'pages/page_01.mjs': PAGE_A,
        'deck.mjs': `import pptxgen from 'pptxgenjs';\nimport { buildSlide as p01 } from './pages/page_01.mjs';\nconst pptx = new pptxgen();\nawait pptx.writeFile({ fileName: 'deck/deck.pptx' });`,
      });
      const noslide = (await t.execute({}, new AbortController().signal)) as { ok: boolean; error: string };
      expect(noslide.ok).toBe(false);
      // pptxgenjs 对 0 slide 直接抛错：工具将其作为渲染失败返回（等效拒绝），或校验层拦截
      expect(noslide.error).toMatch(/没有 slide|执行失败/);

      await seedDeck(root, { 'pages/page_02.mjs': PAGE_B, 'deck.mjs': DECK });
      const mismatch = (await t.execute({ expected_slides: 5 }, new AbortController().signal)) as { ok: boolean; warnings?: string[] };
      expect(mismatch.ok).toBe(true);
      expect(mismatch.warnings?.some((w) => w.includes('5 不一致'))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('SessionHost 缝：合成 toolCall 驱动 render_deck → 产物落盘', async () => {
    const root = await tmpRoot();
    try {
      await seedDeck(root, { 'pages/page_01.mjs': PAGE_A, 'deck.mjs': `import pptxgen from 'pptxgenjs';\nimport { buildSlide as p01 } from './pages/page_01.mjs';\nconst pptx = new pptxgen();\npptx.defineLayout({ name: 'W', width: 13.33, height: 7.5 });\npptx.layout = 'W';\np01(pptx);\nawait pptx.writeFile({ fileName: 'deck/deck.pptx' });` });
      let call = 0;
      const requests: string[] = [];
      const transport: ModelTransport = async (req) => {
        for (const m of req.messages) requests.push(m.text);
        call += 1;
        if (call === 1) {
          return { content: [{ kind: 'tool', id: 'c1', name: 'render_deck', arguments: { expected_slides: 1 } }], stop: 'tools', usage: { inputTokens: 20, outputTokens: 4 } } as unknown as ModelReply;
        }
        return { content: [{ kind: 'text', text: 'deck 已渲染完成。' }], stop: 'complete', usage: { inputTokens: 20, outputTokens: 4 } } as unknown as ModelReply;
      };
      const host = await SessionHost.create({ projectRoot: root, skillsDir: root, model: MINIMAX_M3, transport, auditFile: join(root, 'a.jsonl'), budgetFile: join(root, 'b.json') });
      await host.send('生成');
      const result = await host.currentResult();
      expect(result?.status).toBe('succeeded');
      expect(existsSync(join(root, 'deck', 'deck.pptx'))).toBe(true);
      expect(requests.some((t) => t.includes('渲染成功'))).toBe(true);
      await host.close();
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('页文件双扩展兼容：agent 写 .js 也能被清单/导出识别（真调教训 R1）', async () => {
    const root = await tmpRoot();
    try {
      await seedDeck(root, {
        'pages/page_01.js': PAGE_A,
        'deck.mjs': `import pptxgen from 'pptxgenjs';
import { buildSlide as p01 } from './pages/page_01.js';
const pptx = new pptxgen();
pptx.defineLayout({ name: 'W', width: 13.33, height: 7.5 });
pptx.layout = 'W';
p01(pptx);
await pptx.writeFile({ fileName: 'deck/deck.pptx' });`,
      });
      const t = renderDeckTool(root);
      const r = (await t.execute({ expected_slides: 1 }, new AbortController().signal)) as { ok: boolean; slides: number; pages: Array<{ file: string }> };
      expect(r.ok).toBe(true);
      expect(r.pages[0]!.file).toBe('deck/pages/page_01.js');

      const { buildDeckExports } = await import('../src/agent/export-deck.js');
      const html = (await buildDeckExports(root, ['html']))[0]!;
      expect(html.artifact.toString()).toContain('Q3 复盘封面');
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('skill 含 deck 组织规范（.mjs/buildSlide/render_deck 纪律）', async () => {
    const skill = await readFile('assets/skills/ppt/SKILL.md', 'utf-8');
    expect(skill).toContain('deck/pages/page_01.mjs');
    expect(skill).toContain('buildSlide');
    expect(skill).toContain('render_deck');
  });
});

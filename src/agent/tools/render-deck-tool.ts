import { existsSync, realpathSync, symlinkSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import type { JsonValue, Tool } from 'pi-agent-runtime';
import { listDeckPages } from '../deck-files.js';

/**
 * render_deck 工具（T3，D8）：执行 deck/deck.mjs（agent 写的分页 ESM 汇总）→ 校验 deck/deck.pptx
 * （PK 头 + JSZip slide 计数）→ 收集每页 HTML 预览清单。stderr 原样返回给模型（自纠素材）。
 * 约定（SKILL.md §六）：deck/pages/page_XX.mjs 导出 buildSlide(pptx)；deck/deck.mjs 汇总并
 * writeFile('deck/deck.pptx')；每页同名 .html 静态预览（1280×720）供人审。
 */

const execFileAsync = promisify(execFile);

interface DeckPage {
  file: string;
  html_preview: string | null;
  bytes: number;
}

async function countSlides(pptxPath: string): Promise<number> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await readFile(pptxPath));
  return Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length;
}

export function renderDeckTool(projectRoot: string): Tool {
  return {
    name: 'render_deck',
    description: [
      '渲染整套 PPT：运行 deck/deck.mjs 生成 deck/deck.pptx 并校验（zip 完整性 + slide 计数）。',
      '前置：已写出 deck/pages/page_XX.mjs（export function buildSlide(pptx)）与 deck/deck.mjs（汇总并 await pptx.writeFile({fileName:"deck/deck.pptx"})）。',
      '每页请同时写同名 .html 静态预览（1280×720，同布局）供用户审阅。渲染失败会返回 stderr，读错误改代码后重调本工具。',
    ].join(''),
    effect: 'write',
    parameters: { type: 'object', properties: { expected_slides: { type: 'number', description: '确认框架的页数（用于一致性校验）' } } },
    resourceUnits: 2,
    replay: 'never',
    execute: async (args): Promise<JsonValue> => {
      const deckDir = join(projectRoot, 'deck');
      const deckFile = join(deckDir, 'deck.mjs');
      if (!existsSync(deckFile)) {
        return { ok: false, error: 'deck/deck.mjs 不存在：先用 write 工具写 pages/page_XX.mjs 与 deck.mjs，再调用 render_deck' };
      }
      // deck 脚本依赖仓库 node_modules（pptxgenjs）：项目根可能不在仓库内（REPORT_STUDIO_HOME 可迁移），
      // 以项目根 node_modules 相对符号链接兜底（幂等；两侧 realpath 归一后再求相对——macOS /var→/private/var
      // 这类链会使按逻辑路径计算的相对层数错位；.gitignore 排除 data/*/node_modules）
      const repoNodeModules = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'node_modules');
      const projectNodeModules = join(projectRoot, 'node_modules');
      if (!existsSync(projectNodeModules) && existsSync(repoNodeModules)) {
        try {
          symlinkSync(relative(realpathSync(projectRoot), realpathSync(repoNodeModules)), projectNodeModules, 'dir');
        } catch { /* 并发或平台限制：失败不阻断，错误会在渲染时明示 */ }
      }
      const result: Record<string, JsonValue> = {};
      try {
        const { stdout, stderr } = await execFileAsync('node', [deckFile], {
          cwd: projectRoot,
          timeout: 120_000,
          maxBuffer: 2 * 1024 * 1024,
          env: process.env,
        });
        if (stdout.trim()) result.stdout = stdout.slice(0, 1000);
        if (stderr.trim()) result.stderr = stderr.slice(0, 2000);
      } catch (e) {
        const err = e as { stderr?: string; stdout?: string; message?: string };
        return {
          ok: false,
          error: `deck.mjs 执行失败：${(err.stderr || err.message || '').slice(0, 1500)}`,
          hint: '读 stderr 定位错误 → 用 edit 工具改对应 page_XX.mjs / deck.mjs → 重新调用 render_deck',
        };
      }
      const pptxPath = join(deckDir, 'deck.pptx');
      if (!existsSync(pptxPath)) {
        return { ok: false, error: '渲染完成但未找到 deck/deck.pptx：检查 writeFile({fileName:"deck/deck.pptx"}) 与输出路径', ...(Object.keys(result).length ? result : {}) };
      }
      const buf = await readFile(pptxPath);
      if (buf.length < 100 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
        return { ok: false, error: 'deck/deck.pptx 不是合法 PPTX（zip 头缺失）：检查 writeFile 调用与 pptxgenjs 用法' };
      }
      let slides = 0;
      try {
        slides = await countSlides(pptxPath);
      } catch {
        return { ok: false, error: 'deck/deck.pptx 无法解包（zip 损坏）：检查 writeFile 是否完整落盘' };
      }
      if (slides === 0) return { ok: false, error: 'deck.pptx 内没有 slide：确认 deck.mjs 对每个 page_XX.mjs 都调用了 buildSlide(pptx)' };

      const expected = (args as { expected_slides?: unknown }).expected_slides;
      const warnings: string[] = [];
      if (typeof expected === 'number' && expected > 0 && slides !== expected) {
        warnings.push(`slide 数 ${slides} 与确认框架页数 ${expected} 不一致`);
      }

      const pages: DeckPage[] = (await listDeckPages(projectRoot)).map((p) => ({ file: p.code, html_preview: p.html, bytes: p.bytes }));
      const missingPreview = pages.filter((p) => !p.html_preview).length;
      if (missingPreview > 0) warnings.push(`${missingPreview} 页缺少同名 .html 预览（用户看不到该页近似预览）`);

      return {
        ok: true,
        slides,
        pptx: 'deck/deck.pptx',
        bytes: buf.length,
        pages: pages as unknown as JsonValue,
        ...(warnings.length ? { warnings } : {}),
        message: `渲染成功：deck/deck.pptx（${slides} 页，${Math.round(buf.length / 1024)}KB）已生成并通过校验。${warnings.length ? '注意：' + warnings.join('；') : ''}`,
      };
    },
  };
}

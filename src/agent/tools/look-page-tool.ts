import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { JsonValue, Tool } from 'pi-agent-runtime';
import { listDeckPages } from '../deck-files.js';
import { fallbackPreviewHtml, shootHtmlJpeg } from '../deck-preview.js';

/**
 * look_page 视觉自检（flow-2 U3，运行条件对齐 C3）：把指定页渲染成图回给模型（vision），
 * skill 要求交付前逐页看图检查遮挡/溢出/层级/留白。JPEG q80 控制 token 成本。
 */
export function lookPageTool(projectRoot: string): Tool {
  return {
    name: 'look_page',
    description: [
      '渲染指定页的预览图并返回给你看（视觉自检）。deck 渲染成功后，交付前应逐页 look_page 检查：文字遮挡、溢出边界、对齐、留白失衡、字号过小；发现问题→改该页代码→render_deck 重渲→再看一次。',
      '参数 page：页名（如 page_01）。',
    ].join(''),
    effect: 'read',
    parameters: { type: 'object', properties: { page: { type: 'string', description: '页名 page_01…page_NN' } }, required: ['page'] },
    resourceUnits: 1,
    replay: 'safe',
    output: 'content',
    execute: async (args): Promise<JsonValue> => {
      const page = String((args as { page?: unknown }).page ?? '');
      // 错误路径也必须 content 形状（output:'content' 工具裸 JsonValue 会被 SDK 校验拒杀整轮，R2-F1）
      const errContent = (msg: string) => ({ content: [{ kind: 'text', text: JSON.stringify({ ok: false, error: msg }) }], details: null }) as unknown as JsonValue;
      const entry = (await listDeckPages(projectRoot)).find((p) => p.name === page);
      if (!entry) return errContent(`页不存在：${page}（先 render_deck；页名见 render_deck 返回的 pages 列表）`);
      try {
        const html = entry.html
          ? await readFile(join(projectRoot, entry.html), 'utf-8')
          : fallbackPreviewHtml(await readFile(join(projectRoot, entry.code), 'utf-8'), page);
        const jpeg = await shootHtmlJpeg(html); // 1280×720 JPEG q80
        return {
          content: [{ kind: 'image', data: jpeg.toString('base64'), mimeType: 'image/jpeg' }],
          details: { page, source: entry.html ? 'agent-html' : 'fallback' },
        } as unknown as JsonValue;
      } catch (e) {
        return errContent(`截图失败：${(e as Error).message.slice(0, 160)}`);
      }
    },
  };
}

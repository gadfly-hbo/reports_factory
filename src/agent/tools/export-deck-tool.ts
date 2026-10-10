import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { JsonValue, Tool } from 'pi-agent-runtime';
import { buildDeckExports } from '../export-deck.js';
import { qaDeck } from '../qa-deck.js';

/** export_deck 工具（T5，D8）：agent 侧导出三格式到 deck/export/（用户侧走导出路由入 exports 记录）。 */
export function exportDeckTool(projectRoot: string): Tool {
  return {
    name: 'export_deck',
    description: '把 deck 导出为 pptx/html/pdf 到 deck/export/ 目录（pptx=当前工件直出；html/pdf=页面合集）。导出前建议先 qa_deck。',
    effect: 'write',
    parameters: {
      type: 'object',
      properties: { formats: { type: 'array', items: { type: 'string', enum: ['pptx', 'html', 'pdf'] }, description: '导出格式子集，缺省全部三种' } },
    },
    resourceUnits: 2,
    replay: 'never',
    execute: async (args): Promise<JsonValue> => {
      const q = await qaDeck(projectRoot);
      if (!q.ok) return { ok: false, error: '质检未通过（deck 缺失或损坏）：先 render_deck 出合法工件', qa: q as unknown as JsonValue };
      const want = (args as { formats?: string[] }).formats;
      const formats = (Array.isArray(want) && want.length ? want : ['pptx', 'html', 'pdf']).filter((f): f is 'pptx' | 'html' | 'pdf' => ['pptx', 'html', 'pdf'].includes(f));
      const outDir = join(projectRoot, 'deck', 'export');
      await mkdir(outDir, { recursive: true });
      const files: string[] = [];
      for (const e of await buildDeckExports(projectRoot, formats)) {
        const name = `deck.${e.format}`;
        await writeFile(join(outDir, name), e.artifact);
        files.push(`deck/export/${name}（${Math.round(e.artifact.length / 1024)}KB）`);
      }
      return { ok: true, files, qa: q as unknown as JsonValue, message: `已导出：${files.join('、')}。正式下载请让用户在导出区点击（入导出记录）。` };
    },
  };
}

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** deck 页清单（合同 .mjs；模型偶发 .js 也兼容——同名双扩展时 .mjs 优先）。 */
export interface DeckPageFile {
  /** 无扩展页名（page_01） */
  name: string;
  /** 页面代码路径（项目根相对） */
  code: string;
  /** HTML 预览路径（存在时） */
  html: string | null;
  bytes: number;
}

export async function listDeckPages(projectRoot: string): Promise<DeckPageFile[]> {
  const pagesDir = join(projectRoot, 'deck', 'pages');
  if (!existsSync(pagesDir)) return [];
  const { stat } = await import('node:fs/promises');
  const names = new Map<string, string>(); // pageName -> 扩展（.mjs 优先）
  for (const f of await readdir(pagesDir)) {
    const m = /^(page_[\w-]+)\.(mjs|js)$/.exec(f);
    if (!m) continue;
    const [_, name, ext] = m as unknown as [string, string, string];
    if (names.has(name) && names.get(name) === '.mjs') continue;
    names.set(name, ext);
  }
  const out: DeckPageFile[] = [];
  for (const [name, ext] of [...names.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) {
    const code = `deck/pages/${name}.${ext}`;
    const htmlName = `deck/pages/${name}.html`;
    out.push({ name, code, html: existsSync(join(projectRoot, htmlName)) ? htmlName : null, bytes: (await stat(join(projectRoot, code))).size });
  }
  return out;
}

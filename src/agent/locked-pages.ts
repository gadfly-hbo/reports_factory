import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/** 页锁定（flow-10 P2-2，#18 简化版）：手工定稿页不被 agent 覆盖。 */

export async function readLockedPages(projectRoot: string): Promise<string[]> {
  try {
    return JSON.parse(await readFile(join(projectRoot, 'work', 'locked-pages.json'), 'utf-8')) as string[];
  } catch { return []; }
}

export async function writeLockedPages(projectRoot: string, pages: string[]): Promise<void> {
  await mkdir(join(projectRoot, 'work'), { recursive: true });
  await writeFile(join(projectRoot, 'work', 'locked-pages.json'), JSON.stringify(pages, null, 1), 'utf-8');
}

/** 路径是否命中锁定页（如 deck/pages/page_03.mjs 匹配锁定 page_03）。 */
export function isLockedPath(locked: string[], path: string): boolean {
  const m = /page_[\w-]+\.(mjs|js|html)$/.exec(path);
  if (!m) return false;
  const name = m[0]!.replace(/\.(mjs|js|html)$/, '');
  return locked.includes(name);
}

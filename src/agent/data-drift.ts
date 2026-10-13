import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readManifest, type MaterialEntry } from './materials.js';
import { listDeckPages } from './deck-files.js';

/**
 * 数据联动（flow-11 P3，#15）：材料数字变更 → 受影响页清单 → 提示重生成。
 * 不做实时数据绑定——「agent 写代码」范式下用变更影响链替代。
 */

export interface PageImpact {
  page: string;
  numbers: Array<{ value: string; source_file: string }>;
}

export interface DriftResult {
  changed_sources: Array<{ source_id: string; filename: string; changed_numbers: string[] }>;
  affected_pages: string[];
}

const NUM_RE = /(?<![\d.])(\d{1,12}(?:\.\d+)?)(?![\d])/g;
const norm = (n: string) => n.replace(/^0+(?=\d)/, '');

function extractNumbers(text: string): Set<string> {
  const s = new Set<string>();
  for (const m of text.replace(/,/g, '').matchAll(NUM_RE)) s.add(norm(m[1]!));
  return s;
}

/** 构建页级数据依赖图：每页引用了哪些材料数字（raw 匹配；推导值不追——agent 重读时自然更新）。 */
export async function buildImpactMap(projectRoot: string): Promise<PageImpact[]> {
  const manifest = await readManifest(projectRoot);
  const materialNumbers = new Map<string, { numbers: Set<string>; filename: string }>();
  for (const m of manifest.materials) {
    if (m.status !== 'ready') continue;
    try {
      const text = await readFile(join(projectRoot, m.extract_file), 'utf-8');
      materialNumbers.set(m.source_id, { numbers: extractNumbers(text), filename: m.filename });
    } catch { /* skip */ }
  }
  if (materialNumbers.size === 0) return [];

  const impacts: PageImpact[] = [];
  for (const page of await listDeckPages(projectRoot)) {
    let code: string;
    try { code = await readFile(join(projectRoot, page.code), 'utf-8'); } catch { continue; }
    const codeNumbers = extractNumbers(code);
    if (codeNumbers.size === 0) continue;
    const refs: Array<{ value: string; source_file: string }> = [];
    for (const [sid, { numbers, filename }] of materialNumbers) {
      for (const n of codeNumbers) {
        if (numbers.has(n)) refs.push({ value: n, source_file: filename });
      }
    }
    if (refs.length > 0) impacts.push({ page: page.name, numbers: refs });
  }

  // 持久化
  const dir = join(projectRoot, 'work');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'impact-map.json'), JSON.stringify(impacts, null, 1), 'utf-8');
  return impacts;
}

/** 读取 impact-map（无则空数组）。 */
export async function readImpactMap(projectRoot: string): Promise<PageImpact[]> {
  try {
    return JSON.parse(await readFile(join(projectRoot, 'work', 'impact-map.json'), 'utf-8')) as PageImpact[];
  } catch { return []; }
}

/** 检测数据漂移：对比 impact-map 构建时的材料快照与当前材料文本。 */
export async function detectDrift(projectRoot: string): Promise<DriftResult> {
  const manifest = await readManifest(projectRoot);
  const impacts = await readImpactMap(projectRoot);
  if (impacts.length === 0 || manifest.materials.length === 0) return { changed_sources: [], affected_pages: [] };

  // 当前材料数字
  const currentNumbers = new Map<string, { numbers: Set<string>; filename: string }>();
  for (const m of manifest.materials) {
    if (m.status !== 'ready') continue;
    try {
      const text = await readFile(join(projectRoot, m.extract_file), 'utf-8');
      currentNumbers.set(m.source_id, { numbers: extractNumbers(text), filename: m.filename });
    } catch { /* skip */ }
  }

  // impact-map 中的快照数字（从页引用反推——仅含被引用的数字，非全量）
  const referencedNumbers = new Map<string, Set<string>>(); // source_file → referenced numbers
  for (const imp of impacts) {
    for (const ref of imp.numbers) {
      if (!referencedNumbers.has(ref.source_file)) referencedNumbers.set(ref.source_file, new Set());
      referencedNumbers.get(ref.source_file)!.add(ref.value);
    }
  }

  const changed_sources: DriftResult['changed_sources'] = [];
  const affectedPages = new Set<string>();

  for (const [sid, { numbers, filename }] of currentNumbers) {
    const referenced = referencedNumbers.get(filename);
    if (!referenced) continue;
    const changed: string[] = [];
    for (const n of referenced) {
      if (!numbers.has(n)) changed.push(n); // 引用的数字在新材料中消失/变更
    }
    if (changed.length > 0) {
      changed_sources.push({ source_id: sid, filename, changed_numbers: changed });
      for (const imp of impacts) {
        if (imp.numbers.some((r) => r.source_file === filename && changed.includes(r.value))) {
          affectedPages.add(imp.page);
        }
      }
    }
  }

  return { changed_sources, affected_pages: [...affectedPages].sort() };
}

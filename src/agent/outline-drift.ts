import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { readOutline } from './outline.js';
import { listDeckPages } from './deck-files.js';

/**
 * 大纲变更联动（flow-15 B4，#5）：镜像 #15 数据联动模式——render 成功时快照已确认大纲基线，
 * 对比当前确认大纲 → 受影响页清单 → chip + 一键重生成 + chat 注入。重生成后再渲染基线追平（自愈）。
 * 仅 confirmed 状态比较（提案讨论期静默）。
 */

export interface OutlineDriftResult {
  changed: boolean;
  changed_pages: Array<{ page: string; old_title: string; new_title: string }>;
  removed_pages: Array<{ page: string; title: string }>;
  added_titles: string[];
  affected_pages: string[];
}

interface RenderOutlineBaseline {
  version: number;
  titles: string[];
}

const EMPTY: OutlineDriftResult = { changed: false, changed_pages: [], removed_pages: [], added_titles: [], affected_pages: [] };

/** render_deck 成功时调用：快照当时渲染所据的大纲标题序（confirmed_pages ?? current.pages）。 */
export async function snapshotRenderOutline(projectRoot: string): Promise<boolean> {
  const state = await readOutline(projectRoot);
  const pages = state.confirmed_pages ?? state.current?.pages ?? null;
  if (!pages || pages.length === 0) return false;
  const baseline: RenderOutlineBaseline = { version: state.current?.version ?? 0, titles: pages.map((p) => p.title.trim()) };
  await mkdir(join(projectRoot, 'work'), { recursive: true });
  await writeFile(join(projectRoot, 'work', 'render-outline.json'), JSON.stringify(baseline, null, 1), 'utf-8');
  return true;
}

async function readBaseline(projectRoot: string): Promise<RenderOutlineBaseline | null> {
  try {
    const raw = JSON.parse(await readFile(join(projectRoot, 'work', 'render-outline.json'), 'utf-8')) as RenderOutlineBaseline;
    return Array.isArray(raw.titles) ? raw : null;
  } catch { return null; }
}

/** 检测大纲漂移：基线 titles vs 当前 confirmed_pages（index 比对；页序=大纲序为仓库既有假设）。 */
export async function detectOutlineDrift(projectRoot: string): Promise<OutlineDriftResult> {
  const baseline = await readBaseline(projectRoot);
  if (!baseline) return { ...EMPTY };
  const state = await readOutline(projectRoot);
  if (!state.confirmed || !state.confirmed_pages) return { ...EMPTY };

  const currentTitles = state.confirmed_pages.map((p) => p.title.trim());
  const changed_pages: OutlineDriftResult['changed_pages'] = [];
  const removed_pages: OutlineDriftResult['removed_pages'] = [];
  for (let i = 0; i < baseline.titles.length; i++) {
    const page = `page_${String(i + 1).padStart(2, '0')}`;
    const oldTitle = baseline.titles[i]!;
    const newTitle = currentTitles[i];
    if (newTitle === undefined) removed_pages.push({ page, title: oldTitle });
    else if (newTitle !== oldTitle) changed_pages.push({ page, old_title: oldTitle, new_title: newTitle });
  }
  const added_titles = currentTitles.slice(baseline.titles.length);

  const existing = new Set((await listDeckPages(projectRoot)).map((p) => p.name));
  const candidates = new Set([...changed_pages, ...removed_pages].map((c) => c.page));
  const affected_pages = [...candidates].filter((p) => existing.has(p)).sort();
  const changed = changed_pages.length > 0 || removed_pages.length > 0 || added_titles.length > 0;
  return { changed, changed_pages, removed_pages, added_titles, affected_pages };
}

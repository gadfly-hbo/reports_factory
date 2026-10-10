import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 框架提案存储（T2，D9/G1/G4）：
 * - agent 经 propose_outline 工具出新提案 → 版本 +1（G4：聊天意见 → 新版本）
 * - 用户在提案卡上编辑保存 → 同版本更新（G4：卡片定稿）
 * - 确认 = 快照 confirmed_pages（生成基线）；确认后**不锁定**（G1）：后续页集合变化走普通对话编辑
 * 单文件 outline.json 落盘于项目目录。
 */

export interface OutlinePage {
  title: string;
  page_type: string;
  intent?: string;
  source_hint?: string[];
}

export interface OutlineProposal {
  version: number;
  pages: OutlinePage[];
  questions: string[];
  proposed_at: string;
  origin: 'agent' | 'user_edit';
}

export interface OutlineState {
  version: 1;
  current: OutlineProposal | null;
  confirmed: boolean;
  confirmed_at?: string;
  confirmed_pages?: OutlinePage[];
  /** 历史提案（旧版本，最多保留 5 份；W3 折叠展示） */
  history?: OutlineProposal[];
}

const EMPTY: OutlineState = { version: 1, current: null, confirmed: false };

/** 校验页数组（守则：6–12 页克制，硬边界 2–24；页题非空）。非法抛 422 语义错误。 */
export function validatePages(pages: unknown): OutlinePage[] {
  if (!Array.isArray(pages) || pages.length < 2 || pages.length > 24) {
    throw Object.assign(new Error(`页数须在 2–24 之间，收到 ${Array.isArray(pages) ? pages.length : '非数组'}`), { statusCode: 422 });
  }
  return pages.map((p, i) => {
    const page = p as Partial<OutlinePage>;
    const title = typeof page.title === 'string' ? page.title.trim() : '';
    if (!title) throw Object.assign(new Error(`第 ${i + 1} 页缺少标题`), { statusCode: 422 });
    const page_type = typeof page.page_type === 'string' && page.page_type.trim() ? page.page_type.trim() : 'content';
    return {
      title,
      page_type,
      ...(typeof page.intent === 'string' && page.intent.trim() ? { intent: page.intent.trim() } : {}),
      ...(Array.isArray(page.source_hint) ? { source_hint: page.source_hint.map(String).slice(0, 8) } : {}),
    };
  });
}

export function validateQuestions(questions: unknown): string[] {
  if (questions === undefined || questions === null) return [];
  if (!Array.isArray(questions)) throw Object.assign(new Error('questions 须为数组'), { statusCode: 422 });
  const list = questions.map(String).map((q) => q.trim()).filter(Boolean);
  if (list.length > 3) throw Object.assign(new Error('待澄清问题最多 3 个'), { statusCode: 422 });
  return list;
}

export async function readOutline(projectRoot: string): Promise<OutlineState> {
  try {
    const raw = JSON.parse(await readFile(join(projectRoot, 'outline.json'), 'utf-8')) as OutlineState;
    if (raw.version === 1) return raw;
  } catch { /* 首次/缺失 */ }
  return { ...EMPTY };
}

async function writeOutline(projectRoot: string, state: OutlineState): Promise<void> {
  await mkdir(projectRoot, { recursive: true });
  await writeFile(join(projectRoot, 'outline.json'), JSON.stringify(state, null, 1), 'utf-8');
}

/** agent 新提案：版本 +1（origin=agent）。返回新版本号。 */
export async function proposeOutline(projectRoot: string, pages: OutlinePage[], questions: string[]): Promise<number> {
  const state = await readOutline(projectRoot);
  const version = (state.current?.version ?? 0) + 1;
  if (state.current) state.history = [state.current, ...(state.history ?? [])].slice(0, 5);
  state.current = { version, pages, questions, proposed_at: new Date().toISOString(), origin: 'agent' };
  state.confirmed = false; // 新提案取代旧确认基线（G4）
  await writeOutline(projectRoot, state);
  return version;
}

/** 用户在提案卡编辑保存：同版本更新（G4）。无当前提案 → 404 语义。 */
export async function updateOutlinePages(projectRoot: string, pages: OutlinePage[]): Promise<OutlineProposal> {
  const state = await readOutline(projectRoot);
  if (!state.current) throw Object.assign(new Error('尚无框架提案'), { statusCode: 404 });
  state.current = { ...state.current, pages, origin: 'user_edit' };
  await writeOutline(projectRoot, state);
  return state.current;
}

/** 确认当前提案（人决策点）：快照为生成基线。确认后不锁定（G1）。无提案 → 404。 */
export async function confirmOutline(projectRoot: string): Promise<{ version: number; pages: OutlinePage[] }> {
  const state = await readOutline(projectRoot);
  if (!state.current) throw Object.assign(new Error('尚无框架提案'), { statusCode: 404 });
  state.confirmed = true;
  state.confirmed_at = new Date().toISOString();
  state.confirmed_pages = state.current.pages;
  await writeOutline(projectRoot, state);
  return { version: state.current.version, pages: state.current.pages };
}

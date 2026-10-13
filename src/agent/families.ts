import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 场景家族（flow-7）：按场合的 PPT 结构配方。agent 的文件工具根限项目目录、
 * 读不到仓内文件——因此家族内容由宿主读取并注入 run 的 system（每 run 恰一个家族，
 * 上下文不随家族数膨胀）。新增家族 = 在 families/ 放一个 .md，零代码。
 * 文件头两行约定：`# 场景配方：<名称>` 与 `> <一行描述>`；id = 文件名（去扩展名）。
 */

export interface PptFamily {
  id: string;
  name: string;
  description: string;
  content: string;
}

export const DEFAULT_FAMILY_ID = 'business-review';

function familiesDir(): string {
  // 与宿主 skillsDir 对齐（session-host 传入；env 覆盖仅测试用且语义一致指向 ppt 目录）
  const override = process.env['REPORT_STUDIO_SKILLS_DIR'];
  const base = override ?? join(process.cwd(), 'assets', 'skills', 'ppt');
  return join(base, 'families');
}

let cached: Promise<PptFamily[]> | undefined;

export function resetFamilyCache(): void {
  cached = undefined;
}

export async function listFamilies(): Promise<PptFamily[]> {
  cached ??= (async () => {
    const dir = familiesDir();
    if (!existsSync(dir)) return [];
    const out: PptFamily[] = [];
    for (const f of (await readdir(dir)).filter((x) => x.endsWith('.md')).sort()) {
      try {
        const content = await readFile(join(dir, f), 'utf-8');
        const name = /^# 场景配方[：:]\s*(.+)$/m.exec(content)?.[1]?.trim();
        const description = /^>\s*(.+)$/m.exec(content)?.[1]?.trim() ?? '';
        if (!name) continue; // 头格式不符：跳过（坏文件降级）
        out.push({ id: f.replace(/\.md$/, ''), name, description, content });
      } catch { /* 坏文件跳过 */ }
    }
    return out;
  })();
  return cached;
}

/** 单家族配方（含降级：未设/缺失/损坏 → 默认家族；默认也缺 → 空串不阻断）。 */
export async function familyContent(id: string | undefined | null): Promise<string> {
  const want = id?.trim() || DEFAULT_FAMILY_ID;
  const families = await listFamilies();
  const hit = families.find((f) => f.id === want) ?? families.find((f) => f.id === DEFAULT_FAMILY_ID);
  return hit?.content ?? '';
}

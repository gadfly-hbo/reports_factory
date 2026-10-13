import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { readManifest } from './materials.js';

/**
 * 材料阅读覆盖（flow-8 D2，痛点 #16）：记录 agent 经 read 工具读过的路径，
 * propose_outline 前校验材料提取文本是否读全。已知局限：bash cat 读取不留痕
 * （skill 明示用 read 工具读材料）。
 */

function logFile(projectRoot: string): string {
  return join(projectRoot, 'work', 'read-log.json');
}

function normalize(projectRoot: string, p: string): string {
  const abs = resolve(projectRoot, p);
  return abs.startsWith(projectRoot + sep) || abs === projectRoot ? abs.slice(projectRoot.length + 1) : abs;
}

export async function logReadPath(projectRoot: string, path: string): Promise<void> {
  try {
    const rel = normalize(projectRoot, path);
    const existing = await readPaths(projectRoot);
    if (existing.includes(rel)) return;
    existing.push(rel);
    await mkdir(join(projectRoot, 'work'), { recursive: true });
    await writeFile(logFile(projectRoot), JSON.stringify(existing, null, 1), 'utf-8');
  } catch { /* 记录失败不阻断读取 */ }
}

export async function readPaths(projectRoot: string): Promise<string[]> {
  try {
    return JSON.parse(await readFile(logFile(projectRoot), 'utf-8')) as string[];
  } catch {
    return [];
  }
}

/** 就绪材料的提取文本中尚未被 read 过的清单（无材料/无记录均返回空）。 */
export async function unreadMaterials(projectRoot: string): Promise<string[]> {
  const manifest = await readManifest(projectRoot);
  const ready = manifest.materials.filter((m) => m.status === 'ready').map((m) => m.extract_file);
  if (ready.length === 0) return [];
  const read = new Set((await readPaths(projectRoot)).map((p) => normalize(projectRoot, p)));
  return ready.filter((f) => !read.has(normalize(projectRoot, f)));
}

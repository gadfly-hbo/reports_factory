import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { readManifest } from './materials.js';

/**
 * 材料阅读覆盖（flow-8 D2，痛点 #16）：记录 agent 经 read 工具读过的路径，
 * propose_outline 前校验材料提取文本是否读全。
 * B5 兜底：exec-env 的 bash 命令留痕（exec-log.jsonl）——命令文本引用材料
 * extract_file 路径即视为触达（cat/grep/head 任何形态；动态拼接绕过为已知局限）。
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

function execLogFile(projectRoot: string): string {
  return join(projectRoot, 'work', 'exec-log.jsonl');
}

/** exec 命令留痕（B5）：exitCode 非 0 的命令不计触达（读了但没读到不算）；失败不阻断执行。 */
export async function logExecCommand(projectRoot: string, command: string, exitCode = 0): Promise<void> {
  try {
    await mkdir(join(projectRoot, 'work'), { recursive: true });
    await appendFile(execLogFile(projectRoot), JSON.stringify({ at: new Date().toISOString(), command, exitCode }) + '\n', 'utf-8');
  } catch { /* 留痕失败不阻断执行 */ }
}

async function execCommands(projectRoot: string): Promise<string[]> {
  try {
    const raw = await readFile(execLogFile(projectRoot), 'utf-8');
    return raw.split('\n').filter(Boolean).map((l) => {
      try {
        const e = JSON.parse(l) as { command?: string; exitCode?: number };
        if (typeof e.exitCode === 'number' && e.exitCode !== 0) return ''; // 失败命令不计触达
        return e.command ?? '';
      } catch { return ''; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

/** 就绪材料的提取文本中尚未被触达的清单（read 工具 ∪ bash 命令引用；无材料/无记录均返回空）。 */
export async function unreadMaterials(projectRoot: string): Promise<string[]> {
  const manifest = await readManifest(projectRoot);
  const ready = manifest.materials.filter((m) => m.status === 'ready').map((m) => m.extract_file);
  if (ready.length === 0) return [];
  const read = new Set((await readPaths(projectRoot)).map((p) => normalize(projectRoot, p)));
  const commands = await execCommands(projectRoot);
  return ready.filter((f) => !read.has(normalize(projectRoot, f)) && !commands.some((c) => c.includes(f)));
}

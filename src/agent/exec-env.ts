import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, stat as fsStat, writeFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import type { ExecutionEnvironment } from 'pi-agent-runtime';

/**
 * 联网执行环境（flow-2 U4，运行条件对齐 C4）：
 * - exec 走系统 bash，无网络沙箱（对齐 pi-coding-agent：可装库/取素材）；
 * - 文件面仍以项目根为界（resolvePath 拒绝越界——自由度在网络，不在文件系统逃逸）；
 * - 单次超时/输出上限保留；每次 exec 由 SDK 审计（tool.admitted/finished）+ 宿主授权（authorize）。
 */
const execFileAsync = promisify(execFile);

export interface NetEnvOptions {
  root: string;
  policyVersion: string;
  execTimeoutMs?: number;
  maxOutputBytes?: number;
}

export async function createNetworkExecutionEnvironment(opts: NetEnvOptions): Promise<ExecutionEnvironment> {
  const root = resolve(opts.root);
  const execTimeoutMs = opts.execTimeoutMs ?? 120_000;
  const maxOutputBytes = opts.maxOutputBytes ?? 2 * 1024 * 1024;
  const resolvePath = async (path: string): Promise<string> => {
    const full = resolve(root, path); // 绝对路径原样解析；相对路径基于根
    if (full !== root && !full.startsWith(root + sep)) {
      throw new Error(`路径越界（限项目根内）：${path}`);
    }
    return full;
  };
  return {
    cwd: root,
    policyVersion: opts.policyVersion,
    resolvePath,
    async read(path: string, signal: AbortSignal): Promise<Uint8Array> {
      if (signal.aborted) throw new Error('Operation aborted');
      return new Uint8Array(await readFile(await resolvePath(path)));
    },
    async write(path: string, bytes: Uint8Array, signal: AbortSignal): Promise<void> {
      if (signal.aborted) throw new Error('Operation aborted');
      const full = await resolvePath(path);
      await mkdir(join(full, '..'), { recursive: true });
      await writeFile(full, bytes);
    },
    async stat(path: string, signal: AbortSignal) {
      if (signal.aborted) throw new Error('Operation aborted');
      const full = await resolvePath(path);
      const info = await fsStat(full);
      return {
        path: full,
        name: basename(full),
        kind: info.isDirectory() ? ('directory' as const) : ('file' as const),
        size: info.size,
        modifiedAt: info.mtimeMs,
      };
    },
    async exec(command: string, signal: AbortSignal): Promise<{ output: string; exitCode: number }> {
      if (signal.aborted) throw new Error('Operation aborted');
      try {
        const { stdout, stderr } = await execFileAsync('/bin/bash', ['-c', command], {
          cwd: root,
          timeout: execTimeoutMs,
          maxBuffer: maxOutputBytes,
          killSignal: 'SIGKILL',
          signal,
        } as Parameters<typeof execFileAsync>[2]);
        const output = `${stdout ?? ''}${stderr ? `\n${stderr}` : ''}`.slice(0, maxOutputBytes);
        return { output, exitCode: 0 };
      } catch (e) {
        const err = e as { stdout?: string; stderr?: string; code?: number | string; killed?: boolean; message?: string };
        if (err.killed || /SIGKILL|timed out/i.test(err.message ?? '')) {
          return { output: `执行超时（>${Math.round(execTimeoutMs / 1000)}s）已终止`, exitCode: 124 };
        }
        const output = `${err.stdout ?? ''}${err.stderr ? `\n${err.stderr}` : ''}`.slice(0, maxOutputBytes);
        return { output: output || (err.message ?? 'exec failed'), exitCode: typeof err.code === 'number' ? err.code : 1 };
      }
    },
  };
}

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import type { ModelTransport, ProviderConfig, TransportRequest } from './client.js';

/**
 * 录制/重放（M5 D5，对齐 deep-research）：真实调用一次录制，测试离线重放。
 * 录制纪律（红队 K3/隐私）：录制文件含出站原文——只允许对合成 fixture 录制，
 * synthetic=false 时拒绝录制（防真实业务数据落盘）。
 */

export interface RecordedCall {
  key: string;
  request: { provider: string; modelId: string; system: string; user: string };
  response: { text: string; cost: number };
}

export interface RecordingSink {
  push(call: RecordedCall): void;
}

/** 录制/重放键：provider+model+请求内容的哈希（导出供测试与 probe 构造同键录制） */
export function transportKey(cfg: ProviderConfig, req: TransportRequest): string {
  return createHash('sha256').update(`${cfg.provider}|${cfg.modelId}|${req.system}|${req.user}`).digest('hex').slice(0, 16);
}

export function recordingTransport(
  live: ModelTransport,
  sink: RecordingSink,
  opts: { synthetic: boolean },
): ModelTransport {
  if (!opts.synthetic) {
    // 录制纪律的强制点：非合成数据一律拒绝（错误信息用于 UI/日志提示）
    return async () => {
      throw new Error('录制被拒绝：只允许对合成 fixture 数据录制（真实业务数据禁止落盘为录制文件）');
    };
  }
  return async (cfg, req) => {
    const response = await live(cfg, req);
    sink.push({
      key: transportKey(cfg, req),
      request: { provider: cfg.provider, modelId: cfg.modelId, system: req.system, user: req.user },
      response,
    });
    return response;
  };
}

export function replayTransport(recordings: RecordedCall[]): ModelTransport {
  const byKey = new Map(recordings.map((c) => [c.key, c] as const));
  return async (cfg, req) => {
    const hit = byKey.get(transportKey(cfg, req));
    if (!hit) {
      const err = new Error(`录制未命中（replay 只回放已录制的调用）：${cfg.provider}/${cfg.modelId}`);
      err.name = 'ReplayMissError';
      throw err;
    }
    return hit.response;
  };
}

export async function saveRecordings(path: string, calls: RecordedCall[]): Promise<void> {
  await writeFile(path, JSON.stringify({ calls }, null, 2));
}

export async function loadRecordings(path: string): Promise<RecordedCall[]> {
  const raw = JSON.parse(await readFile(path, 'utf-8')) as { calls?: RecordedCall[] };
  return raw.calls ?? [];
}

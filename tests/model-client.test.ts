import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LlmStageClient,
  ModelUnavailableError,
  ModelCircuitBreaker,
  isTransientProviderError,
  parseJsonLoose,
  chainFromEnv,
  type ModelTransport,
  type ProviderConfig,
} from '../src/model/client.js';
import {
  recordingTransport,
  replayTransport,
  loadRecordings,
  type RecordedCall,
} from '../src/model/recording.js';

/**
 * S1（M5）：ModelClient 运输层。
 * transport 注入 = 测试 seam：主备/熔断/降级全部用假 transport 离线验证；
 * 真实调用只发生在 probe 脚本（合成 fixture，产出录制文件供 replay 测试）。
 */

const pickSchema = z.object({ pick: z.string().min(1) });

const P1: ProviderConfig = { provider: 'p1', modelId: 'm1' };
const P2: ProviderConfig = { provider: 'p2', modelId: 'm2' };

function fakeTransport(respond: (cfg: ProviderConfig) => { text: string; cost: number } | Promise<never>): { transport: ModelTransport; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    transport: async (cfg) => {
      calls.push(cfg.provider);
      return respond(cfg);
    },
  };
}

function ok(text: string, cost = 0.01): { text: string; cost: number } {
  return { text, cost };
}

describe('S1 ModelClient 运输层', () => {
  it('主 provider 成功：输出经 schema 校验，返回来源与成本', async () => {
    const { transport, calls } = fakeTransport(() => ok('```json\n{"pick":"a"}\n```', 0.02));
    const client = new LlmStageClient({ transport, chain: [P1, P2] });
    const r = await client.complete({
      stage: 'probe', callKey: 'k1', system: 's', user: 'u', schema: pickSchema,
    });
    expect(r.output).toEqual({ pick: 'a' });
    expect(r.provider).toBe('p1');
    expect(r.cost).toBe(0.02);
    expect(calls).toEqual(['p1']); // 未触发备用
  });

  it('主 provider 瞬时失败 → 备用接管', async () => {
    const { transport, calls } = fakeTransport((cfg) => {
      if (cfg.provider === 'p1') throw new Error('429 rate limit');
      return ok('{"pick":"b"}');
    });
    const client = new LlmStageClient({ transport, chain: [P1, P2] });
    const r = await client.complete({ stage: 'probe', callKey: 'k2', system: 's', user: 'u', schema: pickSchema });
    expect(r.provider).toBe('p2');
    expect(calls).toEqual(['p1', 'p2']);
  });

  it('连续两次瞬时失败 → 熔断冷却期内直接跳过（不再发起调用）', async () => {
    const { transport, calls } = fakeTransport((cfg) => {
      if (cfg.provider === 'p1') throw new Error('quota exceeded');
      return ok('{"pick":"b"}');
    });
    const breaker = new ModelCircuitBreaker({ threshold: 2, cooldownMs: 10 * 60_000 });
    const client = new LlmStageClient({ transport, chain: [P1, P2], breaker });

    await client.complete({ stage: 'probe', callKey: 'a', system: 's', user: 'u', schema: pickSchema });
    await client.complete({ stage: 'probe', callKey: 'b', system: 's', user: 'u', schema: pickSchema });
    expect(calls.filter((c) => c === 'p1')).toHaveLength(2);

    calls.length = 0;
    const r = await client.complete({ stage: 'probe', callKey: 'c', system: 's', user: 'u', schema: pickSchema });
    expect(r.provider).toBe('p2');
    expect(calls).toEqual(['p2']); // p1 被熔断跳过，未发起调用
  });

  it('非瞬时（配置类）错误立即抛出，不切备用', async () => {
    const { transport, calls } = fakeTransport(() => {
      throw new Error('invalid api key format for provider');
    });
    const client = new LlmStageClient({ transport, chain: [P1, P2] });
    await expect(
      client.complete({ stage: 'probe', callKey: 'k3', system: 's', user: 'u', schema: pickSchema }),
    ).rejects.not.toBeInstanceOf(ModelUnavailableError);
    expect(calls).toEqual(['p1']);
  });

  it('输出 schema 不合格视为瞬时 → 切备用；全链不合格 → ModelUnavailableError', async () => {
    const { transport } = fakeTransport(() => ok('{"wrong":"shape"}'));
    const client = new LlmStageClient({ transport, chain: [P1, P2] });
    const err = await client
      .complete({ stage: 'probe', callKey: 'k4', system: 's', user: 'u', schema: pickSchema })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ModelUnavailableError);
    expect(err.attempts.length).toBe(2);
  });

  it('全链失败 → ModelUnavailableError 携带各 provider 摘要', async () => {
    const { transport } = fakeTransport((cfg) => {
      throw new Error(`${cfg.provider} timeout after 120000ms`);
    });
    const client = new LlmStageClient({ transport, chain: [P1, P2] });
    const err = await client
      .complete({ stage: 'probe', callKey: 'k5', system: 's', user: 'u', schema: pickSchema })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ModelUnavailableError);
    expect(err.attempts.join('|')).toContain('p1');
    expect(err.attempts.join('|')).toContain('p2');
  });

  it('parseJsonLoose：围栏/裸 JSON/截取块/空输入', () => {
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonLoose('说明文字 {"a":1} 尾部')).toEqual({ a: 1 });
    expect(parseJsonLoose('完全不是 JSON')).toEqual({});
  });

  it('chainFromEnv：解析 REPORT_STUDIO_MODEL_CHAIN；缺省为 minimax 主/小米备', () => {
    const def = chainFromEnv({});
    expect(def.map((c) => `${c.provider}/${c.modelId}`)).toEqual([
      'minimax-cn/MiniMax-M2.7',
      'xiaomi-token-plan-cn/mimo-v2.5-pro',
    ]);
    const custom = chainFromEnv({ REPORT_STUDIO_MODEL_CHAIN: 'moonshotai/kimi-k2' });
    expect(custom).toEqual([{ provider: 'moonshotai', modelId: 'kimi-k2' }]);
  });

  it('录制纪律：非合成数据拒绝录制；合成录制可 replay；未命中 key 抛错', async () => {
    const { transport } = fakeTransport(() => ok('{"pick":"r"}'));
    const calls: RecordedCall[] = [];

    // 纪律：synthetic=false（真实业务数据）→ 拒绝录制
    const guarded = recordingTransport(transport, { push: (c) => calls.push(c) }, { synthetic: false });
    await expect(guarded(P1, { system: 's', user: 'real' })).rejects.toThrow(/录制/);

    // 合成数据 → 正常录制
    const rec = recordingTransport(transport, { push: (c) => calls.push(c) }, { synthetic: true });
    const out = await rec(P1, { system: 's', user: 'synthetic' });
    expect(out.text).toBe('{"pick":"r"}');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.key).toBeTruthy();

    // replay：按 key 命中；未命中抛错
    const dir = mkdtempSync(join(tmpdir(), 'rs-rec-'));
    const path = join(dir, 'rec.json');
    writeFileSync(path, JSON.stringify({ calls }));
    const loaded = await loadRecordings(path);
    const replay = replayTransport(loaded);
    const hit = await replay(P1, { system: 's', user: 'synthetic' });
    expect(hit.text).toBe('{"pick":"r"}');
    // replayTransport 的 key 匹配基于 transport 请求内容键；不同内容未命中
    await expect(replay(P1, { system: 's', user: 'other' })).rejects.toThrow(/录制/);
    expect(readFileSync(path, 'utf-8')).toContain('pick');
  });

  it('重放真实探针录制（合成任务）：离线重现真调输出与格式', async () => {
    const recPath = join(import.meta.dirname, 'fixtures/recordings/s1-probe-minimax.json');
    const recordings = await loadRecordings(recPath);
    expect(recordings.length).toBeGreaterThan(0);
    const replay = replayTransport(recordings);
    const out = await replay(recordings[0]!.request.provider === 'minimax-cn'
      ? { provider: 'minimax-cn', modelId: recordings[0]!.request.modelId }
      : recordings[0]!.request, { system: recordings[0]!.request.system, user: recordings[0]!.request.user });
    const parsed = pickSchema.parse(parseJsonLoose(out.text));
    expect(parsed.pick).toBe('库存周转天数');
  });

  it('isTransientProviderError：瞬时/配置类分类正确', () => {
    expect(isTransientProviderError(new Error('HTTP 429'))).toBe(true);
    expect(isTransientProviderError(new Error('request timeout'))).toBe(true);
    expect(isTransientProviderError(new Error('ECONNRESET'))).toBe(true);
    expect(isTransientProviderError(new Error('用量上限'))).toBe(true);
    expect(isTransientProviderError(new Error('unknown provider xxx'))).toBe(false);
    expect(isTransientProviderError(new Error('缺少模型密钥'))).toBe(true);
  });
});

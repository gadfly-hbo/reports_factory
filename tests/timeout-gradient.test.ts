import { describe, expect, it } from 'vitest';
import { UNLIMITED_LIMITS, EXEC_SOFT_TIMEOUT_MS } from '../src/agent/session-host.js';

/**
 * 超时梯度合同（flow-18 e2e 事故教训）：SDK 工具硬墙必须宽于 env bash 软超时——
 * 慢命令（如 agent 全盘 find）先被软超时转为可恢复工具错误（exitCode 124 + 提示文本），
 * agent 可自纠；硬墙只兜真死循环。两者相等或倒挂 = 一条慢命令杀死整个 run（2026-10-14 真调复现）。
 */
describe('超时梯度（e2e-fix）', () => {
  it('硬墙 300s > 软超时 120s，梯度成立', () => {
    expect(UNLIMITED_LIMITS.toolTimeoutMs).toBe(300_000);
    expect(EXEC_SOFT_TIMEOUT_MS).toBe(120_000);
    expect(UNLIMITED_LIMITS.toolTimeoutMs).toBeGreaterThan(EXEC_SOFT_TIMEOUT_MS);
  });
});

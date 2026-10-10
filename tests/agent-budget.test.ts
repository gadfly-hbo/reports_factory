import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuntimeFault } from 'pi-agent-runtime';
import { FileBudgetStore } from '../src/agent/budget-store.js';

const UNLIMITED = { cumulative: 'unlimited' as const, maxOutputTokens: 8_192, modelTimeoutMs: 600_000, toolTimeoutMs: 120_000, controlTimeoutMs: 30_000 };
const CONFIG_A = JSON.stringify({ v: 'a' });
const CONFIG_B = JSON.stringify({ v: 'b' });

async function storePath(name: string): Promise<{ path: string; base: string }> {
  const base = await mkdtemp(join(tmpdir(), 'rs-budget-'));
  return { path: join(base, name), base };
}

describe('FileBudgetStore（0.4.1 uncapped 合同）', () => {
  it('claim → 预留 → 结算 → 释放：计量累计且持久', async () => {
    const { path, base } = await storePath('b1.json');
    try {
      const store = new FileBudgetStore(path);
      const lease = await store.claimUncapped('task_x', 'run_1', CONFIG_A, UNLIMITED);
      await lease.reserveModelUpTo(1_000);
      await lease.settleModelUsage(1_000, { inputTokens: 40, outputTokens: 120 });
      await lease.reserveTool(2);
      const snap = lease.snapshot();
      expect(snap.modelCalls).toBe(1);
      expect(snap.toolCalls).toBe(1);
      expect(snap.inputTokens).toBe(40);
      expect(snap.outputTokens).toBe(120); // 1000 预留 - 1000 + 120 真实
      expect(snap.reservedOutputTokens).toBe(0);
      expect(snap.resourceUnits).toBe(3);
      await lease.release(5_000);
      expect(lease.snapshot().activeMs).toBe(5_000);

      // 跨实例持久（重启不清账）
      const store2 = new FileBudgetStore(path);
      const lease2 = await store2.claimUncapped('task_x', 'run_2', CONFIG_A, UNLIMITED);
      const s2 = lease2.snapshot();
      expect(s2.modelCalls).toBe(1);
      expect(s2.inputTokens).toBe(40);
      await lease2.release(0);
    } finally {
      await rm(base, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('负例：活动 lease 换 runId → TASK_BUSY；换配置 → CONFIGURATION_CHANGED；坏账本 → STATE_FAILED', async () => {
    const { path, base } = await storePath('b2.json');
    try {
      const store = new FileBudgetStore(path);
      await store.claimUncapped('task_y', 'run_1', CONFIG_A, UNLIMITED);
      await expect(store.claimUncapped('task_y', 'run_2', CONFIG_A, UNLIMITED)).rejects.toMatchObject({ reason: 'TASK_BUSY' });
      await expect(store.claimUncapped('task_y', 'run_1', CONFIG_B, UNLIMITED)).rejects.toMatchObject({ reason: 'CONFIGURATION_CHANGED' });
      await expect(store.claimUncapped('task_z', 'run_1', CONFIG_A, UNLIMITED)).resolves.toBeTruthy(); // 其他任务不受牵连

      await writeFile(path, '{corrupt', 'utf-8');
      expect(() => new FileBudgetStore(path)).toThrow(RuntimeFault);
    } finally {
      await rm(base, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('崩溃恢复：活动 lease 重启后 TASK_BUSY，宿主显式恢复后可续且历史保留（红队#2）', async () => {
    const { path, base } = await storePath('b3.json');
    try {
      const store = new FileBudgetStore(path);
      const lease = await store.claimUncapped('task_crash', 'run_1', CONFIG_A, UNLIMITED);
      await lease.reserveModelUpTo(500);
      // 不 settle 不 release = 模拟崩溃
      const store2 = new FileBudgetStore(path);
      await expect(store2.claimUncapped('task_crash', 'run_2', CONFIG_A, UNLIMITED))
        .rejects.toMatchObject({ reason: 'TASK_BUSY' });

      // 宿主核查后的显式恢复动作
      await store2.releaseActive('task_crash', 'crash-recovery');

      const lease2 = await store2.claimUncapped('task_crash', 'run_2', CONFIG_A, UNLIMITED);
      const s = lease2.snapshot();
      expect(s.modelCalls).toBe(1);       // 历史保留，不清零
      expect(s.outputTokens).toBe(500);   // 未结算预留保留（未知效果不当作免费）
      await lease2.release(0);

      const audit = await readFile(join(path + '.audit.jsonl'), 'utf-8');
      expect(audit).toContain('releaseActive');
      expect(audit).toContain('task_crash');
    } finally {
      await rm(base, { recursive: true, force: true }).catch(() => {});
    }
  });
});

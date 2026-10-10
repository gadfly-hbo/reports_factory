import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { ModelReply, ModelTransport } from 'pi-agent-runtime';
import { SessionHost } from '../src/agent/session-host.js';
import { MINIMAX_M3 } from '../src/agent/model.js';
import { FileBudgetStore } from '../src/agent/budget-store.js';
import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { mkdtempSync, rmSync } from 'node:fs';

const UNLIMITED = { cumulative: 'unlimited' as const, maxOutputTokens: 32_768, modelTimeoutMs: 600_000, toolTimeoutMs: 120_000, controlTimeoutMs: 30_000 };

describe('R1 修复：停止语义 / 恢复接线 / 配置迁移 / 用量', () => {
  it('R1-2 outcome：run 结束后 outcome 可读（前端退出 busy 的依据）', async () => {
    const base = await mkdtemp(join(tmpdir(), 'rs-r1a-'));
    const root = join(base, 'proj_a');
    await mkdir(root, { recursive: true });
    try {
      let release: ((v: unknown) => void) | null = null;
      const gated: ModelTransport = () => new Promise((resolve) => { release = resolve; });
      const host = await SessionHost.create({ projectRoot: root, skillsDir: root, model: MINIMAX_M3, transport: gated, auditFile: join(root, 'a.jsonl'), budgetFile: join(root, 'b.json') });
      await host.send('进行中');
      for (let i = 0; i < 50 && !release; i++) await new Promise((r) => setTimeout(r, 20)); // 等 SDK 发起首个模型请求
      if (!release) throw new Error('transport 未被调用');
      expect(host.outcome()).toBeNull();
      release({ content: [{ kind: 'text', text: '完成' }], stop: 'complete', usage: { inputTokens: 5, outputTokens: 2 } });
      const r = await host.currentResult();
      expect(r?.status).toBe('succeeded');
      expect(host.isBusy()).toBe(false);
      expect(host.outcome()?.status).toBe('succeeded'); // settle 后仍有最近结果
      await host.close();
    } finally {
      await rm(root, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('R1-4 forceNextClaim：新配置签名被接受，用量历史保留，自审计', async () => {
    const base = await mkdtemp(join(tmpdir(), 'rs-r1b-'));
    const file = join(base, 'b.json');
    try {
      const store = new FileBudgetStore(file);
      const lease = await store.claimUncapped('task_x', 'run_1', 'CONFIG_A', UNLIMITED);
      await lease.reserveModelUpTo(1_000);
      await lease.settleModelUsage(1_000, { inputTokens: 40, outputTokens: 100 });
      await lease.release(3_000);

      await expect(store.claimUncapped('task_x', 'run_2', 'CONFIG_B', UNLIMITED)).rejects.toMatchObject({ reason: 'CONFIGURATION_CHANGED' });
      store.forceNextClaim('task_x', 'api-recover');
      const lease2 = await store.claimUncapped('task_x', 'run_2', 'CONFIG_B', UNLIMITED);
      const s = lease2.snapshot();
      expect(s.modelCalls).toBe(1);
      expect(s.inputTokens).toBe(40);
      expect(s.activeMs).toBe(3_000);
      // 一次性：迁移后再次换配置仍拒绝
      await lease2.release(0);
      await expect(store.claimUncapped('task_x', 'run_3', 'CONFIG_C', UNLIMITED)).rejects.toMatchObject({ reason: 'CONFIGURATION_CHANGED' });

      const audit = await readFile(`${file}.audit.jsonl`, 'utf-8');
      expect(audit).toContain('forceNextClaim');
    } finally {
      await rm(base, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('R1-3 recover 路由：释放残留 lease + 迁移配置 + 用量可读', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rs-r1c-'));
    const store = new WorkspaceStore(dir);
    let app: FastifyInstance | null = buildServer(store);
    try {
      const created = await app!.inject({ method: 'POST', url: '/api/projects', payload: { title: '恢复' } });
      const id = (created.json() as { project: { project_id: string } }).project.project_id;

      // 播种残留：活动 lease + 旧配置
      const budget = new FileBudgetStore(join(dir, 'agent-budget.json'));
      const stale = await budget.claimUncapped(`task_${id}`, 'run_stale', 'OLD_CONFIG', UNLIMITED);
      await stale.reserveModelUpTo(500);
      // 不 settle 不 release（崩溃模拟）

      const rec = await app!.inject({ method: 'POST', url: `/api/projects/${id}/agent/recover` });
      expect(rec.statusCode).toBe(200);
      expect((rec.json() as { ok: boolean; had_usage: boolean }).ok).toBe(true);

      const usage = await app!.inject({ method: 'GET', url: `/api/projects/${id}/agent/usage` });
      const u = (usage.json() as { usage: { modelCalls: number; outputTokens: number } | null }).usage;
      expect(u?.modelCalls).toBe(1);
      expect(u?.outputTokens).toBe(500); // 未结算预留保留（未知不退款）

      const missing = await app!.inject({ method: 'POST', url: '/api/projects/proj_none/agent/recover' });
      expect(missing.statusCode).toBe(404);
    } finally {
      await app!.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});


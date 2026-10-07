import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { WorkbenchService } from '../src/server/workbench.js';
import { checkBudget, resolveBudget, type BudgetConfig } from '../src/model/budget.js';

function logEntry(over: Partial<Record<string, unknown>> = {}) {
  return {
    at: new Date().toISOString(),
    stage: 'outline',
    provider: 'minimax-cn',
    modelId: 'm',
    mode: 'structure-only',
    itemCount: 1,
    bytes: 10,
    cost: 0,
    blocked: false,
    ...over,
  } as never;
}

describe('预算三线封顶（S5 / 红队 KA-3）', () => {
  it('调用次数线：达到上限即拒绝，明示超哪条线与当前值/上限', () => {
    const budget: BudgetConfig = { maxCalls: 3, maxWallMs: 60_000, maxTurns: 10 };
    const log = [logEntry(), logEntry(), logEntry()];
    const r = checkBudget(log, budget, 'checks', Date.now());
    expect(r.allowed).toBe(false);
    expect(r.line).toBe('calls');
    expect(r.reason).toContain('调用次数');
    expect(r.reason).toContain('3/3');
  });

  it('墙钟线：超时即拒绝（与次数独立）', () => {
    const budget: BudgetConfig = { maxCalls: 100, maxWallMs: 1_000, maxTurns: 10 };
    const start = Date.now() - 60_000;
    const log = [logEntry({ at: new Date(start).toISOString() })];
    const r = checkBudget(log, budget, 'checks', Date.now());
    expect(r.allowed).toBe(false);
    expect(r.line).toBe('wall');
    expect(r.reason).toContain('墙钟');
  });

  it('轮次线：单阶段调用轮次封顶，其他阶段不受牵连', () => {
    const budget: BudgetConfig = { maxCalls: 100, maxWallMs: 3_600_000, maxTurns: 2 };
    const log = [logEntry({ stage: 'outline' }), logEntry({ stage: 'outline' })];
    const hit = checkBudget(log, budget, 'outline', Date.now());
    expect(hit.allowed).toBe(false);
    expect(hit.line).toBe('turns');
    expect(hit.reason).toContain('轮次');
    const other = checkBudget(log, budget, 'checks', Date.now());
    expect(other.allowed).toBe(true);
  });

  it('成本线不作为阻断依据（小米 cost 恒 0，KA-3）', () => {
    const budget: BudgetConfig = { maxCalls: 2, maxWallMs: 3_600_000, maxTurns: 10 };
    // cost 全 0 的历史不影响次数判定
    const log = [logEntry({ cost: 0 }), logEntry({ cost: 0 })];
    expect(checkBudget(log, budget, 'checks', Date.now()).allowed).toBe(false);
    // 未达上限时 cost>0 也不构成阻断
    const ok = checkBudget([logEntry({ cost: 99 })], budget, 'checks', Date.now());
    expect(ok.allowed).toBe(true);
  });

  it('blocked 拦截尝试不计入调用计数（计量不失真）', () => {
    const budget: BudgetConfig = { maxCalls: 2, maxWallMs: 3_600_000, maxTurns: 10 };
    const log = [logEntry(), logEntry({ blocked: true }), logEntry({ blocked: true })];
    // 2 条 blocked 不算真实调用，第 1 条真实调用未触顶
    expect(checkBudget(log, budget, 'checks', Date.now()).allowed).toBe(true);
  });

  it('resolveBudget：env 与项目级配置覆盖默认值', () => {
    const def = resolveBudget({}, {});
    expect(def.maxCalls).toBe(200);
    expect(def.maxWallMs).toBe(4 * 60 * 60_000);
    expect(def.maxTurns).toBe(100);
    const env = resolveBudget({}, { REPORT_STUDIO_BUDGET_CALLS: '5', REPORT_STUDIO_BUDGET_TURNS: '2' });
    expect(env.maxCalls).toBe(5);
    expect(env.maxTurns).toBe(2);
    const proj = resolveBudget({ budget: { max_calls: 7 } }, {});
    expect(proj.maxCalls).toBe(7);
  });
});

describe('出站批准持久化与预算门挂点（S5）', () => {
  let dir: string;
  let store: WorkspaceStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rs-budget-'));
    store = new WorkspaceStore(dir);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('会话批准持久化：重启（新 WorkbenchService 实例）后批准仍生效', async () => {
    const project = await store.createProject({ title: '批准持久化' });
    const pid = project.project_id;
    await store.updateProject(pid, { privacy_policy: 'allow_external_with_approval' });
    const wb1 = new WorkbenchService(store);
    await wb1.approveOutbound(pid, 'structure-only');
    // 模拟重启：全新实例读同一 workspace
    const wb2 = new WorkbenchService(store);
    const gate = await wb2.checkOutbound(pid, 'structure-only');
    expect(gate.allowed).toBe(true);
    // 新模式仍需批准（不同发送类别分开）
    const other = await wb2.checkOutbound(pid, 'authorized-summary');
    expect(other.allowed).toBe(false);
  });

  it('预算超帽：AI 入口被拦并明示超哪条线；门决策写零内容审计', async () => {
    const project = await store.createProject({ title: '预算拦截' });
    const pid = project.project_id;
    // 预置历史调用触顶（次数线）
    for (let i = 0; i < 200; i++) await store.appendOutboundLog(pid, logEntry());
    const wb = new WorkbenchService(store);
    await store.updateProject(pid, { privacy_policy: 'allow_external' });
    const res = await wb.gateOrThrow(pid, 'authorized-summary', 'draft').catch((e: Error & { statusCode?: number }) => e);
    expect((res as Error).message).toMatch(/调用次数/);
    expect((res as { statusCode?: number }).statusCode).toBe(403);
    // 阻断审计留痕（零内容）
    const log = await store.readOutboundLog(pid);
    const blocked = log.filter((e) => e.blocked);
    expect(blocked.length).toBeGreaterThan(0);
  });

  it('门决策写独立审计流（零内容，P5/P6；六步管线阶段审计随 S5 回归）', async () => {
    const project = await store.createProject({ title: '门审计' });
    const pid = project.project_id;
    for (let i = 0; i < 200; i++) await store.appendOutboundLog(pid, logEntry());
    const wb = new WorkbenchService(store);
    await wb.gateOrThrow(pid, 'authorized-summary', 'draft').catch(() => undefined);
    const audit = await store.readAuditLog(pid);
    const gates = audit.filter((e) => e.kind === 'gate_decision');
    expect(gates.some((e) => e.stage === 'draft' && e.status === 'budget_blocked')).toBe(true);
    // 零内容：不含文本载荷字段；每条含审计骨架键
    for (const e of audit) {
      expect(Object.keys(e)).not.toContain('text');
      for (const k of ['at', 'kind', 'stage', 'status']) expect(k in e).toBe(true);
    }
  });
});

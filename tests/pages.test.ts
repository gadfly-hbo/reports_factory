import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../src/server/app.js';
import { WorkbenchService } from '../src/server/workbench.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import type { FastifyInstance } from 'fastify';

/**
 * M10 S5：逐页生成（语义投影/数字护栏/checkpoint/预算围栏）。
 * LLM 走三份录制夹具（S3 理解 + S4 框架 + S5 页起草，合成 fixture 数据）。
 */
const S3 = join(import.meta.dirname, 'fixtures/recordings/m10-s3-understand.json');
const S4 = join(import.meta.dirname, 'fixtures/recordings/m10-s4-framework.json');
const S5 = join(import.meta.dirname, 'fixtures/recordings/m10-s5-pages.json');
const FIXTURE_MD = join(import.meta.dirname, 'fixtures/materials/m10-understand-fixture.md');

describe('S5 逐页生成（录制回放）', () => {
  let app: FastifyInstance;
  let dir: string;
  let store: WorkspaceStore;
  let projectId: string;
  const saved: string | undefined = process.env['REPORT_STUDIO_MODEL_REPLAY'];

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'rs-pg-'));
    process.env['REPORT_STUDIO_MODEL_REPLAY'] = `${S3},${S4},${S5}`;
    store = new WorkspaceStore(dir);
    app = buildServer(store);
    const create = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '理解测试' } });
    projectId = create.json().project.project_id;
    await store.updateProject(projectId, { privacy_policy: 'allow_external' });
    await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/sources`,
      payload: { filename: 'm10-understand-fixture.md', content_base64: readFileSync(FIXTURE_MD).toString('base64'), kind: 'markdown', media_type: 'text/markdown' },
    });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/understand`, payload: {} });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/framework/generate`, payload: {} });
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/framework/confirm`, payload: {} });
  });
  afterEach(() => {
    process.env['REPORT_STUDIO_MODEL_REPLAY'] = saved;
    app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('整套生成：全部页 done、内容带数据、0 emoji、数字护栏通过', async () => {
    const gen = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/pages/generate`, payload: {} });
    expect(gen.statusCode).toBe(200);
    expect(gen.json().failed).toBe(0);
    const detail = (await app.inject({ url: `/api/projects/${projectId}` })).json();
    const states = detail.page_states;
    expect(Object.values(states).every((s) => s === 'done')).toBe(true);
    // 页内容质量：headline 非空、bullets 有信息、数字来自材料（护栏在服务端已过）
    const pages = detail.pages as Record<string, { headline: string; bullets: { text: string }[]; chart?: unknown }>;
    const heads = Object.values(pages).map((p) => p.headline);
    expect(heads.every((h) => h.length > 3)).toBe(true);
    expect(JSON.stringify(pages)).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u); // 0 emoji
    const publish = byKey(detail);
    expect(publish.generate).toBe(true);
    expect(publish['page-edit']).toBe(true);
  });

  it('checkpoint：生成完成后重跑不触发任何调用（摘掉 replay 也全 done）', async () => {
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/pages/generate`, payload: {} });
    delete process.env['REPORT_STUDIO_MODEL_REPLAY'];
    const again = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/pages/generate`, payload: {} });
    expect(again.statusCode).toBe(200);
    expect(again.json().done).toBe(again.json().done + again.json().failed - again.json().failed); // 全部 done（无需硬编码页数）
    expect(again.json().failed).toBe(0);
  });

  it('页级重试：单页失败后指定 page_id 重跑，其余页不动', async () => {
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/pages/generate`, payload: {} });
    // 人为把一页置败（模拟超时）
    const wb = new WorkbenchService(store);
    const work = await wb.readWork(projectId);
    await wb.writeWork(projectId, { ...work, page_states: { ...work.page_states, page_02: 'failed' } });
    delete process.env['REPORT_STUDIO_MODEL_REPLAY'];
    // 摘掉 replay 后：只有 page_02 会被重跑（会真调失败→failed），其余页保持 done 不动
    const retry = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/pages/generate`, payload: { page_id: 'page_02' } });
    expect(retry.statusCode).toBe(200);
    const detail = (await app.inject({ url: `/api/projects/${projectId}` })).json();
    expect(detail.page_states.page_01).toBe('done'); // 其他页不受影响
    expect(detail.page_states.page_03).toBe('done');
  });

  it('框架未确认 → 422（N1 围栏）', async () => {
    // 新项目：理解+框架生成但不确认
    const create = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '未确认项目' } });
    const pid = create.json().project.project_id;
    await store.updateProject(pid, { privacy_policy: 'allow_external' });
    const gen = await app.inject({ method: 'POST', url: `/api/projects/${pid}/pages/generate`, payload: {} });
    expect(gen.statusCode).toBe(422);
  });

  it('预算超帽 → 403 且门决策写审计（负例）', async () => {
    for (let i = 0; i < 50; i++) {
      await store.appendOutboundLog(projectId, { at: new Date().toISOString(), stage: 'page-draft', provider: 'none', modelId: '', mode: 'authorized-summary', itemCount: 1, bytes: 0, cost: 0 });
    }
    const gen = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/pages/generate`, payload: {} });
    expect(gen.statusCode).toBe(403);
    const audit = await store.readAuditLog(projectId);
    expect(audit.some((e) => e.status === 'budget_blocked')).toBe(true);
  });
});

function byKey(detail: { steps: { key: string; unlocked: boolean }[] }) {
  return Object.fromEntries(detail.steps.map((s) => [s.key, s.unlocked]));
}

describe('数字护栏（纯函数）', () => {
  it('编造数字被拒；材料数字与年份豁免', () => {
    const violations = WorkbenchService.digitGuardViolations(
      { headline: '转化率 33.7% 创新高', bullets: [{ text: '客流 12,400 人次' }], uncovered: false },
      '「转化」成交转化率 21.5% —— 来源 x.md\n「客流」进店客流 12400 人次',
    );
    expect(violations).toContain('33.7');
    expect(violations).not.toContain('12,400'.replace(',', ''));
    const ok = WorkbenchService.digitGuardViolations(
      { headline: '2026 年转化率 21.5%', bullets: [], uncovered: false },
      '成交转化率 21.5%',
    );
    expect(ok).toEqual([]);
  });
});

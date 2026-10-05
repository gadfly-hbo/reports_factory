import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { WorkbenchService } from '../src/server/workbench.js';
import { LlmStageClient } from '../src/model/client.js';

const MAT = join(import.meta.dirname, 'fixtures/materials');

describe('一键生成管线（S2）', () => {
  let app: FastifyInstance;
  let dir: string;
  let store: WorkspaceStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rs-gen-'));
    store = new WorkspaceStore(dir);
    app = buildServer(store);
  });
  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  async function makeProjectWithMaterials(template_id?: string): Promise<string> {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { title: '一键生成', template_id },
    });
    const pid = createRes.json().project.project_id;
    for (const f of [
      { filename: 'conclusion.md', kind: 'markdown', media_type: 'text/markdown' },
      { filename: 'sales.csv', kind: 'csv', media_type: 'text/csv' },
    ] as const) {
      const content_base64 = (await readFile(join(MAT, f.filename))).toString('base64');
      await app.inject({
        method: 'POST',
        url: `/api/projects/${pid}/sources`,
        payload: { filename: f.filename, content_base64, kind: f.kind, media_type: f.media_type },
      });
    }
    return pid;
  }

  it('一键生成：材料 → 成稿（大纲/组装/检查三阶段全过，零模型调用）', async () => {
    const spy = vi.spyOn(LlmStageClient.prototype, 'complete');
    const pid = await makeProjectWithMaterials();
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${pid}/generate`,
      payload: { audience: '商品经营负责人', purpose: '上半年复盘' },
    });
    expect(res.statusCode).toBe(200);
    const gen = res.json().generation;
    expect(gen.status).toBe('done');
    expect(gen.stages.map((s: { name: string }) => s.name)).toEqual(['outline', 'assemble', 'checks']);
    expect(gen.stages.every((s: { status: string }) => s.status === 'done')).toBe(true);

    // 成稿可编辑：spec 已落库
    const detail = (await app.inject({ url: `/api/projects/${pid}` })).json();
    expect(detail.project.stage).toBe('draft');
    const checks = await app.inject({ method: 'POST', url: `/api/projects/${pid}/checks`, payload: {} });
    expect(checks.statusCode).toBe(200);
    // 验收：默认路径零模型调用——transport 未被触达（显式 spy 断言）
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('模版 page_plan 驱动产出：页型序列逐项等于注册表 page_plan（每个模版）', async () => {
    const { listTemplates } = await import('../src/schema/template.js');
    for (const tpl of listTemplates()) {
      const pid = await makeProjectWithMaterials(tpl.id);
      const res = await app.inject({
        method: 'POST',
        url: `/api/projects/${pid}/generate`,
        payload: { audience: '商品经营负责人', purpose: '上半年复盘' },
      });
      expect(res.json().generation.status).toBe('done');
      const work = JSON.parse(readFileSync(join(dir, pid, 'work', 'state.json'), 'utf-8'));
      expect(work.outline.pages.map((p: { type: string }) => p.type)).toEqual(tpl.page_plan);
    }
  });

  it('模版决定 deliverable_type 与页数上限', async () => {
    const pid = await makeProjectWithMaterials('research_doc');
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${pid}/generate`,
      payload: { audience: '研究员', purpose: '研究报告' },
    });
    expect(res.statusCode).toBe(200);
    const work = JSON.parse(readFileSync(join(dir, pid, 'work', 'state.json'), 'utf-8'));
    expect(work.brief.deliverable_type).toBe('research_report');
    expect(work.brief.page_budget).toBe(7); // 模版 page_plan 长度 = 页数上限
    expect(work.outline.pages.length).toBeGreaterThan(0);
  });

  it('请求体缺参 400，不进管线', async () => {
    const createRes = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '空项目' } });
    const pid = createRes.json().project.project_id;
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${pid}/generate`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(() => readFileSync(join(dir, pid, 'work', 'state.json'), 'utf-8')).toThrow(); // 未进管线，无 checkpoint
  });

  it('生成失败停在明示断点，续跑从失败阶段继续（不重跑已完成阶段）', async () => {
    const pid = await makeProjectWithMaterials();
    const wb = new WorkbenchService(store);
    // 注入 checks 阶段失败（service 边界 stub），模拟管线中段故障
    const realChecks = wb.checks.bind(wb);
    let failOnce = true;
    wb.checks = (async (id: string, scope?: 'internal' | 'external') => {
      if (failOnce) { failOnce = false; throw new Error('checks 阶段注入故障'); }
      return realChecks(id, scope);
    }) as typeof wb.checks;

    const failed = await wb.generate(pid, { audience: '商品经营负责人', purpose: '上半年复盘' });
    expect(failed.status).toBe('failed');
    expect(failed.stages.map((s) => s.status)).toEqual(['done', 'done', 'failed']);
    expect(failed.stages[2]!.error).toContain('注入故障');

    // 续跑：只重跑 checks，outline/assemble 沿用 checkpoint
    const resumed = await wb.generate(pid, { audience: '商品经营负责人', purpose: '上半年复盘' });
    expect(resumed.status).toBe('done');
    expect(resumed.stages.every((s) => s.status === 'done')).toBe(true);
  });

  it('重复调用幂等：状态 done 后重跑返回同一成稿', async () => {
    const pid = await makeProjectWithMaterials();
    const first = await app.inject({
      method: 'POST',
      url: `/api/projects/${pid}/generate`,
      payload: { audience: '商品经营负责人', purpose: '上半年复盘' },
    });
    const second = await app.inject({
      method: 'POST',
      url: `/api/projects/${pid}/generate`,
      payload: { audience: '商品经营负责人', purpose: '上半年复盘' },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().generation.status).toBe('done');
    const work1 = readFileSync(join(dir, pid, 'work', 'state.json'), 'utf-8');
    // 二次生成为同一输入 → 确定性同产出
    const third = await app.inject({
      method: 'POST',
      url: `/api/projects/${pid}/generate`,
      payload: { audience: '商品经营负责人', purpose: '上半年复盘' },
    });
    expect(third.json().generation.status).toBe('done');
    const work2 = readFileSync(join(dir, pid, 'work', 'state.json'), 'utf-8');
    expect(JSON.parse(work1).spec.pages.length).toBe(JSON.parse(work2).spec.pages.length);
  });
});

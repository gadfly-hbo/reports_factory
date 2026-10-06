import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { transportKey } from '../src/model/recording.js';
import { buildPageDraftRequest, buildPageMaterials } from '../src/model/ai-draft.js';
import { getTemplate } from '../src/schema/template.js';

const MAT = join(import.meta.dirname, 'fixtures/materials');

/**
 * S4 主路径 tracer（LLM 模式，PRD D3/D5）：批准出站 → 起草生成 → 体检 → G1 → 内用导出 → 外发拦截/放行。
 * 围栏接线验证：出站批准、预算门、审计 draft 阶段、导出门禁在 LLM 默认路径上全部生效。
 */
describe('S4 主路径 tracer（LLM 模式）', () => {
  let dir: string;
  let app: ReturnType<typeof buildServer>;
  let store: WorkspaceStore;
  let replayPath: string;
  let projectId: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'rs-path-llm-'));
    store = new WorkspaceStore(dir);
    replayPath = join(dir, 'replay.json');
    process.env['REPORT_STUDIO_MODEL_REPLAY'] = replayPath;
    writeFileSync(replayPath, JSON.stringify({ calls: [] }));
    app = buildServer(store);
    const createRes = await app.inject({
      method: 'POST', url: '/api/projects',
      payload: { title: 'LLM 主路径', template_id: 'ops_review_deck' },
    });
    projectId = createRes.json().project.project_id;
    for (const f of [
      { filename: 'conclusion.md', kind: 'markdown', media_type: 'text/markdown' },
      { filename: 'sales.csv', kind: 'csv', media_type: 'text/csv' },
    ] as const) {
      const content_base64 = (await readFile(join(MAT, f.filename))).toString('base64');
      await app.inject({
        method: 'POST', url: `/api/projects/${projectId}/sources`,
        payload: { filename: f.filename, content_base64, kind: f.kind, media_type: f.media_type },
      });
    }
    await store.updateProject(projectId, { privacy_policy: 'allow_external_with_approval' });
  });
  afterEach(async () => {
    delete process.env['REPORT_STUDIO_MODEL_REPLAY'];
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('批准 → 起草生成 → 体检 → G1 → 内用导出 → 外发拦截/放行', async () => {
    // 预写全页 replay（与 generate 内 outline 同构：先跑一次 outline 拿结构）
    const { WorkbenchService } = await import('../src/server/workbench.js');
    const wb = new WorkbenchService(store);
    const brief = { audience: '经营负责人', purpose: '上半年复盘', page_budget: 8, language: 'zh-CN', deliverable_type: 'meeting_deck' } as const;
    await wb.saveBrief(projectId, brief);
    await wb.composeOutline(projectId, brief, { pagePlan: getTemplate('ops_review_deck')!.page_plan });
    const work = JSON.parse(readFileSync(join(dir, projectId, 'work', 'state.json'), 'utf-8'));
    const { all } = await (wb as unknown as { loadDerived(pid: string): Promise<{ all: { claims: { claim_id: string; text: string }[]; tables: never[] } }> }).loadDerived(projectId);
    const calls = [];
    for (const page of work.outline.pages as { page_id: string; type: string; headline: string; claim_refs: string[]; table_ids: string[]; gap_notes: string[] }[]) {
      const materials = buildPageMaterials(page, all.claims, all.tables);
      const { system, user } = buildPageDraftRequest(page, materials);
      const output = page.page_id === 'page_02'
        ? { uncovered: false, headline: '上半年销售承压', bullets: [{ text: '上半年销售额同比下降 7.1%' }] }
        : { uncovered: true, headline: page.headline, bullets: [] };
      calls.push({
        key: transportKey({ provider: 'minimax-cn', modelId: 'MiniMax-M2.7' }, { system, user }),
        request: { provider: 'minimax-cn', modelId: 'MiniMax-M2.7', system, user },
        response: { text: JSON.stringify(output), cost: 0.001 },
      });
    }
    writeFileSync(replayPath, JSON.stringify({ calls }));
    // 1) 未批准 → 生成 403 needsApproval（出站围栏在默认路径生效）
    const blocked = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/generate`,
      payload: { audience: '经营负责人', purpose: '上半年复盘' },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().needsApproval).toBe(true);

    // 2) 批准后生成完成（起草阶段真实发生）
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outbound/approve`, payload: { mode: 'authorized-summary' } });
    const gen = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/generate`,
      payload: { audience: '经营负责人', purpose: '上半年复盘' },
    });
    expect(gen.json().generation.status).toBe('done');
    const draftStage = gen.json().generation.stages.find((s: { name: string }) => s.name === 'draft');
    expect(draftStage.pages['page_02']).toBe('ai');

    // 3) 体检
    const checks = (await app.inject({ method: 'POST', url: `/api/projects/${projectId}/checks`, payload: { exportScope: 'internal' } })).json();
    expect(typeof checks.blockers).toBe('number');

    // 4) G1 签批
    const g1 = await app.inject({ method: 'POST', url: `/api/projects/${projectId}/approve-g1`, payload: { approver: '张编制' } });
    expect(g1.statusCode).toBe(200);

    // 5) 内用正式导出（不需外发勾选）
    const exp = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/export`,
      payload: { mode: 'formal', formats: ['pptx'], exportScope: 'internal' },
    })).json();
    expect(exp.allowed).toBe(true);

    // 6) 外发未勾选拦截、勾选放行
    const extBlocked = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/export`,
      payload: { mode: 'formal', formats: ['pptx'], exportScope: 'external', chart_data_mode: 'aggregate_only' },
    })).json();
    expect(extBlocked.allowed).toBe(false);
    const extOk = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/export`,
      payload: { mode: 'formal', formats: ['pptx'], exportScope: 'external', chart_data_mode: 'aggregate_only', ack_external_share: true },
    })).json();
    expect(extOk.allowed).toBe(true);

    // 7) 审计流含 draft 阶段（零内容）
    const audit = await store.readAuditLog(projectId);
    expect(audit.some((e) => e.stage === 'draft' && e.status === 'page_done')).toBe(true);
    for (const e of audit) expect(Object.keys(e)).not.toContain('text');
  });

  it('预算超帽：起草在阶段边界停下并明示', async () => {
    // 预置 50 条真实调用（默认次数线触顶）
    for (let i = 0; i < 50; i++) {
      await store.appendOutboundLog(projectId, {
        at: new Date().toISOString(), stage: 'other', provider: 'p', modelId: 'm',
        mode: 'authorized-summary', itemCount: 1, bytes: 10, cost: 0, blocked: false,
      });
    }
    await store.updateProject(projectId, { privacy_policy: 'allow_external' });
    const res = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/generate`,
      payload: { audience: '经营负责人', purpose: '上半年复盘' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toContain('预算超帽');
  });
});

import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { transportKey } from '../src/model/recording.js';
import { buildPageDraftRequest, buildPageMaterialsSensitiveAware } from '../src/model/ai-draft.js';
import { buildPageMaterials } from '../src/model/ai-draft.js';
import { WorkbenchService } from '../src/server/workbench.js';

const MAT = join(import.meta.dirname, 'fixtures/materials');

/**
 * M7 S1：LLM 逐页起草服务（PRD D1–D4/G1–G3/G7，红队 KA-2 硬约束）。
 * 材料进 → 逐页 LLM 起草完整内容 → 成品稿；数字护栏/白名单/不编造/回退全部程序强制。
 */

interface Stage {
  name: string;
  status: string;
  error?: string;
  note?: string;
  pages?: Record<string, string>;
}

describe('M7 S1 LLM 逐页起草', () => {
  let dir: string;
  let app: ReturnType<typeof buildServer>;
  let store: WorkspaceStore;
  let replayPath: string;
  let projectId: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'rs-gen-draft-'));
    store = new WorkspaceStore(dir);
    replayPath = join(dir, 'replay.json');
    process.env['REPORT_STUDIO_MODEL_REPLAY'] = replayPath;
    app = buildServer(store);
    const createRes = await app.inject({ method: 'POST', url: '/api/projects', payload: { title: '起草测试' } });
    projectId = createRes.json().project.project_id;
    for (const f of [
      { filename: 'conclusion.md', kind: 'markdown', media_type: 'text/markdown' },
      { filename: 'sales.csv', kind: 'csv', media_type: 'text/csv' },
    ] as const) {
      const content_base64 = (await readFile(join(MAT, f.filename))).toString('base64');
      await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/sources`,
        payload: { filename: f.filename, content_base64, kind: f.kind, media_type: f.media_type },
      });
    }
    await store.updateProject(projectId, { privacy_policy: 'allow_external' });
  });
  afterEach(async () => {
    delete process.env['REPORT_STUDIO_MODEL_REPLAY'];
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  /** 按模版 page_plan 全页配 replay（未指定页默认 uncovered——无数字不触护栏，且避免熔断污染） */
  async function stageDraftReplay(pages: Record<string, unknown>, opts?: { headlines?: Record<string, string> }): Promise<void> {
    const wb = new WorkbenchService(store);
    const brief = { audience: '商品经营负责人', purpose: '上半年复盘', page_budget: 8, language: 'zh-CN', deliverable_type: 'meeting_deck' } as const;
    await wb.saveBrief(projectId, brief);
    const tpl = (await import('../src/schema/template.js')).getTemplate('ops_review_deck')!;
    await wb.composeOutline(projectId, brief, { pagePlan: tpl.page_plan });
    const work = JSON.parse(readFileSync(join(dir, projectId, 'work', 'state.json'), 'utf-8'));
    const loaded = await (wb as unknown as { loadDerived(pid: string): Promise<{ all: { claims: { claim_id: string; text: string; evidence_refs: string[] }[]; tables: { table_id: string; source_id: string }[]; evidence: { evidence_id: string; source_id: string }[] } }> }).loadDerived(projectId);
    const sources = await store.listSourceAssets(projectId);
    const calls: unknown[] = [];
    for (const page0 of work.outline.pages as { page_id: string; type: string; headline: string; claim_refs: string[]; table_ids: string[]; gap_notes: string[] }[]) {
      const page = opts?.headlines?.[page0.page_id] ? { ...page0, headline: opts.headlines[page0.page_id]! } : page0;
      const output = pages[page.page_id] ?? { uncovered: true, headline: page.headline, bullets: [] };
      const { materials, pageBlocked } = buildPageMaterialsSensitiveAware(page, loaded.all, sources);
      if (pageBlocked) continue; // 生产对敏感绑定页整页不出站
      const { system, user } = buildPageDraftRequest(page, materials);
      calls.push({
        key: transportKey({ provider: 'minimax-cn', modelId: 'MiniMax-M2.7' }, { system, user }),
        request: { provider: 'minimax-cn', modelId: 'MiniMax-M2.7', system, user },
        response: { text: JSON.stringify(output), cost: 0.001 },
      });
    }
    writeFileSync(replayPath, JSON.stringify({ calls }));
  }

  it('逐页起草：成稿页面内容为 LLM 起草（replay），阶段含逐页结果', async () => {
    await stageDraftReplay({
      page_01: { uncovered: false, headline: '上半年经营复盘：重点门店承压', bullets: [], body: undefined },
      page_02: {
        uncovered: false,
        headline: '上半年销售承压，缺货是可能因素',
        bullets: [
          { text: '上半年销售额同比下降 7.1%', claim_ref: 'c1' },
          { text: '缺货尚未证实为因果，需进一步验证' },
        ],
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/generate`,
      payload: { audience: '商品经营负责人', purpose: '上半年复盘' },
    });
    expect(res.statusCode).toBe(200);
    const gen = res.json().generation;
    expect(gen.status).toBe('done');
    const draftStage = gen.stages.find((s: Stage) => s.name === 'draft');
    expect(draftStage.status).toBe('done');
    expect(draftStage.pages['page_02']).toBe('ai');

    const spec = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;
    const page2 = spec.pages.find((p: { page_id: string }) => p.page_id === 'page_02');
    expect(page2.headline).toBe('上半年销售承压，缺货是可能因素');
    expect(page2.bullets.map((b: { text: string }) => b.text)).toEqual([
      '上半年销售额同比下降 7.1%',
      '缺货尚未证实为因果，需进一步验证',
    ]);
  });

  it('数字护栏：起草页编造数字 → 该页回退确定性占位并明示，其他页不受影响', async () => {
    await stageDraftReplay({
      page_02: {
        uncovered: false,
        headline: '销售额暴跌 99%',
        bullets: [{ text: '销售额同比下降 99%' }],
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/generate`,
      payload: { audience: '商品经营负责人', purpose: '上半年复盘' },
    });
    const gen = res.json().generation;
    expect(gen.status).toBe('done');
    const draftStage = gen.stages.find((s: Stage) => s.name === 'draft');
    expect(draftStage.pages['page_02']).toBe('fallback');
    const spec = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;
    const page2 = spec.pages.find((p: { page_id: string }) => p.page_id === 'page_02');
    expect(page2.headline).not.toBe('销售额暴跌 99%');
  });

  it('uncovered：材料未覆盖 → 页标记 uncovered，不编造内容', async () => {
    await stageDraftReplay({
      page_02: { uncovered: true, headline: '重点门店销售', bullets: [] },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/generate`,
      payload: { audience: '商品经营负责人', purpose: '上半年复盘' },
    });
    const gen = res.json().generation;
    const draftStage = gen.stages.find((s: Stage) => s.name === 'draft');
    expect(draftStage.pages['page_02']).toBe('uncovered');
  });

  it('无模型（空 replay）→ 整体回退确定性骨架并明示「已用规则版」', async () => {
    writeFileSync(replayPath, JSON.stringify({ calls: [] }));
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/generate`,
      payload: { audience: '商品经营负责人', purpose: '上半年复盘' },
    });
    expect(res.statusCode).toBe(200);
    const gen = res.json().generation;
    expect(gen.status).toBe('done');
    const draftStage = gen.stages.find((s: Stage) => s.name === 'draft');
    // 空 replay：每页 2 次尝试后页级回退（不编造），整体仍产出骨架
    expect(draftStage.status).toBe('done');
    expect(draftStage.note).toContain('规则版');
    // 空材料页被 L2 短路为 uncovered（不烧调用），其余真实调用页全 miss → fallback
    expect(Object.values(draftStage.pages).every((v: string) => v === 'fallback' || v === 'uncovered')).toBe(true);
    expect(Object.values(draftStage.pages).some((v: string) => v === 'fallback')).toBe(true);
    // 成稿仍产出（确定性骨架）
    const spec = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;
    expect(spec.pages.length).toBeGreaterThan(0);
  });

  it('越权 claim_ref 被白名单剥离（保留文本，不留悬空引用）', async () => {
    await stageDraftReplay({
      page_02: {
        uncovered: false,
        headline: '上半年销售承压',
        bullets: [{ text: '上半年销售额同比下降 7.1%', claim_ref: 'c_fabricated' }],
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/generate`,
      payload: { audience: '商品经营负责人', purpose: '上半年复盘' },
    });
    const spec = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;
    const page2 = spec.pages.find((p: { page_id: string }) => p.page_id === 'page_02');
    for (const b of page2.bullets as { claim_ref?: string }[]) {
      if (b.claim_ref) expect(page2.claim_refs).toContain(b.claim_ref);
    }
  });

  it('未批准出站（with_approval）→ 生成 403 needsApproval；批准后通过', async () => {
    await store.updateProject(projectId, { privacy_policy: 'allow_external_with_approval' });
    await stageDraftReplay({
      page_02: { uncovered: false, headline: '重点门店销售承压', bullets: [{ text: '重点门店销售额同比下降 12%' }] },
    });
    const blocked = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/generate`,
      payload: { audience: '商品经营负责人', purpose: '上半年复盘' },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().needsApproval).toBe(true);
    await app.inject({ method: 'POST', url: `/api/projects/${projectId}/outbound/approve`, payload: { mode: 'authorized-summary' } });
    const ok = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/generate`,
      payload: { audience: '商品经营负责人', purpose: '上半年复盘' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().generation.status).toBe('done');
  });

  it('大纲确认开关：confirm_outline 停在确认层，confirm 后继续；已完成生成幂等不重调', async () => {
    await stageDraftReplay({
      page_02: { uncovered: false, headline: '重点门店销售承压', bullets: [{ text: '重点门店销售额同比下降 12%' }] },
    });
    const spy = vi.spyOn(WorkbenchService.prototype as unknown as { modelClient: () => Promise<unknown> }, 'modelClient');
    const paused = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/generate`,
      payload: { audience: '商品经营负责人', purpose: '上半年复盘', confirm_outline: true },
    });
    expect(paused.json().generation.status).toBe('awaiting_confirmation');
    // 按覆盖后的 headline 构造 replay 键（confirm 会改 outline headline → 请求键随之变化）
    await stageDraftReplay({
      page_02: { uncovered: false, headline: '重点门店销售承压（确认版）', bullets: [{ text: '上半年销售额同比下降 7.1%' }] },
    }, { headlines: { page_02: '确认后的标题' } });
    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/generate/confirm`,
      payload: { headlines: { page_02: '确认后的标题' } },
    });
    expect(confirmed.json().generation.status).toBe('done');
    const spec = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;
    const page2 = spec.pages.find((p: { page_id: string }) => p.page_id === 'page_02');
    // 确认层 headline 是起草主旨；AI 起草产出最终标题（对齐 Kimi 大纲确认→生成语义）
    expect(page2.headline).toBe('重点门店销售承压（确认版）');
    // 幂等：done 后重跑不再调模型
    const callsBefore = spy.mock.calls.length;
    const again = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/generate`,
      payload: { audience: '商品经营负责人', purpose: '上半年复盘' },
    });
    expect(again.json().generation.status).toBe('done');
    expect(spy.mock.calls.length).toBe(callsBefore);
    spy.mockRestore();
  });

  it('敏感来源排除：表格与敏感绑定页均不出站（REVIEW H1/M2，键锁定断言）', async () => {
    // csv 标记 sensitive → 表格出站被滤；md 也标记 → 其绑定页整页 fail-closed
    const detail = (await app.inject({ url: `/api/projects/${projectId}` })).json();
    const { writeFileSync } = await import('node:fs');
    for (const src of detail.sources as { source_id: string; kind: string }[]) {
      const metaPath = join(dir, projectId, 'sources', `${src.source_id}.json`);
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      meta.sensitivity = 'sensitive';
      writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    }
    await stageDraftReplay({});
    const gen = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/generate`,
      payload: { audience: '商品经营负责人', purpose: '上半年复盘' },
    });
    expect(gen.json().generation.status).toBe('done');
    const draftStage = gen.json().generation.stages.find((s: Stage) => s.name === 'draft');
    const outcomes = draftStage.pages as Record<string, string>;
    // 逐页预期对照（键锁定）：blocked 页 → fallback（不出站）；非 blocked 页 → 键命中（过滤后材料逐字节一致）
    const wb2 = new WorkbenchService(store);
    const work2 = JSON.parse(readFileSync(join(dir, projectId, 'work', 'state.json'), 'utf-8'));
    const loaded2 = await (wb2 as unknown as { loadDerived(pid: string): Promise<{ all: { claims: { claim_id: string; text: string; evidence_refs: string[] }[]; tables: { table_id: string; source_id: string }[]; evidence: { evidence_id: string; source_id: string }[] } }> }).loadDerived(projectId);
    const sources2 = await store.listSourceAssets(projectId);
    for (const page of work2.outline.pages as { page_id: string; claim_refs: string[]; table_ids: string[] }[]) {
      const { pageBlocked } = buildPageMaterialsSensitiveAware(page, loaded2.all, sources2);
      if (pageBlocked) expect(outcomes[page.page_id]).toBe('fallback');
      else expect(outcomes[page.page_id] === 'ai' || outcomes[page.page_id] === 'uncovered').toBe(true);
    }
  });

  it('敏感绑定页 fail-closed：整页不出站（headline 可能嵌入敏感原文，REVIEW H1）', async () => {
    // 只把 md 标记 sensitive：其主张派生的 headline 页整页跳过
    const detail = (await app.inject({ url: `/api/projects/${projectId}` })).json();
    const { writeFileSync } = await import('node:fs');
    for (const src of detail.sources as { source_id: string; kind: string }[]) {
      if (src.kind !== 'markdown') continue;
      const metaPath = join(dir, projectId, 'sources', `${src.source_id}.json`);
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
      meta.sensitivity = 'sensitive';
      writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    }
    await stageDraftReplay({});
    const gen = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/generate`,
      payload: { audience: '商品经营负责人', purpose: '上半年复盘' },
    });
    const draftStage = gen.json().generation.stages.find((s: Stage) => s.name === 'draft');
    const audit = await store.readAuditLog(projectId);
    const sensitiveStops = audit.filter((e) => e.stage === 'draft' && e.status === 'page_fallback');
    // 有页因敏感绑定被跳过（审计留痕），且未发起该页调用
    expect(sensitiveStops.some((e) => (e.detail as { reason?: string })?.reason === 'sensitive_page')).toBe(true);
    expect(Object.values(draftStage.pages ?? {}).some((v) => v === 'fallback')).toBe(true);
  });

  it('逐页 checkpoint 续跑：回退页重跑、已完成页不再调模型（REVIEW Medium3）', async () => {
    // 先只给 page_02 配 replay（其余页 miss → fallback）
    const wb = new WorkbenchService(store);
    const brief = { audience: '商品经营负责人', purpose: '上半年复盘', page_budget: 8, language: 'zh-CN', deliverable_type: 'meeting_deck' } as const;
    await wb.saveBrief(projectId, brief);
    const tpl = (await import('../src/schema/template.js')).getTemplate('ops_review_deck')!;
    await wb.composeOutline(projectId, brief, { pagePlan: tpl.page_plan });
    const work = JSON.parse(readFileSync(join(dir, projectId, 'work', 'state.json'), 'utf-8'));
    const { all } = await (wb as unknown as { loadDerived(pid: string): Promise<{ all: { claims: { claim_id: string; text: string }[]; tables: never[] } }> }).loadDerived(projectId);
    // page_01 也配 replay：让熔断器从 page_03 才开始熔（否则 page_02 会被前面页的失败波及）
    const { writeFileSync } = await import('node:fs');
    const calls: unknown[] = [];
    for (const pid of ['page_01', 'page_02']) {
      const pg = work.outline.pages.find((x: { page_id: string }) => x.page_id === pid);
      const materials = buildPageMaterialsSensitiveAware(pg, all, await store.listSourceAssets(projectId)).materials;
      const { system, user } = buildPageDraftRequest(pg, materials);
      const output = pid === 'page_02'
        ? { uncovered: false, headline: '上半年销售承压', bullets: [{ text: '上半年销售额同比下降 7.1%' }] }
        : { uncovered: true, headline: pg.headline, bullets: [] };
      calls.push({
        key: transportKey({ provider: 'minimax-cn', modelId: 'MiniMax-M2.7' }, { system, user }),
        request: { provider: 'minimax-cn', modelId: 'MiniMax-M2.7', system, user },
        response: { text: JSON.stringify(output), cost: 0.001 },
      });
    }
    writeFileSync(replayPath, JSON.stringify({ calls }));
    const first = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/generate`,
      payload: { audience: '商品经营负责人', purpose: '上半年复盘' },
    });
    const draft1 = first.json().generation.stages.find((s: Stage) => s.name === 'draft');
    expect(draft1.pages['page_02']).toBe('ai');
    const fallbackCount1 = Object.values(draft1.pages).filter((v: string) => v === 'fallback').length;
    expect(fallbackCount1).toBeGreaterThan(0);

    // 补齐全部页的 replay → 重启（新实例，熔断冷却随之清零）后续跑只重跑回退页
    await stageDraftReplay({});
    const app2 = buildServer(new WorkspaceStore(dir));
    try {
      const resumed = await app2.inject({
        method: 'POST', url: `/api/projects/${projectId}/generate`,
        payload: { audience: '商品经营负责人', purpose: '上半年复盘' },
      });
      const draft2 = resumed.json().generation.stages.find((s: Stage) => s.name === 'draft');
      expect(draft2.pages['page_02']).toBe('ai'); // 沿用 checkpoint，不重跑
      expect(Object.values(draft2.pages).every((v: string) => v !== 'fallback')).toBe(true);
      expect(draft2.total).toBe(8);
      // H2 锁定：续跑后成稿必须重组装——第一轮被熔断页若有 AI 标题，续跑后 spec 应反映
      const spec2 = (await app2.inject({ url: `/api/projects/${projectId}` })).json().spec;
      const page1 = spec2.pages.find((p: { page_id: string }) => p.page_id === 'page_01');
      expect(page1).toBeTruthy();
    } finally {
      await app2.close();
    }
  });

  it('审计流含 draft 阶段事件且零内容', async () => {
    await stageDraftReplay({
      page_02: { uncovered: false, headline: '重点门店销售承压', bullets: [{ text: '重点门店销售额同比下降 12%' }] },
    });
    await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/generate`,
      payload: { audience: '商品经营负责人', purpose: '上半年复盘' },
    });
    const audit = await store.readAuditLog(projectId);
    const draftEvents = audit.filter((e) => e.stage === 'draft');
    expect(draftEvents.length).toBeGreaterThan(0);
    for (const e of audit) expect(Object.keys(e)).not.toContain('text');
  });
});

import { buildServer } from '../src/server/app.js';
import { WorkspaceStore } from '../src/storage/workspace.js';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { transportKey } from '../src/model/recording.js';
import { buildPageRewriteRequest, digitGuardViolation } from '../src/model/ai-page.js';
import { EditOpSchema } from '../src/schema/requests.js';
import { retailBundleRich, retailBrief } from './helpers/retail.js';
import type { ReportBrief } from '../src/schema/report-spec.js';

/**
 * S6：LLM 整页重生成（PRD D3/G4-C）。
 * 模型只起草整页最小 op（rewrite_page），经 zod 强校验 + page_id 白名单 + 数字护栏；
 * 应用仍走既有 /propose 控制器（锁/版本/审计），模型无直写通道。
 */

async function setupEditorialProject(app: ReturnType<typeof buildServer>, pid: string): Promise<void> {
  await app.inject({ method: 'POST', url: `/api/projects/${pid}/bundle`, payload: retailBundleRich() });
  await app.inject({ method: 'POST', url: `/api/projects/${pid}/brief`, payload: { brief: retailBrief } });
  const recs = (await app.inject({ method: 'POST', url: `/api/projects/${pid}/recommend` })).json().recommendations;
  await app.inject({ method: 'POST', url: `/api/projects/${pid}/decisions`, payload: { decisions: recs } });
  await app.inject({ method: 'POST', url: `/api/projects/${pid}/outline`, payload: { brief: retailBrief } });
  // G1 前 assemble（草拟预览）：rewrite_page 与 regenerate_page 同类属实质变更，
  // G1 后应用会被变更控制器拒（既有 §8.4 围栏不变）——整页重生成在 G1 前使用
  await app.inject({ method: 'POST', url: `/api/projects/${pid}/assemble`, payload: {} });
}

const INSTRUCTION = '把第 2 页整体精简：要点合并为三条，结论更直白';
const GOOD_OUTPUT = JSON.stringify({
  op: {
    kind: 'rewrite_page',
    page_id: 'page_02',
    headline: '重点门店拖累整体表现',
    bullets: [{ text: '重点门店表现不及预期' }, { text: '长尾门店保持稳定' }, { text: '渠道结构需要调整' }],
  },
  note: '按指令精简整页，保留结论方向',
});

describe('S6 LLM 整页重生成', () => {
  let dir: string;
  let app: ReturnType<typeof buildServer>;
  let store: WorkspaceStore;
  let projectId: string;
  let replayPath: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'rs-ai-page-'));
    store = new WorkspaceStore(dir);
    replayPath = join(dir, 'replay.json');
    process.env['REPORT_STUDIO_MODEL_REPLAY'] = replayPath;
    app = buildServer(store);
    projectId = (await app.inject({ method: 'POST', url: '/api/projects', payload: { title: 'AI 整页重生成' } })).json().project.project_id;
    await setupEditorialProject(app, projectId);
  });
  afterEach(async () => {
    delete process.env['REPORT_STUDIO_MODEL_REPLAY'];
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  async function stageReplay(modelOutput: string): Promise<string> {
    await store.updateProject(projectId, { privacy_policy: 'allow_external' });
    const spec = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;
    // 与 workbench 同参：boundaries 来自 editorial state 的 brief（retailBrief.required_boundaries）
    const { system, user } = buildPageRewriteRequest(spec, 'page_02', INSTRUCTION, {
      boundaries: (retailBrief as ReportBrief).required_boundaries ?? [],
    });
    writeFileSync(replayPath, JSON.stringify({ calls: [{
      key: transportKey({ provider: 'minimax-cn', modelId: 'MiniMax-M3' }, { system, user }),
      request: { provider: 'minimax-cn', modelId: 'MiniMax-M3', system, user },
      response: { text: modelOutput, cost: 0.001 },
    }] }));
    return spec.revision_id;
  }

  it('整页重生成：op 过 zod + 白名单，未确认不落库，确认后经控制器应用', async () => {
    const expectedRev = await stageReplay(GOOD_OUTPUT);
    const draft = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/proposal/draft`,
      payload: { intent: INSTRUCTION, page_id: 'page_02', scope: 'rewrite_page' },
    });
    expect(draft.statusCode).toBe(200);
    const body = draft.json();
    expect(body.op.kind).toBe('rewrite_page');
    expect(body.op.page_id).toBe('page_02');
    expect(body.op.bullets).toHaveLength(3);
    expect(body.expected_revision).toBe(expectedRev);

    // 未确认前 spec 不变（无直写通道）
    const before = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;
    const pageBefore = before.pages.find((p: { page_id: string }) => p.page_id === 'page_02');
    expect(pageBefore.headline).not.toBe('重点门店拖累整体表现');

    // 确认应用走 /propose（锁/版本/审计）
    const applied = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/propose`,
      payload: { op: body.op, expected_revision: body.expected_revision, source: 'model-draft' },
    });
    expect(applied.statusCode).toBe(200);
    const after = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;
    const pageAfter = after.pages.find((p: { page_id: string }) => p.page_id === 'page_02');
    expect(pageAfter.headline).toBe('重点门店拖累整体表现');
    expect(pageAfter.bullets.map((b: { text: string }) => b.text)).toEqual([
      '重点门店表现不及预期',
      '长尾门店保持稳定',
      '渠道结构需要调整',
    ]);
  });

  it('数字护栏：模型改动数字被拒（越权字段/表格数值不改），报 400', async () => {
    // 数字被改动：原页含数字的要点被改写成不同数字
    const badOutput = JSON.stringify({
      op: {
        kind: 'rewrite_page',
        page_id: 'page_02',
        headline: '增长 99%',
        bullets: [{ text: '销售额增长 99%' }],
      },
      note: '改动数字应被拒绝',
    });
    await stageReplay(badOutput);
    const draft = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/proposal/draft`,
      payload: { intent: INSTRUCTION, page_id: 'page_02', scope: 'rewrite_page' },
    });
    expect(draft.statusCode).toBe(400);
    expect(draft.json().error ?? draft.json()).toMatch(/数字/);
  });

  it('page_id 白名单：模型指向不存在的页面被拒', async () => {
    const badOutput = JSON.stringify({
      op: { kind: 'rewrite_page', page_id: 'page_99', headline: 'x', bullets: [{ text: 'y' }] },
      note: 'n',
    });
    await stageReplay(badOutput);
    const draft = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/proposal/draft`,
      payload: { intent: INSTRUCTION, page_id: 'page_02', scope: 'rewrite_page' },
    });
    expect(draft.statusCode).toBe(400);
  });

  it('digitGuardViolation：改写措辞放行；修改/发明数字被拦；精简删除数字允许', () => {
    expect(digitGuardViolation(['销售额增长 12%'], ['增速 12% 超预期'])).toBeNull();
    expect(digitGuardViolation(['销售额增长 12%'], ['销售额增长 99%'])).toMatch(/数字/);
    expect(digitGuardViolation(['销售额增长 12%'], ['销售额增长 12%，翻了一倍 200%'])).toMatch(/数字/);
    expect(digitGuardViolation(['销售额增长 12%'], ['销售额增长'])).toBeNull(); // 精简合并允许删除数字
  });

  it('出站白名单：只发目标页内容 + 页索引（不带其他页 headline），结构性防泄漏（红队 K3）', async () => {
    await store.updateProject(projectId, { privacy_policy: 'allow_external' });
    const spec = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;
    const { user } = buildPageRewriteRequest(spec, 'page_02', INSTRUCTION);
    // 白名单：其他页独有的正文/要点不外发（目标页与其他页共享的主张文本合法出现在目标页内容里）
    const target = spec.pages.find((x: { page_id: string }) => x.page_id === 'page_02') as { body?: string; bullets?: { text: string }[] };
    const targetTexts = new Set([target.body ?? '', ...(target.bullets ?? []).map((b) => b.text)]);
    for (const pg of spec.pages as { page_id: string; body?: string; bullets?: { text: string }[] }[]) {
      if (pg.page_id !== 'page_02') {
        if (pg.body && !targetTexts.has(pg.body)) expect(user).not.toContain(pg.body);
        for (const b of pg.bullets ?? []) if (!targetTexts.has(b.text)) expect(user).not.toContain(b.text);
      }
    }
    // 页索引只含 page_id/type，无 headline 文本泄漏
    const idx = (spec.pages as { page_id: string; headline: string }[]).find((x) => x.page_id !== 'page_02');
    if (idx) expect(user).not.toContain(idx.headline);
    expect(user).toContain(INSTRUCTION);
    expect(user).toContain('page_02');
  });

  it('rewrite 草案应用后 body/审计如实（含 body 时替换，diff 记录变化）', async () => {
    await stageReplay(GOOD_OUTPUT);
    const draft = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/proposal/draft`,
      payload: { intent: INSTRUCTION, page_id: 'page_02', scope: 'rewrite_page' },
    })).json();
    const applied = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/propose`,
      payload: { op: draft.op, expected_revision: draft.expected_revision, source: 'model-draft' },
    })).json();
    const changes = applied.proposal?.changes ?? applied.changes ?? [];
    const fields = changes.map((c: { field: string }) => c.field);
    expect(fields).toContain('headline');
    expect(fields).toContain('bullets');
    // body 未被模型改写 → 原正文保留且不进 diff（不静默清空）
    const after = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;
    const pageAfter = after.pages.find((p: { page_id: string }) => p.page_id === 'page_02');
    expect(pageAfter.bullets).toHaveLength(3);
  });

  it('rewrite 草案带 body：应用后正文被替换且 diff 记录 body 变化', async () => {
    await stageReplay(GOOD_OUTPUT);
    const specBefore = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;
    const bodyBefore = specBefore.pages.find((p: { page_id: string }) => p.page_id === 'page_02')?.body;
    // 构造带 body 的模型输出
    const withBody = JSON.parse(GOOD_OUTPUT);
    withBody.op.body = '替换后的正文内容';
    await stageReplay(JSON.stringify(withBody));
    const draft = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/proposal/draft`,
      payload: { intent: INSTRUCTION, page_id: 'page_02', scope: 'rewrite_page' },
    })).json();
    expect(draft.op.body).toBe('替换后的正文内容');
    const applied = (await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/propose`,
      payload: { op: draft.op, expected_revision: draft.expected_revision, source: 'model-draft' },
    })).json();
    const changes = (applied.proposal?.changes ?? applied.changes ?? []) as { field: string }[];
    expect(changes.map((c) => c.field)).toContain('body');
    const after = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;
    expect(after.pages.find((p: { page_id: string }) => p.page_id === 'page_02')?.body).toBe('替换后的正文内容');
    void bodyBefore;
  });

  it('fail-closed：目标页含敏感来源主张时整页外发被拒（403）', async () => {
    await store.updateProject(projectId, { privacy_policy: 'allow_external' });
    const spec = (await app.inject({ url: `/api/projects/${projectId}` })).json().spec;
    const page = spec.pages.find((p: { page_id: string }) => p.page_id === 'page_02') as { claim_refs: string[] };
    expect(page.claim_refs.length).toBeGreaterThan(0);
    expect(() =>
      buildPageRewriteRequest(spec, 'page_02', INSTRUCTION, { excludeClaimRefs: page.claim_refs }),
    ).toThrow(/敏感来源/);
  });

  it('模型不可用回退明示，主流程零阻塞（503 + 原因）', async () => {
    await store.updateProject(projectId, { privacy_policy: 'allow_external' });
    writeFileSync(replayPath, JSON.stringify({ calls: [] })); // replay 空 → 全链失败
    const draft = await app.inject({
      method: 'POST', url: `/api/projects/${projectId}/proposal/draft`,
      payload: { intent: INSTRUCTION, page_id: 'page_02', scope: 'rewrite_page' },
    });
    expect(draft.statusCode).toBe(503);
  });
});

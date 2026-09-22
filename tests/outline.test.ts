import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ingestCsv, ingestMarkdown } from '../src/ingest/index.js';
import { createDeterministicGateway, type OutlineContext } from '../src/model/gateway.js';
import { PrivacyGate, OutboundBlockedError } from '../src/model/privacy-gate.js';
import type { Claim, ReportBrief } from '../src/schema/report-spec.js';

const MAT = join(import.meta.dirname, 'fixtures/materials');

const brief: ReportBrief = {
  audience: '商品经营负责人',
  purpose: '上半年经营复盘与方案讨论',
  page_budget: 8,
};

async function buildContext(overrides: Partial<OutlineContext> = {}): Promise<OutlineContext> {
  const md = await readFile(join(MAT, 'conclusion.md'), 'utf-8');
  const csv = await readFile(join(MAT, 'sales.csv'), 'utf-8');
  const mdRes = ingestMarkdown(md, 'src_md');
  const csvRes = ingestCsv(csv, 'src_csv');
  return {
    brief,
    claims: mdRes.claims as Claim[],
    tables: csvRes.tables,
    evidence: mdRes.evidence,
    conflicts: [],
    notes: [],
    confirmations: csvRes.confirmations,
    ...overrides,
  };
}

describe('确定性大纲编排（F05，G11）', () => {
  it('按复盘主线生成页计划：页型齐全、证据绑定、含待补充提示', async () => {
    const ctx = await buildContext();
    const gateway = createDeterministicGateway();
    const draft = await gateway.composeOutline(ctx);

    const types = draft.pages.map((p) => p.type);
    expect(types).toEqual([
      'cover', 'summary', 'metrics_overview', 'trend', 'issue_breakdown',
      'option_comparison', 'action_items', 'evidence_appendix',
    ]);

    // 趋势页绑定表格；推断页绑定推断主张
    const trend = draft.pages.find((p) => p.type === 'trend')!;
    expect(trend.table_ids).toEqual(['tbl_src_csv']);
    const issue = draft.pages.find((p) => p.type === 'issue_breakdown')!;
    expect(issue.claim_refs.length).toBe(1);
    const issueClaim = ctx.claims.find((c) => c.claim_id === issue.claim_refs[0])!;
    expect(issueClaim.kind).toBe('inference');

    // 摘要页：发现=事实、限制=未证实推断（不得把推断放进"发现"）
    const summary = draft.pages.find((p) => p.type === 'summary')!;
    const summaryKinds = summary.claim_refs.map((id) => ctx.claims.find((c) => c.claim_id === id)!.kind);
    expect(summaryKinds).toContain('fact_statement');
    expect(summaryKinds).toContain('inference'); // 作为限制出现，但同页可见其未证实身份
    const inf = ctx.claims.find((c) => c.kind === 'inference')!;
    expect(inf.verification_state).toBe('unverified');

    // 待确认问题进入 open_questions（单位确认）
    expect(draft.open_questions.some((q) => q.includes('客单价'))).toBe(true);
  });

  it('材料不足：生成待补充提示，不编造故事', async () => {
    const gateway = createDeterministicGateway();
    const draft = await gateway.composeOutline({
      brief, claims: [], tables: [], evidence: [], conflicts: [], notes: [], confirmations: [],
    });
    expect(draft.pages.length).toBeGreaterThan(3);
    for (const p of draft.pages.slice(1)) {
      // 没有材料的页面只能带 gap_notes，不允许出现凭空 claim_refs
      expect(p.claim_refs).toEqual([]);
      expect(p.gap_notes.length).toBeGreaterThan(0);
    }
    expect(draft.open_questions.length).toBeGreaterThan(0);
  });

  it('改变受众/目的不改变事实与关键数字绑定（F03）', async () => {
    const ctx = await buildContext();
    const gateway = createDeterministicGateway();
    const d1 = await gateway.composeOutline(ctx);
    const d2 = await gateway.composeOutline({
      ...ctx,
      brief: { ...brief, audience: '门店店长', purpose: '周会同步' },
    });
    // 除封面/摘要的预填文案外，各内容页的绑定不变
    for (let i = 0; i < d1.pages.length; i++) {
      const p1 = d1.pages[i]!;
      const p2 = d2.pages[i]!;
      if (p1.type === 'cover' || p1.type === 'summary') continue;
      expect(p2.claim_refs).toEqual(p1.claim_refs);
      expect(p2.table_ids).toEqual(p1.table_ids);
    }
  });
});

describe('PrivacyGate 出站门禁（F12）', () => {
  const ctxBase = () => ({
    brief, claims: [], tables: [], evidence: [], conflicts: [], notes: [], confirmations: [],
  });

  it('local_only + 外部模型 → 阻断出站并记录，本地功能不受影响', async () => {
    const fakeExternal = {
      id: 'openai-fake',
      external: true,
      composeOutline: async () => { throw new Error('should not be called'); },
    };
    const gate = new PrivacyGate(fakeExternal, { policy: () => 'local_only' });
    await expect(gate.composeOutline(ctxBase())).rejects.toBeInstanceOf(OutboundBlockedError);
    expect(gate.outboundLog.length).toBe(1);
    expect(gate.outboundLog[0]!.blocked).toBe(true);

    // 本地确定性通道不受模型可用性影响
    const local = new PrivacyGate(createDeterministicGateway(), { policy: () => 'local_only' });
    const draft = await local.composeOutline(await buildContext());
    expect(draft.pages.length).toBe(8);
  });

  it('allow_external_with_approval：未批准阻断，批准后放行并记录', async () => {
    let called = 0;
    const fakeExternal = {
      id: 'fake',
      external: true,
      composeOutline: async () => { called += 1; return { pages: [], open_questions: [] }; },
    };
    const gate = new PrivacyGate(fakeExternal, { policy: () => 'allow_external_with_approval' });
    await expect(gate.composeOutline(ctxBase())).rejects.toBeInstanceOf(OutboundBlockedError);

    const draft = await gate.composeOutline(ctxBase(), { approval: 'approved-by-user' });
    expect(called).toBe(1);
    expect(draft.pages).toEqual([]);
    expect(gate.outboundLog.at(-1)!.blocked).toBe(false);
  });

  it('allow_external：直接放行并记录出站摘要（不记录完整敏感内容）', async () => {
    const fakeExternal = {
      id: 'fake',
      external: true,
      composeOutline: async (ctx: any) => ({ pages: [], open_questions: [`claims:${ctx.claims.length}`] }),
    };
    const gate = new PrivacyGate(fakeExternal, { policy: () => 'allow_external' });
    const draft = await gate.composeOutline(await buildContext());
    expect(draft.open_questions[0]).toContain('claims:');
    const log = gate.outboundLog[0]!;
    expect(log.blocked).toBe(false);
    expect(log.summary.claim_count).toBeGreaterThan(0);
    expect(JSON.stringify(log)).not.toContain('缺货可能是'); // 日志不含敏感正文
  });
});

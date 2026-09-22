import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ingestCsv, ingestMarkdown } from '../src/ingest/index.js';
import { createDeterministicGateway, type OutlineContext } from '../src/model/gateway.js';
import {
  assembleReportSpec,
  assemblePage,
  type AssembleContext,
} from '../src/compose/assemble.js';
import { applyEdit, EditRejectedError } from '../src/compose/edit.js';
import { validateReportSpec, type ReportSpec } from '../src/schema/report-spec.js';
import { runChecks } from '../src/checks/engine.js';
import type { Claim, ReportBrief } from '../src/schema/report-spec.js';

const MAT = join(import.meta.dirname, 'fixtures/materials');
const brief: ReportBrief = {
  audience: '商品经营负责人',
  purpose: '上半年经营复盘与方案讨论',
  page_budget: 8,
};

async function buildFixture(): Promise<{ spec: ReportSpec; ctx: AssembleContext }> {
  const md = await readFile(join(MAT, 'conclusion.md'), 'utf-8');
  const csv = await readFile(join(MAT, 'sales.csv'), 'utf-8');
  const mdRes = ingestMarkdown(md, 'src_md');
  const csvRes = ingestCsv(csv, 'src_csv');
  const outlineCtx: OutlineContext = {
    brief,
    claims: mdRes.claims as Claim[],
    tables: csvRes.tables,
    evidence: mdRes.evidence,
    conflicts: [],
    notes: [],
    confirmations: csvRes.confirmations,
  };
  const draft = await createDeterministicGateway().composeOutline(outlineCtx);
  const ctx: AssembleContext = {
    brief,
    claims: outlineCtx.claims,
    tables: outlineCtx.tables,
    evidence: outlineCtx.evidence,
    conflicts: [],
    notes: [],
    pagePlans: draft.pages,
    sourceSnapshot: [
      { source_id: 'src_md', version: 'v1', is_demo: true },
      { source_id: 'src_csv', version: 'v1', is_demo: true },
    ],
  };
  const spec = assembleReportSpec({ report_id: 'report_test_001', ctx });
  return { spec, ctx };
}

describe('ReportSpec 组装（F06）', () => {
  it('大纲+资产 → 合法 ReportSpec，引用完整、图表与表格同源', async () => {
    const { spec } = await buildFixture();
    expect(() => validateReportSpec(spec)).not.toThrow();
    // 引用完整性：claim_refs/metric_refs 都能落到对象
    const claimIds = new Set(spec.claims.map((c) => c.claim_id));
    for (const p of spec.pages) for (const r of p.claim_refs) expect(claimIds.has(r)).toBe(true);
    // trend 页图表数值来自表格（452 可追溯）
    const trend = spec.pages.find((p) => p.type === 'trend')!;
    expect(trend.chart?.series[0]!.data.at(-1)!.value).toBe(452);
    // 演示数据标注（来源 is_demo → 必要标注）
    expect(spec.pages.some((p) => p.required_note?.includes('演示数据'))).toBe(true);
  });

  it('推断保留未证实状态进入问题拆解页，不进结论摘要的发现位', async () => {
    const { spec } = await buildFixture();
    const issue = spec.pages.find((p) => p.type === 'issue_breakdown')!;
    expect(issue.bullets?.some((b) => b.status === 'unverified')).toBe(true);
    const summary = spec.pages.find((p) => p.type === 'summary')!;
    const factBullet = summary.bullets?.find((b) => b.label === '发现');
    expect(factBullet?.status).toBe('needs_review'); // 绑定来源 ≠ 已证实 → 待复核
  });
});

describe('局部编辑稳定性（F08，§13.2 局部修改行）', () => {
  it('只改第 3 页标题：其余页内容与绑定逐字不变', async () => {
    const { spec } = await buildFixture();
    const next = applyEdit(spec, { kind: 'edit_text', page_id: 'page_03', field: 'headline', text: '改后的指标页标题' }, {});
    expect(next.pages.find((p) => p.page_id === 'page_03')!.headline).toBe('改后的指标页标题');
    for (const p of next.pages.filter((p) => p.page_id !== 'page_03')) {
      expect(p).toEqual(spec.pages.find((o) => o.page_id === p.page_id)!);
    }
  });

  it('单页重生成：目标页从证据重建，其余页不变', async () => {
    const { spec, ctx } = await buildFixture();
    const tampered = structuredClone(spec);
    const target = tampered.pages.find((p) => p.type === 'trend')!;
    target.headline = '被手滑改坏的标题';
    target.chart = undefined;
    const next = applyEdit(tampered, { kind: 'regenerate_page', page_id: target.page_id }, ctx);
    const regen = next.pages.find((p) => p.page_id === target.page_id)!;
    expect(regen.chart).toBeDefined(); // 从表格重建
    expect(regen.headline).not.toContain('手滑');
    for (const p of next.pages.filter((p) => p.page_id !== target.page_id)) {
      expect(p).toEqual(spec.pages.find((o) => o.page_id === p.page_id)!);
    }
  });

  it('锁定页：重生成与文字修改被拒绝，解锁后可改', async () => {
    const { spec, ctx } = await buildFixture();
    const locked = applyEdit(spec, { kind: 'toggle_lock', page_id: 'page_05', locked: true }, {});
    expect(() =>
      applyEdit(locked, { kind: 'edit_text', page_id: 'page_05', field: 'headline', text: 'x' }, {}),
    ).toThrow(EditRejectedError);
    expect(() =>
      applyEdit(locked, { kind: 'regenerate_page', page_id: 'page_05' }, ctx),
    ).toThrow(EditRejectedError);
    const unlocked = applyEdit(locked, { kind: 'toggle_lock', page_id: 'page_05', locked: false }, {});
    expect(
      applyEdit(unlocked, { kind: 'edit_text', page_id: 'page_05', field: 'headline', text: 'x' }, {})
        .pages.find((p) => p.page_id === 'page_05')!.headline,
    ).toBe('x');
  });

  it('页序调整：顺序变化、页对象本身不变', async () => {
    const { spec } = await buildFixture();
    const ids = spec.pages.map((p) => p.page_id);
    const reordered = [ids[0]!, ids[5]!, ids[1]!, ...ids.slice(2, 5), ...ids.slice(6)];
    const next = applyEdit(spec, { kind: 'reorder', order: reordered }, {});
    expect(next.pages.map((p) => p.page_id)).toEqual(reordered);
    for (const p of next.pages) {
      expect(p).toEqual(spec.pages.find((o) => o.page_id === p.page_id)!);
    }
  });

  it('布局切换：layout_id 变化、内容字段不变', async () => {
    const { spec } = await buildFixture();
    const next = applyEdit(spec, { kind: 'switch_layout', page_id: 'page_04', layout_id: 'headline_chart_full' }, {});
    const changed = next.pages.find((p) => p.page_id === 'page_04')!;
    const before = spec.pages.find((p) => p.page_id === 'page_04')!;
    expect(changed.layout_id).toBe('headline_chart_full');
    const { layout_id: _l, ...contentA } = changed;
    const { layout_id: _r, ...contentB } = before;
    expect(contentA).toEqual(contentB);
  });
});

describe('单页组装器', () => {
  it('assemblePage 可独立重建单页（供重生成使用）', async () => {
    const { spec, ctx } = await buildFixture();
    const plan = ctx.pagePlans.find((p) => p.page_id === 'page_03')!;
    const rebuilt = assemblePage(plan, ctx, spec.pages.length);
    expect(rebuilt.type).toBe('metrics_overview');
    expect(rebuilt.table).toBeDefined();
  });
});

describe('拆页操作（§5.3 "第三页拆成两页"）', () => {
  it('拆分要点页：两页各半、后续页不变、claim_refs 随要点分配', async () => {
    const { spec } = await buildFixture();
    const next = applyEdit(spec, { kind: 'split_page', page_id: 'page_02' }, {});
    expect(next.pages).toHaveLength(spec.pages.length + 1);
    const first = next.pages.find((p) => p.page_id === 'page_02')!;
    const second = next.pages.find((p) => p.page_id === 'page_02b')!;
    expect(first.bullets!.length + second.bullets!.length).toBe(3);
    expect(second.headline).toContain('（续）');
    expect(second.type).toBe(first.type);
    for (const p of next.pages.filter((x) => !['page_02', 'page_02b'].includes(x.page_id))) {
      expect(p).toEqual(spec.pages.find((o) => o.page_id === p.page_id)!);
    }
  });

  it('表格页拆分：行各半；内容不足的页面拒绝拆分', async () => {
    const { spec } = await buildFixture();
    const next = applyEdit(spec, { kind: 'split_page', page_id: 'page_03' }, {}); // 指标总览（表格）
    const second = next.pages.find((p) => p.page_id === 'page_03b')!;
    expect(second.table!.rows.length).toBeGreaterThanOrEqual(1);
    expect(firstRows(next) + second.table!.rows.length).toBe(6); // sales.csv 六行
    expect(() => applyEdit(spec, { kind: 'split_page', page_id: 'page_04' }, {})).toThrow(EditRejectedError); // trend 无要点/表格
  });
});

function firstRows(spec: ReportSpec): number {
  return spec.pages.find((p) => p.page_id === 'page_03')!.table!.rows.length;
}

describe('指标派生（§10.2 简单计算由代码完成并保留公式输入）', () => {
  it('组装时从表格派生变化率 metric，复算通过，趋势页绑定', async () => {
    const { spec } = await buildFixture();
    expect(spec.metrics.length).toBeGreaterThan(0);
    const m = spec.metrics[0]!;
    expect(m.formula).toBe('(current - previous) / previous');
    expect(m.inputs).toEqual({ previous: 470, current: 452 }); // 5月→6月（sales.csv）
    expect(m.source_ref).toBeTruthy();
    const r = runChecks(spec, { conflicts: [] });
    expect(r.issues.find((i) => i.id === 'metric_recompute_failed')).toBeUndefined();
    const trend = spec.pages.find((p) => p.type === 'trend')!;
    expect(trend.metric_refs).toContain(m.metric_id);
  });
});

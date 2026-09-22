import { describe, expect, it } from 'vitest';
import { runChecks, draftExportSpec, exportGate } from '../src/checks/engine.js';
import { recomputeMetric } from '../src/checks/compute.js';
import { validateReportSpec, type Metric, type ReportSpec } from '../src/schema/report-spec.js';
import { retailReviewSpec } from '../src/samples/retail-review.js';

function specWith(patch: (s: ReportSpec) => void): ReportSpec {
  const s = structuredClone(retailReviewSpec);
  patch(s);
  return validateReportSpec(s);
}

const ratioMetric: Metric = {
  metric_id: 'profit_margin_change',
  value: 0.05, // 百分点差：20% → 25%
  unit: 'ratio',
  display_format: '0.0%',
  scope: '利润率从 20% 到 25%',
  formula: '(current - previous) / previous',
  inputs: { previous: 0.2, current: 0.25 },
  source_ref: 'src_x@v1',
};

describe('计算复算（§10.2：代码复算，不依赖模型口算）', () => {
  it('变化率复算一致', () => {
    const m: Metric = {
      metric_id: 'm1', value: -0.2, unit: 'ratio', display_format: '0.0%',
      formula: '(current - previous) / previous', inputs: { previous: 1000000, current: 800000 },
      source_ref: 's@v1',
    };
    const r = recomputeMetric(m);
    expect(r.ok).toBe(true);
    expect(Number(r.value)).toBeCloseTo(-0.2, 3);
  });

  it('不支持的公式 → 无法复算（不算失败，交给警告）', () => {
    const r = recomputeMetric({ ...ratioMetric, formula: 'magic(x)' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('unsupported');
  });

  it('数值与公式矛盾 → 阻断（§13.2 单位/数字错误行）', () => {
    const s = specWith((s) => {
      s.metrics = [
        { ...ratioMetric, value: -0.25 }, // 与公式矛盾
      ];
    });
    const r = runChecks(s, { conflicts: [] });
    const blocker = r.issues.find((i) => i.id === 'metric_recompute_failed');
    expect(blocker?.severity).toBe('blocker');
    expect(blocker?.object_ref).toContain('profit_margin_change');
  });
});

describe('百分比与百分点（§13.2 行）', () => {
  const claim = (text: string) => (s: ReportSpec) => {
    s.metrics = [ratioMetric];
    s.claims = [
      { claim_id: 'c1', kind: 'computed_statement', text, metric_refs: ['profit_margin_change'], verification_state: 'arithmetic_checked' },
    ];
    s.pages[1]!.claim_refs = ['c1'];
    s.pages[1]!.bullets = [{ label: '发现', text, status: 'confirmed' }];
  };

  it('"上升 5 个百分点" 正确', () => {
    const r = runChecks(specWith(claim('利润率上升 5 个百分点')), { conflicts: [] });
    expect(r.issues.find((i) => i.id === 'percent_unit_misuse')).toBeUndefined();
  });

  it('"上升 5%" 既不是百分点也不是相对增长 → 阻断并定位对象', () => {
    const r = runChecks(specWith(claim('利润率上升 5%')), { conflicts: [] });
    const blocker = r.issues.find((i) => i.id === 'percent_unit_misuse');
    expect(blocker?.severity).toBe('blocker');
    expect(blocker?.page_id).toBe(specWith(claim('x')).pages[1]!.page_id);
  });

  it('"增长 25%"（相对增长）正确', () => {
    const r = runChecks(specWith(claim('利润率相对增长 25%')), { conflicts: [] });
    expect(r.issues.find((i) => i.id === 'percent_unit_misuse')).toBeUndefined();
  });
});

describe('单位矛盾（元/万元，§13.2）', () => {
  it('同指标跨页单位冲突 → 阻断', () => {
    const s = specWith((s) => {
      s.pages[2]!.table = {
        columns: [
          { key: 'm', label: '指标' }, { key: 'v', label: '销售额（元）', align: 'right' },
        ],
        rows: [{ key: 'r1', cells: ['销售额', '2,921,000'] }],
      };
      // 第 8 页附录再造一个万元口径的同名列
      s.pages[7]!.table = {
        columns: [
          { key: 'm', label: '指标' }, { key: 'v', label: '销售额（万元）', align: 'right' },
        ],
        rows: [{ key: 'r1', cells: ['销售额', '2,921'] }],
      };
    });
    const r = runChecks(s, { conflicts: [] });
    const blocker = r.issues.find((i) => i.id === 'unit_contradiction');
    expect(blocker?.severity).toBe('blocker');
    expect(blocker?.message).toContain('销售额');
    expect(blocker?.message).toContain('元');
    expect(blocker?.message).toContain('万元');
  });
});

describe('材料冲突与导出门禁（§10.3）', () => {
  it('未解决冲突 → 阻断正式导出；草稿可导出且明确标识', () => {
    const s = specWith(() => {});
    const conflict = {
      conflict_id: 'conflict_1', row_key: '6月', column_label: '销售额（万元）',
      values: [{ source_id: 'a', value: 452 }, { source_id: 'b', value: 455 }],
      resolution: 'unresolved' as const,
    };
    const r = runChecks(s, { conflicts: [conflict] });
    expect(r.issues.find((i) => i.id === 'source_conflict_unresolved')?.severity).toBe('blocker');

    const formal = exportGate(r, { mode: 'formal' });
    expect(formal.allowed).toBe(false);
    const draft = exportGate(r, { mode: 'draft' });
    expect(draft.allowed).toBe(true);

    const draftSpec = draftExportSpec(s, r);
    expect(draftSpec.pages[0]!.subtitle).toContain('草稿');
    expect(draftSpec.pages[0]!.required_note).toContain('未解决');
  });

  it('冲突解决后不再阻断', () => {
    const s = specWith(() => {});
    const resolved = {
      conflict_id: 'c', row_key: '6月', column_label: '销售额（万元）',
      values: [{ source_id: 'a', value: 452 }, { source_id: 'b', value: 455 }],
      resolution: 'source_a' as const,
    };
    const r = runChecks(s, { conflicts: [resolved] });
    expect(r.issues.find((i) => i.id === 'source_conflict_unresolved')).toBeUndefined();
    expect(exportGate(r, { mode: 'formal' }).allowed).toBe(true);
  });

  it('外部分享越权 → 阻断（F12 导出行）', () => {
    const s = specWith(() => {});
    const r = runChecks(s, { conflicts: [], exportScope: 'external' });
    expect(r.issues.find((i) => i.id === 'external_share_violation')?.severity).toBe('blocker');
    expect(exportGate(r, { mode: 'formal' }).allowed).toBe(false);
  });

  it('干净样例：正式导出放行（零阻断）', () => {
    const s = specWith(() => {});
    const r = runChecks(s, { conflicts: [] });
    expect(r.issues.filter((i) => i.severity === 'blocker')).toEqual([]);
    expect(exportGate(r, { mode: 'formal' }).allowed).toBe(true);
  });
});

describe('警告项（可发布但需确认）', () => {
  it('未核实来源/缺绑定/页面过密 → 警告不阻断', () => {
    const s = specWith((s) => {
      s.claims.push({
        claim_id: 'c_unbound', kind: 'fact_statement', text: '无来源的断言',
        evidence_refs: [], verification_state: 'unverified',
      });
      s.pages[1]!.bullets = Array.from({ length: 8 }, (_, i) => ({
        label: '发现', text: `很长很长的问题发现之${i}`, status: 'confirmed' as const,
      }));
    });
    const r = runChecks(s, { conflicts: [] });
    expect(r.issues.find((i) => i.id === 'claim_missing_evidence')?.severity).toBe('warning');
    expect(r.issues.find((i) => i.id === 'page_too_dense')?.severity).toBe('warning');
    expect(r.issues.find((i) => i.id === 'claim_unverified')?.severity).toBe('warning');
    expect(exportGate(r, { mode: 'formal' }).allowed).toBe(true);
  });
});

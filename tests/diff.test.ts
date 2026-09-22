import { describe, expect, it } from 'vitest';
import { diffSpecs } from '../src/compose/diff.js';
import { applyEdit } from '../src/compose/edit.js';
import { retailReviewSpec } from '../src/samples/retail-review.js';

describe('版本比较 diffSpecs（§5.3 差异显示）', () => {
  it('只改第 3 页标题 → 恰好一处变更（金标准：M1 编辑稳定性用例）', () => {
    const b = applyEdit(retailReviewSpec, { kind: 'edit_text', page_id: 'page_metrics', field: 'headline', text: '改后的指标标题' }, {});
    const d = diffSpecs(retailReviewSpec, b);
    expect(d.pages_added).toEqual([]);
    expect(d.pages_removed).toEqual([]);
    expect(d.pages_reordered).toEqual([]);
    expect(d.pages_changed).toHaveLength(1);
    expect(d.pages_changed[0]!.page_id).toBe('page_metrics');
    expect(d.pages_changed[0]!.changes).toHaveLength(1);
    expect(d.pages_changed[0]!.changes[0]).toMatchObject({
      field: 'headline',
      before: '关键指标：销售下降，客单价平稳，缺货率上升',
      after: '改后的指标标题',
    });
    expect(d.metrics_changed).toEqual([]);
    expect(d.claims_changed).toEqual([]);
  });

  it('拆页 → pages_added 精确报告新页；原页要点数变化入页内差异', () => {
    const b = applyEdit(retailReviewSpec, { kind: 'split_page', page_id: 'page_summary' }, {});
    const d = diffSpecs(retailReviewSpec, b);
    expect(d.pages_added).toEqual(['page_summaryb']);
    expect(d.pages_changed.map((p) => p.page_id)).toContain('page_summary');
  });

  it('页序调整 → pages_reordered 列出位置变化的页', () => {
    const ids = retailReviewSpec.pages.map((p) => p.page_id);
    const reordered = [ids[0]!, ids[2]!, ids[1]!, ...ids.slice(3)];
    const b = applyEdit(retailReviewSpec, { kind: 'reorder', order: reordered }, {});
    const d = diffSpecs(retailReviewSpec, b);
    expect(d.pages_reordered.sort()).toEqual([ids[1], ids[2]].sort());
  });

  it('指标数值变化 → metrics_changed（旧→新）', () => {
    const b = structuredClone(retailReviewSpec);
    b.metrics[0]!.value = 3000;
    const d = diffSpecs(retailReviewSpec, b);
    expect(d.metrics_changed).toHaveLength(1);
    expect(d.metrics_changed[0]).toMatchObject({ metric_id: 'h1_sales_total', before: '2921', after: '3000' });
  });

  it('claim 文本或验证状态变化 → claims_changed', () => {
    const b = structuredClone(retailReviewSpec);
    b.claims[1]!.verification_state = 'needs_review';
    const d = diffSpecs(retailReviewSpec, b);
    expect(d.claims_changed[0]).toMatchObject({
      claim_id: 'claim_stockout_cause',
      field: 'verification_state',
      before: 'unverified',
      after: 'needs_review',
    });
  });

  it('表格单元变化 → 定位到行/列', () => {
    const b = structuredClone(retailReviewSpec);
    b.pages[2]!.table!.rows[0]!.cells[1] = '9,999';
    const d = diffSpecs(retailReviewSpec, b);
    const page = d.pages_changed.find((p) => p.page_id === 'page_metrics')!;
    const cell = page.changes.find((c) => c.field === 'table')!;
    expect(cell.before).toBe('2,921');
    expect(cell.after).toBe('9,999');
    expect(cell.locator).toContain('销售额');
  });

  it('完全相同 → 全空差异', () => {
    const d = diffSpecs(retailReviewSpec, structuredClone(retailReviewSpec));
    expect(d.pages_added.length + d.pages_removed.length + d.pages_reordered.length + d.pages_changed.length + d.metrics_changed.length + d.claims_changed.length).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { applyEdit, EditRejectedError } from '../src/compose/edit.js';
import { EditOpSchema } from '../src/schema/requests.js';
import type { ReportSpec } from '../src/schema/report-spec.js';

function miniSpec(): ReportSpec {
  return {
    report_id: 'report_test',
    title: '测试报告',
    version: '1',
    created_at: '2026-10-05T00:00:00Z',
    pages: [
      {
        page_id: 'page_01',
        type: 'cover',
        headline: '封面',
        body: '正文甲',
        claim_refs: [],
        sources: [],
      },
      {
        page_id: 'page_02',
        type: 'summary',
        headline: '摘要',
        body: '正文乙',
        claim_refs: [],
        sources: [],
      },
      {
        page_id: 'page_03',
        type: 'action_items',
        headline: '建议',
        claim_refs: [],
        sources: [],
      },
    ],
  } as unknown as ReportSpec;
}

describe('delete_page 与 body 直改（S3）', () => {
  it('EditOpSchema 接受 delete_page 与 edit_text body', () => {
    expect(() => EditOpSchema.parse({ kind: 'delete_page', page_id: 'page_02' })).not.toThrow();
    expect(() =>
      EditOpSchema.parse({ kind: 'edit_text', page_id: 'page_01', field: 'body', text: '新正文' }),
    ).not.toThrow();
  });

  it('delete_page 删除目标页，其余页不变，页 id 不重排', () => {
    const next = applyEdit(miniSpec(), { kind: 'delete_page', page_id: 'page_02' } as never, {});
    expect(next.pages.map((p) => p.page_id)).toEqual(['page_01', 'page_03']);
    // 范围外内容不变
    expect(next.pages[0]!.body).toBe('正文甲');
    expect(next.pages[1]!.headline).toBe('建议');
  });

  it('delete_page 拒绝：不存在的页、锁定的页、仅剩一页', () => {
    expect(() => applyEdit(miniSpec(), { kind: 'delete_page', page_id: 'page_99' } as never, {})).toThrow(
      EditRejectedError,
    );
    const locked = miniSpec();
    (locked.pages[1] as { locked: boolean }).locked = true;
    expect(() => applyEdit(locked, { kind: 'delete_page', page_id: 'page_02' } as never, {})).toThrow(/已锁定/);
    const one = miniSpec();
    one.pages = [one.pages[0]!];
    expect(() => applyEdit(one, { kind: 'delete_page', page_id: 'page_01' } as never, {})).toThrow(/最后一页/);
  });

  it('rewrite_page 不带 body 保留原正文，带 body 则替换（不静默清空）', () => {
    const kept = applyEdit(
      miniSpec(),
      { kind: 'rewrite_page', page_id: 'page_01', headline: '新标题', bullets: [{ text: 'b1' }] } as never,
      {},
    );
    expect(kept.pages[0]!.body).toBe('正文甲'); // 原正文保留
    const replaced = applyEdit(
      miniSpec(),
      { kind: 'rewrite_page', page_id: 'page_01', headline: '新标题', bullets: [{ text: 'b1' }], body: '新正文' } as never,
      {},
    );
    expect(replaced.pages[0]!.body).toBe('新正文');
  });

  it('rewrite_page 保留 bullet claim_ref（须在页 claim_refs 白名单内）', () => {
    const spec = miniSpec();
    (spec.pages[0] as { claim_refs: string[] }).claim_refs = ['c1'];
    (spec.pages[0] as { bullets: { text: string; claim_ref?: string }[] }).bullets = [{ text: '旧', claim_ref: 'c1' }];
    const next = applyEdit(
      spec,
      { kind: 'rewrite_page', page_id: 'page_01', headline: 'h', bullets: [{ text: '新', claim_ref: 'c1' }] } as never,
      {},
    );
    expect((next.pages[0] as { bullets: { claim_ref?: string }[] }).bullets[0]!.claim_ref).toBe('c1');
    expect(() =>
      applyEdit(spec, { kind: 'rewrite_page', page_id: 'page_01', headline: 'h', bullets: [{ text: 'x', claim_ref: 'c99' }] } as never, {}),
    ).toThrow(/白名单|claim/);
  });

  it('delete_page 遵守报告级页序锁', () => {
    const spec = miniSpec();
    (spec as { locks?: { page_order?: boolean } }).locks = { page_order: true };
    expect(() => applyEdit(spec, { kind: 'delete_page', page_id: 'page_02' } as never, {})).toThrow(/页序/);
  });

  it('edit_text body 直改生效且受 body 锁约束', () => {
    const next = applyEdit(
      miniSpec(),
      { kind: 'edit_text', page_id: 'page_01', field: 'body', text: '改过的正文' } as never,
      {},
    );
    expect(next.pages[0]!.body).toBe('改过的正文');

    const locked = miniSpec();
    (locked.pages[0] as { locks: { body: boolean } }).locks = { body: true } as never;
    expect(() =>
      applyEdit(locked, { kind: 'edit_text', page_id: 'page_01', field: 'body', text: 'x' } as never, {}),
    ).toThrow(/已锁定/);
  });
});

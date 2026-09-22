import type { ReportSpec } from '../schema/report-spec.js';
import { assemblePage, type AssembleContext } from './assemble.js';

/**
 * 局部编辑（F08）：每次修改显式指定作用范围，范围外内容与绑定默认不变。
 * 锁定对象拒绝重生成与内容修改（页序调整不受锁影响——顺序不是内容）。
 * 所有操作返回新 spec，不改写原对象（修订链在存储层）。
 */

export class EditRejectedError extends Error {
  constructor(reason: string) {
    super(`编辑被拒绝：${reason}`);
    this.name = 'EditRejectedError';
  }
}

export type EditOp =
  | { kind: 'edit_text'; page_id: string; field: 'headline' | 'body'; text: string }
  | { kind: 'reorder'; order: string[] }
  | { kind: 'regenerate_page'; page_id: string }
  | { kind: 'split_page'; page_id: string }
  | { kind: 'switch_layout'; page_id: string; layout_id: string }
  | { kind: 'toggle_lock'; page_id: string; locked: boolean };

function findPage(spec: ReportSpec, pageId: string) {
  const page = spec.pages.find((p) => p.page_id === pageId);
  if (!page) throw new EditRejectedError(`页面不存在：${pageId}`);
  return page;
}

/** 只更新目标页、其余页原样返回（编辑稳定性的单一实现点） */
function updatePage(spec: ReportSpec, pageId: string, patch: (p: ReportSpec['pages'][number]) => ReportSpec['pages'][number]): ReportSpec {
  return { ...spec, pages: spec.pages.map((p) => (p.page_id === pageId ? patch(p) : p)) };
}

export function applyEdit(spec: ReportSpec, op: EditOp, ctx: Partial<AssembleContext>): ReportSpec {
  switch (op.kind) {
    case 'edit_text': {
      const page = findPage(spec, op.page_id);
      if (page.locked) throw new EditRejectedError(`页面 ${op.page_id} 已锁定`);
      return updatePage(spec, op.page_id, (p) => ({ ...p, [op.field]: op.text }));
    }
    case 'reorder': {
      const current = new Set(spec.pages.map((p) => p.page_id));
      const next = new Set(op.order);
      if (current.size !== op.order.length || [...current].some((id) => !next.has(id))) {
        throw new EditRejectedError('order 必须恰好包含当前全部页面');
      }
      const byId = new Map(spec.pages.map((p) => [p.page_id, p]));
      return { ...spec, pages: op.order.map((id) => byId.get(id)!) };
    }
    case 'regenerate_page': {
      const page = findPage(spec, op.page_id);
      if (page.locked) throw new EditRejectedError(`页面 ${op.page_id} 已锁定，拒绝重生成`);
      const plan = ctx.pagePlans?.find((p) => p.page_id === op.page_id || p.type === page.type);
      if (!plan || !ctx.claims || !ctx.tables) {
        throw new EditRejectedError('缺少组装上下文（pagePlans/claims/tables），无法重生成');
      }
      const pageNum = spec.pages.findIndex((p) => p.page_id === op.page_id) + 1;
      const rebuilt = assemblePage(plan, ctx as AssembleContext, pageNum);
      return updatePage(spec, op.page_id, (p) => ({
        ...rebuilt,
        page_id: op.page_id,
        locked: p.locked,
        layout_id: p.layout_id ?? rebuilt.layout_id,
      }));
    }
    case 'split_page': {
      // §5.3 "第三页拆成两页"：后半内容成为（续）页；新页 id 加后缀，不重排其余页 id（编辑稳定性）
      const page = findPage(spec, op.page_id);
      if (page.locked) throw new EditRejectedError(`页面 ${op.page_id} 已锁定`);
      const secondId = `${op.page_id}b`;
      if (spec.pages.some((p) => p.page_id === secondId)) {
        throw new EditRejectedError(`拆分目标 id 已存在：${secondId}`);
      }
      let first = page;
      let second = { ...page, page_id: secondId, headline: `${page.headline}（续）` };
      if ((page.bullets?.length ?? 0) >= 2) {
        const mid = Math.ceil(page.bullets!.length / 2);
        const head = page.bullets!.slice(0, mid);
        const tail = page.bullets!.slice(mid);
        first = { ...page, bullets: head, claim_refs: head.map((b) => b.claim_ref).filter((x): x is string => !!x) };
        second = { ...second, bullets: tail, table: undefined, claim_refs: tail.map((b) => b.claim_ref).filter((x): x is string => !!x) };
      } else if ((page.table?.rows.length ?? 0) >= 2) {
        const mid = Math.ceil(page.table!.rows.length / 2);
        first = { ...page, table: { ...page.table!, rows: page.table!.rows.slice(0, mid) } };
        second = { ...second, table: { ...page.table!, rows: page.table!.rows.slice(mid) } };
      } else {
        throw new EditRejectedError(`页面 ${op.page_id} 内容不足以拆分（需至少 2 条要点或 2 行表格）`);
      }
      const idx = spec.pages.findIndex((p) => p.page_id === op.page_id);
      const pages = [...spec.pages];
      pages.splice(idx, 1, first, second);
      return { ...spec, pages };
    }
    case 'switch_layout': {
      findPage(spec, op.page_id);
      return updatePage(spec, op.page_id, (p) => ({ ...p, layout_id: op.layout_id }));
    }
    case 'toggle_lock': {
      findPage(spec, op.page_id);
      return updatePage(spec, op.page_id, (p) => ({ ...p, locked: op.locked }));
    }
  }
}

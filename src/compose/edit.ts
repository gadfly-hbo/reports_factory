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
  | { kind: 'switch_layout'; page_id: string; layout_id: string }
  | { kind: 'toggle_lock'; page_id: string; locked: boolean };

function findPage(spec: ReportSpec, pageId: string) {
  const page = spec.pages.find((p) => p.page_id === pageId);
  if (!page) throw new EditRejectedError(`页面不存在：${pageId}`);
  return page;
}

export function applyEdit(spec: ReportSpec, op: EditOp, ctx: Partial<AssembleContext>): ReportSpec {
  switch (op.kind) {
    case 'edit_text': {
      const page = findPage(spec, op.page_id);
      if (page.locked) throw new EditRejectedError(`页面 ${op.page_id} 已锁定`);
      return {
        ...spec,
        pages: spec.pages.map((p) =>
          p.page_id === op.page_id ? { ...p, [op.field]: op.text } : p,
        ),
      };
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
      return {
        ...spec,
        pages: spec.pages.map((p) =>
          p.page_id === op.page_id
            ? { ...rebuilt, page_id: op.page_id, locked: p.locked, layout_id: p.layout_id ?? rebuilt.layout_id }
            : p,
        ),
      };
    }
    case 'switch_layout': {
      findPage(spec, op.page_id);
      return {
        ...spec,
        pages: spec.pages.map((p) => (p.page_id === op.page_id ? { ...p, layout_id: op.layout_id } : p)),
      };
    }
    case 'toggle_lock': {
      findPage(spec, op.page_id);
      return {
        ...spec,
        pages: spec.pages.map((p) => (p.page_id === op.page_id ? { ...p, locked: op.locked } : p)),
      };
    }
  }
}

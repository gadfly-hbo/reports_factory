import { randomUUID } from 'node:crypto';
import type { ReportSpec } from '../schema/report-spec.js';
import type { AssembleContext } from './assemble.js';
import { applyEdit, EditOp, EditRejectedError } from './edit.js';
import type { ChangeProposal } from '../schema/proposal.js';

/**
 * 变更控制器（模块方案 §12.2）：所有写路径收敛为提案 → 校验 → 原子应用 → 审计。
 * 检查顺序：①版本一致（T15）→ ②G1 后实质变更范围（§8.4）→ ③锁定（applyEdit 内统一实现）
 * → ④原子应用（不可变 spec，失败即弃）。
 * G1 前允许编辑并留审计（G2 决议：单管线）；G1 后重生成/拆页属实质变更，需重新编审。
 */

const SUBSTANTIVE_OPS = new Set<EditOp['kind']>(['regenerate_page', 'split_page']);

/** §12.1 approved_scope：由操作类型推导的作用范围类别（审计可读） */
function scopeOf(op: EditOp): string {
  switch (op.kind) {
    case 'edit_text': return `text_trim:${op.field}`;
    case 'reorder': return 'page_order';
    case 'switch_layout': return 'visual_layout';
    case 'toggle_lock':
    case 'set_locks':
    case 'set_report_locks': return 'lock';
    case 'regenerate_page':
    case 'split_page': return 'content_rebuild';
  }
}

/** 内容性变化须重跑的编审检查（§12.2 第 6 步：受影响对象重检） */
const CONTENT_RECHECKS = ['editorial_scope_drift', 'editorial_boundary_visibility', 'editorial_causal_overclaim'];

export type ProposalState = 'applied' | 'rejected' | 'stale';

export interface ProposalOutcome {
  ok: boolean;
  state: ProposalState;
  reason?: string;
  proposal: ChangeProposal;
  spec?: ReportSpec;
}

export function evaluateProposal(
  spec: ReportSpec,
  input: { op: EditOp; expected_revision: string; report_id: string; source?: string },
  ctx: Partial<AssembleContext>,
  editorialStatus: string | undefined,
): ProposalOutcome {
  const proposal: ChangeProposal = {
    proposal_id: `pr_${randomUUID().slice(0, 8)}`,
    report_id: input.report_id,
    expected_revision: input.expected_revision,
    op: input.op,
    approved_scope: scopeOf(input.op),
    ...(input.source ? { source: input.source } : {}),
    required_checks: input.op.kind === 'edit_text' || input.op.kind === 'reorder'
      || input.op.kind === 'regenerate_page' || input.op.kind === 'split_page' ? CONTENT_RECHECKS : [],
    changes: [],
    affected: [],
    state: 'applied',
    created_at: new Date().toISOString(),
  };

  // ① 版本一致：旧提案不得覆盖用户新修改（T15：长时间生成返回的旧结果被拒）
  if (input.expected_revision !== spec.revision_id) {
    return {
      ok: false,
      state: 'stale',
      reason: `预期修订 ${input.expected_revision} 与当前修订 ${spec.revision_id} 不一致（期间已有修改）`,
      proposal: { ...proposal, state: 'stale', reason: 'expected_revision 不匹配' },
    };
  }

  // ② G1 后实质变更范围（§8.4）：重生成/拆页重写内容，超出"局部语言精简"，需重新编审
  const postG1 = editorialStatus === 'g1_approved' || editorialStatus === 'draft_editing' || editorialStatus === 'published';
  if (postG1 && SUBSTANTIVE_OPS.has(input.op.kind)) {
    return {
      ok: false,
      state: 'rejected',
      reason: `G1 已批准后 ${input.op.kind} 属实质变更（重写页面内容），需重新编审后再应用`,
      proposal: { ...proposal, state: 'rejected', reason: 'G1 后实质变更' },
    };
  }

  // ③④ 锁定与原子应用：applyEdit 不可变返回，锁定违规抛 EditRejectedError → 无半应用状态
  try {
    const next = applyEdit(spec, input.op, ctx);
    const changes = describeChanges(spec, next, input.op);
    return {
      ok: true,
      state: 'applied',
      proposal: { ...proposal, changes, applied_at: new Date().toISOString() },
      spec: next,
    };
  } catch (e) {
    if (e instanceof EditRejectedError) {
      return {
        ok: false,
        state: 'rejected',
        reason: e.message,
        proposal: { ...proposal, state: 'rejected', reason: e.message },
      };
    }
    throw e;
  }
}

/** 变更描述（审计 before/after）：按操作类型精确记录目标对象与字段（§12.1 changes[]） */
function describeChanges(before: ReportSpec, after: ReportSpec, op: EditOp): ChangeProposal['changes'] {
  switch (op.kind) {
    case 'edit_text':
      return [{
        object_id: op.page_id,
        field: op.field,
        before: before.pages.find((p) => p.page_id === op.page_id)?.[op.field],
        after: op.text,
      }];
    case 'reorder':
      return [{ object_id: 'report', field: 'page_order', before: before.pages.map((p) => p.page_id), after: after.pages.map((p) => p.page_id) }];
    case 'switch_layout':
      return [{ object_id: op.page_id, field: 'layout_id', before: before.pages.find((p) => p.page_id === op.page_id)?.layout_id, after: op.layout_id }];
    case 'regenerate_page':
    case 'split_page': {
      const before_ = before.pages.find((p) => p.page_id === op.page_id);
      const after_ = after.pages.find((p) => p.page_id === op.page_id);
      return [{ object_id: op.page_id, field: 'content', before: before_?.headline, after: after_?.headline }];
    }
    case 'toggle_lock':
      return [{ object_id: op.page_id, field: 'locked', before: before.pages.find((p) => p.page_id === op.page_id)?.locked, after: op.locked }];
    case 'set_locks':
      return [{ object_id: op.page_id, field: 'locks', before: before.pages.find((p) => p.page_id === op.page_id)?.locks, after: op.locks }];
    case 'set_report_locks':
      return [{ object_id: 'report', field: 'locks', before: before.locks, after: op.locks }];
  }
}

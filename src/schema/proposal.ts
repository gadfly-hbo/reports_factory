import { z } from 'zod';

/**
 * 变更提案与锁定（模块方案 §7.6/§12）。
 * 所有对已组装报告的写操作以 ChangeProposal 走单一控制器：
 * 版本一致 → 范围 → 锁定 → 原子应用 + 审计；自然语言不直接覆盖 ReportSpec。
 */

export const PageLocksSchema = z.object({
  page_order: z.boolean().optional(),
  headline: z.boolean().optional(),
  body: z.boolean().optional(),
  metrics: z.boolean().optional(),
  chart: z.boolean().optional(),
  required_note: z.boolean().optional(),
  sources: z.boolean().optional(),
  layout: z.boolean().optional(),
});

export const ReportLocksSchema = z.object({
  storyline: z.boolean().optional(),
  page_order: z.boolean().optional(),
});

export const ProposalChangeSchema = z.object({
  object_id: z.string().min(1),
  field: z.string().min(1),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
});

export const ChangeProposalSchema = z.object({
  proposal_id: z.string().min(1),
  report_id: z.string().min(1),
  expected_revision: z.string().min(1),
  /** 原始操作（审计留痕） */
  op: z.unknown(),
  /** §12.1 合同：本提案获准的作用范围类别（由操作类型推导） */
  approved_scope: z.string().optional(),
  /** §12.1 合同：应用后需重跑的检查 */
  required_checks: z.array(z.string()).optional().default([]),
  changes: z.array(ProposalChangeSchema).optional().default([]),
  affected: z.array(z.string()).optional().default([]),
  state: z.enum(['applied', 'rejected', 'stale']).optional().default('applied'),
  reason: z.string().optional(),
  /** 起草来源标记（S5：'model-draft' = 模型起草，应用仍由人确认） */
  source: z.string().optional(),
  created_at: z.string().min(1),
  applied_at: z.string().optional(),
});

export type PageLocks = z.infer<typeof PageLocksSchema>;
export type ReportLocks = z.infer<typeof ReportLocksSchema>;
export type ProposalChange = z.infer<typeof ProposalChangeSchema>;
export type ChangeProposal = z.infer<typeof ChangeProposalSchema>;

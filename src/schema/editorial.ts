import { z } from 'zod';

/**
 * 编审层对象（模块方案 §7.2/§10.1）。
 * 发现卡片是 Claim/Metric/Evidence 的组合视图（服务端组装，不另建事实对象）；
 * 编排位置（placement）按报告隔离，不修改资产全局事实状态。
 */

export const PlacementSchema = z.enum([
  'candidate', // 候选（默认：无决定时的缺省编排）
  'body', // 正文
  'speaker_notes', // 讲稿（M4 仅编审数据层，不写入导出文件）
  'appendix', // 附录
  'excluded', // 本次不采用（粘性：不自动回正文，T06）
  'deferred', // 暂缓
]);

export const EditorialDecisionSchema = z.object({
  decision_id: z.string().min(1),
  report_id: z.string().min(1),
  logical_key: z.string().min(1),
  placement: PlacementSchema,
  position: z.number().optional(),
  /** 取舍理由（§7.3：每次取舍应记录理由） */
  reason: z.string().optional(),
  operator: z.string().optional().default('user'),
  decided_at: z.string(),
  /** 决定所依据的资产修订 */
  basis_revision: z.string().optional(),
});

/** 报告编审状态机（§8.3 建议，S4 简化：G2 确认并入正式导出） */
export const EditorialStatusSchema = z.enum([
  'organizing', // 整理材料
  'brief_draft', // 任务书草拟
  'blueprint_review', // 蓝图待审
  'g1_approved', // G1 已批准
  'draft_editing', // 初稿编辑（G1 后生成/修改）
  'published', // 已发布（正式导出冻结）
]);

/** G1 人工编审批准记录（§8.1）：绑定批准人/任务书哈希/蓝图/来源快照/时间 */
export const G1ApprovalSchema = z.object({
  approval_id: z.string().min(1),
  approver: z.string().min(1),
  brief_hash: z.string().min(1),
  blueprint_pages: z.array(z.unknown()),
  decisions_snapshot: z.array(EditorialDecisionSchema),
  source_snapshot: z.array(
    z.object({ source_id: z.string(), version: z.string(), logical_key: z.string().optional() }),
  ),
  scope: z.string().optional(),
  approved_at: z.string().min(1),
  /** 本批准下生成的修订（assemble 后回填） */
  revision_ids: z.array(z.string()).optional().default([]),
  /** G1 后首个组装的 spec 快照（漂移检查基线，§12.3/G6） */
  baseline_spec: z.unknown().optional(),
});

/** G2 发布确认（G14）：正式导出时绑定检查指纹 */
export const G2ConfirmationSchema = z.object({
  revision_id: z.string().min(1),
  export_id: z.string().min(1),
  checks_fingerprint: z.string().min(1),
  confirmed_at: z.string().min(1),
});

/** work/editorial.json：编审状态持久化（重启不丢，§5.2） */
export const EditorialStateSchema = z.object({
  status: EditorialStatusSchema.optional(),
  brief: z.unknown().optional(),
  decisions: z.record(z.string(), z.array(EditorialDecisionSchema)).optional().default({}),
  approval: G1ApprovalSchema.optional(),
  g2: G2ConfirmationSchema.optional(),
});

/** 补证请求（§11.2）：内容是"还需要验证什么"，不是"请补一段支持当前结论的话" */
export const EvidenceRequestStateSchema = z.enum([
  'draft', // 草拟
  'approved', // 已批准（记录 user_approval；不等于授权任何执行动作）
  'exported', // 已导出/已发送（无上游连接时为文件导出）
  'returned', // 已返回（结果成果包已关联）
  'cancelled',
  'failed',
]);

export const EvidenceRequestSchema = z.object({
  request_id: z.string().min(1),
  report_id: z.string().min(1),
  revision_id: z.string().optional(),
  affected_objects: z.array(z.string()).optional().default([]),
  question: z.string().min(1),
  gap: z.string().optional(),
  /** 需要的数据/比较口径/验证类型，不限定必须得到何种结论 */
  required_evidence: z.string().optional(),
  source_snapshot: z.unknown().optional(),
  user_approval: z.object({ approver: z.string(), approved_at: z.string() }).optional(),
  upstream_task_ref: z.string().optional(),
  result_refs: z.array(z.string()).optional().default([]),
  state: EvidenceRequestStateSchema.optional().default('draft'),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
});

export type Placement = z.infer<typeof PlacementSchema>;
export type EditorialDecision = z.infer<typeof EditorialDecisionSchema>;
export type EvidenceRequest = z.infer<typeof EvidenceRequestSchema>;
export type EditorialState = z.infer<typeof EditorialStateSchema>;
export type EditorialStatus = z.infer<typeof EditorialStatusSchema>;
export type G1Approval = z.infer<typeof G1ApprovalSchema>;

/** 发现卡片（F02）：Claim/Metric/Evidence 组合视图，不另建事实对象 */
export interface FindingCard {
  logical_key: string;
  claim_id: string;
  source_id: string;
  kind: string;
  text: string;
  verification_state: string;
  uncertainty?: string;
  metrics: Array<{ metric_id: string; logical_key?: string; value: number; unit: string; period?: string; scope?: string; formula?: string }>;
  evidence: Array<{ evidence_id: string; locator: string; excerpt: string }>;
  limitations: string[];
  counter_evidence: string[];
  placement: Placement;
  decision?: { reason?: string; operator: string; decided_at: string };
}

/** 取舍推荐（F03）：确定性行为规则输出，不使用无业务依据的精确分数 */
export interface PlacementRecommendation {
  logical_key: string;
  placement: Placement;
  reason: string;
  /** true = 沿用用户既有编审决定（粘性，T06），推荐不翻案 */
  sticky?: boolean;
}

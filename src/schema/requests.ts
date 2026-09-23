import { z } from 'zod';
import { PrivacyPolicySchema, SourceKindSchema } from './project.js';
import { ReportBriefSchema } from './report-spec.js';
import { BrandConfigSchema } from './brand.js';
import { PlacementSchema } from './editorial.js';
import { PageLocksSchema, ReportLocksSchema } from './proposal.js';

/** API 请求体 schema（边界类型化：全部请求体经 zod 校验，替代裸 cast） */

export const CreateProjectRequestSchema = z.object({
  title: z.string().min(1),
  purpose: z.string().optional(),
  privacy_policy: PrivacyPolicySchema.optional(),
});

export const SourceUploadRequestSchema = z.object({
  filename: z.string().min(1),
  content_base64: z.string().min(1),
  kind: SourceKindSchema,
  media_type: z.string().min(1),
  sheet: z.string().optional(), // XLSX 显式选表
});

export const OutlineRequestSchema = z.object({
  brief: ReportBriefSchema,
});

export const PagePlanItemSchema = z.object({
  page_id: z.string().min(1),
  type: z.enum(['cover', 'summary', 'metrics_overview', 'trend', 'issue_breakdown', 'option_comparison', 'action_items', 'evidence_appendix']),
  headline: z.string().min(1),
  intent: z.enum(['conclusion', 'evidence', 'decision', 'info']),
  claim_refs: z.array(z.string()).default([]),
  table_ids: z.array(z.string()).default([]),
  gap_notes: z.array(z.string()).default([]),
  locked: z.boolean().default(false),
  /** M4 逐页蓝图（F04） */
  blueprint: z
    .object({
      page_purpose: z.string().min(1),
      core_message: z.string().optional(),
      inclusion_reason: z.string().optional(),
      required_limits: z.array(z.string()).optional(),
    })
    .optional(),
});

export const AssembleRequestSchema = z.object({
  pages: z.array(PagePlanItemSchema).optional(),
});

export const EditOpSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('edit_text'), page_id: z.string().min(1), field: z.enum(['headline', 'body']), text: z.string() }),
  z.object({ kind: z.literal('reorder'), order: z.array(z.string().min(1)).min(1) }),
  z.object({ kind: z.literal('regenerate_page'), page_id: z.string().min(1) }),
  z.object({ kind: z.literal('split_page'), page_id: z.string().min(1) }),
  z.object({ kind: z.literal('switch_layout'), page_id: z.string().min(1), layout_id: z.string().min(1) }),
  z.object({ kind: z.literal('toggle_lock'), page_id: z.string().min(1), locked: z.boolean() }),
  z.object({ kind: z.literal('set_locks'), page_id: z.string().min(1), locks: PageLocksSchema.partial().optional() }),
  z.object({ kind: z.literal('set_report_locks'), locks: ReportLocksSchema.partial().optional() }),
]);

/** M4 变更提案入口（§12.1）：op + 预期修订；/edit 为其薄壳（expected=当前修订） */
export const ProposeRequestSchema = z.object({
  op: EditOpSchema,
  expected_revision: z.string().min(1),
});
export type ProposeRequest = z.infer<typeof ProposeRequestSchema>;

/** G1 批准（§8.1） */
export const ApproveG1RequestSchema = z.object({
  approver: z.string().min(1),
  scope: z.string().optional(),
});
export type ApproveG1Request = z.infer<typeof ApproveG1RequestSchema>;

/** 补证请求草拟（§11.2） */
export const EvidenceRequestCreateSchema = z.object({
  request_id: z.string().optional(),
  question: z.string().min(1),
  gap: z.string().optional(),
  affected_objects: z.array(z.string()).optional(),
  required_evidence: z.string().optional(),
});
export type EvidenceRequestCreate = z.infer<typeof EvidenceRequestCreateSchema>;

/** 补证请求批准（T16：批准 ≠ 授权执行） */
export const EvidenceApproveRequestSchema = z.object({ approver: z.string().min(1) });

/** 待复核解除（§7.7）：按逻辑键或受影响页解除——补证回流可能无键只有页（N1） */
export const ResolvePendingRequestSchema = z
  .object({
    logical_keys: z.array(z.string()).optional(),
    affected_pages: z.array(z.string()).optional(),
  })
  .refine((v) => (v.logical_keys?.length ?? 0) > 0 || (v.affected_pages?.length ?? 0) > 0, {
    message: '需要 logical_keys 或 affected_pages 至少一项非空',
  });

export const EditRequestSchema = z.object({
  op: EditOpSchema,
});

/** M4 编排决定（§7.3）：对象/位置/理由按报告隔离持久化 */
export const DecidePlacementRequestSchema = z.object({
  report_id: z.string().optional(),
  decisions: z
    .array(
      z.object({
        logical_key: z.string().min(1),
        placement: PlacementSchema,
        reason: z.string().optional(),
        operator: z.string().optional(),
      }),
    )
    .min(1),
});
export type DecidePlacementRequest = z.infer<typeof DecidePlacementRequestSchema>;

export const ResolveConflictRequestSchema = z.object({
  resolution: z.record(
    z.string(),
    z.union([
      z.enum(['source_a', 'source_b']),
      z.object({ resolution: z.literal('manual_value'), value: z.number() }),
    ]),
  ),
});

export const ExportRequestSchema = z.object({
  mode: z.enum(['formal', 'draft']),
  formats: z.array(z.enum(['pptx', 'pdf', 'html', 'docx'])).min(1),
  exportScope: z.enum(['internal', 'external']).optional(),
  chart_data_mode: z.enum(['keep_editable', 'aggregate_only']).optional(),
  ack_editable_data: z.boolean().optional(),
  ack_external_share: z.boolean().optional(),
  deliverable: z.enum(['executive_summary']).optional(),
});

export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;
export type SourceUploadRequest = z.infer<typeof SourceUploadRequestSchema>;
export type OutlineRequest = z.infer<typeof OutlineRequestSchema>;
export type EditRequest = z.infer<typeof EditRequestSchema>;
export type ResolveConflictRequest = z.infer<typeof ResolveConflictRequestSchema>;
export type ExportRequest = z.infer<typeof ExportRequestSchema>;

export const BrandRequestSchema = z.object({ brand: BrandConfigSchema });
export type BrandRequest = z.infer<typeof BrandRequestSchema>;

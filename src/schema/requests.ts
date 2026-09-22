import { z } from 'zod';
import { PrivacyPolicySchema, SourceKindSchema } from './project.js';
import { ReportBriefSchema } from './report-spec.js';

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

export const AssembleRequestSchema = z.object({
  pages: z.array(z.unknown()).optional(),
});

export const EditOpSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('edit_text'), page_id: z.string().min(1), field: z.enum(['headline', 'body']), text: z.string() }),
  z.object({ kind: z.literal('reorder'), order: z.array(z.string().min(1)).min(1) }),
  z.object({ kind: z.literal('regenerate_page'), page_id: z.string().min(1) }),
  z.object({ kind: z.literal('split_page'), page_id: z.string().min(1) }),
  z.object({ kind: z.literal('switch_layout'), page_id: z.string().min(1), layout_id: z.string().min(1) }),
  z.object({ kind: z.literal('toggle_lock'), page_id: z.string().min(1), locked: z.boolean() }),
]);

export const EditRequestSchema = z.object({
  op: EditOpSchema,
});

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
  formats: z.array(z.enum(['pptx', 'pdf', 'html'])).min(1),
  exportScope: z.enum(['internal', 'external']).optional(),
  chart_data_mode: z.enum(['keep_editable', 'aggregate_only']).optional(),
  ack_editable_data: z.boolean().optional(),
  ack_external_share: z.boolean().optional(),
});

export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;
export type SourceUploadRequest = z.infer<typeof SourceUploadRequestSchema>;
export type OutlineRequest = z.infer<typeof OutlineRequestSchema>;
export type EditRequest = z.infer<typeof EditRequestSchema>;
export type ResolveConflictRequest = z.infer<typeof ResolveConflictRequestSchema>;
export type ExportRequest = z.infer<typeof ExportRequestSchema>;

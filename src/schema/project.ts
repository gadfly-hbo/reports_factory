import { z } from 'zod';

/** 项目与存储对象（proposal §9.1）：首期用结构化文件 + 轻量元数据，不建库。 */

export const PrivacyPolicySchema = z.enum([
  'local_only', // 禁止外部模型（F12：未授权材料不得发送外部服务）
  'allow_external_with_approval', // 每次出站需用户确认
  'allow_external', // 已授权范围内可出站
]);

export const ProjectStageSchema = z.enum([
  'materials',
  'outline',
  'draft',
  'checked',
  'exported',
]);

export const ProjectSchema = z.object({
  project_id: z.string().min(1),
  title: z.string().min(1),
  purpose: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  privacy_policy: PrivacyPolicySchema.default('local_only'),
  stage: ProjectStageSchema.default('materials'),
});

export const SourceKindSchema = z.enum(['text', 'markdown', 'csv', 'image', 'table']);

export const ParseStatusSchema = z.enum(['pending', 'parsed', 'failed']);

export const SourceAssetSchema = z.object({
  source_id: z.string().min(1),
  version: z.string().min(1),
  filename: z.string().min(1),
  media_type: z.string().min(1),
  kind: SourceKindSchema,
  file_hash: z.string(),
  size: z.number().int().nonnegative(),
  imported_at: z.string(),
  sensitivity: z.enum(['normal', 'sensitive']).optional(),
  parse_status: ParseStatusSchema.optional().default('pending'),
  parse_error: z.string().optional(),
  replaces: z.string().optional(), // 替换前版本的 source_id
});

export const ReportRevisionSchema = z.object({
  revision_id: z.string().min(1),
  parent_revision: z.string().optional(),
  created_at: z.string(),
  note: z.string().optional(),
});

export const ExportFormatSchema = z.enum(['pptx', 'pdf', 'html']);

export const ExportRecordSchema = z.object({
  export_id: z.string().min(1),
  revision_id: z.string().min(1),
  format: ExportFormatSchema,
  artifact_path: z.string().min(1),
  artifact_hash: z.string(),
  checks: z.unknown(),
  is_draft: z.boolean(),
  created_at: z.string(),
});

export type PrivacyPolicy = z.infer<typeof PrivacyPolicySchema>;
export type ProjectStage = z.infer<typeof ProjectStageSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type SourceKind = z.infer<typeof SourceKindSchema>;
export type SourceAsset = z.infer<typeof SourceAssetSchema>;
export type ReportRevisionMeta = z.infer<typeof ReportRevisionSchema>;
export type ExportRecord = z.infer<typeof ExportRecordSchema>;

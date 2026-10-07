import { z } from 'zod';
import { PrivacyPolicySchema, SourceKindSchema } from './project.js';

/** 六步 API 请求体契约（M10）。旧报告请求 schema 随功能删除（git 历史可查）。 */

export const CreateProjectRequestSchema = z.object({
  title: z.string().min(1),
  purpose: z.string().optional(),
  template_id: z.string().optional(),
  privacy_policy: PrivacyPolicySchema.optional(),
});

export const OutboundModeRequestSchema = z.object({
  mode: z.enum(['structure-only', 'authorized-summary']),
});

export const SourceUploadRequestSchema = z.object({
  filename: z.string().min(1),
  content_base64: z.string().min(1),
  kind: SourceKindSchema,
  media_type: z.string().optional(),
  sheet: z.string().optional(),
});

import { z } from 'zod';
import { PrivacyPolicySchema, SourceKindSchema } from './project.js';

/** API 请求体契约。 */

export const CreateProjectRequestSchema = z.object({
  title: z.string().min(1),
  purpose: z.string().optional(),
  privacy_policy: PrivacyPolicySchema.optional(),
});

export const SourceUploadRequestSchema = z.object({
  filename: z.string().min(1),
  content_base64: z.string().min(1),
  kind: SourceKindSchema,
  media_type: z.string().optional(),
  sheet: z.string().optional(),
});

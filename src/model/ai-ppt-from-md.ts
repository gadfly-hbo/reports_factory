import { z } from 'zod';
import type { LlmStageClient } from './client.js';
import { shortHash } from './outbound.js';
import { digitGuardViolation } from './ai-page.js';
import { buildPptPageRequest, type PptPageRequestInput } from './ai-ppt-prompt.js';

/**
 * M9 PPT-only 后端薄层：LLM 出单页结构 → 适配 → 渲染（PRD D1）。
 * 出站 payload 白名单（主题/受众/页数/页任务/材料/边界），数字护栏/不编造（红队 KA-2）。
 */

const PPT_BODY_MAX = 800;
const PPT_HEADLINE_MAX = 80;
const PPT_BULLETS_MAX = 6;

export const PptPageOutputSchema = z.object({
  type: z.string().min(1),
  headline: z.string().min(1).max(PPT_HEADLINE_MAX),
  purpose: z.string().min(1).max(PPT_HEADLINE_MAX),
  body: z.string().max(PPT_BODY_MAX).optional(),
  bullets: z.array(z.object({ text: z.string().min(1).max(200) })).max(PPT_BULLETS_MAX).default([]),
  uncovered: z.boolean().default(false),
});
export type PptPageDraft = z.infer<typeof PptPageOutputSchema>;
// 适配器（service 层专用）：pages → ReportSpec（经 ReportSpecSchema.parse，不留 type 谎言）
import { ReportSpecSchema, type ReportSpec } from '../schema/report-spec.js';
export function buildReportSpec(pages: PptPageDraft[], meta: { title: string; audience: string; pageBudget: number; briefPrompt?: string }): ReportSpec {
  return ReportSpecSchema.parse({
    report_id: `ppt_${Date.now()}`,
    title: meta.title,
    version: '1',
    schema_version: '1.0',
    revision_id: 'ppt_1',
    created_at: new Date().toISOString(),
    brief: { audience: meta.audience, purpose: meta.briefPrompt ?? 'PPT 一站式', page_budget: meta.pageBudget, language: 'zh-CN' },
    pages: pages.map((p, i) => ({
      page_id: `page_${String(i + 1).padStart(2, '0')}`,
      type: p.type as never,
      headline: p.headline,
      ...(p.body ? { body: p.body } : {}),
      bullets: p.bullets.map((b) => ({ text: b.text })),
      claim_refs: [],
      sources: [],
    })),
  });
}


export interface AiPptPageResult {
  draft: PptPageDraft;
  provider: string;
  modelId: string;
  cost: number;
  bytes: number;
}

export async function aiPptPageDraft(
  client: LlmStageClient,
  input: PptPageRequestInput,
): Promise<AiPptPageResult> {
  const { system, user } = buildPptPageRequest(input);
  const { output, provider, modelId, cost } = await client.complete({
    stage: 'ppt-page',
    callKey: `ppt-page:${shortHash(user)}`,
    system, user, schema: PptPageOutputSchema,
  });
  const draft: PptPageDraft = {
    type: output.type,
    headline: output.headline,
    purpose: output.purpose,
    ...(output.body ? { body: output.body } : {}),
    bullets: output.bullets ?? [],
    uncovered: output.uncovered ?? false,
  };
  if (!draft.uncovered) {
    const violation = digitGuardViolation(input.materials, [
      draft.headline, ...draft.bullets.map((b) => b.text), ...(draft.body ? [draft.body] : []),
    ]);
    if (violation) throw Object.assign(new Error(violation), { statusCode: 400 });
  }
  return { draft, provider, modelId, cost, bytes: user.length };
}


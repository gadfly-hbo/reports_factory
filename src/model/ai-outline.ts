import { z } from 'zod';
import type { Claim, PageType, ReportBrief } from '../schema/report-spec.js';
import type { PagePlanItem, OutlineDraft, OpenQuestion } from './gateway.js';
import type { LlmStageClient } from './client.js';
import { buildPayload, shortHash, type OutboundCtx } from './outbound.js';

/**
 * AI 蓝图编排（M5 S3，模块方案 §14.2 仅结构模式）：
 * 模型只决定页面结构（页数/页型/主旨/页面目的），claim 绑定由确定性规则按页型完成——
 * 模型未见过真实数据，也就不承担内容取舍（那是 S4 授权摘要推荐的事）。
 * 输出经 zod 强校验，非法即抛错由调用方兜底（L4）。
 */

export const OUTLINE_SYSTEM_PROMPT =
  '你是汇报蓝图设计师。基于任务书与资产清单设计页计划，只输出 JSON：{"pages":[{"type":"cover|summary|metrics_overview|trend|issue_breakdown|option_comparison|action_items|evidence_appendix","headline":string,"purpose":string}],"open_questions":[{"text":string,"kind":"conflict|confirmation|gap"}]}。页数不超过任务书预算；不要输出其他文字。';

const OutlinePageSchema = z.object({
  type: z.enum(['cover', 'summary', 'metrics_overview', 'trend', 'issue_breakdown', 'option_comparison', 'action_items', 'evidence_appendix']),
  headline: z.string().min(1).max(80),
  purpose: z.string().min(1).max(80),
});
const OutlineOutputSchema = z.object({
  pages: z.array(OutlinePageSchema).min(1).max(20),
  open_questions: z
    .array(z.object({ text: z.string().min(1), kind: z.enum(['conflict', 'confirmation', 'gap']).default('gap') }))
    .optional()
    .default([]),
});

const INTENT_BY_TYPE: Record<PageType, PagePlanItem['intent']> = {
  cover: 'info',
  summary: 'conclusion',
  metrics_overview: 'evidence',
  trend: 'evidence',
  issue_breakdown: 'conclusion',
  option_comparison: 'decision',
  action_items: 'decision',
  evidence_appendix: 'info',
};

/** 按 page type 确定性绑定 claim（模型结构 + 本地绑定：结构模式模型不可见内容） */
function bindClaims(type: PageType, claims: Claim[]): string[] {
  const byKind = (k: Claim['kind'], n: number) => claims.filter((c) => c.kind === k).slice(0, n).map((c) => c.claim_id);
  switch (type) {
    case 'summary':
      return [...byKind('fact_statement', 2), ...byKind('computed_statement', 2), ...byKind('inference', 1)];
    case 'issue_breakdown':
      return byKind('inference', 4);
    case 'option_comparison':
    case 'action_items':
      return byKind('recommendation', 4);
    case 'evidence_appendix':
      return byKind('data_note', 4);
    default:
      return [];
  }
}

export interface AiOutlineResult {
  draft: OutlineDraft;
  provider: string;
  modelId: string;
  cost: number;
  /** 出站字节数（审计，R2-4） */
  bytes: number;
}

export async function aiComposeOutline(
  client: LlmStageClient,
  ctx: OutboundCtx,
  brief: ReportBrief,
  claims: Claim[],
): Promise<AiOutlineResult> {
  const payload = buildPayload('structure-only', ctx);
  const { output, provider, modelId, cost } = await client.complete({
    stage: 'outline',
    callKey: `outline:${shortHash(payload.user)}`,
    system: OUTLINE_SYSTEM_PROMPT,
    user: payload.user,
    schema: OutlineOutputSchema,
  });

  const pages: PagePlanItem[] = output.pages.slice(0, Math.max(1, brief.page_budget)).map((p, i) => ({
    page_id: `page_${String(i + 1).padStart(2, '0')}`,
    type: p.type,
    headline: p.headline,
    intent: INTENT_BY_TYPE[p.type],
    claim_refs: bindClaims(p.type, claims),
    table_ids: [],
    gap_notes: [],
    locked: false,
    blueprint: {
      page_purpose: p.purpose,
      ...(p.type === 'cover' && brief.core_question ? { core_message: brief.core_question } : {}),
    },
  }));
  const open_questions: OpenQuestion[] = output.open_questions.map((q) => ({ text: q.text, kind: q.kind }));
  return { draft: { pages, open_questions }, provider, modelId, cost, bytes: payload.user.length };
}

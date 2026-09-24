import { z } from 'zod';
import { PlacementSchema } from '../schema/editorial.js';
import type { LlmStageClient } from './client.js';
import { buildPayload, shortHash, type OutboundCtx } from './outbound.js';

/**
 * AI 取舍推荐（M5 S4，模块方案 §7.3，授权摘要模式）：
 * 模型基于发现文本与任务书给编排建议+理由；输出只是推荐草案——
 * 用户既有决定粘性不翻案（T06），敏感来源默认不发送（红队 K3），采纳动作与规则版完全相同。
 */

export const RECOMMEND_SYSTEM_PROMPT =
  '你是报告取舍推荐助手。基于任务书与发现清单，为每条发现给出本次报告的编排建议。只输出 JSON：{"placements":[{"id":string,"placement":"candidate|body|speaker_notes|appendix|excluded|deferred","reason":string}]}。placements 必须覆盖输入的全部 id，不得发明 id；reason 用一句话说明取舍依据；会改变受众判断的限制与反证不得建议 excluded；推断类发现不升格为确定性结论；不要输出其他文字。';

const RecommendOutputSchema = z.object({
  placements: z
    .array(
      z.object({
        id: z.string().min(1),
        placement: PlacementSchema,
        reason: z.string().min(1),
      }),
    )
    .min(1),
});

export function buildRecommendRequest(ctx: OutboundCtx): { system: string; user: string; itemCount: number; sentIds: string[] } {
  const built = buildPayload('authorized-summary', ctx);
  // 与 buildPayload 默认语义一致：sensitive 来源不发送（红队 K3），其 id 也不接受模型推荐
  const sentIds = ctx.findings.filter((f) => !f.sensitive).map((f) => f.logicalKey);
  return { system: RECOMMEND_SYSTEM_PROMPT, user: built.user, itemCount: built.itemCount, sentIds };
}

export interface AiRecommendation {
  logicalKey: string;
  placement: z.infer<typeof PlacementSchema>;
  reason: string;
}

export interface AiRecommendResult {
  recs: AiRecommendation[];
  provider: string;
  modelId: string;
  cost: number;
  itemCount: number;
  /** 出站字节数（审计，R2-4） */
  bytes: number;
}

export async function aiRecommendPlacements(client: LlmStageClient, ctx: OutboundCtx): Promise<AiRecommendResult> {
  const { system, user, itemCount, sentIds } = buildRecommendRequest(ctx);
  const { output, provider, modelId, cost } = await client.complete({
    stage: 'recommend',
    callKey: `recommend:${shortHash(user)}`,
    system,
    user,
    schema: RecommendOutputSchema,
  });
  // 白名单映射：只接受实际发送过的发现 id（模型发明 id / 未发送的 sensitive 发现一律丢弃）
  const sent = new Set(sentIds);
  const recs = output.placements.filter((p) => sent.has(p.id)).map((p) => ({ logicalKey: p.id, placement: p.placement, reason: p.reason }));
  return { recs, provider, modelId, cost, itemCount, bytes: user.length };
}

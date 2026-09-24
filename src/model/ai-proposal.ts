import { z } from 'zod';
import type { ReportSpec } from '../schema/report-spec.js';
import type { LlmStageClient } from './client.js';
import { shortHash } from './outbound.js';

/**
 * AI 提案起草（M5 S5，模块方案 §12.1，授权摘要模式）：
 * 模型只起草**单一、最小范围**的 edit_text 提案；应用仍走既有 /propose 单一控制器
 * （expected_revision / 锁 / 原子应用 / 审计全部由程序约束，模型没有任何直写通道）。
 */

export const PROPOSAL_SYSTEM_PROMPT =
  '你是报告修改助手。根据用户意图，生成对报告的单一、最小范围的标题修改提案。只输出 JSON：{"op":{"kind":"edit_text","page_id":string,"field":"headline","text":string},"note":string}。field 只能是 headline（本版本不支持正文改写）；text 必须是修改后的完整标题；不得修改数字、删除必要限制、改动其他页面；page_id 必须来自输入页面清单；note 用一句话说明理由；不要输出其他文字。';

const DraftOutputSchema = z.object({
  op: z.object({
    kind: z.literal('edit_text'),
    page_id: z.string().min(1),
    field: z.literal('headline'),
    text: z.string().min(1),
  }),
  note: z.string().min(1),
});

/** 起草请求构造（导出：probe/replay 测试据此计算精确的 transport 键） */
export function buildProposalRequest(spec: ReportSpec, intent: string): { system: string; user: string } {
  const user = JSON.stringify(
    {
      intent,
      revision: spec.revision_id,
      pages: spec.pages.map((p) => ({
        page_id: p.page_id,
        type: p.type,
        headline: p.headline,
        locked: p.locked ?? false,
        ...(p.locks ? { locks: p.locks } : {}),
      })),
    },
    null,
    1,
  );
  return { system: PROPOSAL_SYSTEM_PROMPT, user };
}

export interface DraftedProposal {
  op: { kind: 'edit_text'; page_id: string; field: 'headline'; text: string };
  note: string;
  provider: string;
  modelId: string;
  cost: number;
  /** 出站字节数（审计，R2-4） */
  bytes: number;
}

export async function aiDraftProposal(client: LlmStageClient, spec: ReportSpec, intent: string): Promise<DraftedProposal> {
  const { system, user } = buildProposalRequest(spec, intent);
  const { output, provider, modelId, cost } = await client.complete({
    stage: 'proposal-draft',
    callKey: `proposal:${shortHash(user)}`,
    system,
    user,
    schema: DraftOutputSchema,
  });
  // 页面白名单：模型不得指向不存在的页面
  if (!spec.pages.some((p) => p.page_id === output.op.page_id)) {
    throw Object.assign(new Error(`提案指向不存在的页面：${output.op.page_id}`), { statusCode: 400 });
  }
  return { op: output.op, note: output.note, provider, modelId, cost, bytes: user.length };
}

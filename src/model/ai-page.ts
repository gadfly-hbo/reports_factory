import { z } from 'zod';
import type { ReportSpec } from '../schema/report-spec.js';
import type { LlmStageClient } from './client.js';
import { shortHash } from './outbound.js';

/**
 * AI 整页重生成（PRD D3/G4-C，S6）：模型起草整页最小 op（rewrite_page），
 * 经 zod 强校验 + page_id 白名单 + 数字护栏（不得修改/发明数字，精简删除允许）；
 * 应用仍走既有 /propose 控制器（锁/版本/审计），模型无直写通道。
 * 与 ai-proposal 的最小标题修改并列，属实质变更，G1 后应用会被变更控制器拒（§8.4 不变）。
 */

export const PAGE_REWRITE_SYSTEM_PROMPT =
  '你是报告改写助手。根据用户指令，对指定单页做整页重写。只输出 JSON：' +
  '{"op":{"kind":"rewrite_page","page_id":string,"headline":string,"bullets":[{"text":string,"label":string?}],"body":string?},"note":string}。' +
  'page_id 必须与指令指定的页面一致，不得改动其他页面；headline 与 bullets 必须完整给出（将整页替换）；' +
  '不得修改、发明任何数字（原有数字要删除可以，改成别的数字不行）；不得删除必要限制；' +
  '若提供 boundaries（必要边界约束），改写内容必须遵守、不得推翻或弱化；表格与图表不在此操作范围；' +
  'note 用一句话说明理由；不要输出其他文字。';

const PageRewriteOutputSchema = z.object({
  op: z.object({
    kind: z.literal('rewrite_page'),
    page_id: z.string().min(1),
    headline: z.string().min(1),
    bullets: z.array(z.object({ text: z.string().min(1), label: z.string().optional(), claim_ref: z.string().optional() })).min(1),
    body: z.string().optional(),
  }),
  note: z.string().min(1),
});

export type PageRewriteOp = z.infer<typeof PageRewriteOutputSchema>['op'];

/** 重写请求构造（白名单式，红队 K3：只发目标页内容 + 页索引；导出供 probe/replay 计算 transport 键） */
export function buildPageRewriteRequest(
  spec: ReportSpec,
  pageId: string,
  instruction: string,
  opts?: { excludeClaimRefs?: string[]; boundaries?: string[] },
): { system: string; user: string } {
  const page = spec.pages.find((p) => p.page_id === pageId);
  const exclude = new Set(opts?.excludeClaimRefs ?? []);
  // fail-closed：目标页绑定敏感来源主张时不外发整页文本（headline/body 无法可靠抠除敏感片段）
  if (page && (page.claim_refs ?? []).some((r) => exclude.has(r))) {
    throw Object.assign(new Error('目标页含敏感来源内容，整页外发已拒绝——请先解除敏感绑定或手动编辑'), { statusCode: 403 });
  }
  const user = JSON.stringify(
    {
      instruction,
      revision: spec.revision_id,
      ...(opts?.boundaries && opts.boundaries.length > 0 ? { boundaries: opts.boundaries } : {}),
      target: page
        ? {
            page_id: page.page_id,
            type: page.type,
            headline: page.headline,
            ...(page.body ? { body: page.body } : {}),
            // sensitive 来源要点默认排除（与 outbound authorized-summary 同规则）
            bullets: (page.bullets ?? []).filter((b) => !b.claim_ref || !exclude.has(b.claim_ref)).map((b) => b.text),
          }
        : undefined,
      // 页索引只发 page_id/type：其他页 headline 可能含敏感主张文本，不外发
      pages: spec.pages.map((p) => ({ page_id: p.page_id, type: p.type })),
    },
    null,
    1,
  );
  return { system: PAGE_REWRITE_SYSTEM_PROMPT, user };
}

/**
 * 数字护栏：模型输出中的每个数字必须已存在于基线文本（改写措辞/精简删除允许，
 * 修改或发明数字拒绝——「不得修改数字」是 prompt 约束的程序背书）。
 */
export function digitGuardViolation(baseline: string[], updated: string[]): string | null {
  const digitsOf = (texts: string[]): string[] => texts.join(' ').match(/\d+(?:\.\d+)?/g) ?? [];
  const base = new Set(digitsOf(baseline));
  for (const d of digitsOf(updated)) {
    if (!base.has(d)) {
      return `数字护栏拒绝：模型输出含原页不存在的数字「${d}」——不得修改或发明数字（精简删除可以）`;
    }
  }
  return null;
}

export interface PageRewriteDraft {
  op: PageRewriteOp;
  note: string;
  provider: string;
  modelId: string;
  cost: number;
  bytes: number;
}

export async function aiPageRewrite(
  client: LlmStageClient,
  spec: ReportSpec,
  pageId: string,
  instruction: string,
  opts?: { excludeClaimRefs?: string[]; boundaries?: string[] },
): Promise<PageRewriteDraft> {
  const { system, user } = buildPageRewriteRequest(spec, pageId, instruction, opts);
  const { output, provider, modelId, cost } = await client.complete({
    stage: 'page-rewrite',
    callKey: `page-rewrite:${shortHash(user)}`,
    system,
    user,
    schema: PageRewriteOutputSchema,
  });
  // page_id 白名单：模型不得指向不存在的页面，也不得越权改动其他页面
  const page = spec.pages.find((p) => p.page_id === output.op.page_id);
  if (!page) {
    throw Object.assign(new Error(`整页重生成指向不存在的页面：${output.op.page_id}`), { statusCode: 400 });
  }
  if (output.op.page_id !== pageId) {
    throw Object.assign(new Error(`整页重生成越权改动其他页面：目标 ${pageId}，模型输出 ${output.op.page_id}`), {
      statusCode: 400,
    });
  }
  const baseline = [page.headline, page.body ?? '', ...(page.bullets ?? []).map((b) => b.text)];
  const updated = [output.op.headline, output.op.body ?? '', ...output.op.bullets.map((b) => b.text)];
  const violation = digitGuardViolation(baseline, updated);
  if (violation) throw Object.assign(new Error(violation), { statusCode: 400 });
  return { op: output.op, note: output.note, provider, modelId, cost, bytes: user.length };
}

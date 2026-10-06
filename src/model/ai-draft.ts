import { z } from 'zod';
import type { LlmStageClient } from './client.js';
import { shortHash } from './outbound.js';
import { digitGuardViolation } from './ai-page.js';

/**
 * LLM 逐页起草（M7 S1，PRD D1–D2 / GRILL G1–G2，红队 KA-2 硬约束）：
 * 生成路径默认由模型逐页起草完整文字内容（每页一次单发 completion，禁 tool-call 循环）；
 * 数字护栏（生成数字必须来自材料派生文本）、claim_ref 页白名单、uncovered 不编造
 * 全部为程序强制，模型输出仅是草案。
 */

export const DRAFT_SYSTEM_PROMPT =
  '你是报告起草助手。根据给定的页面任务与材料要点，起草该页的完整文字内容。只输出 JSON：' +
  '{"uncovered":boolean,"headline":string,"bullets":[{"text":string,"claim_ref":string?}],"body":string?}。' +
  'headline 为该页标题；bullets 为该页要点（每条一句话，可带 claim_ref 指向材料要点 id，只能用输入中出现过的 id）；' +
  'uncovered=true 表示材料未覆盖该页主题（此时 bullets 为空数组，headline 填页面主旨本身）；' +
  '只能使用材料中出现的事实、数字与结论，严禁编造任何数字；若提供 boundaries（必要边界约束），内容必须遵守、不得推翻或弱化；' +
  '语气陈述、克制，不使用夸张措辞；不要输出其他文字。';

export const PageDraftOutputSchema = z.object({
  uncovered: z.boolean().default(false),
  headline: z.string().min(1),
  bullets: z.array(z.object({ text: z.string().min(1), claim_ref: z.string().optional() })).default([]),
  body: z.string().optional(),
});

export interface PageDraft {
  uncovered: boolean;
  headline: string;
  bullets: { text: string; claim_ref?: string }[];
  body?: string;
}

export interface PageTask {
  page_id: string;
  type: string;
  headline: string;
}

/** 起草请求构造（每页白名单出站：页任务 + 该页材料派生文本 + 必要边界，§4.6 领域装配；导出供 replay 构造 transport 键） */
export function buildPageDraftRequest(
  page: PageTask,
  materials: string[],
  opts?: { boundaries?: string[] },
): { system: string; user: string } {
  const user = JSON.stringify(
    {
      page: { page_id: page.page_id, type: page.type, goal: page.headline },
      materials,
      ...(opts?.boundaries && opts.boundaries.length > 0 ? { boundaries: opts.boundaries } : {}),
    },
    null,
    1,
  );
  return { system: DRAFT_SYSTEM_PROMPT, user };
}

/**
 * 页级材料派生文本（白名单：绑定主张 + 表格内容；不含 gap_notes——notes 无来源溯源，
 * 可能携带敏感原文，REVIEW H1 后不再出站）。
 * 纯函数共享给 workbench 与测试（replay 键精确构造的前提是双方材料一致）。
 */
export function buildPageMaterials(
  plan: { claim_refs: string[]; table_ids: string[] },
  claims: { claim_id: string; text: string }[],
  tables: { table_id: string; columns: { label: string }[]; rows: { key: string; cells: (string | number | null)[] }[] }[],
): string[] {
  const materials: string[] = [];
  const byId = new Map(claims.map((c) => [c.claim_id, c] as const));
  for (const id of plan.claim_refs) {
    const c = byId.get(id);
    if (c) materials.push(c.text);
  }
  const tableById = new Map(tables.map((t) => [t.table_id, t] as const));
  for (const tid of plan.table_ids) {
    const t = tableById.get(tid);
    if (!t) continue;
    materials.push(t.columns.map((c) => c.label).join('、'));
    for (const row of t.rows) materials.push([row.key, ...row.cells.map((v) => String(v))].join(' '));
  }
  return materials;
}

/**
 * sensitive 感知的页材料构造（REVIEW H1/M2：生产与测试同一实现，防测试键漂移）。
 * - 主张经 evidence→source 链过滤；表格按 source_id 直滤；
 * - 页绑定的主张中有敏感来源 → pageBlocked=true（整页不出站，fail-closed，
 *   headline 可能嵌入敏感主张原文）。
 */
export function buildPageMaterialsSensitiveAware(
  plan: { claim_refs: string[]; table_ids: string[] },
  all: {
    claims: { claim_id: string; text: string; evidence_refs: string[] }[];
    tables: { table_id: string; source_id: string; columns: { label: string }[]; rows: { key: string; cells: (string | number | null)[] }[] }[];
    evidence: { evidence_id: string; source_id: string }[];
  },
  sources: { source_id: string; sensitivity?: string }[],
): { materials: string[]; claimRefs: string[]; tableIds: string[]; pageBlocked: boolean } {
  const sensitiveSources = new Set(sources.filter((x) => x.sensitivity === 'sensitive').map((x) => x.source_id));
  const sensitiveEvidence = new Set(all.evidence.filter((e) => sensitiveSources.has(e.source_id)).map((e) => e.evidence_id));
  const sensitiveClaimIds = new Set(
    all.claims.filter((c) => c.evidence_refs.some((r) => sensitiveEvidence.has(r))).map((c) => c.claim_id),
  );
  const sensitiveTableIds = new Set(all.tables.filter((t) => sensitiveSources.has(t.source_id)).map((t) => t.table_id));
  // fail-closed：绑定敏感主张（headline 可能嵌敏感原文）或敏感表格（确定性 headline 内嵌列名/结构元数据）的页整页不出站
  const pageBlocked = plan.claim_refs.some((id) => sensitiveClaimIds.has(id))
    || plan.table_ids.some((id) => sensitiveTableIds.has(id));
  const claimRefs = plan.claim_refs.filter((id) => !sensitiveClaimIds.has(id));
  const tableIds = plan.table_ids.filter((id) => !sensitiveTableIds.has(id));
  return { materials: buildPageMaterials({ claim_refs: claimRefs, table_ids: tableIds }, all.claims, all.tables), claimRefs, tableIds, pageBlocked };
}

export interface PageDraftResult {
  draft: PageDraft;
  provider: string;
  modelId: string;
  cost: number;
  bytes: number;
}

/**
 * 单页起草：schema 校验 + 数字护栏（生成数字 ⊆ 材料数字）+ claim_ref 白名单剥离。
 * 护栏拒绝抛 400（上层按页回退）；uncovered=true 时跳过护栏直接返回。
 */
export async function aiDraftPage(
  client: LlmStageClient,
  page: PageTask,
  materials: string[],
  opts?: { claimWhitelist?: string[]; boundaries?: string[] },
): Promise<PageDraftResult> {
  const { system, user } = buildPageDraftRequest(page, materials, { boundaries: opts?.boundaries });
  const { output, provider, modelId, cost } = await client.complete({
    stage: 'page-draft',
    callKey: `page-draft:${shortHash(user)}`,
    system,
    user,
    schema: PageDraftOutputSchema,
  });
  const draft: PageDraft = {
    uncovered: output.uncovered,
    headline: output.headline,
    bullets: output.bullets,
    ...(output.body !== undefined ? { body: output.body } : {}),
  };
  if (!draft.uncovered) {
    const violation = digitGuardViolation(materials, [
      draft.headline,
      ...draft.bullets.map((b) => b.text),
      ...(draft.body ? [draft.body] : []),
    ]);
    if (violation) throw Object.assign(new Error(violation), { statusCode: 400 });
  }
  // claim_ref 白名单：越权引用剥离（保留文本，不留悬空引用）
  if (opts?.claimWhitelist) {
    const whitelist = new Set(opts.claimWhitelist);
    draft.bullets = draft.bullets.map((b) =>
      b.claim_ref && !whitelist.has(b.claim_ref) ? { text: b.text } : b,
    );
  }
  return { draft, provider, modelId, cost, bytes: user.length };
}

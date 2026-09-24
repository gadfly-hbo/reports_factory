import { z } from 'zod';
import type { ReportBrief, ReportSpec } from '../schema/report-spec.js';
import type { LlmStageClient } from './client.js';
import { shortHash } from './outbound.js';
import type { OutboundFindingCtx } from './outbound.js';

/**
 * AI 语义检查与补证建议（M5 S6，模块方案 §7.8 F08，授权摘要模式）。
 * 语义检查只产 warning（category: 'semantic'），永不阻断导出（L9）；
 * 补证建议只产 EvidenceRequest 草稿（要验证什么，不限定结论方向），采纳与回流走既有通道。
 * 请求构造导出供 replay 测试计算精确键。
 */

export const SEMANTIC_SYSTEM_PROMPT =
  '你是报告语义评审助手。检查报告页面的表达问题：重点偏移、重复啰嗦、因果/确定性措辞升级、必要限制遗漏、证据与表达强度不一致。只输出 JSON：{"issues":[{"page_id":string,"kind":"focus_drift|redundancy|causal_overclaim|boundary_missing|evidence_mismatch|other","message":string}]}。message 用一句话给出具体问题与修改方向；没有问题输出空数组；不要发明页面 id；不要输出其他文字。';

const SemanticOutputSchema = z.object({
  issues: z
    .array(
      z.object({
        page_id: z.string().optional(),
        kind: z.enum(['focus_drift', 'redundancy', 'causal_overclaim', 'boundary_missing', 'evidence_mismatch', 'other']),
        message: z.string().min(1),
      }),
    )
    .default([]),
});

const GAPS_SYSTEM_PROMPT =
  '你是证据缺口分析师。对照报告表达与其引用的证据，找出需要上游验证的缺口。只输出 JSON：{"gaps":[{"question":string,"gap":string,"required_evidence":string,"affected_page_ids":string[]}]}。question 写"需要验证什么"，不得预设结论方向；required_evidence 说明需要的数据或比较口径；没有缺口输出空数组；不要输出其他文字。';

const GapsOutputSchema = z.object({
  gaps: z
    .array(
      z.object({
        question: z.string().min(1),
        gap: z.string().min(1),
        required_evidence: z.string().min(1),
        affected_page_ids: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

/** 语义检查请求构造（导出供 replay 测试计算键）；只含非敏感发现与页面文本 */
export function buildSemanticRequest(
  spec: ReportSpec,
  brief: ReportBrief | undefined,
  findings: OutboundFindingCtx[],
): { system: string; user: string } {
  const user = JSON.stringify(
    {
      task: 'semantic-checks',
      brief: { core_question: brief?.core_question, required_boundaries: brief?.required_boundaries },
      pages: spec.pages.map((p) => ({
        page_id: p.page_id,
        type: p.type,
        headline: p.headline,
        ...(p.bullets?.length ? { bullets: p.bullets.map((b) => b.text) } : {}),
        ...(p.body ? { body: p.body } : {}),
      })),
      findings: findings.filter((f) => !f.sensitive).map((f) => ({
        id: f.logicalKey,
        kind: f.kind,
        text: f.text,
        verification: f.verificationState,
        ...(f.limitations.length > 0 ? { limitations: f.limitations } : {}),
        ...(f.counterEvidence.length > 0 ? { counter_evidence: f.counterEvidence } : {}),
      })),
    },
    null,
    1,
  );
  return { system: SEMANTIC_SYSTEM_PROMPT, user };
}

export interface SemanticIssue {
  id: string;
  severity: 'warning';
  category: 'semantic';
  page_id?: string;
  object_ref: string;
  message: string;
}

export async function aiSemanticChecks(
  client: LlmStageClient,
  spec: ReportSpec,
  brief: ReportBrief | undefined,
  findings: OutboundFindingCtx[],
): Promise<{ issues: SemanticIssue[]; provider: string; modelId: string; cost: number; bytes: number }> {
  const { system, user } = buildSemanticRequest(spec, brief, findings);
  const pageIds = new Set(spec.pages.map((p) => p.page_id));
  const { output, provider, modelId, cost } = await client.complete({
    stage: 'semantic-checks',
    callKey: `semantic:${shortHash(user)}`,
    system,
    user,
    schema: SemanticOutputSchema,
  });
  const issues: SemanticIssue[] = output.issues
    .filter((i) => !i.page_id || pageIds.has(i.page_id)) // 未发明页面 id
    .map((i) => ({
      id: `semantic_${i.kind}_${shortHash(i.message)}`, // 同类多条不冲突（R2）
      severity: 'warning' as const,
      category: 'semantic' as const,
      ...(i.page_id ? { page_id: i.page_id } : {}),
      object_ref: i.page_id ?? 'report',
      message: `模型辅助检查（${i.kind}）：${i.message}`,
    }));
  return { issues, provider, modelId, cost, bytes: user.length };
}

/** 补证建议请求构造 */
export function buildGapsRequest(
  spec: ReportSpec,
  brief: ReportBrief | undefined,
  findings: OutboundFindingCtx[],
): { system: string; user: string } {
  const user = JSON.stringify(
    {
      task: 'evidence-gaps',
      brief: { core_question: brief?.core_question, required_boundaries: brief?.required_boundaries },
      pages: spec.pages.map((p) => ({ page_id: p.page_id, headline: p.headline })),
      findings: findings.filter((f) => !f.sensitive).map((f) => ({
        id: f.logicalKey,
        kind: f.kind,
        text: f.text,
        verification: f.verificationState,
      })),
    },
    null,
    1,
  );
  return { system: GAPS_SYSTEM_PROMPT, user };
}

export interface SuggestedGap {
  question: string;
  gap: string;
  required_evidence: string;
  affected_objects: string[];
}

export async function aiSuggestEvidenceGaps(
  client: LlmStageClient,
  spec: ReportSpec,
  brief: ReportBrief | undefined,
  findings: OutboundFindingCtx[],
): Promise<{ gaps: SuggestedGap[]; provider: string; modelId: string; cost: number; bytes: number }> {
  const { system, user } = buildGapsRequest(spec, brief, findings);
  const pageIds = new Set(spec.pages.map((p) => p.page_id));
  const { output, provider, modelId, cost } = await client.complete({
    stage: 'evidence-gaps',
    callKey: `gaps:${shortHash(user)}`,
    system,
    user,
    schema: GapsOutputSchema,
  });
  const gaps = output.gaps.map((g) => ({
    question: g.question,
    gap: g.gap,
    required_evidence: g.required_evidence,
    affected_objects: g.affected_page_ids.filter((id) => pageIds.has(id)), // 未发明页面 id
  }));
  return { gaps, provider, modelId, cost, bytes: user.length };
}

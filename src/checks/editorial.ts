import type { ReportBrief, ReportSpec } from '../schema/report-spec.js';
import type { EditorialDecision, G1Approval } from '../schema/editorial.js';
import { diffSpecs } from '../compose/diff.js';
import type { CheckIssue } from './engine.js';

/**
 * M4 编审检查（F08 §7.8）：确定性子集，挂在导出与检查端点。
 * - 必要限制保留（T13 blocker）：required_boundaries 必须在正文层可见，只在附录=删除边界
 * - 因果措辞升级（T12 warning）：推断类发现配确定性因果标题 → 提示降级或补证
 * - 重点覆盖（§7.3 warning）：与核心问题相关的发现被"本次不采用"→ 提示复核
 */

const CAUSAL_MARKERS = /(导致|造成了|证明了|因而|从而造成)/;
const APPENDIX_TYPES = new Set(['evidence_appendix']);

export interface PendingUpdateLike {
  changed?: string[];
  added?: string[];
  removed?: string[];
  /** G8 补证回流显式声明的受影响页 */
  affected_pages?: string[];
}

/** 待复核受影响页（P8 单一实现）：显式声明（补证回流）∪ 按逻辑键推导（版本升级 changed/removed） */
export function affectedPagesForUpdates(spec: ReportSpec | null, updates: PendingUpdateLike[]): string[] {
  const pages = new Set<string>();
  for (const p of updates.flatMap((u) => u.affected_pages ?? [])) pages.add(p);
  const touched = new Set(updates.flatMap((u) => [...(u.changed ?? []), ...(u.removed ?? [])]));
  if (spec && touched.size > 0) {
    const byId = new Map(spec.claims.map((c) => [c.claim_id, c.logical_key ?? c.claim_id] as const));
    for (const page of spec.pages) {
      if ((page.claim_refs ?? []).some((id) => touched.has(byId.get(id) ?? ''))) pages.add(page.page_id);
    }
  }
  return [...pages];
}

/**
 * 编审模式判定（P8 单一口径）：存在编排决定或批准记录。
 * 仅生成过大纲/保存过任务书不算（legacy 流程不被 G1 门与投影改变行为）。
 */
export function isEditorialMode(ed: { decisions?: Record<string, unknown[]>; approval?: unknown; g2?: unknown } | null | undefined): boolean {
  if (!ed) return false;
  const hasDecisions = Object.values(ed.decisions ?? {}).some((a) => Array.isArray(a) && a.length > 0);
  return hasDecisions || !!ed.approval || !!ed.g2;
}

function pageText(p: ReportSpec['pages'][number]): string {
  return [p.headline, p.body, ...(p.bullets?.map((b) => b.text) ?? []), p.required_note].filter(Boolean).join('');
}

function cjkBigrams(text: string): Set<string> {
  const runs = text.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  const out = new Set<string>();
  for (const run of runs) {
    for (let i = 0; i + 2 <= run.length; i += 1) out.add(run.slice(i, i + 2));
  }
  return out;
}

export interface EditorialCheckContext {
  /** 当前任务书（编审态中的最新 brief，可能晚于 spec 冻结值） */
  brief?: ReportBrief;
  decisions?: EditorialDecision[];
  /** G1 批准记录（含漂移检查基线 baseline_spec） */
  approval?: G1Approval;
}

/** §8.4 获准范围内的字段（局部语言精简 + 非实质视觉/锁定动作）；其余变化=超出批准范围 */
const ALLOWED_DRIFT_FIELDS = new Set(['headline', 'body', 'layout_id', 'locked']);

export function runEditorialChecks(spec: ReportSpec, ctx: EditorialCheckContext): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const brief = ctx.brief ?? spec.brief;

  // 必要限制保留（T13）：brief.required_boundaries + 蓝图 required_limits 都必须正文层可见
  const bodyPages = spec.pages.filter((p) => !APPENDIX_TYPES.has(p.type));
  const appendixPages = spec.pages.filter((p) => APPENDIX_TYPES.has(p.type));
  const requiredLimits = [
    ...(brief.required_boundaries ?? []),
    ...spec.pages.flatMap((p) => p.blueprint?.required_limits ?? []),
  ];
  for (const boundary of requiredLimits) {
    const inBody = bodyPages.some((p) => pageText(p).includes(boundary));
    if (inBody) continue;
    const inAppendixOnly = appendixPages.some((p) => pageText(p).includes(boundary));
    issues.push({
      id: 'editorial_boundary_visibility',
      severity: 'blocker',
      object_ref: boundary,
      message: inAppendixOnly
        ? `必要限制只出现在附录（正文不可见）：${boundary}（T13：不能以"精简"授权删除）`
        : `必要限制在报告中缺失：${boundary}（需重组装或修订正文使其可见）`,
    });
  }

  // 因果措辞升级（T12）：引用推断类发现的页面标题不得使用确定性因果表述
  const claimById = new Map(spec.claims.map((c) => [c.claim_id, c] as const));
  for (const page of spec.pages) {
    const hasInference = (page.claim_refs ?? []).some((id) => claimById.get(id)?.kind === 'inference');
    if (hasInference && CAUSAL_MARKERS.test(page.headline)) {
      issues.push({
        id: 'editorial_causal_overclaim',
        severity: 'warning',
        page_id: page.page_id,
        object_ref: page.page_id,
        message: `第 ${page.page_id} 页引用推断类发现但标题含确定性因果表述（${page.headline}）：请降级措辞或补证后再定稿（T12）`,
      });
    }
  }

  // 重点覆盖（D8 §7.8）：core_question 相关的关键发现须在正文层有落点；
  // 相关发现被排除 → warning；与必要边界直接相关（限制/反证触及边界主题）被排除 → blocker
  if (brief.core_question && (ctx.decisions ?? []).length > 0) {
    const terms = cjkBigrams([brief.core_question, ...(brief.required_boundaries ?? [])].join(' '));
    const boundaryTerms = cjkBigrams((brief.required_boundaries ?? []).join(' '));
    const bodyClaimIds = new Set(bodyPages.flatMap((p) => p.claim_refs ?? []));
    const placementByLogical = new Map((ctx.decisions ?? []).map((d) => [d.logical_key, d.placement] as const));
    for (const claim of spec.claims) {
      const logical = claim.logical_key ?? claim.claim_id;
      const placement = placementByLogical.get(logical);
      if (!placement) continue; // 无决定的发现不参与覆盖判定（spec 投影只含已决定对象）
      const haystack = [claim.text, claim.uncertainty ?? ''].join(' ');
      const grams = cjkBigrams(haystack);
      if ([...grams].filter((g) => terms.has(g)).length < 2) continue; // 与核心问题不相关
      if (placement === 'excluded') {
        const boundaryLinked = [...grams].some((g) => boundaryTerms.has(g));
        issues.push({
          id: 'editorial_relevant_excluded',
          severity: boundaryLinked ? 'blocker' : 'warning',
          object_ref: logical,
          message: boundaryLinked
            ? `与必要边界直接相关的发现被标记不采用（${logical}）：会改变判断的限制不能以"精简"排除（T13/§7.3）`
            : `与核心问题相关的发现被标记不采用（${logical}）：请复核该取舍是否仍成立（重要性变化应重新复核而非静默保持）`,
        });
      } else if (placement === 'body' && !bodyClaimIds.has(claim.claim_id)) {
        issues.push({
          id: 'editorial_coverage_gap',
          severity: 'warning',
          object_ref: logical,
          message: `编排为正文的发现未落在任何正文页（${logical}）：请重组装或调整蓝图引用`,
        });
      }
    }
  }

  // 批准范围漂移（§12.3/G6）：G1 基线之后的实质变更（超出精简/视觉范围）阻断正式发布
  const baseline = ctx.approval?.baseline_spec as ReportSpec | undefined;
  if (baseline) {
    const drift = diffSpecs(baseline, spec);
    const violations: string[] = [];
    if (drift.pages_reordered.length > 0) violations.push(`页序变化：${drift.pages_reordered.join('、')}`);
    if (drift.pages_added.length > 0) violations.push(`新增页：${drift.pages_added.join('、')}`);
    if (drift.pages_removed.length > 0) violations.push(`删除页：${drift.pages_removed.join('、')}`);
    if (drift.metrics_changed.length > 0) violations.push(`指标变化：${drift.metrics_changed.map((m) => m.metric_id).join('、')}`);
    if (drift.claims_changed.length > 0) violations.push(`陈述变化：${drift.claims_changed.map((c) => c.claim_id).join('、')}`);
    for (const page of drift.pages_changed) {
      const out = page.changes.filter((c) => !ALLOWED_DRIFT_FIELDS.has(c.field));
      if (out.length > 0) violations.push(`第 ${page.page_id} 页字段变化：${out.map((c) => c.field).join('/')}`);
    }
    if (violations.length > 0) {
      issues.push({
        id: 'editorial_scope_drift',
        severity: 'blocker',
        object_ref: 'editorial.g1_scope',
        message: `超出 G1 批准范围的实质变更（${violations.join('；')}）——受影响范围需重新编审后再发布（§8.4）`,
      });
    }
  }

  return issues;
}

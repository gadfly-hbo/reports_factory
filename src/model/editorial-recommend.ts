import type { ReportBrief } from '../schema/report-spec.js';
import type { EditorialDecision, FindingCard, PlacementRecommendation } from '../schema/editorial.js';

/**
 * 确定性取舍推荐（F03 §7.3）：Agent 先推荐一套正文/附录/不采用，人只调整例外。
 * 行为规则（可解释、可复核），不用没有业务依据的精确分数：
 *   1. 人工决定粘性：已有编审决定（尤其 excluded）不翻案（T06）
 *   2. 口径/方法（data_note）→ 附录（§7.5 分层）
 *   3. 与核心问题相关（任务书词语与发现的中文二元组重叠 ≥2）→ 正文；
 *      其中推断（inference）标注"证据待核实、必要限制须保留"（§7.3 反证规则）
 *   4. 与核心问题无关 → 本次不采用（理由明示）
 *   5. 任务书无核心问题 → 全部保持候选，不猜测
 */

function cjkBigrams(text: string): Set<string> {
  const runs = text.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  const out = new Set<string>();
  for (const run of runs) {
    for (let i = 0; i + 2 <= run.length; i += 1) out.add(run.slice(i, i + 2));
  }
  return out;
}

function briefTerms(brief: ReportBrief): Set<string> {
  const source = [
    brief.core_question,
    brief.purpose,
    ...(brief.required_boundaries ?? []),
    ...(brief.non_goals ?? []),
  ]
    .filter((x): x is string => !!x)
    .join(' ');
  return cjkBigrams(source);
}

export function recommendPlacements(
  brief: ReportBrief | undefined,
  findings: FindingCard[],
  existingDecisions: EditorialDecision[] = [],
): PlacementRecommendation[] {
  const decided = new Map(existingDecisions.map((d) => [d.logical_key, d] as const));
  const terms = brief ? briefTerms(brief) : new Set<string>();

  return findings.map((f) => {
    const decision = decided.get(f.logical_key);
    if (decision) {
      return { logical_key: f.logical_key, placement: decision.placement, reason: decision.reason ?? '沿用既有编审决定', sticky: true };
    }
    if (f.kind === 'data_note') {
      return { logical_key: f.logical_key, placement: 'appendix', reason: '口径与方法属附录层，不与正文抢主线（§7.5 分层）' };
    }
    if (!brief?.core_question) {
      return { logical_key: f.logical_key, placement: 'candidate', reason: '任务书未提供核心问题，无法判定相关性，保持候选' };
    }
    const haystack = [f.text, ...f.limitations, ...f.counter_evidence].join(' ');
    const hits = [...cjkBigrams(haystack)].filter((g) => terms.has(g));
    if (hits.length >= 2) {
      return f.kind === 'inference'
        ? { logical_key: f.logical_key, placement: 'body', reason: `与核心问题相关（命中：${hits.slice(0, 4).join('、')}）；证据待核实，必要限制须保留在正文层` }
        : { logical_key: f.logical_key, placement: 'body', reason: `与核心问题相关（命中：${hits.slice(0, 4).join('、')}）` };
    }
    return { logical_key: f.logical_key, placement: 'excluded', reason: '与核心问题无直接关联，建议本次不采用；可保留在候选区供后续报告复用' };
  });
}

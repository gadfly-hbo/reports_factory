import type { ReportSpec } from '../schema/report-spec.js';

/**
 * 来源替换影响面（§13.2 来源替换行）：新材料版本到来后，
 * 提示哪些页面可能受影响；旧修订与旧导出不改写。
 */
export function pagesImpactedBySource(spec: ReportSpec, sourceId: string): string[] {
  /** source_ref 形如 `src_x` 或 `src_x@v1`，两种都算命中 */
  const matchesSource = (ref: string | undefined) =>
    !!ref && (ref === sourceId || ref.startsWith(`${sourceId}@`));

  const impactedClaims = new Set(
    spec.claims
      .filter((c) => (c.evidence_refs ?? []).some((e) => e.startsWith(`ev_${sourceId}_`)))
      .map((c) => c.claim_id),
  );

  const pages: string[] = [];
  for (const page of spec.pages) {
    const byClaims = page.claim_refs.some((r) => impactedClaims.has(r));
    const byChart = matchesSource(page.chart?.source_ref);
    const byTable = matchesSource(page.table?.source_ref);
    if (byClaims || byChart || byTable) pages.push(page.page_id);
  }
  return pages;
}

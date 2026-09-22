import {
  ReportSpecSchema,
  type Claim,
  type ReportSpec,
} from '../schema/report-spec.js';

/**
 * 一页决策摘要（§4.1 独立形态）：问题 → 选择 → 建议 → 风险 → 需要谁决定。
 * 从主报告 spec 派生：五段全部 claim/metric 绑定，缺失段标待补充（不编造）；
 * metrics 与主报告共享同一对象（跨交付物一致性的前提）。
 */

interface SummarySection {
  label: '问题' | '选择' | '建议' | '风险' | '需要谁决定';
  claim?: Claim;
  fallback: string;
}

export function deriveExecutiveSummary(main: ReportSpec): ReportSpec {
  const facts = main.claims.filter((c) => c.kind === 'fact_statement');
  const inferences = main.claims.filter((c) => c.kind === 'inference');
  const recommendations = main.claims.filter((c) => c.kind === 'recommendation');

  const sections: SummarySection[] = [
    { label: '问题', claim: facts[0], fallback: '待补充：尚无已确认的核心问题陈述' },
    // 选择：仅当存在≥2条建议时列出方案；单条建议不构成"比较"，如实标待补充（不重复同一条）
    {
      label: '选择',
      claim: recommendations.length >= 2 ? recommendations[0] : undefined,
      fallback:
        recommendations.length >= 2
          ? `可选方案：${recommendations.map((r) => r.text).join('；')}`
          : recommendations.length === 1
            ? '待补充：仅一条建议材料，无方案比较'
            : '待补充：尚无可比较的方案材料',
    },
    { label: '建议', claim: recommendations[0], fallback: '待补充：尚无建议标记材料' },
    { label: '风险', claim: inferences[0], fallback: '待补充：尚无推断/不确定性材料' },
    {
      label: '需要谁决定',
      claim: undefined,
      fallback: `需要${main.brief.audience}决策`,
    },
  ];

  const bullets = sections.map((sec) => {
    if (sec.label === '需要谁决定') {
      // 决策段：受众 + 待决事项来源
      const pending = recommendations[0]
        ? `是否采纳「${recommendations[0].text.slice(0, 40)}」`
        : '待补充：待决事项';
      return {
        label: sec.label,
        text: `${sec.fallback}：${pending}`,
        claim_ref: recommendations[0]?.claim_id,
        status: 'pending' as const,
      };
    }
    if (!sec.claim) {
      return { label: sec.label, text: sec.fallback, status: 'pending' as const };
    }
    return {
      label: sec.label,
      text: sec.claim.text,
      claim_ref: sec.claim.claim_id,
      status:
        sec.label === '风险'
          ? 'unverified'
          : sec.claim.verification_state === 'bound_to_source'
            ? ('needs_review' as const)
            : sec.claim.verification_state === 'arithmetic_checked'
              ? ('confirmed' as const)
              : ('needs_review' as const),
    };
  });

  return ReportSpecSchema.parse({
    schema_version: '1.0',
    report_id: `${main.report_id}_summary`,
    revision_id: main.revision_id,
    brief: { ...main.brief, deliverable_type: 'executive_summary', page_budget: 1 },
    source_snapshot: main.source_snapshot,
    metrics: structuredClone(main.metrics), // 深拷贝：摘要侧编辑与主报告分叉时跨交付物校验能抓到
    claims: main.claims,
    pages: [
      {
        page_id: 'page_summary',
        type: 'summary',
        headline: `${main.brief.purpose}：一页决策摘要`,
        bullets,
        claim_refs: bullets.map((b) => b.claim_ref).filter(Boolean),
        // 页级不 blanket 绑定全部指标：文本中的数字来自其 claim 的证据，
        // 与指标库的绑定关系由 claim 自身携带（绑错会误触百分比检查）
        metric_refs: [],
        required_note: main.pages[0]?.required_note,
        locked: false,
      },
    ],
    export_policy: main.export_policy,
  });
}

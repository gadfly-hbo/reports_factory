import { z } from 'zod';

/**
 * ReportSpec schema v1.0（proposal §9 的最小可用集）。
 * 核心是页面与资产之间的稳定引用（claim_refs / metric_refs / source_ref），
 * 不是任何最终渲染字符串。
 */

export const SourceRefSchema = z.object({
  source_id: z.string().min(1),
  version: z.string().min(1),
  is_demo: z.boolean().optional().default(false),
});

export const MetricSchema = z.object({
  metric_id: z.string().min(1),
  value: z.number(),
  unit: z.string().min(1),
  display_format: z.string().optional(),
  period: z.string().optional(),
  scope: z.string().optional(),
  formula: z.string().optional(),
  inputs: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])).optional(),
  evidence_refs: z.array(z.string()).optional(),
  source_ref: z.string().optional(),
});

export const ClaimKindSchema = z.enum([
  'fact_statement',
  'computed_statement',
  'inference',
  'recommendation',
  'user_supplement',
  'data_note',
]);

export const VerificationStateSchema = z.enum([
  'unverified',
  'bound_to_source',
  'arithmetic_checked',
  'needs_review',
  'conflict',
  'source_updated',
]);

export const ClaimSchema = z.object({
  claim_id: z.string().min(1),
  kind: ClaimKindSchema,
  text: z.string().min(1),
  metric_refs: z.array(z.string()).optional().default([]),
  evidence_refs: z.array(z.string()).optional().default([]),
  verification_state: VerificationStateSchema,
  source_truth_verified: z.boolean().optional().default(false),
  uncertainty: z.string().optional(),
});

export const ChartSeriesSchema = z.object({
  name: z.string().min(1),
  data: z.array(z.object({ label: z.string(), value: z.number() })).min(1),
});

export const ChartSpecSchema = z.object({
  chart_id: z.string().min(1),
  type: z.enum(['bar', 'line', 'pie', 'donut']),
  title: z.string().optional(),
  series: z.array(ChartSeriesSchema).min(1),
  source_ref: z.string().optional(),
});

export const PageTypeSchema = z.enum([
  'cover',
  'summary',
  'metrics_overview',
  'trend',
  'issue_breakdown',
  'option_comparison',
  'action_items',
  'evidence_appendix',
]);

export const PageSchema = z.object({
  page_id: z.string().min(1),
  type: PageTypeSchema,
  headline: z.string().min(1),
  body: z.string().optional(),
  claim_refs: z.array(z.string()).optional().default([]),
  metric_refs: z.array(z.string()).optional().default([]),
  evidence_refs: z.array(z.string()).optional().default([]),
  required_note: z.string().optional(),
  chart: ChartSpecSchema.optional(),
  layout_id: z.string().optional(),
  locked: z.boolean().optional().default(false),
});

export const ReportBriefSchema = z.object({
  audience: z.string().min(1),
  purpose: z.string().min(1),
  duration_minutes: z.number().positive().optional(),
  page_budget: z.number().int().positive(),
  language: z.string().optional().default('zh-CN'),
  style: z.string().optional(),
});

export const ExportPolicySchema = z.object({
  freeze_revision: z.boolean().optional().default(true),
  include_source_notes: z.boolean().optional().default(true),
  external_share_allowed: z.boolean().optional().default(false),
});

export const ReportSpecSchema = z.object({
  schema_version: z.literal('1.0'),
  report_id: z.string().min(1),
  revision_id: z.string().min(1),
  brief: ReportBriefSchema,
  source_snapshot: z.array(SourceRefSchema).optional().default([]),
  metrics: z.array(MetricSchema).optional().default([]),
  claims: z.array(ClaimSchema).optional().default([]),
  pages: z.array(PageSchema).min(1),
  export_policy: ExportPolicySchema.optional(),
});

export type SourceRef = z.infer<typeof SourceRefSchema>;
export type Metric = z.infer<typeof MetricSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type ChartSpec = z.infer<typeof ChartSpecSchema>;
export type PageType = z.infer<typeof PageTypeSchema>;
export type Page = z.infer<typeof PageSchema>;
export type ReportBrief = z.infer<typeof ReportBriefSchema>;
export type ReportSpec = z.infer<typeof ReportSpecSchema>;

export function validateReportSpec(input: unknown): ReportSpec {
  return ReportSpecSchema.parse(input);
}

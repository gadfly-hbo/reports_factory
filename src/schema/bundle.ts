import { z } from 'zod';
import { ClaimKindSchema, VerificationStateSchema } from './report-spec.js';

/**
 * AnalysisBundle：上游分析工具的授权成果包合同（模块方案 §11.1，schema v1.0）。
 * 单 JSON 全内联（图片用 data URL），不含文件系统路径 —— 资源定位只有内联值，
 * 导入端不解析路径、不执行包内任何内容（§11.4/§14.3）。
 * 不默认包含原始明细、完整聊天、代码、内核变量或连接凭据（§5.3）。
 */

export const BundleFindingSchema = z.object({
  /** 生产者侧稳定发现标识（如 F07）；跨版本保持一致才能形成修订链 */
  finding_id: z.string().min(1),
  kind: ClaimKindSchema,
  text: z.string().min(1),
  metric_refs: z.array(z.string()).optional().default([]),
  evidence_refs: z.array(z.string()).optional().default([]),
  verification: VerificationStateSchema.optional().default('unverified'),
  /** 必要限制：简化表达时不得丢失（§7.3） */
  limitations: z.array(z.string()).optional().default([]),
  /** 反证：会改变受众判断的相反证据，必须可见（§7.3） */
  counter_evidence: z.array(z.string()).optional().default([]),
  verification_notes: z.array(z.string()).optional().default([]),
  business_implication: z.string().optional(),
});

export const BundleMetricSchema = z.object({
  metric_id: z.string().min(1),
  value: z.number(),
  unit: z.string().min(1),
  period: z.string().optional(),
  scope: z.string().optional(),
  formula: z.string().optional(),
  inputs: z.record(z.string(), z.number()).optional(),
});

export const BundleChartSeriesSchema = z.object({
  name: z.string().min(1),
  data: z.array(z.object({ label: z.string(), value: z.number() })),
});

export const BundleChartSchema = z.object({
  chart_id: z.string().min(1),
  title: z.string().optional(),
  series: z.array(BundleChartSeriesSchema).optional(),
  /** 已授权图片（无底层数据时的替代呈现） */
  image_data_url: z.string().optional(),
});

export const BundleEvidenceSchema = z.object({
  evidence_id: z.string().min(1),
  locator: z.string().min(1),
  excerpt: z.string(),
  verification_dimensions: z.array(z.string()).optional().default([]),
});

export const BundlePermissionsSchema = z.object({
  sensitivity: z.enum(['normal', 'sensitive']).optional().default('normal'),
  local_use: z.boolean().optional().default(true),
  external_share: z.enum(['none', 'with_approval', 'allowed']).optional().default('none'),
});

export const BundleUpstreamSchema = z.object({
  project_id: z.string().optional(),
  task_id: z.string().optional(),
  run_id: z.string().optional(),
  result_revision: z.string().min(1),
  contract_ref: z.string().optional(),
});

export const AnalysisBundleSchema = z.object({
  schema_version: z.literal('1.0'),
  bundle_id: z.string().min(1),
  producer: z.string().min(1),
  created_at: z.string().min(1),
  upstream: BundleUpstreamSchema,
  snapshot_id: z.string().min(1),
  findings: z.array(BundleFindingSchema),
  metrics: z.array(BundleMetricSchema).optional().default([]),
  charts: z.array(BundleChartSchema).optional().default([]),
  evidence: z.array(BundleEvidenceSchema).optional().default([]),
  /** 任务级限制（§15.2：如"缺货尚未被证明为销售下降主因"） */
  limitations: z.array(z.string()).optional().default([]),
  permissions: BundlePermissionsSchema.optional(),
  /** 补证结果回流锚（G8）：该成果包是对某条补证请求的回答 */
  origin: z.object({ evidence_request_id: z.string().optional() }).optional(),
  /** 可用性：缺失与不可访问项明示，不静默丢弃（§11.1） */
  availability: z
    .object({
      missing: z.array(z.string()).optional().default([]),
      inaccessible: z.array(z.string()).optional().default([]),
    })
    .optional(),
});

export type BundleFinding = z.infer<typeof BundleFindingSchema>;
export type BundleMetric = z.infer<typeof BundleMetricSchema>;
export type BundleChart = z.infer<typeof BundleChartSchema>;
export type BundleEvidence = z.infer<typeof BundleEvidenceSchema>;
export type AnalysisBundle = z.infer<typeof AnalysisBundleSchema>;

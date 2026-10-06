import { z } from 'zod';
import { PageTypeSchema, DeliverableTypeSchema } from './report-spec.js';
import { BrandConfigSchema } from './brand.js';

/**
 * 报告模版注册表（PRD D1）：结构预设 + 品牌 token 预设。
 * page_plan = 页型序列（映射既有 composeOutline 主线），非法页型注册被 schema 拒绝。
 * 不做任意模版导入设计器（M3 红线延续）。
 */

export const TemplateConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  deliverable_type: DeliverableTypeSchema,
  page_plan: z.array(PageTypeSchema).min(1),
  /** M7 品牌风格预设（PRD D6）：生成即应用；用户自定义 brand 覆盖预设 */
  brand: BrandConfigSchema.optional(),
});
export type TemplateConfig = z.infer<typeof TemplateConfigSchema>;

export const DEFAULT_TEMPLATE_ID = 'ops_review_deck';

const REGISTRY: TemplateConfig[] = [
  {
    id: 'ops_review_deck',
    name: '经营复盘 deck',
    description: '适用于经营复盘会：结论 → 指标 → 趋势 → 原因 → 方案 → 行动的 8 页主线',
    deliverable_type: 'meeting_deck',
    brand: { primary: '#b44626', accent: '#8f3820' },
    page_plan: [
      'cover',
      'summary',
      'metrics_overview',
      'trend',
      'issue_breakdown',
      'option_comparison',
      'action_items',
      'evidence_appendix',
    ],
  },
  {
    id: 'exec_summary_deck',
    name: '执行摘要 deck',
    description: '适用于向决策层快速汇报：一页摘要主线，聚焦结论与待决事项',
    deliverable_type: 'executive_summary',
    brand: { primary: '#263442', accent: '#b44626' },
    page_plan: ['cover', 'summary', 'metrics_overview', 'action_items'],
  },
  {
    id: 'research_doc',
    name: '研究报告 doc',
    description: '适用于研究报告文档：问题 → 口径 → 发现 → 证据 → 限制 → 建议的章节主线',
    deliverable_type: 'research_report',
    brand: { primary: '#1f3a3d', accent: '#b44626' },
    page_plan: [
      'cover',
      'summary',
      'evidence_appendix',
      'summary',
      'metrics_overview',
      'issue_breakdown',
      'action_items',
    ],
  },
];

export function listTemplates(): TemplateConfig[] {
  return REGISTRY.map((t) => TemplateConfigSchema.parse(t));
}

export function getTemplate(id: string): TemplateConfig | undefined {
  return REGISTRY.find((t) => t.id === id);
}

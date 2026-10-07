import { z } from 'zod';

/**
 * PPT 框架（M10 S4，G7）：确认前可编辑（改题/删页/调序/加页），确认后锁定不可变。
 * source_hint 来自理解摘要的主题标签/来源，供 S5 语义投影。
 * page_id 由代码按序赋值（page_01…），不要求模型输出——模型侧用 FrameworkGenSchema。
 */

export const FrameworkPageBaseSchema = z.object({
  title: z.string().min(1),
  page_type: z.string().min(1),
  intent: z.string().optional(),
  source_hint: z.array(z.string()).optional(),
});

/** 模型生成态（无 page_id） */
export const FrameworkGenSchema = z.object({
  pages: z.array(FrameworkPageBaseSchema).min(2).max(24),
});

export const FrameworkPageSchema = FrameworkPageBaseSchema.extend({
  page_id: z.string().min(1),
});

/** 存储态（page_id 已赋值） */
export const FrameworkSchema = z.object({
  pages: z.array(FrameworkPageSchema).min(2).max(24),
});

export type FrameworkPageBase = z.infer<typeof FrameworkPageBaseSchema>;
export type FrameworkPage = z.infer<typeof FrameworkPageSchema>;
export type Framework = z.infer<typeof FrameworkSchema>;

/** 框架生成环节指令（守则全集由 skill 注入） */
export const FRAMEWORK_INSTRUCTION = [
  '任务：依据全部资料的理解摘要与项目简介，生成整套 PPT 的页面框架。',
  '只输出 JSON：{"pages":[{"title":"页题（直接陈述该页结论）","page_type":"页型","intent":"该页要回答的问题/呈现的意图","source_hint":["主题标签或来源文件名"]},"...]}。',
  '要求：',
  '- 页数克制（默认 6–10 页），结构完整：开头有封面/摘要，结尾有行动/收尾',
  '- 每页 title 直接陈述结论，不写「关于XX的分析」式空标题',
  '- intent 一句话说明该页意图；source_hint 用材料里的主题标签（topic_tag）标注该页素材来源',
  '- 数据页优先用有数据要点支撑的主题；材料未覆盖的主题不要设页',
].join('\n');

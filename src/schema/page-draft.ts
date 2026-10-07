import { z } from 'zod';

/**
 * 页内容（M10 S5/S6）：逐页工人单发的结构化输出，ReportSpec 演进层的页数据源。
 * 数字护栏在 workbench 层后校验（输出数字必须来自投影材料）。
 */

export const PageDraftSchema = z.object({
  headline: z.string().min(1),
  bullets: z.array(z.object({
    text: z.string().min(1),
    /** 数据要点可带来源标签（S5 投影材料的 topic_tag） */
    source_hint: z.string().optional(),
  })).max(6).optional().default([]),
  /** 摘要正文（可选；内容页用） */
  body: z.string().optional(),
  /** 原生图表（可选）：结构化数据驱动，非截图 */
  chart: z.object({
    title: z.string().min(1),
    type: z.enum(['bar', 'line', 'pie']).default('bar'),
    categories: z.array(z.string()).min(2),
    series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })).min(1),
  }).optional(),
  /** 表格/数据注释 */
  table_note: z.string().optional(),
  /** 材料未覆盖该页主题：true=明示留白（不编造） */
  uncovered: z.boolean().default(false),
});

export type PageDraft = z.infer<typeof PageDraftSchema>;

/** 页起草环节指令（守则全集由 skill 注入） */
export const PAGE_DRAFT_INSTRUCTION = [
  '任务：为 PPT 的一页起草完整内容。材料是按该页意图从资料中投影出的要点（含主题标签与数值）。',
  '只输出 JSON：{"headline":"页题（直接陈述该页结论，可覆盖框架暂定题）","bullets":[{"text":"要点","source_hint":"依据的主题标签"}],"body":"可选摘要段","chart":null 或 {"title":"图表题","type":"bar|line|pie","categories":["类目"],"series":[{"name":"系列","values":[数值]}]},"table_note":"可选数据口径注释","uncovered":boolean}。',
  '要求：',
  '- 数字必须逐字来自材料（含图表 values），禁止任何编造或换算；材料没有的数字一个都不能出现',
  '- bullets ≤ 6 条、信息密度高；headline 直接陈述结论',
  '- 数据足够时优先给 chart（原生图表）；chart 数据全部来自材料',
  '- 材料不足以支撑该页主题时 bullets=[]、uncovered=true（明示留白，不硬凑）',
  '- 遵守守则：0 emoji、颜色克制、字号下限 12pt',
].join('\n');

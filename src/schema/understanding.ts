import { z } from 'zod';

/**
 * 读取理解摘要（M10 S3，M-U4/G11）：逐文件 LLM 单发提炼的结构化输出。
 * 主题标签（topic_tag）是 S5 语义投影的索引基础（PRD 材料投影三层机制第 1 层）。
 */

export const UnderstandingPointSchema = z.object({
  /** 要点提炼（不是原文照抄） */
  text: z.string().min(1),
  /** 主题标签：简短、稳定、可聚合（如「流失原因」「价格敏感」「转化效率」） */
  topic_tag: z.string().min(1),
  kind: z.enum(['point', 'data']).default('point'),
  /** kind=data 时的数值（逐字取自材料；模型可能给 "3.9亿元" 带单位字符串 → 提取数字部分，提取不到置 undefined） */
  value: z.preprocess((v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
    if (typeof v === 'string') {
      const m = v.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
      return m ? parseFloat(m[0]) : undefined;
    }
    return undefined;
  }, z.number().optional()),
  unit: z.string().optional(),
  /** 材料内定位（页码/章节/工作表），供追溯 */
  locator: z.string().optional(),
});

export const UnderstandingSchema = z.object({
  points: z.array(UnderstandingPointSchema).max(80), // 长材料 mimo 可能产出 40+ 条
  /** 材料无可提炼内容时 true（明示，不编造） */
  uncovered: z.boolean().default(false),
  /** 一句话整体概述（给框架生成的材料索引用） */
  gist: z.string().min(1),
});

export type UnderstandingPoint = z.infer<typeof UnderstandingPointSchema>;
export type Understanding = z.infer<typeof UnderstandingSchema>;

/** 理解环节指令（stage instruction；守则全集由 skill 注入） */
export const UNDERSTAND_INSTRUCTION = [
  '任务：读取并理解一份材料，产出结构化理解摘要。',
  '只输出 JSON：{"points":[{"text":"要点提炼","topic_tag":"主题标签","kind":"point|data","value":数值或省略,"unit":"单位或省略","locator":"页码/章节定位或省略"}],"uncovered":boolean,"gist":"一句话概述"}。',
  '要求：',
  '- 每条要点都必须带 topic_tag（简短名词短语，同类材料保持一致）；数据要点 kind=data 并给 value/unit',
  '- 数字逐字取自材料，不做换算；材料没有的内容不要写',
  '- points 最多 40 条，按重要性排序；材料确实无可提炼内容时 points=[] 且 uncovered=true',
].join('\n');

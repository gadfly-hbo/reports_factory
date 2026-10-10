import type { JsonValue, Tool } from 'pi-agent-runtime';
import { proposeOutline, validatePages, validateQuestions, type OutlinePage } from '../outline.js';

/** JSON Schema（中立 Tool 合同：JsonObject）。 */
const PAGES_SCHEMA = {
  type: 'array', minItems: 2, maxItems: 24,
  items: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '结论式页题（直接陈述该页结论，不写「关于XX的分析」）' },
      page_type: { type: 'string', description: '页型：cover/summary/metrics_overview/trend/issue_breakdown/option_comparison/action_items/evidence_appendix/content' },
      intent: { type: 'string', description: '该页要回答的问题/呈现的意图（一句话）' },
      source_hint: { type: 'array', items: { type: 'string' }, description: '材料主题标签（topic_tag）或来源文件名' },
    },
    required: ['title', 'page_type'],
  },
};

/**
 * 框架提案工具（T2，D9 核心差异化）：agent 读完材料后必须先调本工具出提案，
 * 确认前不得开始生成（守则在系统提示词与 skill 中双重约束）。
 * 提案落盘 outline.json（版本+1）→ 前端提案卡呈现（内联编辑/确认）。
 */
export function proposeOutlineTool(projectRoot: string): Tool {
  return {
    name: 'propose_outline',
    description: [
      '向用户提出整套 PPT 的页面框架提案（读完全部材料后必须先调用；用户确认前不要开始写页面代码）。',
      'pages：2–24 页；title 直接陈述结论；intent 一句话；source_hint 用材料主题标签。',
      'questions：≤3 个需要用户澄清的问题（材料缺口、口径、受众偏好）；没有就给空数组。',
      '材料未覆盖的主题不要设页；不编造内容。',
    ].join(''),
    effect: 'write',
    parameters: {
      type: 'object',
      properties: { pages: PAGES_SCHEMA, questions: { type: 'array', items: { type: 'string' }, maxItems: 3 } },
      required: ['pages'],
    },
    resourceUnits: 1,
    replay: 'safe',
    execute: async (args): Promise<JsonValue> => {
      const raw = args as { pages?: unknown; questions?: unknown };
      let pages: OutlinePage[];
      let questions: string[];
      try {
        pages = validatePages(raw.pages);
        questions = validateQuestions(raw.questions);
      } catch (e) {
        const error: JsonValue = (e as Error).message;
        return { ok: false, error };
      }
      const version = await proposeOutline(projectRoot, pages, questions);
      return {
        ok: true,
        version,
        pages: pages.length,
        message: `框架提案 v${version}（${pages.length} 页）已呈现给用户。等待用户在提案卡确认或提出修改意见；${questions.length > 0 ? `你列了 ${questions.length} 个澄清问题，用户会一并答复。` : ''}确认前不要开始写页面代码。`,
      };
    },
  };
}

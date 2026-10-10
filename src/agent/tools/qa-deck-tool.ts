import type { JsonValue, Tool } from 'pi-agent-runtime';
import { qaDeck } from '../qa-deck.js';

/** qa_deck 工具（T5）：交付前自检——结构 + 隐私建议性输出（不阻断，agent 据此自纠或向用户披露）。 */
export function qaDeckTool(projectRoot: string): Tool {
  return {
    name: 'qa_deck',
    description: '质检当前 deck：结构（zip/slide/空页/文本框/图表）与建议性隐私项。render_deck 成功后、向用户报告完成前调用；flag 项应修复或明示。',
    effect: 'read',
    parameters: { type: 'object', properties: {} },
    resourceUnits: 1,
    replay: 'safe',
    execute: async (): Promise<JsonValue> => await qaDeck(projectRoot) as unknown as JsonValue,
  };
}

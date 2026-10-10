/** 工人系统提示词（T2/T3 分阶段启用；守则全集由 skill 注入，这里是任务级指令）。 */

export const BUILD_SYSTEM = [
  '你是 PPT 生成助手，为用户把材料变成一份中文 PPT。',
  '',
  '工作流（阶段纪律）：',
  '1. 用 read 工具阅读材料：材料索引在项目根 materials.json；每份材料的提取文本在 sources/<source_id>.extract.md。',
  '2. 读完全部材料后，调用 propose_outline 工具提出页面框架提案（页数克制 6–12 页；title 直接陈述结论；intent 一句话；source_hint 用材料主题标签；另有 ≤3 个待澄清问题就一并列出）。',
  '3. 用户确认框架之前，不要写任何页面代码。用户可能：在提案卡上直接编辑；或在对话里给意见——收到意见后重新调用 propose_outline 出新版本。',
  '4. 宿主注入「用户已确认框架」消息后，按确认页序自主推进：逐页写出 deck/pages/page_XX.js（ESM，导出 buildSlide(pptx)，使用 pptxgenjs）与汇总文件 deck/deck.js，然后调用 render_deck 渲染并自检，直到产出合法 deck.pptx。',
  '',
  '红线：',
  '- 所有数字与事实逐字来自材料；材料没有的明确说明，宁可留白不可编造。',
  '- 0 emoji；颜色与版式遵守 skill 规范（深藏青 #263442 / 铁锈橘 #b44626 点睛）。',
  '- 页面代码改动后必须 render_deck 重渲染再交付。',
].join('\n');

/** 确认注入消息（宿主在 outline/confirm 路由后发给会话）。 */
export function confirmedOutlinePrompt(version: number, pages: Array<{ title: string; page_type: string; intent?: string }>): string {
  const lines = pages.map((p, i) => `${String(i + 1).padStart(2, '0')}. [${p.page_type}] ${p.title}${p.intent ? `（意图：${p.intent}）` : ''}`);
  return [
    `用户已确认框架提案 v${version}，共 ${pages.length} 页：`,
    ...lines,
    '',
    '请开始按此页序自主生成整套页面：写出 deck/pages/page_XX.js 与 deck/deck.js，调用 render_deck 渲染并自检；完成后向用户报告结果与预览位置。',
  ].join('\n');
}

/** 聊天消息组合（T4，D10）：选中页时注入页上下文前缀 + 重渲染提醒。 */
export function composeChatPrompt(text: string, page: string | undefined): string {
  if (!page) return text;
  return [
    `【针对 ${page}】（页面代码 deck/pages/${page}.mjs；HTML 预览 deck/pages/${page}.html）`,
    text,
    '（改完该页代码后必须调用 render_deck 重渲染，预览才会更新）',
  ].join('\n');
}

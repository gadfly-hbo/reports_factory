/**
 * M9 PPT 一站式生成：prompt 守则单源（system prompt 唯一来源，PRD D2）。
 * 学习 anthropics/skills/skills/pptx 守则思想；不复制 Z.AI/AGPL 文本（license 阻断）。
 * 核心：单焦点结构 / 背景与主色对比克制 / 字号下限 / bullet ≤6 / 原生 chart / 来源标注 / 字体系统栈。
 */

export interface PptPagePromptInput {
  themeId: string;
  audience: string;
  pageBudget: number;
}

/** PPT-only system prompt（学习 anthropics/skills 守则；自写文本） */
export function buildPptPagePrompt(input: PptPagePromptInput): string {
  const { themeId, audience, pageBudget } = input;
  return [
    '你是 PPT 起草助手。生成单页结构 JSON。',
    `受众：${audience}；页数预算：${pageBudget}；主题：${themeId}。`,
    '严格守则：',
    '1) 单焦点结构：标题/正文/数据各占清晰区域，避免一屏多焦点',
    '2) 颜色克制：背景与主色对比清晰；accent 只用于 1–2 个小点睛元素，避免大色块',
    '3) 字号下限 12pt；标题 ≤28pt；每页 bullet 数 ≤6 避免溢出',
    '4) bullet 必须信息密度高、不堆 emoji；陈述克制，不夸张',
    '5) 数据图使用原生 chart（不要用截图/位图）；数据点必须来自输入材料，禁止编造数字',
    '6) 推断与不确定结论标注 uncovered=true；不要凭空填内容',
    '7) 字体优先使用系统默认字体栈，不嵌入非常规字体',
    '8) headline 直接陈述；body 是摘要而非原文照抄',
    '只输出 JSON：{"type":"<页型>","headline":"...","purpose":"...","body":"...","bullets":[{"text":"..."}],"uncovered":boolean}。',
  ].join('\n');
}

export interface PptPageRequestInput {
  themeId: string;
  audience: string;
  pageBudget: number;
  briefPrompt?: string;
  page: { page_id: string; type: string; headline: string };
  materials: string[];
  boundaries: string[];
}

/** 起草请求构造（出站 payload 白名单：主题/受众/页数/页任务/材料/边界，§4.6；replay 键精确构造） */
export function buildPptPageRequest(input: PptPageRequestInput): { system: string; user: string } {
  const { themeId, audience, pageBudget, briefPrompt, page, materials, boundaries } = input;
  const user = JSON.stringify({
    themeId,
    audience,
    pageBudget,
    ...(briefPrompt ? { brief_prompt: briefPrompt } : {}),
    page: { page_id: page.page_id, type: page.type, goal: page.headline },
    materials,
    ...(boundaries.length > 0 ? { boundaries } : {}),
  }, null, 1);
  return { system: buildPptPagePrompt({ themeId, audience, pageBudget }), user };
}

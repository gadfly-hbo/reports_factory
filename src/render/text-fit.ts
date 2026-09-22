/**
 * 确定性文本测量与标题适配：中文防溢出的根基（proposal §11.1：
 * 超容量优先拆页/精简而非无限缩字；字号有下限，触底即标记需拆页）。
 * 不用 canvas / 浏览器测量 —— 估算规则保持三格式一致且可测试。
 */

const CJK_RE = /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F]/;

function charWidth(ch: string, fontSize: number): number {
  return CJK_RE.test(ch) ? fontSize : fontSize * 0.55;
}

/** 估算单行文本宽度（与 fontSize 同单位） */
export function textWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) w += charWidth(ch, fontSize);
  return w;
}

export interface FitResult {
  fontSize: number;
  /** 触底仍放不下：需要拆页或精简，由检查引擎消费 */
  needsSplit: boolean;
}

/** 在 [floor, base] 之间按 2 的步长找能以 maxLines 行容纳的最大字号；找不到则用 floor 并标记需拆页 */
export function fitHeadline(
  text: string,
  opts: { base: number; floor: number; maxWidth: number; maxLines?: number; step?: number },
): FitResult {
  const { base, floor, maxWidth } = opts;
  const maxLines = opts.maxLines ?? 2;
  const step = opts.step ?? 2;
  for (let size = base; size >= floor; size -= step) {
    if (textWidth(text, size) <= maxWidth * maxLines) {
      return { fontSize: size, needsSplit: false };
    }
  }
  return { fontSize: floor, needsSplit: true };
}

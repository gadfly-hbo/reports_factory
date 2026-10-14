// sources: 26年8月森马天猫官旗.md
// headline: @skip
import pptxgen from 'pptxgenjs';

export function buildSlide(pptx) {
  const t = {
    primary: 'b44626',   // 铁锈橘（主色）
    accent1: '263442',   // 深藏青（点睛）
    accent2: '5A6675',   // 中性灰
    light:   'F7F6F3',
    ink:     '242830',
    muted:   '626773',
    line:    'DEDCD6'
  };

  const s = pptx.addSlide();
  s.background = { color: 'FFFFFF' };

  // 左缘 accent1 竖线（深藏青点睛）
  s.addShape('rect', { x: 0.6, y: 0.6, w: 0.08, h: 6.3, fill: { color: t.accent1 }, line: { type: 'none' } });

  // 顶部品牌/品类小标识
  s.addText('SEMIR  /  TMALL FLAGSHIP', {
    x: 0.95, y: 0.55, w: 6, h: 0.32,
    fontSize: 10, fontFace: 'Arial', color: t.muted, charSpacing: 4
  });

  // 主标题（2 行 32pt 加粗）
  s.addText('森马天猫官旗人群画像\n——以 18-34 岁都市女性为主力的高敏感消费基本盘', {
    x: 0.95, y: 1.55, w: 11.6, h: 1.9,
    fontSize: 30, fontFace: 'PingFang SC', color: t.primary, bold: true,
    lineSpacingMultiple: 1.15
  });

  // 副标题 / 报告类型
  s.addText('品牌画像诊断报告  /  人群洞察专题', {
    x: 0.95, y: 3.55, w: 8, h: 0.4,
    fontSize: 16, fontFace: 'PingFang SC', color: t.accent1, bold: false
  });

  // 分隔横线
  s.addShape('rect', { x: 0.95, y: 4.15, w: 1.6, h: 0.04, fill: { color: t.primary }, line: { type: 'none' } });

  // 三块元数据：报告编号 / 时间窗 / 样本规模
  const metaY = 4.55;
  s.addText('数据时间窗', {
    x: 0.95, y: metaY, w: 3.0, h: 0.3,
    fontSize: 10, fontFace: 'PingFang SC', color: t.muted, charSpacing: 2
  });
  s.addText('2026 年 8 月（截止 08-26）', {
    x: 0.95, y: metaY + 0.3, w: 3.6, h: 0.4,
    fontSize: 14, fontFace: 'PingFang SC', color: t.ink, bold: true
  });

  s.addText('数据来源', {
    x: 4.55, y: metaY, w: 3.0, h: 0.3,
    fontSize: 10, fontFace: 'PingFang SC', color: t.muted, charSpacing: 2
  });
  s.addText('天猫品牌数据银行 · 4 组人群合并', {
    x: 4.55, y: metaY + 0.3, w: 4.5, h: 0.4,
    fontSize: 14, fontFace: 'PingFang SC', color: t.ink, bold: true
  });

  s.addText('标签覆盖', {
    x: 9.0, y: metaY, w: 3.0, h: 0.3,
    fontSize: 10, fontFace: 'PingFang SC', color: t.muted, charSpacing: 2
  });
  s.addText('554 条 · 跨 6 大维度', {
    x: 9.0, y: metaY + 0.3, w: 3.6, h: 0.4,
    fontSize: 14, fontFace: 'PingFang SC', color: t.ink, bold: true
  });

  // 右下角：委托方 / 日期 / 密级（muted 小字块）
  s.addText([
    { text: '委托方  森马电商 · 用户增长部\n', options: { fontSize: 10, color: t.ink, bold: true, fontFace: 'PingFang SC' } },
    { text: '出具日期  2026 / 10 / 14\n', options: { fontSize: 10, color: t.muted, fontFace: 'PingFang SC' } },
    { text: '密级    仅供内部决策参考', options: { fontSize: 10, color: t.muted, fontFace: 'PingFang SC' } }
  ], {
    x: 9.4, y: 6.4, w: 3.3, h: 0.9, align: 'right', paraSpaceAfter: 2
  });

  // 底部装饰条（accent2 极细线）
  s.addShape('rect', { x: 0.95, y: 6.95, w: 7.4, h: 0.02, fill: { color: t.line }, line: { type: 'none' } });

  // 数据来源脚注
  s.addText('数据来源：26年8月森马天猫官旗.md', {
    x: 0.95, y: 7.05, w: 7.5, h: 0.3, fontSize: 9, fontFace: 'PingFang SC',
    color: t.muted, italic: true
  });

  return s;
}
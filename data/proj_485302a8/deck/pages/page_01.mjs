// Page 01 / Cover — 国内电商进入存量博弈，公私域协同成增长主命题
import pptxgen from 'pptxgenjs';

export function buildSlide(pptx) {
  const t = {
    primary: '263442',    // 深藏青
    accent1: 'B44626',    // 铁锈橘
    accent2: '5A6675',    // 钢灰
    light:   'F7F6F3',    // 米白
    ink:     '242830',    // 墨黑
    muted:   '9AA3AE',    // 灰蓝（深底上调亮）
    line:    'DEDCD6',
  };

  const s = pptx.addSlide();
  s.background = { color: t.primary };

  // 顶部细线 accent2
  s.addShape('rect', { x: 0.6, y: 1.05, w: 0.7, h: 0.06, fill: { color: t.accent2 } });

  // 顶部小标
  s.addText('2026 Q3  ·  内部研究报告', {
    x: 0.6, y: 1.18, w: 8, h: 0.4,
    fontFace: 'PingFang SC', fontSize: 11, color: t.muted, charSpacing: 4,
  });

  // 顶部右上角小标签
  s.addShape('rect', {
    x: 11.6, y: 1.1, w: 1.15, h: 0.42,
    fill: { color: t.accent1 }, line: { type: 'none' },
  });
  s.addText('存量博弈期', {
    x: 11.6, y: 1.1, w: 1.15, h: 0.42,
    fontFace: 'PingFang SC', fontSize: 10, color: 'FFFFFF',
    align: 'center', valign: 'middle', bold: true, charSpacing: 2,
  });

  // 主标题 行 1
  s.addText('国内电商平台进入', {
    x: 0.6, y: 1.95, w: 12, h: 1.05,
    fontFace: 'PingFang SC', fontSize: 46, color: 'FFFFFF', bold: true,
    charSpacing: 2,
  });

  // 主标题 行 2（带 accent1 强调）
  s.addText([
    { text: '存量博弈', options: { color: t.accent1 } },
    { text: '，', options: { color: 'FFFFFF' } },
    { text: '公私域协同', options: { color: 'FFFFFF' } },
  ], {
    x: 0.6, y: 2.95, w: 12, h: 1.05,
    fontFace: 'PingFang SC', fontSize: 46, bold: true, charSpacing: 2,
  });

  // 主标题 行 3
  s.addText('成为增长主命题', {
    x: 0.6, y: 3.95, w: 12, h: 1.05,
    fontFace: 'PingFang SC', fontSize: 46, color: 'FFFFFF', bold: true,
    charSpacing: 2,
  });

  // 英文小标
  s.addText('CHINA  E-COMMERCE  TRAFFIC  LANDSCAPE  ·  PUBLIC-PRIVATE  DOMAIN  PLAYBOOK', {
    x: 0.6, y: 5.05, w: 12, h: 0.4,
    fontFace: 'Arial', fontSize: 11, color: t.accent2, charSpacing: 3,
  });

  // 三个核心数字横排
  const stats = [
    { num: '12.8亿', label: '全网 MAU（同比仅 +1.2%）' },
    { num: '620元',  label: '公域获客成本（三年 +63%）' },
    { num: '18×',    label: '公私域获客成本差距' },
  ];
  stats.forEach((it, i) => {
    const x = 0.6 + i * 4.2;
    s.addText(it.num, {
      x, y: 5.75, w: 4, h: 0.55,
      fontFace: 'Arial', fontSize: 26, color: 'FFFFFF', bold: true, charSpacing: 1,
    });
    s.addText(it.label, {
      x, y: 6.3, w: 4, h: 0.35,
      fontFace: 'PingFang SC', fontSize: 10, color: t.muted,
    });
    if (i < stats.length - 1) {
      s.addShape('rect', { x: x + 4.0 - 0.02, y: 5.85, w: 0.02, h: 0.7, fill: { color: '3D4A5A' } });
    }
  });

  // 底部信息
  s.addText('面向品牌商家决策层  ·  整理自 QuestMobile / 艾瑞 / TMO / 雪球 等公开口径', {
    x: 0.6, y: 7.0, w: 12, h: 0.3,
    fontFace: 'PingFang SC', fontSize: 9, color: t.muted,
  });

  // 底部 accent1 横条
  s.addShape('rect', { x: 0, y: 7.38, w: 13.33, h: 0.12, fill: { color: t.accent1 }, line: { type: 'none' } });

  return s;
}
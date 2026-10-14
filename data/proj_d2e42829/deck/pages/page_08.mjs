// sources: 26年8月森马天猫官旗.md
// headline: 潮流人群 + 早期采用者为主力，「显瘦 + 优雅 + 甜美」是服饰心智三条主线
import pptxgen from 'pptxgenjs';

export function buildSlide(pptx) {
  const t = {
    primary: 'b44626', accent1: '263442', accent2: '5A6675',
    light: 'F7F6F3', ink: '242830', muted: '626773', line: 'DEDCD6'
  };
  const s = pptx.addSlide();
  s.background = { color: 'FFFFFF' };

  // 页眉
  s.addShape('rect', { x: 0.6, y: 0.6, w: 0.08, h: 0.4, fill: { color: t.primary }, line: { type: 'none' } });
  s.addText('04  /  服饰心智', {
    x: 0.85, y: 0.6, w: 8, h: 0.4, fontSize: 11, fontFace: 'PingFang SC',
    color: t.muted, charSpacing: 3, bold: true
  });
  s.addText('SEMIR', {
    x: 11.4, y: 0.6, w: 1.6, h: 0.4, fontSize: 10, fontFace: 'Arial',
    color: t.primary, bold: true, align: 'right', charSpacing: 4
  });

  // 一句话结论
  s.addText('潮流人群 + 早期采用者为主力，「显瘦 + 优雅 + 甜美」是服饰心智三条主线', {
    x: 0.6, y: 1.15, w: 12.1, h: 0.6, fontSize: 16, fontFace: 'PingFang SC',
    color: t.primary, bold: true
  });

  // 三栏：左论点（16pt bold）+ 中/右两图表
  // 左：论点 + 关键数字卡片
  s.addShape('rect', { x: 0.6, y: 1.95, w: 3.6, h: 4.3, fill: { color: t.light }, line: { type: 'none' } });
  s.addShape('rect', { x: 0.6, y: 1.95, w: 0.08, h: 4.3, fill: { color: t.primary }, line: { type: 'none' } });

  s.addText('服饰心智要点', {
    x: 0.85, y: 2.1, w: 3.3, h: 0.4, fontSize: 16, fontFace: 'PingFang SC',
    color: t.ink, bold: true
  });
  s.addText('APPAREL MINDSET', {
    x: 0.85, y: 2.55, w: 3.3, h: 0.25, fontSize: 9, fontFace: 'Arial',
    color: t.muted, charSpacing: 3
  });

  // 关键数字 1
  s.addShape('rect', { x: 0.85, y: 3.0, w: 3.3, h: 0.04, fill: { color: t.primary }, line: { type: 'none' } });
  s.addText('36.62%', {
    x: 0.85, y: 3.1, w: 3.3, h: 0.5, fontSize: 28, fontFace: 'Arial',
    color: t.primary, bold: true
  });
  s.addText('潮流人群 / 大服饰策略人群', {
    x: 0.85, y: 3.6, w: 3.3, h: 0.3, fontSize: 10, fontFace: 'PingFang SC',
    color: t.muted
  });

  // 关键数字 2
  s.addText('63.56%', {
    x: 0.85, y: 4.05, w: 3.3, h: 0.5, fontSize: 28, fontFace: 'Arial',
    color: t.accent1, bold: true
  });
  s.addText('早期采用者+引领者 / 时尚度', {
    x: 0.85, y: 4.55, w: 3.3, h: 0.3, fontSize: 10, fontFace: 'PingFang SC',
    color: t.muted
  });
  // calc: 33.31+30.25 = 63.56

  // 关键数字 3
  s.addText('显瘦 / 优雅 / 甜美', {
    x: 0.85, y: 5.0, w: 3.3, h: 0.4, fontSize: 14, fontFace: 'PingFang SC',
    color: t.ink, bold: true
  });
  s.addText('服饰需求 AI 标签 Top3 主线', {
    x: 0.85, y: 5.4, w: 3.3, h: 0.3, fontSize: 10, fontFace: 'PingFang SC',
    color: t.muted
  });
  s.addText('AI Top3 合计：9.46 + 9.24 + 7.06 = 25.76%', // calc: 9.46+9.24+7.06 = 25.76
  {
    x: 0.85, y: 5.7, w: 3.3, h: 0.3, fontSize: 9.5, fontFace: 'PingFang SC',
    color: t.muted, italic: true
  });

  // 中图：大服饰策略人群（甜甜圈）
  s.addText('大服饰策略人群  APPAREL SEGMENT', {
    x: 4.4, y: 2.0, w: 4.3, h: 0.3, fontSize: 11, fontFace: 'PingFang SC',
    color: t.accent1, bold: true, charSpacing: 2
  });
  s.addChart(pptx.charts.BAR, [
    { name: '占比', labels: ['潮流人群', '大众实用', '品质生活', '低价有颜', '低价实惠', '高阶时尚'], values: [36.62, 27.96, 10.13, 10.79, 9.13, 5.37] }
  ], {
    x: 4.4, y: 2.35, w: 4.3, h: 3.95,
    barDir: 'bar', barGapWidthPct: 30,
    chartColors: [t.primary],
    catAxisLabelFontSize: 9, catAxisLabelFontFace: 'PingFang SC', catAxisLabelColor: t.muted,
    valAxisLabelFontSize: 8, valAxisLabelFontFace: 'Arial', valAxisLabelColor: t.muted,
    showValue: true, dataLabelFontSize: 9, dataLabelColor: t.ink, dataLabelFormatCode: '0.0"%"',
    showLegend: false, catAxisOrderReverse: true, valAxisMaxVal: 40
  });

  // 右图：服饰需求特征 Top 8（柱状，AI 标签）
  s.addText('服饰需求特征 Top 8  AI APPAREL TAGS', {
    x: 8.85, y: 2.0, w: 4.0, h: 0.3, fontSize: 11, fontFace: 'PingFang SC',
    color: t.accent1, bold: true, charSpacing: 2
  });
  s.addChart(pptx.charts.BAR, [
    { name: '占比', labels: ['优雅显瘦兼顾者', '多元风格显瘦派', '甜美显瘦专家', '显瘦效果追求者', '优雅甜美平衡派', '慵懒松弛舒适派', '慵懒显瘦主义者', '大气简约商务男'], values: [9.46, 9.24, 7.06, 5.58, 5.58, 5.51, 5.26, 5.03] }
  ], {
    x: 8.85, y: 2.35, w: 4.0, h: 3.95,
    barDir: 'bar', barGapWidthPct: 25,
    chartColors: [t.accent1],
    catAxisLabelFontSize: 8, catAxisLabelFontFace: 'PingFang SC', catAxisLabelColor: t.muted,
    valAxisLabelFontSize: 8, valAxisLabelFontFace: 'Arial', valAxisLabelColor: t.muted,
    showValue: true, dataLabelFontSize: 8, dataLabelColor: t.ink, dataLabelFormatCode: '0.0"%"',
    showLegend: false, catAxisOrderReverse: true, valAxisMaxVal: 11
  });

  // So what 条
  s.addShape('rect', { x: 0.6, y: 6.45, w: 12.1, h: 0.5, fill: { color: t.light }, line: { type: 'none' } });
  s.addText('启示：内容应同时打「潮流 + 早期采用 + 显瘦/优雅/甜美」三组心智——上新节奏与营销话术同步对齐', {
    x: 0.85, y: 6.45, w: 11.5, h: 0.5, fontSize: 12, fontFace: 'PingFang SC',
    color: t.primary, bold: true, valign: 'middle'
  });

  // 数据来源脚注
  s.addText('数据来源：26年8月森马天猫官旗.md（标签类型：大服饰策略人群 / 大服饰时尚度分层 / AI 标签_服饰需求特征）', {
    x: 0.6, y: 7.05, w: 12.1, h: 0.25, fontSize: 9, fontFace: 'PingFang SC',
    color: t.muted, italic: true
  });

  // 页码徽章
  s.addShape('ellipse', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fill: { color: t.accent2 }, line: { type: 'none' } });
  s.addText('08', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fontSize: 10, fontFace: 'Arial', color: 'FFFFFF', align: 'center', valign: 'middle' });

  return s;
}
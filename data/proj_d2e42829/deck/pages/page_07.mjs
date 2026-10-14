// sources: 26年8月森马天猫官旗.md
// headline: L3 主力 + 高折扣敏感 56.13% + 中高端手机偏好，呈现「想买敢买但要看价格」的心智结构
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
  s.addText('03  /  购买力与价格心智', {
    x: 0.85, y: 0.6, w: 8, h: 0.4, fontSize: 11, fontFace: 'PingFang SC',
    color: t.muted, charSpacing: 3, bold: true
  });
  s.addText('SEMIR', {
    x: 11.4, y: 0.6, w: 1.6, h: 0.4, fontSize: 10, fontFace: 'Arial',
    color: t.primary, bold: true, align: 'right', charSpacing: 4
  });

  // 一句话结论
  s.addText('L3 主力 + 高折扣敏感 56.13% + 中高端手机偏好，呈现「想买敢买但要看价格」的心智结构', {
    x: 0.6, y: 1.15, w: 12.1, h: 0.7, fontSize: 16, fontFace: 'PingFang SC',
    color: t.primary, bold: true
  });

  // 2×2 图表网格
  // 图 1：购买力 L 段（左上，柱状）
  const c1x = 0.6, c1y = 1.95, c1w = 6.0, c1h = 2.2;
  s.addShape('rect', { x: c1x, y: c1y, w: c1w, h: c1h, fill: { color: t.light }, line: { type: 'none' } });
  s.addShape('rect', { x: c1x, y: c1y, w: 0.08, h: c1h, fill: { color: t.primary }, line: { type: 'none' } });
  s.addText('预测购买力  PURCHASING POWER', {
    x: c1x + 0.25, y: c1y + 0.1, w: c1w - 0.4, h: 0.3, fontSize: 11, fontFace: 'PingFang SC',
    color: t.accent1, bold: true, charSpacing: 2
  });
  s.addChart(pptx.charts.BAR, [
    { name: '占比', labels: ['L5（高）', 'L4', 'L3（主力）', 'L2', 'L1（低）'], values: [14.48, 27.15, 29.3, 21.38, 7.69] }
  ], {
    x: c1x + 0.15, y: c1y + 0.4, w: c1w - 0.3, h: c1h - 0.5,
    barDir: 'col', barGapWidthPct: 35,
    chartColors: [t.primary],
    catAxisLabelFontSize: 9, catAxisLabelFontFace: 'PingFang SC', catAxisLabelColor: t.muted,
    valAxisLabelFontSize: 9, valAxisLabelFontFace: 'Arial', valAxisLabelColor: t.muted,
    showValue: true, dataLabelFontSize: 9, dataLabelColor: t.ink, dataLabelFormatCode: '0.0"%"',
    showLegend: false, valAxisMaxVal: 35
  });

  // 图 2：折扣敏感度（右上）
  const c2x = 6.75, c2y = 1.95, c2w = 5.95, c2h = 2.2;
  s.addShape('rect', { x: c2x, y: c2y, w: c2w, h: c2h, fill: { color: t.light }, line: { type: 'none' } });
  s.addShape('rect', { x: c2x, y: c2y, w: 0.08, h: c2h, fill: { color: t.primary }, line: { type: 'none' } });
  s.addText('折扣敏感度  DISCOUNT SENSITIVITY', {
    x: c2x + 0.25, y: c2y + 0.1, w: c2w - 0.4, h: 0.3, fontSize: 11, fontFace: 'PingFang SC',
    color: t.accent1, bold: true, charSpacing: 2
  });
  s.addChart(pptx.charts.DOUGHNUT, [
    { name: '折扣敏感度', labels: ['高 56.13%', '中 29.56%', '低 14.31%'], values: [56.13, 29.56, 14.31] }
  ], {
    x: c2x + 0.15, y: c2y + 0.4, w: c2w - 0.3, h: c2h - 0.5,
    chartColors: [t.primary, t.accent1, t.accent2],
    showLegend: true, legendPos: 'r', legendFontSize: 10, legendFontFace: 'PingFang SC', legendColor: t.ink,
    showValue: false, holeSize: 50
  });

  // 图 3：月均消费（左下）
  const c3x = 0.6, c3y = 4.30, c3w = 6.0, c3h = 2.2;
  s.addShape('rect', { x: c3x, y: c3y, w: c3w, h: c3h, fill: { color: t.light }, line: { type: 'none' } });
  s.addShape('rect', { x: c3x, y: c3y, w: 0.08, h: c3h, fill: { color: t.primary }, line: { type: 'none' } });
  s.addText('月均消费金额  MONTHLY SPEND', {
    x: c3x + 0.25, y: c3y + 0.1, w: c3w - 0.4, h: 0.3, fontSize: 11, fontFace: 'PingFang SC',
    color: t.accent1, bold: true, charSpacing: 2
  });
  s.addChart(pptx.charts.BAR, [
    { name: '占比', labels: ['0-499', '500-999', '1000-1499', '1500-1999', '2000-2999', '3000-5999', '6000-10000', '≥10000'], values: [18.88, 16.69, 12.65, 9.67, 13.57, 17.49, 6.64, 4.41] }
  ], {
    x: c3x + 0.15, y: c3y + 0.4, w: c3w - 0.3, h: c3h - 0.5,
    barDir: 'col', barGapWidthPct: 30,
    chartColors: [t.accent1],
    catAxisLabelFontSize: 8, catAxisLabelFontFace: 'Arial', catAxisLabelColor: t.muted,
    valAxisLabelFontSize: 8, valAxisLabelFontFace: 'Arial', valAxisLabelColor: t.muted,
    showValue: true, dataLabelFontSize: 8, dataLabelColor: t.ink, dataLabelFormatCode: '0.0"%"',
    showLegend: false, valAxisMaxVal: 22
  });

  // 图 4：手机价格段（右下）
  const c4x = 6.75, c4y = 4.30, c4w = 5.95, c4h = 2.2;
  s.addShape('rect', { x: c4x, y: c4y, w: c4w, h: c4h, fill: { color: t.light }, line: { type: 'none' } });
  s.addShape('rect', { x: c4x, y: c4y, w: 0.08, h: c4h, fill: { color: t.primary }, line: { type: 'none' } });
  s.addText('手机价格段偏好  MOBILE PRICE', {
    x: c4x + 0.25, y: c4y + 0.1, w: c4w - 0.4, h: 0.3, fontSize: 11, fontFace: 'PingFang SC',
    color: t.accent1, bold: true, charSpacing: 2
  });
  s.addChart(pptx.charts.BAR, [
    { name: '占比', labels: ['≤1100', '1100-2600', '2600-3000', '3000-5000', '5000-8000', '≥8000'], values: [7.6, 22.37, 5.7, 21.64, 25.58, 17.11] }
  ], {
    x: c4x + 0.15, y: c4y + 0.4, w: c4w - 0.3, h: c4h - 0.5,
    barDir: 'col', barGapWidthPct: 30,
    chartColors: [t.primary],
    catAxisLabelFontSize: 8, catAxisLabelFontFace: 'Arial', catAxisLabelColor: t.muted,
    valAxisLabelFontSize: 8, valAxisLabelFontFace: 'Arial', valAxisLabelColor: t.muted,
    showValue: true, dataLabelFontSize: 8, dataLabelColor: t.ink, dataLabelFormatCode: '0.0"%"',
    showLegend: false, valAxisMaxVal: 30
  });

  // So what 条
  s.addShape('rect', { x: 0.6, y: 6.65, w: 12.1, h: 0.4, fill: { color: t.light }, line: { type: 'none' } });
  s.addText('启示：价格力是核心竞争力——主力人群有消费能力但对折扣高度敏感，需以「价值感叙事 + 节点促销」驱动转化', {
    x: 0.85, y: 6.65, w: 11.5, h: 0.4, fontSize: 11.5, fontFace: 'PingFang SC',
    color: t.primary, bold: true, valign: 'middle'
  });

  // 数据来源脚注
  s.addText('数据来源：26年8月森马天猫官旗.md（标签类型：预测购买力 / 月均消费金额 / 折扣敏感度 / 手机价格段偏好）', {
    x: 0.6, y: 7.15, w: 12.1, h: 0.25, fontSize: 9, fontFace: 'PingFang SC',
    color: t.muted, italic: true
  });

  // 页码徽章
  s.addShape('ellipse', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fill: { color: t.accent2 }, line: { type: 'none' } });
  s.addText('07', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fontSize: 10, fontFace: 'Arial', color: 'FFFFFF', align: 'center', valign: 'middle' });

  return s;
}
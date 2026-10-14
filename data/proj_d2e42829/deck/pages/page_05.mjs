// sources: 26年8月森马天猫官旗.md
// headline: 基础人口学显示女性 + 25-34 岁 + 新一线城市构成核心客群基本盘
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
  s.addText('01  /  基础人口学', {
    x: 0.85, y: 0.6, w: 8, h: 0.4, fontSize: 11, fontFace: 'PingFang SC',
    color: t.muted, charSpacing: 3, bold: true
  });
  s.addText('SEMIR', {
    x: 11.4, y: 0.6, w: 1.6, h: 0.4, fontSize: 10, fontFace: 'Arial',
    color: t.primary, bold: true, align: 'right', charSpacing: 4
  });

  // 一句话结论
  s.addText('基础人口学显示女性 + 25-34 岁 + 新一线城市构成核心客群基本盘', // calc: 31.11+21.75 = 52.86
  {
    x: 0.6, y: 1.15, w: 12.1, h: 0.6, fontSize: 16, fontFace: 'PingFang SC',
    color: t.primary, bold: true
  });

  // 三图：性别饼 / 年龄柱 / 城市 Top10 柱
  // 图 1：性别饼（左）
  const pieX = 0.6, pieY = 2.05, pieW = 3.8, pieH = 3.3;
  s.addText('性别  GENDER', {
    x: pieX, y: pieY, w: pieW, h: 0.3, fontSize: 11, fontFace: 'PingFang SC',
    color: t.accent1, bold: true, charSpacing: 3
  });
  s.addChart(pptx.charts.DOUGHNUT, [
    { name: '性别', labels: ['女 75.4%', '男 24.6%'], values: [75.4, 24.6] }
  ], {
    x: pieX, y: pieY + 0.35, w: pieW, h: pieH - 0.4,
    chartColors: [t.primary, t.accent1],
    showLegend: true, legendPos: 'b', legendFontSize: 10, legendFontFace: 'PingFang SC',
    legendColor: t.muted,
    showValue: false, dataLabelFontSize: 10, dataLabelColor: 'FFFFFF',
    holeSize: 55,
    showTitle: false
  });

  // 图 2：年龄柱状（中）
  const ageX = 4.7, ageY = 2.05, ageW = 4.6, ageH = 3.3;
  s.addText('年龄  AGE', {
    x: ageX, y: ageY, w: ageW, h: 0.3, fontSize: 11, fontFace: 'PingFang SC',
    color: t.accent1, bold: true, charSpacing: 3
  });
  const ageCats = ['[18,24]', '[25,29]', '[30,34]', '[35,39]', '[40,44]', '[45,49]', '[50,54]', '[55,59]', '≥60'];
  const ageVals = [17.43, 31.11, 21.75, 13.54, 7.25, 4.02, 2.3, 1.08, 1.52];
  // calc: 18-34 合计 17.43+31.11+21.75 = 70.29
  s.addChart(pptx.charts.BAR, [
    { name: '占比', labels: ageCats, values: ageVals }
  ], {
    x: ageX, y: ageY + 0.35, w: ageW, h: ageH - 0.4,
    barDir: 'col', barGapWidthPct: 35,
    chartColors: [t.primary],
    catAxisLabelFontSize: 9, catAxisLabelFontFace: 'Arial', catAxisLabelColor: t.muted,
    valAxisLabelFontSize: 9, valAxisLabelFontFace: 'Arial', valAxisLabelColor: t.muted,
    showValue: true, dataLabelFontSize: 9, dataLabelColor: t.ink, dataLabelFormatCode: '0.0"%"',
    dataLabelPosition: 'outEnd',
    showLegend: false,
    valAxisMaxVal: 35
  });

  // 图 3：城市 Top10 柱状（右）
  const cityX = 9.55, cityY = 2.05, cityW = 3.15, cityH = 3.3;
  s.addText('城市 Top 10  CITY', {
    x: cityX, y: cityY, w: cityW, h: 0.3, fontSize: 11, fontFace: 'PingFang SC',
    color: t.accent1, bold: true, charSpacing: 3
  });
  const cityCats = ['上海', '广州', '深圳', '杭州', '北京', '武汉', '重庆', '成都', '东莞', '西安'];
  const cityVals = [11.44, 10.47, 9.87, 6.46, 6.39, 5.49, 4.95, 4.69, 4.22, 3.98];
  s.addChart(pptx.charts.BAR, [
    { name: '占比', labels: cityCats, values: cityVals }
  ], {
    x: cityX, y: cityY + 0.35, w: cityW, h: cityH - 0.4,
    barDir: 'bar', barGapWidthPct: 30,
    chartColors: [t.accent1],
    catAxisLabelFontSize: 9, catAxisLabelFontFace: 'PingFang SC', catAxisLabelColor: t.muted,
    valAxisLabelFontSize: 9, valAxisLabelFontFace: 'Arial', valAxisLabelColor: t.muted,
    showValue: true, dataLabelFontSize: 9, dataLabelColor: t.ink, dataLabelFormatCode: '0.0"%"',
    dataLabelPosition: 'outEnd',
    showLegend: false,
    catAxisOrderReverse: true,
    valAxisMaxVal: 13
  });

  // So what 条
  s.addShape('rect', { x: 0.6, y: 5.55, w: 12.1, h: 0.6, fill: { color: t.light }, line: { type: 'none' } });
  s.addText('启示：「女性 × 25-34 岁 × 新一线/二线」三要素叠加，定义森马官旗的核心客群基本盘——内容、SKU、运营节奏均应围绕其设计', {
    x: 0.85, y: 5.55, w: 11.5, h: 0.6, fontSize: 12, fontFace: 'PingFang SC',
    color: t.primary, bold: true, valign: 'middle'
  });

  // 数据来源脚注
  s.addText('数据来源：26年8月森马天猫官旗.md（标签类型：预测性别 / 预测年龄 / 预测常驻城市，占比按类型归一化）', {
    x: 0.6, y: 6.25, w: 12.1, h: 0.3, fontSize: 9, fontFace: 'PingFang SC',
    color: t.muted, italic: true
  });

  // 页码徽章
  s.addShape('ellipse', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fill: { color: t.accent2 }, line: { type: 'none' } });
  s.addText('05', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fontSize: 10, fontFace: 'Arial', color: 'FFFFFF', align: 'center', valign: 'middle' });

  return s;
}
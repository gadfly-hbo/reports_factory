// P2 - 摘要页：对比框架与核心洞察
import pptxgen from 'pptxgenjs';

export function buildSlide(pptx) {
  const t = {
    primary: '263442',
    accent1: 'B44626',
    accent2: '5A6675',
    light:   'F7F6F3',
    ink:     '242830',
    muted:   '626773',
    line:    'DEDCD6'
  };

  const s = pptx.addSlide();
  s.background = { color: 'FFFFFF' };

  // 顶部标题区
  s.addShape('rect', {
    x: 0, y: 0, w: 13.33, h: 0.06,
    fill: { color: t.accent1 }, line: { color: t.accent1 }
  });
  s.addText('EXECUTIVE  SUMMARY', {
    x: 0.6, y: 0.4, w: 6.0, h: 0.3,
    fontSize: 10, fontFace: 'Arial',
    color: t.accent1, charSpacing: 6, bold: true
  });
  s.addText('对比框架与核心洞察', {
    x: 0.6, y: 0.75, w: 8.0, h: 0.6,
    fontSize: 26, fontFace: 'Microsoft YaHei',
    color: t.primary, bold: true
  });
  s.addText('基于 2025.09 与 2026.09 两期成交人群画像数据，提炼 5 条关键变化结论', {
    x: 0.6, y: 1.35, w: 11.5, h: 0.35,
    fontSize: 12, fontFace: 'Microsoft YaHei',
    color: t.muted
  });

  // 顶部 4 张 KPI 概览卡
  const kpis = [
    { label: '女性占比',         now: '85.87%', delta: '+2.68pp' },
    { label: '24-30 岁主力占比',  now: '31.77%', delta: '+0.66pp' },
    { label: 'GenZ 群体占比',     now: '15.82%', delta: '+3.84pp' },
    { label: '抖音时尚兴趣',     now: '76.07%', delta: '+2.81pp' }
  ];
  const cardW = 2.95, cardH = 1.4, cardY = 1.95, gap = 0.18;
  const startX = 0.6;
  kpis.forEach((k, i) => {
    const x = startX + i * (cardW + gap);
    s.addShape('rect', {
      x, y: cardY, w: cardW, h: cardH,
      fill: { color: t.light }, line: { color: t.line, width: 0.5 }
    });
    s.addShape('rect', {
      x, y: cardY, w: 0.08, h: cardH,
      fill: { color: t.accent1 }, line: { color: t.accent1 }
    });
    s.addText(k.label, {
      x: x + 0.22, y: cardY + 0.15, w: cardW - 0.3, h: 0.3,
      fontSize: 11, fontFace: 'Microsoft YaHei', color: t.muted
    });
    s.addText(k.now, {
      x: x + 0.22, y: cardY + 0.45, w: cardW - 0.3, h: 0.55,
      fontSize: 28, fontFace: 'Arial', color: t.primary, bold: true
    });
    s.addText(k.delta, {
      x: x + 0.22, y: cardY + 1.0, w: cardW - 0.3, h: 0.3,
      fontSize: 12, fontFace: 'Arial', color: t.accent1, bold: true
    });
  });

  // 5 条洞察列表
  const insights = [
    { idx: '01', title: '女性占比进一步上升至 85.87%', desc: '同比 +2.68pp，男士成交占比由 16.81% 收窄至 14.13%' },
    { idx: '02', title: '主力人群仍为 24-30 岁（31.77%）', desc: '20-23 岁年轻段占比提升 2.87pp，年轻化趋势延续' },
    { idx: '03', title: '山东、河南占比反超浙江、广东',     desc: '山东 +0.78pp、河南 +0.85pp，珠三角优势收窄' },
    { idx: '04', title: 'GenZ 群体占比跃升 3.84pp',     desc: '精致妈妈微降 0.46pp，结构由「妈妈主导」转向「年轻 + 妈妈」双核' },
    { idx: '05', title: '抖音时尚 / 美妆品类同步上扬',     desc: '时尚视频兴趣 +2.81pp、彩妆香水成交 +3.76pp' }
  ];
  const itemY0 = 3.65;
  const itemH = 0.62;
  insights.forEach((it, i) => {
    const y = itemY0 + i * itemH;
    s.addText(it.idx, {
      x: 0.6, y, w: 0.55, h: itemH,
      fontSize: 18, fontFace: 'Arial', color: t.accent1, bold: true
    });
    s.addShape('rect', {
      x: 1.2, y: y + 0.1, w: 0.04, h: itemH - 0.2,
      fill: { color: t.line }, line: { color: t.line }
    });
    s.addText(it.title, {
      x: 1.4, y: y + 0.04, w: 6.4, h: 0.32,
      fontSize: 13, fontFace: 'Microsoft YaHei', color: t.ink, bold: true
    });
    s.addText(it.desc, {
      x: 1.4, y: y + 0.32, w: 11.0, h: 0.28,
      fontSize: 11, fontFace: 'Microsoft YaHei', color: t.muted
    });
  });

  // 右下角数据范围卡片
  s.addShape('rect', {
    x: 8.3, y: 4.55, w: 4.4, h: 2.0,
    fill: { color: t.primary }, line: { color: t.primary }
  });
  s.addText('对比口径', {
    x: 8.5, y: 4.7, w: 4.0, h: 0.3,
    fontSize: 10, fontFace: 'Arial', color: t.accent2, charSpacing: 4, bold: true
  });
  s.addText('森马品牌成交人群画像', {
    x: 8.5, y: 4.95, w: 4.0, h: 0.35,
    fontSize: 14, fontFace: 'Microsoft YaHei', color: 'FFFFFF', bold: true
  });
  s.addText([
    { text: '周期A  ', options: { color: 'DEDCD6', fontSize: 10 } },
    { text: '2025 年 9 月\n', options: { color: 'FFFFFF', fontSize: 12, bold: true, breakLine: true } },
    { text: '周期B  ', options: { color: 'DEDCD6', fontSize: 10 } },
    { text: '2026 年 9 月\n', options: { color: 'FFFFFF', fontSize: 12, bold: true, breakLine: true } },
    { text: '维度  ', options: { color: 'DEDCD6', fontSize: 10 } },
    { text: '性别、年龄、地域、消费群体', options: { color: 'FFFFFF', fontSize: 11 } }
  ], {
    x: 8.5, y: 5.4, w: 4.0, h: 1.4,
    fontFace: 'Microsoft YaHei', valign: 'top', paraSpaceAfter: 6
  });

  // 页码徽章
  s.addShape('ellipse', {
    x: 12.55, y: 6.95, w: 0.38, h: 0.38,
    fill: { color: t.accent1 }, line: { color: t.accent1 }
  });
  s.addText('02', {
    x: 12.55, y: 6.95, w: 0.38, h: 0.38,
    fontSize: 10, color: 'FFFFFF', align: 'center', bold: true
  });

  return s;
}
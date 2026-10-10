// P5 - 八大消费群体对比 + 结论建议
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
  s.addText('SECTION  ·  CONSUMER GROUPS  &  TAKEAWAYS', {
    x: 0.6, y: 0.4, w: 8.0, h: 0.3,
    fontSize: 10, fontFace: 'Arial',
    color: t.accent1, charSpacing: 6, bold: true
  });
  s.addText('八大消费群体：GenZ 占比跃升 3.84pp，精致妈妈小幅回调', {
    x: 0.6, y: 0.75, w: 12.5, h: 0.55,
    fontSize: 22, fontFace: 'Microsoft YaHei',
    color: t.primary, bold: true
  });

  // ===== 八大消费群体对比 =====
  // 按 26.09 占比降序
  const groups = [
    { name: '小镇青年',   a25: '23.43%', a26: '23.60%', delta: '+0.17', tgi26: '146.4' },
    { name: '精致妈妈',   a25: '21.36%', a26: '20.90%', delta: '-0.46', tgi26: '766.8', key: true },
    { name: '新锐白领',   a25: '18.67%', a26: '18.23%', delta: '-0.44', tgi26: '252.9' },
    { name: 'GenZ',       a25: '11.98%', a26: '15.82%', delta: '+3.84', tgi26: '135.3', key: true },
    { name: '都市蓝领',   a25: '12.88%', a26: '11.39%', delta: '-1.49', tgi26: '101.4' },
    { name: '资深中产',   a25: '6.28%',  a26: '5.50%',  delta: '-0.78', tgi26: '146.2' },
    { name: '小镇中老年', a25: '3.71%',  a26: '3.19%',  delta: '-0.52', tgi26: '25.6' },
    { name: '都市银发',   a25: '1.72%',  a26: '1.38%',  delta: '-0.34', tgi26: '9.1' }
  ];

  const tableX = 0.6, tableY = 1.7;
  const colName  = tableX;
  const colA25   = tableX + 1.85;
  const colA26   = tableX + 3.5;
  const colDelta = tableX + 5.2;
  const colTgi   = tableX + 6.7;
  const colBar   = tableX + 8.3;

  // 表头
  s.addShape('rect', {
    x: tableX, y: tableY, w: 12.1, h: 0.38,
    fill: { color: t.primary }, line: { color: t.primary }
  });
  const heads = [
    { x: colName,  w: 1.75, t: '消费群体' },
    { x: colA25,   w: 1.6,  t: '2025.09' },
    { x: colA26,   w: 1.6,  t: '2026.09' },
    { x: colDelta, w: 1.4,  t: 'YoY Δ' },
    { x: colTgi,   w: 1.5,  t: 'TGI 26.09' },
    { x: colBar,   w: 4.4,  t: '26.09 占比可视化' }
  ];
  heads.forEach(h => {
    s.addText(h.t, {
      x: h.x + 0.1, y: tableY, w: h.w - 0.1, h: 0.38,
      fontSize: 10, fontFace: 'Arial', color: 'FFFFFF', bold: true,
      align: (h.t === '消费群体' || h.t === '26.09 占比可视化') ? 'left' : 'center',
      valign: 'middle', charSpacing: 2
    });
  });

  const rowH = 0.42;
  groups.forEach((g, i) => {
    const y = tableY + 0.38 + i * rowH;
    if (i % 2 === 0) {
      s.addShape('rect', {
        x: tableX, y, w: 12.1, h: rowH,
        fill: { color: t.light }, line: { color: t.light }
      });
    }
    if (g.key) {
      s.addShape('rect', {
        x: tableX, y, w: 0.06, h: rowH,
        fill: { color: t.accent1 }, line: { color: t.accent1 }
      });
    }
    s.addText(g.name, {
      x: colName + 0.15, y, w: 1.7, h: rowH,
      fontSize: 13, fontFace: 'Microsoft YaHei',
      color: g.key ? t.accent1 : t.ink,
      bold: g.key, valign: 'middle'
    });
    s.addText(g.a25, {
      x: colA25 + 0.1, y, w: 1.5, h: rowH,
      fontSize: 12, fontFace: 'Arial', color: t.muted, align: 'center', valign: 'middle'
    });
    s.addText(g.a26, {
      x: colA26 + 0.1, y, w: 1.5, h: rowH,
      fontSize: 13, fontFace: 'Arial', color: t.primary, bold: true, align: 'center', valign: 'middle'
    });
    const dColor = g.delta.startsWith('+') ? t.accent1 : t.primary;
    s.addText(g.delta + 'pp', {
      x: colDelta + 0.1, y, w: 1.3, h: rowH,
      fontSize: 12, fontFace: 'Arial', color: dColor, bold: true, align: 'center', valign: 'middle'
    });
    s.addText(g.tgi26, {
      x: colTgi + 0.1, y, w: 1.4, h: rowH,
      fontSize: 11, fontFace: 'Arial', color: t.muted, align: 'center', valign: 'middle'
    });
    // 26.09 可视化条
    const num = parseFloat(g.a26);
    const maxNum = 23.60;
    const barLen = (num / maxNum) * 3.6;
    const barColor = g.key ? t.accent1 : t.primary;
    s.addShape('rect', {
      x: colBar, y: y + 0.13, w: barLen, h: 0.16,
      fill: { color: barColor }, line: { color: barColor }
    });
  });

  // ===== 底部：建议条 =====
  const recoY = 5.85;
  const recoW = 6.0;
  // 核心结论
  s.addShape('rect', {
    x: 0.6, y: recoY, w: recoW, h: 1.45,
    fill: { color: t.primary }, line: { color: t.primary }
  });
  s.addText('CORE  TAKEAWAYS', {
    x: 0.8, y: recoY + 0.1, w: 4.0, h: 0.25,
    fontSize: 9, fontFace: 'Arial', color: t.accent2, charSpacing: 4, bold: true
  });
  s.addText('人群年轻化  ·  品类美妆化  ·  内容时尚化', {
    x: 0.8, y: recoY + 0.32, w: 5.6, h: 0.4,
    fontSize: 15, fontFace: 'Microsoft YaHei', color: 'FFFFFF', bold: true
  });
  s.addText([
    { text: '·  ', options: { color: t.accent1, fontSize: 11, bold: true } },
    { text: '成交人群从「妈妈主导」转向「年轻 + 妈妈」双核\n', options: { color: 'FFFFFF', fontSize: 11, breakLine: true } },
    { text: '·  ', options: { color: t.accent1, fontSize: 11, bold: true } },
    { text: 'GenZ 增量与女性主导力同步提升\n', options: { color: 'FFFFFF', fontSize: 11, breakLine: true } },
    { text: '·  ', options: { color: t.accent1, fontSize: 11, bold: true } },
    { text: '中部省份 + 美妆品类是新的增量组合', options: { color: 'FFFFFF', fontSize: 11 } }
  ], {
    x: 0.8, y: recoY + 0.7, w: 5.6, h: 0.8,
    fontFace: 'Microsoft YaHei', valign: 'top', paraSpaceAfter: 2
  });

  // 行动建议
  s.addShape('rect', {
    x: 6.7, y: recoY, w: recoW, h: 1.45,
    fill: { color: t.light }, line: { color: t.line, width: 0.5 }
  });
  s.addShape('rect', {
    x: 6.7, y: recoY, w: 0.06, h: 1.45,
    fill: { color: t.accent1 }, line: { color: t.accent1 }
  });
  s.addText('RECOMMENDED ACTIONS', {
    x: 6.9, y: recoY + 0.1, w: 5.0, h: 0.25,
    fontSize: 9, fontFace: 'Arial', color: t.accent1, charSpacing: 4, bold: true
  });
  s.addText('四条行动建议', {
    x: 6.9, y: recoY + 0.32, w: 5.0, h: 0.35,
    fontSize: 14, fontFace: 'Microsoft YaHei', color: t.primary, bold: true
  });
  s.addText([
    { text: '① ', options: { color: t.accent1, fontSize: 10, bold: true } },
    { text: '内容侧增加 GenZ 与时尚向比重\n', options: { color: t.ink, fontSize: 10, breakLine: true } },
    { text: '② ', options: { color: t.accent1, fontSize: 10, bold: true } },
    { text: '品类端加码女装/彩妆/美妆护肤\n', options: { color: t.ink, fontSize: 10, breakLine: true } },
    { text: '③ ', options: { color: t.accent1, fontSize: 10, bold: true } },
    { text: '地域预算向中部省份倾斜\n', options: { color: t.ink, fontSize: 10, breakLine: true } },
    { text: '④ ', options: { color: t.accent1, fontSize: 10, bold: true } },
    { text: '保留精致妈妈心智沟通不缩减', options: { color: t.ink, fontSize: 10 } }
  ], {
    x: 6.9, y: recoY + 0.65, w: 5.7, h: 0.85,
    fontFace: 'Microsoft YaHei', valign: 'top', paraSpaceAfter: 1
  });

  // 页码徽章
  s.addShape('ellipse', {
    x: 12.55, y: 7.32, w: 0.38, h: 0.38,
    fill: { color: t.accent1 }, line: { color: t.accent1 }
  });
  s.addText('05', {
    x: 12.55, y: 7.32, w: 0.38, h: 0.38,
    fontSize: 10, color: 'FFFFFF', align: 'center', bold: true
  });

  return s;
}
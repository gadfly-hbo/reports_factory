// P4 - 地域结构对比：Top 10 省份
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
  s.addText('SECTION  ·  GEOGRAPHY', {
    x: 0.6, y: 0.4, w: 6.0, h: 0.3,
    fontSize: 10, fontFace: 'Arial',
    color: t.accent1, charSpacing: 6, bold: true
  });
  s.addText('地域结构微调：山东、河南反超，浙江、广东下沉', {
    x: 0.6, y: 0.75, w: 12.5, h: 0.55,
    fontSize: 22, fontFace: 'Microsoft YaHei',
    color: t.primary, bold: true
  });
  s.addText('两期 Top 10 省份占比与排名变化 · 数据口径：成交用户地域分布', {
    x: 0.6, y: 1.32, w: 12.0, h: 0.3,
    fontSize: 11, fontFace: 'Microsoft YaHei', color: t.muted
  });

  // ===== 双栏表格 =====
  const tableX = 0.6, tableY = 1.85;
  const colRank = tableX;
  const colProv = tableX + 0.6;
  const colA25 = tableX + 2.6;
  const colA26 = tableX + 4.4;
  const colDelta = tableX + 6.3;
  const colTgi = tableX + 7.7;
  const colBar = tableX + 9.4;

  // 表头
  s.addShape('rect', {
    x: colRank, y: tableY, w: 12.1, h: 0.4,
    fill: { color: t.primary }, line: { color: t.primary }
  });
  const headers = [
    { x: colRank,    w: 0.5,  t: '#' },
    { x: colProv,    w: 1.9,  t: '省份' },
    { x: colA25,     w: 1.7,  t: '2025.09' },
    { x: colA26,     w: 1.7,  t: '2026.09' },
    { x: colDelta,   w: 1.3,  t: 'YoY Δ' },
    { x: colTgi,     w: 1.5,  t: 'TGI 26.09' },
    { x: colBar,     w: 4.4,  t: '26.09 占比可视化' }
  ];
  headers.forEach(h => {
    s.addText(h.t, {
      x: h.x + 0.1, y: tableY, w: h.w - 0.1, h: 0.4,
      fontSize: 10, fontFace: 'Arial', color: 'FFFFFF', bold: true,
      align: (h.t === '省份' || h.t === '26.09 占比可视化') ? 'left' : 'center',
      valign: 'middle', charSpacing: 2
    });
  });

  // 排序规则：以 26.09 占比降序
  const rows = [
    { prov: '广东', r25: 1, a25: '10.45%', r26: 1, a26: '9.70%',  delta: '-0.75', tgi: '103.5',  max: 9.70 },
    { prov: '河南', r25: 2, a25: '7.22%',  r26: 2, a26: '8.07%',  delta: '+0.85', tgi: '149.6',  max: 8.07, up: true },
    { prov: '山东', r25: 5, a25: '6.72%',  r26: 3, a26: '7.50%',  delta: '+0.78', tgi: '133.7',  max: 7.50, up: true },
    { prov: '江苏', r25: 3, a25: '7.12%',  r26: 4, a26: '7.08%',  delta: '-0.04', tgi: '118.4',  max: 7.08 },
    { prov: '浙江', r25: 4, a25: '6.11%',  r26: 5, a26: '5.97%',  delta: '-0.14', tgi: '113.5',  max: 5.97 },
    { prov: '河北', r25: 6, a25: '5.03%',  r26: 6, a26: '5.49%',  delta: '+0.46', tgi: '133.6',  max: 5.49 },
    { prov: '四川', r25: 7, a25: '5.23%',  r26: 7, a26: '4.90%',  delta: '-0.33', tgi: '107.3',  max: 4.90 },
    { prov: '陕西', r25: 8, a25: '4.62%',  r26: 8, a26: '4.53%',  delta: '-0.09', tgi: '188.7',  max: 4.53 },
    { prov: '安徽', r25: 11, a25: '4.38%', r26: 9, a26: '4.49%',  delta: '+0.11', tgi: '136.6',  max: 4.49, up: true },
    { prov: '湖北', r25: 9, a25: '4.51%',  r26: 10, a26: '4.44%', delta: '-0.07', tgi: '138.9',  max: 4.44 }
  ];

  const rowH = 0.34;
  rows.forEach((r, i) => {
    const y = tableY + 0.4 + i * rowH;
    if (i % 2 === 0) {
      s.addShape('rect', {
        x: colRank, y, w: 12.1, h: rowH,
        fill: { color: t.light }, line: { color: t.light }
      });
    }
    // 排名
    s.addText(String(r.r26), {
      x: colRank + 0.05, y, w: 0.5, h: rowH,
      fontSize: 13, fontFace: 'Arial', color: t.primary, bold: true, align: 'center', valign: 'middle'
    });
    // 省份
    s.addText(r.prov, {
      x: colProv + 0.1, y, w: 1.8, h: rowH,
      fontSize: 13, fontFace: 'Microsoft YaHei', color: t.ink, bold: true, valign: 'middle'
    });
    // 25.09
    s.addText(r.a25, {
      x: colA25 + 0.1, y, w: 1.6, h: rowH,
      fontSize: 11, fontFace: 'Arial', color: t.muted, align: 'center', valign: 'middle'
    });
    // 26.09
    s.addText(r.a26, {
      x: colA26 + 0.1, y, w: 1.6, h: rowH,
      fontSize: 12, fontFace: 'Arial', color: t.primary, bold: true, align: 'center', valign: 'middle'
    });
    // YoY Δ
    const dColor = r.delta.startsWith('+') ? t.accent1 : t.primary;
    s.addText(r.delta + 'pp', {
      x: colDelta + 0.1, y, w: 1.2, h: rowH,
      fontSize: 11, fontFace: 'Arial', color: dColor, bold: true, align: 'center', valign: 'middle'
    });
    // TGI
    s.addText(r.tgi, {
      x: colTgi + 0.1, y, w: 1.4, h: rowH,
      fontSize: 11, fontFace: 'Arial', color: t.muted, align: 'center', valign: 'middle'
    });
    // 26.09 可视化条
    const num = parseFloat(r.a26);
    const maxNum = 10.45;
    const barLen = (num / maxNum) * 3.6;
    const barColor = r.up ? t.accent1 : t.primary;
    s.addShape('rect', {
      x: colBar, y: y + 0.1, w: barLen, h: 0.14,
      fill: { color: barColor }, line: { color: barColor }
    });
  });

  // 总结侧栏
  const sideX = 0.6, sideY = 5.85;
  // 卡片1：上升省份
  s.addShape('rect', {
    x: sideX, y: sideY, w: 6.0, h: 1.0,
    fill: { color: t.light }, line: { color: t.line, width: 0.5 }
  });
  s.addShape('rect', {
    x: sideX, y: sideY, w: 0.06, h: 1.0,
    fill: { color: t.accent1 }, line: { color: t.accent1 }
  });
  s.addText('占比上升 Top 3', {
    x: sideX + 0.2, y: sideY + 0.1, w: 5.6, h: 0.3,
    fontSize: 11, fontFace: 'Microsoft YaHei', color: t.muted, charSpacing: 2
  });
  s.addText('河南 +0.85pp  ·  山东 +0.78pp  ·  河北 +0.46pp', {
    x: sideX + 0.2, y: sideY + 0.4, w: 5.6, h: 0.5,
    fontSize: 15, fontFace: 'Microsoft YaHei', color: t.primary, bold: true
  });

  // 卡片2：退出 Top10
  s.addShape('rect', {
    x: sideX + 6.4, y: sideY, w: 6.0, h: 1.0,
    fill: { color: t.light }, line: { color: t.line, width: 0.5 }
  });
  s.addShape('rect', {
    x: sideX + 6.4, y: sideY, w: 0.06, h: 1.0,
    fill: { color: t.muted }, line: { color: t.muted }
  });
  s.addText('新进 / 退出 Top 10', {
    x: sideX + 6.6, y: sideY + 0.1, w: 5.6, h: 0.3,
    fontSize: 11, fontFace: 'Microsoft YaHei', color: t.muted, charSpacing: 2
  });
  s.addText('新进  安徽（4.49%）   退出  湖南（3.12%）', {
    x: sideX + 6.6, y: sideY + 0.4, w: 5.6, h: 0.5,
    fontSize: 13, fontFace: 'Microsoft YaHei', color: t.primary, bold: true
  });

  // 结论条
  s.addShape('rect', {
    x: 0.6, y: 7.0, w: 12.1, h: 0.32,
    fill: { color: t.primary }, line: { color: t.primary }
  });
  s.addText('洞察：成交重心由东南沿海向中部人口大省迁移，山东、河南人口红利进一步显现', {
    x: 0.7, y: 7.0, w: 12.0, h: 0.32,
    fontSize: 12, fontFace: 'Microsoft YaHei', color: 'FFFFFF', valign: 'middle'
  });

  // 页码徽章
  s.addShape('ellipse', {
    x: 12.55, y: 6.5, w: 0.38, h: 0.38,
    fill: { color: t.accent1 }, line: { color: t.accent1 }
  });
  s.addText('04', {
    x: 12.55, y: 6.5, w: 0.38, h: 0.38,
    fontSize: 10, color: 'FFFFFF', align: 'center', bold: true
  });

  return s;
}
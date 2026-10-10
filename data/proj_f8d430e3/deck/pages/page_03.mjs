// P3 - 性别年龄对比
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
  s.addText('SECTION  ·  GENDER  &  AGE', {
    x: 0.6, y: 0.4, w: 6.0, h: 0.3,
    fontSize: 10, fontFace: 'Arial',
    color: t.accent1, charSpacing: 6, bold: true
  });
  s.addText('女性占比进一步上升至 85.87%，主力人群仍为 24-30 岁', {
    x: 0.6, y: 0.75, w: 12.5, h: 0.55,
    fontSize: 22, fontFace: 'Microsoft YaHei',
    color: t.primary, bold: true
  });

  // ===== 性别对比 双栏 =====
  s.addText('性别结构', {
    x: 0.6, y: 1.5, w: 4.0, h: 0.3,
    fontSize: 14, fontFace: 'Microsoft YaHei',
    color: t.ink, bold: true
  });

  // 左栏 2025.09
  drawGenderColumn(s, t, 0.6, 1.9, '2025.09', '16.81%', '83.19%', t.muted);
  // 右栏 2026.09
  drawGenderColumn(s, t, 3.85, 1.9, '2026.09', '14.13%', '85.87%', t.accent1);

  // 性别变化箭头 / delta
  s.addShape('rect', {
    x: 6.95, y: 2.3, w: 0.04, h: 1.6,
    fill: { color: t.line }, line: { color: t.line }
  });
  s.addText('YoY Δ', {
    x: 7.1, y: 2.3, w: 1.2, h: 0.3,
    fontSize: 10, fontFace: 'Arial', color: t.muted, charSpacing: 4, bold: true
  });
  s.addText('女 +2.68pp', {
    x: 7.1, y: 2.65, w: 1.8, h: 0.35,
    fontSize: 16, fontFace: 'Arial', color: t.accent1, bold: true
  });
  s.addText('男 -2.68pp', {
    x: 7.1, y: 3.05, w: 1.8, h: 0.35,
    fontSize: 16, fontFace: 'Arial', color: t.primary, bold: true
  });
  s.addText('女性主导进一步强化', {
    x: 7.1, y: 3.5, w: 2.5, h: 0.4,
    fontSize: 11, fontFace: 'Microsoft YaHei', color: t.muted
  });

  // 性别比例小卡（右侧补充背景信息）
  s.addShape('rect', {
    x: 9.7, y: 2.3, w: 3.0, h: 1.6,
    fill: { color: t.light }, line: { color: t.line, width: 0.5 }
  });
  s.addShape('rect', {
    x: 9.7, y: 2.3, w: 0.06, h: 1.6,
    fill: { color: t.accent1 }, line: { color: t.accent1 }
  });
  s.addText('性别比 (男:女)', {
    x: 9.85, y: 2.4, w: 2.7, h: 0.3,
    fontSize: 11, fontFace: 'Microsoft YaHei', color: t.muted
  });
  s.addText('2025.09', {
    x: 9.85, y: 2.75, w: 1.3, h: 0.25,
    fontSize: 10, fontFace: 'Arial', color: t.muted
  });
  s.addText('1 : 4.95', {
    x: 9.85, y: 3.0, w: 2.6, h: 0.3,
    fontSize: 18, fontFace: 'Arial', color: t.primary, bold: true
  });
  s.addText('2026.09', {
    x: 9.85, y: 3.4, w: 1.3, h: 0.25,
    fontSize: 10, fontFace: 'Arial', color: t.muted
  });
  s.addText('1 : 6.08', {
    x: 9.85, y: 3.6, w: 2.6, h: 0.3,
    fontSize: 18, fontFace: 'Arial', color: t.accent1, bold: true
  });

  // ===== 年龄段对比 =====
  s.addShape('rect', {
    x: 0.6, y: 3.95, w: 12.1, h: 0.04,
    fill: { color: t.line }, line: { color: t.line }
  });
  s.addText('年龄段占比分布', {
    x: 0.6, y: 4.05, w: 6.0, h: 0.3,
    fontSize: 14, fontFace: 'Microsoft YaHei',
    color: t.ink, bold: true
  });

  // 年龄段表格（8 行）
  const ageRows = [
    { age: '18-19', a25: '1.13%',  a26: '2.57%',  delta: '+1.44' },
    { age: '20-23', a25: '10.34%', a26: '13.21%', delta: '+2.87' },
    { age: '24-30', a25: '31.11%', a26: '31.77%', delta: '+0.66', highlight: true },
    { age: '31-35', a25: '17.42%', a26: '16.98%', delta: '-0.44' },
    { age: '36-40', a25: '25.13%', a26: '22.65%', delta: '-2.48', highlight: true },
    { age: '41-45', a25: '7.53%',  a26: '6.66%',  delta: '-0.87' },
    { age: '46-50', a25: '4.45%',  a26: '3.87%',  delta: '-0.58' },
    { age: '51+',   a25: '2.90%',  a26: '2.29%',  delta: '-0.61' }
  ];
  const tableX = 0.6, tableY = 4.45;
  const colAgeX = tableX;
  const colA25X = tableX + 1.4;
  const colA26X = tableX + 3.4;
  const colDeltaX = tableX + 5.6;
  const barX = tableX + 7.2;
  const rowH = 0.26;
  const headH = 0.3;
  const dataStartY = tableY + headH;

  // 表头
  s.addText('年龄段', {
    x: colAgeX, y: tableY, w: 1.3, h: headH,
    fontSize: 10, fontFace: 'Microsoft YaHei', color: t.muted, bold: true, charSpacing: 2
  });
  s.addText('2025.09', {
    x: colA25X, y: tableY, w: 1.8, h: headH,
    fontSize: 10, fontFace: 'Arial', color: t.muted, bold: true, align: 'center'
  });
  s.addText('2026.09', {
    x: colA26X, y: tableY, w: 1.8, h: headH,
    fontSize: 10, fontFace: 'Arial', color: t.muted, bold: true, align: 'center'
  });
  s.addText('YoY Δ', {
    x: colDeltaX, y: tableY, w: 1.2, h: headH,
    fontSize: 10, fontFace: 'Arial', color: t.muted, bold: true, align: 'center'
  });
  s.addText('26.09 占比可视化', {
    x: barX, y: tableY, w: 5.5, h: headH,
    fontSize: 10, fontFace: 'Microsoft YaHei', color: t.muted, bold: true
  });

  ageRows.forEach((r, i) => {
    const y = dataStartY + i * rowH;
    if (i % 2 === 0) {
      s.addShape('rect', {
        x: tableX - 0.1, y: y - 0.02, w: 12.5, h: rowH,
        fill: { color: t.light }, line: { color: t.light }
      });
    }
    s.addText(r.age, {
      x: colAgeX, y, w: 1.3, h: rowH,
      fontSize: 12, fontFace: 'Arial', color: t.ink, bold: r.highlight
    });
    s.addText(r.a25, {
      x: colA25X, y, w: 1.8, h: rowH,
      fontSize: 12, fontFace: 'Arial', color: t.muted, align: 'center'
    });
    s.addText(r.a26, {
      x: colA26X, y, w: 1.8, h: rowH,
      fontSize: 12, fontFace: 'Arial', color: r.highlight ? t.accent1 : t.primary, bold: true, align: 'center'
    });
    const deltaColor = r.delta.startsWith('+') ? t.accent1 : t.primary;
    s.addText(r.delta + 'pp', {
      x: colDeltaX, y, w: 1.4, h: rowH,
      fontSize: 11, fontFace: 'Arial', color: deltaColor, bold: true, align: 'center'
    });

    // 26.09 可视化条
    const num = parseFloat(r.a26);
    const maxNum = 31.77;
    const barLen = (num / maxNum) * 4.8;
    const barColor = r.highlight ? t.accent1 : t.primary;
    s.addShape('rect', {
      x: barX, y: y + 0.07, w: barLen, h: 0.13,
      fill: { color: barColor }, line: { color: barColor }
    });
  });

  // 结论条（位于页面底部）
  s.addShape('rect', {
    x: 0.6, y: 6.95, w: 12.1, h: 0.35,
    fill: { color: t.primary }, line: { color: t.primary }
  });
  s.addText('洞察：成交人群进一步「年轻化 + 女性化」，20-23 岁年轻段是核心增量来源', {
    x: 0.7, y: 6.95, w: 12.0, h: 0.35,
    fontSize: 12, fontFace: 'Microsoft YaHei', color: 'FFFFFF', valign: 'middle'
  });

  // 页码徽章
  s.addShape('ellipse', {
    x: 12.55, y: 6.5, w: 0.38, h: 0.38,
    fill: { color: t.accent1 }, line: { color: t.accent1 }
  });
  s.addText('03', {
    x: 12.55, y: 6.5, w: 0.38, h: 0.38,
    fontSize: 10, color: 'FFFFFF', align: 'center', bold: true
  });

  return s;
}

function drawGenderColumn(s, t, x, y, label, malePct, femalePct, accentColor) {
  const colW = 3.1, colTop = y;
  // 周期标签
  s.addShape('rect', {
    x, y: colTop, w: colW, h: 0.4,
    fill: { color: t.primary }, line: { color: t.primary }
  });
  s.addText(label, {
    x, y: colTop, w: colW, h: 0.4,
    fontSize: 13, fontFace: 'Arial', color: 'FFFFFF', bold: true, align: 'center', valign: 'middle', charSpacing: 4
  });
  // 女性条（主，占据大头）
  const femNum = parseFloat(femalePct);
  const maleNum = parseFloat(malePct);
  s.addText('女性', {
    x: x + 0.2, y: colTop + 0.55, w: 1.0, h: 0.3,
    fontSize: 11, fontFace: 'Microsoft YaHei', color: t.muted
  });
  s.addText(femalePct, {
    x: x + 0.2, y: colTop + 0.85, w: colW - 0.4, h: 0.7,
    fontSize: 36, fontFace: 'Arial', color: accentColor, bold: true
  });
  // 女性进度条
  s.addShape('rect', {
    x: x + 0.2, y: colTop + 1.65, w: colW - 0.4, h: 0.18,
    fill: { color: t.line }, line: { color: t.line }
  });
  s.addShape('rect', {
    x: x + 0.2, y: colTop + 1.65, w: (colW - 0.4) * femNum / 100, h: 0.18,
    fill: { color: accentColor }, line: { color: accentColor }
  });

  // 男性条
  s.addText('男性', {
    x: x + 0.2, y: colTop + 1.95, w: 1.0, h: 0.3,
    fontSize: 11, fontFace: 'Microsoft YaHei', color: t.muted
  });
  s.addText(malePct, {
    x: x + 0.2, y: colTop + 2.2, w: colW - 0.4, h: 0.45,
    fontSize: 20, fontFace: 'Arial', color: t.primary, bold: true
  });
  s.addShape('rect', {
    x: x + 0.2, y: colTop + 2.65, w: colW - 0.4, h: 0.14,
    fill: { color: t.line }, line: { color: t.line }
  });
  s.addShape('rect', {
    x: x + 0.2, y: colTop + 2.65, w: (colW - 0.4) * maleNum / 100, h: 0.14,
    fill: { color: t.muted }, line: { color: t.muted }
  });
}
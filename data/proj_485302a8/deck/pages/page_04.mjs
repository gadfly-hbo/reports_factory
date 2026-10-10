// Page 04 / Content — 平台格局重塑：两超多强，视频号成最大变量
import pptxgen from 'pptxgenjs';

export function buildSlide(pptx) {
  const t = {
    primary: '263442', accent1: 'B44626', accent2: '5A6675',
    light: 'F7F6F3', ink: '242830', muted: '626773', line: 'DEDCD6',
  };

  const s = pptx.addSlide();
  s.background = { color: 'FFFFFF' };

  // 顶部小标
  s.addShape('rect', { x: 0.6, y: 0.55, w: 0.7, h: 0.06, fill: { color: t.accent1 } });
  s.addText('02  ·  PLATFORM  LANDSCAPE', {
    x: 0.6, y: 0.7, w: 8, h: 0.35,
    fontFace: 'Arial', fontSize: 10, color: t.accent2, bold: true, charSpacing: 4,
  });

  // 大标题
  s.addText('平台格局重塑：两超多强，视频号成最大变量', {
    x: 0.6, y: 1.1, w: 12, h: 0.7,
    fontFace: 'PingFang SC', fontSize: 26, color: t.primary, bold: true,
  });
  s.addText('内容电商 GMV 增速 30%+，抖音 4 万亿、直逼拼多多；视频号 DAU 逼近、增速最快', {
    x: 0.6, y: 1.82, w: 12, h: 0.4,
    fontFace: 'PingFang SC', fontSize: 13, color: t.accent2,
  });

  // ===== 左侧：六大平台对照表 =====
  const tableX = 0.6, tableY = 2.45, tableW = 7.95;
  const colW = [1.05, 1.55, 1.05, 1.4, 1.55, 1.35]; // 平台/MUA/同比/GMV/增速/标签
  const headers = ['平台', 'MAU', '同比', 'GMV', '增速 / 关键', '标签'];
  const rows = [
    ['淘宝',   '9.83–10 亿', '+3.7%',  '—',          '+4.2%',           '存量搜索稳态'],
    ['抖音',   '9.36–9.48 亿','+14.4%','4 万亿（估）','+46.3%',          '内容电商领跑'],
    ['拼多多', '7.08 亿',    '+0.9%',  '—',          '+32.7%',          '下沉 / 白牌'],
    ['京东',   '6.1 亿',     '+14.4%', '—',          '—',               '标品 + 即时'],
    ['快手',   '—',          '+3.7%',  '—',          '搜索 +119%',      '老铁 + 货架'],
    ['小红书', '—',          '+6.4%',  '1200–1400 亿','接近翻倍',       '决策上游'],
  ];

  // 表头底
  s.addShape('rect', {
    x: tableX, y: tableY, w: tableW, h: 0.42,
    fill: { color: t.primary }, line: { type: 'none' },
  });
  // 表头文字
  let xCursor = tableX;
  headers.forEach((h, i) => {
    s.addText(h, {
      x: xCursor + 0.08, y: tableY, w: colW[i] - 0.1, h: 0.42,
      fontFace: 'PingFang SC', fontSize: 11, color: 'FFFFFF', bold: true,
      valign: 'middle', align: i === 0 ? 'left' : 'center',
    });
    xCursor += colW[i];
  });

  // 数据行
  rows.forEach((row, r) => {
    const y = tableY + 0.42 + r * 0.42;
    // 交替行底色
    if (r % 2 === 0) {
      s.addShape('rect', {
        x: tableX, y, w: tableW, h: 0.42,
        fill: { color: t.light }, line: { type: 'none' },
      });
    }
    let xc = tableX;
    row.forEach((cell, i) => {
      // 增速列突出
      const isGrowth = i === 4;
      const isPlatform = i === 0;
      s.addText(cell, {
        x: xc + 0.08, y, w: colW[i] - 0.1, h: 0.42,
        fontFace: i === 0 || i === 5 ? 'PingFang SC' : 'Arial',
        fontSize: 10,
        color: isPlatform ? t.primary : (isGrowth ? t.accent1 : t.ink),
        bold: isPlatform || isGrowth,
        valign: 'middle',
        align: i === 0 ? 'left' : 'center',
      });
      xc += colW[i];
    });
    // 行底分割线
    s.addShape('rect', {
      x: tableX, y: y + 0.42, w: tableW, h: 0.005,
      fill: { color: t.line }, line: { type: 'none' },
    });
  });

  // 表外框
  s.addShape('rect', {
    x: tableX, y: tableY + 0.42 + rows.length * 0.42, w: tableW, h: 0.005,
    fill: { color: t.line }, line: { type: 'none' },
  });

  // 表脚注
  s.addText('口径：MAU 为 2025 年 9–10 月口径；GMV 增速为 2026Q1 同比；抖音 GMV 为媒体估算', {
    x: tableX, y: tableY + 0.42 + rows.length * 0.42 + 0.08, w: tableW, h: 0.3,
    fontFace: 'PingFang SC', fontSize: 9, color: t.muted,
  });

  // ===== 右侧：视频号高亮卡 =====
  const cx = 8.85, cy = 2.45, cw = 3.95, ch = 4.0;
  // 卡底（accent1 边条 + 主色底）
  s.addShape('rect', {
    x: cx, y: cy, w: cw, h: ch,
    fill: { color: t.primary }, line: { type: 'none' },
  });
  // 顶部 accent1 横条
  s.addShape('rect', {
    x: cx, y: cy, w: cw, h: 0.12,
    fill: { color: t.accent1 }, line: { type: 'none' },
  });

  // 小标
  s.addText('THE  GAME  CHANGER', {
    x: cx + 0.3, y: cy + 0.25, w: cw - 0.5, h: 0.3,
    fontFace: 'Arial', fontSize: 9, color: t.accent1, bold: true, charSpacing: 4,
  });
  // 标题
  s.addText('微信视频号 + 微信小店', {
    x: cx + 0.3, y: cy + 0.55, w: cw - 0.5, h: 0.45,
    fontFace: 'PingFang SC', fontSize: 18, color: 'FFFFFF', bold: true,
  });
  // 副
  s.addText('唯一公私域原生闭环生态', {
    x: cx + 0.3, y: cy + 1.0, w: cw - 0.5, h: 0.35,
    fontFace: 'PingFang SC', fontSize: 11, color: t.accent2,
  });

  // 三大数字
  const vstats = [
    { v: '8 亿',   k: '视频号 DAU（+45%）' },
    { v: '6000 亿', k: '电商 GMV（+225%）' },
    { v: '67%',    k: '45 岁以上用户占比' },
  ];
  vstats.forEach((v, i) => {
    const y = cy + 1.55 + i * 0.62;
    s.addText(v.v, {
      x: cx + 0.3, y, w: 1.7, h: 0.4,
      fontFace: 'Arial', fontSize: 22, color: 'FFFFFF', bold: true,
    });
    s.addText(v.k, {
      x: cx + 2.0, y, w: cw - 2.2, h: 0.5,
      fontFace: 'PingFang SC', fontSize: 9, color: t.accent2, valign: 'middle',
    });
  });

  // 增长飞轮 1 行
  s.addShape('rect', {
    x: cx + 0.3, y: cy + 3.45, w: cw - 0.6, h: 0.02,
    fill: { color: t.accent1 }, line: { type: 'none' },
  });
  s.addText('飞轮：公域获新 → 小店成交 → 私域沉淀 → 复购裂变', {
    x: cx + 0.3, y: cy + 3.5, w: cw - 0.5, h: 0.4,
    fontFace: 'PingFang SC', fontSize: 10, color: 'FFFFFF', valign: 'middle',
  });

  // 案例一行
  s.addText('鄂尔多斯超品日 3 天 1700 万、新客占比 88%', {
    x: cx + 0.3, y: cy + 3.78, w: cw - 0.5, h: 0.2,
    fontFace: 'PingFang SC', fontSize: 8, color: t.muted,
  });

  // 底部洞察条
  s.addShape('rect', {
    x: 0.6, y: 6.75, w: 12.13, h: 0.4,
    fill: { color: t.primary }, line: { type: 'none' },
  });
  s.addText('结论：抖音是公域内部全域经营样本，微信小店是跨平台公私域原生闭环样本——两者代表未来两年最值得布局的两个阵地。', {
    x: 0.7, y: 6.75, w: 12.0, h: 0.4,
    fontFace: 'PingFang SC', fontSize: 11, color: 'FFFFFF', valign: 'middle',
  });

  // 页码徽章
  s.addShape('ellipse', { x: 12.55, y: 7.22, w: 0.3, h: 0.3, fill: { color: t.accent1 } });
  s.addText('04', {
    x: 12.55, y: 7.22, w: 0.3, h: 0.3,
    fontFace: 'Arial', fontSize: 9, color: 'FFFFFF', align: 'center', valign: 'middle', bold: true,
  });

  return s;
}
// Page 03 / Metrics Overview — 大盘见顶：用户触顶、获客成本三年涨 63%
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
  s.addText('01  ·  TRAFFIC  OVERVIEW', {
    x: 0.6, y: 0.7, w: 8, h: 0.35,
    fontFace: 'Arial', fontSize: 10, color: t.accent2, bold: true, charSpacing: 4,
  });

  // 大标题
  s.addText('大盘见顶：从拉新红利到存量博弈', {
    x: 0.6, y: 1.1, w: 12, h: 0.7,
    fontFace: 'PingFang SC', fontSize: 28, color: t.primary, bold: true,
  });
  s.addText('用户规模触顶，平台与商家同时进入零和博弈', {
    x: 0.6, y: 1.85, w: 12, h: 0.45,
    fontFace: 'PingFang SC', fontSize: 14, color: t.accent2,
  });

  // 3 张 KPI 卡
  const kpis = [
    {
      label: '全网 MAU',
      big: '12.82',
      unit: '亿',
      delta: '同比 +1.2%',
      deltaType: 'neutral',
      sub: '2026 年 6 月，互联网用户规模触顶',
      tag: '用户见顶',
    },
    {
      label: '综合获客成本（CAC）',
      big: '620',
      unit: '元/人',
      delta: '三年 +63%',
      deltaType: 'up',
      sub: '2023 年 380 元 → 2026Q1 620 元',
      tag: '成本上行',
    },
    {
      label: '投放 ROI',
      big: '1 : 1.5',
      unit: '',
      delta: 'vs 2020 年 1 : 5',
      deltaType: 'down',
      sub: '爆款公式失效，5 倍杠杆消失',
      tag: 'ROI 跌穿',
    },
  ];

  const cardW = 3.95, cardH = 2.6, gap = 0.2, startX = 0.6, startY = 2.55;
  kpis.forEach((k, i) => {
    const x = startX + i * (cardW + gap);
    // 卡底
    s.addShape('rect', {
      x, y: startY, w: cardW, h: cardH,
      fill: { color: t.light }, line: { color: t.line, width: 0.75 },
    });
    // 左侧 accent 边条
    s.addShape('rect', {
      x, y: startY, w: 0.08, h: cardH,
      fill: { color: t.accent1 }, line: { type: 'none' },
    });

    // 标签
    s.addText(k.label, {
      x: x + 0.3, y: startY + 0.25, w: cardW - 0.5, h: 0.35,
      fontFace: 'PingFang SC', fontSize: 12, color: t.muted, charSpacing: 1,
    });

    // 大数字 + 单位
    s.addText([
        { text: k.big, options: { fontFace: 'Arial', fontSize: 48, color: t.primary, bold: true, charSpacing: 1 } },
        { text: '  ' + k.unit, options: { fontFace: 'PingFang SC', fontSize: 16, color: t.primary } },
      ], {
        x: x + 0.3, y: startY + 0.6, w: cardW - 0.5, h: 1.0,
      });

    // 同比徽章
    const deltaColor = k.deltaType === 'up' ? t.accent1 : (k.deltaType === 'down' ? t.primary : t.accent2);
    s.addShape('rect', {
      x: x + 0.3, y: startY + 1.65, w: 1.6, h: 0.32,
      fill: { color: k.deltaType === 'down' ? t.primary : t.accent1 }, line: { type: 'none' },
    });
    s.addText(k.delta, {
      x: x + 0.3, y: startY + 1.65, w: 1.6, h: 0.32,
      fontFace: 'PingFang SC', fontSize: 10, color: 'FFFFFF', bold: true,
      align: 'center', valign: 'middle',
    });

    // 副文字
    s.addText(k.sub, {
      x: x + 0.3, y: startY + 2.05, w: cardW - 0.5, h: 0.45,
      fontFace: 'PingFang SC', fontSize: 10, color: t.ink, lineSpacingMultiple: 1.3,
    });

    // 标签在右下
    s.addText(k.tag, {
      x: x + cardW - 1.05, y: startY + 1.7, w: 0.95, h: 0.3,
      fontFace: 'PingFang SC', fontSize: 9, color: t.muted, align: 'right',
    });
  });

  // 下方 3 个亮点小条
  const facts = [
    { tag: '渗透率', val: '92.6%', desc: '短视频行业活跃渗透率（2026Q2）' },
    { tag: '从业者', val: '−12.5%', desc: '截至 2025 年 6 月电商从业者同比' },
    { tag: '商家数', val: '−18.3%', desc: '淘宝活跃商家数量同比下降' },
  ];
  const fW = 3.95, fH = 1.05, fGap = 0.2, fY = 5.4;
  facts.forEach((f, i) => {
    const x = 0.6 + i * (fW + fGap);
    s.addShape('rect', {
      x, y: fY, w: fW, h: fH,
      fill: { color: 'FFFFFF' }, line: { color: t.line, width: 0.75 },
    });
    s.addShape('rect', {
      x, y: fY, w: 0.08, h: fH,
      fill: { color: t.primary }, line: { type: 'none' },
    });
    s.addText(f.tag, {
      x: x + 0.25, y: fY + 0.15, w: 1.4, h: 0.3,
      fontFace: 'PingFang SC', fontSize: 10, color: t.muted,
    });
    s.addText(f.val, {
      x: x + 0.25, y: fY + 0.4, w: 1.6, h: 0.5,
      fontFace: 'Arial', fontSize: 22, color: t.primary, bold: true,
    });
    s.addText(f.desc, {
      x: x + 1.9, y: fY + 0.2, w: fW - 2.05, h: 0.7,
      fontFace: 'PingFang SC', fontSize: 10, color: t.ink, valign: 'middle', lineSpacingMultiple: 1.3,
    });
  });

  // 底部洞察条
  s.addShape('rect', {
    x: 0.6, y: 6.7, w: 12.13, h: 0.4,
    fill: { color: t.primary }, line: { type: 'none' },
  });
  s.addText('结论：平台之间争抢用户时长与钱包份额，商家之间争抢经营效率与用户资产——单次 ROI 持续走低已成必然。', {
    x: 0.7, y: 6.7, w: 12.0, h: 0.4,
    fontFace: 'PingFang SC', fontSize: 11, color: 'FFFFFF', valign: 'middle',
  });

  // 页码徽章
  s.addShape('ellipse', { x: 12.55, y: 7.18, w: 0.3, h: 0.3, fill: { color: t.accent1 } });
  s.addText('03', {
    x: 12.55, y: 7.18, w: 0.3, h: 0.3,
    fontFace: 'Arial', fontSize: 9, color: 'FFFFFF', align: 'center', valign: 'middle', bold: true,
  });

  return s;
}
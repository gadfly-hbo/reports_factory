// Page 02 / Summary — 五大核心判断：存量博弈期的电商新规则
import pptxgen from 'pptxgenjs';

export function buildSlide(pptx) {
  const t = {
    primary: '263442', accent1: 'B44626', accent2: '5A6675',
    light: 'F7F6F3', ink: '242830', muted: '626773', line: 'DEDCD6',
  };

  const s = pptx.addSlide();
  s.background = { color: 'FFFFFF' };

  // 顶部色条
  s.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.5, fill: { color: t.primary }, line: { type: 'none' } });

  // 顶部 EN 标签
  s.addText('EXECUTIVE  SUMMARY', {
    x: 0.6, y: 0.06, w: 6, h: 0.4,
    fontFace: 'Arial', fontSize: 10, color: t.accent1, bold: true, charSpacing: 4,
  });
  s.addText('汇报摘要 / 五条核心判断', {
    x: 6.6, y: 0.06, w: 6.2, h: 0.4,
    fontFace: 'PingFang SC', fontSize: 10, color: 'FFFFFF', align: 'right',
  });

  // 大标题
  s.addText('五大核心判断', {
    x: 0.6, y: 0.85, w: 8, h: 0.7,
    fontFace: 'PingFang SC', fontSize: 30, color: t.primary, bold: true,
  });
  s.addText('存量博弈期的电商新规则', {
    x: 0.6, y: 1.55, w: 8, h: 0.5,
    fontFace: 'PingFang SC', fontSize: 17, color: t.accent2,
  });

  // 右上角小标签
  s.addText('2026 Q3', {
    x: 11.5, y: 1.0, w: 1.3, h: 0.4,
    fontFace: 'Arial', fontSize: 12, color: t.muted, align: 'right',
  });
  s.addShape('rect', { x: 12.5, y: 1.42, w: 0.3, h: 0.04, fill: { color: t.accent1 } });

  // 5 张判断卡片（横排）
  const items = [
    {
      no: '01', title: '流量见顶',
      lead: '进入存量博弈',
      data: '12.82 亿',
      caption: '全网 MAU，同比仅 +1.2%',
      desc: '短视频渗透 92.6%，拉新红利基本耗尽',
    },
    {
      no: '02', title: '获客飞涨',
      lead: '单次 ROI 持续走低',
      data: '620 元/人',
      caption: '综合获客成本，三年 +63%',
      desc: '2020 年 1:5 的投放公式，2025 年仅剩 1:1.5',
    },
    {
      no: '03', title: '成本剪刀差',
      lead: '私域是利润源',
      data: '18×',
      caption: '公私域获客成本差距',
      desc: '私域成熟商家 30–60 元 / 人，复购 3.2 倍、转介绍 4.7 倍',
    },
    {
      no: '04', title: '微信小店',
      lead: '增长最大变量',
      data: '+225%',
      caption: '视频号电商 GMV 同比',
      desc: 'DAU 约 8 亿、送礼物 / 一起买 / 点赞买打通社交闭环',
    },
    {
      no: '05', title: '范式切换',
      lead: '买流量 → 经营用户资产',
      data: '飞轮',
      caption: '公域捞鱼、私域养鱼、反哺公域',
      desc: '先跑通最小闭环，再规模化放大',
    },
  ];

  const cardW = 2.4, cardH = 4.6, gap = 0.12, startX = 0.6, startY = 2.3;
  items.forEach((it, i) => {
    const x = startX + i * (cardW + gap);

    // 卡片底
    s.addShape('rect', {
      x, y: startY, w: cardW, h: cardH,
      fill: { color: t.light }, line: { color: t.line, width: 0.75 },
    });
    // 顶部 accent1 边条
    s.addShape('rect', {
      x, y: startY, w: cardW, h: 0.08,
      fill: { color: t.accent1 }, line: { type: 'none' },
    });

    // 大编号
    s.addText(it.no, {
      x: x + 0.15, y: startY + 0.18, w: cardW - 0.3, h: 0.6,
      fontFace: 'Arial', fontSize: 26, color: t.accent1, bold: true, charSpacing: 1,
    });

    // 标题
    s.addText(it.title, {
      x: x + 0.15, y: startY + 0.78, w: cardW - 0.3, h: 0.45,
      fontFace: 'PingFang SC', fontSize: 15, color: t.primary, bold: true,
    });

    // lead
    s.addText(it.lead, {
      x: x + 0.15, y: startY + 1.22, w: cardW - 0.3, h: 0.4,
      fontFace: 'PingFang SC', fontSize: 11, color: t.accent2,
    });

    // 分隔线
    s.addShape('rect', {
      x: x + 0.15, y: startY + 1.75, w: 0.6, h: 0.02,
      fill: { color: t.primary }, line: { type: 'none' },
    });

    // 大数字
    s.addText(it.data, {
      x: x + 0.15, y: startY + 1.95, w: cardW - 0.3, h: 0.7,
      fontFace: 'Arial', fontSize: 28, color: t.primary, bold: true, charSpacing: 1,
    });
    // 数据注脚
    s.addText(it.caption, {
      x: x + 0.15, y: startY + 2.7, w: cardW - 0.3, h: 0.45,
      fontFace: 'PingFang SC', fontSize: 10, color: t.muted,
    });

    // 描述
    s.addShape('rect', {
      x: x + 0.15, y: startY + 3.25, w: cardW - 0.3, h: 0.02,
      fill: { color: t.line }, line: { type: 'none' },
    });
    s.addText(it.desc, {
      x: x + 0.15, y: startY + 3.32, w: cardW - 0.3, h: 1.2,
      fontFace: 'PingFang SC', fontSize: 10, color: t.ink, lineSpacingMultiple: 1.3,
    });
  });

  // 底部核心结论条
  s.addShape('rect', {
    x: 0.6, y: 7.05, w: 12.13, h: 0.32,
    fill: { color: t.primary }, line: { type: 'none' },
  });
  s.addText('核心结论：公域决定增长下限（新客规模），私域决定增长上限（LTV 与利润），公私域飞轮转速决定胜率。', {
    x: 0.7, y: 7.05, w: 12.0, h: 0.32,
    fontFace: 'PingFang SC', fontSize: 11, color: 'FFFFFF', valign: 'middle',
  });

  // 页码徽章
  s.addShape('ellipse', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fill: { color: t.accent1 } });
  s.addText('02', {
    x: 12.55, y: 6.95, w: 0.38, h: 0.38,
    fontFace: 'Arial', fontSize: 10, color: 'FFFFFF', align: 'center', valign: 'middle', bold: true,
  });

  return s;
}
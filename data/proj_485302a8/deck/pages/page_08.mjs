// Page 08 / Trend — 五大趋势：AI 推荐、自播、搜索、互通、即时零售
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
  s.addText('06  ·  FIVE  TRENDS', {
    x: 0.6, y: 0.7, w: 8, h: 0.35,
    fontFace: 'Arial', fontSize: 10, color: t.accent2, bold: true, charSpacing: 4,
  });

  // 大标题
  s.addText('五大趋势：未来 12–18 个月的五个变量', {
    x: 0.6, y: 1.1, w: 12, h: 0.7,
    fontFace: 'PingFang SC', fontSize: 26, color: t.primary, bold: true,
  });
  s.addText('AI 推荐 / 品牌自播 / 搜索升值 / 平台互通 / 即时零售', {
    x: 0.6, y: 1.82, w: 12, h: 0.4,
    fontFace: 'PingFang SC', fontSize: 13, color: t.accent2,
  });

  // ===== 5 张趋势卡（横排）=====
  const trends = [
    {
      no: '01', title: 'AI 推荐入口',
      en: 'GENERATIVE  ENGINE',
      head: '谁能进 AI 短名单，谁拿下一轮流量',
      bullets: [
        '抖音"AI 购物小助手"测试中',
        'GEO：商品结构化优化成新基建',
        '两极分化：全域拓流 vs 技术壁垒',
      ],
      data: '2026 下半年',
      tag: '已发生',
    },
    {
      no: '02', title: '品牌自播取代达人',
      en: 'BRAND  LIVE',
      head: '直播从"请达人"回归"自建信任"',
      bullets: [
        '自播占比从 38% → 51%',
        '抖音 / 淘宝 / 快手均加大扶持',
        '店播商家 +45%、成交翻倍商家 12 万',
      ],
      data: '51%',
      tag: '正在发生',
    },
    {
      no: '03', title: '搜索流量升值',
      en: 'SEARCH  REVIVAL',
      head: '货架型确定性流量在内容平台复兴',
      bullets: [
        '快手搜索 GMV +119%',
        '抖音"种草 → 复搜"链路放量',
        '小红书搜索占比持续提升',
      ],
      data: '+119%',
      tag: '高确定性',
    },
    {
      no: '04', title: '平台互联互通',
      en: 'ECOSYSTEM  OPEN',
      head: '跨平台协同盘活存量用户',
      bullets: [
        '淘宝接入微信支付',
        '天猫接入京东物流',
        '淘宝 × 小红书"种草—购买"打通',
      ],
      data: '8.75 亿',
      tag: '增量空间',
    },
    {
      no: '05', title: '即时零售崛起',
      en: 'INSTANT  RETAIL',
      head: '远场电商 + 近场分钟达的全域竞争',
      bullets: [
        '2025 年 12 月即时零售 MAU 5.65 亿',
        '增速高于综合电商大盘',
        '淘宝、京东均加码分钟级送达',
      ],
      data: '5.65 亿',
      tag: '增长曲线',
    },
  ];

  const cardW = 2.4, cardH = 4.55, gap = 0.12, startX = 0.6, startY = 2.35;
  trends.forEach((tr, i) => {
    const x = startX + i * (cardW + gap);
    // 卡底
    s.addShape('rect', {
      x, y: startY, w: cardW, h: cardH,
      fill: { color: t.light }, line: { color: t.line, width: 0.75 },
    });
    // 顶部编号色条
    const headColor = i === 0 ? t.accent1 : t.primary;
    s.addShape('rect', {
      x, y: startY, w: cardW, h: 0.55,
      fill: { color: headColor }, line: { type: 'none' },
    });
    s.addText(tr.no, {
      x: x + 0.15, y: startY + 0.08, w: 0.8, h: 0.4,
      fontFace: 'Arial', fontSize: 16, color: 'FFFFFF', bold: true,
      valign: 'middle',
    });
    // tag 右上
    s.addText(tr.tag, {
      x: x + cardW - 1.1, y: startY + 0.12, w: 1.0, h: 0.3,
      fontFace: 'PingFang SC', fontSize: 9, color: 'FFFFFF', align: 'right',
      valign: 'middle',
    });

    // 标题
    s.addText(tr.title, {
      x: x + 0.15, y: startY + 0.7, w: cardW - 0.3, h: 0.45,
      fontFace: 'PingFang SC', fontSize: 14, color: t.primary, bold: true,
    });
    // 英文小标
    s.addText(tr.en, {
      x: x + 0.15, y: startY + 1.12, w: cardW - 0.3, h: 0.3,
      fontFace: 'Arial', fontSize: 8, color: t.muted, charSpacing: 2,
    });
    // 头部 lead
    s.addText(tr.head, {
      x: x + 0.15, y: startY + 1.45, w: cardW - 0.3, h: 0.7,
      fontFace: 'PingFang SC', fontSize: 11, color: t.ink,
      lineSpacingMultiple: 1.3, bold: true,
    });
    // 分隔线
    s.addShape('rect', {
      x: x + 0.15, y: startY + 2.25, w: 0.6, h: 0.02,
      fill: { color: t.accent1 }, line: { type: 'none' },
    });
    // bullets
    tr.bullets.forEach((b, j) => {
      const ay = startY + 2.4 + j * 0.5;
      s.addShape('rect', {
        x: x + 0.15, y: ay + 0.08, w: 0.06, h: 0.06,
        fill: { color: t.accent1 }, line: { type: 'none' },
      });
      s.addText(b, {
        x: x + 0.28, y: ay, w: cardW - 0.4, h: 0.5,
        fontFace: 'PingFang SC', fontSize: 9, color: t.ink,
        valign: 'top', lineSpacingMultiple: 1.3,
      });
    });

    // 底部数据徽章
    s.addShape('rect', {
      x: x + 0.15, y: startY + cardH - 0.6, w: cardW - 0.3, h: 0.45,
      fill: { color: t.primary }, line: { type: 'none' },
    });
    s.addText(tr.data, {
      x: x + 0.15, y: startY + cardH - 0.6, w: cardW - 0.3, h: 0.45,
      fontFace: 'Arial', fontSize: 16, color: 'FFFFFF', bold: true,
      align: 'center', valign: 'middle', charSpacing: 1,
    });
  });

  // 底部洞察条
  s.addShape('rect', {
    x: 0.6, y: 7.05, w: 12.13, h: 0.32,
    fill: { color: t.primary }, line: { type: 'none' },
  });
  s.addText('结论：AI 与自播是 2026 年必选项；搜索升值与平台互通提供结构性机会；即时零售开启"远 + 近"全域竞争。', {
    x: 0.7, y: 7.05, w: 12.0, h: 0.32,
    fontFace: 'PingFang SC', fontSize: 11, color: 'FFFFFF', valign: 'middle',
  });

  // 页码徽章
  s.addShape('ellipse', { x: 12.55, y: 7.43, w: 0.3, h: 0.3, fill: { color: t.accent1 } });
  s.addText('08', {
    x: 12.55, y: 7.43, w: 0.3, h: 0.3,
    fontFace: 'Arial', fontSize: 9, color: 'FFFFFF', align: 'center', valign: 'middle', bold: true,
  });

  return s;
}
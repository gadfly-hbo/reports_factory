// Page 05 / Content — 打法共识：从买流量到全域经营三场合一
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
  s.addText('03  ·  PLAYBOOK  CONSENSUS', {
    x: 0.6, y: 0.7, w: 8, h: 0.35,
    fontFace: 'Arial', fontSize: 10, color: t.accent2, bold: true, charSpacing: 4,
  });

  // 大标题
  s.addText('打法共识：从"买流量"到"全域经营三场合一"', {
    x: 0.6, y: 1.1, w: 12, h: 0.7,
    fontFace: 'PingFang SC', fontSize: 26, color: t.primary, bold: true,
  });
  s.addText('单次 ROI 从 1:5 跌至 1:1.5，行业共识：每一次曝光都要转化为可重复触达的用户资产', {
    x: 0.6, y: 1.82, w: 12, h: 0.4,
    fontFace: 'PingFang SC', fontSize: 13, color: t.accent2,
  });

  // ===== 三场卡（左 + 中 + 右）=====
  const fields = [
    {
      key: 'CONTENT',
      title: '内容场',
      en: 'Short Video · Live · Note',
      def: '负责拉新与种草',
      acts: [
        '短视频种草、直播转化、笔记沉淀',
        '店播已超达人（抖音自播占比 51%）',
        '算法权重转向：收藏率 > 复访率 > 铁粉互动',
      ],
      icon: '内容',
    },
    {
      key: 'SHELF',
      title: '货架场',
      en: 'Search · Mall · Product Card',
      def: '承接确定性需求',
      acts: [
        '搜索流量全面升值（抖音、快手、小红书、淘宝）',
        '关键词卡位 + 商品卡 + 商城推荐',
        '快手搜索 GMV +119%，抖音搜索是 2026 增量源',
      ],
      icon: '货架',
    },
    {
      key: 'TRAFFIC',
      title: '投放场',
      en: 'Qianchuan · ZhiTongTruck · Juguang',
      def: '精准放大与人群破圈',
      acts: [
        '千川全域投放撬动自然流',
        'AI 智能托管成为主流，人机协同',
        '站外种草 → 站内收割的跨平台人群包',
      ],
      icon: '投放',
    },
  ];

  const cardW = 3.95, cardH = 3.65, gap = 0.2, startX = 0.6, startY = 2.4;
  fields.forEach((f, i) => {
    const x = startX + i * (cardW + gap);

    // 卡底
    s.addShape('rect', {
      x, y: startY, w: cardW, h: cardH,
      fill: { color: t.light }, line: { color: t.line, width: 0.75 },
    });
    // 顶部主色条
    s.addShape('rect', {
      x, y: startY, w: cardW, h: 0.65,
      fill: { color: t.primary }, line: { type: 'none' },
    });
    // 编号徽章
    s.addShape('rect', {
      x: x + 0.3, y: startY + 0.18, w: 0.5, h: 0.3,
      fill: { color: t.accent1 }, line: { type: 'none' },
    });
    s.addText('0' + (i + 1), {
      x: x + 0.3, y: startY + 0.18, w: 0.5, h: 0.3,
      fontFace: 'Arial', fontSize: 10, color: 'FFFFFF', bold: true,
      align: 'center', valign: 'middle',
    });
    // key
    s.addText(f.key, {
      x: x + 0.95, y: startY + 0.18, w: cardW - 1.1, h: 0.3,
      fontFace: 'Arial', fontSize: 10, color: t.accent1, bold: true,
      valign: 'middle', charSpacing: 4,
    });

    // 标题
    s.addText(f.title, {
      x: x + 0.3, y: startY + 0.85, w: cardW - 0.5, h: 0.5,
      fontFace: 'PingFang SC', fontSize: 22, color: t.primary, bold: true,
    });
    // 英文
    s.addText(f.en, {
      x: x + 0.3, y: startY + 1.35, w: cardW - 0.5, h: 0.3,
      fontFace: 'Arial', fontSize: 9, color: t.muted, charSpacing: 1,
    });
    // 定义
    s.addText(f.def, {
      x: x + 0.3, y: startY + 1.7, w: cardW - 0.5, h: 0.4,
      fontFace: 'PingFang SC', fontSize: 12, color: t.accent2,
    });
    // 分隔线
    s.addShape('rect', {
      x: x + 0.3, y: startY + 2.12, w: 0.6, h: 0.02,
      fill: { color: t.accent1 }, line: { type: 'none' },
    });
    // 三条要点
    f.acts.forEach((a, j) => {
      const ay = startY + 2.25 + j * 0.42;
      s.addShape('rect', {
        x: x + 0.3, y: ay + 0.13, w: 0.08, h: 0.08,
        fill: { color: t.accent1 }, line: { type: 'none' },
      });
      s.addText(a, {
        x: x + 0.5, y: ay, w: cardW - 0.7, h: 0.4,
        fontFace: 'PingFang SC', fontSize: 10, color: t.ink, valign: 'middle', lineSpacingMultiple: 1.25,
      });
    });
  });

  // 齿轮咬合连接线（中央一个 "+" 表达三场合一）
  // 左下 / 右下角提示
  s.addShape('rect', {
    x: 0.6, y: 6.2, w: 12.13, h: 0.85,
    fill: { color: t.light }, line: { color: t.line, width: 0.75 },
  });
  s.addShape('rect', {
    x: 0.6, y: 6.2, w: 0.08, h: 0.85,
    fill: { color: t.accent1 }, line: { type: 'none' },
  });
  s.addText('三场合一公式', {
    x: 0.85, y: 6.3, w: 1.8, h: 0.3,
    fontFace: 'PingFang SC', fontSize: 11, color: t.muted,
  });
  s.addText('内容场 拉新 + 货架场 承接 + 投放场 放大  →  把曝光转化为可重复触达的用户资产', {
    x: 0.85, y: 6.6, w: 12.0, h: 0.4,
    fontFace: 'PingFang SC', fontSize: 13, color: t.primary, bold: true, valign: 'middle',
  });

  // 页码徽章
  s.addShape('ellipse', { x: 12.55, y: 7.15, w: 0.3, h: 0.3, fill: { color: t.accent1 } });
  s.addText('05', {
    x: 12.55, y: 7.15, w: 0.3, h: 0.3,
    fontFace: 'Arial', fontSize: 9, color: 'FFFFFF', align: 'center', valign: 'middle', bold: true,
  });

  return s;
}
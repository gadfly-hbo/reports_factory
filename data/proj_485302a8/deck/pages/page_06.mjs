// Page 06 / Issue Breakdown — 私域价值量化：18 倍成本差与飞轮模型
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
  s.addText('04  ·  PRIVATE  DOMAIN  VALUE', {
    x: 0.6, y: 0.7, w: 8, h: 0.35,
    fontFace: 'Arial', fontSize: 10, color: t.accent2, bold: true, charSpacing: 4,
  });

  // 大标题
  s.addText('私域价值量化：18 倍成本差与公私域飞轮', {
    x: 0.6, y: 1.1, w: 12, h: 0.7,
    fontFace: 'PingFang SC', fontSize: 26, color: t.primary, bold: true,
  });
  s.addText('私域成熟商家获客 30–60 元，复购率 3.2 倍、转介绍 4.7 倍——私域是利润源', {
    x: 0.6, y: 1.82, w: 12, h: 0.4,
    fontFace: 'PingFang SC', fontSize: 13, color: t.accent2,
  });

  // ===== 顶部三组核心数字 =====
  const hero = [
    { num: '18×', label: '公私域获客成本差', sub: '公域 620+ 元 vs 私域 30–60 元', color: t.accent1 },
    { num: '3.2×', label: '企微客户复购率倍数', sub: '私域复购率是公域的 3.2 倍', color: t.primary },
    { num: '4.7×', label: '转介绍率倍数', sub: '私域转介绍率是公域的 4.7 倍', color: t.primary },
  ];
  const hW = 3.95, hH = 1.4, hGap = 0.2, hY = 2.4;
  hero.forEach((h, i) => {
    const x = 0.6 + i * (hW + hGap);
    s.addShape('rect', {
      x, y: hY, w: hW, h: hH,
      fill: { color: h.color === t.accent1 ? t.accent1 : t.light },
      line: { color: h.color === t.accent1 ? t.accent1 : t.line, width: 0.75 },
    });
    const isAccent = h.color === t.accent1;
    s.addText(h.num, {
      x: x + 0.3, y: hY + 0.15, w: hW - 0.5, h: 0.7,
      fontFace: 'Arial', fontSize: 42, color: isAccent ? 'FFFFFF' : t.primary, bold: true, charSpacing: 1,
    });
    s.addText(h.label, {
      x: x + 0.3, y: hY + 0.85, w: hW - 0.5, h: 0.3,
      fontFace: 'PingFang SC', fontSize: 12, color: isAccent ? 'FFFFFF' : t.primary, bold: true,
    });
    s.addText(h.sub, {
      x: x + 0.3, y: hY + 1.12, w: hW - 0.5, h: 0.3,
      fontFace: 'PingFang SC', fontSize: 9,
      color: isAccent ? 'F4D9CD' : t.muted,
    });
  });

  // ===== 底部：飞轮模型（4 个圆形流程）=====
  // 标题
  s.addText('公私域互转飞轮模型', {
    x: 0.6, y: 4.0, w: 6, h: 0.4,
    fontFace: 'PingFang SC', fontSize: 14, color: t.primary, bold: true,
  });
  s.addText('公域捞鱼 → 私域养鱼 → 内容反哺 → 公域再获新', {
    x: 0.6, y: 4.4, w: 8, h: 0.3,
    fontFace: 'PingFang SC', fontSize: 10, color: t.muted,
  });

  const steps = [
    { no: '1', title: '钩子引流', desc: '包裹卡 / 直播口播 / 主页活码沉淀企微' },
    { no: '2', title: '首单转化', desc: '24 小时新人专享 / 试用装建立首单信任' },
    { no: '3', title: '分层复购', desc: 'RFM 标签 + 内容节奏驱动复购周期' },
    { no: '4', title: '反哺公域', desc: '私域晒单 UGC 二次剪辑，提升公域素材 CTR' },
  ];
  const wheelY = 4.9, wheelH = 1.5;
  const stepW = (12.13 - 0.45) / 4; // 4 步均分
  steps.forEach((st, i) => {
    const x = 0.6 + i * (stepW + 0.15);
    // 圆形编号
    s.addShape('ellipse', {
      x: x + (stepW - 0.7) / 2, y: wheelY, w: 0.7, h: 0.7,
      fill: { color: t.primary }, line: { type: 'none' },
    });
    s.addText(st.no, {
      x: x + (stepW - 0.7) / 2, y: wheelY, w: 0.7, h: 0.7,
      fontFace: 'Arial', fontSize: 22, color: 'FFFFFF', bold: true,
      align: 'center', valign: 'middle',
    });
    // 标题
    s.addText(st.title, {
      x, y: wheelY + 0.75, w: stepW, h: 0.3,
      fontFace: 'PingFang SC', fontSize: 12, color: t.primary, bold: true,
      align: 'center',
    });
    // 描述
    s.addText(st.desc, {
      x, y: wheelY + 1.05, w: stepW, h: 0.45,
      fontFace: 'PingFang SC', fontSize: 9, color: t.muted,
      align: 'center', lineSpacingMultiple: 1.3,
    });

    // 箭头（i<3 时）
    if (i < steps.length - 1) {
      const ax = x + stepW - 0.05;
      s.addShape('rect', {
        x: ax, y: wheelY + 0.32, w: 0.2, h: 0.04,
        fill: { color: t.accent1 }, line: { type: 'none' },
      });
    }
  });

  // 飞轮回到起点（左侧长弧提示）
  s.addShape('rect', {
    x: 0.6, y: wheelY + wheelH + 0.2, w: 12.13, h: 0.02,
    fill: { color: t.accent1 }, line: { type: 'none' },
  });

  // 底部洞察条
  s.addShape('rect', {
    x: 0.6, y: 6.85, w: 12.13, h: 0.4,
    fill: { color: t.primary }, line: { type: 'none' },
  });
  s.addText('结论：78.8% 品牌已完成私域布局；公域决定增长下限，私域决定增长上限——飞轮转速决定胜率。', {
    x: 0.7, y: 6.85, w: 12.0, h: 0.4,
    fontFace: 'PingFang SC', fontSize: 11, color: 'FFFFFF', valign: 'middle',
  });

  // 页码徽章
  s.addShape('ellipse', { x: 12.55, y: 7.32, w: 0.3, h: 0.3, fill: { color: t.accent1 } });
  s.addText('06', {
    x: 12.55, y: 7.32, w: 0.3, h: 0.3,
    fontFace: 'Arial', fontSize: 9, color: 'FFFFFF', align: 'center', valign: 'middle', bold: true,
  });

  return s;
}
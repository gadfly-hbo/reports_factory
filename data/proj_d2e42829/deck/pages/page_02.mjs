// sources: 26年8月森马天猫官旗.md
// headline: 女性主导、25-34 岁主力、高折扣敏感是森马官旗人群的三大底层特征
import pptxgen from 'pptxgenjs';

export function buildSlide(pptx) {
  const t = {
    primary: 'b44626', accent1: '263442', accent2: '5A6675',
    light: 'F7F6F3', ink: '242830', muted: '626773', line: 'DEDCD6'
  };
  const s = pptx.addSlide();
  s.background = { color: 'FFFFFF' };

  // 页眉细线 + 章节标识
  s.addShape('rect', { x: 0.6, y: 0.6, w: 0.08, h: 0.4, fill: { color: t.primary }, line: { type: 'none' } });
  s.addText('执行摘要  /  EXECUTIVE SUMMARY', {
    x: 0.85, y: 0.6, w: 8, h: 0.4, fontSize: 11, fontFace: 'PingFang SC',
    color: t.muted, charSpacing: 3, bold: true
  });
  s.addText('SEMIR', {
    x: 11.4, y: 0.6, w: 1.6, h: 0.4, fontSize: 10, fontFace: 'Arial',
    color: t.primary, bold: true, align: 'right', charSpacing: 4
  });

  // 一句话核心结论（20pt 主色加粗置顶）
  s.addText('女性主导、25-34 岁主力、高折扣敏感是森马官旗人群的三大底层特征', {
    x: 0.6, y: 1.25, w: 12.1, h: 1.1,
    fontSize: 20, fontFace: 'PingFang SC', color: t.primary, bold: true, lineSpacingMultiple: 1.2
  });

  // 分隔线
  s.addShape('rect', { x: 0.6, y: 2.5, w: 12.1, h: 0.02, fill: { color: t.line }, line: { type: 'none' } });

  // 三条关键发现（左侧） + 建议一览表（右侧）
  // 左：关键发现（论据卡片）
  s.addText('关键发现  KEY FINDINGS', {
    x: 0.6, y: 2.7, w: 6, h: 0.3, fontSize: 11, fontFace: 'PingFang SC',
    color: t.accent1, bold: true, charSpacing: 3
  });

  const findings = [
    { title: '女性占比 75.4%，男 24.6%', desc: '女装相关 AI 标签（如甜美 / 优雅）占比显著高于男装' },
    { title: '18-34 岁合计 70.29%', desc: '25-29 岁 31.11% + 30-34 岁 21.75% + 18-24 岁 17.43% 三段堆叠' },
    // calc: 17.43+31.11+21.75 = 70.29
    { title: '高折扣敏感度人群 56.13%', desc: '大服饰策略中「潮流人群 36.62% + 低价有颜 10.79%」叠加' },
    { title: 'Z 世代家户 65.96% + 单身期 30.43%', desc: '但「已婚未育 37.46% + 养育期 28.86%」家庭向心智并存' }
  ];

  let fy = 3.1;
  findings.forEach((f, i) => {
    // 序号小方块
    s.addShape('rect', {
      x: 0.6, y: fy, w: 0.32, h: 0.32,
      fill: { color: t.primary }, line: { type: 'none' }
    });
    s.addText(String(i + 1).padStart(2, '0'), {
      x: 0.6, y: fy, w: 0.32, h: 0.32, fontSize: 10, fontFace: 'Arial',
      color: 'FFFFFF', align: 'center', valign: 'middle', bold: true
    });
    // 结论短句
    s.addText(f.title, {
      x: 1.05, y: fy - 0.02, w: 5.6, h: 0.35, fontSize: 13, fontFace: 'PingFang SC',
      color: t.ink, bold: true
    });
    // 支撑数据
    s.addText(f.desc, {
      x: 1.05, y: fy + 0.32, w: 5.6, h: 0.32, fontSize: 10.5, fontFace: 'PingFang SC',
      color: t.muted
    });
    fy += 0.78;
  });

  // 右：建议一览表
  const tableX = 7.05, tableY = 2.7, tableW = 5.65;
  s.addText('建议一览  ACTION ITEMS', {
    x: tableX, y: tableY, w: tableW, h: 0.3, fontSize: 11, fontFace: 'PingFang SC',
    color: t.accent1, bold: true, charSpacing: 3
  });

  // 表头
  s.addShape('rect', {
    x: tableX, y: tableY + 0.42, w: tableW, h: 0.42,
    fill: { color: t.accent1 }, line: { type: 'none' }
  });
  s.addText('建议', { x: tableX + 0.15, y: tableY + 0.42, w: 2.6, h: 0.42, fontSize: 11, fontFace: 'PingFang SC', color: 'FFFFFF', bold: true, valign: 'middle' });
  s.addText('影响', { x: tableX + 2.85, y: tableY + 0.42, w: 1.8, h: 0.42, fontSize: 11, fontFace: 'PingFang SC', color: 'FFFFFF', bold: true, valign: 'middle' });
  s.addText('紧迫度', { x: tableX + 4.7, y: tableY + 0.42, w: 0.85, h: 0.42, fontSize: 11, fontFace: 'PingFang SC', color: 'FFFFFF', bold: true, valign: 'middle', align: 'center' });

  // 三行建议
  const rows = [
    { advice: '强化「潮流 + 价格力」双重叙事', impact: '转化率 / 复购', level: '高', color: t.primary },
    { advice: '扩张 18-29 岁女性文艺 / 简约风格 SKU', impact: '客单 / 连带', level: '中', color: t.accent2 },
    { advice: '运营下沉至新一线 / 二线城市门店联动', impact: '人群覆盖', level: '中', color: t.accent2 }
  ];

  let ry = tableY + 0.84;
  rows.forEach((r, i) => {
    // 行交替底色
    if (i % 2 === 0) {
      s.addShape('rect', { x: tableX, y: ry, w: tableW, h: 0.55, fill: { color: t.light }, line: { type: 'none' } });
    }
    s.addText(r.advice, {
      x: tableX + 0.15, y: ry, w: 2.6, h: 0.55, fontSize: 11.5, fontFace: 'PingFang SC',
      color: t.ink, bold: true, valign: 'middle'
    });
    s.addText(r.impact, {
      x: tableX + 2.85, y: ry, w: 1.8, h: 0.55, fontSize: 10.5, fontFace: 'PingFang SC',
      color: t.muted, valign: 'middle'
    });
    // chip
    s.addShape('roundRect', {
      x: tableX + 4.85, y: ry + 0.14, w: 0.6, h: 0.28,
      fill: { color: r.color }, line: { type: 'none' }, rectRadius: 0.04
    });
    s.addText(r.level, {
      x: tableX + 4.85, y: ry + 0.14, w: 0.6, h: 0.28, fontSize: 10, fontFace: 'PingFang SC',
      color: 'FFFFFF', bold: true, align: 'center', valign: 'middle'
    });
    ry += 0.55;
  });

  // 数据来源脚注
  s.addText('数据来源：26年8月森马天猫官旗.md', {
    x: 0.6, y: 6.6, w: 8, h: 0.3, fontSize: 9, fontFace: 'PingFang SC',
    color: t.muted, italic: true
  });

  // So what 结论条
  s.addShape('rect', { x: 0.6, y: 6.55, w: 12.1, h: 0.5, fill: { color: t.light }, line: { type: 'none' } });
  s.addText('启示：把「18-34 岁都市女性 × 折扣敏感 × 潮流偏好」做为核心运营主轴，男装/亲子作为延伸线', {
    x: 0.85, y: 6.55, w: 11.5, h: 0.5, fontSize: 12, fontFace: 'PingFang SC',
    color: t.primary, bold: true, valign: 'middle'
  });

  // 页码徽章
  s.addShape('ellipse', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fill: { color: t.accent2 }, line: { type: 'none' } });
  s.addText('02', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fontSize: 10, fontFace: 'Arial', color: 'FFFFFF', align: 'center', valign: 'middle' });

  return s;
}
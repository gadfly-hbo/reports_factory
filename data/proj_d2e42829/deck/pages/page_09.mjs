// sources: 26年8月森马天猫官旗.md
// headline: 服饰主线之外，母婴 / 居家 / 快消共同构成人群的生活半径
import pptxgen from 'pptxgenjs';

export function buildSlide(pptx) {
  const t = {
    primary: 'b44626', accent1: '263442', accent2: '5A6675',
    light: 'F7F6F3', ink: '242830', muted: '626773', line: 'DEDCD6'
  };
  const s = pptx.addSlide();
  s.background = { color: 'FFFFFF' };

  // 页眉
  s.addShape('rect', { x: 0.6, y: 0.6, w: 0.08, h: 0.4, fill: { color: t.primary }, line: { type: 'none' } });
  s.addText('05  /  品类偏好', {
    x: 0.85, y: 0.6, w: 8, h: 0.4, fontSize: 11, fontFace: 'PingFang SC',
    color: t.muted, charSpacing: 3, bold: true
  });
  s.addText('SEMIR', {
    x: 11.4, y: 0.6, w: 1.6, h: 0.4, fontSize: 10, fontFace: 'Arial',
    color: t.primary, bold: true, align: 'right', charSpacing: 4
  });

  // 一句话结论
  s.addText('服饰主线之外，母婴 / 居家 / 快消共同构成人群的生活半径', {
    x: 0.6, y: 1.15, w: 12.1, h: 0.8, fontSize: 16, fontFace: 'PingFang SC',
    color: t.primary, bold: true
  });

  // ============ 左：一级类目 Top10 表格 ============
  s.addText('一级类目偏好 Top 10  L1 CATEGORIES', {
    x: 0.6, y: 1.85, w: 6.0, h: 0.3, fontSize: 11, fontFace: 'PingFang SC',
    color: t.accent1, bold: true, charSpacing: 2
  });

  const t1x = 0.6, t1y = 2.2, t1w1 = 4.3, t1w2 = 1.5;
  s.addShape('rect', { x: t1x, y: t1y, w: t1w1 + t1w2, h: 0.34, fill: { color: t.accent1 }, line: { type: 'none' } });
  s.addText('类目', { x: t1x + 0.15, y: t1y, w: t1w1, h: 0.34, fontSize: 10.5, fontFace: 'PingFang SC', color: 'FFFFFF', bold: true, valign: 'middle' });
  s.addText('占比', { x: t1x + t1w1, y: t1y, w: t1w2, h: 0.34, fontSize: 10.5, fontFace: 'PingFang SC', color: 'FFFFFF', bold: true, valign: 'middle', align: 'right' });

  const top1 = [
    ['运动鞋', '7.5%'],
    ['运动服 / 休闲服装', '7.23%'],
    ['箱包皮具 / 热销女包 / 男包', '6.95%'],
    ['珠宝 / 钻石 / 翡翠 / 黄金', '5.84%'],
    ['咖啡 / 麦片 / 冲饮', '5.41%'],
    ['美容护肤 / 美体 / 精油', '4.94%'],
    ['女士内衣 / 男士内衣 / 家居服', '4.82%'],
    ['女装 / 女士精品', '4.78%'],
    ['童装 / 婴儿装 / 亲子装', '4.75%'],
    ['童鞋 / 婴儿鞋 / 亲子鞋', '4.71%']
  ];

  let ry = t1y + 0.34;
  top1.forEach((row, i) => {
    if (i % 2 === 0) {
      s.addShape('rect', { x: t1x, y: ry, w: t1w1 + t1w2, h: 0.28, fill: { color: t.light }, line: { type: 'none' } });
    }
    s.addText(row[0], {
      x: t1x + 0.15, y: ry, w: t1w1 - 0.2, h: 0.28, fontSize: 9.5, fontFace: 'PingFang SC',
      color: t.ink, valign: 'middle'
    });
    s.addText(row[1], {
      x: t1x + t1w1, y: ry, w: t1w2 - 0.15, h: 0.28, fontSize: 9.5, fontFace: 'Arial',
      color: i < 3 ? t.primary : t.ink, bold: i < 3, valign: 'middle', align: 'right'
    });
    ry += 0.28;
  });

  // ============ 中：二级类目 Top8 表格 ============
  s.addText('二级类目偏好 Top 8  L2 CATEGORIES', {
    x: 6.9, y: 1.85, w: 6.0, h: 0.3, fontSize: 11, fontFace: 'PingFang SC',
    color: t.accent1, bold: true, charSpacing: 2
  });

  const t2x = 6.9, t2y = 2.2, t2w1 = 3.8, t2w2 = 1.6;
  s.addShape('rect', { x: t2x, y: t2y, w: t2w1 + t2w2, h: 0.34, fill: { color: t.accent1 }, line: { type: 'none' } });
  s.addText('类目', { x: t2x + 0.15, y: t2y, w: t2w1, h: 0.34, fontSize: 10.5, fontFace: 'PingFang SC', color: 'FFFFFF', bold: true, valign: 'middle' });
  s.addText('占比', { x: t2x + t2w1, y: t2y, w: t2w2, h: 0.34, fontSize: 10.5, fontFace: 'PingFang SC', color: 'FFFFFF', bold: true, valign: 'middle', align: 'right' });

  const top2 = [
    ['运动休闲鞋', '6.87%'],
    ['牛仔裤', '6.04%'],
    ['羽绒服', '5.52%'],
    ['女士包袋', '5.42%'],
    ['板鞋', '5.4%'],
    ['运动羽绒服', '5.39%'],
    ['半身裙', '5.37%'],
    ['毛针织衫', '5.24%']
  ];

  ry = t2y + 0.34;
  top2.forEach((row, i) => {
    if (i % 2 === 0) {
      s.addShape('rect', { x: t2x, y: ry, w: t2w1 + t2w2, h: 0.28, fill: { color: t.light }, line: { type: 'none' } });
    }
    s.addText(row[0], {
      x: t2x + 0.15, y: ry, w: t2w1 - 0.2, h: 0.28, fontSize: 9.5, fontFace: 'PingFang SC',
      color: t.ink, valign: 'middle'
    });
    s.addText(row[1], {
      x: t2x + t2w1, y: ry, w: t2w2 - 0.15, h: 0.28, fontSize: 9.5, fontFace: 'Arial',
      color: i < 3 ? t.primary : t.ink, bold: i < 3, valign: 'middle', align: 'right'
    });
    ry += 0.28;
  });

  // ============ 左下：洞察 callout ============
  s.addShape('rect', { x: 0.6, y: 5.5, w: 6.0, h: 1.05, fill: { color: t.light }, line: { color: t.primary, width: 1 } });
  s.addText('生活半径洞察', {
    x: 0.8, y: 5.55, w: 5.6, h: 0.3, fontSize: 12, fontFace: 'PingFang SC',
    color: t.primary, bold: true
  });
  s.addText('Top10 一级类目中服饰鞋包占 6 席，但咖啡麦片 / 美容护肤 / 童装童鞋 / 床上用品同时出现，反映人群兼具家庭生活与个人护理的双重消费场景', {
    x: 0.8, y: 5.85, w: 5.6, h: 0.65, fontSize: 9.5, fontFace: 'PingFang SC',
    color: t.ink, lineSpacingMultiple: 1.2
  });

  // ============ 右下：家居风格偏好 ============
  s.addText('家居风格偏好  HOME STYLE', {
    x: 6.9, y: 4.85, w: 6.0, h: 0.3, fontSize: 11, fontFace: 'PingFang SC',
    color: t.accent1, bold: true, charSpacing: 2
  });

  const homeData = [
    ['现代简约', 23.86],
    ['复古', 23.6],
    ['ins 风', 17.26],
    ['新中式', 14.72],
    ['北欧', 9.64],
    ['轻奢风', 6.6]
  ];
  let hy = 5.18;
  homeData.forEach((row, i) => {
    if (i % 2 === 0) {
      s.addShape('rect', { x: 6.9, y: hy, w: 5.6, h: 0.22, fill: { color: t.light }, line: { type: 'none' } });
    }
    const barW = (row[1] / 25) * 1.4;
    s.addShape('rect', { x: 8.55, y: hy + 0.07, w: Math.max(barW, 0.05), h: 0.09, fill: { color: i < 3 ? t.primary : t.accent1 }, line: { type: 'none' } });
    s.addText(row[0], {
      x: 6.95, y: hy, w: 1.55, h: 0.22, fontSize: 9.5, fontFace: 'PingFang SC',
      color: t.ink, valign: 'middle'
    });
    s.addText(row[1] + '%', {
      x: 11.4, y: hy, w: 1.0, h: 0.22, fontSize: 9.5, fontFace: 'Arial',
      color: t.ink, bold: i < 3, valign: 'middle', align: 'right'
    });
    hy += 0.22;
  });

  // So what 条
  s.addShape('rect', { x: 0.6, y: 6.65, w: 12.1, h: 0.4, fill: { color: t.light }, line: { type: 'none' } });
  s.addText('启示：人群的生活半径比服饰本身更宽——可向家居 + 童装 + 美护做交叉品类种草与连带设计', {
    x: 0.85, y: 6.65, w: 11.5, h: 0.4, fontSize: 11.5, fontFace: 'PingFang SC',
    color: t.primary, bold: true, valign: 'middle'
  });

  // 数据来源脚注
  s.addText('数据来源：26年8月森马天猫官旗.md（标签类型：一级类目高偏好 / 二级类目高偏好 / 家居风格偏好）', {
    x: 0.6, y: 7.15, w: 12.1, h: 0.25, fontSize: 9, fontFace: 'PingFang SC',
    color: t.muted, italic: true
  });

  // 页码徽章
  s.addShape('ellipse', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fill: { color: t.accent2 }, line: { type: 'none' } });
  s.addText('09', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fontSize: 10, fontFace: 'Arial', color: 'FFFFFF', align: 'center', valign: 'middle' });

  return s;
}
// sources: 26年8月森马天猫官旗.md
// headline: 本科 + 已婚未育/养育期 + Z 世代家户共同构成「年轻家庭生活者」核心叙事
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
  s.addText('02  /  社会属性', {
    x: 0.85, y: 0.6, w: 8, h: 0.4, fontSize: 11, fontFace: 'PingFang SC',
    color: t.muted, charSpacing: 3, bold: true
  });
  s.addText('SEMIR', {
    x: 11.4, y: 0.6, w: 1.6, h: 0.4, fontSize: 10, fontFace: 'Arial',
    color: t.primary, bold: true, align: 'right', charSpacing: 4
  });

  // 一句话结论
  s.addText('本科 + 已婚未育/养育期 + Z 世代家户构成核心叙事；职业结构呈「白领 + 个体经营 + 学生」三足', {
    x: 0.6, y: 1.15, w: 12.1, h: 0.7, fontSize: 15, fontFace: 'PingFang SC',
    color: t.primary, bold: true
  });

  // 2×2 表格网格
  const cards = [
    {
      x: 0.6, y: 1.95, w: 5.95, h: 2.25,
      title: '职业  CAREER', sub: '综合身份聚类',
      rows: [
        ['个体经营 / 服务人员', '30.56%'],
        ['学生（即将升级，暂不建议使用）', '16.93%'],
        ['农林牧渔从业人员', '16.46%'],
        ['工人', '10.41%'],
        ['教职工', '9.2%'],
        ['公司职员', '8.35%']
      ]
    },
    {
      x: 6.75, y: 1.95, w: 5.95, h: 2.25,
      title: '教育程度  EDUCATION', sub: '综合身份聚类',
      rows: [
        ['本科', '44.69%'],
        ['高中及以下', '32.78%'],
        ['专科', '20.66%'],
        ['硕士', '1.83%'],
        ['博士', '0.04%']
      ]
    },
    {
      x: 0.6, y: 4.30, w: 5.95, h: 2.25,
      title: '人生阶段  LIFE STAGE', sub: '综合身份聚类',
      rows: [
        ['已婚未育期', '37.46%'],
        ['单身期', '30.43%'],
        ['养育期', '28.86%'],
        ['子女成年期', '3.25%']
      ]
    },
    {
      x: 6.75, y: 4.30, w: 5.95, h: 2.25,
      title: '家户类型  HOUSEHOLD', sub: '综合身份聚类',
      rows: [
        ['Z 世代家户', '65.96%'],
        ['单身小康家户', '31.25%'],
        ['银发家户', '2.48%'],
        ['高品质家户', '0.31%']
      ]
    }
  ];

  cards.forEach((c) => {
    // 卡片底
    s.addShape('rect', { x: c.x, y: c.y, w: c.w, h: c.h, fill: { color: t.light }, line: { type: 'none' } });
    // 左侧色条
    s.addShape('rect', { x: c.x, y: c.y, w: 0.08, h: c.h, fill: { color: t.primary }, line: { type: 'none' } });
    // 标题
    s.addText(c.title, {
      x: c.x + 0.25, y: c.y + 0.12, w: c.w - 0.4, h: 0.3, fontSize: 12, fontFace: 'PingFang SC',
      color: t.accent1, bold: true, charSpacing: 2
    });
    s.addText(c.sub, {
      x: c.x + 0.25, y: c.y + 0.42, w: c.w - 0.4, h: 0.22, fontSize: 9, fontFace: 'PingFang SC',
      color: t.muted
    });
    // 数据行（top3 用主色高亮）
    let ry = c.y + 0.78;
    c.rows.forEach((row, i) => {
      // bar 背景
      if (i === 0) {
        s.addShape('rect', { x: c.x + 0.2, y: ry, w: c.w - 0.4, h: 0.22, fill: { color: 'FFFFFF' }, line: { type: 'none' } });
      }
      s.addText(row[0], {
        x: c.x + 0.3, y: ry - 0.02, w: c.w - 1.4, h: 0.28, fontSize: 10.5, fontFace: 'PingFang SC',
        color: i === 0 ? t.ink : t.ink, bold: i === 0
      });
      s.addText(row[1], {
        x: c.x + c.w - 1.3, y: ry - 0.02, w: 1.1, h: 0.28, fontSize: 11.5, fontFace: 'Arial',
        color: i === 0 ? t.primary : t.ink, bold: true, align: 'right'
      });
      ry += 0.28;
    });
  });

  // So what 条
  s.addShape('rect', { x: 0.6, y: 6.65, w: 12.1, h: 0.4, fill: { color: t.light }, line: { type: 'none' } });
  s.addText('启示：本科 + 已婚未育/养育期 + Z 世代家户共同构成「年轻家庭生活者」核心叙事——内容应兼顾职场通勤与家庭生活场景', {
    x: 0.85, y: 6.65, w: 11.5, h: 0.4, fontSize: 11.5, fontFace: 'PingFang SC',
    color: t.primary, bold: true, valign: 'middle'
  });

  // 数据来源脚注
  s.addText('数据来源：26年8月森马天猫官旗.md（标签类型：预测职业 / 预测教育程度 / 预测人生阶段 / 预测家户类型）', {
    x: 0.6, y: 7.15, w: 12.1, h: 0.25, fontSize: 9, fontFace: 'PingFang SC',
    color: t.muted, italic: true
  });

  // 页码徽章
  s.addShape('ellipse', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fill: { color: t.accent2 }, line: { type: 'none' } });
  s.addText('06', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fontSize: 10, fontFace: 'Arial', color: 'FFFFFF', align: 'center', valign: 'middle' });

  return s;
}
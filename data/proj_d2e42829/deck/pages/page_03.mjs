// sources: 26年8月森马天猫官旗.md
// headline: @skip
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
  s.addText('目录  /  CONTENTS', {
    x: 0.85, y: 0.6, w: 8, h: 0.4, fontSize: 11, fontFace: 'PingFang SC',
    color: t.muted, charSpacing: 3, bold: true
  });
  s.addText('SEMIR', {
    x: 11.4, y: 0.6, w: 1.6, h: 0.4, fontSize: 10, fontFace: 'Arial',
    color: t.primary, bold: true, align: 'right', charSpacing: 4
  });

  // 大标题
  s.addText('目录', {
    x: 0.6, y: 1.25, w: 4, h: 0.7, fontSize: 36, fontFace: 'PingFang SC',
    color: t.primary, bold: true
  });
  s.addText('CONTENTS', {
    x: 0.6, y: 2.0, w: 4, h: 0.4, fontSize: 14, fontFace: 'Arial',
    color: t.accent1, charSpacing: 6, bold: true
  });

  // 六大章节条目（左半 - 大数字 + 章题 + 预告）
  const sections = [
    { no: '01', title: '基础人口学', desc: '性别、年龄、城市分布——女性 75.4% + 25-34 岁 52.86% + 新一线为主' },
    // calc: 31.11+21.75 = 52.86
    { no: '02', title: '社会属性', desc: '职业 / 教育 / 人生阶段 / 家户类型——年轻家庭生活者构成主流' },
    { no: '03', title: '购买力与价格心智', desc: '购买力 L 段 + 月消费 + 折扣敏感度——价格力是核心竞争力' },
    { no: '04', title: '服饰心智', desc: '策略人群 / 时尚度 / 服饰需求特征——潮流 + 显瘦 + 风格多元' },
    { no: '05', title: '品类偏好', desc: '一级 / 二级类目 + 家居风格——服饰外圈层延伸至母婴 / 居家 / 快消' },
    { no: '06', title: '行动建议与风险', desc: '90 天 / 6 月 / 12 月路线图 + 标签样本 / 合并 / 解读三层风险对策' }
  ];

  // 分两列排
  const col1 = sections.slice(0, 3);
  const col2 = sections.slice(3);

  const drawItem = (item, x, y) => {
    // 大数字
    s.addText(item.no, {
      x: x, y: y, w: 1.0, h: 1.0, fontSize: 44, fontFace: 'Arial',
      color: t.primary, bold: true
    });
    // 章题
    s.addText(item.title, {
      x: x + 1.05, y: y + 0.05, w: 4.0, h: 0.45, fontSize: 16, fontFace: 'PingFang SC',
      color: t.ink, bold: true
    });
    // 横线
    s.addShape('rect', { x: x + 1.05, y: y + 0.5, w: 4.4, h: 0.015, fill: { color: t.line }, line: { type: 'none' } });
    // 描述
    s.addText(item.desc, {
      x: x + 1.05, y: y + 0.55, w: 4.4, h: 0.45, fontSize: 10.5, fontFace: 'PingFang SC',
      color: t.muted, lineSpacingMultiple: 1.25
    });
  };

  col1.forEach((it, i) => drawItem(it, 0.6, 2.9 + i * 1.15));
  col2.forEach((it, i) => drawItem(it, 7.1, 2.9 + i * 1.15));

  // 右下角脚注
  s.addText('共 11 页  ·  执行摘要版', {
    x: 0.6, y: 6.95, w: 6, h: 0.3, fontSize: 10, fontFace: 'PingFang SC',
    color: t.muted
  });

  // 数据来源脚注
  s.addText('数据来源：26年8月森马天猫官旗.md', {
    x: 7.0, y: 6.95, w: 5.3, h: 0.3, fontSize: 9, fontFace: 'PingFang SC',
    color: t.muted, italic: true, align: 'right'
  });

  // 页码徽章
  s.addShape('ellipse', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fill: { color: t.accent2 }, line: { type: 'none' } });
  s.addText('03', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fontSize: 10, fontFace: 'Arial', color: 'FFFFFF', align: 'center', valign: 'middle' });

  return s;
}
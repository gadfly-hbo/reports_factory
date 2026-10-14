// sources: 26年8月森马天猫官旗.md
// headline: 数据可信用于结构叙事，但需注意 TGI 缺失 / 跨人群合并 / 模型预测偏差三项解读风险
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
  s.addText('风险与对策  /  RISKS & MITIGATIONS', {
    x: 0.85, y: 0.6, w: 8, h: 0.4, fontSize: 11, fontFace: 'PingFang SC',
    color: t.muted, charSpacing: 3, bold: true
  });
  s.addText('SEMIR', {
    x: 11.4, y: 0.6, w: 1.6, h: 0.4, fontSize: 10, fontFace: 'Arial',
    color: t.primary, bold: true, align: 'right', charSpacing: 4
  });

  // 一句话结论
  s.addText('数据可信用于结构叙事，但需注意 TGI 缺失 / 跨人群合并 / 模型预测偏差三项解读风险', {
    x: 0.6, y: 1.15, w: 12.1, h: 0.55, fontSize: 15, fontFace: 'PingFang SC',
    color: t.primary, bold: true
  });

  // 风险表（两列：风险 → 缓解措施，色码 chip）
  // 表头
  const tx = 0.6, ty = 1.95;
  s.addShape('rect', { x: tx, y: ty, w: 12.1, h: 0.42, fill: { color: t.accent1 }, line: { type: 'none' } });
  s.addText('风险', { x: tx + 0.2, y: ty, w: 5.0, h: 0.42, fontSize: 12, fontFace: 'PingFang SC', color: 'FFFFFF', bold: true, valign: 'middle' });
  s.addText('等级', { x: tx + 5.5, y: ty, w: 1.0, h: 0.42, fontSize: 12, fontFace: 'PingFang SC', color: 'FFFFFF', bold: true, valign: 'middle', align: 'center' });
  s.addText('缓解措施', { x: tx + 6.6, y: ty, w: 5.4, h: 0.42, fontSize: 12, fontFace: 'PingFang SC', color: 'FFFFFF', bold: true, valign: 'middle' });

  // 三行风险
  const risks = [
    {
      h: 'TGI 字段缺失，无法判断偏好相对大盘的偏离',
      level: '高', levelChip: t.primary,
      miti: '在大服饰策略 / 时尚度等结论性叙事时，标注「人群内结构观察」而非「相对大盘的相对偏好」；如需 TGI 对比，向数据银行额外申请大盘基线。'
    },
    {
      h: '4 组「线下门店_上」人群合并，可能掩盖子人群差异',
      level: '中', levelChip: t.accent2,
      miti: '按 4 组分别下钻查看 Top3 标签差异，识别是否合并稀释关键信号；若差异大则保留单组策略而非合并策略。'
    },
    {
      h: '占比按类型归一化，跨类型直接相加会失真',
      level: '中', levelChip: t.accent2,
      miti: '所有跨类型结论用「分别占比 + 文字说明」表达，不做百分数加和；图表严格按类型独立绘出。'
    },
    {
      h: '预测字段（性别 / 年龄 / 城市等）为平台模型预测，非自报',
      level: '中', levelChip: t.accent2,
      miti: '关键结论（如女性 75.4%）用官方数据银行口径原文表述，注明「平台预测，非自报」；下单 / 复购等行为数据交叉验证。'
    },
    {
      h: '无客单价、GMV 等营收字段，无法推算商业价值',
      level: '高', levelChip: t.primary,
      miti: '行动建议明确「需要进一步补充」消费金额 / 订单数据；下一阶段把数据银行人群回连 BI 订单表，补充客单 / GMV 视角。'
    }
  ];

  let ry = ty + 0.42;
  const rowH = 0.78;
  risks.forEach((r, i) => {
    if (i % 2 === 0) {
      s.addShape('rect', { x: tx, y: ry, w: 12.1, h: rowH, fill: { color: t.light }, line: { type: 'none' } });
    }
    // 风险标题
    s.addText(r.h, {
      x: tx + 0.2, y: ry + 0.05, w: 5.2, h: rowH - 0.1, fontSize: 11, fontFace: 'PingFang SC',
      color: t.ink, bold: true, valign: 'middle'
    });
    // 等级 chip
    s.addShape('roundRect', {
      x: tx + 5.5, y: ry + 0.22, w: 0.9, h: 0.32,
      fill: { color: r.levelChip }, line: { type: 'none' }, rectRadius: 0.04
    });
    s.addText(r.level, {
      x: tx + 5.5, y: ry + 0.22, w: 0.9, h: 0.32, fontSize: 11, fontFace: 'PingFang SC',
      color: 'FFFFFF', bold: true, align: 'center', valign: 'middle'
    });
    // 缓解措施
    s.addText(r.miti, {
      x: tx + 6.6, y: ry + 0.05, w: 5.4, h: rowH - 0.1, fontSize: 10, fontFace: 'PingFang SC',
      color: t.muted, valign: 'middle', lineSpacingMultiple: 1.25
    });
    ry += rowH;
  });

  // So what 条
  s.addShape('rect', { x: 0.6, y: 6.55, w: 12.1, h: 0.5, fill: { color: t.light }, line: { type: 'none' } });
  s.addText('启示：数据可信但解读需谨慎——所有结论标注「人群内结构 + 平台预测」口径，商业决策前补充行为数据交叉验证', {
    x: 0.85, y: 6.55, w: 11.5, h: 0.5, fontSize: 11.5, fontFace: 'PingFang SC',
    color: t.primary, bold: true, valign: 'middle'
  });

  // 数据来源脚注
  s.addText('数据来源：26年8月森马天猫官旗.md', {
    x: 0.6, y: 7.15, w: 8, h: 0.25, fontSize: 9, fontFace: 'PingFang SC',
    color: t.muted, italic: true
  });

  // 页码徽章
  s.addShape('ellipse', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fill: { color: t.accent2 }, line: { type: 'none' } });
  s.addText('11', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fontSize: 10, fontFace: 'Arial', color: 'FFFFFF', align: 'center', valign: 'middle' });

  return s;
}
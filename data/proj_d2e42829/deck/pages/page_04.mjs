// sources: 26年8月森马天猫官旗.md
// headline: 数据来自天猫品牌数据银行 4 组人群合并 / 554 条标签，无 TGI 与客单价需谨慎解读
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
  s.addText('研究方法  /  METHODOLOGY', {
    x: 0.85, y: 0.6, w: 8, h: 0.4, fontSize: 11, fontFace: 'PingFang SC',
    color: t.muted, charSpacing: 3, bold: true
  });
  s.addText('SEMIR', {
    x: 11.4, y: 0.6, w: 1.6, h: 0.4, fontSize: 10, fontFace: 'Arial',
    color: t.primary, bold: true, align: 'right', charSpacing: 4
  });

  // 一句话核心结论（headline 上页）
  s.addText('数据来自天猫品牌数据银行 4 组人群合并 / 554 条标签，无 TGI 与客单价需谨慎解读', {
    x: 0.6, y: 1.15, w: 12.1, h: 0.7, fontSize: 16, fontFace: 'PingFang SC',
    color: t.primary, bold: true, lineSpacingMultiple: 1.15
  });

  // 左：方法卡（数据来源列表 + 样本量/时间窗数字）
  s.addShape('rect', { x: 0.6, y: 2.0, w: 6.0, h: 4.5, fill: { color: t.light }, line: { color: t.line, width: 0.75 } });
  s.addText('方法卡  METHOD CARD', {
    x: 0.85, y: 2.15, w: 5, h: 0.3, fontSize: 11, fontFace: 'PingFang SC',
    color: t.accent1, bold: true, charSpacing: 3
  });

  const facts = [
    { k: '数据平台', v: '天猫品牌数据银行' },
    { k: '人群组数', v: '4 组（线下门店_上_第 1-4 组，2026 年 8 月采集）' },
    { k: '采集日期', v: '2026-08-26' },
    { k: '标签行数', v: '554 条' },
    { k: '输出字段', v: '标签类型 / 标签 / 占比 / TGI / PLS 层 / PLS 维度' },
    { k: 'PLS 维度', v: '基础人口学 / 综合身份聚类 / 物理数字环境 / 社会资产与购买力 / 价格与利益应激 / 圈层生活方式 / 创新与品牌心智 / 内容与视觉心智 / 转化决策摩擦' },
    { k: '占比口径', v: '按标签类型归一化至 100%（各类型内部相加=100%）' }
  ];

  let fy = 2.55;
  facts.forEach((f) => {
    s.addText(f.k, {
      x: 0.85, y: fy, w: 1.55, h: 0.32, fontSize: 10.5, fontFace: 'PingFang SC',
      color: t.muted, bold: true
    });
    s.addText(f.v, {
      x: 2.5, y: fy, w: 4.0, h: 0.55, fontSize: 10.5, fontFace: 'PingFang SC',
      color: t.ink, lineSpacingMultiple: 1.25
    });
    fy += 0.55;
  });

  // 右：局限性说明（诚实框）
  s.addShape('rect', { x: 6.95, y: 2.0, w: 5.75, h: 4.5, fill: { color: 'FFFFFF' }, line: { color: t.primary, width: 1.5 } });
  s.addText('局限性说明  CAVEATS', {
    x: 7.2, y: 2.15, w: 5, h: 0.3, fontSize: 11, fontFace: 'PingFang SC',
    color: t.primary, bold: true, charSpacing: 3
  });

  const caveats = [
    { h: '无 TGI 字段', b: '材料中 TGI 列为空，无法判断该偏好相对大盘的偏离程度，只能看人群内占比' },
    { h: '无客单价 / GMV', b: '仅有画像标签，未含消费金额、订单、复购等行为字段，不能直接推算营收' },
    { h: '线下门店人群为主', b: '数据来自 4 组「线下门店_上」人群，是已成交客户而非全店流量，存在幸存者偏差' },
    { h: '占比按类型归一化', b: '同一类型内相加=100%，跨类型不可直接相加（例：年龄段 100% 与城市等级 100% 是两个独立分布）' },
    { h: '预测字段非自报', b: '性别 / 年龄 / 城市 / 身高 / 体重 / 星座等均为平台模型预测，存在系统性偏差' }
  ];

  let cy = 2.55;
  caveats.forEach((c, i) => {
    // 小标号
    s.addShape('ellipse', { x: 7.2, y: cy + 0.06, w: 0.18, h: 0.18, fill: { color: t.primary }, line: { type: 'none' } });
    s.addText(String(i + 1), {
      x: 7.2, y: cy + 0.06, w: 0.18, h: 0.18, fontSize: 8, fontFace: 'Arial',
      color: 'FFFFFF', align: 'center', valign: 'middle', bold: true
    });
    s.addText(c.h, {
      x: 7.5, y: cy, w: 5.0, h: 0.3, fontSize: 12, fontFace: 'PingFang SC',
      color: t.ink, bold: true
    });
    s.addText(c.b, {
      x: 7.5, y: cy + 0.28, w: 5.0, h: 0.5, fontSize: 10, fontFace: 'PingFang SC',
      color: t.muted, lineSpacingMultiple: 1.25
    });
    cy += 0.78;
  });

  // 底部 So what 结论条
  s.addShape('rect', { x: 0.6, y: 6.55, w: 12.1, h: 0.5, fill: { color: t.light }, line: { type: 'none' } });
  s.addText('启示：数据可信用于「结构 / 偏好」叙事；客单价、ROI、复购等需另接行为数据交叉验证', {
    x: 0.85, y: 6.55, w: 11.5, h: 0.5, fontSize: 12, fontFace: 'PingFang SC',
    color: t.primary, bold: true, valign: 'middle'
  });

  // 数据来源脚注
  s.addText('数据来源：26年8月森马天猫官旗.md', {
    x: 0.6, y: 7.15, w: 8, h: 0.25, fontSize: 9, fontFace: 'PingFang SC',
    color: t.muted, italic: true
  });

  // 页码徽章
  s.addShape('ellipse', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fill: { color: t.accent2 }, line: { type: 'none' } });
  s.addText('04', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fontSize: 10, fontFace: 'Arial', color: 'FFFFFF', align: 'center', valign: 'middle' });

  return s;
}
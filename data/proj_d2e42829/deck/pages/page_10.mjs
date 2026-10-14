// sources: 26年8月森马天猫官旗.md
// headline: 三段路线图：90 天主价格心智 / 6 月主风格升级 / 12 月主复购渗透
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
  s.addText('06  /  行动建议', {
    x: 0.85, y: 0.6, w: 8, h: 0.4, fontSize: 11, fontFace: 'PingFang SC',
    color: t.muted, charSpacing: 3, bold: true
  });
  s.addText('SEMIR', {
    x: 11.4, y: 0.6, w: 1.6, h: 0.4, fontSize: 10, fontFace: 'Arial',
    color: t.primary, bold: true, align: 'right', charSpacing: 4
  });

  // 一句话结论
  s.addText('三段路线图：90 天主价格心智 / 6 月主风格升级 / 12 月主复购渗透', {
    x: 0.6, y: 1.15, w: 12.1, h: 0.6, fontSize: 16, fontFace: 'PingFang SC',
    color: t.primary, bold: true
  });

  // 时间轴横向三段
  // 时间轴主线
  const axisY = 2.15;
  s.addShape('rect', { x: 0.8, y: axisY, w: 11.7, h: 0.04, fill: { color: t.line }, line: { type: 'none' } });

  // 三个时间节点圆点
  const dots = [
    { x: 2.2, label: '速赢 90 天', color: t.primary },
    { x: 6.65, label: '中期 6 月', color: t.accent1 },
    { x: 11.1, label: '长期 12 月', color: t.accent2 }
  ];
  dots.forEach((d) => {
    s.addShape('ellipse', { x: d.x - 0.15, y: axisY - 0.13, w: 0.3, h: 0.3, fill: { color: d.color }, line: { type: 'none' } });
    s.addText(d.label, {
      x: d.x - 1.3, y: axisY - 0.7, w: 2.6, h: 0.35, fontSize: 13, fontFace: 'PingFang SC',
      color: d.color, bold: true, align: 'center'
    });
  });

  // 三段行动卡片
  const phases = [
    {
      x: 0.6, w: 3.85,
      title: '速赢 90 天',
      theme: '打透价格心智',
      owner: '电商运营 + 商品',
      urgency: '高',
      urgencyColor: t.primary,
      items: [
        { h: '折扣日历全节点覆盖', b: '围绕高折扣敏感人群 56.13%，按天猫官方会/品类日/品牌日三档节奏' },
        { h: '显瘦 / 优雅系列打爆', b: 'AI Top3 标签（25.76% 合计，做素材主推，做转化主战场' },
        // calc: 9.46+9.24+7.06 = 25.76
        { h: '潮流人群内容种草', b: '占大服饰策略 36.62%，用明星 / KOL 短期冲量' }
      ]
    },
    {
      x: 4.65, w: 3.85,
      title: '中期 6 月',
      theme: '升级风格心智',
      owner: '商品 + 品牌',
      urgency: '中',
      urgencyColor: t.accent2,
      items: [
        { h: '扩张文艺 / 简约 SKU', b: '女装风格文艺 18.46% + 简约 17.59%，是 Top2 双引擎' },
        { h: '男士「大气简约商务」上线', b: 'AI 标签占 5.03%，承接 24.6% 男性客群' },
        { h: '复古 / 现代简约家居联名', b: '家居风格双峰 23.86% + 23.6%，做场景化跨界' }
      ]
    },
    {
      x: 8.7, w: 4.0,
      title: '长期 12 月',
      theme: '渗透生活圈层',
      owner: '用户增长 + 品类拓展',
      urgency: '中',
      urgencyColor: t.accent2,
      items: [
        { h: '母婴 / 童装 / 童鞋交叉品类', b: '一级类目合计 4.75% + 4.71%，切入年轻家庭心智' },
        { h: 'Z 世代家户深度运营', b: '占 65.96%，建立私域 + 会员体系，做长 LTV' },
        { h: '新一线 / 二线门店联动', b: '城市 Top10 中 9 个非一线，O2O 同款同价同券' }
      ]
    }
  ];

  phases.forEach((p) => {
    // 卡片框
    s.addShape('rect', { x: p.x, y: 2.5, w: p.w, h: 3.95, fill: { color: t.light }, line: { type: 'none' } });
    // 顶部色带
    s.addShape('rect', { x: p.x, y: 2.5, w: p.w, h: 0.5, fill: { color: p.urgencyColor }, line: { type: 'none' } });
    s.addText(p.title, {
      x: p.x + 0.2, y: 2.55, w: p.w - 0.4, h: 0.4, fontSize: 14, fontFace: 'PingFang SC',
      color: 'FFFFFF', bold: true, valign: 'middle'
    });
    // urgency chip
    s.addShape('roundRect', {
      x: p.x + p.w - 0.85, y: 2.65, w: 0.65, h: 0.22,
      fill: { color: 'FFFFFF' }, line: { type: 'none' }, rectRadius: 0.03
    });
    s.addText(p.urgency, {
      x: p.x + p.w - 0.85, y: 2.65, w: 0.65, h: 0.22, fontSize: 9, fontFace: 'PingFang SC',
      color: p.urgencyColor, bold: true, align: 'center', valign: 'middle'
    });
    // 主题
    s.addText('主题：' + p.theme, {
      x: p.x + 0.2, y: 3.1, w: p.w - 0.4, h: 0.3, fontSize: 12, fontFace: 'PingFang SC',
      color: t.ink, bold: true
    });
    // 责任方
    s.addText('责任方：' + p.owner, {
      x: p.x + 0.2, y: 3.4, w: p.w - 0.4, h: 0.25, fontSize: 9.5, fontFace: 'PingFang SC',
      color: t.muted
    });
    // 行动项
    let iy = 3.75;
    p.items.forEach((it, i) => {
      s.addShape('ellipse', { x: p.x + 0.2, y: iy + 0.04, w: 0.16, h: 0.16, fill: { color: p.urgencyColor }, line: { type: 'none' } });
      s.addText(String(i + 1), {
        x: p.x + 0.2, y: iy + 0.04, w: 0.16, h: 0.16, fontSize: 8, fontFace: 'Arial',
        color: 'FFFFFF', align: 'center', valign: 'middle', bold: true
      });
      s.addText(it.h, {
        x: p.x + 0.45, y: iy, w: p.w - 0.6, h: 0.28, fontSize: 11, fontFace: 'PingFang SC',
        color: t.ink, bold: true
      });
      s.addText(it.b, {
        x: p.x + 0.45, y: iy + 0.26, w: p.w - 0.6, h: 0.45, fontSize: 9, fontFace: 'PingFang SC',
        color: t.muted, lineSpacingMultiple: 1.25
      });
      iy += 0.82;
    });
  });

  // So what 条
  s.addShape('rect', { x: 0.6, y: 6.55, w: 12.1, h: 0.5, fill: { color: t.light }, line: { type: 'none' } });
  s.addText('启示：从「价格力变现」切入建立基本盘，6 月做风格升级，12 月做生活圈层渗透——节奏与人群心智同步推进', {
    x: 0.85, y: 6.55, w: 11.5, h: 0.5, fontSize: 12, fontFace: 'PingFang SC',
    color: t.primary, bold: true, valign: 'middle'
  });

  // 数据来源脚注
  s.addText('数据来源：26年8月森马天猫官旗.md', {
    x: 0.6, y: 7.15, w: 12.1, h: 0.25, fontSize: 9, fontFace: 'PingFang SC',
    color: t.muted, italic: true
  });

  // 页码徽章
  s.addShape('ellipse', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fill: { color: t.accent2 }, line: { type: 'none' } });
  s.addText('10', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fontSize: 10, fontFace: 'Arial', color: 'FFFFFF', align: 'center', valign: 'middle' });

  return s;
}
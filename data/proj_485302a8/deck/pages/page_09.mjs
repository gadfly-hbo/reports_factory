// Page 09 / Action Items — 行动建议：按商家类型给出主阵地与最小闭环
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
  s.addText('07  ·  ACTION  ITEMS', {
    x: 0.6, y: 0.7, w: 8, h: 0.35,
    fontFace: 'Arial', fontSize: 10, color: t.accent2, bold: true, charSpacing: 4,
  });

  // 大标题
  s.addText('行动建议：按商家类型给出主阵地与最小闭环', {
    x: 0.6, y: 1.1, w: 12, h: 0.7,
    fontFace: 'PingFang SC', fontSize: 26, color: t.primary, bold: true,
  });
  s.addText('先跑通一个最小闭环（钩子 → 首单 → 复购 → 转介绍），再放大——胜率最高的路径', {
    x: 0.6, y: 1.82, w: 12, h: 0.4,
    fontFace: 'PingFang SC', fontSize: 13, color: t.accent2,
  });

  // ===== 行动表 =====
  const tableX = 0.6, tableY = 2.45, tableW = 12.13;
  const colW = [2.05, 2.5, 2.5, 5.08]; // 类型/公域/私域/动作
  const headers = ['商家类型', '公域主阵地', '私域承接', '核心动作'];

  const rows = [
    {
      type: '新消费品牌',
      tag: 'BRAND',
      public: '抖音内容 + 小红书种草',
      private: '企微社群 + 微信小店',
      action: '公域钩子引流 → 24h 首单 → 分层复购；私域晒单 UGC 反哺公域投放',
    },
    {
      type: '产业带 / 白牌',
      tag: 'WHITE  LABEL',
      public: '拼多多 + 抖音商城商品卡',
      private: '轻私域（包裹卡 + 社群秒杀）',
      action: '极致性价比吃活动流量；私域只做复购、不做人设',
    },
    {
      type: '高客单 / 高决策',
      tag: 'HIGH  TICKET',
      public: '小红书搜索 + 视频号',
      private: '1 对 1 企微顾问式服务',
      action: '内容显专业、私域建信任；摒弃打折促销，做品质与精细化服务',
    },
    {
      type: '线下连锁',
      tag: 'OFFLINE',
      public: '视频号同城 + 抖音同城',
      private: '门店活码 + 会员小程序',
      action: '门店即流量入口；社交裂变 + 每周会员日，线上线下联动',
    },
    {
      type: '淘宝存量商家',
      tag: 'TAOBAO',
      public: '淘宝搜索 + 品质店播',
      private: '包裹卡 + 短信 + 企微',
      action: '达摩盘无界回流；站外种草 50% + 潜在人群 40%；店播拿百亿流量扶持',
    },
  ];

  // 表头
  s.addShape('rect', {
    x: tableX, y: tableY, w: tableW, h: 0.5,
    fill: { color: t.primary }, line: { type: 'none' },
  });
  let xc = tableX;
  headers.forEach((h, i) => {
    s.addText(h, {
      x: xc + 0.1, y: tableY, w: colW[i] - 0.15, h: 0.5,
      fontFace: 'PingFang SC', fontSize: 12, color: 'FFFFFF', bold: true,
      valign: 'middle', align: i === 0 ? 'left' : 'center',
    });
    xc += colW[i];
  });

  // 数据行
  const rowH = 0.66;
  rows.forEach((r, ri) => {
    const y = tableY + 0.5 + ri * rowH;
    // 行底色交替
    s.addShape('rect', {
      x: tableX, y, w: tableW, h: rowH,
      fill: { color: ri % 2 === 0 ? t.light : 'FFFFFF' }, line: { type: 'none' },
    });
    // 行间细线
    s.addShape('rect', {
      x: tableX, y: y + rowH, w: tableW, h: 0.005,
      fill: { color: t.line }, line: { type: 'none' },
    });

    // 类型列特殊处理
    s.addShape('rect', {
      x: tableX, y, w: 0.08, h: rowH,
      fill: { color: t.accent1 }, line: { type: 'none' },
    });
    s.addText(r.type, {
      x: tableX + 0.2, y: y + 0.1, w: colW[0] - 0.25, h: 0.3,
      fontFace: 'PingFang SC', fontSize: 12, color: t.primary, bold: true,
      valign: 'middle',
    });
    s.addText(r.tag, {
      x: tableX + 0.2, y: y + 0.38, w: colW[0] - 0.25, h: 0.22,
      fontFace: 'Arial', fontSize: 8, color: t.muted, charSpacing: 2,
      valign: 'middle',
    });

    let xc2 = tableX + colW[0];
    [r.public, r.private, r.action].forEach((cell, j) => {
      s.addText(cell, {
        x: xc2 + 0.1, y, w: colW[j + 1] - 0.15, h: rowH,
        fontFace: 'PingFang SC', fontSize: 10, color: t.ink,
        valign: 'middle', align: j === 2 ? 'left' : 'center',
        lineSpacingMultiple: 1.3,
      });
      xc2 += colW[j + 1];
    });
  });

  // 最小闭环公式条
  s.addShape('rect', {
    x: 0.6, y: 6.25, w: 12.13, h: 0.6,
    fill: { color: t.primary }, line: { type: 'none' },
  });
  s.addText('最小闭环', {
    x: 0.85, y: 6.25, w: 1.3, h: 0.6,
    fontFace: 'PingFang SC', fontSize: 11, color: t.accent1, bold: true,
    valign: 'middle',
  });
  s.addText([
    { text: '一个钩子 ', options: { color: 'FFFFFF' } },
    { text: '→ ', options: { color: t.accent1, bold: true } },
    { text: '一次首单 ', options: { color: 'FFFFFF' } },
    { text: '→ ', options: { color: t.accent1, bold: true } },
    { text: '一次复购 ', options: { color: 'FFFFFF' } },
    { text: '→ ', options: { color: t.accent1, bold: true } },
    { text: '一次转介绍', options: { color: 'FFFFFF' } },
  ], {
    x: 2.2, y: 6.25, w: 10.5, h: 0.6,
    fontFace: 'PingFang SC', fontSize: 14, bold: true, valign: 'middle',
  });

  // 底部收尾
  s.addText('把每一分流量支出转化为可复用的用户资产——公域决定下限，私域决定上限', {
    x: 0.6, y: 6.95, w: 12.13, h: 0.32,
    fontFace: 'PingFang SC', fontSize: 11, color: t.ink, align: 'center',
  });

  // 页码徽章
  s.addShape('ellipse', { x: 12.55, y: 7.32, w: 0.3, h: 0.3, fill: { color: t.accent1 } });
  s.addText('09', {
    x: 12.55, y: 7.32, w: 0.3, h: 0.3,
    fontFace: 'Arial', fontSize: 9, color: 'FFFFFF', align: 'center', valign: 'middle', bold: true,
  });

  return s;
}
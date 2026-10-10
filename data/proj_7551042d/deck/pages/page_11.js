// page_11: action_items — 行动建议：五类商家差异化公私域布局
export function buildSlide(pptx) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };

  slide.addShape("rect", {
    x: 0, y: 0, w: 13.333, h: 0.08,
    fill: { color: "B44626" }, line: { color: "B44626" }
  });

  slide.addText("行动建议：五类商家差异化公私域布局", {
    x: 0.6, y: 0.35, w: 12, h: 0.55,
    fontFace: "Microsoft YaHei", fontSize: 26, color: "263442", bold: true
  });
  slide.addText("按商家类型选择公域主阵地 + 私域承接 + 核心动作", {
    x: 0.6, y: 0.95, w: 12.2, h: 0.45,
    fontFace: "Microsoft YaHei", fontSize: 14, color: "5A6675"
  });

  // 表头
  const headers = ["商家类型", "公域主阵地", "私域承接", "核心动作"];
  const colX = [0.6, 2.4, 5.4, 8.4];
  const colW = [1.8, 3.0, 3.0, 4.4];

  slide.addShape("rect", {
    x: 0.6, y: 1.7, w: 12.2, h: 0.5,
    fill: { color: "263442" }, line: { color: "263442" }
  });
  headers.forEach((h, i) => {
    slide.addText(h, {
      x: colX[i] + 0.1, y: 1.75, w: colW[i] - 0.15, h: 0.4,
      fontFace: "Microsoft YaHei", fontSize: 13, color: "FFFFFF", bold: true
    });
  });

  const rows = [
    {
      t: "新消费品牌",
      pub: "抖音内容 + 小红书种草",
      pri: "企微社群 + 微信小店",
      act: "公域钩子引流 → 24h 首单 → 分层复购；私域晒单素材反哺公域投放"
    },
    {
      t: "产业带 / 白牌",
      pub: "拼多多 + 抖音商城商品卡",
      pri: "轻私域（包裹卡 + 社群秒杀）",
      act: "性价比吃活动流量；私域只做复购、不做人设"
    },
    {
      t: "高客单 / 高决策",
      pub: "小红书搜索 + 视频号",
      pri: "1 对 1 企微顾问式服务",
      act: "内容显专业、私域建信任；摒弃打折促销"
    },
    {
      t: "线下连锁",
      pub: "视频号同城 + 抖音同城",
      pri: "门店活码 + 会员小程序",
      act: "门店即流量入口；社交裂变 + 每周会员日"
    },
    {
      t: "淘宝存量商家",
      pub: "淘宝搜索 + 品质店播",
      pri: "包裹卡 + 短信 + 企微",
      act: "人群资产无界回流；站外种草站内收割"
    }
  ];

  const rowH = 0.86;
  rows.forEach((r, i) => {
    const y = 2.25 + i * rowH;
    slide.addShape("rect", {
      x: 0.6, y, w: 12.2, h: rowH - 0.06,
      fill: { color: i % 2 === 0 ? "FFFFFF" : "F4F5F7" },
      line: { color: "E2E5EA", width: 0.4 }
    });
    // 类型色条
    slide.addShape("rect", {
      x: 0.6, y, w: 0.08, h: rowH - 0.06,
      fill: { color: "B44626" }, line: { color: "B44626" }
    });
    slide.addText(r.t, {
      x: colX[0] + 0.18, y: y + 0.18, w: colW[0] - 0.2, h: rowH - 0.3,
      fontFace: "Microsoft YaHei", fontSize: 13, color: "263442", bold: true
    });
    slide.addText(r.pub, {
      x: colX[1] + 0.1, y: y + 0.13, w: colW[1] - 0.15, h: rowH - 0.2,
      fontFace: "Microsoft YaHei", fontSize: 11, color: "B44626", bold: true
    });
    slide.addText(r.pri, {
      x: colX[2] + 0.1, y: y + 0.13, w: colW[2] - 0.15, h: rowH - 0.2,
      fontFace: "Microsoft YaHei", fontSize: 11, color: "263442"
    });
    slide.addText(r.act, {
      x: colX[3] + 0.1, y: y + 0.1, w: colW[3] - 0.15, h: rowH - 0.15,
      fontFace: "Microsoft YaHei", fontSize: 10, color: "5A6675"
    });
  });

  // 底部：路径闭环
  slide.addShape("rect", {
    x: 0.6, y: 6.75, w: 12.2, h: 0.6,
    fill: { color: "B44626" }, line: { color: "B44626" }
  });
  slide.addText("胜率最高的路径", {
    x: 0.85, y: 6.78, w: 2.6, h: 0.55,
    fontFace: "Microsoft YaHei", fontSize: 12, color: "FFFFFF", bold: true
  });
  slide.addText(
    "先把一个最小闭环跑通（钩子 → 首单 → 复购 → 转介绍），再规模化放大",
    {
      x: 3.5, y: 6.85, w: 9.2, h: 0.45,
      fontFace: "Microsoft YaHei", fontSize: 13, color: "FFFFFF", bold: true
    }
  );
}
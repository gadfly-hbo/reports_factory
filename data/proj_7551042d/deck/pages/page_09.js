// page_09: content — 微信小店：唯一「公域—交易—私域」原生闭环
export function buildSlide(pptx) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };

  slide.addShape("rect", {
    x: 0, y: 0, w: 13.333, h: 0.08,
    fill: { color: "B44626" }, line: { color: "B44626" }
  });

  slide.addText("微信小店：唯一「公域—交易—私域」原生闭环", {
    x: 0.6, y: 0.35, w: 12, h: 0.55,
    fontFace: "Microsoft YaHei", fontSize: 26, color: "263442", bold: true
  });
  slide.addText("无需跨平台的完整生态——2025 年 5 月腾讯成立电商产品部，微信小店成为核心闭环", {
    x: 0.6, y: 0.95, w: 12.2, h: 0.45,
    fontFace: "Microsoft YaHei", fontSize: 14, color: "5A6675"
  });

  // 顶部核心数字条
  const topStats = [
    { k: "8 亿", t: "视频号 DAU / +45% 同比" },
    { k: "6000 亿", t: "微信电商 GMV / +225%" },
    { k: "4.3 倍", t: "品牌带货增速 / 平台大盘" },
    { k: "67%", t: "视频号 45 岁+ 用户占比" }
  ];
  topStats.forEach((s, i) => {
    const x = 0.6 + i * 3.1;
    const y = 1.7;
    slide.addShape("rect", {
      x, y, w: 2.9, h: 1.05,
      fill: { color: "263442" }, line: { color: "263442" }
    });
    slide.addShape("rect", {
      x, y, w: 2.9, h: 0.06,
      fill: { color: "B44626" }, line: { color: "B44626" }
    });
    slide.addText(s.k, {
      x: x + 0.15, y: y + 0.15, w: 2.6, h: 0.5,
      fontFace: "Microsoft YaHei", fontSize: 22, color: "B44626", bold: true
    });
    slide.addText(s.t, {
      x: x + 0.15, y: y + 0.62, w: 2.6, h: 0.4,
      fontFace: "Microsoft YaHei", fontSize: 11, color: "D8DCE3"
    });
  });

  // 中部：飞轮链
  const chain = ["公域获新", "小店成交", "私域沉淀", "复购裂变", "新公域曝光"];
  const chainY = 3.05;
  const stepW = 2.3;
  const stepGap = 0.2;
  const totalW = chain.length * stepW + (chain.length - 1) * stepGap;
  const startX = (13.333 - totalW) / 2;
  chain.forEach((s, i) => {
    const x = startX + i * (stepW + stepGap);
    slide.addShape("rect", {
      x, y: chainY, w: stepW, h: 0.8,
      fill: { color: "FFF2EE" }, line: { color: "B44626", width: 0.7 }
    });
    slide.addText(s, {
      x, y: chainY + 0.18, w: stepW, h: 0.5,
      fontFace: "Microsoft YaHei", fontSize: 14, color: "B44626", bold: true, align: "center"
    });
    if (i < chain.length - 1) {
      slide.addShape("rightTriangle", {
        x: x + stepW + 0.02, y: chainY + 0.3, w: 0.18, h: 0.32,
        fill: { color: "B44626" }, line: { color: "B44626" }, rotate: 90
      });
    }
  });

  // 下半：核心能力 + 落地案例
  // 左：核心能力
  slide.addText("核心裂变能力", {
    x: 0.6, y: 4.15, w: 6.0, h: 0.4,
    fontFace: "Microsoft YaHei", fontSize: 14, color: "263442", bold: true
  });
  const caps = [
    { t: "送礼物", d: "三只松鼠双周 1500 万销售额" },
    { t: "点赞买", d: "维达新客贡献「小店+卡包」入口 90%" },
    { t: "一起买 / 搭配购", d: "社交场景降低决策门槛" }
  ];
  caps.forEach((c, i) => {
    const x = 0.6 + i * 2.05;
    const y = 4.65;
    slide.addShape("rect", {
      x, y, w: 1.9, h: 1.55,
      fill: { color: "F4F5F7" }, line: { color: "E2E5EA", width: 0.4 }
    });
    slide.addShape("rect", {
      x, y, w: 1.9, h: 0.08,
      fill: { color: "B44626" }, line: { color: "B44626" }
    });
    slide.addText(c.t, {
      x: x + 0.15, y: y + 0.2, w: 1.6, h: 0.4,
      fontFace: "Microsoft YaHei", fontSize: 14, color: "B44626", bold: true
    });
    slide.addText(c.d, {
      x: x + 0.15, y: y + 0.65, w: 1.6, h: 0.85,
      fontFace: "Microsoft YaHei", fontSize: 11, color: "5A6675"
    });
  });

  // 右：落地案例 + 窗口期判断
  slide.addShape("rect", {
    x: 7.3, y: 4.15, w: 5.5, h: 2.95,
    fill: { color: "263442" }, line: { color: "263442" }
  });
  slide.addText("超级品牌日案例", {
    x: 7.45, y: 4.25, w: 5.2, h: 0.4,
    fontFace: "Microsoft YaHei", fontSize: 13, color: "B44626", bold: true
  });
  slide.addText(
    "鄂尔多斯：3 天销售 1700 万+，新客占比 88%\n京润珍珠：活动期销售 4305 万，新客占比 70%",
    {
      x: 7.45, y: 4.65, w: 5.2, h: 0.95,
      fontFace: "Microsoft YaHei", fontSize: 12, color: "FFFFFF"
    }
  );
  slide.addShape("rect", {
    x: 7.45, y: 5.7, w: 5.2, h: 0.04,
    fill: { color: "B44626" }, line: { color: "B44626" }
  });
  slide.addText("窗口期判断", {
    x: 7.45, y: 5.85, w: 5.2, h: 0.35,
    fontFace: "Microsoft YaHei", fontSize: 13, color: "B44626", bold: true
  });
  slide.addText(
    "获客成本低 30% / 退货率低于其他平台\n适合：有私域基础 + 高复购品类 + 愿意持续经营",
    {
      x: 7.45, y: 6.2, w: 5.2, h: 0.85,
      fontFace: "Microsoft YaHei", fontSize: 11, color: "D8DCE3"
    }
  );

  // 底部
  slide.addShape("rect", {
    x: 0.6, y: 7.15, w: 12.2, h: 0.18,
    fill: { color: "B44626" }, line: { color: "B44626" }
  });
}
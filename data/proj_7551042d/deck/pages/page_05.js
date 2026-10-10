// page_05: issue_breakdown — 公域获客成本三年涨 63%，私域仅 30–60 元
export function buildSlide(pptx) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };

  slide.addShape("rect", {
    x: 0, y: 0, w: 13.333, h: 0.08,
    fill: { color: "B44626" }, line: { color: "B44626" }
  });

  slide.addText("公私域成本差 18 倍，私域已过拐点", {
    x: 0.6, y: 0.35, w: 12, h: 0.55,
    fontFace: "Microsoft YaHei", fontSize: 26, color: "263442", bold: true
  });
  slide.addText("可重复、低成本触达——私域成为存量时代的经营主阵地", {
    x: 0.6, y: 0.95, w: 12.2, h: 0.45,
    fontFace: "Microsoft YaHei", fontSize: 14, color: "5A6675"
  });

  // 左侧大数字对比：公域 vs 私域
  // 公域卡
  slide.addShape("rect", {
    x: 0.6, y: 1.7, w: 5.9, h: 2.8,
    fill: { color: "F4F5F7" }, line: { color: "E2E5EA", width: 0.5 }
  });
  slide.addText("公 域", {
    x: 0.85, y: 1.85, w: 5.5, h: 0.4,
    fontFace: "Microsoft YaHei", fontSize: 13, color: "8B95A1", bold: true
  });
  slide.addText("620 元", {
    x: 0.85, y: 2.25, w: 5.5, h: 0.9,
    fontFace: "Microsoft YaHei", fontSize: 48, color: "8B95A1", bold: true
  });
  slide.addText("/ 人 · 综合电商 2026 Q1", {
    x: 0.85, y: 3.15, w: 5.5, h: 0.35,
    fontFace: "Microsoft YaHei", fontSize: 12, color: "5A6675"
  });
  slide.addText(
    "三年累计涨幅 +63%\n头部新消费品牌突破 900 元\n抖音电商单次新客均值突破千元",
    {
      x: 0.85, y: 3.55, w: 5.5, h: 0.9,
      fontFace: "Microsoft YaHei", fontSize: 12, color: "5A6675"
    }
  );

  // 私域卡（铁锈橘突出）
  slide.addShape("rect", {
    x: 6.9, y: 1.7, w: 5.9, h: 2.8,
    fill: { color: "FFF2EE" }, line: { color: "B44626", width: 1.2 }
  });
  slide.addText("私 域", {
    x: 7.15, y: 1.85, w: 5.5, h: 0.4,
    fontFace: "Microsoft YaHei", fontSize: 13, color: "B44626", bold: true
  });
  slide.addText("30–60 元", {
    x: 7.15, y: 2.25, w: 5.5, h: 0.9,
    fontFace: "Microsoft YaHei", fontSize: 48, color: "B44626", bold: true
  });
  slide.addText("/ 人 · 私域成熟商家单次获取", {
    x: 7.15, y: 3.15, w: 5.5, h: 0.35,
    fontFace: "Microsoft YaHei", fontSize: 12, color: "5A6675"
  });
  slide.addText(
    "78.8% 品牌已完成私域布局\n微信/企微生态占比超 53%\n头部美妆私域 ROI 达 1 : 6.8",
    {
      x: 7.15, y: 3.55, w: 5.5, h: 0.9,
      fontFace: "Microsoft YaHei", fontSize: 12, color: "5A6675"
    }
  );

  // 中间「18 倍」标签
  slide.addShape("ellipse", {
    x: 5.85, y: 2.6, w: 1.7, h: 1.0,
    fill: { color: "B44626" }, line: { color: "B44626" }
  });
  slide.addText("18×", {
    x: 5.85, y: 2.7, w: 1.7, h: 0.5,
    fontFace: "Microsoft YaHei", fontSize: 22, color: "FFFFFF", bold: true, align: "center"
  });
  slide.addText("成本差", {
    x: 5.85, y: 3.15, w: 1.7, h: 0.4,
    fontFace: "Microsoft YaHei", fontSize: 11, color: "FFFFFF", align: "center"
  });

  // 底部三个数据指标
  const kpis = [
    { k: "3.2×", t: "复购率", desc: "企微私域是公域渠道的 3.2 倍" },
    { k: "4.7×", t: "转介绍率", desc: "私域口碑裂变是公域的 4.7 倍" },
    { k: "1 : 6.8", t: "私域 ROI", desc: "头部美妆品牌落地实测" }
  ];
  kpis.forEach((k, i) => {
    const x = 0.6 + i * 4.1;
    const y = 4.85;
    slide.addShape("rect", {
      x, y, w: 3.9, h: 1.6,
      fill: { color: "FFFFFF" }, line: { color: "B44626", width: 0.8 }
    });
    slide.addText(k.k, {
      x: x + 0.2, y: y + 0.15, w: 3.5, h: 0.65,
      fontFace: "Microsoft YaHei", fontSize: 28, color: "B44626", bold: true
    });
    slide.addText(k.t, {
      x: x + 0.2, y: y + 0.8, w: 3.5, h: 0.35,
      fontFace: "Microsoft YaHei", fontSize: 13, color: "263442", bold: true
    });
    slide.addText(k.desc, {
      x: x + 0.2, y: y + 1.15, w: 3.5, h: 0.35,
      fontFace: "Microsoft YaHei", fontSize: 11, color: "5A6675"
    });
  });

  // 底部结论条
  slide.addShape("rect", {
    x: 0.6, y: 6.75, w: 12.2, h: 0.55,
    fill: { color: "263442" }, line: { color: "263442" }
  });
  slide.addText(
    "结论：公域决定增长下限（新客规模），私域决定增长上限（LTV 与利润）",
    {
      x: 0.85, y: 6.82, w: 11.8, h: 0.45,
      fontFace: "Microsoft YaHei", fontSize: 14, color: "FFFFFF", bold: true
    }
  );
}
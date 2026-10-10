// page_02: metrics_overview — 全网 MAU 见顶、CAC 三年涨 63%
export function buildSlide(pptx) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };

  // 顶部细条
  slide.addShape("rect", {
    x: 0, y: 0, w: 13.333, h: 0.08,
    fill: { color: "B44626" }, line: { color: "B44626" }
  });

  // 标题
  slide.addText("全网 MAU 见顶、CAC 三年涨 63%", {
    x: 0.6, y: 0.35, w: 12, h: 0.55,
    fontFace: "Microsoft YaHei", fontSize: 26, color: "263442", bold: true
  });
  slide.addText("行业从增量红利切换至存量博弈——平台争抢时长与钱包份额，商家争抢经营效率与用户资产", {
    x: 0.6, y: 0.95, w: 12.2, h: 0.45,
    fontFace: "Microsoft YaHei", fontSize: 14, color: "5A6675"
  });

  // 四张卡片式数字
  const cards = [
    {
      k: "12.82 亿", t: "全网 MAU", sub: "2026/06 · 同比 +1.2%",
      desc: "移动互联网用户规模触顶，行业级流量池封顶"
    },
    {
      k: "92.6%", t: "短视频渗透率", sub: "2026 Q2",
      desc: "用户时长高度集中于内容平台，电商竞争转向时长与复购"
    },
    {
      k: "620 元", t: "公域获客成本", sub: "2026 Q1 / 较 2023 年 +63%",
      desc: "三年涨幅超 63%，美妆食品等头部新消费品牌突破 900 元"
    },
    {
      k: "-12.5%", t: "电商从业者数量", sub: "2025/06 同比",
      desc: "平台活跃商家同步下降，存量压力已传导至供给侧"
    }
  ];

  cards.forEach((c, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.6 + col * 6.2;
    const y = 1.7 + row * 2.55;

    // 卡片底框（浅灰）
    slide.addShape("rect", {
      x, y, w: 5.9, h: 2.25,
      fill: { color: "F4F5F7" }, line: { color: "E2E5EA", width: 0.75 }
    });
    // 左侧铁锈橘竖条
    slide.addShape("rect", {
      x, y, w: 0.1, h: 2.25,
      fill: { color: "B44626" }, line: { color: "B44626" }
    });

    slide.addText(c.k, {
      x: x + 0.3, y: y + 0.18, w: 3.0, h: 0.7,
      fontFace: "Microsoft YaHei", fontSize: 30, color: "B44626", bold: true
    });
    slide.addText(c.t, {
      x: x + 0.3, y: y + 0.92, w: 5.3, h: 0.4,
      fontFace: "Microsoft YaHei", fontSize: 14, color: "263442", bold: true
    });
    slide.addText(c.sub, {
      x: x + 0.3, y: y + 1.28, w: 5.3, h: 0.35,
      fontFace: "Microsoft YaHei", fontSize: 11, color: "8B95A1", italic: true
    });
    slide.addText(c.desc, {
      x: x + 0.3, y: y + 1.65, w: 5.4, h: 0.55,
      fontFace: "Microsoft YaHei", fontSize: 11, color: "5A6675"
    });
  });

  // 底部结语
  slide.addText(
    "结论：单次流量采购 ROI 持续走低，必须把每一次公域曝光都转化为可重复触达的用户资产",
    {
      x: 0.6, y: 6.95, w: 12.2, h: 0.4,
      fontFace: "Microsoft YaHei", fontSize: 13, color: "263442", bold: true
    }
  );
}
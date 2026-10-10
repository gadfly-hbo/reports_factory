// page_01: cover — 国内电商进入存量博弈，公私域成本差达 18 倍
export function buildSlide(pptx) {
  const slide = pptx.addSlide();

  // 背景：深藏青
  slide.background = { color: "263442" };

  // 顶部装饰条：铁锈橘
  slide.addShape("rect", {
    x: 0, y: 0, w: 13.333, h: 0.18,
    fill: { color: "B44626" }, line: { color: "B44626" }
  });

  // 报告副标识
  slide.addText("2025–2026 国内电商平台流量趋势与公私域打法研究", {
    x: 0.7, y: 0.7, w: 12, h: 0.45,
    fontFace: "Microsoft YaHei", fontSize: 16, color: "B44626", bold: true
  });

  // 主标题
  slide.addText("国内电商进入存量博弈", {
    x: 0.7, y: 1.7, w: 12, h: 1.1,
    fontFace: "Microsoft YaHei", fontSize: 44, color: "FFFFFF", bold: true
  });
  slide.addText("公私域成本差达 18 倍", {
    x: 0.7, y: 2.85, w: 12, h: 1.1,
    fontFace: "Microsoft YaHei", fontSize: 44, color: "FFFFFF", bold: true
  });

  // 分割细线
  slide.addShape("rect", {
    x: 0.7, y: 4.15, w: 1.2, h: 0.04,
    fill: { color: "B44626" }, line: { color: "B44626" }
  });

  // 副标题/核心判断
  slide.addText(
    "2026 年电商经营的主命题从「在哪里买流量」切换为「如何把每一分流量支出转化为可复用的用户资产」",
    {
      x: 0.7, y: 4.4, w: 11.5, h: 1.1,
      fontFace: "Microsoft YaHei", fontSize: 18, color: "D8DCE3"
    }
  );

  // 三个关键数字
  const stats = [
    { k: "12.8 亿", v: "全网 MAU / 同比仅 +1.2%" },
    { k: "620 元", v: "公域获客成本 / 三年 +63%" },
    { k: "18 倍", v: "公私域单客获取成本差距" }
  ];
  stats.forEach((s, i) => {
    const x = 0.7 + i * 4.0;
    slide.addText(s.k, {
      x, y: 5.7, w: 3.6, h: 0.7,
      fontFace: "Microsoft YaHei", fontSize: 30, color: "B44626", bold: true
    });
    slide.addText(s.v, {
      x, y: 6.4, w: 3.6, h: 0.45,
      fontFace: "Microsoft YaHei", fontSize: 13, color: "D8DCE3"
    });
  });

  // 底部脚注
  slide.addText("数据来源：有米有数 · QuestMobile · TMO Group · 艾瑞咨询 · 凤凰网", {
    x: 0.7, y: 7.05, w: 12, h: 0.35,
    fontFace: "Microsoft YaHei", fontSize: 11, color: "8B95A1", italic: true
  });
}
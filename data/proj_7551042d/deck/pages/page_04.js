// page_04: trend — GMV 重排序：抖音 +46%、拼多多 +33%，淘宝仅 +4%
export function buildSlide(pptx) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };

  slide.addShape("rect", {
    x: 0, y: 0, w: 13.333, h: 0.08,
    fill: { color: "B44626" }, line: { color: "B44626" }
  });

  slide.addText("GMV 重排序：内容电商崛起，传统货架失速", {
    x: 0.6, y: 0.35, w: 12, h: 0.55,
    fontFace: "Microsoft YaHei", fontSize: 26, color: "263442", bold: true
  });
  slide.addText("抖音电商 2026 Q1 GMV 6800 亿、+46.3%；抖音全年 GMV 4 万亿，规模直逼拼多多", {
    x: 0.6, y: 0.95, w: 12.2, h: 0.45,
    fontFace: "Microsoft YaHei", fontSize: 14, color: "5A6675"
  });

  // 柱状图区域：2026 Q1 GMV 与同比增速
  const platforms = [
    { name: "抖音",     gm: 4.2, growth: 46.3, scale: 6800 },   // 缩放：6800/9500 ≈ 0.71
    { name: "拼多多",   gm: 4.9, growth: 32.7, scale: 9500 },
    { name: "淘宝天猫", gm: 4.2, growth: 4.2,  scale: 6200 }    // 估值（增速低，规模量大）
  ];

  // 左侧柱状图：GMV 体量对比（手工柱）
  const chartX = 0.6, chartY = 1.7, chartW = 6.2, chartH = 4.6;
  slide.addText("2026 Q1 GMV 规模（亿元）", {
    x: chartX, y: chartY, w: chartW, h: 0.4,
    fontFace: "Microsoft YaHei", fontSize: 13, color: "263442", bold: true
  });

  const maxScale = 9500;
  const barAreaY = chartY + 0.5;
  const barAreaH = chartH - 1.0;
  const barWidth = 1.2;
  const barGap = 0.7;

  platforms.forEach((p, i) => {
    const totalW = platforms.length * barWidth + (platforms.length - 1) * barGap;
    const startX = chartX + (chartW - totalW) / 2;
    const barX = startX + i * (barWidth + barGap);
    const barH = (p.scale / maxScale) * (barAreaH - 0.4);
    const barY = barAreaY + barAreaH - barH;

    // 柱体
    slide.addShape("rect", {
      x: barX, y: barY, w: barWidth, h: barH,
      fill: { color: i === 1 ? "8B95A1" : "B44626" },
      line: { color: i === 1 ? "8B95A1" : "B44626" }
    });
    // 数值
    slide.addText(p.scale.toLocaleString(), {
      x: barX - 0.3, y: barY - 0.45, w: barWidth + 0.6, h: 0.4,
      fontFace: "Microsoft YaHei", fontSize: 14, color: "263442", bold: true, align: "center"
    });
    // 平台名
    slide.addText(p.name, {
      x: barX - 0.3, y: barAreaY + barAreaH - 0.3, w: barWidth + 0.6, h: 0.4,
      fontFace: "Microsoft YaHei", fontSize: 13, color: "263442", bold: true, align: "center"
    });
  });

  // 右侧：增速卡片
  const rightX = 7.2;
  slide.addText("同比增速对比", {
    x: rightX, y: 1.7, w: 5.6, h: 0.4,
    fontFace: "Microsoft YaHei", fontSize: 13, color: "263442", bold: true
  });

  platforms.forEach((p, i) => {
    const y = 2.2 + i * 1.1;
    slide.addShape("rect", {
      x: rightX, y, w: 5.6, h: 0.9,
      fill: { color: "F4F5F7" }, line: { color: "E2E5EA", width: 0.5 }
    });
    slide.addShape("rect", {
      x: rightX, y, w: 0.08, h: 0.9,
      fill: { color: i === 1 ? "8B95A1" : "B44626" }, line: { color: i === 1 ? "8B95A1" : "B44626" }
    });
    slide.addText(p.name, {
      x: rightX + 0.2, y: y + 0.1, w: 1.5, h: 0.7,
      fontFace: "Microsoft YaHei", fontSize: 14, color: "263442", bold: true
    });
    slide.addText("+" + p.growth + "%", {
      x: rightX + 1.7, y: y + 0.1, w: 1.9, h: 0.7,
      fontFace: "Microsoft YaHei", fontSize: 22, color: "B44626", bold: true, align: "right"
    });
    slide.addText(p.growth >= 30 ? "高速" : "低速", {
      x: rightX + 3.7, y: y + 0.2, w: 1.8, h: 0.5,
      fontFace: "Microsoft YaHei", fontSize: 11, color: "5A6675", align: "right"
    });
  });

  // 底部结构性变化
  slide.addShape("rect", {
    x: 0.6, y: 6.5, w: 12.2, h: 0.8,
    fill: { color: "263442" }, line: { color: "263442" }
  });
  slide.addText("结构性变化：品牌自播占比从 38% 升至 51%，首次超过达人直播——商家「去达人依赖」明确", {
    x: 0.85, y: 6.6, w: 11.8, h: 0.6,
    fontFace: "Microsoft YaHei", fontSize: 14, color: "FFFFFF", bold: true
  });
}
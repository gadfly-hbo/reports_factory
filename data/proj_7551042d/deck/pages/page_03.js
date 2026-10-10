// page_03: content — 平台格局：淘宝抖音领跑，视频号成最大变量
export function buildSlide(pptx) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };

  slide.addShape("rect", {
    x: 0, y: 0, w: 13.333, h: 0.08,
    fill: { color: "B44626" }, line: { color: "B44626" }
  });

  slide.addText("平台格局：淘宝抖音领跑，视频号成最大变量", {
    x: 0.6, y: 0.35, w: 12, h: 0.55,
    fontFace: "Microsoft YaHei", fontSize: 26, color: "263442", bold: true
  });
  slide.addText("六大平台分层明显，视频号以 8 亿 DAU 切入商业化，年增速 45% 逼近抖音", {
    x: 0.6, y: 0.95, w: 12.2, h: 0.45,
    fontFace: "Microsoft YaHei", fontSize: 14, color: "5A6675"
  });

  // 表头
  const headers = ["平台", "用户规模", "同比增速", "角色定位"];
  const colX = [0.6, 3.0, 5.8, 8.4];
  const colW = [2.3, 2.7, 2.5, 4.4];

  slide.addShape("rect", {
    x: 0.6, y: 1.7, w: 12.2, h: 0.55,
    fill: { color: "263442" }, line: { color: "263442" }
  });
  headers.forEach((h, i) => {
    slide.addText(h, {
      x: colX[i] + 0.15, y: 1.75, w: colW[i] - 0.2, h: 0.45,
      fontFace: "Microsoft YaHei", fontSize: 13, color: "FFFFFF", bold: true
    });
  });

  // 数据行
  const rows = [
    { p: "淘宝",     u: "MAU 10 亿+",   g: "+3.7%",   r: "综合电商龙头 / 货架场",     hl: false },
    { p: "抖音",     u: "MAU 9.48 亿",  g: "+14.4%",  r: "内容电商第一 / 增速并列首位", hl: true },
    { p: "拼多多",   u: "MAU 7.08 亿",  g: "+0.9%",   r: "下沉与白牌 / 用户时长 -12%",  hl: false },
    { p: "京东",     u: "MAU 6.1 亿",   g: "+14.4%",  r: "标品自营 / 3C 家电基本盘",   hl: true },
    { p: "视频号",   u: "DAU 8 亿",     g: "+45%",    r: "微信生态公私域闭环 / 最大变量", hl: true },
    { p: "小红书",   u: "高粘性社区",   g: "+6.4%",   r: "消费决策上游 / 种草驱动品类", hl: false },
    { p: "快手",     u: "下沉电商",     g: "+3.7%",   r: "老铁信任 / 泛货架补差",       hl: false }
  ];

  rows.forEach((r, i) => {
    const y = 2.3 + i * 0.55;
    // 高亮行底色
    slide.addShape("rect", {
      x: 0.6, y, w: 12.2, h: 0.55,
      fill: { color: r.hl ? "FFF2EE" : "FFFFFF" },
      line: { color: "E2E5EA", width: 0.5 }
    });
    const txtColor = r.hl ? "B44626" : "263442";
    slide.addText(r.p, {
      x: colX[0] + 0.15, y: y + 0.08, w: colW[0] - 0.2, h: 0.4,
      fontFace: "Microsoft YaHei", fontSize: 13, color: txtColor, bold: r.hl
    });
    slide.addText(r.u, {
      x: colX[1] + 0.15, y: y + 0.08, w: colW[1] - 0.2, h: 0.4,
      fontFace: "Microsoft YaHei", fontSize: 13, color: txtColor, bold: r.hl
    });
    slide.addText(r.g, {
      x: colX[2] + 0.15, y: y + 0.08, w: colW[2] - 0.2, h: 0.4,
      fontFace: "Microsoft YaHei", fontSize: 13, color: txtColor, bold: r.hl
    });
    slide.addText(r.r, {
      x: colX[3] + 0.15, y: y + 0.08, w: colW[3] - 0.2, h: 0.4,
      fontFace: "Microsoft YaHei", fontSize: 12, color: txtColor
    });
  });

  // 重点洞察
  slide.addShape("rect", {
    x: 0.6, y: 6.35, w: 12.2, h: 0.95,
    fill: { color: "F4F5F7" }, line: { color: "E2E5EA", width: 0.5 }
  });
  slide.addShape("rect", {
    x: 0.6, y: 6.35, w: 0.1, h: 0.95,
    fill: { color: "B44626" }, line: { color: "B44626" }
  });
  slide.addText("判断：双 11 当天抖音 6.32 亿、视频号渗透加速；京东 +9.8% 居综合电商首位", {
    x: 0.85, y: 6.45, w: 11.8, h: 0.4,
    fontFace: "Microsoft YaHei", fontSize: 14, color: "263442", bold: true
  });
  slide.addText("视频号 45 岁以上用户占 67%，300 元以上商品 GMV 占比超 50%——高净值高复购", {
    x: 0.85, y: 6.85, w: 11.8, h: 0.4,
    fontFace: "Microsoft YaHei", fontSize: 12, color: "5A6675"
  });
}
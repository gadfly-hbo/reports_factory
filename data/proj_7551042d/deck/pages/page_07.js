// page_07: content — 抖音全域样本：内容×货架×投放三场合一
export function buildSlide(pptx) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };

  slide.addShape("rect", {
    x: 0, y: 0, w: 13.333, h: 0.08,
    fill: { color: "B44626" }, line: { color: "B44626" }
  });

  slide.addText("抖音全域样本：内容×货架×投放三场合一", {
    x: 0.6, y: 0.35, w: 12, h: 0.55,
    fontFace: "Microsoft YaHei", fontSize: 26, color: "263442", bold: true
  });
  slide.addText("全域经营方法论最完整的样本——四个齿轮咬合才可持续", {
    x: 0.6, y: 0.95, w: 12.2, h: 0.45,
    fontFace: "Microsoft YaHei", fontSize: 14, color: "5A6675"
  });

  // 转化链路流程：5 步
  const steps = [
    { n: "01", t: "短视频种草", d: "内容场拉新" },
    { n: "02", t: "搜索复搜", d: "引导搜索行为" },
    { n: "03", t: "商品卡承接", d: "货架场转化" },
    { n: "04", t: "直播转化", d: "店播为主阵地" },
    { n: "05", t: "店铺复购", d: "私域沉淀再回流" }
  ];

  const stepW = 2.25;
  const stepGap = 0.22;
  const totalW = steps.length * stepW + (steps.length - 1) * stepGap;
  const startX = (13.333 - totalW) / 2;
  const stepY = 1.7;

  steps.forEach((s, i) => {
    const x = startX + i * (stepW + stepGap);
    slide.addShape("rect", {
      x, y: stepY, w: stepW, h: 1.5,
      fill: { color: i === 3 ? "B44626" : "F4F5F7" },
      line: { color: i === 3 ? "B44626" : "E2E5EA", width: 0.6 }
    });
    slide.addText(s.n, {
      x: x + 0.15, y: stepY + 0.15, w: 1.0, h: 0.4,
      fontFace: "Microsoft YaHei", fontSize: 13,
      color: i === 3 ? "FFFFFF" : "B44626", bold: true
    });
    slide.addText(s.t, {
      x: x + 0.15, y: stepY + 0.5, w: stepW - 0.3, h: 0.45,
      fontFace: "Microsoft YaHei", fontSize: 15,
      color: i === 3 ? "FFFFFF" : "263442", bold: true
    });
    slide.addText(s.d, {
      x: x + 0.15, y: stepY + 0.95, w: stepW - 0.3, h: 0.4,
      fontFace: "Microsoft YaHei", fontSize: 11,
      color: i === 3 ? "FFFFFF" : "5A6675"
    });

    // 箭头
    if (i < steps.length - 1) {
      slide.addShape("rightTriangle", {
        x: x + stepW + 0.02, y: stepY + 0.55, w: 0.18, h: 0.4,
        fill: { color: "B44626" }, line: { color: "B44626" },
        rotate: 90
      });
    }
  });

  // 三场下半页并列
  const arenas = [
    {
      t: "内容场",
      kpi: "+45%",
      desc: "店播商家数同比增长；品牌自播占比从 38% 升至 51%，首次超过达人直播",
      points: ["短视频种草 + 直播转化", "停留 >30 秒、互动率 >5%、点击率 >3%", "算法权重：收藏率 > 复访率 > 铁粉互动"]
    },
    {
      t: "货架场",
      kpi: "+28%",
      desc: "抖音电商用户时长同比增长；短视频→搜索复搜是 2026 年搜索流量重要增量",
      points: ["商城 / 搜索 / 商品卡承接", "搜索行为沉淀人群资产", "短视频结尾引导「搜索 XX 享优惠」"]
    },
    {
      t: "投放场",
      kpi: "AI 托管",
      desc: "千川全域直播间打法：付费撬动自然；2026 年 AI 智能托管计划成主流",
      points: ["全域推广覆盖短视频/直投/搜索/商城", "站外种草 + 站内收割跨平台人群包", "人机协同：AI 跑量，人做内容"]
    }
  ];

  arenas.forEach((a, i) => {
    const x = 0.6 + i * 4.1;
    const y = 3.55;
    slide.addShape("rect", {
      x, y, w: 3.9, h: 3.05,
      fill: { color: "FFFFFF" }, line: { color: "263442", width: 1.0 }
    });
    // 顶部色块
    slide.addShape("rect", {
      x, y, w: 3.9, h: 0.5,
      fill: { color: "263442" }, line: { color: "263442" }
    });
    slide.addText(a.t, {
      x: x + 0.15, y: y + 0.08, w: 2.0, h: 0.35,
      fontFace: "Microsoft YaHei", fontSize: 14, color: "FFFFFF", bold: true
    });
    slide.addText(a.kpi, {
      x: x + 2.0, y: y + 0.08, w: 1.8, h: 0.35,
      fontFace: "Microsoft YaHei", fontSize: 13, color: "B44626", bold: true, align: "right"
    });
    // 描述
    slide.addText(a.desc, {
      x: x + 0.15, y: y + 0.6, w: 3.6, h: 0.85,
      fontFace: "Microsoft YaHei", fontSize: 11, color: "5A6675"
    });
    // 三要点
    a.points.forEach((p, j) => {
      const py = y + 1.55 + j * 0.45;
      slide.addShape("ellipse", {
        x: x + 0.18, y: py + 0.13, w: 0.12, h: 0.12,
        fill: { color: "B44626" }, line: { color: "B44626" }
      });
      slide.addText(p, {
        x: x + 0.4, y: py, w: 3.4, h: 0.4,
        fontFace: "Microsoft YaHei", fontSize: 11, color: "263442"
      });
    });
  });

  // 底部判断条
  slide.addShape("rect", {
    x: 0.6, y: 6.85, w: 12.2, h: 0.45,
    fill: { color: "B44626" }, line: { color: "B44626" }
  });
  slide.addText(
    "启示：只做内容留不住流量，只做直播成本高且不稳定——必须把四个齿轮咬合在一起",
    {
      x: 0.85, y: 6.9, w: 11.8, h: 0.4,
      fontFace: "Microsoft YaHei", fontSize: 13, color: "FFFFFF", bold: true
    }
  );
}
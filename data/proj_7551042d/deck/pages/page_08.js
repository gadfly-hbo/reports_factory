// page_08: content — 公私域飞轮：公域捞鱼、私域养鱼、素材反哺
export function buildSlide(pptx) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };

  slide.addShape("rect", {
    x: 0, y: 0, w: 13.333, h: 0.08,
    fill: { color: "B44626" }, line: { color: "B44626" }
  });

  slide.addText("公私域飞轮：公域捞鱼、私域养鱼、素材反哺", {
    x: 0.6, y: 0.35, w: 12, h: 0.55,
    fontFace: "Microsoft YaHei", fontSize: 26, color: "263442", bold: true
  });
  slide.addText("最小闭环：钩子引流 → 首单转化 → 分层运营 → 复购裂变——先跑通一个，再规模化放大", {
    x: 0.6, y: 0.95, w: 12.2, h: 0.45,
    fontFace: "Microsoft YaHei", fontSize: 13, color: "5A6675"
  });

  // 上半：四步闭环
  const steps = [
    { n: "1", t: "钩子引流", d: "粉丝价 / 专属福利 / 限量名额 / 干货资料包" },
    { n: "2", t: "首单转化", d: "新人专享 / 试用装 / 零风险承诺（24h 内）" },
    { n: "3", t: "分层运营", d: "RFM 标签 + 公域来源自动分群" },
    { n: "4", t: "复购裂变", d: "首单→7 天跟进→复购激励→转介绍" }
  ];

  steps.forEach((s, i) => {
    const x = 0.6 + i * 3.15;
    const y = 1.65;
    slide.addShape("rect", {
      x, y, w: 2.9, h: 1.5,
      fill: { color: "F4F5F7" }, line: { color: "E2E5EA", width: 0.5 }
    });
    // 数字圆
    slide.addShape("ellipse", {
      x: x + 0.15, y: y + 0.15, w: 0.55, h: 0.55,
      fill: { color: "B44626" }, line: { color: "B44626" }
    });
    slide.addText(s.n, {
      x: x + 0.15, y: y + 0.18, w: 0.55, h: 0.5,
      fontFace: "Microsoft YaHei", fontSize: 18, color: "FFFFFF", bold: true, align: "center"
    });
    slide.addText(s.t, {
      x: x + 0.85, y: y + 0.2, w: 1.95, h: 0.5,
      fontFace: "Microsoft YaHei", fontSize: 15, color: "263442", bold: true
    });
    slide.addText(s.d, {
      x: x + 0.18, y: y + 0.85, w: 2.6, h: 0.55,
      fontFace: "Microsoft YaHei", fontSize: 11, color: "5A6675"
    });
    // 箭头
    if (i < steps.length - 1) {
      slide.addShape("rightTriangle", {
        x: x + 2.93, y: y + 0.55, w: 0.18, h: 0.4,
        fill: { color: "B44626" }, line: { color: "B44626" },
        rotate: 90
      });
    }
  });

  // 飞轮示意（环形）—— 用 4 个弧段近似表达
  const cy = 5.05;
  const cx = 4.5;
  const r = 1.05;
  slide.addText("公私域飞轮模型", {
    x: 0.6, y: 3.35, w: 4.0, h: 0.4,
    fontFace: "Microsoft YaHei", fontSize: 14, color: "263442", bold: true
  });

  // 四个节点
  const wheel = [
    { a: 0,        label: "公域获新",   color: "B44626" },
    { a: Math.PI/2, label: "私域沉淀",   color: "263442" },
    { a: Math.PI,   label: "案例反哺",   color: "B44626" },
    { a: 3*Math.PI/2, label: "公域放大", color: "263442" }
  ];
  wheel.forEach(w => {
    const px = cx + r * Math.cos(w.a) - 0.65;
    const py = cy + r * Math.sin(w.a) - 0.25;
    slide.addShape("ellipse", {
      x: px, y: py, w: 1.3, h: 0.55,
      fill: { color: w.color }, line: { color: w.color }
    });
    slide.addText(w.label, {
      x: px, y: py + 0.1, w: 1.3, h: 0.4,
      fontFace: "Microsoft YaHei", fontSize: 12, color: "FFFFFF", bold: true, align: "center"
    });
  });
  // 中心
  slide.addShape("ellipse", {
    x: cx - 0.55, y: cy - 0.35, w: 1.1, h: 0.7,
    fill: { color: "FFFFFF" }, line: { color: "B44626", width: 1.2 }
  });
  slide.addText("飞轮", {
    x: cx - 0.55, y: cy - 0.3, w: 1.1, h: 0.6,
    fontFace: "Microsoft YaHei", fontSize: 14, color: "B44626", bold: true, align: "center"
  });

  // 右侧：落地案例
  const caseX = 7.3;
  slide.addText("落地案例", {
    x: caseX, y: 3.35, w: 5.5, h: 0.4,
    fontFace: "Microsoft YaHei", fontSize: 14, color: "263442", bold: true
  });
  const cases = [
    {
      name: "百果园",
      kpi: "7000 万一体化会员",
      d: "门店活码入群 + 一天分时段推送 + 每周二果粉日；社群分享 2 倍全国均值"
    },
    {
      name: "完美日记",
      kpi: "小完子年贡献 10 亿+ GMV",
      d: "统一话术风格 + 固定栏目 + 高频互动；服务 IP 化"
    },
    {
      name: "头部美妆",
      kpi: "私域留存 8% → 32%",
      d: "150 个用户标签 + 分层 SOP；复购率 4% → 18%，ROI 1 : 6.8"
    }
  ];
  cases.forEach((c, i) => {
    const y = 3.85 + i * 0.95;
    slide.addShape("rect", {
      x: caseX, y, w: 5.5, h: 0.85,
      fill: { color: "FFF2EE" }, line: { color: "B44626", width: 0.6 }
    });
    slide.addText(c.name, {
      x: caseX + 0.15, y: y + 0.08, w: 1.5, h: 0.35,
      fontFace: "Microsoft YaHei", fontSize: 13, color: "B44626", bold: true
    });
    slide.addText(c.kpi, {
      x: caseX + 1.7, y: y + 0.08, w: 3.7, h: 0.35,
      fontFace: "Microsoft YaHei", fontSize: 12, color: "263442", bold: true, align: "right"
    });
    slide.addText(c.d, {
      x: caseX + 0.15, y: y + 0.42, w: 5.2, h: 0.4,
      fontFace: "Microsoft YaHei", fontSize: 11, color: "5A6675"
    });
  });

  // 底部
  slide.addShape("rect", {
    x: 0.6, y: 6.75, w: 12.2, h: 0.55,
    fill: { color: "263442" }, line: { color: "263442" }
  });
  slide.addText(
    "指标：飞轮转速（公私域流量转化周期）× 飞轮质量（每轮新增留存比）",
    {
      x: 0.85, y: 6.83, w: 11.8, h: 0.45,
      fontFace: "Microsoft YaHei", fontSize: 13, color: "FFFFFF", bold: true
    }
  );
}
// page_10: summary — 五大趋势
export function buildSlide(pptx) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };

  slide.addShape("rect", {
    x: 0, y: 0, w: 13.333, h: 0.08,
    fill: { color: "B44626" }, line: { color: "B44626" }
  });

  slide.addText("五大趋势：2026 年电商流量变局方向", {
    x: 0.6, y: 0.35, w: 12, h: 0.55,
    fontFace: "Microsoft YaHei", fontSize: 26, color: "263442", bold: true
  });
  slide.addText("行业级判断——决定下一轮流量分配权与经营重心", {
    x: 0.6, y: 0.95, w: 12.2, h: 0.45,
    fontFace: "Microsoft YaHei", fontSize: 14, color: "5A6675"
  });

  const trends = [
    {
      n: "01",
      t: "AI 成为新流量分配入口",
      d: "抖音测试「AI 购物小助手」；GEO（生成式引擎优化）两极分化。商品标题/属性/参数的结构化完整度决定能否进入 AI 推荐短名单。"
    },
    {
      n: "02",
      t: "店播与品牌自播取代达人依赖",
      d: "品牌自播占比 51%，超达人直播。抖音/淘宝/快手加大品质店播扶持——直播从「请达人带货」回归「自建信任阵地」。"
    },
    {
      n: "03",
      t: "搜索流量全面升值",
      d: "抖音「短视频→搜索复搜」链路成熟；快手搜索 GMV +119%；小红书搜索流量占比持续提升；淘宝搜索精细化模型化。"
    },
    {
      n: "04",
      t: "平台互联互通盘活存量",
      d: "淘宝接入微信支付；天猫接入京东物流；淘宝×小红书打通种草—购买。2025/05 淘宝×微信重叠用户 8.75 亿、+6.7%。"
    },
    {
      n: "05",
      t: "即时零售成为新增长变量",
      d: "2025/12 即时零售 MAU 5.65 亿，增速高于综合电商。淘宝/京东加码分钟级送达——「远场电商 + 近场即时零售」全域竞争开启。"
    }
  ];

  // 左侧：5 行趋势列表
  trends.forEach((tr, i) => {
    const y = 1.7 + i * 1.0;
    slide.addShape("rect", {
      x: 0.6, y, w: 7.6, h: 0.85,
      fill: { color: "F4F5F7" }, line: { color: "E2E5EA", width: 0.4 }
    });
    // 序号色块
    slide.addShape("rect", {
      x: 0.6, y, w: 0.7, h: 0.85,
      fill: { color: "B44626" }, line: { color: "B44626" }
    });
    slide.addText(tr.n, {
      x: 0.6, y: y + 0.2, w: 0.7, h: 0.45,
      fontFace: "Microsoft YaHei", fontSize: 16, color: "FFFFFF", bold: true, align: "center"
    });
    slide.addText(tr.t, {
      x: 1.45, y: y + 0.08, w: 6.65, h: 0.4,
      fontFace: "Microsoft YaHei", fontSize: 14, color: "263442", bold: true
    });
    slide.addText(tr.d, {
      x: 1.45, y: y + 0.43, w: 6.65, h: 0.42,
      fontFace: "Microsoft YaHei", fontSize: 10, color: "5A6675"
    });
  });

  // 右侧：核心判断框
  slide.addShape("rect", {
    x: 8.4, y: 1.7, w: 4.4, h: 4.85,
    fill: { color: "263442" }, line: { color: "263442" }
  });
  slide.addShape("rect", {
    x: 8.4, y: 1.7, w: 4.4, h: 0.1,
    fill: { color: "B44626" }, line: { color: "B44626" }
  });
  slide.addText("一句话总结", {
    x: 8.6, y: 1.95, w: 4.0, h: 0.4,
    fontFace: "Microsoft YaHei", fontSize: 13, color: "B44626", bold: true
  });
  slide.addText(
    "从「在哪里买流量」到「如何把流量转化为用户资产」",
    {
      x: 8.6, y: 2.45, w: 4.0, h: 1.0,
      fontFace: "Microsoft YaHei", fontSize: 16, color: "FFFFFF", bold: true
    }
  );
  slide.addShape("rect", {
    x: 8.6, y: 3.55, w: 1.0, h: 0.04,
    fill: { color: "B44626" }, line: { color: "B44626" }
  });
  slide.addText("公域决定下限", {
    x: 8.6, y: 3.75, w: 4.0, h: 0.35,
    fontFace: "Microsoft YaHei", fontSize: 13, color: "FFFFFF", bold: true
  });
  slide.addText("（新客规模）", {
    x: 8.6, y: 4.05, w: 4.0, h: 0.3,
    fontFace: "Microsoft YaHei", fontSize: 11, color: "D8DCE3"
  });
  slide.addText("私域决定上限", {
    x: 8.6, y: 4.45, w: 4.0, h: 0.35,
    fontFace: "Microsoft YaHei", fontSize: 13, color: "FFFFFF", bold: true
  });
  slide.addText("（LTV 与利润）", {
    x: 8.6, y: 4.75, w: 4.0, h: 0.3,
    fontFace: "Microsoft YaHei", fontSize: 11, color: "D8DCE3"
  });
  slide.addShape("rect", {
    x: 8.6, y: 5.2, w: 1.0, h: 0.04,
    fill: { color: "B44626" }, line: { color: "B44626" }
  });
  slide.addText("飞轮转速决定放大效率", {
    x: 8.6, y: 5.4, w: 4.0, h: 0.35,
    fontFace: "Microsoft YaHei", fontSize: 13, color: "B44626", bold: true
  });
  slide.addText("（公私域相互放大的能力）", {
    x: 8.6, y: 5.7, w: 4.0, h: 0.7,
    fontFace: "Microsoft YaHei", fontSize: 11, color: "D8DCE3"
  });

  // 底部
  slide.addText(
    "先跑通一个最小闭环（钩子→首单→复购→转介绍），再规模化放大——是当前胜率最高的路径",
    {
      x: 0.6, y: 6.85, w: 12.2, h: 0.45,
      fontFace: "Microsoft YaHei", fontSize: 13, color: "B44626", italic: true, bold: true
    }
  );
}
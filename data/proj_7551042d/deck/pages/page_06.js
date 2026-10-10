// page_06: option_comparison — 六大平台公域打法对比
export function buildSlide(pptx) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };

  slide.addShape("rect", {
    x: 0, y: 0, w: 13.333, h: 0.08,
    fill: { color: "B44626" }, line: { color: "B44626" }
  });

  slide.addText("六大平台公域打法对比：从「买流量」到「全域经营」", {
    x: 0.6, y: 0.35, w: 12, h: 0.55,
    fontFace: "Microsoft YaHei", fontSize: 24, color: "263442", bold: true
  });
  slide.addText("内容场（短视频/直播/笔记）+ 货架场（搜索/商城）+ 投放场（千川/直通车）三场合一", {
    x: 0.6, y: 0.95, w: 12.2, h: 0.45,
    fontFace: "Microsoft YaHei", fontSize: 13, color: "5A6675"
  });

  // 表头
  const headers = ["平台", "核心入口", "主打法", "适配商家"];
  const colX = [0.6, 2.4, 4.6, 9.7];
  const colW = [1.8, 2.2, 5.1, 3.1];

  slide.addShape("rect", {
    x: 0.6, y: 1.6, w: 12.2, h: 0.5,
    fill: { color: "263442" }, line: { color: "263442" }
  });
  headers.forEach((h, i) => {
    slide.addText(h, {
      x: colX[i] + 0.1, y: 1.65, w: colW[i] - 0.15, h: 0.4,
      fontFace: "Microsoft YaHei", fontSize: 12, color: "FFFFFF", bold: true
    });
  });

  // 数据行
  const rows = [
    {
      p: "淘宝天猫",
      entry: "搜索+推荐+直播",
      t: "关键词卡位、人群运营（达摩盘/无界回流）、品质直播、站外种草回流",
      fit: "有品牌力与货盘深度的商家"
    },
    {
      p: "京东",
      entry: "搜索+百亿补贴+即时零售",
      t: "自营供应链心智、3C 家电基本盘、秒送",
      fit: "标品、品牌官旗"
    },
    {
      p: "拼多多",
      entry: "百亿补贴+活动资源位",
      t: "极致性价比、活动冲量、全站推广",
      fit: "产业带、白牌工厂"
    },
    {
      p: "抖音",
      entry: "短视频+直播+商城",
      t: "全域经营：内容场→搜索复搜→商品卡→直播转化→店铺复购；千川撬动自然流",
      fit: "内容能力强、毛利可支撑投流的商家"
    },
    {
      p: "快手",
      entry: "直播+泛货架+搜索",
      t: "老铁信任电商、人设直播、泛货架补差（搜索 GMV +119%）",
      fit: "下沉市场、人设型主播"
    },
    {
      p: "小红书",
      entry: "搜索+种草笔记+买手",
      t: "关键词内容运营+聚光搜索投流；买手电商 3.0",
      fit: "美妆、服饰、家居等种草驱动品类"
    },
    {
      p: "微信生态",
      entry: "社交裂变+推荐+搜索",
      t: "公私域联营、送礼/一起买裂变、超品日；增速为大盘 4.3 倍",
      fit: "有私域基础、高复购品类"
    }
  ];

  const rowH = 0.66;
  rows.forEach((r, i) => {
    const y = 2.15 + i * rowH;
    const isHi = (r.p === "抖音" || r.p === "微信生态");
    slide.addShape("rect", {
      x: 0.6, y, w: 12.2, h: rowH - 0.05,
      fill: { color: isHi ? "FFF2EE" : "FFFFFF" },
      line: { color: "E2E5EA", width: 0.4 }
    });
    const txtColor = isHi ? "B44626" : "263442";
    slide.addText(r.p, {
      x: colX[0] + 0.1, y: y + 0.12, w: colW[0] - 0.15, h: rowH - 0.2,
      fontFace: "Microsoft YaHei", fontSize: 12, color: txtColor, bold: isHi
    });
    slide.addText(r.entry, {
      x: colX[1] + 0.1, y: y + 0.12, w: colW[1] - 0.15, h: rowH - 0.2,
      fontFace: "Microsoft YaHei", fontSize: 11, color: "263442"
    });
    slide.addText(r.t, {
      x: colX[2] + 0.1, y: y + 0.08, w: colW[2] - 0.15, h: rowH - 0.1,
      fontFace: "Microsoft YaHei", fontSize: 11, color: "263442"
    });
    slide.addText(r.fit, {
      x: colX[3] + 0.1, y: y + 0.08, w: colW[3] - 0.15, h: rowH - 0.1,
      fontFace: "Microsoft YaHei", fontSize: 10, color: "5A6675", italic: true
    });
  });

  // 底部
  slide.addShape("rect", {
    x: 0.6, y: 6.95, w: 12.2, h: 0.35,
    fill: { color: "F4F5F7" }, line: { color: "E2E5EA", width: 0.4 }
  });
  slide.addText(
    "AI 改写流量分配：抖音测试「AI 购物小助手」，商品信息结构化（标题/属性/参数）决定能否进入推荐短名单",
    {
      x: 0.85, y: 6.98, w: 11.8, h: 0.3,
      fontFace: "Microsoft YaHei", fontSize: 11, color: "263442"
    }
  );
}
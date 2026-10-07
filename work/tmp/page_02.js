import pptxgenjs from "pptxgenjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pres = new pptxgenjs();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
pres.title = "理解测试 - 季度核心指标一览";

const W = 13.33;
const H = 7.5;

const C_NAVY = "263442";
const C_RUST = "B44626";
const C_WHITE = "FFFFFF";
const C_BG = "F7F6F3";
const C_LINE = "D9D6CF";
const C_TEXT = "263442";
const C_MUTED = "6E7480";

const FONT_CN = "PingFang SC";

// ---------- 单页 ----------
const s = pres.addSlide();
s.background = { color: C_WHITE };

// 顶部品牌色条
s.addShape("rect", {
  x: 0, y: 0, w: W, h: 0.12,
  fill: { color: C_NAVY }, line: { type: "none" },
});

// 顶部 Deck 标识
s.addText("理解测试", {
  x: 0.6, y: 0.28, w: 4, h: 0.32,
  fontFace: FONT_CN, fontSize: 11, color: C_MUTED, charSpacing: 4,
});
s.addShape("ellipse", {
  x: 1.55, y: 0.40, w: 0.08, h: 0.08,
  fill: { color: C_RUST }, line: { type: "none" },
});

// 标题
s.addText("季度核心指标一览", {
  x: 0.6, y: 0.62, w: 9.5, h: 0.7,
  fontFace: FONT_CN, fontSize: 26, bold: true, color: C_NAVY,
});
s.addText("客流 · 转化 · 客单价 · 库存周转", {
  x: 0.6, y: 1.30, w: 9.5, h: 0.4,
  fontFace: FONT_CN, fontSize: 14, color: C_MUTED,
});

// 右侧小信息块
s.addShape("rect", {
  x: 9.8, y: 0.62, w: 2.95, h: 1.05,
  fill: { color: C_BG }, line: { color: C_LINE, width: 0.5 },
});
s.addText("报告范围", {
  x: 9.95, y: 0.72, w: 2.7, h: 0.3,
  fontFace: FONT_CN, fontSize: 11, color: C_MUTED, charSpacing: 3,
});
s.addText("本季度 · 环比上季度", {
  x: 9.95, y: 1.02, w: 2.7, h: 0.35,
  fontFace: FONT_CN, fontSize: 14, bold: true, color: C_NAVY,
});
s.addText("数据口径：进店客流 / 试穿 / 成交 / 库存", {
  x: 9.95, y: 1.36, w: 2.7, h: 0.3,
  fontFace: FONT_CN, fontSize: 9.5, color: C_MUTED,
});

// ---------- 四张指标卡 ----------
const cardY = 2.05;
const cardH = 3.55;
const gap = 0.22;
const totalW = W - 1.2;
const cardW = (totalW - gap * 3) / 4;
const startX = 0.6;

const cards = [
  {
    tag: "客流",
    metric: "12,400",
    unit: "人次",
    sub: "本季度进店客流",
    delta: "环比上升 8.2%",
    deltaUp: true,
    items: [
      { k: "试穿率", v: "34%" },
      { k: "成交转化率", v: "21.5%" },
    ],
  },
  {
    tag: "转化",
    metric: "21.5",
    unit: "%",
    sub: "成交转化率",
    delta: "进店 → 试穿 → 成交",
    deltaUp: null,
    items: [
      { k: "试穿率", v: "34%" },
      { k: "客单价", v: "328 元" },
    ],
  },
  {
    tag: "客单价",
    metric: "328",
    unit: "元",
    sub: "本季度每单均价",
    delta: "环比基本持平",
    deltaUp: null,
    items: [
      { k: "成交转化率", v: "21.5%" },
      { k: "新会员注册", v: "1,860 人" },
    ],
  },
  {
    tag: "库存周转",
    metric: "46",
    unit: "天",
    sub: "季末库存周转天数",
    delta: "较上季度 52 天 改善",
    deltaUp: true,
    items: [
      { k: "上季度", v: "52 天" },
      { k: "滞销 SKU", v: "18%（配饰类目）" },
    ],
  },
];

cards.forEach((c, i) => {
  const x = startX + i * (cardW + gap);

  s.addShape("rect", {
    x, y: cardY, w: cardW, h: cardH,
    fill: { color: C_BG }, line: { color: C_LINE, width: 0.5 },
  });
  s.addShape("rect", {
    x, y: cardY, w: 0.08, h: cardH,
    fill: { color: C_NAVY }, line: { type: "none" },
  });

  s.addText(c.tag, {
    x: x + 0.28, y: cardY + 0.22, w: cardW - 0.4, h: 0.32,
    fontFace: FONT_CN, fontSize: 12, color: C_NAVY, bold: true, charSpacing: 3,
  });

  s.addShape("line", {
    x: x + 0.28, y: cardY + 0.6, w: 0.45, h: 0,
    line: { color: C_RUST, width: 1.5 },
  });

  s.addText(
    [
      { text: c.metric, options: { fontSize: 44, bold: true, color: C_NAVY, fontFace: FONT_CN } },
      { text: " " + c.unit, options: { fontSize: 16, color: C_MUTED, fontFace: FONT_CN } },
    ],
    { x: x + 0.28, y: cardY + 0.72, w: cardW - 0.4, h: 0.95 }
  );

  s.addText(c.sub, {
    x: x + 0.28, y: cardY + 1.72, w: cardW - 0.4, h: 0.32,
    fontFace: FONT_CN, fontSize: 11, color: C_MUTED,
  });

  let chipColor = C_NAVY;
  if (c.deltaUp === true) chipColor = C_RUST;
  s.addShape("rect", {
    x: x + 0.28, y: cardY + 2.10, w: cardW - 0.56, h: 0.34,
    fill: { color: C_WHITE }, line: { color: chipColor, width: 0.75 },
  });
  s.addText(c.delta, {
    x: x + 0.34, y: cardY + 2.10, w: cardW - 0.7, h: 0.34,
    fontFace: FONT_CN, fontSize: 11, color: chipColor, bold: true,
    valign: "middle",
  });

  const itemY1 = cardY + 2.65;
  const itemY2 = cardY + 3.05;
  s.addShape("line", {
    x: x + 0.28, y: itemY1 - 0.10, w: cardW - 0.56, h: 0,
    line: { color: C_LINE, width: 0.5 },
  });

  s.addText(c.items[0].k, {
    x: x + 0.28, y: itemY1, w: (cardW - 0.56) * 0.5, h: 0.32,
    fontFace: FONT_CN, fontSize: 11, color: C_MUTED,
  });
  s.addText(c.items[0].v, {
    x: x + 0.28 + (cardW - 0.56) * 0.5, y: itemY1, w: (cardW - 0.56) * 0.5, h: 0.32,
    fontFace: FONT_CN, fontSize: 11, color: C_TEXT, bold: true, align: "right",
  });
  s.addText(c.items[1].k, {
    x: x + 0.28, y: itemY2, w: (cardW - 0.56) * 0.5, h: 0.32,
    fontFace: FONT_CN, fontSize: 11, color: C_MUTED,
  });
  s.addText(c.items[1].v, {
    x: x + 0.28 + (cardW - 0.56) * 0.5, y: itemY2, w: (cardW - 0.56) * 0.5, h: 0.32,
    fontFace: FONT_CN, fontSize: 11, color: C_TEXT, bold: true, align: "right",
  });
});

// ---------- 底部 ----------
const footY = 5.85;
const footH = 1.20;
const footGap = 0.22;
const footTotalW = W - 1.2;
const footCardW = (footTotalW - footGap) / 2;
const footStartX = 0.6;

s.addShape("rect", {
  x: footStartX, y: footY, w: footCardW, h: footH,
  fill: { color: C_WHITE }, line: { color: C_LINE, width: 0.5 },
});
s.addShape("rect", {
  x: footStartX, y: footY, w: 0.08, h: footH,
  fill: { color: C_RUST }, line: { type: "none" },
});
s.addText("会员表现", {
  x: footStartX + 0.28, y: footY + 0.14, w: footCardW - 0.4, h: 0.3,
  fontFace: FONT_CN, fontSize: 12, bold: true, color: C_NAVY, charSpacing: 2,
});
s.addText(
  [
    { text: "复购率 ", options: { fontSize: 12, color: C_MUTED, fontFace: FONT_CN } },
    { text: "41%", options: { fontSize: 18, bold: true, color: C_NAVY, fontFace: FONT_CN } },
    { text: "    销售贡献 ", options: { fontSize: 12, color: C_MUTED, fontFace: FONT_CN } },
    { text: "57%", options: { fontSize: 18, bold: true, color: C_NAVY, fontFace: FONT_CN } },
  ],
  { x: footStartX + 0.28, y: footY + 0.44, w: footCardW - 0.4, h: 0.4 }
);
s.addText("新会员注册 1,860 人，环比下降 4%", {
  x: footStartX + 0.28, y: footY + 0.84, w: footCardW - 0.4, h: 0.3,
  fontFace: FONT_CN, fontSize: 11, color: C_MUTED,
});

const x2 = footStartX + footCardW + footGap;
s.addShape("rect", {
  x: x2, y: footY, w: footCardW, h: footH,
  fill: { color: C_WHITE }, line: { color: C_LINE, width: 0.5 },
});
s.addShape("rect", {
  x: x2, y: footY, w: 0.08, h: footH,
  fill: { color: C_NAVY }, line: { type: "none" },
});
s.addText("下季度重点", {
  x: x2 + 0.28, y: footY + 0.14, w: footCardW - 0.4, h: 0.3,
  fontFace: FONT_CN, fontSize: 12, bold: true, color: C_NAVY, charSpacing: 2,
});

const nexts = [
  "配饰类目清仓",
  "会员日运营",
  "周末客流高峰时段排班优化",
];
const chipW = (footCardW - 0.56 - 0.24) / 3;
nexts.forEach((t, i) => {
  const cx = x2 + 0.28 + i * (chipW + 0.12);
  s.addShape("rect", {
    x: cx, y: footY + 0.52, w: chipW, h: 0.5,
    fill: { color: C_BG }, line: { color: C_LINE, width: 0.5 },
  });
  s.addShape("ellipse", {
    x: cx + 0.1, y: footY + 0.66, w: 0.18, h: 0.18,
    fill: { color: C_RUST }, line: { type: "none" },
  });
  s.addText(String(i + 1), {
    x: cx + 0.1, y: footY + 0.66, w: 0.18, h: 0.18,
    fontFace: FONT_CN, fontSize: 10, bold: true, color: C_WHITE,
    align: "center", valign: "middle",
  });
  s.addText(t, {
    x: cx + 0.32, y: footY + 0.52, w: chipW - 0.4, h: 0.5,
    fontFace: FONT_CN, fontSize: 11, color: C_TEXT, valign: "middle",
  });
});

// 页脚
s.addShape("line", {
  x: 0.6, y: 7.18, w: W - 1.2, h: 0,
  line: { color: C_LINE, width: 0.5 },
});
s.addText("数据来源：门店经营数据 · 季度口径", {
  x: 0.6, y: 7.22, w: 8, h: 0.25,
  fontFace: FONT_CN, fontSize: 9.5, color: C_MUTED,
});
s.addText("02", {
  x: W - 1.2, y: 7.22, w: 0.6, h: 0.25,
  fontFace: FONT_CN, fontSize: 10, color: C_MUTED, align: "right",
});

const outPath = path.join(__dirname, "page_02.pptx");
await pres.writeFile({ fileName: outPath });
console.log("OK:", outPath);
import pptxgenjs from "pptxgenjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pres = new pptxgenjs();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
pres.title = "天津河东万达广场 · 项目定位";

const COLOR = {
  navy: "263442",
  rust: "B44626",
  white: "FFFFFF",
  warmGray: "F7F6F3",
  ink: "263442",
  inkSoft: "4A5562",
  line: "D9D4C8",
};

const FONT = "PingFang SC, Microsoft YaHei, Hiragino Sans GB, sans-serif";

const slide = pres.addSlide();
slide.background = { color: COLOR.white };

// 顶部装饰条
slide.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.18, fill: { color: COLOR.navy }, line: { color: COLOR.navy } });
slide.addShape("rect", { x: 0, y: 0.18, w: 2.2, h: 0.06, fill: { color: COLOR.rust }, line: { color: COLOR.rust } });

// 眉栏
slide.addText("会员运营深度研究", {
  x: 0.5, y: 0.35, w: 6, h: 0.35,
  fontFace: FONT, fontSize: 11, color: COLOR.inkSoft, charSpacing: 2,
});
slide.addText("01 / 项目定位", {
  x: 10.5, y: 0.35, w: 2.5, h: 0.35,
  fontFace: FONT, fontSize: 11, color: COLOR.inkSoft, align: "right",
});

// 主标题
slide.addText("天津河东万达广场是津滨大道双 MALL 枢纽，硬件高配但经营数据不透明", {
  x: 0.5, y: 0.85, w: 12.3, h: 0.95,
  fontFace: FONT, fontSize: 26, bold: true, color: COLOR.navy,
  valign: "top",
});

// 副标
slide.addShape("rect", { x: 0.5, y: 1.85, w: 0.08, h: 0.42, fill: { color: COLOR.rust }, line: { color: COLOR.rust } });
slide.addText("作为整套报告的认知锚点：区位 · 体量 · 现状张力", {
  x: 0.72, y: 1.85, w: 12, h: 0.42,
  fontFace: FONT, fontSize: 13, color: COLOR.inkSoft, valign: "middle",
});

// 分隔线
slide.addShape("line", {
  x: 0.5, y: 2.45, w: 12.33, h: 0,
  line: { color: COLOR.line, width: 0.75 },
});

// ====== 左栏：项目硬指标 ======
const leftX = 0.5;
const leftY = 2.7;
const leftW = 6.05;

slide.addShape("rect", { x: leftX, y: leftY, w: leftW, h: 0.36, fill: { color: COLOR.navy }, line: { color: COLOR.navy } });
slide.addText("项目硬指标", {
  x: leftX + 0.2, y: leftY, w: leftW - 0.4, h: 0.36,
  fontFace: FONT, fontSize: 13, bold: true, color: COLOR.white, valign: "middle",
});

const leftItems = [
  { k: "开业时间", v: "2010 年 11 月 20 日（天津第二个万达广场）" },
  { k: "地址", v: "津滨大道 53 号" },
  { k: "总投资", v: "53 亿元" },
  { k: "总建面", v: "51 万㎡" },
  { k: "商业面积", v: "约 17 万㎡（本体）；含影城/KTV/电玩/步行街等附属约 24 万㎡" },
  { k: "商圈地位", v: "万爱商圈 —— 津滨大道经济发展轴核心载体，与爱琴海构成双 MALL 共生格局" },
  { k: "停车配比", v: "商业体地下停车库约 4400 个车位；配比约 38.6 ㎡/位（高于常规 50–100 ㎡/位）" },
];

let ly = leftY + 0.55;
leftItems.forEach((it, i) => {
  slide.addShape("rect", {
    x: leftX, y: ly, w: leftW, h: 0.5,
    fill: { color: i % 2 === 0 ? COLOR.warmGray : COLOR.white },
    line: { color: COLOR.warmGray, width: 0.5 },
  });
  slide.addText(it.k, {
    x: leftX + 0.2, y: ly, w: 1.6, h: 0.5,
    fontFace: FONT, fontSize: 12, bold: true, color: COLOR.navy, valign: "middle",
  });
  slide.addText(it.v, {
    x: leftX + 1.85, y: ly, w: leftW - 2.05, h: 0.5,
    fontFace: FONT, fontSize: 12, color: COLOR.ink, valign: "middle",
  });
  ly += 0.5;
});

// ====== 右栏：经营现状张力 ======
const rightX = 6.85;
const rightY = 2.7;
const rightW = 5.98;

slide.addShape("rect", { x: rightX, y: rightY, w: rightW, h: 0.36, fill: { color: COLOR.navy }, line: { color: COLOR.navy } });
slide.addText("经营现状张力", {
  x: rightX + 0.2, y: rightY, w: rightW - 0.4, h: 0.36,
  fontFace: FONT, fontSize: 13, bold: true, color: COLOR.white, valign: "middle",
});

const kpis = [
  { v: "40 亿", l: "2023 河东区重点商业载体销售额（同比 +58.7%）" },
  { v: "5320 万", l: "2023 河东区重点商业载体客流（同比 +67.1%）" },
  { v: "85 个", l: "2023 引进首店品牌（同步调整 227 个）" },
];
const kpiY = rightY + 0.55;
const kpiH = 1.0;
const kpiGap = 0.15;
const kpiW = (rightW - kpiGap * 2) / 3;
kpis.forEach((k, i) => {
  const kx = rightX + i * (kpiW + kpiGap);
  slide.addShape("rect", { x: kx, y: kpiY, w: kpiW, h: kpiH, fill: { color: COLOR.warmGray }, line: { color: COLOR.line, width: 0.5 } });
  slide.addShape("rect", { x: kx, y: kpiY, w: 0.06, h: kpiH, fill: { color: COLOR.rust }, line: { color: COLOR.rust } });
  slide.addText(k.v, {
    x: kx + 0.18, y: kpiY + 0.08, w: kpiW - 0.3, h: 0.45,
    fontFace: FONT, fontSize: 22, bold: true, color: COLOR.navy, valign: "middle",
  });
  slide.addText(k.l, {
    x: kx + 0.18, y: kpiY + 0.52, w: kpiW - 0.3, h: 0.42,
    fontFace: FONT, fontSize: 10, color: COLOR.inkSoft, valign: "top",
  });
});

const tlY = kpiY + kpiH + 0.25;
slide.addText("经营节拍", {
  x: rightX, y: tlY, w: rightW, h: 0.32,
  fontFace: FONT, fontSize: 12, bold: true, color: COLOR.navy,
});

const events = [
  { t: "2012·09", d: "开业满 1 周年：日均客流超 5 万人次" },
  { t: "2023·五一", d: "苏宁升级店开业首日：销售同比 +88.7%、客流 +33.3%" },
  { t: "2023·中秋国庆 8 天", d: "河东区 8 个综合体累计销售 1.4977 亿元（同比 +39.7%），客流 182 万人次（+42.2%）" },
  { t: "2024·春节 8 天", d: "河东区 6 个商业体累计销售 1.38 亿元，客流 170.6 万人次（+4.7%）" },
  { t: "2024·09·15", d: "影城 5 号厅 IMAX 激光系统升级 —— 天津首家 IMAX 激光影院" },
];

let ey = tlY + 0.4;
events.forEach((e) => {
  slide.addShape("ellipse", {
    x: rightX + 0.05, y: ey + 0.13, w: 0.12, h: 0.12,
    fill: { color: COLOR.rust }, line: { color: COLOR.rust },
  });
  slide.addText(e.t, {
    x: rightX + 0.28, y: ey, w: 1.5, h: 0.38,
    fontFace: FONT, fontSize: 11, color: COLOR.navy, bold: true, valign: "middle",
  });
  slide.addText(e.d, {
    x: rightX + 1.8, y: ey, w: rightW - 1.9, h: 0.38,
    fontFace: FONT, fontSize: 11, color: COLOR.ink, valign: "middle",
  });
  ey += 0.4;
});

// 数据透明度提示条
slide.addShape("rect", { x: 0.5, y: 6.85, w: 12.33, h: 0.45, fill: { color: COLOR.warmGray }, line: { color: COLOR.line, width: 0.5 } });
slide.addShape("rect", { x: 0.5, y: 6.85, w: 0.08, h: 0.45, fill: { color: COLOR.rust }, line: { color: COLOR.rust } });
slide.addText("现状张力 —— 硬件高配（投资 53 亿 / 总建面 51 万㎡ / 停车 4400 位），但项目级销售、客流、会员等经营数据长期不透明", {
  x: 0.72, y: 6.85, w: 12.0, h: 0.45,
  fontFace: FONT, fontSize: 12, bold: true, color: COLOR.navy, valign: "middle",
});

slide.addText("资料来源：天津河东万达广场深度研究报告.md", {
  x: 0.5, y: 7.32, w: 12.33, h: 0.18,
  fontFace: FONT, fontSize: 9, color: COLOR.inkSoft, align: "left",
});

const outPath = path.join(__dirname, "page_01.pptx");
await pres.writeFile({ fileName: outPath });
console.log("WROTE:", outPath);
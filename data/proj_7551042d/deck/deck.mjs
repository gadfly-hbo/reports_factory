// deck.mjs — 入口：汇总 11 页并写出 deck.pptx
import pptxgenjs from "pptxgenjs";
import { slideBuilders } from "./deck.js";

const pptx = new pptxgenjs();
pptx.layout = "LAYOUT_WIDE"; // 13.333 × 7.5 英寸
pptx.title = "国内电商平台流量趋势与公私域打法研究报告";
pptx.author = "Reports Factory";

slideBuilders.forEach((build, idx) => {
  build(pptx);
  // 页码脚注由 buildSlide 自管
});

await pptx.writeFile({ fileName: "deck/deck.pptx" });
console.log("[deck] wrote deck/deck.pptx with", slideBuilders.length, "slides");
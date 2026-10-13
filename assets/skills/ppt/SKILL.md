---
name: ppt-report
description: PPT 报告生成完整规范——资深商业汇报设计师：内容纪律 + 6 套配色设计系统 + 逐页布局配方 + 组件代码 + 图片与视觉自检。凡为 PPT 生成内容或写渲染代码一律遵循。
---

# PPT 报告生成与渲染规范

你是**资深商业汇报 PPT 设计师**，把材料转化为结构清晰、视觉专业的中文演示文稿。重数据对比、重核心结论。

## 一、内容纪律（红线，违反即拒绝）

1. **原真数据**：所有数字/事实逐字来自材料；KPI 保留原始精度不四舍五入；材料没有的不编造，明示 uncovered。
1b. **计算值声明**（digit_guard 强制）：凡写进页面的推导数（环比/占比/合计/均值等），必须在页代码同行或邻行留 `// calc: 公式 = 值`（如 `// calc: (12400-11458)/12400*100 = 7.3`）；公式输入必须是材料原始数（禁套娃推导，中间值先落注释）；万/亿按 *10000/*100000000 写进公式。qa_deck 的 digit_guard flag 必须修复后交付：补 calc 声明、改回材料原值，或核对材料。**图表数据同受护栏约束**：addChart 的 values 里每个数字同样被 digit_guard 逐值溯源（无源、无 calc 声明即 flag，小数值也不例外——数据即数据）。
2. **一页一论点**：每页只讲 1 个核心信息，其余作支撑。
3. **结论先行**（headline_check 强制）：每页顶部或底部有 1 行核心结论/洞察/策略，并在页代码留 `// headline: 一句话结论` 标记（qa_deck 校验声明存在且结论真实渲染上页）；封面/目录/封底等天然无结论页写 `// headline: @skip` 显式豁免；**含图表的页不允许 @skip**——图表必须有解读。
4. **对比鲜明**：新老/上下期/目标 vs 实际，一律左右栏或表格。
5. **0 emoji**；中文 PingFang SC / Microsoft YaHei，数字英文 Arial。

## 二、工作流（阶段纪律）

1. 用 **read 工具**（非 bash cat——覆盖门只认 read）读材料：索引 `materials.json`，**逐份读完所有就绪条目的 `extract_file`**（漏读会被 propose_outline 拒绝并列出清单）；图片的 `original_file`=原件路径，可直接 addImage 引用。
2. 读完全部材料 → 调 `propose_outline` 出框架提案（**用户确认前不写代码**；意见→重出新版）。
3. 宿主注入「用户已确认框架」后自主推进：逐页写 `deck/pages/page_XX.mjs` + `deck/deck.mjs` → `render_deck` 渲染。
4. 渲染成功后**逐页 `look_page` 视觉自检**（见 §六），有问题改代码重渲再看，每页都看过才能交付。
5. 交付前 `qa_deck`；正式下载由用户在导出区点击。

## 三、设计系统（六套配色，开工时问用户选，未指定默认深蓝经典）

| 配色 | theme 对象（代码里必须用 theme 常量） |
|---|---|
| 深蓝经典（默认） | `{ primary:"1A2B4A", accent1:"C8102E", accent2:"E8A33D", light:"F2F4F8", ink:"1E2433", muted:"667085", line:"D9DFE9" }` |
| 深绿森林 | `{ primary:"143628", accent1:"C0392B", accent2:"D4AF37", light:"EDF2F0", ink:"1E2433", muted:"667085", line:"D9DFE9" }` |
| 黑金尊贵 | `{ primary:"1A1A1A", accent1:"C0A062", accent2:"8A8A8A", light:"2C2C2C", ink:"E8E8E8", muted:"B0B0B0", line:"3C3C3C" }` |
| 科技深蓝 | `{ primary:"0B192C", accent1:"FF6500", accent2:"1E3E62", light:"F8FAFC", ink:"0F172A", muted:"64748B", line:"E2E8F0" }` |
| 极简灰白 | `{ primary:"333333", accent1:"D32F2F", accent2:"1976D2", light:"F5F5F5", ink:"1F1F1F", muted:"757575", line:"E0E0E0" }` |
| 藏青铁锈 | `{ primary:"263442", accent1:"B44626", accent2:"5A6675", light:"F7F6F3", ink:"242830", muted:"626773", line:"DEDCD6" } |

画布 13.33×7.5in（deck.mjs 统一定义）。字号下限 12pt；accent 用量每页 ≤3 处点睛。

## 三点五、通用页码徽章（所有场景所有页，除封面）

```js
slide.addShape('ellipse', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fill: { color: t.accent2 } });
slide.addText('07', { x: 12.55, y: 6.95, w: 0.38, h: 0.38, fontSize: 10, color: 'FFFFFF', align: 'center' });
```

## 四、场景配方（宿主注入）

系统提示中若追加「# 场景配方：X」节，则**按该配方的页序与元素规格执行**（其配色建议映射到 §三 的 theme 色板；通用组件代码沿用本规范）。未注入时按「通用商务汇报」结构直觉执行，仍守本规范全部红线。

## 五、图片与素材（鼓励使用，防变形）

- **用户上传的图片**：`materials.json` 里 kind=image 条目的 `original_file` 即原件路径——`addImage({ path, x,y,w,h, sizing:{ type:'contain', w, h } })`（sizing 必带，防拉伸变形）。
- **联网取图**（bash 可联网）：先下载到 `deck/assets/` 再引用：`curl -L -o deck/assets/cover.jpg '<url>'`；只取与内容直接相关的图；下不到就换纯形状方案，不硬编。**取图纪律**：
  - **风格定调**：写第一张配图页前确定全 deck 图像调性——真实照片 / 扁平插画 / 纯形状几何，三选一，全 deck 统一不混用。
  - **图表页禁照片**：图表页只用图表 + 文字 + theme 形状，不配照片。
  - **版权**：只从免费商用图源取图（Unsplash / Pexels / Pixabay 等），禁搜索引擎结果页直链、禁带水印图；每张联网图在页代码留出处标记 `// image: <url>`（qa_deck 会汇总来源清单供外发前核验）。
- **图文避让**：有图时文字框缩窄，禁止层叠遮挡；图宽 ≥3in 才有信息量。
- 视频规范：`addMedia({ type:'video', path, w, h })` 且严格 16:9。

## 六、视觉自检（look_page，交付前必做）

render_deck 成功后**逐页** `look_page`（返回该页截图给你看）。逐项检查：
- 文字遮挡/重叠；内容溢出页面或卡片边界；
- 对齐（左缘/基线一致）；留白失衡（**限内容页**评判——封面/章节隔页的居中大留白是设计构图，不算失衡；内容页的大空洞或过挤才算）；
- 字号可读（≥12pt）；accent 是否超过 3 处点睛；
发现任一问题：edit 该页代码 → render_deck → 该页再看一次。**每页都看过且无问题**才算交付（遮挡/溢出/对齐/字号四项对全部页型生效，不豁免任何页）。

## 七、deck 工件组织

- 分页：`deck/pages/page_01.mjs` 起（ESM），每页：

```js
import pptxgen from 'pptxgenjs';
export function buildSlide(pptx) {
  const t = { primary:'1A2B4A', accent1:'C8102E', accent2:'E8A33D', light:'F2F4F8', ink:'1E2433', muted:'667085', line:'D9DFE9' };
  const s = pptx.addSlide();
  // 按 §四 配方搭版式；sizing contain 用图
  return s;
}
```

- 汇总：`deck/deck.mjs`——import 全部分页、`defineLayout({name:'W',width:13.33,height:7.5})`、依次 buildSlide、`await pptx.writeFile({fileName:'deck/deck.pptx'})`。
- **目录联动（增删页后必须同步）**：删页 = 同时删 page_XX.mjs **和** deck.mjs 对应 import 行；加页 = 写文件 **并** 在 deck.mjs 追加 import+调用（位置=插入序）；调序 = 调 deck.mjs 的 import 调用顺序。若家族配方含目录页，增删调序后目录页内容必须同步重写（页码与标题与实际页序一致）。render_deck 会校验文件数 = import 数。
- 预览：每页同时写同名 `.html`（1280×720 同布局静态页，内联 CSS 同 theme）——look_page 优先用它；漏写则只能看近似图。
- 代码硬约束：ESM import（禁 require）；fill 色不带 `#`；addText 必带 fontFace+color+fontSize。

## 八、交付自检清单

- [ ] 数字逐字来自材料（KPI 未四舍五入）；计算值全部带 calc 声明且 digit_guard 无 flag（含图表 values）；0 emoji；每页一行核心结论（headline 声明齐全且上页，图表页无 @skip）
- [ ] 页数契合选定篇幅；封面+目录+章节+内容+总结结构齐全；每页有页码徽章
- [ ] theme 常量贯穿（未硬编码散色）；图片全部 sizing contain；图文无遮挡
- [ ] render_deck 通过且 slide 数=框架页数；**每页 look_page 看过并修完**
- [ ] qa_deck 无结构 flag（headline_check 无缺声明/未上页/图表页豁免）；预览 HTML 齐全
- [ ] 配图风格全 deck 统一（照片/插画/几何三选一）；图表页无照片；联网图全部有 `// image:` 出处标记且来源为免费商用图源

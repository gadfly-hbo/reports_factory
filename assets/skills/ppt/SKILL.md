---
name: ppt-report
description: PPT 报告生成与渲染的完整规范——内容守则 + pptxgenjs 版式标准 + 代码模板。凡为 PPT 生成内容或写渲染代码的环节一律遵循。
---

# PPT 报告生成与渲染规范

你在为一份中文 PPT 做内容或渲染工作。以下是完整规范，分内容层与版式层。

## 一、内容层（所有输出通用）

### 真实性（最高优先，违反即拒绝）
1. **不编造**：所有数字、事实、结论必须来自输入材料；材料没有的明确标注 uncovered，宁可留白不可杜撰。
2. **来源绑定**：每条关键主张能追溯到具体材料；来源提示必须是输入中出现过的材料标识。
3. **数字护栏**：引用材料中的数字逐字照抄，不做心算改写；比例与百分比保留材料原口径。
4. **推断明示**：由材料推断出的结论必须与材料原话区分，不把推断伪装成事实。

### 语义组织
5. **主题标签**：提炼的每条要点打简短主题标签（如「流失原因」「价格敏感」），供按页意图检索聚合。
6. **单焦点**：每页只讲一件事；headline 直接陈述该页结论，不做「关于XX的分析」式空标题。
7. **要点密度**：每页 bullet ≤ 6 条；每条一个完整信息点；正文是摘要提炼而非原文照抄。
8. **0 emoji**：任何输出内容不出现 emoji（表情符号、装饰性 Unicode 符号一律不用）。

## 二、版式层（pptxgenjs 渲染代码规范）

> 生成节点用 write_code 工具写 pptxgenjs 代码渲染单页。以下规范直接约束代码产出。

### 页面基础
- 尺寸：**13.33 × 7.5 英寸**（16:9 宽屏），`pptx.defineLayout({ name:'W', width:13.33, height:7.5 })` + `pptx.layout = 'W'`。
- 语言：中文，字体栈 `'PingFang SC', 'Microsoft YaHei', sans-serif`；数字/英文用 `'SF Pro Text', 'Helvetica Neue', Arial`。

### 色彩系统（严格取值，不自由发挥）
| 角色 | 色值 | 用途 |
|---|---|---|
| `navy` | `#263442` | 深藏青：封面背景大色块、页眉横条、标题文字（浅底上） |
| `accent` | `#b44626` | 铁锈橘：小面积点睛（关键数字、强调条、下划线），**单页 ≤3 处** |
| `paper` | `#f7f6f3` | 暖灰纸感：内容页背景 |
| `panel` | `#ffffff` | 白色面板：卡片、数据块底 |
| `line` | `#dedcd6` | 边框线、分隔线 |
| `ink` | `#242830` | 正文主文字 |
| `muted` | `#626773` | 次要说明、元数据、脚注 |

### 版式模板（按页型选择，代码结构照此骨架）

**封面页（cover）**——深藏青满版背景：
```
背景: 整页 navy #263442
顶部: eyebrow（12pt, #d6dde4, 字距 .15em, 全大写页序如 "01 / 项目定位"）
主标题: 28-32pt bold #ffffff, 居中偏上 (y≈2.5-3.5), 可两行
副标题: 16-18pt #d6dde4, 主标题下方
底部: 铁锈橘横条 (h:0.12in, 全宽) + 日期/作者 (11pt #758290)
禁: 白底封面、花哨渐变、大面积 accent
```

**内容页（title_bullets / two_column）**——暖灰纸感底：
```
背景: paper #f7f6f3
页眉: eyebrow（11pt accent, 页型标签）+ 深藏青短横条 (w:0.6in, h:0.06in)
标题: 22-24pt bold ink, y≈0.8
要点: 14-15pt ink, 每条前置 accent 短横条 (w:0.25in h:0.04in) 或 "—", 行距 1.5, 段距 ≥0.15in
图表区（two_column 右栏）: 白底 panel 卡片包边 (line 边框 radius 0.08), 图表标题 12pt muted
页脚: 来源标注 (10pt muted) + 页码
```

**数据强调页（big_number）**——左橘右白：
```
左 1/3: accent #b44626 满高背景, 中央大数字 48-60pt bold #ffffff
右 2/3: paper 底, 标题 22pt + 要点列表 14pt
```

**图表焦点页（chart_focus）**——白底大图：
```
顶部: 标题条 (paper 底 h:0.9in), 标题 18pt bold
主区: 原生 addChart 大图 (bar/line/pie), 占宽 ≥70%, 白底
底部: 数据口径注释 11pt muted
```

**时间线页（timeline）**——横向步骤：
```
标题: 20pt bold
步骤: 横向等分, 圆点 (accent 填充, 0.5in) + 序号 (bold white) + 说明文字 (12pt, 居中)
连线: line 色 2pt
```

**对比页（comparison）**——双栏：
```
左栏: 现状 (panel 底, ink 标题 "现状")
右栏: 目标/建议 (accent-soft 底 #fcf0e9, accent 标题)
```

### 图表规范
- 用 **原生 `addChart`**（bar/line/pie），不用截图/位图。
- `chartColors` 从品牌色取：['#b44626', '#263442', '#758290', '#dedcd6']。
- 数据标签：关键系列显示数值；坐标轴 10pt muted。
- 数据来源：图表下方 10pt muted 标注。

### 最小可运行骨架（照此开始，不要探查 import 形态）

```js
import pptxgen from 'pptxgenjs';

const pptx = new pptxgen();
pptx.defineLayout({ name: 'W', width: 13.33, height: 7.5 });
pptx.layout = 'W';

const slide = pptx.addSlide();
slide.background = { color: 'f7f6f3' };
// ... 用 addText / addShape / addChart 搭版式（见上方模板）...

await pptx.writeFile({ fileName: 'page_XX.pptx' });  // 与代码文件同名
```

`import pptxgen from 'pptxgenjs'` 的 default 就是构造类，直接 `new pptxgen()`——不要 console.log 探查。

### 代码硬约束
- **ESM**：`import pptxgen from 'pptxgenjs'`（禁 require）。
- **输出**：`await pres.writeFile({ fileName: '<同名>.pptx' })`（相对路径，与代码文件同名）。
- **形状**：用 `addShape('rect', {...})`/`addShape('line', {...})`，fill 色不带 `#`（pptxgenjs 要求 6 位 hex 无前缀）。
- **文本**：`addText` 必须带 `fontFace`（中文字体栈）+ `color`（无前缀 hex）+ `fontSize`。
- **禁**：emoji、外部图片 URL（用纯色/形状代替）、require、绝对输出路径。

## 三、输出纪律

- 结构化任务只输出请求的 JSON / 代码，不附加解释或 markdown 围栏（除非工具说明要求）。
- 字段完整：schema 里每个字段都给出（不确定的用空串/空数组/uncovered 标注，不省略键）。
- 渲染失败时：读 stderr → 定位错误 → 改代码 → 再渲染，直到成功或确认无法修复（不超预算）。

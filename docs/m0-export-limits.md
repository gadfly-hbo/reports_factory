# M0 交付样例验证：导出限制清单与门禁判定

- 日期：2026-09-22 ｜ 里程碑：M0（proposal §14）
- 样例：`samples/retail-review/`（`npm run sample` 再生成；快照 `node scripts/snapshots.mjs`）
- 样例内容为虚构演示数据（零售经营复盘 8 页，覆盖全部 8 种页型）

## M0 门禁判定（proposal §14：进入 M1 的条件）

| 门禁项 | 判定 | 证据 |
|---|---|---|
| 关键页面可读 | ✅ 通过 | 视觉验收 8/8 pass（1280×720 快照逐页检查：无溢出/裁切/重叠，层级清晰）；自动测试 `tests/page-types.test.ts`（PDF 8 页、16:9、文本可抽取） |
| 主要对象可编辑 | ✅ 通过 | `tests/page-types.test.ts`：标题/正文为 PPTX 文本 run（`<a:t>`）、指标/方案/行动三页为原生表格（`<a:tbl>`）、趋势图为原生 chart 部件（含缓存数值 `<c:v>452</c:v>`） |
| 无格式阻断 | ✅ 通过 | 跨格式一致性校验 0 缺失（`tests/m0-consistency.test.ts`：8 页 authored 文本在 HTML/PPTX/PDF 三产物全部可定位、页数一致）；超长标题触底标记拆页而非无限缩字 |

## 可编辑性分级（proposal §11.5，按对象）

| 对象 | PPTX 可编辑性 | 说明 |
|---|---|---|
| 标题/页型标签/正文/要点 | 原生可编辑 | pptxgenjs 文本框，字体 Microsoft YaHei |
| 表格（指标总览/方案比较/行动） | 原生可编辑 | pptxgenjs 原生表格对象 |
| 柱状/折线/饼/环形图 | 原生可编辑 | pptxgenjs 原生 chart 对象（数值可追溯至 ChartSpec） |
| 图表配色/坐标轴细节 | 部分可编辑 | Office 内可改，但重渲染以 ReportSpec 为准 |
| 导入的图表图片 | 图片资产 | 无底层数据，不可编辑其数据（M1 材料导入后生效） |

## 环境限定

- **已验证**：macOS（arm64）+ Playwright Chromium（PDF/预览）+ pptxgenjs 4.0（PPTX 结构断言）。
- **未验证（声明）**：Windows + PowerPoint/WPS 真机打开效果（C1 已批准延后）。PPTX 字体指定 Microsoft YaHei（Windows 常见），macOS 无该字体的环境会回退；未打包字体文件。
- 不承诺不同操作系统/渲染引擎版本下文件字节一致（proposal §10.4）。

## 引擎限制与已知取舍

1. **PDF 文本抽取伪影**：Chromium 产物的 ToUnicode 会把个别汉字映射为部首码位（康熙部首区 NFKC 可归一；CJK 部首补充区已实证映射 ⻅⻓⻔⻛ 四字），一致性校验已按此归一；**新出现的部首字符会显式报不一致而不是静默通过**。
2. **图表数值跨格式一致性**：由"同一 ChartSpec 喂两端"构造保证（HTML SVG 与 PPTX chart 数据同源），未做逐数值抽取比对（SVG 无文本化数值）。
3. **超长标题**：确定性测宽缩号至下限（HTML 24px / PPTX 18pt），触底标记 `data-needs-split`（HTML）供检查引擎消费；PPTX 端字号触底不再缩小，溢出由人工拆页处理。
4. **空数据图表**：渲染"待补充数据"占位，不伪造图表（proposal §4.2）。
5. **留白观察**（非缺陷）：要点类页面内容集中在上部，留白节奏一致；后续里程碑可增加辅助行或收紧版心。
6. **饼图/环形图**：HTML/PDF 端经 ECharts SSR 渲染，PPTX 端为原生对象；复杂图形（如双轴组合图）尚未支持，属 M3 范围。

## 下一步

M1 独立闭环 MVP（项目存储 → 材料导入 → 确定性大纲 → 页面组装与局部编辑 → 质量检查与导出门禁），见 `.flow/tasks.md`。

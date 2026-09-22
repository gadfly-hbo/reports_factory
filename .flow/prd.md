# Report Studio M2 PRD｜稳定性工程基座

- **上游规范：** `.flow/proposal.md`（M2 固化稿）→ `.flow/proposal-v1.0.md`（v1.0 全量方案）
- **红队：** `.flow/red-team.md`（GO；三条硬约束已吸收进本 PRD）
- **实证（2026-09-22）：** PPTX/PDF 两次生成字节哈希不等、归一化文本与页数完全相等；PPTX 元数据默认含 `PptxGenJS` 字样（需清理）

## Problem Statement

M1 闭环能跑通，但四个真实缺口挡在"可用于真实会议"前面：对外导出没有隐私检查（图表底层数据、文档元数据、隐藏内容是否泄露无人把关）；用户看不出两次修订差在哪，只能重读全文；标准轴审查留档的坏味道拖维护；回归验证靠手跑多个命令而非一条命令的样例集。

## Solution

按 v1.0 §14 对 M2 的定义（返工/冲突/版本/隐私/导出），交付四个工程切片：

1. **导出隐私检查与对外分享控制**：对外导出前的逐项可测隐私检查（图表底层数据/元数据/隐藏内容/备注），图表底层数据脱敏选择（保留可编辑 vs 聚合降级），元数据中性化。
2. **版本比较**：任意两个修订的结构化差异 API + UI 清单式视图；数字/绑定变更重触发检查（§5.3）。
3. **标准轴重构窗口**：审查留档坏味道清理，纯重构行为不变，现有 68 测试 + 冒烟为行为锁。
4. **回归样例集**：`npm run regression` 一条命令；golden 基于归一化文本与对象形状（**禁止字节哈希**，红队约束①已实证）。

候选：XLSX 导入回收（预算不足首先砍，延续 A1）。

**重要边界（红队约束③）：** M2 阶段门"多次实际使用可重复完成"需要真实用户重复使用，本轮 flow 交付工程基座，**不宣称 M2 阶段门通过**。

## User Stories

### 导出隐私（§12.2 对外导出行、§13.3 质量门槛后半句）

1. As a 汇报人, I want 对外导出前看到逐项隐私检查结果（图表底层数据/元数据/隐藏内容/备注各自通过与否）, so that 我知道系统检查了哪些项。
2. As a 汇报人, I want 检查结果明示哪些项**未覆盖**, so that 我不会得到虚假的"全面安全"承诺。
3. As a 汇报人, I want 对外分享时在"保留可编辑数据"与"只分享聚合结果"间明确选择, so that 安全与可编辑性的取舍由我掌握（§12.2）。
4. As a 汇报人, I want 选择"只分享聚合结果"后 PPTX 中的图表变为图片（底层数据不可提取）且导出记录标注可编辑性, so that 图表数据不外泄。
5. As a 汇报人, I want 外发产物的文档元数据不含工具名与作者信息, so that 制作链路不外泄。
6. As a 汇报人, I want 内部导出不受这些限制, so that 本地工作不受影响（默认 local_only 行为不变）。

### 版本比较（§5.3、M2 交付"版本比较"）

7. As a 汇报人, I want 看到任意两个修订的结构化差异（页增删/重排、标题/正文/要点/表格单元、指标数值、claim 绑定）, so that 我审查改动而不重读全文。
8. As a 汇报人, I want 差异按页分组、字段级"旧→新"展示, so that 改动一目了然。
9. As a 汇报人, I want 差异中若含数字或结论绑定变化，系统自动对该修订重跑质量检查并附上结果, so that 修改绕不过质量门（§5.3 后半句）。
10. As a 汇报人, I want 在 UI 中从修订列表选两个版本比较, so that 操作有可视化控件（不只靠 API）。

### 回归样例集（M2 交付"回归样例"）

11. As a 维护者, I want 一条 `npm run regression` 跑完：全部测试 + 零售样例再生成 + 三格式一致性 + 可编辑性断言 + golden 文本比对, so that 回归是一条命令。
12. As a 维护者, I want golden 基线可显式刷新（`--update`）且文本基线进 git, so that 有意变更可接受、无意漂移可发现。

### XLSX 导入（候选回收）

13. As a 业务分析师, I want 导入 XLSX 时先看到工作表清单并明确选择哪一张, so that 多表工作簿不被猜错（§4.2 表格限制）。
14. As a 业务分析师, I want XLSX 解析与 CSV 共用列口径登记/待确认/冲突检测, so that 口径规则一致。
15. As a 用户, I want XLSX 中的宏/脚本不执行, so that 文件导入安全（§12.2 文件导入行）。

### 重构（技术债务，无用户故事，行为锁为验收）

## Implementation Decisions

### 隐私检查器（逐项可测，红队约束②）

- `checkPrivacy(spec, ctx)`：逐项输出 `{ item, status: pass|flag|not_checked, detail? }`；检查项清单：
  - `chart_underlying_data`：PPTX 含原生 chart 部件（数据可提取）→ 对外默认 flag，需"保留可编辑"显式确认或聚合降级
  - `doc_metadata`：PPTX 的 dc:creator/dc:title/dc:subject、PDF Producer —— 导出时中性化（author/company/title/subject 置项目名或空）
  - `hidden_content`：spec 中页只有单渲染路径（无隐藏页概念）→ not_checked 并明示
  - `speaker_notes`：当前渲染不写备注 → not_checked 并明示
  - `sensitive_source_marks`：标记 sensitivity=sensitive 的来源被对外导出 → flag
- **明示原则**：检查器输出必须含 `not_checked` 项及其含义；UI 展示"已检查 X 项 / 未覆盖 Y 项"。
- 图表降级实现：ECharts SSR SVG → Chromium 截图为 PNG → PPTX addImage（标注图片资产）；导出记录 `chart_data_mode: 'keep_editable' | 'aggregate_only'`。
- API：`POST /export` 增加 `exportScope`、`chart_data_mode`；external + keep_editable 需 UI 显式确认参数 `ack_editable_data: true`；external + sensitive 来源 → 阻断。

### 版本比较

- `src/compose/diff.ts`：`diffSpecs(a, b)` 纯函数 → `{ pages_added[], pages_removed[], pages_reordered[], pages_changed[{page_id, headline?, body?, bullets_added/removed/changed[], table_cells_changed[], metric_refs_changed, claim_refs_changed}], metrics_changed[], claims_changed[] }`；数值单元按字符串逐项对比（同型归一后）。
- workbench.diff(projectId, a, b) → diff；若 `metrics_changed` 或 `claims_changed` 非空 → 附 `recheck: CheckReport`（对新修订重跑检查，§5.3 后半句）。
- API：`GET /api/projects/:id/diff?a=rev_001&b=rev_002`。
- UI：导出记录卡下方加"版本比较"卡：修订下拉 A/B → 差异清单（按页分组）。

### 标准轴重构（行为不变）

- 删除死代码：`TEMPLATE`/`void TEMPLATE`、`void spec`、`claimKindVisual`（确认全仓库零使用后删）。
- WorkspaceStore 布局收口：`sourceAssetsPath/saveDerivedAssets/workStatePath` 等方法；persist.ts/app.ts/workbench.ts 不再拼路径。
- 去重：渲染页脚规则提取共享函数；storage 读目录循环提取；空 IngestResult 工厂；edit 提取 updatePage。
- 类型化：API 请求体 zod 校验（复用已有 schema）；open_questions 结构化 `{text, kind: 'conflict'|'confirmation'|'gap', ref?}`；pageTypeLabels → Record<PageType, string>。
- 每步 `npm run verify` + 冒烟。

### 回归样例集

- `scripts/regression.mjs` + `npm run regression`：
  1. `vitest run` 全部测试
  2. 样例再生成（tmp 目录）
  3. 三格式一致性校验 + 可编辑性对象断言
  4. golden：抽取归一化文本与 `samples/retail-review/golden/*.txt` 比对；不一致打印 diff 退出非零；`--update` 刷新基线
- golden 文本文件进 git（`.gitignore` 放行 `samples/**/golden/`）。
- 字节哈希一律不用（实证：字节每次不等）。

### XLSX（候选）

- exceljs 只读单元格值（公式取缓存值，宏不执行）；`ingestXlsx` 与 CSV 共用列口径/冲突逻辑。
- 先 `listSheets` 返回工作表清单；`sheet` 参数**必须显式指定**（§4.2：用户明确选择工作表）；无默认猜测。
- UI 暂不建工作表选择器：API 先列后选；UI 上传 XLSX 时若未选表则返回待确认问题并列出选项（复用 confirmations 通道）。

## Testing Decisions

- **隐私**：带毒样例（元数据含作者名、原生图表含数据、sensitive 来源）→ 检查器逐项命中；aggregate_only 导出后断言：无 chart 部件、图片部件存在、元数据中性；keep_editable 无确认 → 阻断。
- **版本比较**：对 M1 已知编辑用例（只改第 3 页标题）断言 diff 恰好报一处变更；拆页/重排/指标变更各有用例；数字变更触发 recheck。
- **回归**：spec 不动时回归通过；临时篡改 spec 某单元值 → golden diff 报告该值、退出非零（在测试内用临时目录完成，不污染仓库基线）。
- **重构**：68 测试 + 冒烟全绿为行为锁，不加新测试（新增行为另有测试时除外）。
- **XLSX**：多表工作簿 fixture（xlsx 库生成）→ 选表 → 列口径/冲突复用断言；带宏文件（伪造 vbaProject 标记）不执行且正常读值。
- **seam 复用**（已在 flow #1 确认）：E2E 主链 + 渲染契约 + 核心单元；新增 seam 只有 diff API 与隐私检查器（pubic 接口级）。

## Out of Scope

- M2 阶段门的真实使用采样（交反馈记录模板与指标口径说明；采样留给用户）。
- 外部模型实际接入；M3（长报告/一页摘要独立形态/品牌模板/DOCX）；M4（JuanerAI 适配器）。
- PPTX 动画、模板市场、多人协作；UI 精细双栏并排 diff 渲染。
- PDF 元数据深度清理（Chromium 产物的 Producer 字段不可完全控制——作为 `not_checked` 明示，不假装覆盖）。
- 字节级 golden（实证不可行）。

## Further Notes

- 反馈记录模板放 `docs/m2-usage-log.md`：§15 指标（到初稿时间/返工量/重复使用/无关变更率）的登记口径与最小表单。
- 红队三条硬约束已落地为：golden 禁字节、隐私逐项可测+明示未覆盖、DONE 总结不宣称 M2 门通过。

---

## M2 GRILL 决议（留白自答，全部按推荐；差异门用户未作答、全部为纯新增项已自我批准）

| # | 留白问题 | 决议 |
|---|---|---|
| M2-G1 | diff 对齐策略 | 按 page_id 精确匹配：增/删/重排（同一 id 顺序变化）；同 id 再逐字段比对 |
| M2-G2 | golden 文本粒度 | 复用 extractHtmlText/extractPptxText/extractPdfText（NFKC+部首映射+去空白）+ 页数 + 可编辑对象形状断言；ECharts SVG 随机 id 不进 golden（只存抽取文本） |
| M2-G3 | 图表降级 PNG 质量 | Chromium 截图 deviceScaleFactor=2（导出清晰度），base64 嵌入 PPTX addImage |
| M2-G4 | XLSX 解析器 | exceljs 只读（公式取缓存值）；宏不执行（xlsx 格式 xlsm 同样只读）；`ingestXlsx(listSheets)` 与 `ingestXlsx(buffer, sheet)` 两阶段 |
| M2-G5 | UI 版本比较入口 | 独立"版本比较"卡，修订下拉 A/B + 差异清单（按页分组），不做并排渲染 |
| M2-G6 | ExportRecord 兼容 | 新字段（export_scope、chart_data_mode、privacy_report）全部 optional——旧记录不迁移、新读取不报错 |
| M2-G7 | 重构切片顺序 | 回归集先行（装好行为锁）→ 重构 → 隐私 → 版本比较 → XLSX |

## 附录：PRD 相对 M2 proposal 的差异清单（送用户确认）

**新增（留白具体化）：**

| # | 差异 | 说明 |
|---|---|---|
| A1 | 图表降级实现路径：ECharts SVG → Chromium 截图 PNG → PPTX 图片 | proposal 只要求"明确选择"，未规定实现 |
| A2 | diff API 结构 + UI 清单式视图（不做双栏并排渲染） | proposal 未规定形态 |
| A3 | golden 文本进 git + `--update` 刷新机制 | proposal 未规定 |
| A4 | XLSX 用 exceljs 只读 + **必须显式选表**（不做默认第一表猜测，§4.2 对齐） | proposal 未选库 |
| A5 | `POST /export` 新增 `exportScope`/`chart_data_mode`/`ack_editable_data` 参数；ExportRecord 增字段 | 对外分享控制的接口形态 |
| A6 | 隐私检查器 `not_checked` 机制（明示未覆盖项） | 红队约束②落地形态 |

**调整（与上游建议偏差）：** 无——XLSX 选表遵循 §4.2 而非简化。

**删除：** 无。

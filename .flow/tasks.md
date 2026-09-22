# Report Studio M2 任务清单（dev-flow 第二轮）

来源：`.flow/prd.md`（M2）+ `.flow/proposal.md`（M2 固化稿）+ `.flow/red-team.md`（三条硬约束）。
顺序遵循 M2-G7：回归行为锁先行 → 重构 → 隐私 → 版本比较 → XLSX。

## 顶部检查清单

- [x] 1. 回归样例集与 golden 机制（行为锁先行）
- [x] 2. 标准轴重构窗口（行为不变）
- [x] 3. 导出隐私检查 + 元数据中性化 + 图表降级
- [x] 4. 版本比较（diff API + 差异重检 + UI 视图）
- [ ] 5. XLSX 导入（显式选表、宏不执行）

---

## 1. 回归样例集与 golden 机制（行为锁先行）

### What to build

`npm run regression` 一条命令：①vitest 全部测试 ②零售样例再生成（临时目录）③三格式一致性校验 + 可编辑对象断言 ④golden 文本比对——归一化抽取文本（复用 extractHtmlText/extractPptxText/extractPdfText）+ 页数与对象形状，与 `samples/retail-review/golden/{html,pptx,pdf}.txt` 比对；不一致打印 diff 并非零退出；`--update` 刷新基线。golden 文本进 git（调整 .gitignore）。**禁止字节哈希**（已实证字节每次不等）。

### Acceptance criteria

- [ ] `npm run regression` 在当前代码全绿
- [ ] 篡改 spec 某表格单元（临时目录试验）→ golden 比对报告该值、退出非零
- [ ] `--update` 刷新基线后可复绿
- [ ] golden 文件随 git 追踪（文本，非二进制）
- [ ] ECharts SVG 内部随机 id 不进入 golden（只存归一化文本）

### Blocked by

None - can start immediately

---

## 2. 标准轴重构窗口（行为不变）

### What to build

审查留档 5 项（review-findings.md Standards 轴）：删除死代码（`TEMPLATE`/`void TEMPLATE`、`exportGate` 的 `spec` 参数、`claimKindVisual`）；workspace 磁盘布局收口进 WorkspaceStore 方法（persist/app/workbench 不再拼路径）；去重（渲染页脚规则共享、storage 读目录循环、空 IngestResult 工厂、edit 的 updatePage）；类型化（pageTypeLabels → Record<PageType,string>；API 请求体 zod 校验；open_questions 结构化 `{text, kind, ref?}`，UI 按 kind 过滤）。

### Acceptance criteria

- [ ] `npm run verify` 全绿（typecheck + 68 测试 + 双构建）
- [ ] `npm run regression` 通过且 golden 文本零漂移（重构前后比对）
- [ ] `node scripts/smoke-ui.mjs` 10/10 通过
- [ ] 零新功能、零行为变化（diff 不含逻辑改动，仅结构）

### Blocked by

- 1

---

## 3. 导出隐私检查 + 元数据中性化 + 图表降级

### What to build

`checkPrivacy(spec, ctx)` 逐项可测（chart_underlying_data / doc_metadata / hidden_content / speaker_notes / sensitive_sources），含 not_checked 项明示。元数据中性化：PPTX（pptxgenjs author/company/title/subject 置中性）、PDF Producer 标 not_checked。图表降级：external + `aggregate_only` 时原生 chart → Chromium 截图 PNG → addImage（2x 清晰度），导出记录标注图片资产。门禁：external + sensitive 来源 → 阻断；external + 原生 chart 且未选降级且未确认 → 阻断（需 `ack_editable_data: true`）。API/ExportRecord 增 `export_scope`、`chart_data_mode`、`privacy_report`。UI 导出卡：范围选择（内部/对外）、图表数据选择（保留可编辑/聚合降级）、确认勾选。

### Acceptance criteria

- [ ] 带毒样例（元数据作者名 + 原生图表数据 + sensitive 来源）：检查器逐项命中
- [ ] aggregate_only 导出：无 chart 部件、有图片部件、元数据中性、记录标注
- [ ] keep_editable 无确认 → 阻断；确认 → 放行且记录
- [ ] external + sensitive 来源 → 阻断；内部导出行为不变
- [ ] 隐私报告含 not_checked 项并在 UI 可见
- [ ] 全部既有测试回归绿

### Blocked by

- 2

---

## 4. 版本比较（diff API + 差异重检 + UI 视图）

### What to build

`src/compose/diff.ts`：diffSpecs(a, b) 纯函数——按 page_id 匹配，页增/删/重排，页内字段级（headline/body/bullets/table 单元/metric_refs/claim_refs），metrics/claims 层变更。workbench.diff(a, b) → diff + （数字/绑定变化时）对新修订 recheck（§5.3）。API `GET /api/projects/:id/diff?a=&b=`。UI"版本比较"卡：修订下拉 A/B + 按页分组差异清单（旧→新）。

### Acceptance criteria

- [ ] 已知编辑用例（只改第 3 页标题）→ diff 恰好报一处变更
- [ ] 拆页/重排/指标变更各有精确断言
- [ ] 指标或绑定变化 → recheck 结果随 diff 返回
- [ ] UI 走查：编辑 → 选两版本 → 差异可见（冒烟脚本扩展）
- [ ] 全部既有测试回归绿

### Blocked by

- 2（不与重构冲突性改动同频）

---

## 5. XLSX 导入（显式选表、宏不执行）

### What to build

exceljs 只读（公式取缓存值，宏不执行）。`listSheets(buffer)` 返回工作表清单；`ingestXlsx(buffer, sheet)` 必须显式指定（§4.2）；与 CSV 共用列口径登记/待确认/冲突检测（提取共享 buildTableAsset）。API：POST /sources kind=xlsx 未选表 → 返回 sheets 清单 + 待确认问题；带 sheet 重试 → 解析。UI：XLSX 上传出现工作表选择后重新提交。

### Acceptance criteria

- [ ] 多表工作簿 fixture：listSheets 正确；未选表被拒并列出选项；显式选表解析正确
- [ ] 列口径/待确认/冲突检测与 CSV 一致复用
- [ ] 含宏标记文件正常读值且不执行任何脚本
- [ ] 既有测试回归绿 + regression 绿

### Blocked by

- 3, 4（末位候选；预算不足首先砍）

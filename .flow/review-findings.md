# dev-flow 双轴审查发现（REVIEW 阶段）

- 审查范围：`git diff 29e84bc...HEAD`（M0 + M1 全部 10 个切片）
- 固定点：29e84bc（PRD 基线提交）；baseline_dirty = []（无用户既有改动）
- 规格源：`.flow/proposal.md` + `.flow/prd.md`（含 G1–G19）+ `.flow/tasks.md`

## Standards（标准轴）

**(a) 文档化标准违规：无。** 仓库无 CODING_STANDARDS.md/CONTRIBUTING.md，以下全部为基线代码坏味道（判断性建议，非硬性违规）。

1. **Speculative Generality —— 死代码以 `void` 保活**
   - `src/model/gateway.ts:184`：`TEMPLATE` 常量除 `void TEMPLATE;` 外无任何读取（注释称留作未来页数预算处理）
   - `src/checks/engine.ts:219`：`exportGate(spec, report, input)` 接收 `spec` 后丢弃（`void spec;`）
   - `src/render/theme.ts:54`：`claimKindVisual` 导出后全仓库（src/web/tests）零使用
   - 修法：三处删除，真实需要时再加回

2. **Shotgun Surgery —— workspace 目录布局泄漏到四个模块**
   - 磁盘布局知识（`<root>/<projectId>/{sources,revisions,exports,work}`）散布在 `src/storage/workspace.ts`、`src/ingest/persist.ts:76`、`src/server/app.ts:98`（该 handler 甚至自己写 `conflict-resolutions.json`，绕过 store 直连 `store.root`）、`src/server/workbench.ts:47,80,96`
   - 修法：把这些路径操作收进 `WorkspaceStore` 方法

3. **Duplicated Code**
   - (i) 页脚规则在两个渲染器重复：`src/render/html.ts:24 sourceLine()` 与 `src/render/pptx.ts:98 addFooter()` 都是 `chart.source_ref / table.source_ref / required_note → join('　|　')`
   - (ii) `src/storage/workspace.ts` 的 `readdir → filter('.json') → parse` 循环在 listProjects/listSourceAssets/listRevisions/listExports（183/241/263/292 行）重复四次
   - (iii) `src/server/app.ts:97` 与 `src/server/workbench.ts:103` 动态 `await import('node:fs/promises')`，而两文件顶部已有静态导入
   - (iv) `src/compose/edit.ts` 五个 case 中四个重复 `spec.pages.map((p) => p.page_id === op.page_id ? { …p, … } : p)` —— 可提取 `updatePage(spec, id, patch)`
   - (v) 全空的 `IngestResult` 字面量在 csv.ts（×2）、persist.ts（×2）、markdown.ts 拼写五次

4. **Primitive Obsession —— 无类型/字符串化边界**
   - (i) `src/server/app.ts` 对请求体零校验：全部裸 cast（如 27 行 `req.body as { title: string … }`），与仓库自身 zod 惯例相悖
   - (ii) `web/src/App.tsx:104` 用子串匹配重推领域语义：`draft.open_questions.filter((q) => q.includes('冲突'))` —— `open_questions: string[]` 把已结构化建模的 `SourceConflict` 压平成散文再让 UI 反解析
   - (iii) `src/render/theme.ts:87` `pageTypeLabels` 用 `Record<string, string>` 而非 `Record<PageType, string>`，放弃了 tsc strict 本可检查的穷尽性

## Spec（规格轴）

**可信核心成立**：推断不升级（markdown 推断→unverified；bound_to_source→needs_review"绑定来源≠真实"）；冲突不静默择一（conflict 检测 + 阻断）；正式导出门禁有效；冻结快照字节级验证通过；PrivacyGate 阻断未授权出站且日志只记元信息；缺数据不伪造（待定/待确认/占位/gap_notes）；XLSX 延后与"仅模型接口"承诺兑现（src 无网络代码）；**无范围蔓延**。

规格缺口（M0+M1 批准边界内）：

1. **管道不产生 metrics**（部分实现）：`assembleReportSpec` 硬编码 `metrics: []`（assemble.ts:183），CSV 摄入不派生差额/占比/变化率；§10.2"简单计算…由代码复算"仅在手工 fixture 上生效，E2E 产物 spec 零 metrics。
2. **拆页操作缺失**：§5.3 与切片 7 验收都列"第三页拆成两页"，`EditOp` 无 split。
3. **编辑不产生修订**：切片 7 验收"每次实质修改产生新 ReportRevision（parent 链）"；`workbench.edit` 只写 work/state.json，修订仅在导出时铸造，§10.2"保留人工修改与确认记录"无记录路径。
4. **来源替换影响面未上界面**：`pagesImpactedBySource` 只有 e2e 测试调用，无 API/UI 呈现；§13.2"提示受影响页面"仅在测试内成立。
5. **冲突解决不记录采用值**：`/resolve-conflict` 只收标签；`manual_value` 不带数值，选定口径不落入记录（阻断清除但无"采用了哪个数"的留痕）。
6. **导出记录只存检查计数**：`ExportRecord.checks` 仅 `{blockers, warnings}`，§10.4"导出绑定检查结果"无法事后重建问题清单。
7. （轻）UI 正式导出按钮未随阻断禁用——服务端阻断+提示已满足功能要求，属视觉增强。

## 汇总（CONVERGE 分类）

**阻断（spec-axis 缺口，进入修复循环，review_cycles 0→1）**：S1 metrics 派生、S2 拆页 op、S3 编辑铸修订、S4 影响面上 API/UI、S5 冲突解决记录采用值、S6 导出绑定完整检查结果。

**非阻断（记录不动）**：标准轴全部 4 组判断性坏味道（死代码 void 保活、布局知识泄漏、五处重复、字符串化边界）；S7 UI 按钮禁用（功能已满足）。留待 M2 重构窗口，按 TDD 技能纪律不在本轮切片外重构。

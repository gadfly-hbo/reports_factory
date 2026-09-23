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

## 修复循环记录

- **第 1 轮（review_cycles 1）**：S1–S6 全部修复并提交（ce9500b），68 项测试 + verify + UI 冒烟全绿。
- **第 1 轮复审**：6 项修复核心全部验证成立；另发现 3 项新缺陷——①S4 的 UI 列补丁未实际渲染（脚本替换未命中）；②resolveConflict 整文件覆盖，多冲突逐次解决时互相抹掉；③指标绑定 endsBy 边界错绑。
- **第 2 轮（review_cycles 2）**：3 项缺陷修复并提交（8976077），含多冲突合并回归测试；69 项测试 + verify + UI 冒烟全绿。
- **第 2 轮复审（终审）**：四项修复逐一验证正确，无新问题——**verdict: CLEAN**。

最终状态：阻断项清零；非阻断项（标准轴坏味道 + S7）留档 M2。


---

# M2 轮审查记录（b51edbc..HEAD）

## Standards（M2）
- 切片 2 清理目标全部落地核验通过（死代码零回归、布局收口、工厂/助手/类型化）；新发现：html.ts 页脚共享不完整（残留内联副本）、中文件 import（pptx/theme）、parseBody 不可达分支、EditOp 双定义、store 读取裸 JSON.parse、UI 过期文案 —— 全部在本轮 CONVERGE 修复（e5d2e8d）。

## Spec（M2）
阻断级 4 项：B1 golden 未进 git（.gitignore 父目录排除致反选失效）；B2 隐私 not_checked 项 UI 不可见（只剩计数）；B3 草稿导出绕过外发/隐私阻断；B4 XLSX 选表用 prompt 而非确认通道。全部修复（e5d2e8d）。无范围蔓延；红队三约束均核验（golden 文本化、隐私逐项+明示未覆盖、不宣称 M2 阶段门）。

## 修复循环与终审
- CONVERGE 修复批次 e5d2e8d → 复审逐项验证：B1–B4 + 标准轴 5 项全部成立，policy/content 分类无夹带；终审 **CLEAN**。
- 终审附注：冲突解决文件损坏时静默丢失 → 已修为缺失返回空、损坏显式报错（e5d2e8d 后续提交）。

最终状态：M2 工程基座阻断清零；M2 阶段门（真实重复使用）按红队约束③不宣称通过，留给用户真实使用判定（模板见 docs/m2-usage-log.md）。

---

# M3 轮审查记录（73f6f08..HEAD）

## Standards（M3，73f6f08..HEAD）

**阻断级（ship-blocking）：**
1. **品牌参数未穿到底**：`docx.ts` 的 `cell(text, opts, p = palette)` 的调用方不传 p → 表头单元格用默认 primaryInk（品牌主色漏掉）；`renderReportDocx` 封面副标题用 `palette.muted`（brand.muted 被忽略）；`pptx.ts` 的 `addCover` 副标题与 `addFooter` 同样没拿到 p → 品牌 muted 槽位在 deck 输出静默丢失。
2. **重复主张**：`summary.ts` 的"选择"与"建议"两段都渲染 recommendations[0]（同一文本出现两次）；`gateway.ts` researchOutline 的 7/8 页（option_comparison/action_items）在仅一条建议材料时同样重复绑定。

**非阻断（记录清理项）：**
- `theme.ts:90` 中文件 import（BrandConfig 在 pageTypeLabels 之后）；`docx.ts` 死 import matchSection；状态后缀文案在 document-html.ts/docx.ts 重复（应收 theme.ts）；document-pdf.ts 克隆 pdf.ts 浏览器生命周期（35 行可容忍）；chartToTableHtml 死三元（'项目':'项目'）；html.ts CSS replaceAll 重着色脆弱（同 hex 不同角色会误伤）；`el as unknown as {...}` 双 cast（ingest/docx.ts）。
- `document-pdf.ts` 模块级 browser 变量与既有 pdf.ts 同构——沿用已认可的既有模式。

## Spec（M3）

阻断级 6 项：
1. **document golden 从未被调用**（compareDocumentGolden 存在但 regression.mjs 未接线——gates 的 M3 门禁出现真实漏洞；与早前 regression.ts 同一文件回退事故所致）。
2. **font_name 是死字段**（schema 冻结但零消费；UI 也无输入）。
3. **跨交付物一致性形同虚设**：summary.metrics 与主报告同一对象引用（编辑分叉永不触发）；且 M3-G6 要求的 display 比对缺失。
4. **研究大纲顺序偏离 §4.1/G2**：证据附录应在限制前、发现应"每发现一节"、单条建议不应有"可选方案"页。
5. **UI 摘要导出只发 PPTX**（§1.2 要三格式）。
6. **DOCX 人工验证记录缺失**（切片 1 验收项）。

边界核验通过：无范围蔓延（品牌 token 级、无布局编辑、无 M4 渗透）；推断不升级；DOCX 图表=数值表格；schema 全 optional 向后兼容；deck golden 零漂移（门禁"不降低质量"在当前实现成立）。

## 汇总（CONVERGE）

**阻断（全部修复于本批次）：**
- 标准轴 3 项：品牌参数穿到底（docx cell 调用传 p、pptx addCover/addFooter 用 p.muted）；summary.ts"选择/建议"去重（单条建议→待补充不重复）；researchOutline 7/8 页重复（单建议时不出方案比较页）
- 规格轴 6 项：regression.mjs 接回 document golden（脚本输出验证）；font_name 经 resolveFonts 参数化贯穿四渲染器 + UI 输入框；summary metrics 改深拷贝 + cross-deliverable 增 display 比对；研究大纲按 §4.1 精确顺序重排（发现每事实一节）；UI 摘要三格式；docs/m3-docx-verification.md 落成

**非阻断（记录不动）：** document-pdf/pdf 浏览器生命周期重复（35 行容忍）；html.ts CSS replaceAll 重着色脆弱（当前无同 hex 冲突，风险低）；`el as unknown` 双 cast（ingest/docx.ts，已隔离）；document-pdf 模块级 browser（沿用既有 pdf.ts 已认可模式）。

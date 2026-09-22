# Report Studio M3 任务清单（dev-flow 第三轮）

来源：`.flow/prd.md`（M3 + GRILL 决议）。双管线设计（M3-G1）：deck 管线不动，document 管线新增。

## 顶部检查清单

- [x] 1. M3 tracer：document 管线——DOCX 渲染器 + 研究报告模板 + 三产物
- [x] 2. 一页决策摘要：派生 + 跨交付物一致性 + 导出
- [x] 3. DOCX 导入：mammoth → 主张/表格通道
- [ ] 4. 品牌配置：BrandConfig + UI + 三适配器消费 + 冻结
- [ ] 5. M3 收口：全交付物 E2E + regression 扩展 + 冒烟扩展 + 文档

---

## 1. M3 tracer：document 管线（DOCX + 研究报告 + 独立 HTML/PDF）

### What to build

`deliverable_type: 'research_report'` 进 ReportBrief（optional）。gateway 新增 research 7 节模板（M3-G2）。`src/render/document-html.ts`：A4 文档流 HTML（自包含、节导航、元信息头）。`src/render/docx.ts`：docx 9.x 渲染（A4、Heading1/2、原生段落/表格、节尾来源行）。export 编排按 deliverable_type 分管线：research_report → docx + html(独立) + pdf(A4)；ExportFormatSchema 增 'docx'。契约测试：docx 解包断言原生 `w:p`/`w:tbl` + 关键数字 + 来源行；独立 HTML 无外链 + 导航 + 关键内容。

### Acceptance criteria

- [ ] 手工研究报告 spec → DOCX/HTML/PDF 三产物落盘且契约断言通过
- [ ] DOCX 在本机 Pages/WPS 打开：标题/正文/表格可编辑、中文不溢出（人工验证记录）
- [ ] 研究报告大纲从 fixtures 资产生成（7 节、证据绑定）
- [ ] 回归 golden 零漂移（deck 管线不动）
- [ ] 质量检查与隐私导出链对研究报告同样生效

### Blocked by

None - can start immediately

---

## 2. 一页决策摘要：派生 + 跨交付物一致性 + 导出

### What to build

`compose/summary.ts`：deriveExecutiveSummary(assets) → 单页 spec（问题/选择/建议/风险/需谁决定五段，全部 claim/metric 绑定，缺失段标待补充）。`checks/cross-deliverable.ts`：checkCrossDeliverable(a, b) 共享 metric_id 不一致 → blocker。UI/导出：一页摘要作为项目内可导出产物（executive_summary 类型），PPTX 单页 + PDF + HTML。

### Acceptance criteria

- [ ] fixtures 资产 → 五段结构单页 spec，全部绑定（无编造）
- [ ] 主报告指标改动 → 摘要派生同步或一致性校验阻断（红队约束③）
- [ ] 单页三产物契约测试通过
- [ ] 回归零漂移

### Blocked by

- 1

---

## 3. DOCX 导入：mammoth → 主张/表格通道

### What to build

`ingest/docx.ts`：mammoth → HTML → node-html-parser 解析（h1-h6 章节标记、p 段落、ul/li 要点、table → TableAsset 走 table-core）。SourceKindSchema 增 'docx'；宏不执行。UI 上传支持 .docx。fixture 用 docx 库生成（含表格与结论/推断标记章节）。

### Acceptance criteria

- [ ] fixture docx → 主张（章节标记映射 kind）+ 表格（口径/待确认/冲突复用）
- [ ] 无执行路径（mammoth 纯解析器，代码注释明示）
- [ ] 既有测试全绿

### Blocked by

- 1（不与 document 渲染冲突）

---

## 4. 品牌配置：BrandConfig + UI + 消费 + 冻结

### What to build

`BrandConfig { primary, accent, muted?, logoDataUrl?, fontName? }`：project.json 增 brand；assemble 注入 spec.theme.brand；deck/document 两管线渲染器 token 覆盖（Logo 上封面/文档头）；UI 项目设置卡（色板 + Logo 上传 + 字体名）。冻结快照含品牌（已随 spec 走）。换品牌不触发内容重生成（只重渲染）。

### Acceptance criteria

- [ ] 品牌色/Logo 在 PPTX/DOCX/HTML/PDF 四产物可见（契约断言）
- [ ] 换品牌 → spec 内容字段零变化（仅渲染差异）
- [ ] 回归零漂移（默认无品牌时产物与现在完全一致）

### Blocked by

- 1, 2

---

## 5. M3 收口：全交付物 E2E + regression 扩展 + 冒烟 + 文档

### What to build

E2E：同 fixtures 资产 → 会议汇报 + 研究报告 + 一页摘要三交付物，跨交付物一致性全绿，各自导出物断言。regression：研究报告样例进 golden 基线（新增 golden/research-report/）。冒烟：UI 新建研究报告项目走通。README/docs 更新（M3 能力 + DOCX 边界明示：图表为数值表格、Windows Word 验收延后）。

### Acceptance criteria

- [ ] 三交付物全链 E2E 绿
- [ ] regression 含 deck + document 两套 golden，全绿
- [ ] UI 冒烟扩展后全绿
- [ ] 文档更新且边界明示

### Blocked by

- 2, 3, 4

# Red-Team: Report Studio M3 范围（交付物扩展）

评审对象：`.flow/proposal.md`（M3 固化稿，上游 v1.0 §14 M3 + §4.1）。评审时间：2026-09-22。

## Top Kill-Assumptions（按 影响×被证伪概率×测试成本 排序）

### 1. DOCX 渲染适配器能产出"专业可编辑"的研究报告——与 M0 的 PPTX 假设同构但未验证

- **Claim：** docx 库能从同一 ReportSpec 产出标题/正文/表格原生可编辑、中文排版达标、来源脚注保留的 DOCX（§4.3 可编辑性边界同等适用于 DOCX）。
- **Steelman：** M0 已证明"引擎初选 + 样例验证"路径对 PPTX 成立；docx 库对段落/表格/页眉页脚控制成熟，比 pptxgenjs 的图表 XML 更简单（研究报告无原生图表需求——图表可内嵌 PNG 或表格化）。
- **Fails if：** docx 产物的中文/表格/页脚在 Word/WPS 中排版不可接受（字体回退、表格溢出、脚注丢失），则"长报告"主交付降级为 HTML+PDF——价值假设削弱但不死（PDF 长报告仍成立）。
- **Evidence to get this week：** M0 式样例验证：手工 ReportSpec → docx 渲染 → 本机 Word/Pages/WPS 打开逐项核对（可编辑/排版/脚注）。
- **Kill criterion：** 若 docx 与自研 HTML→PDF 双路都不可用，长报告只保 PDF/HTML 两种产物（DOCX 移出 M3）。
- **Cheapest test：** tracer 切片先行（与 M0 相同的顺序纪律）。

### 2. "不降低现有质量"可以由现有回归锁守住

- **Claim：** M3 门禁 = 回归 golden + 97 测试 + 冒烟全绿且零漂移。
- **Steelman：** M2 重构已实证该锁能抓零漂移；新增 deliverable_type 若走旁路（独立渲染路径），会议汇报路径代码不动，风险隔离。
- **Fails if：** 为支持长报告改动共享层（schema/检查/导出编排）引入回归——锁会抓到，但修复成本取决于侵入深度。防御：schema 新增字段全部 optional + 向后兼容（M2-G6 模式已验证）。
- **Kill criterion：** 若回归 golden 出现非零漂移且无法归因于有意变更 → 停下先修。
- **Cheapest test：** 每切片跑 `npm run regression`（已内建）。

### 3. 一页摘要与长报告"不互相矛盾"可以机器校验

- **Claim：** §4.1 要求不同文件不得出现矛盾数字；摘要/长报告源自同一资产，一致性校验器可扩展覆盖。
- **Steelman：** M0 的 checkConsistency 已做"同 spec 三产物文本定位"；摘要与长报告是"同资产两 spec"，可比对共享 metric 的显示值。
- **Fails if：** 摘要页手工措辞带出的数字与指标库脱钩（如手写"约 7%"vs 库里 -7.1%）——需要把摘要页也绑定 metric_refs 才可校验。
- **Kill criterion：** 若摘要页无法全部走 metric 绑定（必须自由文本），则该页数字检查降级为警告并明示。
- **Cheapest test：** 构造摘要+长报告对，断言共享指标显示值一致。

### 4. 品牌模板不越界到"任意模板"（范围纪律）

- **Claim：** 只做 token 级品牌配置（色/Logo/字体名），不做模板导入。
- **Fails if：** 实现中滑坡成模板编辑器（v1.0 §3.2 明确排除）。防御：品牌配置 = 一个 BrandConfig 对象进 theme，渲染器只消费 token——无布局编辑能力。
- **Cheapest test：** 范围审查（规格轴会盯）。

## What's Well-Reasoned

- 切片顺序沿用 M0 验证过的"tracer 先行"：DOCX 长报告切片会先出样例产物再铺功能。
- "更多输入"选 DOCX（mammoth）而非 PDF——PDF 文本提取在 M0 一致性校验中已见伪影，作为输入不可靠；mammoth→结构化内容→既有主张通道是干净路径。
- M3 门禁明确翻译为可执行判据（回归零漂移 + 新格式过同一检查引擎），不是空话。

## What I Couldn't Assess

- 本机无 Word 许可证情况下的 DOCX 验收环境（Pages 可开 docx，WPS for Mac 存在性待确认）——与 C1 的 Windows 验证一样，真机验收范围需在 PRD 标注。
- 用户对"研究报告"的具体排版预期（学术式 vs 咨询式）——样例先行，用户看样例再定。

## 结论

**Verdict: GO。** 无 kill criterion 已满足。硬性设计约束：①DOCX tracer 先行验证（M0 纪律）；②共享层改动全部 optional 字段向后兼容；③摘要/长报告一致性必须机器校验（metric 绑定）；④品牌配置只进 theme token，无布局编辑。

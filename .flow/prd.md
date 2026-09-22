# Report Studio M3 PRD｜交付物扩展

- **上游规范：** `.flow/proposal.md`（M3 固化稿）→ `.flow/proposal-v1.0.md`
- **红队：** `.flow/red-team.md`（GO；四条硬约束已吸收）
- **M3 门禁判据（可执行化）：** 回归 golden + 全部测试 + UI 冒烟全绿且零漂移；新格式全部过同一检查引擎与隐私导出链。

## Problem Statement

用户现在只能产出"会议汇报"一种交付物。但同一批分析材料经常还需要：给阅读者的**详细研究报告**（传阅/复核用）、给决策者的**一页摘要**（会前 30 秒判断用）。材料也常以 Word 文档存在（现在进不来），产出物需要带企业品牌标识。M3 把这三类交付物与两类扩展能力补齐，同时不降低已交付的会议汇报质量。

## Solution

同一资产层（claims/metrics/tables/evidence）+ 多交付物渲染：

1. **长报告（research_report）**：文档式主线（问题→口径→方法→发现→证据→限制→建议），DOCX（原生可编辑）+ 独立分发 HTML + PDF 三产物。
2. **一页决策摘要（executive_summary）**：单页"问题→选择→建议→风险→需要谁决定"，PPTX 单页 + PDF + HTML；与长报告/汇报共享指标，机器校验不矛盾。
3. **DOCX 导入**：mammoth → 结构化内容 → 既有主张/证据通道。
4. **品牌配置**：BrandConfig（色板/Logo/字体名）进 theme token，三种产物统一消费；不做布局编辑。

## User Stories

### 长报告（F13 新增）

1. As a 业务分析师, I want 选择"研究报告"交付物类型并生成文档式大纲（问题→口径→方法→发现→证据→限制→建议）, so that 阅读者可以传阅复核而不是听会。
2. As a 业务分析师, I want 导出 DOCX 且标题/正文/表格原生可编辑、来源脚注保留, so that 同事能在 Word 里继续批注修改。
3. As a 业务分析师, I want 导出可单文件分发的 HTML（无外部依赖）, so that 邮件发送即读。
4. As a 业务分析师, I want 研究报告同样过质量检查与隐私导出门禁, so that 可信边界不因格式扩展而降低。

### 一页决策摘要（F14 新增）

5. As a 汇报人, I want 从同一资产生成一页决策摘要（问题/选择/建议/风险/需谁决定五段）, so that 负责人会前 30 秒能抓住要点。
6. As a 汇报人, I want 摘要与长报告/汇报共享同一指标对象, so that 不同文件不会出现互相矛盾的数字（机器校验）。

### DOCX 导入（F15 新增）

7. As a 业务分析师, I want 导入 Word 文档（.docx）并解析出标题/段落/表格, so that 已有 Word 分析材料不用重写。
8. As a 用户, I want docx 中的宏/脚本不被执行, so that 导入安全（§12.2）。

### 品牌配置（F16 新增）

9. As a 汇报人, I want 配置品牌色板/Logo/字体名并应用到全部产物, so that 交付物带企业标识。
10. As a 汇报人, I want 品牌配置只影响视觉 token 不改内容, so that 换品牌不触发内容重生成（§5.3）。

## Implementation Decisions

### 交付物类型与长报告

- `ReportBrief.deliverable_type: 'meeting_deck' | 'research_report' | 'executive_summary'`（optional，缺省 meeting_deck，向后兼容）。
- **研究报告大纲**：确定性编排新增 research 模板——封面 / 问题与背景 / 口径与方法 / 主要发现（每发现一节） / 证据附录 / 限制与不确定性 / 建议；每节绑定 claims/tables（复用既有 assemble 通道）。
- **DOCX 渲染**：`docx` 库（npm docx 9.x）；新适配器 `src/render/docx.ts` 与 pptx/pdf 同层；标题/段落/表格原生对象；来源脚注用文档 Footer（每节来源行）；页眉带报告标题。图表在 DOCX 中以表格呈现数值（不做图片图表——数据可读性优先，且避免伪造可编辑图表的边界问题）。
- **独立 HTML**：`renderReportHtml` 已自包含（无外链）→ 增加 `standalone: true` 选项：内嵌页面导航 + 报告元信息头，作为导出产物落盘（`export` formats 增 `'docx' | 'html-standalone'`）。
- **ExportFormat** 扩展：`'docx'`（'html' 语义变为独立分发版）。

### 一页摘要

- 确定性派生：从资产直接生成单页 spec（五段 bullets 全部 claim/metric 绑定；缺失段留"待补充"不编造）。
- 与主报告一致性：`checkCrossDeliverable(mainSpec, summarySpec)` ——共享 metric_id 的显示值必须一致（红队约束③）。

### DOCX 导入

- `mammoth` → HTML → 既有 markdown 通道解析（标题映射章节标记）；表格 → TableAsset（复用 table-core）；宏不执行（mammoth 纯解析器）。
- `SourceKindSchema` 增 `'docx'`；列口径/冲突检测全复用。

### 品牌配置

- `BrandConfig { primary, accent, muted?, logoDataUrl?, fontName? }` 进 ReportSpec.theme（optional）；渲染三适配器消费 token 覆盖默认值；Logo 在封面/页眉出现（HTML/PDF/DOCX/PPTX）。
- UI：项目设置卡（色板选择 + Logo 上传 + 字体名）；存 project.json + 进 spec 快照（冻结快照含品牌）。

## Testing Decisions

- **DOCX 契约**：解包 docx（OOXML zip）断言 `word/document.xml` 含原生 `<w:p>`/`<w:tbl>`、脚注文本、来源行；关键数字在文本中。
- **独立 HTML**：单文件（无外链）、含导航、关键内容一致。
- **一页摘要**：五段结构断言 + 共享指标一致性强测（改主报告指标 → 摘要派生同步或阻断）。
- **DOCX 导入**：fixture（用 docx 库生成）→ 主张/表格断言 + 宏安全（无执行路径）。
- **品牌**：token 覆盖断言（三产物颜色/Logo 出现）+ "换品牌不重生成内容"回归。
- **回归锁**：`npm run regression` 全绿零漂移贯穿每切片；会议汇报 golden 不动。
- **seam 复用**：E2E 主链 + 渲染契约；新增 seam：docx 契约、跨交付物一致性（公共接口级）。

## Out of Scope

- M4 集成、任意模板导入/布局编辑器、模板市场、多人协作、PDF 作为输入格式、真实使用采样（模板已交 M2）。
- DOCX 内嵌原生图表（数值以表格呈现——明示此边界）。
- Windows/Word 真机验收（沿用 C1 延后；本机 Pages/WPS 验证，范围明示）。

## M3 GRILL 决议（留白自答；差异门用户未作答、A1–A6 纯新增已自我批准；范围=全量 M3 砍尾序；DOCX 验收沿用 C1）

| # | 留白问题 | 决议 |
|---|---|---|
| M3-G1 | 研究报告的渲染形态 | **双管线**：deck 管线（16:9 slide HTML/PPTX/PDF，现状不动）+ document 管线（A4 文档流：DOCX + 独立 HTML + A4 PDF）；deliverable_type 选管线；一页摘要走 deck 管线单页 |
| M3-G2 | 研究报告大纲 | gateway 新增 research 模板：封面/问题与背景/口径与方法/主要发现(每发现一节)/证据附录/限制与不确定性/建议——全部映射现有 8 页型，不新增页型 |
| M3-G3 | DOCX 版式 | A4 纵向、边距 2.5cm、正文 12pt、标题 Heading1/2、表格带表头、每节末尾"来源："段落（docx 页脚机制不稳妥，来源行用节尾段落） |
| M3-G4 | 独立 HTML | 文档流 HTML + 顶部报告元信息 + 节导航锚点；单文件自包含；导出 formats 增 'docx' 与 'html'（独立分发语义） |
| M3-G5 | 一页摘要构建 | compose/summary.ts：deriveExecutiveSummary(assets) → 单页 spec（五段 bullets 全 claim/metric 绑定，缺失段标待补充）；不走大纲确认，预览中直接改 |
| M3-G6 | 跨交付物一致性 | checks/cross-deliverable.ts：共享 metric_id 的 value/display 不一致 → blocker |
| M3-G7 | 品牌存储 | project.json 增 brand 字段；UI 项目设置卡；assemble 注入 spec.theme.brand；三适配器 token 覆盖；进冻结快照 |
| M3-G8 | DOCX 导入解析 | mammoth → HTML → node-html-parser（轻量）解析标题/段落/表格 → 复用 markdown 主张通道与 table-core |
| M3-G9 | UI 入口 | 新建项目可选交付物类型（会议汇报/研究报告/一页摘要）；大纲确认流程复用 |

## 附录：PRD 相对 M3 proposal 的差异清单（送用户确认）

**新增（留白具体化）：**

| # | 差异 | 说明 |
|---|---|---|
| A1 | 库选型：DOCX 输出=`docx` 9.x、DOCX 导入=`mammoth` | proposal 未选库；M0 纪律 = tracer 先行样例验证，证伪则重选 |
| A2 | DOCX 中图表以数值表格呈现（不做图片图表） | 避免伪造"可编辑图表"边界；proposal 未规定 |
| A3 | `deliverable_type` 进 ReportBrief（optional 向后兼容）；ExportFormat 增 docx / html 独立分发语义 | 接口形态 |
| A4 | `checkCrossDeliverable` 跨交付物指标一致性校验 | 红队约束③落地 |
| A5 | BrandConfig 结构与冻结（进 project.json + spec 快照） | proposal 只说"品牌配置" |
| A6 | 研究报告大纲模板固定为 7 节文档主线（确定性编排） | §4.1 主线的操作化 |

**调整：** 无。**删除：** 无。

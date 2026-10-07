# Red-Team: M10 形态级重构——收敛为纯 PPT 报告生成器（pi-agent-core + skill 全程）

> 评估对象：.flow/proposal.md（2026-10-07 第二次重构提案）。方法：strategy-red-team（steelman 后攻击，按 影响×可能×可测性 排序）。

## Verdict: **go**

（无 kill criterion 已被满足；KA-2 已实证，KA-1/KA-3/KA-4 带约束进 PRD，证据项按大改造约定放动工审批门讨要。）

## Top Kill-Assumptions (ranked)

### KA-1 流程形态改造 ≠ 自动解决「成品感」（最高风险）
- **Claim:** 用户两次不满的根因可以通过形态级重构（新主流程 + 删除杂物）解决。
- **Steelman:** 用户本次直接给出完整六步流程定义，与行业标准体验（调研报告：Kimi/WPS/Gamma 主路径）精确对齐；五阶段壳层与报告工厂杂物确实是两次交付的可观测形态差异；用户还明确否决了渐进选项。
- **Fails if:** 第三次交付后用户仍说「不是我想要的」，而真实不满在**视觉质量/模板美学**——流程改造不触及 render/pptx.ts 的版式天花板（276 行形状组合）。
- **Evidence to get this week:** 视觉样张盲评——用 GordenSun 模板协议渲染 1–2 页真实材料样张给用户确认方向。
- **Kill criterion:** 用户对样张方向仍不满意 → 停止全线开发，先重做视觉系统。
- **Cheapest test:** 样张盲评，小时级；按大改造约定放**动工审批门讨要** + 排早期切片。

### KA-2 pi-agent-core + skill 能承载全流程 —— **已实证**
- **Claim:** D3 技术形态可行。
- **Steelman + 证据（2026-10-07 实测）：** `@earendil-works/pi-agent-core@0.86.1` 存在且依赖 pi-ai ^0.86.1（与现有钉版对齐）；导出面确认 **skills 机制完整**：`loadSkills`/`loadSourcedSkills`（SKILL.md 目录风格，与 GordenPPTSkill 协议同构）+ `formatSkillsForSystemPrompt`/`formatSkillInvocation` + `UnknownSkill` 错误类型；另含 Agent/AgentHarness/agentLoop/内置工具工厂（bash/read/edit/write）/compaction/session（Jsonl/Memory repo）/telemetry/convertToLlm/calculateContextTokens——标准 §6 列举的能力全部在导出面上。
- **Fails if:** 接入时发现 AgentHarness 装配形态与现有 pi-transport/workbench 架构冲突到不可缝合（概率低——适配层模式已有）。
- **Kill criterion:** N/A（已证实）。
- **Cheapest test:** 已做（临时安装 + 导出面/类型定义检查）。

### KA-3 「格式不限」上传（pdf/图片）的解析与理解可行性
- **Claim:** md/word/pdf/图片都能被「读取并理解」。
- **Steelman:** md/docx/xlsx/csv 解析器已在依赖（mammoth/exceljs/csv-parse）；M7/M8 已有多模态边界注入与围栏经验。
- **Fails if:** 主链模型（MiniMax-M3 / mimo-v2.6-flash）不支持图片输入，或 pdf 解析无库可用——「格式不限」对恰好用图片/pdf 资料的用户缩水。
- **Evidence to get this week:** 查 MiniMax-M3/mimo vision 支持文档 + pdf 解析库选型（pdf-parse/pdfjs-dist）；必要时一次真实多模态调用验证。
- **Kill criterion:** vision 不可用 → 图片理解降级 OCR 或明示不支持；缩水项上**动工审批门要用户裁决**。
- **Cheapest test:** 文档查证 + 真调验证，小时级。

### KA-4 删除不伤及 PPT 主路径依赖
- **Claim:** 「其余非相关的全部删除」可安全执行。
- **Steelman:** git 历史全存档可回溯；删除是用户明确指令。
- **Fails if:** 删除清单未做依赖盘点，把 PPT 管线仍依赖的模块删了（例：schema/report-spec 是 render/pptx.ts 的输入、checks/privacy 是审批围栏、ingest 是上传解析底座），管线断裂返工。
- **Evidence to get this week:** rg import 依赖图盘点（PRD/GRILL 内完成，作为删除清单的证据基础）。
- **Kill criterion:** N/A——执行纪律要求，非信念风险。
- **Cheapest test:** 依赖图盘点，半小时。

### KA-5 第三次押注的总风险（meta）
- 已被 KA-1 的 cheapest test 覆盖：样张盲评前置到动工审批门讨要，是整个计划最便宜的止损点；避免 M6→M9「原则层对、成品感层连错两次」再演。

## What's Well-Reasoned

- 六步主流程与行业标准路径精确对齐（外部调研背书），且保留了全行业真空的审批差异化。
- 技术栈指令与 AGENT-RUNTIME 标准**同向**：pi-agent-core 本就是标准批准栈（§3.1），撤销 D-1 偏差是向合规收敛，不是新偏离。
- 删除决策有 git 历史兜底，实际可逆。
- 大改造动工审批门约定继续有效，前置证据在门上讨要，止损机制存在。

## What I Couldn't Assess

- 用户对「成品感」的具体审美参照（Kimi vs Gamma vs WPS 视觉风格未指明）——样张盲评时补。
- pi-agent-core AgentHarness 装配形态与现有 workbench 的融合深度——GRILL 时代码探索解决。

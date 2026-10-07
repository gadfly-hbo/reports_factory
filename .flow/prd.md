# PRD：M10 纯 PPT 报告生成器（第二次重构）

> spec 链：.flow/proposal.md（根源）→ 本 PRD（细化）→ tasks.md（切片）。红队报告：.flow/red-team.md（verdict go）。
> 发布形态：本文件即 PRD（无 issue tracker，fallback 落档）。模式：dev-flow gated（additive 自批准约定）。

## Problem Statement

用户要的是「材料进 → 成品 PPT 出」的报告生成器，但现有产品是多功能报告工厂：五阶段编排壳层、报告（docx/md）多交付物、体检/证据链/编修建议等大量非 PPT 面向用户的流程堆在主路径上。两次交付（M6 模版一键生成、M9 快速 PPT）用户均判定「不是我想要的」——不是机械链路问题（全部实测通过），是产品形态错位：流程重心不在 PPT 产物本身，agent 能力没有以 pi-agent-core + skill 的标准形态组织。

## Solution

把产品收敛为**纯 PPT 报告生成器**，只保留一条主流程：

**上传资料（md/word/pdf/图片，格式不限）→ 读取并理解 → 与用户确认 PPT 框架 → agent 按框架自组织材料生成整套 PPT → 逐页可编辑（手工改文字 或 自然语言给 agent 改）→ 审核发布（导出 PPTX/HTML/PDF）。**

其余非相关功能全部删除。技术形态全程用 pi-agent-core（agent 循环/会话/遥测/技能装载）+ skill（SKILL.md 形态承载 PPT 生成守则与模板协议）实现。

## User Stories

1. 作为用户，我要上传 md/word/pdf/图片等任意格式的资料，以便不必先手工整理成特定格式。
2. 作为用户，我要系统读取并理解我上传的全部资料（含中文文档与表格），以便生成基于我的真实材料而非模板空话。
3. 作为用户，我要在生成前看到并**确认 PPT 框架**（页序列、每页主题），以便产出结构由我拍板，agent 不自作主张。
4. 作为用户，我要能直接修改框架（增删页、改页题、调顺序）后再确认，以便框架环节本身就是编辑入口而非仅「同意/不同意」。
5. 作为用户，我要确认框架后一键生成整套 PPT，agent 按框架自动从我的材料里组织内容，以便我不逐页喂料。
6. 作为用户，我要生成的每页都有真实材料支撑（无「待补充」骨架页），以便拿到即用。
7. 作为用户，我要能手工直接改任意页的文字内容，以便小修不用等模型。
8. 作为用户，我要能用一句自然语言（如「这页数据强调环比而不是绝对值」）让 agent 重写该页，以便修改描述型需求不必手工逐字改。
9. 作为用户，我要在发布前走一道**审核**（内容检查 + 我确认），以便对外交付前有可信关卡——这是我们区别于全行业产品的差异化。
10. 作为用户，我要导出 **PPTX**（原生可编辑），以便交付后他人能在 PowerPoint/WPS 里继续编辑。
11. 作为用户，我要导出 **HTML**（翻页幻灯片），以便浏览器直接放映/分享。
12. 作为用户，我要导出 **PDF**，以便定稿归档与打印。
13. 作为用户，我要看到每个 agent 环节的进行状态（理解中/框架生成中/生成中第 N 页），以便过程可预期、卡住可察觉。
14. 作为用户，我要多项目并存与切换，以便多份报告并行推进。
15. 作为用户，我要密钥配置入口与状态提示，以便换机/换钥自助恢复。
16. 作为用户，我要预算/审计围栏在后台静默生效（调用封顶、审计留痕），以便安全约束不需要我操心但一直都在。
17. 作为用户，我要审批通过后才能拿到对外导出物，以便「内用草稿」与「外发成品」有制度边界。
18. 作为用户，我要生成失败时明确告知哪页失败、可重试该页而非全部重来，以便长任务不因单点失败报废。
19. 作为用户，我要界面干净——只有 PPT 生成相关的东西，以便不被报告工厂时代的功能干扰。

## Implementation Decisions

### 1. 产品收敛：删除/保留/新增清单（KA-4 依赖盘点为据）

**删除（面向用户的功能 + 其专属代码）：**
- 报告多交付物路径：docx/md 报告渲染（render/docx.ts、render/document-html.ts、render/document-pdf.ts）、报告样张回归（samples/regression.ts、samples/research-report.ts、samples/retail-review.ts、cli/samples.ts）
- 报告编修链：compose/proposal.ts、compose/edit.ts、compose/impact.ts、compose/summary.ts、compose/diff.ts、compose/assemble.ts、model/ai-proposal.ts、model/ai-review.ts、model/ai-recommend.ts、model/editorial-recommend.ts、model/ai-outline.ts、model/ai-page.ts、model/ai-draft.ts
- 报告体检链：checks/compute.ts、checks/cross-deliverable.ts、checks/editorial.ts、checks/engine.ts（checks/privacy.ts 的隐私判定逻辑并入新出站围栏后删除原文件）
- 体检/证据路由与视图：findings/decisions/evidence-requests/recommend/checks 路由；CheckView、EditorialView、ComposeView、ExportView、GenerateView、MaterialsView、PptGeneratorView（M9 视图，被新六步视图取代）
- 五阶段壳层残留：StageBar 阶段语义、inspector-types 报告字段
- schema 中报告专属部分：editorial.ts、assets.ts 中报告专用类型（brand.ts 保留——PPT 主题用）

**保留（PPT 主路径依赖 + 围栏 + 平台）：**
- ingest/*（上传解析底座：markdown/docx/xlsx/csv/bundle/persist/conflicts——新增 pdf/图片解析）
- render/pptx.ts、render/theme.ts、render/text-fit.ts、render/charts.ts（PPT 渲染核心，M9 已验证 0 emoji/原生可编辑）
- schema/report-spec.ts（ReportSpec 是 pptx 渲染器输入契约，沿用或演进为 PPT 页 schema——GRILL 裁决）、schema/brand.ts、schema/template.ts（模版注册表形态保留，内容按 PPT 框架改造）
- model/pi-transport.ts（适配层：供应商链/resolveModelFor reverse config/<think> 剥离/超时）、model/budget.ts（预算三线）、model/privacy-gate.ts、model/outbound.ts（出站门+批准持久化）、model/recording.ts（录制回放）、model/gateway.ts、model/client.ts
- server/app.ts（路由壳重写路由表）、server/workbench.ts（用例层重写为六步）、storage/workspace.ts（项目存储）、sync/dataSync.ts、cli/sync.ts（双机同步）
- web 壳层（AppShell/Sidebar/TopBar/StatusBar/Palette/Inspector 壳）+ ProjectsView（项目列表）+ SettingsView（密钥）

**新增：**
- pi-agent-core 集成适配（`@earendil-works/pi-agent-core@0.86.1` 钉版；AgentHarness/agentLoop/skills 装载/telemetry 接入现有审计与预算）
- PPT skill（SKILL.md 形态：生成守则单源迁移自 ai-ppt-prompt.ts + GordenPPTSkill 模板协议借鉴，经 loadSkills 装载注入）
- 六步主流程的路由与视图（上传/框架确认/生成/逐页编辑/审核发布）
- pdf 解析与图片理解接入（方案依据后台调研结论，GRILL 定稿）

### 2. 主流程六步的 agent 形态（依据标准 §5 决策矩阵）

- 流程可预先画出（六步固定）→ **工人模式**为骨架：模型是阶段工人（有界单发变换 + schema 校验），skills 经 system prompt 注入承载 PPT 守则与模板协议，pi-agent-core 承载调用编排/会话/遥测/审计钩子。
- 「读取理解」：确定性解析（md/docx/xlsx/csv/pdf 文本提取）+ 逐文件 LLM 单发理解摘要（结构化 schema：要点/数据/引用），图片走 vision（可行性见 GRILL G-x）。
- 「框架生成」：材料摘要合集 + 用户 brief → 单发生成框架 schema。
- 「组织生成」：逐页工人（框架页 + 相关材料上下文 → 页内容 schema，数字护栏/来源引用沿用 M7 范式），逐页 checkpoint 断点续跑。
- 「自然语言改页」：单发变换（指令 + 当前页 + 材料上下文 → 编辑后页 schema），出站白名单 fail-closed 沿用。
- **禁多轮 tool-call 循环**（延续 M9 KA-5 决议）；若 GRILL 推翻须过标准 §8 闸门。
- 人决策点：框架确认（第 3 步）、审核发布（第 6 步）——harness 围栏，模型不可绕过。

### 3. 审批围栏演进

- 出站门/批准持久化/预算三线/审计留痕全部保留，挂接点从「报告导出」迁移到「PPT 发布」（内用/外发两级的语义保留）。
- 隐私判定（原 checks/privacy.ts）并入出站围栏：发布前对整套 PPT 内容跑隐私检查，命中即 fail-closed。

### 4. 导出三格式

- **PPTX**：复用 render/pptx.ts（ReportSpec → pptxgenjs，原生可编辑）。
- **HTML**：新渲染器 pages → 单文件 HTML 幻灯片（16:9、键盘/按钮翻页），不引前端框架依赖，纯静态。
- **PDF**：HTML 渲染结果经 Playwright（已在依赖）打印为逐页 PDF。
- HTML/PDF 是否过出站审批：过（与 PPTX 同一发布门）。

### 5. 接口形态

- REST 路由重写为六步语义（upload/understand/framework/confirm/generate/page-edit/publish/export），旧报告路由全删。
- 项目 schema：新 PPT 项目类型（brief、sources、framework、pages、publish_state），与旧 ReportSpec 的关系在 GRILL 裁决（演进 vs 新建）。
- web 视图按六步重做，壳层复用；全局 DESIGN.md（JuanerAI v4.2 契约版）为视觉基线。

### 6. 测试缝（seams，最高缝优先）

- **S-A 用例缝**：workbench 六步方法（对上承接路由、对下编排 agent+渲染+围栏）——主测试缝，沿用现有 workbench 测试范式。
- **S-B 适配缝**：pi-agent-core 集成模块（skills 装载/遥测→审计桥/预算钩子），录制回放夹具（model/recording.ts 已有范式）。
- **S-C 渲染缝**：render/pptx.ts 输入（ReportSpec/页 schema）→ 产物结构断言（M9 样张断言范式：slide 数/文本框数/0 emoji/zip 可解）。
- **S-D 出站缝**：发布门（批准/隐私/白名单）负例测试（沿用 outbound.test.ts 范式）。
- 缝确认随动工审批门一并呈现。

### 7. 真实联调准入（标准 §7.5）

- 适配层改造完成后：MiniMax-M3 + mimo-v2.6-flash 真实端点单轮 + 多轮（含 skill 注入下的 schema 遵从）联调实测全绿，方可判「接入成功」；probe 脚本留仓。

## Testing Decisions

- 只测外部行为：路由请求/响应、workbench 方法产物、渲染产物结构、围栏门行为——不测内部私有函数。
- 逐切片 TDD（红→绿），全量门 `npm run verify`（typecheck + vitest + tsc build + vite build，构建后显式 npx tsc 产 dist）。
- 夹具回放：LLM 调用走录制回放（recording.ts），键含模型/提示词版本；真调仅 §7.5 准入与 probe。
- 围栏负例必测：未批准发布拒绝、隐私命中拒绝、出站白名单外字段拒绝、预算越界拒绝。
- UI 交付过视觉门（visual-judge 子代理；不可用时降级自查并披露）。
- 先行艺术：tests/ 下 api/main-path/outbound/budget/runtime-pits 范式沿用。

## Out of Scope

- 任意模板导入设计器（M3 红线延续）。
- 对话式（Kimi 式）自由聊天生成——本期为六步显式流程；对话形态留待用户样张反馈后另立项。
- 在线协作/多人/分享链接。
- 移动端适配。
- 旧报告项目的 UI 继续可用（数据文件保留不删，但不再提供报告功能入口；见 GRILL 数据兼容决议）。
- 多模态图片**编辑**（只做图片资料的理解输入）。

## Further Notes

- 红队 KA-1：样张盲评（1–2 页真实材料视觉样张）作为最便宜止损点，随动工审批门讨要。
- 红队 KA-3：pdf 解析与图片理解可行性调研进行中，GRILL 定稿；若 vision 不可用，图片资料降级方案（OCR 或明示不支持）上审批门要用户裁决。
- AGENT-RUNTIME 标准 v1.3 全程强制：§4 架构强制、§10 坑表逐条、§11 清单为验收门；D-1 偏差撤销（pi-agent-core 引入）在合规文档记账更新。
- 双机同步拓扑延续：data/ 入库、web-dist 不入库（Mac 端需 npm run build:web）。

## PRD diff 门（gated，additive 自批准留痕）

对照 proposal.md 逐项：D1 删除范围清单（提案明文授权 PRD 盘点）= additive；D2 六步各步 agent 形态与框架可编辑细节 = additive；D3 钉版/skills 装载 = additive；新增「工人模式骨架 + 禁多轮 tool-call 循环」（grounded 标准 §5，非提案决策改动）= additive，**动工审批门 prominent 披露**；导出过同一发布门/旧数据保留不删/编辑层删页 = 提案留白开放题的补全 = additive。无提案决策被改动或删除 → 自批准。

## GRILL 自拷问决议（2026-10-07，用户预授权「开放缺口按推荐」）

- **G1 渲染 schema：演进 ReportSpec，不新建。** render/pptx.ts 输入契约不动（M9 已验证 0 emoji/原生可编辑）；「框架」为新 schema 层（页序列+意图），生成层产出 ReportSpec pages。依据：schema/report-spec.ts 本就是页/版式/图表模型，换契约=重写渲染器且无用户价值。
- **G2 agent 形态：工人模式骨架 + 禁多轮 tool-call 循环。** 标准 §5：流程可预先画出→工人模式（有界单发+schema 校验）；循环内不给工具。pi-agent-core 承载=AgentHarness 编排+skills 注入+遥测接审计/预算，满足「全程用 pi-agent-core 及 skill」。**披露点→动工审批门。**
- **G3 装配选型：优先 AgentHarness，降级阶梯 A→C。** 实证：AgentHarness operation 原生支持 `kind:"skill"` 与 `images` 入参，自带 session/usage 记录——工人单发映射为 operation，项目=一个 session。若 IMPLEMENT 实测装配与工人单发冲突，降级 loadSkills+formatSkillsForSystemPrompt+pi-ai 直调（仍经 pi-agent-core skills 机制）。披露于审批门。
- **G4 图片理解 / G5 pdf 解析：调研结论回填**（后台调研进行中，结论到达后在此定稿；缩水项上审批门裁决）。
- **G6 数据兼容：旧 data/proj_* 保留不删，UI 不可见。** 新 PPT 项目新类型标记；ProjectsView 只列 PPT 项目；双机同步不受影响。披露。
- **G7 框架 schema 与确认交互：** framework = `{page_id, title, page_type, intent, source_hint?}[]`；整框架一屏确认（改题/删页/调序/加页），确认后锁定；生成阶段逐页可重入。
- **G8 编辑层字段范围：** 手工改=纯文字字段（headline/bullets 文本/table_note/图表标题）；agent 改=整页重生成（出站白名单 fail-closed 沿用）；编辑层删页保留（锁页/最后一页不可删，M6 语义）；加页只在框架确认屏。
- **G9 发布门：** 保留内用/外发两级——内用草稿随时可导（标记 draft）；外发发布=隐私检查（整 deck 扫描，命中 fail-closed）+用户批准（批准持久化沿用）；三格式导出物均出自对应批准层级。
- **G10 模板体系：** 现 3 模版注册表保留为「框架模板」（页序列倾向）；版式/美学知识经 PPT skill 注入（Gorden detail.json 协议借鉴）；Gorden 17 套完整接入作为样张盲评后的可选增强切片，审批门呈现。
- **G11 理解 checkpoint：** 逐文件摘要独立持久化，重进跳过已完成（沿用 checkpoint 范式）。
- **G12 并发：** 单用户假设延续（M7 L4 披露沿用），不修。

## UI-GATE 回填与调研定稿（2026-10-07，M-U 决议）

> 来源：UI-GATE 子代理 CHANGES_REQUESTED findings（F1–F6）+ KA-3 后台调研结论（vision/pdf）。全部为开放缺口裁决（预授权「按推荐」类），已同步进 ui-contract.md。**用户 2026-10-07 批准 M-U1–M-U6 全部决议**；同批指示：UI-GATE 验收物改为**前端 UI demo（静态或可点击版）**——UI 契约的批准以 demo 审看为准，md 契约降为实现参照。

- **M-U1（F1，原 high）资料可移除：** 上传资料与读取理解两屏均提供「移除」控件（确认后删文件+摘要+checkpoint）；失败文件移除后即解除对「确认框架」的阻塞——消除子代理指出的「永久解析失败死锁」。理解进行中的文件移除先取消其任务。
- **M-U2（F2）项目级隐私语义保留：** 项目 schema 含 privacy_policy（local_only 默认 / external_ok）；local_only 时外部模型调用被围栏阻断（服务端强制，N8），UI 在创建区 + Inspector 提供设置/切换。依据：privacy-gate 是围栏资产（PRD ID1 保留清单），M9 收尾补丁（6246838）正是为补此缺口，不能随重构丢失。
- **M-U3（F3）追加资料语义：** 追加资料→重新理解；已确认框架不失效不解锁；新摘要仅进入后续 agent 改页的材料上下文；已生成页不自动重生成。
- **M-U4（F4 + G4 定稿）图片理解支持：** 调研结论（官方文档实证）——MiniMax-M3 经 anthropic-messages 端点接受 image content block（URL/base64，JPEG/PNG/GIF/WEBP，单图 ≤10MB）；mimo-v2.6-flash 经 openai-completions 端点接受 image_url（base64 data URI 可用，≤50MB）。**主备链均原生支持 vision，无需换模型**。实现：上传图片→base64 data URI 进理解摘要调用；统一 cap 10MB/张；支持格式 JPEG/PNG/GIF/WEBP。两 CN 宿主（api.minimaxi.com / token-plan-cn）的图片行为**纳入 §7.5 真调准入**（加带图探针，防端点侧行为漂移与非 vision 模型静默丢图）；备选 vision 模型同端点可换（M3.1-Flash-Preview / mimo-v2.6-pro）。
- **M-U5（G5 定稿 + F5）pdf 解析与密钥形态：** pdf 解析选 **unpdf**（unjs，ESM 原生、零运行时依赖、内置 pdf.js v5 自动接 CJK CMap——中文 CID 字体开箱可用）；ToUnicode 映射损坏的中文 PDF 兜底=renderPageAsImage 渲成图喂 vision（与 M-U4 汇成同一降级链）；安全：maxImageSize cap（16MP）+ 页数预检。密钥配置维持现状形态（环境变量+探针指引，不做页内录入——密钥不入 UI 面）。
- **M-U6（F6）emoji 语义：** 0 emoji 断言限于模型生成/agent 改写路径（渲染缝负例继续）；手工输入不过滤（用户意图优先），导出物如实携带。

## 动工审批门决议（2026-10-07）

用户对披露项逐条裁决：**工人模式 + 禁多轮 tool-call 循环维持**（经质疑「结合材料是否需要工具」后按推荐确认——工具的活由确定性代码提前完成）；切片清单与其余披露项（样张盲评 kill switch、GordenSun 协议借鉴、旧数据不迁移、单用户假设）按推荐通过，**授权 S1→S8 全自主推进**。

**材料投影机制（对 G2 的细化，additive）——「结合材料」不靠工具循环，靠三层有界单发：**
1. **理解阶段打语义索引**：逐文件摘要的结构化输出要求每条要点带主题标签（如「流失原因」「价格敏感」）；长 PDF 由代码确定性分段、逐段摘要（map），摘要粒度到段落级。
2. **生成时语义投影**：逐页生成前，代码按「页意图 × 摘要条目主题标签」匹配（必要时嵌入相似度），将命中的摘要段落连同来源装进上下文——检索的是理解阶段模型自打的语义标签，非表面关键词。
3. **检索单发兜底**：投影材料不足（页意图覆盖不到现成标签）时，插入一次快速「检索单发」（页意图+候选摘要清单 → 选中条目，schema 校验），再正式生成——固定轮次、逐轮校验、逐轮审计，**不是**模型自决的「读完再翻」循环。

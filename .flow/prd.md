# Report Studio M4 PRD｜分析成果编审模块（Editorial Workbench）

- **上游规范：** `.flow/proposal.md`（模块产品方案 v1.0，2026-09-23，规范事实源）
- **红队：** `.flow/red-team.md`（GO；K1–K4 硬约束已吸收进本文）
- **基线：** 仓库 M0–M3 已交付（commit 6d3304b）；基线核查（方案 §16.2 之 M0）已在 ASSESS 完成，复用/缺失清单见红队附录与勘察结论
- **命名约定：** 本仓库里程碑称 **M4**；引用方案 §16.2 阶段时写作 方案-M1/M2/M3，避免与仓库已交付的 M0–M3 混淆
- **M4 门禁判据（可执行化）：** `npm run verify` + 回归 golden 零漂移 + UI 冒烟全绿；方案 §17 验收用例中归属本 flow 的条目全部有自动化测试覆盖（见 Testing Decisions）

## Problem Statement

用户（业务分析师/报告编制者）在"分析做完"与"正式汇报"之间缺少受控工作区：直接从材料生成报告导致主线随材料膨胀、已确认内容被后续导入悄悄改变、重要限制在精简中丢失、关键数字被编辑误改。现有 Report Studio 能导入材料→大纲→组装→检查→导出，但：取舍与蓝图没有持久状态（重开即丢）、编辑即时应用且无版本冲突保护（旧结果可覆盖新编辑）、锁定只有页面级布尔且页序/布局不受锁约束、新材料直接混入资产池（无候选区）、没有批准记录（无法验证"生成内容仍在批准范围内"）、没有补证与回执闭环。

## Solution

在既有资产层与交付管线上新增**编审模块**，形成方案 §1.1 的受控闭环：

授权成果输入（AnalysisBundle 或既有材料）→ 发现卡片 → 汇报任务书 → 确定性取舍推荐 + 编审决定 → 逐页蓝图 → **G1 人工编审**（批准记录）→ 受控 ReportSpec → 提案式局部修改 + 补证（EvidenceRequest）→ 新版本候选与待复核 → **G2 扩展检查** + 人工发布 → 冻结导出 + ReportReceipt。

产品主张（方案 §0）：分析充分展开，汇报有所取舍；Agent 提供发现与候选，编制者决定主线，系统把决定落实为可追溯、可锁定、可局部修改的报告。

## User Stories

### 成果输入与独立运行（方案 F02/§5.3/§11.1）

1. As a 分析师, I want 导入结构化分析成果包（AnalysisBundle：发现/指标/图表/证据/口径/限制/验证记录/权限）, so that Xanthil 或其他分析工具的成果不用复制粘贴重建。
2. As a 用户, I want 不安装任何上游工具时用既有 Markdown/CSV/DOCX 材料走完同一编审闭环, so that Report Studio 独立可用（方案 T01）。
3. As a 用户, I want 同一成果包重复导入不产生重复资产、不丢失已有编审决定, so that 幂等交接不污染项目（方案 T03）。
4. As a 用户, I want 成果包带新版本（同逻辑资产 r2→r3）时旧引用不变、只产生"待复核"提示, so that 报告不被自动改写（方案 §7.7/T11）。
5. As a 安全负责人, I want 成果包中的路径引用被限定在授权清单、包内代码/指令永不执行, so that 导入不打开本地优先的边界（方案 §11.4/§14.3/T19）。

### 发现卡片与任务书（F01/F02）

6. As a 编制者, I want 每条发现以卡片呈现（一句话发现、陈述性质、证据与验证状态、口径、限制、反证、本次编排位置）, so that 我能按证据状态而非原文长度做取舍。
7. As a 编制者, I want 任务书里写清受众、沟通目的、核心问题、正文预算、重点/非重点、必须保留的边界与交付隐私范围, so that 取舍有依据且可复查（方案 §7.1）。
8. As a 编制者, I want 同一发现在两份报告中编排不同而底层事实一致, so that 编排不污染事实（方案 T04）。

### 取舍推荐与编审决定（F03）

9. As a 编制者, I want 系统先给一套正文/附录/不采用的推荐及理由，我只调整例外, so that 编审不是从零筛选（方案 §18.2 风险应对）。
10. As a 编制者, I want 每次取舍记录对象/位置/理由/时间/依据版本, so that 决定可追溯、重开不丢（方案 §7.3/T21）。
11. As a 编制者, I want 标记"本次不采用"的发现不被下一轮自动插回，除非新证据改变重要性并重新提出, so that 决定有粘性（方案 T06）。
12. As a 编制者, I want 会改变受众判断的反证/限制被推荐保留在正文层而非藏进附录, so that 突出重点不变选择性呈现（方案 §7.3/T13）。

### 逐页蓝图与 G1（F04/§8.1）

13. As a 编制者, I want 每页蓝图含页面目的、一句核心信息、引用发现及版本、必要限制、入选理由与篇幅预算, so that 蓝图可审查而非只是目录（方案 §7.4）。
14. As a 编制者, I want G1 批准记录绑定任务书版本、来源快照、修订版与批准范围, so that 系统能验证后续生成是否仍在批准范围内（方案 §8.1）。
15. As a 编制者, I want G1 未批准时仍可看草拟预览但明确标识非正式, so that 草稿与正式稿不混淆（方案 T07）。

### 受控修改（F06/§12）

16. As a 编制者, I want 修改以变更提案呈现（目标对象、字段 before/after、影响面）并先看差异再应用, so that 范围外内容不被误改（方案 §12.1）。
17. As a 编制者, I want 锁定粒度到页序、标题、正文块、指标、图表绑定、必要风险与来源引用, so that 精简文字不会动到数字（方案 §7.6/T08）。
18. As a 编制者, I want 旧版本提案在当前修订已前进时被拒绝并给出协调路径, so that 并发生成/编辑不互相覆盖（方案 §12.2/T15）。
19. As a 编制者, I want 换模板/主题只改视觉不重写事实与结论, so that 已批准内容稳定（方案 §8.4/T09）。

### 更新、候选区与补证（F07/§5.4）

20. As a 编制者, I want 新导入/新版本成果先落候选区、不自动改写报告, so that 继续分析不等于允许整稿重写（方案 T10）。
21. As a 编制者, I want 与关键陈述冲突的新证据把受影响页标记待复核并阻断正式发布, so that 锁定不掩盖错误（方案 §7.7/T11）。
22. As a 编制者, I want 证据缺口以补证请求（要验证什么、缺口、受影响页）形式草拟、批准、导出或暂存、结果关联, so that 补证走原分析流程而不是编一段支持性文字（方案 §5.4/F07/T16/T17）。
23. As a 用户, I want 上游不可用时补证请求保留本地并可导出, so that 不阻塞继续整理（方案 §5.4）。

### G2 检查与交付（F08/F09/§8.2/§11.3）

24. As a 编制者, I want G2 增加重点覆盖、必要限制保留、批准范围漂移与检查绑定最终版本四类确定性检查, so that 取舍失真和事后改动不能溜进正式稿（方案 §7.8/T22）。
25. As a 编制者, I want 导出后拿到回执（修订、文件、哈希、检查结果、来源映射、草稿/正式标识）, so that 交付可关联回上游任务（方案 §11.3/T23/T24）。
26. As a 编制者, I want 已导出旧文件不被静默重写、新修订发布后旧交付物标过时, so that 历史可信（方案 §7.7/T24）。
27. As a 隐私负责人, I want 汇总结果与发现文本同样受出站授权约束、模型出站仍过 PrivacyGate, so that "不是原始明细"不等于"可自动外发"（方案 §14.1/T18）。

### 恢复与体验（F09/§13）

28. As a 编制者, I want 中断重开后发现、任务书、取舍、锁定、批准与修订全部恢复, so that 编审状态不依赖会话（方案 T21）。
29. As a 编制者, I want 三栏工作台里新增编审区（发现/材料、任务书与蓝图、证据与取舍理由）且顶部显示报告阶段与待处理更新, so that 我先看到主线而不是一整篇长报告（方案 §13.2）。

## Implementation Decisions

### D1. 资产逻辑身份与版本（红队 K1，地基切片）

- 资产增加**逻辑身份 + 修订**二元组：`logical_key`（如 `claim:F07`、`metric:inventory_turnover`，来自 bundle 生产者身份或导入时稳定派生）与 `revision`（r1、r2…）。页面/卡片/决定绑定 `logical@revision`，永不绑定"最新"。
- 激活既有 `SourceAsset.replaces` 语义：同 logical_key 新内容 = 新 revision + `replaces` 指向前版；旧 revision 与其引用保持不变。
- 普通材料导入（无上游身份）按内容哈希派生 logical_key，实现同文件重导幂等；不破坏存量 `claim_<src>_<n>` ID（兼容读旧项目）。
- 修订链上的引用只指向当时版本；`pagesImpactedBySource` 升级为按 logical_key 的影响面，驱动"待复核"。

### D2. 编审状态与批准（G1）

- 新增持久化编审状态（`work/editorial.json`，随修订快照冻结入库）：`status: organizing | brief_draft | blueprint_review | g1_approved | draft_editing | checks_pending | published`，外加按页/发现的 `pending_review` 标记集合。
- 既有 `ProjectStage` 保留为 UI 粗阶段；编审状态机是权威，两者由 workbench 同步。
- `ApprovalRecord { approval_id, approver, brief_version, source_snapshot_id, revision_id, scope, approved_at }`；G1 批准写入状态并冻结当时 brief/蓝图/来源快照。生成与导出时验证"当前内容仍在批准范围内"（配合 D5 漂移检查）。
- 内容批准（G1）与发布确认（G2）分开记录；G2 确认绑定最终修订 + 检查报告（T22：内容再变则检查失效）。

### D3. 发现卡片与编审决定（复用不重建）

- FindingCard 是 Claim/Metric/ChartAsset/EvidenceRef 的**组合视图**（服务端组装，含证据摘录与口径），不新建事实对象。
- 陈述性质沿用 `ClaimKind`；验证状态沿用 `VerificationState`；新增**编排位置** `placement: candidate | body | speaker_notes | appendix | excluded | deferred`，存于按报告隔离的 `EditorialDecision { decision_id, report_id, logical_key, placement, position?, reason, operator, decided_at, basis_revision }`。
- 编排决定不修改资产全局状态（T04）；`excluded` 决定粘性：重排/重导不自动恢复，仅当新 revision 的重要性信号变化时重新提出复核（T06）。

### D4. ReportBrief 扩展与蓝图

- `ReportBrief` 增加可选字段：`core_question`、`non_goals[]`、`required_boundaries[]`（必须保留的风险/反证/限制）、`delivery_privacy`；旧字段不动，向后兼容。**篇幅预算不另设结构**（GRILL G13：复用 `page_budget` + `duration_minutes`，避免重复建模）。
- `PagePlanItem` 增加蓝图字段：`page_purpose`、`core_message`、`inclusion_reason`、`required_limits[]`、`budget`；组装时蓝图信息随页入 spec（`Page.meta` 扩展），渲染不改（蓝图是编审数据，不是新页型）。
- 确定性取舍推荐器（model 层新能力，仍 `external: false`）：按核心问题相关性（类型+关键词+证据状态+增量信息）产出推荐+理由，不用无依据精确分数；推荐结果即 EditorialDecision 草案，人只改例外。

### D5. 单一变更控制器（红队 K4）

- 新增编审控制器：所有对 spec 的写路径（API `/edit`、编审 UI 动作、新版本影响修订）统一收敛为 `ChangeProposal { proposal_id, report_id, expected_revision, approved_scope, changes[]: {object_id, field, before, after}, affected[], required_checks, state: draft | approved | applied | rejected | stale }`。
- 应用顺序按方案 §12.2：版本一致 → 对象/字段/操作在范围内 → 锁定未被绕过（含**页序锁**；reorder/switch_layout 纳入锁定检查，补齐现状缺口）→ 来源可用 → 原子应用 + 审计 → 受影响对象重检。
- 存量 `EditOp` 语义保留：薄壳包装为自动提案（expected_revision=当前修订，G1 前自动应用，G1 后受批准范围约束）；存量测试路径不重写。
- 锁定升级：`Page.locks`（可选对象：`page_order | headline | body | metrics | chart | required_note | sources`）+ 报告级 `locks.storyline/page_order`；旧 `locked: boolean` 读作"内容锁全开"兼容。

### D6. AnalysisBundle 合同与导入（方案 §11.1/§11.4）

- 新增 `AnalysisBundle` zod 合同：合同身份（schema_version/bundle_id/producer/created_at）、上游定位（project_id/task_id/run_id/result_revision，contract_ref 可选）、成果快照（snapshot_id+清单+哈希）、发现（陈述类型+内容+指标/证据引用）、指标与图表（数值/口径/周期或已授权图片）、证据与验证（定位/依据/维度/限制/反证/缺口）、权限（敏感性/本地用途/外发范围）、可用性（含缺失项）。
- 导入器：未知 schema_version 明确拒绝；资源定位走授权清单受控解析（禁路径穿越/符号链接越界/执行包内代码/自动访问链接）；导入材料默认继承项目 privacy_policy（local_only 兜底）。
- 幂等：bundle_id+snapshot 哈希去重（T03）；同 logical_key 新 revision → 新修订+待复核，不覆盖旧资产（T11）；人工无源材料仍可进，但按 `unverified` 待核实状态（T25，不伪造 run_id）。

### D7. EvidenceRequest 与 ReportReceipt（方案 §11.2/§11.3）

- `EvidenceRequest` 生命周期：`draft | awaiting_approval | approved | exported | returned | cancelled | failed`；字段含 question/gap/affected_objects/required_evidence（不限定结论方向）/source_snapshot/user_approval/upstream_task_ref/result_refs。request_id 幂等去重（T17）。
- 无 Xanthil 运行时：请求可导出为文件、结果以 bundle 导入关联；接口形态为后续真实适配预留（本 flow 只做合同+模拟）。
- `ExportRecord` 扩展为回执语义：补 upstream link、来源映射、编审/发布记录引用、交付状态（draft/formal/superseded）；同 export_id 重试不重建关联（T23）；新修订发布后旧记录标 `superseded` 不改文件（T24）。

### D8. G2 扩展检查（确定性，进既有引擎）

- 重点覆盖：`core_question` 关联的关键发现必须在正文层有落点（缺 → warning，含必要边界关联时 → blocker）。
- 必要限制保留：`required_boundaries` 与蓝图 `required_limits` 必须在正文层可见（仅附录 → blocker，T13）。
- 批准范围漂移：G1 后内容与批准快照 diff，超出 approved_scope 的实质变更 → blocker（§12.3 哈希规范化比较，排除视觉/时间戳）。
- 检查绑定最终版本：导出校验 revision+快照+检查记录一致，内容再变需重检（T22）。
- `pending_review` 存在 → 正式发布阻断（policy 级），草稿仍可带标识导出。

### D9. UI（三栏外壳内扩展）

- StageBar **升级现有"大纲"槽位为"编审"阶段**（stage key 保持 `outline` 兼容既有路由与解锁规则；材料 → 编审(发现/任务书/取舍/蓝图/G1) → 组装 → 检查 → 导出）：发现卡片列表（左）、任务书+蓝图+取舍（中）、证据/理由/差异（右 Inspector 扩展 findings/decisions tab）。
- 顶部状态条：报告编审状态、绑定来源版本、待处理更新数、G1/G2 标识分开显示（方案 §13.3 文案要求落入 UI）。
- 候选区、蓝图确认、G1 批准、提案差异确认均为显式控件；旧 5 阶段路径保留兼容（非编审项目不受影响）。

### D10. 范围与阶段（红队 K3）

- 本 flow = 方案-M1（独立编审闭环）+ 方案-M2（稳定性与发布门禁）+ 方案-M3 的合同与模拟样例部分；切片数 ≤ 8，超出即拆连续两 flow（E1 闭环 / E2 稳定接缝）。
- 讲稿层：仅编审数据层落地（placement 支持 speaker_notes），**不写入导出文件**（渲染器不动，隐私 speaker_notes 检查维持 not_checked 并注明）。

## Testing Decisions

- **最高新 seam：编审服务级闭环**（一次 API 注入测试贯穿 schema→compose→checks→storage）：bundle 导入 → 发现 → 任务书 → 推荐 → 蓝图 → G1 → 指定修订组装 → 提案编辑 → 待复核 → 检查 → 回执导出（先于 tests/api.test.ts 的 app.inject 模式）。
- **合同 seam：** bundle schema 校验（未知版本拒绝）、恶意包（路径穿越/嵌入指令惰性化）、幂等重导（T03）、版本升级待复核（T11）。
- **控制器 seam：** 范围外零漂移（T08，沿用 M2 编辑稳定性测试法）、旧提案拒绝（T15）、锁定绕过（含 reorder 页序锁）、原子性（提案失败无半状态）。
- **G2 seam：** 覆盖/边界保留/漂移/检查绑定（T13/T22）逐条断言；待复核阻断正式发布、草稿带标识。
- **复用既有 seam：** 回归 golden 零漂移贯穿每切片（存量路径不动）；隐私测试扩展（bundle 材料默认 local_only、T18/T19）；UI 冒烟脚本加编审走查步骤。
- **确定性推荐验证（红队 K2 cheapest test）：** 零售样板 fixture 断言推荐入选/落选集合符合方案 §15 预期；推荐质量人工走查一次并记录。
- 好测试标准：只断言外部行为（API 结果、文件内容、状态转移），不断言内部结构。

## Out of Scope

- Xanthil Desktop 真实适配与运行时联调（本 flow 仅合同 schema + 模拟样例；真实连接按方案-M3 另行验收）
- 外部模型实现接入（ModelGateway 接口与 PrivacyGate 不变，仍仅确定性实现）
- 讲稿/备注写入导出文件、新输出格式、模板市场、多人协作、版本比较 UI 大改
- 数据库问数、探索性分析、知识库/策略库写入（方案 §2.2 边界）
- Windows 真机验证（沿用已批准的 C1 延后项）

## M4 GRILL 决议（留白自答，全部按推荐执行）

| # | 留白问题 | 决议 |
|---|---|---|
| G1 | 编审 UI 阶段结构 | 升级现有"大纲"槽位为"编审"（stage key 仍为 `outline`，兼容路由/解锁规则），不新增第 6 阶段 |
| G2 | G1 前编辑是否留提案记录 | 单管线：G1 前提案 auto-applied 仍留审计；G1 后需批准范围；测试面不分叉 |
| G3 | expected_revision 粒度 | 复用 storage `rev_NNN`，不引入第二套版本号；编审元数据（决定/任务书）变更不 bump spec 修订 |
| G4 | 普通材料 logical_key 派生 | source 级 `source:<producer>:<stem>`（bundle 用 producer+task），资产级按解析顺序+锚文本哈希派生；同 source 重导=revision 升级（replaces 链），内容哈希一致幂等跳过 |
| G5 | placement 与页 claim_refs 事实源 | EditorialDecision 为源、spec 为投影：组装从 body/appendix 决定推导 claim_refs，G1 时校验一致（不一致=warning） |
| G6 | 漂移检查基准 | G1 批准冻结修订+approved_scope（由蓝图+锁定推导）；漂移=diffSpecs(当前, G1修订) 按 scope 分类；layout/theme 变更不属实质变更 |
| G7 | bundle 传输形态 | 首期单 JSON 全内联（图片 data URL），无文件系统路径解析（攻击面最小）；zip 目录形态延后，符合方案 §11.1"传输协议核查后再定" |
| G8 | 补证结果如何回流 | 结果 bundle 带 `origin.evidence_request_id` → 导入器自动写回 result_refs 并触发受影响页待复核 |
| G9 | 状态机强制点 | workbench service 层强制非法转移抛错；published 后变更只能派生新修订回到 checks_pending，不回退覆盖 |
| G10 | 旧项目兼容 | 惰性初始化：首次进编审阶段按现有资产生成 placement=candidate 决定、状态 organizing；无数据迁移 |
| G11 | 切片骨架 | 8 片：S1 身份+bundle 导入 → S2 发现+任务书+决定 → S3 推荐+蓝图 → S4 G1+状态机 → S5 变更控制器+锁定 → S6 更新影响+候选+补证 → S7 G2 扩展+回执 → S8 UI+冒烟+收口（=K3 上限，ISSUES 可合并 S1/S2 减到 7） |
| G12 | 恶意指令惰性化 | 沿用既有立场（材料非指令、React 默认转义、无外部模型调用路径），测试固化即可 |
| G13 | length_budget 与现有字段重复 | 不另设结构，复用 page_budget + duration_minutes（已修正 D4） |
| G14 | G2 确认载体 | 导出请求绑定当时检查报告指纹；G2 确认落 ApprovalRecord(kind=g2)，与现有 acks 并存 |

## 实现期偏差记录（双轴审查 Round 1 收敛，2026-09-24）

按红队/审查结论回写的有意简化与设计决策（与 D 决议冲突处以本节为准）：

1. **状态机省略 `checks_pending`**（D2）：G2 确认并入正式导出（导出即绑定检查指纹），编辑→发布的中间态由检查重跑保证（T22 语义保留）。
2. **EvidenceRequest 省略 `awaiting_approval`**（D7）：单用户无审批队列，draft→approve 直达；状态枚举保留 cancelled/failed 供上游适配。
3. **G2 确认形态**（G14）：用独立 `G2ConfirmationSchema`（revision+export+检查指纹+时间）而非 ApprovalRecord(kind=g2)，等价承载。
4. **G10 惰性初始化**：实现为「无决定=候选」缺省 + 编排决定存在=编审模式触发。原案「物化 candidate 决定」会让所有生成过大纲的 legacy 项目进入 G1 门（实现期发现的兼容性冲突），故采缺省等价方案。
5. **组装自动注入必要边界 bullet**（assemble.ts）：编制者自己声明的边界默认进入概要页正文（§7.3 默认可见），检查在边界后加/被删时阻断（T13 可达，测试覆盖）。
6. **G9 非法转移**：用户可触发的非法跳转（无蓝图即 approve-g1）返回 400；advanceStatus 内部回退为 no-op（不可由用户触发）。
7. **普通材料同文件幂等**（D1 补全）：content-hash 判定 + XLSX 例外（选表重导是显式流程）；bundle 幂等按「逻辑身份+snapshot_id」（§11.4 快照身份，不用全文重序列化哈希）。

## Further Notes

- 红队硬约束落点：K1→D1（地基切片）、K4→D5（单一控制器+页序锁）、K3→D10（切片≤8 拆分预案）、K2→测试决策中的样板断言+人工走查。
- 旧概念图（2025-08-27 v0.1）不替代方案 v1.0（其 Word 输出/5-Agent 层/网页报告不扩入范围）。
- PRD 自动接受（dev-flow 规则），决策 trail 在 GRILL 阶段追加。

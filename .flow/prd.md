# Report Studio M5 PRD｜LLM 接入（pi sdk + 两层缝）

- **上游方案：** `.flow/proposal.md`（M5 方案，含评审决议 R1–R4；规范事实源）
- **红队：** `.flow/red-team.md`（GO；K1 已入 R4、K3 四条收窄为硬约束、K5 检查点、K6 最后手段）
- **参照：** deep-research 的 pi-ai 接入模式（streamSimple 直调、主备熔断、录制重放、env 密钥）
- **M5 门禁判据：** `npm run verify` + 回归 golden 零漂移 + UI 冒烟全绿；**全部测试离线**（录制重放 + 确定性路径，无网络/密钥依赖）；L1–L10 验收用例全过；确定性路径行为不变（139 既有测试不破坏）

## Problem Statement

报告工厂五个"理解与表达"位置目前全部由确定性规则占位：蓝图编排是固定模板、取舍推荐是 bigram 相关性规则、没有自然语言修改入口、语义检查只有因果措辞正则、补证缺口靠人工发现。产品规划（模块方案 §14.2）允许在隐私分级治理下引入外部模型，但仓库没有任何模型接入。用户已确认全量接入：minimax 主 + 小米备，会话级批准。

## Solution

按两层缝接入：**ModelGateway（能力缝）**扩展五个可选方法并保留确定性兜底，PrivacyGate 继续在能力缝拦截出站；**ModelClient（运输缝）**新增 pi-ai 流式调用 + provider 主备链 + 熔断 + 出站 payload 两级脱敏 + 录制/重放。五个用点：蓝图编排（仅结构模式）、取舍推荐（授权摘要）、自然语言→变更提案（授权摘要，走既有 /propose 控制器）、语义检查（warning-only）、补证建议（EvidenceRequest 草稿）。

## User Stories

1. As a 编制者, I want 编审页可选「AI 生成蓝图」（仅结构模式，只发任务书与资产清单）, so that 蓝图贴合本次任务书而非固定 8 页模板。
2. As a 编制者, I want 发现与取舍区一键「AI 推荐取舍」（授权摘要，发送我批准的发现文本）, so that 推荐理由基于内容相关性而非仅类型规则。
3. As a 编制者, I want 在组装页用自然语言说"只精简第 3 页的解释"并得到提案草案与差异确认, so that 不用逐个表单操作。
4. As a 编制者, I want 检查页可运行「模型辅助检查」提示重点偏移/重复啰嗦/限制遗漏, so that 语义层问题不靠正则碰运气。
5. As a 编制者, I want 补证建议一键生成 EvidenceRequest 草稿, so that 缺口识别有起点而非从零写。
6. As a 安全负责人, I want local_only 项目上所有 AI 入口完全不出现, so that 误发不可能发生。
7. As a 用户, I want 首次 AI 调用前看到将发送的内容类别/条数/目标模型并批准, so that 出站知情（§13.3）。
8. As a 用户, I want 每会话每项目只批准一次，出站日志记每次条数与成本（无内容）, so that 不被反复打断且可审计。
9. As a 用户, I want 模型失败/超时/输出非法时自动回退确定性版本并明示"已用规则版", so that 主流程零阻塞。
10. As a 用户, I want 无密钥/断网时全部功能手动可用, so that 本地优先不被破坏。
11. As a 用户, I want 主 provider 故障自动切备用、连续失败熔断冷却, so that 不反复烧超时。
12. As a 开发者, I want 全部测试离线运行（录制重放）, so that CI 与本地不依赖网络密钥、不烧 token。
13. As a 安全负责人, I want 仅结构模式的出站 payload 经断言零 claim 原文零表格数值, so that 脱敏不是口号。
14. As a 安全负责人, I want 授权摘要只发送编审工作区已可见的发现文本、sensitive 来源默认排除, so that 会话批准不变成未预期泄漏（红队 K3）。
15. As a 用户, I want 模型起草的提案与其他提案走同一审计通道并标"模型起草", so that 责任可追溯。

## Implementation Decisions

### D1 运输层 ModelClient（src/model/client.ts，新）
pi-ai `streamSimple` 直调（**不装 pi-agent-core**，R4）；`LlmStageClient.complete(stage, payload, schema)` 单一入口：provider 链按序尝试（env `REPORT_STUDIO_MODEL_CHAIN`，默认 minimax 主/小米备，S1 probe 后 pin 具体 model id）→ 瞬时错误切备用 → 2 次熔断 10 分钟（移植 deep-research modelFailover 判定）→ 全链失败抛 `ModelUnavailableError`（上层兜底）。超时 env 默认 120s。密钥仅 env（启动器 `scripts/with-model-env.sh` 注入，镜像 with-minimax-env.sh）。pi 类型不漏出本文件，输出一律经本地 zod schema parse。

### D2 出站治理（payloadBuilder + 会话批准，红队 K3 硬约束）
`buildPayload(mode, ctx)` 白名单构造两级：`structure-only`（任务书字段/页型枚举/资产类型清单/占位符——零 claim 原文零表格数值）/`authorized-summary`（编审工作区**已可见**的发现文本 + 必要聚合值；**sensitivity=sensitive 来源的发现默认排除**，预览中可显式勾选）。会话批准：Workbench 进程内 `Set<projectId|mode>`，首次调用前 UI 预览（类别/条数/模型/累计成本）→ 批准写入集合 → 同会话同项目同模式不再询问；服务重启集合清空（安全默认，重新批准）。预览层固定措辞："本会话后续 AI 调用将按同一范围发送新增发现"。outboundLog 记 provider/model/条数/字节/cost/时间，零内容。

### D3 能力缝扩展（ModelGateway 五个可选方法 + 兜底助手）
`composeOutline`（已有）/`recommendPlacements`/`draftChangeProposal`/`semanticChecks`/`suggestEvidenceGaps`。piGateway 实现全部；deterministic 实现除 draftChangeProposal 外全部（提案起草无确定性等价，无模型时入口置灰并提示手动编辑路径）。统一 `modelFirst(primary, fallback)` 调用点助手：缺失/抛错/超时/schema 不合格 → 兜底 + UI 提示"已用规则版"。取舍推荐**确定性版保持默认**，模型版是显式点选的升级项；excluded 粘性对模型版同样生效（模型推荐不翻案）。

### D4 各用点输出通道（程序约束不变式）
蓝图编排：输出经 zod 校验映射为 OutlineDraft（页型必须来自枚举，非法即兜底）。提案起草：`intent + spec快照` → `{op: EditOp, note}` 经 `EditOpSchema` 强校验 + 起草时刻捕获 `expected_revision` → 进**既有 /propose 控制器**（锁/范围/原子/审计零改动），提案审计标 `source: 'model-draft'`。语义检查：`warning` + 新 category `semantic`，永不进 blockers；检查页手动按钮触发（不自动烧钱），结果与确定性检查分列标"模型辅助"。补证建议：生成 `state=draft` 的 EvidenceRequest，用户编辑后照常走批准流。

### D5 录制/重放与测试纪律
ModelClient 套 recording/replay 装饰器。录制仅在 env `REPORT_STUDIO_RECORD=1` **且**项目来源为合成 fixture（tests/fixtures 的样例数据）时启用，代码层拒绝对真实项目录制（录制文件含出站原文）。全部 vitest 离线：replay + 确定性路径断言。live 冒烟走 `scripts/probe-model.mjs` 手动脚本（provider 连通性 + schema 遵从率抽样）。

### D6 配置面
env：`REPORT_STUDIO_MODEL_CHAIN`（默认 `minimax-cn/<pin>,xiaomi-token-plan-cn/<pin>`，S1 后定）、`MINIMAX_CN_API_KEY`/`XIAOMI_TOKEN_PLAN_CN_API_KEY`、`REPORT_STUDIO_MODEL_TIMEOUT_MS`（默认 120000）、`REPORT_STUDIO_RECORD`。项目 `privacy_policy` 决定模式映射（local_only→AI 入口不渲染；with_approval→需会话批准；allow_external→免批准仍记日志）。GET 项目详情带 `capabilities: { modelAvailable, policyMode, sessionApproved }` 驱动前端入口渲染。

## Testing Decisions

- **主 seam：ModelClient 录制/重放**（新增，全部模型行为测试离线化）+ **API 注入层**（既有模式）做用点行为断言（含 fallback 触发、批准流、409/锁不受影响）。
- **既有 seam 不破坏：** 回归 golden 零漂移（确定性路径输出逐字节不变）、139 既有测试全绿、UI 冒烟扩 AI 步骤（replay 模式，不烧 token）。
- **安全断言：** L3 出站 payload 白名单断言（结构模式零原文零数值）；outboundLog 零内容断言；L 系列（proposal §D8 L1–L10 + K3 新增条数增长审计条目）逐条自动化。
- **模型质量走查：** S4 用 §15 样板对 minimax/小米各走查一次并记录（schema 通过率、因果升格次数），作为 K2 检查点证据。
- 好测试标准：断言外部行为（API 结果/payload 内容/状态转移/UI 文案），不 mock 内部协作对象；模型层只 mock 在 ModelClient 边界（replay 即真录制）。

## Out of Scope

- pi-agent-core / 多轮 agent loop / 工具调用型 agent（R4）
- 流式输出到 UI；模型参与门禁判定、数字复算、冲突仲裁（确定性专属，永久）
- Xanthil 侧分析 Agent；多人协作下的批准模型（单用户假设不变）
- Windows 真机验证（沿用 C1）

## M5 GRILL 决议（留白自答，全部按推荐执行）

| # | 留白问题 | 决议 |
|---|---|---|
| G1 | 默认 model id（minimax/小米各用哪个） | S1 probe 实测后 pin 进默认 env 值与 README；PRD 不预填未验证的 id |
| G2 | 会话批准的 key 粒度 | `projectId|mode`（structure-only 与 authorized-summary 分开批准）——发送内容类别不同，混在一次批准里违背知情原则 |
| G3 | 语义检查结果持久化 | 并入当次 CheckReport 展示与导出检查快照，不建独立持久对象，重跑覆盖（与现有 checks 行为一致） |
| G4 | AI 推荐与规则推荐的来源标识 | 编审区显示当前推荐来源标签（AI 推荐/规则推荐），采纳动作与持久化通道完全相同 |
| G5 | outboundLog 存储位置 | 项目 `work/outbound-log.json` append-only，随 data 双机同步入库（无内容可入库），成本按会话聚合展示 |
| G6 | AI 蓝图与已确认蓝图的关系 | 与现有 composeOutline 行为一致：生成草稿待确认，确认前不覆盖已组装内容 |
| G7 | 提案起草的 expected_revision 捕获时机 | 起草时刻读当前修订写入草案；提交仍走 /propose 校验（期间前进则 409，模型草案不豁免） |
| G8 | UI 冒烟如何覆盖 AI 路径 | server 以 replay 模式启动（预置合成 fixture 录制文件），走查 AI 入口全链；不烧真 token |
| G9 | probe 脚本形态 | 手动 CLI：`--provider --model` 传参，固定合成 prompt 集，输出 schema 遵从率统计；不进测试不进 CI |
| G10 | 无模型时提案起草入口 | 组装页输入框隐藏，显示"需要模型服务"提示与手动编辑路径（置灰而非报错） |

## Further Notes

- S3 退出设继续/收缩检查点（红队 K5）：录制重放基建不稳则 S4–S6 收缩为确定性版交付，向用户明示——不改变 R1 全量决议，是风险应对。
- 成本可见：设置/预览层显示本会话累计 cost（outboundLog 聚合）。

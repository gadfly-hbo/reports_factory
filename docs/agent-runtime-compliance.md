# Agent Runtime 接入合规记录

> 依据：全局标准 `~/.zcode/standards/AGENT-RUNTIME.md` **v1.3**（2026-10-06；§11 验收门 + §10 坑表 13 条 + §3.4 供应商速查 + §3.4A 适配层 reverse config + §7.5/§11「真实单轮与多轮 LLM 联调实测」硬性准入门槛 + §9.2 偏差记账；v1.1→v1.3 增量含 M8 收尾与实测落地）。
> 参照案例：`~/DevWorkSpace/Projects/deep-research`（pi-ai/pi-agent-core 进程内接入；其 `pi-ai: "latest"` 未钉版为反面教材，本项目不复制）。
> 审计时点：2026-10-06（M8，基线 fcde9c6；按标准 v1.3 升版补记）。**维护约定**：`src/model/` 层行为变更的提交必须同步更新本文件对应条目的证据锚点；未同步的合规声明视为失效。
> 三态定义：**合规**（证据锚点）/ **N/A**（三段式正面论证：防御的风险 → 本架构达成机制 → 证据）/ **偏差**（已授权，§9.2 记账）。

## 一、§11 合规清单（8 项）

### 1. runtime 依赖全部收敛于适配层；业务代码零直接 import —— 合规

- `@earendil-works/pi-ai` 的 import 全部收敛在 `src/model/pi-transport.ts:1-4`（含 `:57-61` 按 model.api 动态加载 anthropic-messages / openai-completions）。
- 业务层（server/workbench/compose）只 import 本项目适配模块（`src/model/client.ts` 的 `LlmStageClient` 等），零 pi-* 直接 import（核实：`rg "@earendil-works" src/` 仅命中 pi-transport.ts）。
- 上游破坏性变更只需改 pi-transport.ts + client.ts 两个文件。

### 2. 工具注册表完备，元数据含读写与预算字段 —— N/A

- **防御的风险**：模型经工具面直接产生副作用（写/删/发/花钱）且无元数据约束。
- **本架构达成机制**：模型没有任何 tool-call 面——六个用点全部是「单发 completion + zod schema 校验 + 程序白名单过滤」，模型输出只能是预定义 JSON（`src/model/ai-draft.ts` PageDraftOutputSchema 等），不存在工具调用通道；一切写操作经 `/propose` 程序控制器（`src/compose/proposal.ts:47` expected_revision 409 / 锁 / 原子应用 / 审计），与模型无关。
- **证据**：`src/model/client.ts` complete() 无 tools 参数；`src/compose/proposal.ts:67-71` 版本一致性检查；`tests/proposal.test.ts` 锁/409 负例。

### 3. 写类工具 100% 过确认门（夹具可证） —— N/A（同上）+ 出站批准门有夹具

- **防御的风险**：模型直执行副作用。
- **达成机制**：同上（无工具面）；另一侧「出站」（把内容发给外部模型）100% 过批准门——`gateOrThrow`（`src/server/workbench.ts:109`）先预算三线再批准检查，未批准 403 needsApproval；批准持久化 `work/outbound-approvals.json`（`src/storage/workspace.ts:181-193`），重启不失效、新项目/新模式仍弹预览。
- **证据**：`tests/outbound.test.ts`（未批准拒绝/批准放行/分类别分开/持久化跨重启）、`tests/generate-draft.test.ts`（生成 403 needsApproval → 批准 → 通过）、`tests/budget.test.ts`。

### 4. 所有循环三重封顶（轮次/预算/墙钟）默认启用 —— 合规

- 本项目无 agent 循环（工人模式：每阶段/每页单发）。封顶为「出站调用」三线，挂出站门统一入口，默认启用：
  - 调用次数（默认 50）+ 墙钟（默认 30 分钟）+ 单阶段轮次（默认 20）：`src/model/budget.ts:23-30`（DEFAULT_BUDGET）、`checkBudget` `:38-70`；起草路径逐页复查 + 失败的真实调用也计量（`src/server/workbench.ts` draftStage）。
  - 单次调用超时：`src/model/client.ts:181`（默认 300s，env 可调，标准 §10#10 工人模式 ≥300s）+ `src/model/pi-transport.ts:121`（AbortSignal.timeout）。
  - 熔断：连续 2 次瞬时失败跳闸、冷却 10 分钟（`src/model/client.ts:76-113`）。
  - 成本线仅次级展示不阻断（小米 token-plan usage.cost 恒 0，标准 §10 坑表第 4 条）。
- **证据**：`tests/budget.test.ts`（三线各自负例 + 成本不阻断负例 + blocked 不计量）、`tests/main-path-llm.test.ts`（起草超帽 403）。

### 5. 审计事件持久化并回放验证通过 —— 合规

- 三账分立（对齐 deep-research run/checkpoint/audit 模式）：任务 checkpoint `work/state.json`（`src/storage/workspace.ts:108`）、出站账 `work/outbound-log.json`（`:159`，零内容：provider/条数/字节/cost/blocked）、审计账 `work/audit-log.json`（`:202`，阶段/门决策/批准事件，零内容）。
- 零内容纪律有测试锁定（断言事件无 text 键）。
- **证据**：`tests/budget.test.ts`（审计流零内容断言）、`tests/generate-draft.test.ts`（draft 阶段事件 + page_fallback 粗粒度 reason 不嵌模型产出）、`tests/main-path-llm.test.ts`。

### 6. 领域字典注入已实现（上下文装配） —— 合规（M8 补齐后）

- 达标线（GRILL G2）：每次模型调用输入 100% 程序装配（无对话记忆依赖）且 brief 必要边界覆盖全部出站路径。
- 装配面：①出站 payload 白名单构造（brief coreQuestion/nonGoals/**requiredBoundaries** + 资产清单 + 已可见发现，`src/model/outbound.ts:26`）覆盖蓝图/推荐/语义检查/补证四用点；②逐页起草（M7）按页白名单注入绑定主张+表格（`buildPageMaterialsSensitiveAware`，`src/model/ai-draft.ts`）+ **boundaries**（M8 补齐）；③整页重生成注入 boundaries（`src/model/ai-page.ts` buildPageRewriteRequest opts）；④提案起草注入 boundaries（`src/model/ai-proposal.ts` buildProposalRequest opts，M8 复审 B1 补齐）。
- **七条出站路径全覆盖**（`complete()` 全仓恰 7 处，均先过 gateOrThrow）：outline / recommend / semantic / gaps / proposal-draft / page-draft / page-rewrite。
- **证据**：`tests/generate-draft.test.ts`（boundaries 注入断言 + 夹具与 workbench 同参构键锁定接线）、`tests/ai-page-rewrite.test.ts`、`tests/ai-proposal.test.ts`（同参夹具）、`tests/outbound.test.ts`（payload 白名单）。

### 7. 夹具回放全绿（record → replay 闭环） —— 合规

- replay transport 缺键抛 `ReplayMissError` 不静默合成（`src/model/recording.ts:54`）；录制纪律：只允许合成 fixture，拒绝真实数据落盘（`:34`）。
- 覆盖：六个用点 + 生成起草链路均有 record→replay 夹具（`tests/ai-*.test.ts`、`tests/generate-draft.test.ts`、`tests/main-path-llm.test.ts`）；录制文件 `tests/fixtures/recordings/s1-probe-*.json`。
- **证据**：上述测试全绿（`npm run verify`）；probe 脚本 `scripts/probe-model.mjs` 供真实连通性抽样。

### 8. §10 坑表逐条确认规避 —— 合规（逐条见下节）

## 二、§10 已知坑表（v1.1 共 12 条逐条）

| # | 坑 | 规避状态 | 证据 |
|---|---|---|---|
| 1 | runAgentLoop 吞供应商错误（stopReason=error 不抛出） | N/A-不适用：本项目不用 runAgentLoop（单发工人）；streamSimple 的 error 事件主动 throw，主备熔断链生效 | pi-transport.ts:129-131；client.ts 瞬时判定切换备用 |
| 2 | toolResult.content 必须内容块数组 | N/A-不适用：无工具调用即无 toolResult 块 | 同 §11-2 |
| 3 | 小米 token-plan 不遵循 system 通道 | 合规：system 指令并入首条 user 消息，适配层统一处理 | `src/model/pi-transport.ts:109-114`（注释明示 deep-research 实测来源） |
| 4 | token-plan usage.cost 如实记 0 | 合规：成本仅次级展示，预算按次数/轮次/墙钟三线封顶 | `src/model/budget.ts` checkBudget 成本不参与阻断 |
| 5 | pi 全家无权限系统、无工具沙箱 | 合规（结构性规避）：无工具面即无沙箱需求；模型无直写通道 | 同 §11-2 |
| 6 | 0.x 小版本可破坏 | 合规：`package.json:25` 精确钉版 `"0.86.1"`；升级走 §7.4 流程 | package.json；本记录为升级检查点 |
| 7 | MiniMax-M3 输出前附 `<think>...</think>` 思考标签 | 合规（M8 补齐）：接收完成后正则剥离再进下游解析 | `src/model/pi-transport.ts`（stream 汇聚后 replace 剥离） |
| 8 | 流模块与 model.api 错配 → 404 | 合规：按 model.api 动态 import 对应流模块；适配层反向配置兜底（`resolveModelFor`：小米 model id 一律走 `token-plan-cn` 端点 + openai-completions，不依赖 pi 内置清单是否收录当前 id——pi 0.86.1 内置只有 v2.5 系，v2.6-flash 等新 id 经此兜底自动可用） | `src/model/pi-transport.ts:57-61`：`resolveModelFor` 小米分支 |
| 9 | runAgentLoop 不传 convertToLlm | N/A-不适用：不用 runAgentLoop；单发 streamSimple 直接构造 messages（system 并入 user，即坑 3 规避） | pi-transport.ts:109-114 |
| 10 | pi-ai 内部重试 × AbortSignal 叠加；工人超时 ≥300s | 合规：适配层 maxRetries:1 快失败（重试/熔断归主备链）；默认超时 300s（M8 按标准上调，env 可调） | `src/model/pi-transport.ts:119-121`；`src/model/client.ts:181` |
| 11 | 模型不守 JSON 包装（double-encoded） | 合规（M8 补齐）：parseJsonLoose coerce 展开 ≤3 层 unwrap，zod 兜底 + 页级回退降级不炸管线 | `src/model/client.ts` parseJsonLoose/unwrapEncodedJson |
| 12 | token-plan 配额错误码 2067 | 合规：TRANSIENT 正则含 2067，按限流类触发主备切换 | `src/model/client.ts:54-61` |

## 二A、§3.4 供应商接入速查核对（v1.1）

- 默认主备链已按 §3.4 更新：`minimax-cn/MiniMax-M3`（主）+ `xiaomi-token-plan-cn/mimo-v2.6-flash`（备）（`src/model/client.ts:230`；原 M2.7 已 404 下线、mimo-v2.5-pro 非现网——v1.1 实测背书）。
- 密钥本机发现与注入：`scripts/with-model-env.sh`（`~/.pi/agent/auth.json` / `~/.zcode/v2/config.json`），与 §3.4 凭证发现路径一致；密钥不进仓不进日志。
- 全部 replay 夹具与 probe 脚本已随链更新（provider/modelId 键重算）。
- 已实测（M8 收尾）：MiniMax-M3 单轮 2/2 + 多轮 4/4 / schema 2/2（库表遵从）、refs 跨轮引用 2–3/3；mimo-v2.6-flash 单轮 2/2 + 多轮 4/4、refs 3/3。适配层 reverse config 让 v2.6-flash（pi 0.86.1 内置缺失）经 `token-plan-cn` 端点自动可用。

## 三、§9.2 偏差记账（已授权）

| 偏差 | 内容 | 授权链 |
|---|---|---|
| ~~D-1~~ | ~~本项目只用 pi-ai、不引入 pi-agent-core~~ **已撤销（2026-10-07 M10）**：用户裁定第二次重构「全程用 pi-agent-core 及 skill」，引入 `@earendil-works/pi-agent-core@0.86.1`（钉版），承载 skills 机制（assets/skills/ppt/SKILL.md 经 loadSkills/formatSkillsForSystemPrompt 注入）；装配形态见 D-4 | M10 提案 D3（用户指令）→ `src/model/agent-kernel.ts` 单点适配（§4.1），`tests/agent-kernel.test.ts` 白名单断言 |
| D-4 | AgentHarness 全量装配（lane/session/operation）评估后不启用：六步工人单发必须保留 LlmStageClient 主备熔断 + 录制回放 + §10 坑规避（transport 层），AgentHarness 自有 streamFn/session 接入即需重造三样，零收益；pi-agent-core 承载面 = skills 机制。对话式形态（如立项）走 §8 闸门后重评 | M10 PRD G3 降级阶梯（动工审批门已披露）→ 用户裁决维持工人模式 + 禁多轮 tool-call 循环 |
| D-3 | 默认链依据标准 v1.1 §3.4 升级（M2.7→M3 / mimo-v2.5-pro→v2.6-flash）；适配层 reverse config（`resolveModelFor`）让小米 model id 一律走 §3.4 端点，不依赖 pi 内置清单；测试 `tests/runtime-resolve.test.ts` 锁接线 | M8 收尾（产品配置对齐）→ 多轮 + 单轮探针已实测连通 |
| D-2 | 领域字典注入形态与 deep-research 的 ModuleConfig/evidencePacks 不同（本项目：brief 边界 + 页绑定材料白名单装配） | 实质达标（§11-6），形态差异不构成偏离标准要求；M8 GRILL G2 裁决达标线 |

## 四、维持合规的运行纪律

1. `src/model/` 行为变更 → 同步本文件证据锚点（维护约定，REVIEW 轴按需复核）。
2. 模型行为改动（新用点/prompt/供应商）→ 夹具回放全绿为完成定义（标准 P6）。
3. 依赖升级 → §7.4 流程，本文件 §10-6 为检查点。
4. 架构级变化（引入循环/工具/沙箱需求）→ 停下对照 §5 决策矩阵与 §8 闸门，升级用户裁决。

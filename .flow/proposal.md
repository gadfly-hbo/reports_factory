# 提案：M8 Agent Runtime 合规收敛——对照全局标准逐项审计与补齐

> 来源：2026-10-06 用户指令：「agent runtime 接入标准参考 agents.md 的要求，实际成功案例参考：本地仓库 deep-research 项目」。本文件是 PRD / GRILL / 拆解的根规范源。

## 目标（用户裁定）

把 Report Studio 的模型接入对照全局 AGENT-RUNTIME 标准（`~/.zcode/standards/AGENT-RUNTIME.md`，v1.0 强制标准）做**逐项合规审计与补齐**，以本地 `~/DevWorkSpace/Projects/deep-research` 为成功案例参照。产出必须是**有证据的合规记录**，不是纸面打勾。

## 参照系：deep-research 可迁移模式（审计笔记 2026-10-06）

| 模式 | deep-research 落点 | 迁移判定 |
|---|---|---|
| pi import 单点收敛 | adapters/live.ts 唯一直接 import + 动态加载 | reports-factory 已合规（pi-transport.ts 单点，已核实） |
| 端口接口层 | adapters/types.ts（SearchProvider/ModelProvider…） | 形态不同（我们以 LlmStageClient.complete 为单一入口），实质等价——不强改目录 |
| 瞬时/配置二分 + 熔断 + maxRetries:1 快失败 | modelFailover.ts | 已合规（client.ts TRANSIENT + 熔断 + pi-transport maxRetries:1） |
| 循环内零工具 + stopReason=error 主动重抛 | live.ts | 我们无 runAgentLoop（单发工人）；streamSimple error 事件已主动 throw（已核实） |
| 录制缺键报错不合成 | replay.ts | 已合规（ReplayMissError） |
| run/checkpoint/audit 分账、audit 零内容 | fsStore.ts | 已合规（work/state.json + outbound-log.json + audit-log.json 三账） |
| 预算：显式 > 档位 > 默认，到顶有限交付 | runResearch.ts overBudget | 我们有预算三线（次数/墙钟/轮次）+ 成本次级；「到顶有限交付」语义已由页级回退实现 |
| 领域字典注入（ModuleConfig/questionFramework） | modules/ + evidencePacks | 部分等价（brief.required_boundaries/non_goals + 页绑定材料注入）；需审计确认口径类注入是否充分 |
| 钉版 | pi-ai: "latest"（**反面教材**） | 我们 "0.86.1" 精确钉版，优于参照 |

## 范围（裁定）

1. **逐项审计**：标准 §11 合规清单 8 项 × 现状证据（file:line + 测试锚点），N/A 项逐条论证（无 tool-call 架构下的工具注册表/写门/沙箱），产出 `docs/agent-runtime-compliance.md`（仓库内长期维护文档，含 §9.2 偏差声明）。
2. **缺口修复**：审计发现的实质缺口（预计为加固级，非重构级）逐项修复并带测试。
3. **§10 坑表逐条核对**：已核实 system 并入 user / stream error 主动抛 / cost=0 用次数线 / 无工具故无 toolResult 坑 / 精确钉版；审计补齐剩余项证据。

## 约束

- **substance over form**：只收敛实质合规，不做目录重命名/形态化重构（M5 R4、M7 架构决策延续）。
- **不引入 pi-agent-core**：单发工人架构不变（M5 R4 用户授权偏差延续，§9.2 记档）；本里程碑若审计认为需要循环，升级为升级问题而非静默引入。
- 标准 §11 是验收门：文档中每项必须「合规 / N/A（论证）/ 偏差（已授权）」三态之一，禁止无证据打勾。
- gated dev-flow；技术栈不动（pi-ai 0.86.1 钉版）。

## 否决的备选

- 引入 pi-agent-core 对齐标准字面（§3.1）：无循环需求，M5 R4 决议延续；引入属范围升级需用户单独授权。
- 目录重构为 adapters/core 形态：deep-research 形态不必然可迁移，substance over form。

## 开放问题（GRILL 定）

- 合规文档的颗粒度与维护方式（随代码漂移怎么办）。
- 「领域字典注入」的达标线（现有 brief/材料注入是否算，还是要加口径表装配）。
- 审计发现缺口的修复深度分级（加固 vs 记账后置）。

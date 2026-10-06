# PRD：M8 Agent Runtime 合规收敛

| 文档项 | 内容 |
|---|---|
| 日期 | 2026-10-06 |
| 规范源 | `.flow/proposal.md`（根规范）+ `~/.zcode/standards/AGENT-RUNTIME.md`（§11 验收门）+ deep-research 审计笔记 |
| 模式 | dev-flow gated（项目约定：additive 自批准） |
| 门禁判据 | `npm run verify` 全绿 + 合规文档每项三态带证据锚点 + 边界注入有测试锁定 |

## Problem Statement

M5/M7 两轮接入后，模型面扩大（6 个用点 + 逐页起草 + 单页重生成），但从未对照全局 AGENT-RUNTIME 标准做过**逐项、带证据**的合规审计。用户裁定：以标准 §11 清单为验收门逐项核实补齐，参照 deep-research 成功实现，产出可维护的合规记录。

## Solution

1. **领域边界注入加固**（审计预核发现的实质缺口）：起草（page-draft）与整页重生成（rewrite_page）请求不含 `brief.required_boundaries`——必要边界（「缺货尚未被证明为销售下降主因」类）没进这两条出站路径，模型可能越界陈述。补齐注入并测试锁定（§4.6 达标线：每次调用输入程序装配 + 必要边界全覆盖）。
2. **合规审计文档**：`docs/agent-runtime-compliance.md`——§11 清单 8 项逐项三态（合规 / N-A 正面论证 / 偏差已授权）+ §10 坑表逐条证据 + §9.2 偏差记账（不引入 pi-agent-core 等），每项锚 file:line 与测试名；头部写维护约定（model/ 层变更须同步）。
3. 审计过程中发现的其余加固级缺口随修（架构级缺口升级问用户，不静默）。

## User Stories

1. 作为开发者，我想有一份逐项带证据的合规文档，以便任何时刻能回答「我们的模型接入是否合标」。
2. 作为开发者，我想让必要边界进入全部出站请求，以便模型在起草/重生成时也不越界陈述。
3. 作为维护者，我想让 N/A 项有正面论证（目的→达成机制→证据），以便审计不流于纸面。
4. 作为维护者，我想让偏差有 §9.2 记账与授权链，以便无静默不合规。
5. 作为测试维护者，我想让边界注入有负例测试，以免后续改动悄悄丢掉注入。

## Implementation Decisions

- **D1 边界注入**：`buildPageDraftRequest` 与 `buildPageRewriteRequest` 的 user 载荷加 `boundaries` 字段（来自 `brief.required_boundaries`，未设置则空数组省略）；system prompt 补一句「必须遵守材料边界约束」。workbench 两处调用点传参。replay 键随载荷变化——测试夹具同请求构造器构键（既有模式，自动一致）。
- **D2 合规文档**：三态模板；证据锚点必填；维护约定头部声明；不建 CI 门（约定级，GRILL G1）。
- **D3 缺口分级**：加固级即修；需要引入循环/工具/沙箱的架构级发现 → 停下问用户（不静默，§9.2）。

## Testing Decisions

- 边界注入：单测断言请求构造含 boundaries；负例（未设置时省略字段不破坏键一致性——夹具与生产同构造器）。
- 全量回归零破坏（replay 键变化只影响新构造的夹具）。

## Out of Scope

- 引入 pi-agent-core / 工具面 / 沙箱（架构级，M5 R4 延续）。
- 目录形态重构（substance over form）。
- deep-research 的 evidencePacks/预算档位制迁移（无需求）。

## GRILL 决议（自拷问，全部按推荐执行）

| # | 开放问题 | 决议 |
|---|---|---|
| G1 | 合规文档形态与维护 | `docs/agent-runtime-compliance.md`；头部维护约定「src/model/ 层行为变更的提交须同步更新对应条目证据」；不建 CI 门（避免仪式化），REVIEW 轴按需复核 |
| G2 | §4.6 达标线 | 每次模型调用的输入 100% 由程序装配（无对话记忆依赖）**且** brief 必要边界（required_boundaries）覆盖全部出站路径——据此补 D1 |
| G3 | 缺口修复深度 | 加固级（注入/校验/测试）即修；架构级（循环/工具/沙箱/换栈）停下问用户 |
| G4 | N/A 论证模板 | 「该要求防御的风险 → 本架构下的达成机制 → 证据锚点」三段式，禁止消极论证 |

无升级项。

# Red-Team: M8 Agent Runtime 合规收敛

> 对象：`.flow/proposal.md`（2026-10-06）｜方法：strategy-red-team
> 裁决：**go**（无 kill 标准触发；KA-1/KA-3 为执行纪律硬条件）

## 承重主张

| # | 主张 | 性质 |
|---|---|---|
| C1 | 现有接入大体合规，缺口为加固级（非重构级） | 承重 |
| C2 | §11 清单可用于 N/A 论证（无 tool-call 架构） | 承重 |
| C3 | deep-research 模式可选择性迁移而不引入形态化重构 | 承重 |
| C4 | 合规文档能长期维护（不随代码漂移成废纸） | 承重 |

## Top Kill-Assumptions

### KA-1｜审计流于纸面
- **Claim**：逐项审计有证据支撑。
- **Fails if**：checklist 打勾无 file:line/测试锚点，或 N/A 论证是套话——合规文档本身成了「靠提示词求模型别越界」的文档版。
- **Kill criterion**：REVIEW 轴把「无证据合规项」列为 blocking（自然发生，无需预设）。
- **Cheapest test**：文档每项三态 + 证据链接，REVIEW 专查。

### KA-2｜为合规而重构
- **Claim**：substance over form 约束可执行。
- **Fails if**：审计过程中以「对齐 deep-research 形态」为由重命名目录/改接口形态，引入回归。
- **应对**：提案已明令禁止形态化重构；REVIEW 轴核查 diff 无超范围重构。
- **Kill criterion**：不适用（约束已内建）。

### KA-3｜标准与架构错配硬凑
- **Claim**：无 tool-call 架构下 §4.2/4.3/4.7 可 N/A 论证。
- **Fails if**：论证站不住——例如审计后认为领域字典注入（§4.6）实质缺失却记 N/A。
- **应对**：N/A 必须「该要求的目的在本架构下由何种机制达成」的正面论证，不是「没有工具所以不适用」的消极论证。
- **Cheapest test**：GRILL 对 §4.6 达标线自证（开放问题已列）。

### KA-4｜deep-research 模式照搬过度
- **Claim**：选择性迁移（快失败/分账/缺键报错已就位，其余不搬）。
- **Fails if**：把 runAgentLoop/端口层形态搬进来。
- **应对**：提案否决备选已明令。
- **Kill criterion**：不适用。

## What's Well-Reasoned

- 自查先行：import 单点/钉版/快失败/三账分立/stream error 重抛已逐项核实，提案范围落在实证缺口上，不是想象缺口。
- deep-research 的反面教材（pi-ai: "latest" 未钉版）被明确识别为不应复制。
- 偏差记账（§9.2）延续 M5 R4 授权链，无静默不合规。

## What I Couldn't Assess

- §4.6 领域字典注入的达标线（GRILL 裁决）。
- 审计将挖出的实质缺口清单（这正是本流程的价值所在）。

## Verdict

**go**。条件：KA-1 证据纪律由 REVIEW 轴强制；KA-3 N/A 须正面论证；缺口修复深度分级由 GRILL 定。

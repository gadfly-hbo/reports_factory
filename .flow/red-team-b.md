# Red-Team: B 方案——生成节点工具 Agent 化（runAgentLoop 拴绳循环）

> 评估对象：reports-factory 生成节点（第 4 步）从工人模式（单发 JSON→render）重构为工具 Agent 模式（runAgentLoop + write_file/bash 工具，模型自主写 pptxgenjs 代码渲染）。编辑节点（第 5 步）保持工人模式不变。
> 标准：AGENT-RUNTIME v1.4（2026-10-07），P2 工具 Agent 模式，§8 Agent 启用验收。

## Verdict: **go**

（无 kill criterion 已满足；风险项带约束进 PRD，§8 验收门为最终判定。）

## Top Kill-Assumptions (ranked)

### KA-B1 模型写 pptxgenjs 代码的可靠性（最高风险）
- **Claim**: MiniMax-M3 / mimo-v2.6-flash 能可靠写出可执行的 pptxgenjs 代码（语法正确、API 使用正确、产物可打开）。
- **Steelman**: 两模型都有代码训练数据；pptxgenjs API 相对简单（addSlide/addText/addChart）；skill 可提供代码模板示例；错误时模型可从 bash stderr 自纠（多轮价值）。
- **Fails if**: 模型频繁写出语法错误代码且无法自纠（循环耗尽预算仍失败），或产物 PPTX 损坏不可打开。
- **Evidence to get this week**: 真实单页测试——让模型写一页 pptxgenjs 代码，bash 执行，验证产物可打开且版式合理。至少 3 次成功才继续。
- **Kill criterion**: 3 次真实测试全部失败（代码不可执行或产物损坏）。
- **Cheapest test**: 单页真实调用（非回放），成本 < ¥0.1。

### KA-B2 runAgentLoop 多轮可靠性（mimo 未验证长循环）
- **Claim**: mimo-v2.6-flash 在 5-10 轮工具调用循环中可靠（不丢上下文、不幻觉工具、能消费 stderr 自纠）。
- **Steelman**: §10 坑表 #13 只验证了 4 轮小循环；但 v1.4 P1 明确允许自主循环，§7.5 要求按用途实测——本方案就是实测场景。
- **Fails if**: mimo 在 >5 轮后丢上下文或开始幻觉（调用不存在的工具、重复同一错误）。
- **Evidence to get this week**: §7.5 工具任务验证——记录每轮工具调用+结果，验证模型确实消费了 stderr/stdout 并调整后续行为。
- **Kill criterion**: mimo 连续 2 次在 5 轮内崩溃（不消费工具结果或重复同一错误）。
- **Cheapest test**: 真实调用，观察 AgentEventSink 事件流。

### KA-B3 沙箱隔离（§4.7 宿主落实）
- **Claim**: 模型写的代码在临时目录执行，不污染项目目录，不访问网络/系统资源。
- **Steelman**: 工具白名单只有 write_file（限临时目录）+ bash（限 node render.js）；无网络访问（Node 默认无 fetch）；render 完即删。
- **Fails if**: 模型通过 bash 执行了白名单外操作（如 rm -rf、curl 外网、读 ~/.zshrc）。
- **Evidence to get this week**: 工具调用日志审计——验证所有 bash 命令都在白名单内（node render.js 或 node -e 特定模式）。
- **Kill criterion**: 发现任何白名单外命令执行。
- **Cheapest test**: 审计日志检查（实现后自动）。

### KA-B4 成本失控（P4 资源有界）
- **Claim**: 每页 10 轮/10min/20 次工具调用足够模型写出合格代码，不会频繁触顶。
- **Steelman**: pptxgenjs 一页代码 ~50-100 行，模型通常 2-4 轮可完成（写→执行→修）；10 轮给足余量。
- **Fails if**: 大部分页需要 >10 轮（模型陷入重复错误），导致生成时间不可接受（>5min/页）。
- **Evidence to get this week**: 真实测试记录每页实际轮数，统计分布。
- **Kill criterion**: 中位数轮数 >8（接近上限）。
- **Cheapest test**: 真实调用统计。

### KA-B5 编辑节点可视化（用户新需求）与生成节点重构的耦合
- **Claim**: 编辑节点可视化（页级预览+所见即所得）可与生成节点重构并行，不互相阻塞。
- **Steelman**: 编辑节点用现有 render/pptx.ts 渲染单页预览图（Playwright 截图或 pptxgenjs 的 slideToImage）；与生成节点用 runAgentLoop 无关。
- **Fails if**: 预览渲染依赖生成节点的新版式系统（两节点共用 render 层导致循环依赖）。
- **Evidence to get this week**: 技术方案确认——编辑节点预览用独立渲染路径（render/pptx.ts 的现有能力 + Playwright 截图），不依赖生成节点的 runAgentLoop 产物。
- **Kill criterion**: N/A（设计可解耦）。

## What's Well-Reasoned

- v1.4 P2 明确工具 Agent 是一等公民模式，非例外——B 方案合规路径清晰。
- pi-agent-core 的 runAgentLoop 是批准栈（§3.1），复用而非自写（§6）。
- 编辑节点保持工人模式是正确决策（小修小改不需要多轮循环）。
- 用户已明确授权 B 方案（2026-10-07），方向确定。

## What I Couldn't Assess

- MiniMax-M3 / mimo 写 pptxgenjs 代码的实际能力（需真实测试）。
- 用户对"好看"的具体审美标准（需样张确认）。

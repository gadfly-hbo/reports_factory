# Red-Team: M5 LLM 接入（pi sdk，参照 deep-research 模式）

评审对象：`.flow/proposal.md`（M5 方案，含用户决议 R1–R4）。基线：commit 3934d30，M0–M4 已交付，141 测试全绿。

> 结论先行：**GO**，附两条设计修订进 PRD（K1 砍掉 pi-agent-core、K3 会话批准的泄漏面收窄），一个检查点（K5）。

## Top Kill-Assumptions (ranked)

### K1. 「需要 pi-agent-core 当阶段工人」——五个用点全是单轮任务，引入纯增风险
- **Claim:** 方案架构图隐含照搬 deep-research 的 `runAgentLoop` 阶段工人形态。
- **Steelman:** deep-research 验证过该形态，保持同构降低认知成本。
- **Attack:** 逐个看五个用点：蓝图编排、取舍推荐、提案起草、语义检查、补证建议——全部是"一段输入 → 一段严格 JSON 输出"的单轮任务，无多轮对话、无工具循环。runAgentLoop 的价值（多轮工具协调）用不上，代价（其生态 zod 3 / 类型耦合、S1 已列为头号风险）全担。deep-research 自己的证据抽取也是 streamSimple 直调（live.ts extractWith）。
- **Fails if:** 出现需要多轮/工具的任务（本里程碑没有）。
- **Cheapest test:** 无需测试——这是减法。
- **决议（R4）：** M5 只接 pi-ai `streamSimple`，不装 pi-agent-core；运输层抽象保留，未来多轮需求出现再引入。

### K2. minimax/小米对中文业务编审任务的输出合格率未证实
- **Claim:** 模型版推荐/蓝图质量优于确定性规则（这是做 S3/S4 的理由）。
- **Fails if:** §15 样板 fixture 上 schema 校验通过率低，或频繁因果升格（推荐把推断写成事实）。
- **Cheapest test:** S1 probe 实测 + S4 样板走查（已排入切片）。
- **Kill criterion:** 主备双 provider 均不稳 → 收缩为"只交基础设施 + 蓝图编排（仅结构模式容错最高）"，S4–S6 保留确定性版。不阻塞 M5 交付。

### K3. 会话级批准的泄漏窗口——一次批准覆盖演化中的 payload
- **Claim:** R3（每会话批一次）不会导致用户未预期的外发。
- **Steelman:** 单用户本地工具，被发送的发现文本本来就在编审工作区可见；outboundLog 留痕。
- **Attack:** 批准发生在会话早期，此后用户继续导入成果，后续调用把**用户从未在预览里见过的**新发现文本发出去——"批准时看到的是 A，发出去的还包括 B/C/D"。
- **Fails if:** 审计出现用户明显未预期敏感聚合外发且当时无任何提示。
- **应对（进 PRD 硬约束）：** ①授权摘要模式**只发送编审工作区已可见的发现文本**，绝不构造派生内容；②预览层措辞明示"本会话后续 AI 调用将按同一范围发送新增发现"；③outboundLog 记每次条数（增长可审计）；④敏感级来源（sensitivity=sensitive）的发现排除在授权摘要默认集合外，除非预览中显式勾选。
- **Cheapest test:** L 系列加一条：新导入后第二次调用，断言 outboundLog 条数增长且 UI 曾有范围提示。

### K4. 模型推荐被当成权威——措辞与交互暗示客观性
- **Steelman:** 已有"草案/模型辅助"标注、excluded 粘性、人批准控件。
- **Attack:** 残余风险在自然语言措辞（推荐理由的确定性口吻）。已有 T12 因果升格检查兜底 + L9 验收。
- **结论:** 可控，不构成 kill-assumption；写入 S4 走查检查单。

### K5. 范围——7 片 × 5 用点 × 3 个页面
- **Steelman:** 仓库纪律强（M4 同规模 8 片交付），运输层一次建好用点边际成本低。
- **Fails if:** S3 结束时录制/重放基建仍不稳。
- **检查点（不改变已确认的全量范围）：** S3 退出时评估——基建不稳则 S4–S6 收缩为确定性版 + 基础设施交付，向用户明示。
- **Cheapest test:** S1 一天内出 probe 结果即为先行指标。

### K6. zod 4 / TS 5.9 与 pi-ai 的编译摩擦
- **Steelman:** pi-ai 是纯模型 HTTP 层，依赖面窄。
- **Fails if:** 类型无法隔离在 client.ts（编译污染全局）。
- **最后手段（架构不变）：** 弃 pi-ai、按其协议直连 provider HTTP（minimax 是 openai-completions 形态，成本低）；两层缝设计不因此改变。
- **Cheapest test:** S1 首个编译即见分晓。

## What's Well-Reasoned

- **两层缝分离**（能力缝挂审批 / 运输缝挂 provider 链）：比 deep-research 的合并式更适合有隐私分级的场景，出站治理有了明确挂点。
- **确定性兜底列为验收项（L4/L8）而非注释**：与仓库"缺数据不伪造、模型不可用不阻塞"纪律同构。
- **白名单 payload 构造 + 真实项目禁录制**：泄漏面控制是认真的——录制文件含出站原文这条 deep-research 没有的纪律是对的。
- **会话批准实现为进程内集合、重启失效**：安全默认方向正确（重启多批一次比持久授权安全）。

## What I Couldn't Assess

- minimax/小米结构化 JSON 实际遵从率、流式稳定性——需 S1 probe 实测。
- pi-ai 在 zod4/TS5.9 下的真实编译摩擦——S1 首个编译见分晓。
- 模型版推荐相对确定性版的真实增益——S4 样板走查 + 真实使用才能回答；这也是保留确定性版为默认兜底的理由。

## Verdict

**GO**。修订进 PRD：①R4 不引 pi-agent-core（已入方案 §7）；②K3 四条泄漏面收窄为硬约束；③S3 后设继续/收缩检查点（不改变全量范围决议）。

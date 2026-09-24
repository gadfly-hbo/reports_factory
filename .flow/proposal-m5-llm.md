# Report Studio M5 方案｜LLM 接入（pi sdk + agent runtime，参照 deep-research 模式）

| 文档项 | 内容 |
|---|---|
| 文档日期 | 2026-09-24 |
| 性质 | 里程碑增量方案（设计稿，供评审；不代表已实现） |
| 参照系 | deep-research 的 runtime 模式：pi-ai 模型层 + pi-agent-core 阶段工人 + 适配器录制/重放 + 主备熔断 |
| 硬边界 | 方案 v1.0 §4 职责表、§12 变更控制、§14 本地优先与隐私三分模式不因接入而松动 |

> **设计主张：模型进的是"理解与表达"的位置，走的是确定性代码管住的通道。** 编排器保持确定性，模型只当阶段工人；一切输出落在推荐/提案/提示层，经人确认 + 程序约束（版本/锁/原子应用）才生效；模型不可用时所有主流程照常（确定性兜底是硬性验收项）。

## 1. 现状与缺口

仓库当前零 LLM 依赖、零 agent runtime：`ModelGateway` 单方法接口（composeOutline）唯一实现是确定性模板网关；`PrivacyGate` 已实现但无外部网关可包。五个 LLM 用点中仅蓝图编排接口化，其余为确定性占位（详见本次会话分析）。

deep-research 已验证的模式（照搬其骨架）：pi-ai 流式模型层（多 provider、自定义 baseUrl）、runAgentLoop 当无工具阶段工人、适配器录制/重放离线测试、主备链路 + 瞬时错误熔断、密钥仅环境变量 + 启动器注入、严格 JSON 阶段提示词 + 编排器 schema 校验。

## 2. 架构：两层缝，各管一件事

```text
UI / API（编审、组装、检查页）
        │
WorkbenchService（确定性编排，全部既有程序约束不变）
        │
ModelGateway（能力缝：这个用点允许模型做什么；PrivacyGate 在此拦截出站）
  ├─ deterministic（现有，全部用点的兜底实现）
  └─ piGateway（新增：蓝图编排/取舍推荐/提案起草/语义检查/补证建议）
        │
ModelClient（运输缝，新增 src/model/client.ts：怎么调模型）
  ├─ pi-ai 流式（provider 链主备 + 熔断 + 超时）
  ├─ payloadBuilder（出站内容构造：两种脱敏模式，见 §4）
  ├─ recording/replay（录制/重放，测试离线化）
  └─ outboundLog（只记元数据：provider/model/字节数/cost/时间，永不记内容）
```

**为什么不合并成一层**：deep-research 的 `ModelProvider` 把两件事合在一起（它没有隐私分级问题）；报告工厂必须把"允许模型参与什么决策"（gateway 层，接 PrivacyGate 审批）与"用什么模型怎么调"（client 层，接 provider 链）分开，否则出站治理没有挂点。

## 3. 关键决策

### D1 SDK 选型
`@earendil-works/pi-ai` + `@earendil-works/pi-agent-core`，**锁定精确版本**（deep-research 用 latest 是它的风险，不照抄）。zod 兼容性（本仓库 zod 4 vs 其生态 zod 3）在 S1 tracer 验证；pi sdk 类型不漏出适配器边界。

### D2 接口扩展（全部可选方法，确定性兜底）
```ts
interface ModelGateway {
  id: string; external: boolean;
  composeOutline(ctx, opts?): Promise<OutlineDraft>;                    // 已有
  recommendPlacements?(brief, findings, decisions): Promise<Recommendation[]>;   // ②
  draftChangeProposal?(intent, spec): Promise<{ op: EditOp; note: string }>;      // ③
  semanticChecks?(spec): Promise<SemanticFinding[]>;                    // ④
  suggestEvidenceGaps?(spec, findings): Promise<GapSuggestion[]>;       // ⑤
}
```
调用点统一 `modelFirst(gateway.pi, gateway.deterministic)` 助手：模型方法缺失/抛错/超时 → 确定性等价物 → 无等价物则该功能入口置灰（主流程不受阻）。

### D3 出站内容分级（payloadBuilder，本方案与 deep-research 最大的差异点）
deep-research 发的是公开网页文本，可以随便发；报告工厂发的是业务材料。按项目 `privacy_policy` 映射：

| 模式 | 出站内容 | 覆盖的用点 |
|---|---|---|
| 本地或手动（local_only） | 什么都不发——AI 入口不出现 | — |
| 仅结构（with_approval，默认批准级别） | 任务书字段、页型枚举、资产类型清单（kind/数量/列名）、占位符；**claim 原文与表格数值一律不出站** | 蓝图编排 |
| 授权摘要（with_approval + 显式批准） | 用户可见并批准的发现文本 + 必要聚合值 | 取舍推荐、提案起草、语义检查、补证建议 |

白名单式构造（不是"整体塞进去再脱敏"）；每次调用的 payload 描述符（片段类别/条数/字节量）可先查后发（§13.3"调用前可查看"）。

### D4 出站预览与批准流
UI 在首次 AI 调用前弹预览层（将发送什么、给哪个模型、预计成本量级），确认后以 `opts.approval: 'approved-by-user'` 注入 PrivacyGate——沿用既有语义（每次调用需批准），不发明新审批机制。

### D5 provider 链与熔断
移植 deep-research `modelFailover.ts`（瞬时错误正则 + 2 次熔断 10 分钟冷却）。链配置 env：`REPORT_STUDIO_MODEL_CHAIN`（如 `minimax-cn/<model>,xiaomi-token-plan-cn/<model>`），密钥 `*_API_KEY` 环境变量，启动器新增 `scripts/with-model-env.sh`（镜像 with-minimax-env.sh，从本机凭据注入）。超时 `REPORT_STUDIO_MODEL_TIMEOUT_MS` 默认 120s（交互场景），超时按瞬时错误切备用/兜底。

### D6 模型输出的程序约束（不变式）
- ③提案起草：模型输出经 `EditOpSchema` zod 强校验 + `expected_revision` 在起草时刻捕获，走**既有 /propose 单一控制器**（锁/范围/原子应用/审计零改动）；模型没有任何直写 spec 的通道。
- ④语义检查：只产 `warning`（新 category: 'semantic'），永不进 blockers，导出门禁不受影响；UI 标"模型辅助"，与确定性检查分列（§7.8 分别记录）。
- ②取舍推荐：输出即推荐草案；用户已有 excluded 决定保持粘性，模型不翻案（复用 T06 语义）；"仅相关性证据不升格为因果"的措辞降级约束写进阶段提示词 + 既有 T12 检查兜底。
- 所有阶段输出 zod schema 校验 + 鲁棒解析（deep-research draftFromText 模式），不合格即降级。

### D7 录制/重放与验收
ModelClient 层套 recording/replay 装饰器（deep-research 同款）。**录制内容约束**：录制模式只允许配合合成 fixture（样例零售数据），禁止对真实业务项目开录制——录制文件会含出站原文。全部测试离线（replay + 确定性兜底断言），live 冒烟走 `scripts/probe-model.mjs` 手动触发。

### D8 验收用例（L 系列，衔接 §17 T 系列）

| 编号 | 输入或动作 | 预期行为 |
|---|---|---|
| L1 | local_only 项目使用任何 AI 入口 | 入口不出现/调用被 PrivacyGate 阻断并记录；规则版功能照常（T18 语义） |
| L2 | with_approval 首次 AI 调用 | 先见出站预览（片段类别/条数/目标模型），批准后调用；拒绝则回退规则版 |
| L3 | 仅结构模式抓录制文件 | payload 断言：零 claim 原文、零表格数值；仅结构字段与清单 |
| L4 | 模型输出非法/超时/断网 | 自动降级确定性实现，UI 提示"已用规则版"，主流程零阻塞 |
| L5 | 主 provider 持续 429（replay 模拟） | 备用接管；连续失败进入熔断冷却，冷却期内直接跳过 |
| L6 | 对锁定字段发起自然语言修改 | 提案被既有锁检查拒绝（422），模型输出不绕过锁 |
| L7 | 模型推荐与用户 excluded 决定冲突 | sticky 保持，不自动翻案（T06） |
| L8 | 全程无密钥/断网 | 独立闭环回归全绿（既有 139 测试不破坏），项目可打开可手动编辑可导出 |
| L9 | 语义检查产出 | 仅 warnings 计数，blockers 不变，导出门禁行为不变 |
| L10 | CI/本地全量测试 | 离线绿：无网络、无密钥依赖（录制重放 + 确定性路径） |

## 4. 切片（7 片，tracer-bullet，延续 ≤8 纪律）

| # | 切片 | 退出条件 |
|---|---|---|
| S1 | ModelClient 运输层：pi-ai 流式 + provider 链 + 熔断 + 录制/重放 + probe 脚本 | 合成 fixture 真实调用一次成功并录制；replay 离线测试绿；zod 兼容确认 |
| S2 | 出站治理：payloadBuilder 两级脱敏 + 预览描述符 API + outboundLog 扩展（cost/provider） | L3 断言过；预览 API 可列出将发送片段 |
| S3 | 蓝图编排接入：piGateway.composeOutline（仅结构模式）+ 兜底 + 编审页 AI 入口与预览弹层 | L1/L2/L4 过；golden 零漂移（确定性路径不变） |
| S4 | 取舍推荐接入（授权摘要）：模型版 + 规则兜底 + UI 开关 | L2/L4/L7 过；§15 样板模型版人工走查记录 |
| S5 | 自然语言→变更提案：意图→EditOp 草案（强校验）→复用 /propose + 组装页输入框 + 差异确认 | L4/L6 过；提案审计留痕含"模型起草"标记 |
| S6 | 语义检查通道 + 补证建议：warning-only + 模型辅助标注 + EvidenceRequest 草稿生成 | L9 过；检查记录区分确定性/模型 |
| S7 | 设置与收口：模型链配置与健康检查、降级提示、with-model-env.sh、README、冒烟扩步骤 | L1–L10 全过；verify + 回归 + 冒烟全绿 |

依赖链：S1 → S2 → S3 → S4 → S5 → S6 → S7（S4–S6 依赖 S2 的授权摘要通道；相互可微调顺序）。

## 5. 风险

| 风险 | 应对 |
|---|---|
| pi sdk 生态 zod 3 vs 本仓库 zod 4 | S1 tracer 首验；类型隔离在 client.ts 内，必要时局部 alias |
| 模型输出不稳定/超编 | schema 强校验 + 鲁棒解析 + 确定性兜底（deep-research 已验证的三件套），验收 L4 |
| 业务材料泄漏 | 白名单 payload 构造 + 录制断言（L3）+ outboundLog 零内容 + 真实项目禁录制 |
| 成本失控 | 每次调用记 cost（outboundLog），预览层展示；熔断防重复烧超时 |
| 功能被当成"AI 全自动"误导 | UI 全部标注"模型辅助/草案/建议"，批准与确认控件是人的动作（§4 职责表） |

## 6. 明确不做（本里程碑）

- 流式输出到 UI（v1 整段返回；流式留 S7 后评估）
- 多 Agent 协作/工具调用型 agent loop（阶段工人无工具，编排器确定性调工具——沿用 deep-research 结论）
- 模型参与导出门禁判定、数字复算、冲突仲裁（确定性专属，永久）
- Xanthil 侧分析 Agent 接入（上游边界外）

## 7. 评审决议（2026-09-24，用户确认）

| # | 决议 |
|---|---|
| R1 | **范围：五个用点一次做完**（S1–S7 全量；红队 K5 的 S3 检查点保留为风险应对，不改变范围） |
| R2 | **模型链：minimax 主 + 小米备**（具体 model id 由 S1 probe 实测后 pin 入默认配置与 README） |
| R3 | **批准粒度：每次会话/任务批准一次**（同项目重复调用不反复弹窗；实现为 Workbench 进程内批准集，服务重启失效即重新批准——安全默认；预览层明示后续调用按同一范围发送新增内容，outboundLog 记每次条数供审计） |
| R4 | **M5 不引入 pi-agent-core**（红队 K1：五个用点全是单轮结构化输出，只接 pi-ai streamSimple；多轮 loop 留给真实需求出现时） |

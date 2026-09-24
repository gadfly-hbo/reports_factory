# M5｜LLM 接入 — 任务拆解（tracer-bullet 垂直切片）

- [x] 1. S1 运输层 ModelClient（pi-ai + 主备熔断 + 录制/重放 + probe）
- [x] 2. S2 出站治理（payloadBuilder 两级脱敏 + 会话批准 + outboundLog）
- [x] 3. S3 蓝图编排接入（piGateway.composeOutline + 编审页 AI 入口）【退出时 K5 检查点】
- [x] 4. S4 取舍推荐接入（授权摘要 + 规则兜底 + 来源标识）
- [x] 5. S5 自然语言→变更提案（起草→既有 /propose + 组装页入口）
- [x] 6. S6 语义检查 + 补证建议（warning-only 通道 + EvidenceRequest 草稿）
- [ ] 7. S7 设置/启动器密钥注入 + 冒烟 + 回归收口

---

## S1｜运输层 ModelClient

### Parent
`.flow/prd.md`（D1；红队 K1/K6；R2 模型链、R4 不引 pi-agent-core）

### What to build
`src/model/client.ts`：`LlmStageClient.complete(stage, payload, schema)` 单一入口。pi-ai `streamSimple` 直调（按 model.api 动态 import anthropic-messages/openai-completions 适配）；provider 链 env `REPORT_STUDIO_MODEL_CHAIN` 按序尝试，瞬时错误（移植 deep-research 正则判定）切备用，2 次熔断冷却 10 分钟，全链失败抛 `ModelUnavailableError`；超时 env 默认 120s；密钥仅 env。recording/replay 装饰器：录制仅在 `REPORT_STUDIO_RECORD=1` 且输入来自合成 fixture 时启用。`scripts/probe-model.mjs` 手动探针（连通性 + schema 遵从率）。pi 类型零漏出，输出经本地 zod parse。tracer：合成 fixture 真实调用 minimax + 小米各一次并录制，zod4/TS5.9 编译确认（K6：不行则弃 pi-ai 直连 HTTP，架构不变）。

### Acceptance criteria
- [ ] 合成 fixture 真调成功并产出录制文件；replay 离线重现同一输出
- [ ] 主 provider 429（replay 模拟）→ 备用接管；连续失败熔断冷却内直接跳过
- [ ] 全链失败 → ModelUnavailableError（含各 provider 错误摘要）
- [ ] 全量测试离线绿（无网络无密钥）；pin 默认 model id 入 README

### Blocked by
None - can start immediately

---

## S2｜出站治理

### Parent
`.flow/prd.md`（D2；红队 K3 四条硬约束）

### What to build
`buildPayload(mode, ctx)` 白名单构造：structure-only（任务书字段/页型枚举/资产 kind 清单/占位符）/ authorized-summary（编审工作区已可见发现文本 + 必要聚合；sensitive 来源默认排除、预览可显式勾选）。会话批准：Workbench 进程内 `Set<projectId|mode>`，预览描述符 API（类别/条数/模型/累计 cost）→ 批准写入 → 同会话同项目同模式不再询问；重启清空。outboundLog → 项目 `work/outbound-log.json`（append：provider/model/条数/字节/cost/时间，零内容，随 data 同步）。项目详情带 `capabilities: { modelAvailable, policyMode, sessionApproved }`。

### Acceptance criteria
- [ ] L3：structure-only payload 断言零 claim 原文、零表格数值
- [ ] L2：with_approval 首次调用前必须批准；批准按 projectId|mode 分；拒绝→不调用
- [ ] sensitive 来源发现不入默认授权摘要集合
- [ ] outboundLog 零内容断言；条数随调用增长可审计（K3）
- [ ] local_only → capabilities 标记不可用，AI 入口数据为 false

### Blocked by
- S1

---

## S3｜蓝图编排接入（退出时 K5 检查点）

### Parent
`.flow/prd.md`（D3/D4；仅结构模式）

### What to build
piGateway 实现 `composeOutline`：structure-only payload → 模型 JSON → zod 校验映射 OutlineDraft（页型枚举强校验）→ 非法/超时/不可用自动回退确定性网关 + 响应标记 `usedFallback`。workbench 编排：批准检查（PrivacyGate 语义沿用）→ payload 构造 → 调用 → 兜底。编审页「AI 生成蓝图」入口（capabilities 驱动渲染）+ 首次调用预览弹层（G6：与现有生成行为一致，草稿待确认）。冒烟以 replay 模式覆盖 AI 路径（G8）。

### Acceptance criteria
- [ ] L1：local_only 入口不渲染/调用被阻断
- [ ] L2：预览→批准→调用；拒绝→回退规则版
- [ ] L4：模型非法输出/超时/不可用 → 自动确定性兜底 + usedFallback 标记 + UI 提示
- [ ] 确定性路径输出不变（golden 零漂移、既有测试全绿）
- [ ] K5 检查点：录制/重放基建评估通过 → 继续 S4；不稳 → 上报用户收缩

### Blocked by
- S2

---

## S4｜取舍推荐接入

### Parent
`.flow/prd.md`（D3/D4；授权摘要）

### What to build
piGateway `recommendPlacements`：authorized-summary payload（发现文本+验证状态+限制/反证+任务书）→ 推荐 JSON（placement+reason）→ 校验。规则版保持默认；编审区「AI 推荐取舍」显式点选，来源标签（AI 推荐/规则推荐，G4）；excluded 粘性对模型版生效（模型推荐不翻案）。阶段提示词含措辞纪律（不升格因果，T12 兜底）。§15 样板对双 provider 走查并记录（K2 证据：schema 通过率/升格次数）。

### Acceptance criteria
- [ ] L7：用户 excluded 决定不被模型推荐翻案（sticky）
- [ ] L4：兜底链路 + 来源标签正确显示
- [ ] L2：authorized-summary 首次调用独立批准（G2 按 mode 分）
- [ ] §15 走查记录入 .flow（K2 检查点证据）
- [ ] L9：推荐不改变任何检查结果

### Blocked by
- S3

---

## S5｜自然语言→变更提案

### Parent
`.flow/prd.md`（D4；G7/G10）

### What to build
piGateway `draftChangeProposal`：`intent + spec 快照` → `{op, note}` → `EditOpSchema` 强校验 + 起草时刻捕获 expected_revision → 进**既有 /propose**（锁/版本/原子/审计零改动），审计标 `source: 'model-draft'`。组装页自然语言输入框（capabilities 驱动；无模型隐藏+提示手动路径，G10）→ 提案差异确认（复用 proposal-diff UI）。

### Acceptance criteria
- [ ] L6：对锁定字段的自然语言修改 → 既有 422 拒绝，模型不绕过锁
- [ ] L7/G7：起草后修订前进 → 409 stale，草案不豁免
- [ ] L15/US15：审计留痕含 model-draft 标记
- [ ] L10：无模型时输入框隐藏，手动编辑路径不受影响

### Blocked by
- S4

---

## S6｜语义检查 + 补证建议

### Parent
`.flow/prd.md`（D4；G3/G5）

### What to build
piGateway `semanticChecks`：检查页手动「运行模型辅助检查」按钮 → authorized-summary payload（spec 摘要+发现）→ findings JSON → `warning` + category `semantic` CheckIssue 并入 CheckReport（永不 blocker，分列标"模型辅助"；G3 不持久化独立对象）。piGateway `suggestEvidenceGaps` → EvidenceRequest 草稿（state=draft，用户编辑后照常批准流）。

### Acceptance criteria
- [ ] L9：语义 findings 仅 warnings，blockers 与导出门禁行为不变
- [ ] 检查页区分确定性/模型辅助结果
- [ ] 补证建议生成 draft 请求；T16/T17 既有幂等与批准流不受影响
- [ ] L4：模型不可用 → 按钮置灰/提示，确定性检查照常

### Blocked by
- S5

---

## S7｜设置/启动器/收口

### Parent
`.flow/prd.md`（D5/D6；G5/G9）

### What to build
`scripts/with-model-env.sh`（本机凭据注入，镜像 with-minimax-env.sh）；设置页模型链/密钥状态/本会话累计 cost 展示；README（M5 能力、模型配置、隐私模式说明）；冒烟扩 AI 步骤（replay 驱动）；全量收口。

### Acceptance criteria
- [ ] L1–L10 全过（含 K3 条数增长审计条目）
- [ ] `npm run verify` + 回归零漂移 + 冒烟全绿；全测试离线
- [ ] README 更新；无密钥环境完整手动闭环回归

### Blocked by
- S6

---

依赖链：S1 → S2 → S3（K5 检查点）→ S4 → S5 → S6 → S7（严格线性）

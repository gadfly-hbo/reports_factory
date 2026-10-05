# 模版驱动一键生成 — 任务拆解（tracer-bullet 垂直切片）

- [x] 1. S1 模版注册表与模版选择（3 模版 + 结构预览 UI）
- [x] 2. S2 一键生成管线（确定性全管线 + 进度 + 断点续跑）
- [x] 3. S3 单页编辑补全（body 直改 + 结构操作 + delete_page 新 op）
- [x] 4. S4 审核审批主路径（导出前体检 + G1 + 内/外审批导出）
- [x] 5. S5 围栏收口前置（预算三线封顶 + 会话批准持久化 + 生成/AI 审计事件）
- [x] 6. S6 LLM 整页重生成（rewrite_page 最小 op + 数字护栏 + 差异确认）
- [x] 7. S7 图片编辑——**按 GRILL G4 决议后置（本期不做）**，独立立项

---

## S1｜模版注册表与模版选择

### Parent
`.flow/prd.md`（D1、G1、story 1、18）

### What to build
模版注册表（schema：id/name/description/deliverable_type/page_plan/brand 预设），首批 3 模版：经营复盘 deck、执行摘要 deck、研究报告 doc，page_plan 映射既有 composeOutline 两条主线。API 返回模版列表；项目创建/生成入口可选模版；选择 UI 含页型序列结构预览与适用场景说明。不做任意模版导入设计器（M3 红线）。tracer：从选择页选定模版 → 项目带上模版标记 → 可见结构预览。

### Acceptance criteria
- [x] 3 模版注册并可列出，page_plan 映射到既有页型枚举（非法页型注册被拒）
- [x] 选择 UI 显示结构预览（页型序列）与适用场景
- [x] 项目持有模版引用，缺省回退经营复盘 deck
- [x] 测试断言注册表校验与 API 契约

### Blocked by
None - can start immediately

---

## S2｜一键生成管线

### Parent
`.flow/prd.md`（D2、G2、story 2–4、17）

### What to build
`POST /api/projects/:id/generate`：ingest（幂等复用）→ outline（确定性 composeOutline 按模版 page_plan）→ assemble（确定性）→ checks（确定性）→ 成稿可编辑状态。全确定性、零模型调用、禁 tool-call 循环。每阶段落 checkpoint（阶段/产物/失败原因），失败停在明示断点，支持从失败阶段续跑。进度 UI（阶段条 + 当前阶段文案 + 停点原因）。tracer：真实项目一键从材料到可编辑成稿。

### Acceptance criteria
- [x] 一键调用产出完整成稿（页序/claim 绑定/必要边界注入与手动组装结果一致）
- [x] 默认路径零模型调用（测试断言 transport 未被触达）
- [x] 失败停在断点并明示原因；续跑从失败阶段继续，不重复已完成阶段
- [x] 进度 UI 展示当前阶段与停点
- [x] 既有回归 golden 不漂移

### Blocked by
- S1（模版 page_plan 决定大纲）

---

## S3｜单页编辑补全

### Parent
`.flow/prd.md`（D3、G5、G6、story 5、8）

### What to build
UI 补 body 直改入口（EditOp edit_text body 已支持）；结构操作 UI 补全（reorder/switch_layout/split_page）；新增 `delete_page` EditOp（同走 /propose 控制器：expected_revision 409、锁、原子应用、审计）。删除前差异确认（列出被删页 headline）。tracer：成稿上直改正文、调页序、删页并撤销不了也不丢审计（修订历史可追溯）。

### Acceptance criteria
- [x] body 直改走 /propose，锁与 409 行为不变
- [x] delete_page：白名单校验、差异确认 UI、审计记录 source、修订历史可追溯
- [x] 结构操作（换版式/拆页/页序）UI 可用且走控制器
- [x] 既有编辑测试全绿 + 新 op 负例（删不存在页 400、锁页拒绝）

### Blocked by
- S2（需要生成的成稿）

---

## S4｜审核审批主路径

### Parent
`.flow/prd.md`（D5、story 10–12）

### What to build
导出前一键体检入口（checks 全跑 + 问题清单可视化，blocker/warning 分列）；主路径审批关口整理：G1 签批（批准人/冻结快照）→ 内用/外发选择（exportScope）→ 外发需 ack_external_share 显式勾选 + 隐私检查 → 导出四格式。既有机制零改动，只做主路径 UI 整理（五阶段降级为高级入口）。tracer：成稿 → 体检全绿 → G1 签批 → 外发勾选 → 导出 PPTX。

### Acceptance criteria
- [x] 体检清单展示 blocker/warning，blocker 未清拦正式导出
- [x] G1 未批准仅【草稿】可导出（既有行为保持）
- [x] 外发未勾选 ack_external_share 被拦；勾选后隐私检查生效
- [x] 内用导出不需外发勾选
- [x] 四格式导出回归 golden 零漂移

### Blocked by
- S2（需要成稿才能体检/审批/导出）

> 缺口声明：What-to-build 中的「五阶段降级为高级入口/内部细节收进二级面板」（PRD D7、story 18）本期未交付，作为壳层重构独立立项。

---

## S5｜围栏收口前置

### Parent
`.flow/prd.md`（D6、G4、story 14–16、19–20；红队 KA-3）

### What to build
预算三线封顶（次数/墙钟/轮次，默认 50 次/30 分钟/20 轮，env + 项目级配置可覆盖）挂 gateOrThrow 同一挂点，超帽停在阶段边界/单页操作前并明示；成本仅次级展示。会话批准持久化（projectId|mode + 批准时间入 workspace，重启不失效，新项目/新模式仍弹预览）。审计：生成管线阶段事件 + AI 调用 + 门决策追加零内容审计流。tracer：配置预算 2 次调用 → 触发 AI 入口 → 第 3 次被拦并明示。

### Acceptance criteria
- [x] 三线各自超帽被拦（负例测试）；成本线不作为阻断依据（负例测试）
- [x] 批准持久化：重启后不重复弹预览；新项目/新模式仍弹
- [x] 审计事件含阶段/调用/门决策元数据，零内容断言通过
- [x] P6：record → replay 回放闭环覆盖生成管线与 AI 调用

### Blocked by
- S2（管线事件源来自生成管线）

---

## S6｜LLM 整页重生成

### Parent
`.flow/prd.md`（D3、G4-C、story 6–7、17；红队 KA-2 降级应对）

### What to build
扩展现有 ai-proposal（现仅 headline）到整页最小 op `{ headline, bullets, table_note? }`：prompt 约束 + zod 强校验 + page_id 白名单双防线；经 /propose 确认应用（source: 'model-draft'，差异逐条展示）。UI：单页卡片上「LLM 重生成」入口（提示词输入 → 出站预览/批准 → 草案差异 → 确认应用）。模型不可用自动回退并明示（无整页确定性等价时提示手动编辑路径）。tracer：提示词「精简第 3 页要点」→ 差异视图 → 确认应用。

### Acceptance criteria
- [x] 整页 op 过 zod 校验；发明 page_id、越权字段（数字/表格数值改动）被拒
- [x] 应用前差异逐条展示，未确认不落库
- [x] 出站 payload 白名单断言（结构/授权摘要分级不变）
- [x] 模型不可用回退明示，主流程零阻塞
- [x] 回放测试覆盖整页重生成链路

### Blocked by
- S3（单页编辑操作面）、S5（预算/批准/审计收口先行）

---

## S7｜图片编辑（优先级最后）

### Parent
`.flow/prd.md`（D4、G4-F、story 9）

### What to build
PageSchema 增 image 字段（资产引用 + 位置占位）；插入/替换/移除操作（走 /propose 控制器）；三端渲染适配（pptx addImage / html / docx）。图片材料仍不解析（无 OCR 延续）。tracer：上传图片插入指定页 → 三格式导出均含图。

### Acceptance criteria
- [ ] 插入/替换/移除走控制器，审计留痕
- [ ] pptx/html/docx 三端渲染出图（render-contract 断言）
- [ ] 图片材料无解析行为不变

### Blocked by
- S3（编辑操作面）

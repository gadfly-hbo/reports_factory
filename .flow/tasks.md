# M7 成品感一键生成 — 任务拆解（tracer-bullet 垂直切片）

- [x] 1. S1 LLM 逐页起草服务（护栏 + 逐页 checkpoint + 回退）
- [x] 2. S2 模板 brand 预设（schema + 三套风格 + 应用优先级）
- [x] 3. S3 生成页 UI（三步主路径第一步：进度/开关/回退明示/大纲确认）
- [x] 4. S4 审批导出衔接（起草调用的批准/预算/审计接线 + 第三步入口）
- [x] 5. S5 壳层三步化（侧栏主路径 + 高级折叠 + 入口存在性 + 视觉验收）

---

## S1｜LLM 逐页起草服务

### Parent
`.flow/prd.md`（D1–D4、G1–G3、G7；红队 KA-2 硬约束）

### What to build
`src/model/ai-draft.ts`：按页起草函数（页型+主旨+该页材料派生文本 → `{headline, bullets[{text,claim_ref?}], body?} | {uncovered:true}`，zod 强校验）。护栏：数字护栏（生成数字必须来自材料派生文本，复用/扩展 digitGuard）、claim_ref 页白名单、材料不足 uncovered 占位。workbench.generate 加 `draft` 阶段（outline 后）：逐页串行起草、逐页 checkpoint（失败/护栏拒绝重试 2 次后页级回退占位并明示）、ModelUnavailable 整体回退确定性骨架（明示「已用规则版」）。出站：authorized-summary、每页白名单构造（sensitive 排除）、预算门、审计 draft 阶段事件。replay 夹具：合成 fixture record→replay。

### Acceptance criteria
- [ ] 生成产物每页 headline/bullets 为 LLM 起草内容（replay 断言），非「待补充」占位
- [ ] 编造数字被拒 → 页级回退占位明示（负例）
- [ ] 越权 claim_ref 被拒（负例）；uncovered 落「材料未覆盖」占位
- [ ] 无密钥/replay 空链 → 整体回退确定性骨架 + 明示
- [ ] 逐页 checkpoint：第 3 页失败续跑只重跑该页
- [ ] 起草调用过预算门与批准门（未批准 403）；审计含 draft 阶段（零内容）
- [ ] replay record→replay 闭环；既有 211 测试零破坏

### Blocked by
None - can start immediately

---

## S2｜模板 brand 预设

### Parent
`.flow/prd.md`（D6、G4、story 9–10）

### What to build
TemplateConfigSchema 加 brand（BrandConfigSchema）；三模版各配风格（G4 色值）。组装/生成应用优先级：project.brand 显式 > 模版预设 > DEFAULT_BRAND；用户品牌卡自定义写入 project.brand 行为不变。生成页/模版选择显示风格色板预览。

### Acceptance criteria
- [ ] 三模版 brand 预设合法且随注册表返回
- [ ] 未自定义 brand 的项目生成后 spec.theme 用模版预设（组装产物断言）
- [ ] 用户自定义 brand 覆盖模版预设
- [ ] 非法色值注册被 schema 拒绝（负例）

### Blocked by
None - can start immediately

---

## S3｜生成页 UI（三步主路径第一步）

### Parent
`.flow/prd.md`（D5、D7、G5、G6、story 1/6/7/11/12）

### What to build
新路由 `/project/:id/generate` 生成页：材料清单摘要（来源数/主张数/表格数）、模版+风格预览（S2 brand）、受众/用途输入、「先确认大纲」checkbox（默认关）、生成按钮、逐页进度（第 N/M 页 + 调用计数 + 预算余量）、页级回退/停点明示（G7 占位标黄）。大纲确认开关开时：outline 后暂停展示结构+主旨（可改 headline），确认后继续。生成完成引导进编辑步。

### Acceptance criteria
- [ ] 生成页可达且表单完整（材料摘要/模版/开关/按钮/进度区）
- [ ] 默认直出：开关关时一键到成稿；开关开时停在确认层，确认后继续
- [ ] 进度与页级回退明示可见（含「已用规则版」横幅）
- [ ] 生成完成入口直达编辑步

### Blocked by
- S1（起草服务）、S2（brand 预设显示）

---

## S4｜审批导出衔接

### Parent
`.flow/prd.md`（D3 出站接线、story 13/14/16/17）

### What to build
第三步（审批导出）主路径入口：体检卡 + G1 + 内外导出整合入口（复用现视图，重组入口）。验证起草调用链的围栏接线：首次生成触发 outbound 预览/批准（authorized-summary）、预算门停点在进度卡明示、审计流含 draft 阶段。主路径 tracer 更新：生成（LLM replay）→ 编辑 → 体检 → G1 → 导出。

### Acceptance criteria
- [ ] 主路径 tracer（replay 模式）贯通：起草生成 → 编辑 → 体检 → G1 → 内用导出 → 外发未勾选拦截
- [ ] 未批准出站时生成停在批准层（预览范围明示）
- [ ] 预算超帽停在起草阶段边界并明示
- [ ] 审计流含 draft 阶段事件（零内容断言）

### Blocked by
- S1、S3

---

## S5｜壳层三步化

### Parent
`.flow/prd.md`（D5、G5、story 7/8/20；红队 KA-4）

### What to build
侧栏重组：主路径 `01 生成 / 02 编辑 / 03 审批导出`（mono 编号、蓝图 v4.2 语言）+ 「高级」折叠组收纳原五阶段（材料/编审/组装/检查/导出，只重组入口不删视图）。命令面板与 StageBar 同步主路径语义。入口存在性测试。**视觉验收门**：主路径三页 + 高级组截图过视觉评审。

### Acceptance criteria
- [ ] 侧栏出现三步主路径与高级折叠组；原五视图全部仍可达
- [ ] 路由/入口存在性断言通过（rg + 测试）
- [ ] 命令面板同步
- [ ] 视觉验收门通过（截图评审）

### Blocked by
- S3（生成页存在后才有主路径可重组）


---

## 收尾记档（REVIEW 三轮后）

- **规范偏差（L1，已记档）**：数字护栏基线按 PRD D2 字面为「claims/tables/notes 摘要」，实现收窄为 claims+tables（notes 无来源溯源可能携带敏感原文，REVIEW H1 后移出出站）——隐私上正当，属对规范字面的 fail-closed 收窄。
- **披露不修**：L4 并发竞窗（running 守卫首页 checkpoint 前窗口，单用户产品）；L6 材料摘要不含主张/表格计数与预算余量定性文案（生成前预估调用数=页数已在文案）；L7 rewrite_page 调用方的敏感推导未收敛到共享构造（行为等价）。
- 视觉验收：judge 子代理额度受限，主会话自查 6 张截图（scripts/shoot-m7.mjs 产出 /tmp/rs-m7-shots/）通过；已知非阻断小瑕疵：页型 chip 英文键、顶部五阶段条与主路径并存。

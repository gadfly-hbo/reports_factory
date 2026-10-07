# M9 PPT 一站式生成 — 任务拆解（tracer-bullet 垂直切片）

- [x] 1. S1 PPT-only 后端薄层（prompt + LLM 起草 + 适配 + 渲染 + 出站门 + 预算）
- [x] 2. S2 PPT-only 前端视图（粘贴 + 提示词 + 生成 + 下载 + 侧栏入口）
- [x] 3. S3 视觉样张对比（3 主题真调 vs Kimi 截图）

---

## S1｜PPT-only 后端薄层

### Parent
`.flow/prd.md`（D1–D4）；`.flow/proposal.md`（M9 选型与守则段）

### What to build
`src/model/ai-ppt-prompt.ts`（守则 system prompt，单源）+ `src/model/ai-ppt-from-md.ts`（LLM 出 `pages: [{type, headline, purpose, body?, bullets?, chart?}]`、zod schema 强约束、数字护栏、uncovered 占位、阈值）+ `src/server/app.ts` 新增 `POST /api/ppt/from-md` 与 `POST /api/ppt/from-text`（出站门 + 预算 + 零内容审计 + 批准持久化复用 M7/M5）。不重构 `render/pptx.ts`——只把 LLM 产物适配为最小 ReportSpec 后调现渲染器；产物以 Buffer 返回，不落盘。

### Acceptance criteria
- [ ] zod schema 强约束（字段长度 + bullets 数 ≤6）
- [ ] 数字护栏复用 `digitGuardViolation`（编造数字拒/放）
- [ ] uncovered 不编造（材料未覆盖占位）
- [ ] 出站门 + 预算三线 + 审计（draft 阶段）+ 批准持久化复用
- [ ] record→replay 闭环（合成 fixture）
- [ ] 既有 236 测试零破坏

### Blocked by
None

---

## S2｜PPT-only 前端视图

### Parent
`.flow/prd.md`（D4 + D6 入口存在性测试）

### What to build
`web/src/views/PptGeneratorView.tsx`（MD 粘贴 + 文本输入 + 「主题/受众/页数」表单 + 一句提示词 + 生成按钮 + 下载 .pptx）；侧栏新增入口「快速 PPT」（与主路径三步并列，但不挤主路径）；入口存在性测试 `tests/ppt-entry.test.ts`。

### Acceptance criteria
- [ ] 视图可达、表单完整（MD/文本/受众/页数/主题/提示词）
- [ ] 生成中/生成完成/失败 三态可见
- [ ] 出站 403 needsApproval 走批准预览
- [ ] 侧栏入口存在；路由可达
- [ ] 入口存在性断言（rg 可验证）

### Blocked by
- S1（后端接口）

---

## S3｜视觉样张对比

### Parent
`red-team.md` KA-1（成品感硬条件）

### What to build
3 主题样张真调对比：M9 产物 vs Kimi Web 同输入产物（截图对比）；出对比报告 `docs/m9-sample-comparison.md`，含：①成品感是否追平、②AI 风检测（emoji 数/accent 比例/bullet 数）、③数据图与文字图渲染。

### Acceptance criteria
- [ ] 3 主题真调截图齐全
- [ ] 与 Kimi 同输入对比报告含交付判断
- [ ] 若 AI 风检测不达标 → 报告披露，标回归 F 方案候选

### Blocked by
- S2（视图可用）

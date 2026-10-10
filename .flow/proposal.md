# Proposal：Report Studio 对话式自主 PPT Agent 全面重构

来源：2026-10-10 用户重构需求讨论 + 方案 v2.1（经用户裁决修正接入路径）。本文件是本 flow 的规范事实源；PRD/任务/审查均以此为根。

## 用户原始需求（2026-10-10，接近原文）

1. **前端 UI 全面重构**：读取全局设计规则 `/Users/huangbo/.agents/ui-design/DESIGN.md`（中文优先、浅色工作台、克制绿色、紧凑布局、按需展开及真实状态规则）。参考样例：`~/.agents/ui-design/examples/planning/2026-10-09/change005-v1.3-autonomous-analysis/clickable/index.html`。
2. **功能需要大改**：
   1) 引入最新的 pi-sdk；pi 将具有自主能力，类似 pi-coding-agent，**不再限制 agent 自由发挥**；
   2) 整个页面入口是类似 coding agent（如 Kimi Work）的窗口：可上传附件、描述清楚需要做的 PPT 内容即可；**但需要加入帮助用户理清 PPT 框架的能力，这块需要开发，与普通 agent 不一样**；
   3) PPT 好了以后可以进行**逐页编辑修改，也是与 agent 对话**；
   4) 调研 Kimi 的产品 PPT 生成能力和 PPT skill（已完成，见 §调研结论）。
3. **流程约束（2026-10-10 用户补充）**：pi-sdk 接入完成后，后续任务走 `/dev-flow` 开发流程。

## 关键裁决（用户已定，约束后续所有阶段）

- **接入路径**：经本机共享包 `pi-agent-runtime@0.4.1`（vendored tgz + hash 固定），不直用 npm `@earendil-works/*` 1.1.0，不采用 0.5.0 候选。裁决依据：AGENT-RUNTIME 标准第 1 条（产品不得直接 import Pi 包）+ RELEASE-v0.4.1「版本按用户决定使用 0.4.1」。
- **自主度**：删除三线预算阻断；采用 0.4.1 `cumulative:'unlimited'` + 单次保护（maxOutputTokens/modelTimeoutMs/toolTimeoutMs/controlTimeoutMs 必填）+ `modelRecovery:{extraAttempts:1}`（native retry 关闭）。
- **隐私**：沿 2026-10-07 用户裁决，默认 allow_external；出站批准门删除；导出前隐私检查降级为建议性 QA 输出。
- **旧产品处置**：六步向导（M10）与 worker 渲染路径删除；旧项目数据保留但列表隐藏（沿 M10 G6 先例）。
- **前端**：自研 React 工作台（不用 pi-web-ui），严格按 DESIGN.md token 与参考样例布局。

## 调研结论（已完成，作为需求输入）

- Kimi Slides：一句话+附件直出、在线编辑器+多轮对话逐页修改、感知手改；技术路线 = LLM 产中间格式（PPTD/YAML DSL）→ 真实可编辑 PPTX；原生可编辑图表；导出前多模态视觉质检（逐页截图查遮挡/溢出/对比度）；社区已逆向完整 skill（github.com/Binaryify/open-kimi-ppt-skill）。
- Kimi Work：桌面自主 agent（任务窗口+附件+权限确认，自动调用 Slides skill）。
- 本仓现状缺口：最终 PPTX 从 ReportSpec 重渲染，agent 逐页产物不进成品——重构后 agent 拥有 deck 工件并直接交付。

## 方案 v2.1 决策表（详细设计，已获用户确认方向）

| # | 决策 |
|---|---|
| D1 | 依赖 `pi-agent-runtime@0.4.1`（vendor tgz），`src/agent/` 为唯一 SDK 触达点 |
| D2 | `createSessionRuntime`：每项目一个持续会话，JSONL 存 `data/<proj>/session/`，压缩开启，重启恢复 |
| D3 | 模型链：minimax-cn/MiniMax-M3 主（anthropic-messages）+ xiaomi mimo-v2.6-flash 备（openai-completions 反向配置）；密钥宿主发现（env + `~/.pi/agent/auth.json`，含小米条目）显式传入 |
| D4 | `limits={cumulative:'unlimited',maxOutputTokens,modelTimeoutMs:600s,toolTimeoutMs,controlTimeoutMs}` + modelRecovery 1 次；预算配置字段保留但默认不阻断 |
| D5 | 授权：本地单用户预授权——模型调用/受限环境内 read/write/edit/bash（含 bash external 效果，沙箱内）放行；其余 external 拒绝；publish 放行（结果交付本地用户） |
| D6 | 审计：零内容 JSONL（audit.ts），append 即持久确认，失败关准入 |
| D7 | 自定义工具：`propose_outline` / `render_deck` / `qa_deck` / `export_deck` + 原生四工具 |
| D8 | deck 工件：agent 拥有 `data/<proj>/deck/`（pages/page_XX.js + deck.js）→ render_deck 出 deck.pptx + 每页 HTML 预览；导出直接交付 agent 工件（pptx=工件直出；html=页面 HTML 合集；pdf=Playwright 打印） |
| D9 | 框架梳理（核心差异化）：读完资料先 `propose_outline`（页列表+意图+来源标签+≤3 待澄清问题）→ 前端可编辑大纲卡 → 用户确认 → agent 全自主推进；人确认点在对话流内 |
| D10 | 逐页修改：选中页 → 消息注入页上下文 → agent edit page_XX.js → render_deck 重渲 → 预览刷新；生成中插话 steer / 排队 followUp |
| D11 | 删除：六步 workbench/路由、agent-loop/recording/LlmStageClient 体系、render/{pptx,deck-html,deck-pdf}、六步与报告工厂 schema、对应测试与前端视图；保留改造：ingest/*、storage（裁剪）、checks/privacy（qa 用）、template（风格预设）、page-preview（改读 deck 目录） |
| D12 | 前端：React 工作台 = 侧栏（项目/会话）+ 主区（线程+大纲卡+deck 工作区）+ 右抽屉（运行详情/审计/成本）+ composer（附件+发送/停止）；真实状态渲染，无假进度；DESIGN.md token |

## 当前进度（flow 之前，已完成并验证）

- **S1 接入基线**：vendor tgz + model.ts/budget-store.ts/audit.ts/authorize.ts + probe 双供应商真调 PASS + verify 108 用例全绿。
- **S2 会话宿主**：session-host.ts（createSessionRuntime 装配/send-steer/history/事件）+ server 路由（chat/status/result/history/events SSE/stop）+ 7 个新测试；verify 115 用例全绿。
- 已知 SDK 合同坑（已固化注释）：无 purposes 时 run 不得传 purpose；bash 工具 effect=external（沙箱内放行）；空闲会话 snapshot 需队列属主。

## 边界与未验证项

- npm pi 1.1.0 / pi-coding-agent 直用：不做（标准禁止；如需须用户明示豁免）。
- 多会话/fork UI、模板市场、移动端、旧项目数据迁移：本期不做。
- 页面 HTML 预览 ≠ 最终 pptx 视觉：预览明示「近似」；QA 以结构校验为主、视觉为增强。
- 账本 FileBudgetStore：单进程 JSON 原子写，多进程并发不支持（本地单用户产品，明示局限）。

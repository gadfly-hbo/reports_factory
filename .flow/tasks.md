# Tasks：对话式自主 PPT Agent 重构收尾（S3–S6）

拆解自 `.flow/prd.md`（US1–23 + G1–G8 + UI 合同 .flow/ui-contract.md）。自批准（dev-flow ISSUES 规则），依赖关系如下。删除类工作全部压到 T7（硬约束：S5 验收后执行）。

- [x] T0. 账本崩溃恢复负例（红队#2，prefactoring）
- [x] T1. 材料通道垂直切片（上传→提取落盘→agent 可读）
- [x] T2. 框架提案垂直切片（propose_outline + 提案卡 + 确认流）
- [x] T3. 自主生成垂直切片（deck 约定 + render_deck + 生成进行态 UI）
- [x] T4. 逐页对话编辑垂直切片
- [x] T5. QA 与三格式导出垂直切片
- [x] T6. 会话恢复 + 运行详情抽屉 + 状态完备性垂直切片（R1 补齐：设置页/失败分类/空页提示/恢复分隔线/用量页签）
- [x] T7. 旧产品清理 + README + 真调端到端冒烟（依赖 T4/T5/T6 全部完成）

---

## T0. 账本崩溃恢复负例

**What to build**：进程在 reserve 后 settle 前崩溃时，重启后同任务 claim 报 TASK_BUSY（合同正确），但宿主必须有一条**显式恢复路径**（核查后释放残留 lease），否则任务永久卡死。给 FileBudgetStore 增加宿主显式 `releaseActive(taskId)`（审计可见的恢复动作），并补负例测试证明：崩溃模拟 → TASK_BUSY → 显式恢复 → 可续。

**Acceptance criteria**
- [ ] 活动 lease 未释放时，新实例 claim 同任务 → TASK_BUSY（已有语义，测试固化）
- [ ] 宿主显式恢复动作存在且生效：恢复后同任务可重新 claim，历史用量保留不清零
- [ ] 恢复动作写入审计文件（JSONL 一行）

**Blocked by**: None

**US/来源**: 红队#2；PRD 测试决策

---

## T1. 材料通道垂直切片

**What to build**：上传即提取：md/csv 原文直读；pdf/docx/xlsx 上传时提取文本落盘（沿现有 ingest 提取器，产物写到 sources 提取文件）；图片走 vision 预理解→文字描述落盘（经 transport 缝可离线测）。agent 侧：材料索引文件（manifest）写入项目目录，agent 用 read 工具读提取文本与索引。UI：composer 附件列表带解析状态（解析中/就绪/失败，沿 UI 合同 W2）。

**Acceptance criteria**
- [ ] 四类文件上传后存在提取文本产物，解析状态正确（离线测试覆盖 md/csv；pdf/docx 用夹具；图片走合成 transport）
- [ ] manifest 列出全部材料（文件名/类型/提取文件路径/状态）
- [ ] UI 上传后能看到解析状态流转（组件级测试或冒烟走查记录）
- [ ] 解析失败单文件不影响其他文件，UI 显示失败原因

**Blocked by**: None

**US/来源**: US2、G3、UI 合同 W2

---

## T2. 框架提案垂直切片

**What to build**：自定义工具 `propose_outline`（页数组 title/page_type/intent/source_hint + ≤3 澄清问题）；宿主把提案存项目状态（版本号、确认态、历史版本）；outline 路由（读/编辑保存/确认；确认=用户定稿或聊天确认均入会话上下文）；PPT skill 增加框架梳理守则；UI 提案卡（内联编辑/删页/加页/调序/澄清问题区/版本折叠/「按此框架生成」+ 聊天意见回复入口，沿 UI 合同 W3）。守则约束：读完材料先提案，确认前不生成。

**Acceptance criteria**
- [ ] 合成 assistant toolCall 驱动 propose_outline → 提案落盘（版本 v1）且工具返回模型可见成功文本（SessionHost 主缝）
- [ ] 用户编辑保存 → 同版本更新；聊天意见 → agent 新提案版本+1（G4）
- [ ] 确认路由后：确认态持久 + 确认上下文注入会话（宿主测试断言后续 prompt 含确认大纲）
- [ ] 未确认时守则存在（skill 文本断言）；UI 提案卡交互可用（走查记录）

**Blocked by**: T1（来源标签需材料 manifest）

**US/来源**: US3–6、G1/G4、UI 合同 W3

---

## T3. 自主生成垂直切片

**What to build**：deck 工件约定（`deck/pages/page_XX.js` 导出 `buildSlide(pptx)` + `deck/deck.js` 汇总）；自定义工具 `render_deck`（node 执行 → zip 头/slide 数校验 → 每页 HTML 预览 → 返回成功/错误详情）；PPT skill 扩展 deck 组织规范与守则；确认后 agent 自主写页并渲染直至成功；UI 生成进行态（SSE 事件流卡片/steer 插话/停止）与 deck 页列表+预览路由。

**Acceptance criteria**
- [ ] render_deck 单测：好 js → deck.pptx 落盘 + 校验通过 + 预览生成；坏 js（语法错）→ 错误详情返回模型（自纠素材）；无 slide → 校验失败
- [ ] SessionHost 缝：合成 toolCall（write_code 语义由 write 工具 + render_deck 承担）→ deck 产物落盘
- [ ] 页列表/预览路由：GET 页清单与 preview PNG（沿近似预览渲染）
- [ ] UI 生成态：事件流卡片随 SSE 更新、可 steer、可停止（走查记录）
- [ ] 真调样张首验（红队#1 最便宜测试）：8 页样例材料端到端出 deck.pptx（脚本，不进 CI）

**Blocked by**: T2

**US/来源**: US7–11、G1、UI 合同 W4/W5

---

## T4. 逐页对话编辑垂直切片

**What to build**：选中页后发送的消息由宿主注入页上下文前缀（页号/标题/page 文件路径）；守则要求 agent 用 edit 改对应 page_XX.js 后调 render_deck 重渲；UI deck 工作区（页网格缩略图/点选大图/「针对第 N 页」composer 标记，沿 UI 合同 W5）。

**Acceptance criteria**
- [ ] 宿主测试：选中第 2 页发消息 → 会话 prompt 含页上下文
- [ ] 端到端（合成 transport）：edit 工具改 page js → render_deck → 预览刷新（产物 mtime/内容断言）
- [ ] UI：页标记可见、改后预览刷新（走查记录）

**Blocked by**: T3

**US/来源**: US12–13、UI 合同 W5

---

## T5. QA 与三格式导出垂直切片

**What to build**：`qa_deck`（zip/slide 数/文本框非空结构校验 + checks/privacy 精简建议性输出，不阻断）；`export_deck`（pptx=deck 工件直出；html=页面 HTML 合集；pdf=Playwright 打印合集）；导出记录沿用 exports 存储 + 下载路由（已有）；UI QA 卡与导出区（沿 UI 合同 W6）。

**Acceptance criteria**
- [ ] qa_deck 单测：好 deck → pass 明细；缺 slide/坏 zip → 结构 flag；建议性输出含隐私项
- [ ] export_deck 三格式落盘 exports 记录 + 文件可下载（inject 测试）
- [ ] UI：QA 卡呈现 + 三格式下载 + 记录表（走查记录）

**Blocked by**: T3

**US/来源**: US14–16、G8、UI 合同 W6

---

## T6. 会话恢复 + 运行详情 + 状态完备性垂直切片

**What to build**：重启恢复 UI（历史线程从 host.history 渲染，服务重启续聊）；运行详情抽屉（SSE 事件时间线：工具名/模型/耗时/状态 + 审计计数）；失败态完备（模型不可用/工具失败/部分页失败的真实原因 + 重试/停止按钮，沿 UI 合同 W7/W9）；空态（无材料/未开始）。

**Acceptance criteria**
- [ ] 服务重启（新 host 实例）后 history 可渲染、续聊成功（已有 host 测试，补 API 级）
- [ ] 抽屉时间线渲染真实 SSE 事件（组件测试或走查记录）
- [ ] 失败态展示真实原因与可行下一步（合成失败 transport 驱动）

**Blocked by**: T3

**US/来源**: US17–22、UI 合同 W7/W8/W9

---

## T7. 旧产品清理 + README + 真调端到端冒烟

**What to build**：**前置硬约束：T4/T5/T6 验收通过（S5 前端可用）后才执行删除**。删除六步 workbench 与路由、LlmStageClient/recording/agent-loop/budget(旧)/outbound(旧)/probe-task、render/{pptx,deck-html,deck-pdf}、六步与报告工厂 schema、旧前端视图与样式、对应旧测试；删除项目=项目及其会话与产物不可恢复（UI 合同语义，确认弹窗）；README 重写为新形态；最终 `npm run verify` 全绿 + 真调端到端冒烟（上传→对话→提案→确认→生成→改页→导出）。

**Acceptance criteria**
- [ ] 旧模块/视图/测试删除后 tsc 与 vitest 全绿（无死引用）
- [ ] 删除项目语义落地（确认弹窗 + 删除后不可恢复 + 列表移除）
- [ ] README 反映新入口与流程
- [ ] 真调端到端冒烟通过并留证（脚本输出）

**Blocked by**: T4, T5, T6

**US/来源**: US23、US19、UI 合同 W1/W9

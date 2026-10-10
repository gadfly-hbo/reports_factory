# Red-Team: Report Studio 对话式自主 PPT Agent 重构（S3–S6 收尾）

日期：2026-10-10 ｜ 对象：`.flow/proposal.md`（方案 v2.1 + 用户原始需求）｜ 结论：**GO**

## Top Kill-Assumptions（按 影响×可能性×测试成本 排序）

### 1. agent 自主写 pptxgenjs 分页代码能产出可交付 deck
- **Claim**：mimo/minimax 在「read/write/edit/bash + render_deck」宽工具自由下，能自主写出 `deck/pages/page_XX.js` 并经 render_deck 合成合法可编辑的 deck.pptx（S4 全部价值押在此）。
- **Steelman**：B5 已证双供应商真实渲染成功（minimax 11 轮/mimo 15 轮）；SKILL.md 有硬约束与完整案例；render_deck 报 stderr 可自纠。
- **Fails if**：解除窄工具白名单（旧 B 方案 4 个定制工具→现在通用 bash）后，真调整流程失败率显著上升且自纠 2-3 轮内不能收敛；或合并结构（import buildSlide）在 node ESM 下频繁踩坑。
- **Evidence to get this week**：S4 首片即做真调端到端样张（上传→生成→deck.pptx 解包校验 slide 数/文本框）。
- **Kill criterion**：两轮真调均无法产出可打开的 deck.pptx → 回退窄工具白名单形态（升级用户裁决）。
- **Cheapest test**：一个 8 页样例材料的真调冒烟脚本。

### 2. 宿主账本崩溃窗口缺恢复路径
- **Claim**：FileBudgetStore + reconcile 足以满足本地单用户的持久账本合同。
- **Steelman**：负例测试覆盖 TASK_BUSY/CONFIGURATION_CHANGED/STATE_FAILED；JSON tmp+rename 原子写。
- **Fails if**：进程在 reserve 后 settle 前崩溃 → 活动 lease 永久占位（重启后 TASK_BUSY），且宿主没有任何显式恢复动作（当前 reconcile 只查操作绑定，不清预算 lease）。
- **Evidence to get this week**：补一个「活动 lease 重启后恢复」负例测试。
- **Kill criterion**：恢复需要重写账本存储层 → 升级独立 slice 交用户裁决。
- **Cheapest test**：单测：claim 后不 release → 新 store 实例 claim → TASK_BUSY → 宿主显式 release 路径 → 可续。

### 3. propose_outline 交互粒度是否满足「理清框架」差异化
- **Claim**：结构化大纲提案卡（改题/删页/加页/调序 + ≤3 澄清问题）就是用户要的框架梳理能力。
- **Steelman**：用户明示这是与普通 agent 不一样的核心；六步时代「框架编辑+确认锁定」已验证过人确认点价值。
- **Fails if**：真实使用中用户想要的粒度是「改某页意图/让它先反问再出大纲」，而卡片只支持标题级编辑 → 差异化名存实亡。
- **Evidence to get this week**：UI-GATE 原型把提案卡交互（含澄清问题呈现）画全给用户确认；S3 后真调看模型是否按守则稳定调用 propose_outline。
- **Kill criterion**：原型评审时用户否决卡片形态 → 回 PRD 修（ui_gate_cycles 内）。
- **Cheapest test**：UI-GATE 原型（flow 内建）。

### 4. 前端工作台一次做对用户预期
- **Claim**：DESIGN.md token + 参考样例布局可直译为 React 工作台并被用户接受。
- **Fails if**：S5 全量实现后用户否决观感/布局 → 大面积返工。
- **Evidence / Cheapest test**：UI-GATE 可点击原型先行（dev-flow 内建门），用户批准后再写生产代码。
- **Kill criterion**：ui_gate_cycles（2）耗尽仍不通过 → 暂停升级用户。

### 5. 记录在案（低可能性，靠纪律化解）
- **删除顺序风险**：S6 删除六步/worker 路径必须在 S5 前端验收之后执行，否则出现「新入口不可用+旧产品已删」断层。→ 写入 tasks 依赖约束。
- **steer/压缩长任务行为**：S2 只测了 snapshot/恢复，steer 与压缩未真调验证 → S4/S6 真调冒烟覆盖。

## What's Well-Reasoned

- **接入路径**：v1 直用 pi 包被用户纠正后，v2.1 经共享包 0.4.1 + 宿主五输入，S1/S2 已按合同实现并有测试证据——这条腿已落地，不再是假设。
- **工件方向**：「agent 拥有 deck 工件」直击已证实的现状缺口（导出重渲染丢 agent 产物），无需再论证。
- **flow 纪律**：UI-GATE、真调冒烟、切片顺序约束分别化解 #3/#1/#5，计划自带的门与风险一一对应。

## What I Couldn't Assess

- mimo 长程工具 agent（>15 轮）的稳定性无本仓证据（B5 最长 15 轮成功）——只能靠 S4 真调样张暴露。
- Kimi 逆向 skill（open-kimi-ppt-skill）的 QA 纪律借鉴效果——属增强项，不阻断。

**Verdict: GO** —— 无已满足 kill criterion 的假设；top 3 均有 flow 内便宜测试。

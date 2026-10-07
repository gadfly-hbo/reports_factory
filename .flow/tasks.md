# M10 Tasks：垂直切片（tracer bullets）

> spec 链：proposal.md → prd.md → ui-contract.md（demo 已批准）→ 本拆解。切片自批准（ISSUES 规则）；动工审批门由大改造约定另设。
> 依赖基本沿主流程线性：S1 清场 → S2 地基 → S3–S7 沿六步 → S8 收口。每片端到端可验证。

- [x] S1. 清场与壳层六步化（删除报告工厂 + PPT 项目骨架）
- [x] S2. pi-agent-core 适配层 + PPT skill 骨架
- [ ] S3. 上传资料与读取理解（pdf/图片 + checkpoint）
- [x] S4. 框架生成与确认锁定
- [x] S5. 逐页生成（护栏/checkpoint/预算）+ 样张盲评检查点（代码完成；样张盲评待用户）
- [ ] S6. 逐页编辑（手工直改 + agent 改写 + 删页）
- [ ] S7. 审核发布与三格式导出（PPTX/HTML/PDF）
- [ ] S8. 真调准入（§7.5）+ 合规收口 + 视觉门

---

## S1. 清场与壳层六步化

### What to build
产品收敛第一步：删除全部非 PPT 面向用户的功能及其专属代码（报告编修链、体检/证据链、docx/md 报告渲染、五阶段壳层语义、旧视图与旧路由、报告样张与回归脚本），保留围栏/传输/渲染/存储/同步平台资产。同时立起新骨架：PPT 项目 schema（brief/sources/framework/pages/publish_state/privacy_policy，G6 旧项目不显示）、六步路由表与步骤解锁规则、Sidebar 六步导航与项目列表改造、StatusBar 发布状态徽、六步空壳视图。删除清单以 prd.md ID1 为准（KA-4 依赖盘点背书）。

### Acceptance criteria
- [ ] 旧报告路由/视图/专属模块不再存在（rg 验证零引用）；旧路由访问重定向到当前步骤
- [ ] 围栏与平台资产（pi-transport/budget/outbound/privacy-gate/recording/gateway/client/storage/dataSync）保留且测试通过
- [ ] 新 PPT 项目可创建（名称/简介/框架模板/隐私策略），旧 data/proj_* 文件在但 UI 不可见
- [ ] 六步路由 + 解锁规则（upload→understand→framework→generate→page-edit→publish）在 web 端可走，空壳视图占位
- [ ] `npm run verify` 全绿（测试随功能删改后全量通过）

### Blocked by
None — can start immediately.

## S2. pi-agent-core 适配层 + PPT skill 骨架

### What to build
安装钉版 `@earendil-works/pi-agent-core@0.86.1`；在适配层（既有 pi-transport 收敛点旁）新增 agent 集成模块：AgentHarness 装配（session=项目、operation=工人单发、`kind:"skill"` 调用、images 入参），skills 经 loadSkills 装载 + formatSkillsForSystemPrompt 注入；遥测桥接审计留痕与预算三线钩子。PPT skill 落为 SKILL.md 目录形态（守则单源迁移自 ai-ppt-prompt.ts，含 0 emoji/数字护栏/版式思想层规则；GordenSun detail.json 协议作版式知识参照）。装配形态若与工人单发冲突，按 G3 降级阶梯（A→C：loadSkills+pi-ai 直调）执行并披露。§10 坑表逐条规避（convertToLlm/错误重抛/usage 回填/<think> 剥离等）。

### Acceptance criteria
- [ ] 业务代码零直接 `@earendil-works/*` import（适配层单点收敛，§4.1）
- [ ] PPT skill 经 pi skills 机制装载并在 system prompt 中可见（夹具断言）
- [ ] 录制回放夹具闭环（record→replay 全绿）；遥测→审计、预算钩子有夹具证据
- [ ] MiniMax-M3 + mimo-v2.6-flash 真实端点单轮/多轮联调通过（§7.5 初验，S8 全链终验）
- [ ] 合规文档记 D-1 撤销与新装配形态

### Blocked by
- S1（清场后适配层改造不被旧链干扰）

## S3. 上传资料与读取理解

### What to build
六步第 1–2 步端到端：上传（md/docx/xlsx/csv/pdf/图片，格式不限前端不拦截；ingest 扩 unpdf 文本提取与图片 base64 化）、移除（M-U1：连摘要与 checkpoint 一并删，失败文件不再阻塞）、逐文件 LLM 单发理解摘要（结构化 schema：要点/数据要点/**每条带主题标签**——为 S5 语义投影建索引；图片走 vision，CN 端点行为探针验证；长 PDF 代码确定性分段、逐段摘要 map）、逐文件 checkpoint 持久化（G11）、理解视图（进度 N/M/展开摘要/失败重试）。PPT skill 在理解环节注入（版式无关，但守则中的「不编造/来源绑定」适用）。

### Acceptance criteria
- [ ] 六类格式文件上传→解析→摘要→持久化全链路可演示；解析失败明示原因可移除可重试
- [ ] pdf（中文 CID 字体）文本提取验证；图片经 vision 出摘要（真调探针 ≥1 次通过）
- [ ] checkpoint：重进不重跑已完成文件；移除文件后摘要与 checkpoint 同步清除
- [ ] 预算/审计在理解调用上生效（计量/留痕有夹具证据）
- [ ] 视图与 ui-contract S3/S4 一致（含冲突提示、失败面板）

### Blocked by
- S1、S2

## S4. 框架生成与确认锁定

### What to build
六步第 3 步端到端：框架 schema（`{page_id, title, page_type, intent, source_hint?}[]`，G7）持久化于项目；材料摘要合集 + brief → 单发生成框架（工人模式，框架模板作页序列倾向，G10）；框架确认视图（改题/删页/调序/加页，确认后锁定只读）；未确认不可生成（服务端围栏同拒，N1）。

### Acceptance criteria
- [ ] 生成→编辑→确认→锁定全链路可演示；确认后无任何解锁控件且服务端拒绝改框架
- [ ] 未确认框架时生成端点 4xx（负例测试）
- [ ] 框架生成失败/超时有重试路径；预算/审计生效
- [ ] 视图与 ui-contract S5 一致

### Blocked by
- S3

## S5. 逐页生成 + 样张盲评检查点

### What to build
六步第 4 步端到端（产品核心）：按已确认框架逐页生成（逐页工人单发：框架页 + **语义投影材料上下文**——按页意图×理解阶段主题标签匹配命中摘要段落连同来源装进上下文，投影不足时插入一次「检索单发」兜底（页意图+候选清单→选中条目，schema 校验，固定轮次）→ 页内容 schema，经 ReportSpec 演进层驱动 render/pptx.ts；数字护栏/uncovered 不编造/来源引用沿用 M7 范式）、逐页 checkpoint 断点续跑（重进跳过已完成）、页级失败单独重试、预算逐页复查 + 失败计量、生成视图（逐页状态/进度/继续生成）。**本切片内置样张盲评检查点（KA-1）：用真实材料渲 1–2 页真 PPTX 样张呈用户盲评方向，不满意则停止全线先重做视觉系统（kill criterion）。**

### Acceptance criteria
- [ ] 确认框架后一键生成整套，每页内容有材料支撑、0 emoji（渲染断言）
- [ ] 断点续跑：中断后重进「继续生成」跳过已完成页；页级重试只跑失败页
- [ ] 预算封顶触发即停止并明示（负例）；审计留痕含 page_fallback 粗粒度事件
- [ ] 出站白名单对生成路径生效（负例）
- [ ] 视图与 ui-contract S6 一致
- [ ] 样张盲评：真实材料 1–2 页 PPTX 交用户，方向确认后放行 S6+

### Blocked by
- S4

## S6. 逐页编辑

### What to build
六步第 5 步端到端：手工直改纯文字字段（headline/bullets 文本/table_note/图表标题，G8）持久化；agent 整页重生成（自然语言指令 + 当前页 + 材料上下文 → 单发变换，出站白名单 fail-closed，拒绝时面板明示原因可重试）；编辑层删页（锁页/最后一页拒删，M6 语义；无加页）；编辑视图（页列表/编辑器/只读区说明/示意预览列）。

### Acceptance criteria
- [ ] 手工改文字保存后重进不丢（持久化断言）
- [ ] agent 改写成功路径 + 白名单拒绝路径（负例面板明示）+ 超时重试
- [ ] 删页：最后一页/锁页拒绝（负例）；删除后页号不重排
- [ ] 视图与 ui-contract S7 一致

### Blocked by
- S5

## S7. 审核发布与三格式导出

### What to build
六步第 6 步端到端：隐私检查并入发布门（原 checks/privacy.ts 判定迁移为发布前整 deck 扫描，命中 fail-closed 不可跳过，N3）、内用/外发两级（内用草稿随时导标 draft；外发需检查通过+批准，批准持久化，内容变更自动失效，服务端二次校验 N2）、导出三格式（PPTX 复用 render/pptx.ts；HTML 新渲染器单文件翻页幻灯片；PDF 经 Playwright 打印）、发布视图（检查/批准/导出/记录）与全站发布状态徽。

### Acceptance criteria
- [ ] 隐私命中即阻断外发（负例：命中明细常驻、无跳过入口）
- [ ] 未批准外发导出被拒（负例：服务端二次校验）；批准持久化 + 内容变更失效（负例）
- [ ] 三格式产物断言：PPTX（slide 数/0 emoji/zip 可解/可编辑）、HTML（单文件/翻页/无外部依赖）、PDF（页数=页数）
- [ ] 导出记录与 Inspector/StatusBar 状态如实（未发布/内用草稿/已外发）
- [ ] 视图与 ui-contract S8 一致

### Blocked by
- S5、S6

## S8. 真调准入 + 合规收口 + 视觉门

### What to build
上线前收口：§7.5 硬卡点全链终验（MiniMax-M3 + mimo-v2.6-flash 单轮 + 多轮 + 带图探针 + skill 注入下 schema 遵从；probe 脚本留仓）、AGENT-RUNTIME §11 合规清单逐项三态核对、合规文档更新（D-1 撤销/装配形态/§10 坑表复核）、全站视觉门（visual-judge 子代理过 ui-contract 全 surfaces；额度受限则降级自查并披露）、双机同步验证。

### Acceptance criteria
- [ ] §7.5 单轮/多轮/带图全绿（真实端点证据）
- [ ] §11 清单逐项带证据锚点更新入 docs/agent-runtime-compliance.md
- [ ] 视觉门 pass（或降级自查 + 披露）
- [ ] `npm run verify` 全绿；macbook 同步演练通过

### Blocked by
- S7

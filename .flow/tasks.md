# M4｜分析成果编审模块 — 任务拆解（tracer-bullet 垂直切片）

- [x] 1. S1 资产逻辑身份 + AnalysisBundle 导入
- [x] 2. S2 发现卡片 + 任务书扩展 + 编审决定持久化
- [x] 3. S3 确定性取舍推荐 + 逐页蓝图
- [x] 4. S4 G1 编审关口 + 报告状态机
- [x] 5. S5 变更控制器 + 字段级锁定
- [x] 6. S6 版本更新影响 + 候选区 + 补证闭环
- [x] 7. S7 G2 扩展检查 + ReportReceipt
- [x] 8. S8 编审 UI 工作区 + 冒烟 + 回归收口

---

## S1｜资产逻辑身份 + AnalysisBundle 导入

### Parent
`.flow/prd.md`（D1 资产逻辑身份、D6 bundle 合同；红队 K1 地基）

### What to build
资产获得"逻辑身份 + 修订"二元组（source 级 `source:<producer>:<stem>`，资产级解析顺序+锚文本派生；同 source 重导 = revision 升级 + replaces 链，内容一致幂等跳过）。新增 AnalysisBundle 单 JSON 合同（全内联，图片 data URL；方案 §11.1 字段组）与导入器：未知 schema_version 拒绝、无路径/代码执行、材料继承项目 privacy（local_only 兜底）、无源人工材料按 unverified 进入不伪造 run_id。走通：API 导入 bundle → 资产入库（logical@revision）→ 重复导入幂等 → 升级 bundle 产生新修订与待复核提示（数据层）。兼容读旧项目（无 logical_key 的存量资产）。

### Acceptance criteria
- [ ] T01/T02：bundle 导入后项目含发现/指标/图表/证据/口径/权限记录；不装上游工具闭环可用（API 级）
- [ ] T03：同 bundle 导两次资产不重复、已有决定不丢（决定在 S2，此处验证资产层幂等）
- [ ] T11（导入侧）：同 logical_key 新 revision 导入 → 旧引用不变 + 待复核数据产生，不覆盖旧资产
- [ ] T19：恶意 bundle（越界路径/嵌入指令）不执行、不读取项目外文件，内容按材料进入
- [ ] T25：无源材料标 unverified，不伪造 run_id/验证记录
- [ ] 存量项目（旧数据）打开/列表/组装不报错
- [ ] `npm run verify` 全绿 + 回归零漂移

### Blocked by
None - can start immediately

---

## S2｜发现卡片 + 任务书扩展 + 编审决定持久化

### Parent
`.flow/prd.md`（D3 组合视图、D4 brief 扩展；GRILL G4/G5/G10）

### What to build
FindingCard 服务端组合视图（claim+metric+chart+evidence 摘录+口径+限制+反证+placement），EditorialDecision 按报告隔离持久化（work/editorial.json，report_id+logical_key+placement+reason+operator+时间+依据修订），excluded 粘性。ReportBrief 增 core_question/non_goals/required_boundaries/delivery_privacy（可选，向后兼容）。旧项目惰性初始化（首进编审阶段全量 candidate）。API：GET findings、POST/PUT decisions、brief 更新。

### Acceptance criteria
- [ ] T04：同一发现在两份报告 placement 互不污染，底层事实身份一致
- [ ] T06（决定侧）：excluded 决定在重导/重排后不自动回正文
- [ ] brief 新字段可读写并进修订快照；旧 brief（无新字段）兼容
- [ ] T21（持久化侧）：模拟重开（新 store 实例读同 workspace）决定恢复
- [ ] 旧项目惰性初始化生效
- [ ] `npm run verify` 全绿 + 回归零漂移

### Blocked by
- S1（logical_key 是 placement 的锚）

---

## S3｜确定性取舍推荐 + 逐页蓝图

### Parent
`.flow/prd.md`（D4 推荐器+蓝图；GRILL G13；红队 K2）

### What to build
model 层确定性取舍推荐器（external:false）：按核心问题相关性（类型/关键词/证据状态/增量信息）产出正文/附录/不采用推荐+理由（不用无依据精确分数），推荐结果即 EditorialDecision 草案。PagePlanItem 增蓝图字段（page_purpose/core_message/inclusion_reason/required_limits/budget），组装从 placement=body/appendix 决定推导 claim_refs（决定层为源、spec 为投影）。API：POST recommend、蓝图读写。

### Acceptance criteria
- [ ] 零售样板 fixture：推荐入选/落选集合符合方案 §15 预期（K2 cheapest test，断言 + 人工走查记录）
- [ ] 推荐带理由文本；推荐落 excluded 的决定有粘性（不自动回正文）
- [ ] T12 相邻：仅相关性证据支持的解释性假设不被推荐为确定性事实陈述（措辞降级提示可后置到 S7，此处保证推荐不升级 kind）
- [ ] 蓝图字段随组装进 spec.meta，渲染输出不变（golden 零漂移）
- [ ] `npm run verify` 全绿 + 回归零漂移

### Blocked by
- S2

---

## S4｜G1 编审关口 + 报告状态机

### Parent
`.flow/prd.md`（D2；GRILL G3/G9）

### What to build
编审状态机（organizing→brief_draft→blueprint_review→g1_approved→draft_editing→checks_pending→published + pending_review 集合）在 workbench service 层强制（非法转移抛错；published 后只能派生新修订回 checks_pending）。G1 批准：ApprovalRecord（approver/brief_version/source_snapshot_id/revision_id/scope/approved_at）+ 冻结当时 brief/蓝图/来源快照；placement 与 claim_refs 一致性校验（不一致 warning）。API：POST approve-g1、GET editorial status。生成预览在 G1 前带草稿标识。

### Acceptance criteria
- [ ] T07：G1 未批准请求正式生成 → 保留草稿预览且明确标识，不冒充正式稿
- [ ] 非法状态转移（如 organizing→published）被拒并抛错
- [ ] published 后变更派生新修订回 checks_pending，旧修订不被覆盖
- [ ] G1 批准记录四绑定齐备；G1 决定/任务书元数据变更不 bump spec 修订（G3）
- [ ] `npm run verify` 全绿 + 回归零漂移

### Blocked by
- S3

---

## S5｜变更控制器 + 字段级锁定

### Parent
`.flow/prd.md`（D5；GRILL G2/G6；红队 K4）

### What to build
ChangeProposal（proposal_id/report_id/expected_revision=rev_NNN/approved_scope/changes[] object+field+before+after/affected/required_checks/state）与单一变更控制器：§12.2 检查顺序（版本一致→范围→锁定→来源可用→原子应用+审计→受影响重检）。存量 EditOp 薄壳包装为自动提案（G1 前 auto-applied 留审计，G1 后受批准范围约束）。锁定升级：Page.locks（page_order/headline/body/metrics/chart/required_note/sources）+ 报告级 storyline/page_order 锁；旧 locked 布尔读作内容锁全开；reorder/switch_layout 纳入锁定检查（补齐现状缺口）。漂移基准：G1 快照 + approved_scope 由蓝图与锁定推导（G6）。

### Acceptance criteria
- [ ] T08：只精简一页文字 → 范围外内容/绑定/数字/必要限制零漂移（复用 M2 编辑稳定性测试法扩展）
- [ ] T15：编辑期间旧版本提案到达 → expected_revision 不匹配被拒，保留冲突协调路径
- [ ] T09：换模板/主题 → 不重写事实与核心结论（视觉变更不属实质变更）
- [ ] 锁定绕过全组合被拒（含页序锁：锁定页序后 reorder 抛 EditRejectedError）
- [ ] 原子性：提案部分校验失败 → 无半应用状态
- [ ] 存量 /edit API 行为兼容（薄壳后旧测试通过，仅新增约束生效）
- [ ] `npm run verify` 全绿 + 回归零漂移

### Blocked by
- S4（approved_scope 依赖 G1）

---

## S6｜版本更新影响 + 候选区 + 补证闭环

### Parent
`.flow/prd.md`（D7 前半、F07；GRILL G8）

### What to build
新导入/新 revision 成果一律先落候选区（placement=candidate，不自动改写已确认报告，重排大纲不自动晋升）。版本升级影响复核：按 logical_key 影响面标记受影响页/发现 pending_review；与关键陈述冲突 → 阻断相应活动修订正式发布（policy 级），锁定页同样被标记。excluded 发现重要性变化时仅重新提出复核（不静默恢复）。EvidenceRequest 生命周期（draft→awaiting_approval→approved→exported→returned/cancelled/failed；request_id 幂等去重）+ 结果 bundle `origin.evidence_request_id` 自动写回 result_refs 并触发待复核；无上游时请求导出为文件。API：GET candidates/impact、POST evidence-requests 及状态转移、导出。

### Acceptance criteria
- [ ] T10：与报告无关新结果仅进候选区，正文不扩写
- [ ] T11：新证据推翻锁定页关键陈述 → pending_review 标记 + 正式发布阻断（草稿带标识仍可导）；不静默覆盖
- [ ] T16：批准补证请求创建关联记录；不自动授权任何代码执行/外发
- [ ] T17：同 request_id 重复提交/重试不重复创建
- [ ] 补证结果导入 → 请求状态 returned + result_refs 关联 + 受影响页待复核
- [ ] 已导出旧文件不被重写
- [ ] `npm run verify` 全绿 + 回归零漂移

### Blocked by
- S1（版本升级）、S5（受控修订路径）

---

## S7｜G2 扩展检查 + ReportReceipt

### Parent
`.flow/prd.md`（D8、D7 后半；GRILL G14）

### What to build
检查引擎新增四类确定性检查：重点覆盖（core_question 关键发现正文层落点）、必要限制保留（required_boundaries/required_limits 仅在附录→blocker）、批准范围漂移（G1 后 vs 批准快照 diffSpecs 按 scope 分类，超范围实质变更→blocker）、检查绑定最终版本（导出校验 revision+快照+检查记录指纹，内容再变需重检）。pending_review → 正式发布阻断、草稿带标识。ExportRecord 扩展为回执（upstream link/来源映射/编审与发布记录引用/交付状态 draft|formal|superseded；export_id 幂等重试）；新修订发布后旧记录标 superseded 不改文件。导出 API 支持 G2 确认（绑定检查报告指纹，ApprovalRecord kind=g2）。隐私：bundle 材料出站仍全量过 PrivacyGate。

### Acceptance criteria
- [ ] T13：删除/弱化会改变判断的核心限制 → blocker，不能以"精简"授权通过
- [ ] T22：检查通过后又改内容 → 原检查记录不能用于新版本直接发布
- [ ] T18：外部禁止时未授权内容不能出站；本地/手动路径继续可用
- [ ] T23：导出成功但"回执交接"失败 → 文件保留、状态待重试、幂等重试不重复关联
- [ ] T24：新修订发布后旧导出文件不变，记录标 superseded/过时
- [ ] T12：相关性证据生成确定性因果标题 → 检查提示降级措辞或补证（模型辅助检查的确定性子集：kind=inference 而 headline 表确定性 → warning）
- [ ] `npm run verify` 全绿 + 回归零漂移

### Blocked by
- S4、S5、S6

---

## S8｜编审 UI 工作区 + 冒烟 + 回归收口

### Parent
`.flow/prd.md`（D9；GRILL G1）

### What to build
三栏外壳内升级"大纲"槽位为"编审"阶段（stage key 仍 outline）：发现卡片列表（左/主区）、任务书+取舍+蓝图+G1（中）、Inspector 扩 findings/decisions tab（右）。顶部状态条：编审状态、绑定来源版本、待处理更新数、G1/G2 分开标识。候选区、蓝图确认、G1 批准、提案差异确认为显式控件；文案符合方案 §13.3（如"新增 N 条发现，尚未加入报告"）。smoke-ui 增编审走查步骤；README/docs 更新（M4 能力、验收状态）。非编审项目旧路径不受影响。

### Acceptance criteria
- [ ] 浏览器冒烟：材料→编审（发现/任务书/推荐/蓝图/G1）→组装→检查→导出全链走查通过（smoke-ui 扩展步骤全绿）
- [ ] 状态条显示编审状态/来源版本/待处理更新；G1 与 G2 标识分开
- [ ] T07/T10/T11 的 UI 可见性（草稿标识、候选提示、待复核入口）
- [ ] 旧项目（无 bundle）打开编审阶段走旧大纲表单不报错
- [ ] README 更新 M4 交付说明；`npm run verify` + `npm run regression` + smoke-ui 全绿零漂移

### Blocked by
- S1–S7 全部

---

依赖链：S1 → S2 → S3 → S4 → S5 → S6 → S7 → S8（S6 额外依赖 S1；S7 额外依赖 S4/S5；严格线性执行）

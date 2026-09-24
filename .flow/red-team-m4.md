# Red-Team: Report Studio 分析成果编审模块（方案 v1.0，2026-09-23）

评审对象：`.flow/proposal.md`（模块产品方案 v1.0）+ 本次实现目标（升级 reports-factory）。
基线证据：commit 6d3304b 的全量代码勘察（Explore 代理能力地图，2026-09-23）；仓库 M0–M3 已交付，119 测试全绿，git 干净。

> 结论先行：**GO**。方案的核心前提（复用既有对象、程序约束优先、模拟先行）与代码事实基本吻合；但有一个已证实的结构性缺口（K1）和一个交付风险（K3）必须在 PRD 中显式处理。

## Top Kill-Assumptions (ranked)

### K1. 「复用既有资产层即可承载编审」——资产身份与版本分离实际缺失
- **Claim:** 方案 §2.1/§10.2 假设既有 Claim/Metric/EvidenceRef 可直接承载发现卡片与 `claim:F07@r2` 式稳定引用，新版本只产生"更新提示"。
- **Steelman:** schema 里确有 `SourceRefSchema.version`、`Claim.verification_state`（含 `source_updated`）、`Page.claim_refs` 稳定绑定；`SourceAsset.replaces` 字段甚至已预留——设计者显然预见过这个问题。
- **Attack:** 勘察证实：所有 ID 在导入时铸造（`claim_<src>_<n>`），版本硬编码 `'v1'`，`replaces` 无任何调用方写入；重新导入=全新 source_id。因此 **T03（重复导入不重复建资产）、F07 更新影响复核（§7.7 同口径新版本）、T11（新证据推翻锁定页）在现状上不可实现**——不是缺 UI，是缺身份机制。
- **Fails if:** AnalysisBundle 重复导入/版本更新无法映射到既有逻辑资产 → 编审决定（decisions）孤儿化、"新版本待复核"退化为"又一批新材料"。
- **Evidence to get this week:** 已获取（代码勘察，见上）。无需再取。
- **Kill criterion:** 若为引入逻辑身份需重写存量 revisions/导出格式且无法向后兼容读取 → 砍掉"版本更新影响"范围，首期只做幂等去重导入（不做 r2→r3 影响 diff）。
- **Cheapest test:** bundle 导入器单测：同一 bundle 导两次 → 资产不重复；升级 bundle（同 logical key、新 revision）→ 旧引用不变 + 产生待复核提示。

### K2. 「编审推荐有用户价值」——在无外部模型的确定性网关下未证实
- **Claim:** F03 取舍推荐、F04 主线推荐由"编审辅助 Agent"提供（方案 §4）；用户价值依赖推荐质量（§18.1 到主线确认的时间）。
- **Steelman:** 仓库唯一模型实现是确定性模板网关（composeOutline），但它在大纲生成上已被验证有效（8 页复盘主线 + research 模板，缺口不编造）；隐私门禁刻意保持"无模型也能用"（方案 §14.2 本地或手动模式），推荐机制本就允许确定性。
- **Attack:** 取舍推荐≠大纲生成：前者要求按"核心问题相关性 + 证据支持度 + 增量信息"排序资产。确定性启发式（类型/关键词/证据状态匹配）在通用材料上可能产出机械结果，用户全部手动改 → 编审模块退化为"多两步点击的表单"。
- **Fails if:** 零售样板走查中，确定性推荐的取舍/主线被用户改动率 > ~70%，或推荐理由无法解释。
- **Evidence to get this week:** 在 PRD 的第一个 tracer 切片里内建零售样板走查（E2E 断言 + 人工读一遍推荐输出）。
- **Kill criterion:** 推荐被证明无信息量 → 把"推荐"降级为"分组候选视图"（只排序不取舍），把 Agent 推荐留给外部模型接入后的后续迭代。
- **Cheapest test:** 对 samples/retail-review 材料跑确定性取舍推荐，核对 §15 样板预期的正文五页入选/落选集合。

### K3. 「一个 flow 能交付方案 §16.1 全部 MVP」——范围蔓延风险
- **Claim:** 模块 MVP 含 7 个工作包（编审核心/受控修改/可信交付/独立输入/接缝合同/补证管理/安全恢复）。
- **Steelman:** 仓库纪律强（tracer-bullet、golden 回归、119 测试），既有检查引擎/导出门禁/存储层直接复用，实际新增面比"7 个包"听起来小。
- **Attack:** 同时动 schema（身份/版本）、编辑路径（ChangeProposal 化）、状态机（G1/G2）、UI（编审工作区）、新导入器（bundle）+ 三合同——任何一个拖长都会让 flow 后期审查循环吃满 3 轮。
- **Fails if:** 切片数 > 8 或出现"全做一半"状态（例如 G2 扩展检查只注册不接线）。
- **Evidence to get this week:** ISSUES 阶段切片时即检验。
- **Kill criterion:** 切片 > 8 或相互依赖无法线性化 → 拆成两个连续 flow：E1 编审闭环（核心+受控修改+独立输入）、E2 稳定性与接缝（G2 扩展+补证+合同模拟收尾）。
- **Cheapest test:** 按依赖给 7 个工作包排序，找出必须最后做的验收切片，数总数。

### K4. 「程序约束防止范围外改写」——存量旁路路径必须封死
- **Claim:** §12 变更控制要求所有修改经 ChangeProposal（expected_revision + 范围 + 原子应用）。
- **Steelman:** `applyEdit` 已是单一变更入口（updatePage 只替换目标页、不可变返回），锁定检查存在；把"即时应用"升级为"提案→校验→应用"是加壳而非重写。
- **Attack:** 现有 `/api/projects/:id/edit` 路由与 UI 编辑卡仍走即时应用；若新编审路径与旧路径并存，"程序约束"存在旁门（T08/T15 形同虚设）。另有已知漏洞：`reorder`/`switch_layout` 不受锁约束（设计如此，但与 §8.4"页序变化属编审对象"冲突）。
- **Fails if:** 任何写路径绕过 expected_revision 校验或锁定字段（含 reorder 对锁定页序的修改）。
- **Evidence to get this week:** PRD 中明确"单一变更控制器"决策：旧 /edit 路由收编或标记 deprecated。
- **Kill criterion:** 若收编 /edit 会破坏全部存量测试且无法薄改 → 保留旧路径仅用于非编审项目，编审项目强制走提案（双轨明示）。
- **Cheapest test:** T15 单测：编辑期间"旧版本提案"到达 → expected_revision 不匹配被拒。

## What's Well-Reasoned

- **方案自带的防御性设计真实有效：** 拒绝聊天当状态、要求程序侧约束而非提示词、G1/G2 分离内容批准与发布批准、锁定"防未授权改写而非防纠错"（§8.4）——与仓库既有纪律（确定性核心、append-only 修订、导出门禁）同构，落地阻力小。
- **"复用"前提大体为真：** 勘察确认 ClaimKind/VerificationState 已区分陈述性质与验证状态（F02 的前两列现成）；`pagesImpactedBySource`+`diffSpecs`+ExportRecord(sha256+checks) 覆盖 F07 影响面、T22 检查绑定、回执大半；三栏外壳（0c54f54）就是 §13.2 要求的容器。
- **规范性边界处理干净：** v1.0 文档显式声明旧概念图（2025-08-27 v0.1，含 Word 输出/5-Agent 层/网页报告）不替代本稿，避免范围被图扩大；Xanthil 真实连接单列验收不阻塞独立版——这两点直接降低 K3 风险。
- **阶段划分可执行：** §16.2 的 M0 核查步骤即本次 ASSESS/PRD 已完成的部分，说明方案作者预期了"规划≠实现"的落差。

## What I Couldn't Assess

- **Xanthil Desktop 真实结果接口**：本仓库无其源码，AnalysisBundle 字段只能按方案 §11.1 设计 + 模拟样例验证；真实映射留到联调期（方案 M3，本 flow 不含）。
- **编审两关口与现有 5 阶段 UI 的融合体验**：只能做样板级走查，真实用户采用率（§18.1 重复使用）无法在本 flow 内验证。
- **讲稿（F05 speaker notes）层**：渲染器今天不写备注，隐私检查显式 `not_checked`；是否本 flow 落地留给 PRD 决策（倾向：schema 支持、渲染暂缓）。

## Verdict

**GO**，附三条硬约束进 PRD：
1. K1 的逻辑身份/版本机制是第一切片的地基，不可后补；若向后兼容不可行则按 kill criterion 收缩范围。
2. K4 要求单一变更控制器决策在 PRD 定案（推荐：收编 /edit 进提案通道，薄改存量测试）。
3. K3 的切片数上限 8，超出即拆 flow；Xanthil 真实适配、新输出格式（DOCX 长报告等父产品已有格式之外）明确 out of scope。

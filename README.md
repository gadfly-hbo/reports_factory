# Report Studio（工作名）

把已有的分析材料变成**结构清楚、视觉专业、事实有据、方便修改**的会议汇报。独立运行、本地优先；先独立验证产品价值，成熟后接入 JuanerAI（不构成首期依赖）。

- 产品方案：`.flow/proposal.md`（v1.0，规范事实源）｜PRD：`.flow/prd.md`｜红队评审：`.flow/red-team.md`
- M0 导出限制清单与门禁判定：`docs/m0-export-limits.md`
- 当前状态：**M0–M5 已交付**，自动化测试全绿 + 回归 golden（双管线）零漂移 + 浏览器走查（含编审与 AI 入口可见性）通过；AI 功能在无密钥/断网时自动关闭，确定性路径不受影响
- 双机同步：双击 `启动Report Studio.command`（对齐 deep-research：启动拉取、退出回推、冲突保本机），或 `npm run data-sync`。项目数据（材料/修订/**编审状态**/导出记录）随仓库入库跨机同步；导出工件（pptx/pdf/docx/html）可再生不入库

## 快速开始

```bash
npm install
npm run verify        # typecheck + 全部测试 + 双构建
npm run sample        # 生成零售复盘演示报告（samples/retail-review/ 下 html/pptx/pdf）

npm run build:web     # 构建 UI（首次运行前）
npm start             # 启动本地服务：http://127.0.0.1:8787（数据默认存 ./data，可用 REPORT_STUDIO_HOME 改）
```

UI 走查（真实浏览器全链冒烟）：`node scripts/smoke-ui.mjs`（需先 `npm run build && npm run build:web`）

## 功能（M0–M5）

### M5 LLM 接入（新增）
| 能力 | 说明 |
|---|---|
| 模型运输层 | pi-ai 流式直调（minimax 主 + 小米备，`REPORT_STUDIO_MODEL_CHAIN`）；瞬时错误切备用 + 熔断冷却；schema 强校验 |
| 出站治理 | 两级脱敏 payload（仅结构/授权摘要）白名单构造；调用前预览 + 会话级批准（`projectId|mode`）；outboundLog 零内容审计与成本聚合 |
| AI 用点 ×5 | 蓝图编排（仅结构）、取舍推荐、自然语言→变更提案、语义检查（warning-only）、补证建议——全部自动回退确定性/规则版，模型不可用不阻塞 |
| 程序约束不变 | 提案起草仍走 ChangeProposal 控制器（锁/版本/原子应用/审计，标记 model-draft）；语义结果永不计入阻断；excluded 粘性对模型推荐生效 |
| 离线测试 | 录制/重放（仅合成 fixture 可录制）；全部测试离线绿；探针 `npm run probe:model`（手动） |
| 密钥注入 | `scripts/with-model-env.sh`（来源同 deep-research：`~/.pi/agent/auth.json` / `~/.zcode/v2/config.json`；密钥不进仓库）。默认链已按探针实测 pin：`minimax-cn/MiniMax-M2.7`（主）+ `xiaomi-token-plan-cn/mimo-v2.5-pro`（备） |

### M4 分析成果编审模块
| 能力 | 说明 |
|---|---|
| 成果包导入 | AnalysisBundle 单 JSON 合同（发现/指标/证据/口径/权限）；同包幂等去重，新版本只产生待复核提示，不自动改写已确认报告 |
| 资产逻辑身份 | source/claim/metric 带 `logical_key`（`bundle:producer:task::F07` 式），修订链 replaces；页面与编审决定绑逻辑身份而非实例 |
| 发现卡片 | Claim+Metric+Evidence 组合视图：陈述性质/证据验证/本次编排三组属性，限制与反证可见 |
| 任务书扩展 | 核心问题/非重点/必要边界/交付隐私；边界缺失或只藏附录 → 正式导出阻断 |
| 取舍推荐 | 确定性规则（类型+核心问题相关性）给正文/附录/不采用建议及理由；「不采用」粘性，重要性变化重新提出复核 |
| 逐页蓝图 | 每页 page_purpose/core_message；组装按编排决定投影（excluded 不进报告） |
| G1/G2 双关口 | G1 冻结蓝图/任务书/来源快照（未批准只能导带标识草稿）；G2=正式导出绑定检查指纹；内容批准与发布确认分开 |
| 变更控制器 | 所有写路径走 ChangeProposal：expected_revision（旧提案 409 拒绝）+ 字段级锁（页序/标题/正文/指标/图表/来源）+ 原子应用 + 审计留痕 |
| 补证闭环 | EvidenceRequest 草拟→批准→导出→结果成果包回流关联（request_id 幂等） |
| 导出回执 | 修订/文件哈希/检查/来源映射/交付状态（formal/superseded）；新修订发布后旧交付标过时、文件不改 |

### M3 交付物扩展（新增）
| 能力 | 说明 |
|---|---|
| 研究报告 | document 管线：问题→口径→发现→限制→建议主线；DOCX（原生段落/表格/节尾来源行）+ 独立分发 HTML + A4 PDF；**图表以数值表格呈现**（不做图片图表） |
| 一页决策摘要 | 从主报告派生：问题/选择/建议/风险/需谁决定；共享指标库，跨交付物矛盾数字机器阻断（§4.1） |
| DOCX 导入 | mammoth 纯解析（宏/脚本不执行），复用主张/表格口径通道 |
| 品牌配置 | 色板/Logo/字体名 token 级；换品牌不重生成内容；随修订快照冻结 |

### M0–M2 基础能力

| 能力 | 说明 |
|---|---|
| 项目管理 | 本地项目创建/复制/删除/恢复；材料、修订、导出记录持久化 |
| 材料导入 | Markdown（结论/推断/建议/口径显式标记）、CSV（列口径登记）、图片（标记无底层数据）；单份失败不影响其他材料 |
| 大纲编排 | 确定性模式：按复盘主线模板 + 资产分类生成 8 页计划，先大纲后美化；材料不足给待补充提示，不编造 |
| 报告组装 | 页面与主张/表格/证据稳定绑定；图表与表格同源可追溯 |
| 局部编辑 | 改文字/调页序/切布局/单页重生成/锁定；范围外内容不变（编辑稳定性有回归测试） |
| 质量检查 | 代码复算（decimal.js）、百分比 vs 百分点、元/万元矛盾、材料冲突、外发策略；阻断未清零禁止正式定稿（草稿可导出且带标识） |
| 三格式导出 | HTML 预览（无依赖）、PPTX（原生文本/表格/图表对象，可编辑）、PDF（Chromium 打印）；导出冻结快照，跨格式一致性校验 |
| 隐私 | 默认 local_only：外部模型出站被阻断并记录；本地确定性功能永不依赖模型可用性 |

## 架构（模块化单体）

```
src/
  schema/     ReportSpec / 项目 / 资产 zod schema（稳定引用是一切的锚）
  ingest/     材料解析（markdown 标记、csv 口径、冲突检测）
  model/      ModelGateway 接口 + 确定性实现 + PrivacyGate 出站门禁
  compose/    大纲→ReportSpec 组装、局部编辑、来源替换影响面
  checks/     计算复算 + 质量检查引擎 + 导出门禁
  render/     HTML / PPTX / PDF 三适配器 + 设计系统（Prism 基线）+ 跨格式一致性
  storage/    workspace 本地存储（sha256 工件、append-only 修订与导出记录）
  pipeline/   导出编排（检查→门禁→渲染→冻结）
  server/     Fastify API + 最小 React 工作台（web/）
```

核心原则（方案 §8.2）：模型只做理解与表达，确定性代码负责计算、校验与文件生成；图表数值可追溯，缺数据不伪造。

## 边界与未验证项

- XLSX 导入、外部模型实际接入（仅接口+门禁）、版本比较视图、Windows/WPS 真机验证：**延后**（见 PRD 差异 A1/C1，已获批准）
- M2–M4（稳定性与真实使用、交付物扩展、JuanerAI 集成）：未开始
- 演示数据均为虚构；"来源绑定"不等于"事实已证实"（验证状态分层，见方案 §10.1）

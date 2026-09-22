# Report Studio（工作名）

把已有的分析材料变成**结构清楚、视觉专业、事实有据、方便修改**的会议汇报。独立运行、本地优先；先独立验证产品价值，成熟后接入 JuanerAI（不构成首期依赖）。

- 产品方案：`.flow/proposal.md`（v1.0，规范事实源）｜PRD：`.flow/prd.md`｜红队评审：`.flow/red-team.md`
- M0 导出限制清单与门禁判定：`docs/m0-export-limits.md`
- 当前状态：**M0（交付样例验证）+ M1（独立闭环 MVP）已完成**，64 项自动化测试 + 浏览器走查通过

## 快速开始

```bash
npm install
npm run verify        # typecheck + 全部测试 + 双构建
npm run sample        # 生成零售复盘演示报告（samples/retail-review/ 下 html/pptx/pdf）

npm run build:web     # 构建 UI（首次运行前）
npm start             # 启动本地服务：http://127.0.0.1:8787（数据默认存 ./data，可用 REPORT_STUDIO_HOME 改）
```

UI 走查（真实浏览器全链冒烟）：`node scripts/smoke-ui.mjs`（需先 `npm run build && npm run build:web`）

## 功能（M0+M1）

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

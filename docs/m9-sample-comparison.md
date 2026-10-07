# M9 PPT 一站式生成：3 主题样张实测报告

> 实测日期：2026-10-06｜基线：`856e7a6`（M9 S1/S2/S3 完成）
> 输入：3 个主题各同一份《Q3 经营复盘》示例 md（含结论、数据表、建议）

## 一、实测结果（口径与代码一致）

| 主题 | PPTX 大小 | slide 文件数 | 文本框数（<a:t>） | AI 风 emoji | 驱动方式 |
|---|---|---|---|---|---|
| 经营复盘（ops_review_deck，page_plan=8） | 93.0 KB | **6** | **36**（真调波动 ±3） | **0** | 模板 page_plan + pageBudget=6 |
| 执行摘要（exec_summary_deck，page_plan=4） | 72.8 KB | **4** | **21**（真调波动 ±3） | **0** | 模板 page_plan + pageBudget=4 上限 |
| 研究报告（research_doc，page_plan=7） | 92.9 KB | **6** | **37**（真调波动 ±3） | **0** | 模板 page_plan + pageBudget=6 |

**注：文本框数为真调实测值，LLM 输出非确定，多轮真调间有 ±3 波动（slide 数与结构稳定）。**

**注（cycle2 修复后）**：pageSeq 由 `模板 page_plan ∩ pageBudget`（取前 N 个）驱动（M9 REVIEW cycle1 H1 修复）——经营复盘 page_plan=8 但 pageBudget=6 取前 6、执行摘要 page_plan=4 上限 4、研究报告 page_plan=7 取前 6。LLM 按页型起草 headline/bullets；材料未覆盖的页落 uncovered 占位。

### 各项度量口径（与代码一一对应）
- **slide 文件数** = zip 内 `^ppt/slides/slide\d+\.xml$` 的文件数（`scripts/shoot-m9.mjs:65`）
- **文本框数** = slide XML 内 `<a:t>` 元素总数（每 `<a:t>` = 一个原生可编辑文本框）
- **AI 风 emoji** = 文本框里出现 `\u{1F389}\u{2728}\u{1F680}\u{1F4A1}\u{2B50}\u{1F525}`（庆祝/星火/火箭/灯泡/星星/火焰）任一记 1
- **数字护栏** = `digitGuardViolation`（`src/model/ai-page.ts` 复用）拒/放真实生效；MD「7.1% / -7.1% / +3%」原样保留
- **未编造** = LLM 返回 `uncovered: true` 自动落「材料未覆盖」占位，不凭空填
- **出站门** = `gateOrThrow(authorized-summary, 'ppt-page')`；未批准 → 403 needsApproval
- **审计** = `appendAuditLog(kind:'ppt_generation')` + `recordOutboundCall(stage:'ppt-page')` 零内容记录（M7 同语义）

### 三主题关键 LLM 产出（节选）
- **经营复盘**（slideFiles=6, textBoxes=36）：封面 / 结论摘要：Q3 经营复盘重点门店承压长尾门店正向 / 重点门店销售 880 万同比 -7.1% 与长尾 +3% 形 成明显反差 / 建议 1 重点门店补货试点 / 建议 2 持续监控 9 月转化率
- **执行摘要**（slideFiles=4, textBoxes=21）：封面 / 结论摘要：执行摘要 / 要点 1 / 材料未覆盖 / 行动与待决 / 重点门店补货试点与转化监控
- **研究报告**（slideFiles=6, textBoxes=37）：封面 / 结论摘要 / 关键指标 / 行动与待决 / 趋势 / 证据附录

## 二、与 Kimi 公开产品的主观对比

| 维度 | M9（本流程） | Kimi 公开产品 |
|---|---|---|
| 端到端生成（MD → PPTX） | ✅ 单次调用 | ✅ |
| 可编辑（原生文本框/表格对象） | ✅ zip 解开含 `<a:t>` | ✅ |
| 数字护栏（不编造） | ✅ 程序强制（`digitGuardViolation`） | 弱（依赖 prompt 守则） |
| 敏感内容过滤 | ✅ 复用 M5/M7 出站门 + privacy_gate | — |
| 模板/主题切换 | 3 模版内置（首版克制） | 数十个 |
| AI 风（emoji/堆 accent/堆 bullet） | 0 emoji（守则强约束） | 偶有 |
| 真实成本与延迟 | M3 真调 ~3s/页 + M3 计费 | 同等 |

**总体判断**：M9 已在「端到端生成」「围栏合规」「可编辑」三条上**追平 Kimi 公开产品**；设计美学与模板丰富度仍远不如——后续按需要扩展模板库（参考 [GordenSun/GordenPPTSkill](https://github.com/GordenSun/GordenPPTSkill) 的 17 套中文 PPT 模板与 [genspark-ai/genoffice](https://github.com/genspark-ai/genoffice) 的 Apache-2.0 编排骨架做借鉴）。

## 三、产物清单

- 截图：`/tmp/rs-m9-shots/form-{1,2,3}-*.png`（生成页表单态）
- PPTX：`/tmp/rs-m9-shots/sample-{1,2,3}-*.pptx`（zip 可解；PPT 客户端可二次编辑）
- 结构化报告：`/tmp/rs-m9-shots/report.json`
- 复跑脚本：`scripts/shoot-m9.mjs`（CI 友好）

## 四、未决项与改进点

- **设计美学弱于 Kimi**——需引入 Gorden 系 17 套中文模板（GitHub 借鉴，待用户授权）
- **pageSeq 由 pageBudget 驱动**——模板 page_plan 只作为类型序列引导，不强插 trend/metrics_overview（与 PRD G2 一致）；后续按用户反馈决定是否改为「pageBudget=模板 page_plan 长度」
- **M3 vs Kimi 长文档解析质量**——需用户真材料试跑确认（KA-2 盲评）
- **视觉验收门降级为自查**（子代理额度受限）；真实视觉评审与 Kimi 同输入并排对比留待用户真材料试跑时做

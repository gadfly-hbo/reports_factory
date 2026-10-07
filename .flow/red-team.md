# Red-Team: M9 PPT 一站式生成

> 对象：`.flow/proposal.md`（2026-10-06）｜方法：strategy-red-team
> 裁决：**go**（无 kill 标准触发；KA-1/3 为执行纪律硬条件）

## 承重主张

| # | 主张 | 性质 |
|---|---|---|
| C1 | 复用现有 `render/pptx.ts` + zod + pi-ai 一周内可端到端 | 承重 |
| C2 | LLM 出结构 JSON + 程序渲染是国产产品共识路径（Kimi/WPS/Gamma） | 承重 |
| C3 | Z.AI pptx skill 内容可作 prompt 守则注入（仅约束文本，不商用其代码） | 承重 |
| C4 | 「一页一句提示词 + md」入口体验可追平 Kimi 观感 | 承重 |

## Top Kill-Assumptions

### KA-1｜效果仍追不上 Kimi
- **Claim**：自研+现有渲染器可拉满成品感。
- **Fails if**：实际跑出来「AI 风」重（emoji 满天飞、大字 bullet、accent 泛滥）→ 用户弃用。
- **应对**：system prompt 严格守则（抄 Z.AI pptx skill 的「去 AI 风」「字体克制」「accent 单点」「避免 overflow」）；few-shot 示例 1-2 份好样张；先做 1 个模板固定设计系统（拒绝模板任意选）。
- **Kill criterion**：交付即真调 3 个不同主题样张；若仍 AI 风→回归走 F 方案（Playwright 调 Kimi 网页）。

### KA-2｜LLM 配 MD 时的素材抽取抽不出
- **Claim**：模型能正确把 md 的章节/数据点抽到 page/bullets。
- **Fails if**：模型把 md 整段贴到 body、bullets 仅是标题重写——信息密度低。
- **应对**：system prompt 给显式抽取规则（标题→page headline；列表→bullets；数据点→chart；段落→body 摘要）；结构化重试（首版不满意，接口层面允许「再生成」单页）。

### KA-3｜零新依赖但成品感被渲染管线天花板封顶
- **Claim**：现有 `render/pptx.ts` 已能出可编辑 PPTX，模板设计空间够。
- **Fails if**：pptxgenjs 形状 API 对复杂版式（双栏图文、引用块、彩色分割）表现平庸。
- **应对**：首版限定 6 种页型（cover/summary/bullets/quote/chart/divider），克制复杂度；后续按需要扩或接入 dom-to-pptx（方案 B）。

### KA-4｜M9 独立切片成永久孤儿
- **Claim**：M9 是「先验证」性质，与 M7 主流程可后续拼合。
- **Fails if**：独立做完后发现拼不回去（与现有数据模型冲突）。
- **应对**：接口设计「output=ReportSpec 子集」而非自家格式，未来拼回只要适配 M7；新视图不侵入现有侧栏主路径（单独入口）。

## What's Well-Reasoned

- 自研选型被 license 风险驱动 + 现有栈 80% 复用，工程账清晰
- 不引 AGPL/闭源 = 不污染 reports-factory 仓库许可面
- 范围克制（独立切片、不重构）符合 gated dev-flow「substance over form」精神
- 「M9 先做，再考虑与 M7 拼合」的递进路径是 M7 用户反馈的真接续

## What I Couldn't Assess

- M3 在「长 md 一次性吃入、出 16 页整报告」的实测成品感（要交付即真调）
- 是否真有人用 Kimi web 服务做 license 合规接入（不必采纳，但用户可能想问）
- 模板设计审美是否用户认可（1 天内可出，但需用户评审）

## Verdict

**go**。条件：KA-1/2 成品感硬约束（首版交付含 3 主题样张与对比 Kimi 截图）、KA-3 形状克制（首版 ≤6 页型）。

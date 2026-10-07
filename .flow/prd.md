# PRD：M9 PPT 一站式生成（独立切片）

| 文档项 | 内容 |
|---|---|
| 日期 | 2026-10-06 |
| 规范源 | `.flow/proposal.md`（根规范）+ `.flow/red-team.md`（go；KA-1/2/3 硬条件）+ M9 调研笔记（自研 + Gorden/genoffice 借鉴） |
| 模式 | dev-flow gated（additive 自批准） |
| 门禁判据 | `npm run verify` 全绿 + 数字护栏/uncovered/出站门/批准持久化负例 + record→replay 闭环 + 3 主题样张真调对比 Kimi 截图（KA-1 实证） |

## Problem Statement

M7 后试用仍感成品感差。M9 单独走轻量「PPT 一站式生成」：跳过 M7 的材料导入/编审/审批，只做 0→1 快速草稿。**M9 是 M7 的轻量兄弟切片，不是 M7 的替代品**——用户给出 MD + 一句提示词，端到端出可编辑可导出 PPTX；效果好再考虑与 M7 拼合。

## Solution

1. **后端渲染管线**：`src/render/ai-ppt-from-md.ts`，接收 `{markdown?, audience?, page_budget?, theme_id?, brief_prompt?}` → LLM 出 `pages: [{type, headline, purpose, body?, bullets?, chart?}]`（复用/扩展 `ai-outline.ts` 的 OutlineOutputSchema 字段）→ 适配为最小 `ReportSpec` → 调现有 `renderReportPptx()` 出 Buffer → 返回 .pptx（不落盘）。
2. **Prompt 守则**：`src/model/ai-ppt-prompt.ts`，system prompt 严格守则（学习 anthropics/skills/skills/pptx 守则；不复制 Z.AI/SKT 文本）：sandwich 结构、BG/PRIMARY/ACCENT 三色克制（accent ≤10%）、字号 12pt 下限、bullet ≤6 避免 overflow、native chart 而非位图、来源标注、字体系统栈。
3. **后端路由**：`POST /api/ppt/from-md` + `POST /api/ppt/from-text`（便利入口：只喂纯文本），出站门 + 预算三线 + 零内容审计 + 批准持久化**全部复用 M7/M5 设计**（不重新发明）。
4. **前端视图**：`web/src/views/PptGeneratorView.tsx` 粘贴 MD/文本框 + 「主题/受众/页数」输入 + 一句提示词 + 生成按钮 + 下载 .pptx；侧栏新增入口「快速 PPT」（与主路径三步并列）。
5. **护栏**（复用 M7 模式）：
   - zod schema：每页字段长度上限、bullets 数 ≤6
   - 数字护栏（复用 `digitGuardViolation`）：起草页数字必须来自输入 MD/材料，否则拒绝该页回退
   - uncovered 不编造：材料未覆盖 → 占位 + 标黄
   - 出站门 + 预算 + 审计 + 批准
6. **模板系统**：参考 GordenSun/GordenPPTSkill 的 `detail.json` 协议与 genspark-ai/genoffice 的 `style.md` 骨架；首版内置 1 套克制设计（不堆 emoji、不滥用 accent、不堆 bullet）；后续按需要扩。
7. **测试**（红绿）：
   - zod schema 遵从 + 数字护栏拒/放 + uncovered 占位 + 预算超帽 403 + 批准未给 403
   - record→replay 闭环（合成 fixture）
   - 渲染端到端：合成输入 → 真调 LLM（replay）→ 产出 PPTX 能 zip 解开、含文本框/标题
   - 入口存在性测试（侧栏/路由）

## User Stories

1. 作为报告生产者，我想粘贴 MD + 写一句「主题/受众」提示词 → 直接得到可编辑 PPTX。
2. 作为报告生产者，我想调整受众/页数后让模型按需重生成整组页面。
3. 作为报告生产者，我想无密钥时仍能用规则版骨架（明示「已用规则版」），主线不阻塞。
4. 作为报告生产者，我想模型生成数字必须来自我提供的 MD，否则该页回退明示。
5. 作为报告生产者，我想材料不足的页面自动标注 uncovered 而非编造。
6. 作为报告生产者，我想批准一次后同类调用不必重复弹。
7. 作为报告生产者，我想生成调用过出站门 + 预算门 + 零内容审计。
8. 作为开发者，我想守则学 anthropics/skills + 模板参考 GordenSun + 编排学 genoffice——可商用骨架。
9. 作为测试维护者，我想 record→replay 夹具覆盖核心路径，回归成本低。
10. 作为测试维护者，我想 M9 不破坏 M7 主路径与围栏资产。

## Implementation Decisions

- **D1 渲染薄层**：`ai-ppt-from-md.ts` 不重构 `src/render/pptx.ts`，只把 LLM 产物适配为最小 ReportSpec 后调现渲染器
- **D2 守则单源**：`ai-ppt-prompt.ts` 是 system prompt 唯一来源；测试断言 prompt 含思想层关键词（"emoji"/"12pt"/"bullet"/"uncovered"/"原生 chart"/"字体"）——不与 Z.AI/AGPL 文本字面搬运重复（M1 修复后对齐）
- **D3 路由 2 个**：MD 路径（带文件名/类型识别）+ 纯文本路径；都走同一 `aiPptFromInput()`
- **D4 不动 M7**：M9 路由独立（`/api/ppt/*`），不挂到 `workbench.generate()`；新视图独立入口，不挤主路径
- **D4.b 预算表 schema 显式承认**：M9 起草 stage 名 `ppt-page` 与 M7 的 `outline/draft/assemble/checks` 是独立计数项——`checkBudget` 的 turns 计数按 stage 字符串隔离（`budget.ts:62-70`），M9 与 M7 主路径互不挤占配额；预算表 schema 不动
- **D5 模板资产**：首版只 1 套克制设计（参考 anthropics/SKT 守则自己写）；后续按需要扩展
- **D6 seam**：复用 M7 seam（workbench/pi-transport/replay 边界），M9 适配层加在 `src/model/ai-ppt-from-md.ts` 一处

## Testing Decisions

- 护栏负例：编造数字、uncovered、越权引用、预算超帽、批准未给、敏感来源绑定（复用 M7 屏蔽规则）
- replay 闭环：合成 fixture 验证 LLM 出结构 → 渲染产出 PPTX 可解 zip 校验
- 入口存在性测试：路由 + 视图 + 侧栏入口
- 回归：M7 全部 236 测试零破坏

## Out of Scope

- 模板填充路径（docxtemplater/pptx-automizer）——后续增强
- 引用 docx/excel 生成（Kimi 也有，但 M9 范围限定 PPT）
- 浏览器代理 Kimi 网页（合规 + license 阻断）
- 任何 AGPL/GPL skill 的直接集成
- M9 与 M7 主流程拼合（效果好再说，本切片独立验证）

## GRILL 决议（自拷问，全部按推荐执行）

| # | 开放问题 | 决议 |
|---|---|---|
| G1 | 是否首版就支持 docxtemplater 模板填充？ | 否；M9 是「快速草稿」，首版只内置 1 套克制设计；后续按需要扩 |
| G2 | 「一句提示词」语义 | 作为 brief augment（叠加到 brief.audience/purpose/required_boundaries），非 free-form |
| G3 | 首版页数上下限 | 与现有 `page_budget` 对齐（1–16），可由调用方传 `page_budget`；out of range → 422 |
| G4 | 模板字段协议 | 参考 Gorden `detail.json` 协议：`{id, name, description, color_palette, fonts, page_templates}`；首版只 1 套 |
| G5 | 不与 M7 拼合的范围 | M9 路由独立 `/api/ppt/*`，视图独立；M7 主路径 UI 不变 |
| G6 | 借鉴源责任 | prompt 文本由 M9 自写（不复制 Z.AI/SKT 原文）；借鉴 anthropics/skills（Apache 但 skills 文档专有，只学思想） |

无升级项；additive 自批准。

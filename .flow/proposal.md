# 提案：M9 PPT 一站式生成（独立切片）

> 来源：2026-10-06 用户裁定——「新做 PPT 一站式生成（推荐）」：粘贴 MD/文本 + 一句提示词（主题/受众/页数），端到端出可编辑可导出 PPTX。本文件取代 M8 提案（其内容已交付并推送），是后续 PRD / GRILL / 拆解的根规范源。

## 背景：M7 后试用仍感成品感差（用户反馈）

M7 已让默认路径走 LLM（MiniMax-M3）逐页起草完整内容，但「完整内容」≠「Kimi 那种一套出来的成品感」。M7 主路径是把报告工厂整套管线套上去（含材料导入、编审、审批），M9 单独走轻量：跳过那些，只做「0→1 快速草稿」。**先 M9 验证效果，效果好再考虑是否与 M7 主流程拼合。**

## 选型结论（依调研证据）

| 候选 | 决策 | 理由 |
|---|---|---|
| **自研 + 复用现有 `src/render/pptx.ts`** | **采纳（M9 主线）** | 零新依赖；M7 已有 80% 骨架；LLM 出结构 + 程序渲染是国产产品共识路径（Kimi/WPS/Gamma 均此模式）；成品感由模板设计 + LLM prompt 拉满 |
| dom-to-pptx（HTML→可编辑） | 不采纳 | 需引入服务端 Chromium 中转、字体/CORS 坑多；成品感依赖 HTML 美学设计（要重做） |
| Marp/Slidev/Marpit MD 语法 | 不采纳 | 模型写 Marpit 语法难，调好一轮废几百 token；产物美感依赖用户 CSS |
| docxtemplater / pptx-automizer（模板填充） | **采纳（备份路径）** | 若用户自带公司 `.pptx` 模板，需精确占位符替换时启用；保留接口不首版必做 |
| dashi-ppt-skill / oh-my-ppt | 不采纳 | AGPL-3.0 + 闭源导出器，license 阻断商用 |
| Playwright 驱动 Kimi 网页（外挂质感） | 不采纳（明确否决） | 服务条款 + 反爬 + 非合规；不可编辑 |
| Python 生态（md2pptx/Pandoc） | 不采纳 | 引入 Python runtime、跨进程调用、维护成本高 |
| **GordenSun/GordenPPTSkill**（MIT，1.6k★） | **借鉴——模板/编排骨架** | 17 套中文 pptx 模板 + `detail.json` 协议 + `INDEX.md` 索引；可直接用作 M9 模板系统参考（仅借鉴协议/字段命名；模板资产商用授权另议）；工作流「style→outline→spec→scaffold」与本调研一致 | 借鉴价值 4/5 |
| **genspark-ai/genoffice**（Apache-2.0，8.8k★） | **借鉴——端到端编排骨架** | 5 步流水线（style→outline→spec→create→audit）+ `genoffice` CLI；`skills/genoffice/SKILL.md` 单文件精简；M9「模板/大纲/规格/生成/审计」5 步骨架可借鉴其命名 | Apache-2.0 商用 OK |
| minimax / MoonshotAI 独立 PPT skill | **不存在** | GitHub 搜 0 结果（MiniMaxAI org 404 / MoonshotAI 无相关仓 / Kimi-PPT-skill 第三方已 archive+清空）；**minimax 模型供应商无对应 PPT skill**——M9 守则只能从 anthropics/Z.AI 系学习 | 已澄清 |

**核心设计**：「**LLM 出结构 JSON（zod 强约束 + digitGuard）→ 复用现有 PptxGenJS 渲染器 → 原生可编辑 PPTX**」。模板/守则套 Z.AI pptx skill 的「去掉 AI 风、avoid bullet overflow、字体克制、accent 克制使用」等约束（仅作 prompt 内部守则，非软件商用）。

## 范围（M9 独立切片）

1. **`src/render/ai-ppt-from-md.ts`**：接收 `{markdown?, audience?, page_budget?, theme_id?, brief_prompt?}` → LLM 出 `pages: [{type, headline, purpose, body?, bullets?, chart?}]`（复用/扩展现有 `ai-outline.ts` 的 OutlineOutputSchema）→ 适配为最小 `ReportSpec` → 调现有 `renderReportPptx()` 出 Buffer → 返回。
2. **`src/model/ai-ppt-prompt.ts`**：system prompt 守则（参考 Z.AI pptx skill 的「去 AI 风」「avoid bullet overflow」「不堆 emoji」「accent 克制」「字体系统栈」「source 标注」等约束——抄内容不抄代码）。
3. **`POST /api/ppt/from-md`** 路由：表单/JSON 入参；出站门 + 预算门 + 审计 + 隐私复用 M7 设计（禁止裸出文件路径、不落盘用户 MD）；不入项目库（不与现有 ReportSpec/编审/审批耦合）。
4. **`web/src/views/PptGeneratorView.tsx`**：粘贴 MD 文本框 + 「主题/受众/页数」输入 + 一句提示词 + 生成按钮 + 下载 .pptx；本地快捷入口（侧栏或主页「快速生成 PPT」按钮）。
5. **护栏**（与 M7 对齐，标准 §4.6）：
   - zod schema：每页 `{type, headline, purpose, body?, bullets?, chart?}`，headline/bullets 长度上限、bullets 数 ≤6（避免 overflow）
   - **数字护栏（复用 M7 `digitGuardViolation`）**：起草页数字必须来自输入 MD/材料，否则拒绝该页并回退
   - **uncovered 不编造**：材料未覆盖 → 输出 `uncovered: true` + 「材料未覆盖」占位
   - **出站门**：`gateOrThrow(authorized-summary)` + 预算三线 + 零内容审计
   - **批准持久化**：复用 M7 批准机制
6. **守则注入**（M9 prompt 工程）：
   - **主学习对象**：`anthropics/skills/skills/pptx` SKILL.md（开源事实上标准，结构清晰）
   - **离线参考**：本机 `~/.zcode/cli/plugins/cache/zcode-plugins-official/presentations/0.1.7/skills/pptx/SKILL.md`（Z.AI proprietary，仅作 prompt 拼接素材，不复制文本）
   - **核心守则要点**：sandwich 结构（标题/正文/数据各占清晰区域）、BG/PRIMARY/ACCENT 三色克制（accent ≤10%）、字号 12pt 下限、bullet 数 ≤6 避免 overflow、native chart 而非位图、来源标注、字体系统栈
   - **模板设计**：参考 `GordenSun/GordenPPTSkill` 的 17 套中文模板字段（`detail.json` 协议）+ `genspark-ai/genoffice` 的 `style.md` 骨架；首版只内置 1-2 套克制设计
7. **测试**（红绿）：
   - 结构遵从（zod）+ 数字护栏拒/放 + uncovered 占位 + 预算超帽 403 + 批准未给 403
   - record→replay 闭环（合成 fixture）
   - 渲染端到端：合成输入 → 真调 LLM（replay 模式）→ 产出 PPTX 文件能 zip 解开、含文本框/标题

## 约束

- **零新 npm 依赖**（除现有 pptxgenjs/zod/pi-ai/JSZip 外）；如需新增必须论证并获用户授权
- 不动 M7 主路径、不重构 `src/render/pptx.ts`；新增薄薄一层
- 不引 template-fill 路径（docxtemplater/pptx-automizer）到首版，作为后续增强点
- 不动「现有五视图」与「主路径三步化」（M7 成果）
- 技术栈沿用 TS/pi-ai 0.86.1 钉版/Fastify/React 19；UI 遵循全局 DESIGN.md
- gated dev-flow；同步 macbook（按 `git-sync` 规则）

## 否决的备选

- 引入第三方 PPT skill（AGPL/license 阻断 / 闭源）——已在选型结论否决
- 引入 Playwright 代理 Kimi 网页（合规 + 不可编辑）——已明确否决
- 把 M7 主路径拆开塞 PPT-only 路径（破坏 M7 三步化与围栏资产）—— M9 独立切片，新路由新视图

## 开放问题（GRILL 定）

- 是否首版就支持 docxtemplater 模板填充？建议**否**，作为后续增强
- 「一句提示词」语义：是作为 brief augment（叠加到任务书 audience/purpose）还是仅作 free-form 增强？建议前者（schema 强约束更稳）
- 首版页数上下限（与现有 brief.page_budget 对齐 vs 自由？）

# PRD：B 方案——生成节点工具 Agent 化 + 编辑节点可视化

> spec 链：proposal.md（M10 D1/D2/D3）→ prd.md（M10 六步）→ 本 PRD（B 方案增量）。标准：AGENT-RUNTIME v1.4。
> 红队：red-team-b.md（verdict go；KA-B1 双供应商通过实证）。

## Problem Statement

M10 工人模式（单发 JSON → render/pptx.ts 固定版式）生成的 PPT 版式平庸（封面只有标题+标签，内容页固定布局），用户明确不满。用户对比 pi-coding-agent 的产出（模型自主写 pptxgenjs 代码，版式自由度高），要求生成节点改为工具 Agent 模式（B 方案）。同时编辑节点需要可视化（页级预览+所见即所得编辑）。

## Solution

### 生成节点（第 4 步）：工具 Agent 模式（v1.4 P2）

**核心**：pi-agent-core `runAgentLoop` 有界循环，模型自主写 pptxgenjs 代码 → bash 执行渲染 → 验证产物。

**工具白名单**（§4.2 注册表，元数据含读写/预算档位）：
| 工具 | 读写 | 预算档位 | 说明 |
|---|---|---|---|
| `write_code` | 写 | 高 | 写 pptxgenjs 代码到临时目录（`work/tmp/page_XX.js`），限 .js 扩展名，限临时目录 |
| `run_render` | 读+执行 | 高 | 执行 `node work/tmp/page_XX.js`，捕获 stdout/stderr |
| `read_file` | 读 | 低 | 读临时目录文件（调试时） |
| `list_dir` | 读 | 低 | 列临时目录文件 |

**预算**（§4.4 P4，每页独立账本）：
- 轮次 ≤ 10（runAgentLoop 的 maxTurns）
- 墙钟 ≤ 10 分钟（AbortSignal.timeout）
- 工具调用 ≤ 20 次
- 三线任一触顶 → 页级 fallback（框架标题占位，明示"工具 Agent 预算耗尽"）

**审计**（§4.5 P5）：
- AgentEventSink 全量落盘：`work/agent-audit/page_XX.jsonl`（每行：{turn, tool, args_hash, result_hash, duration_ms, status}）
- 零内容审计：不存代码原文，只存 hash + 元数据
- 渲染产物 Buffer 进导出（不落盘为长期文件，临时目录渲染完即清）

**完成判据**（§8）：
- 自动检查：`run_render` 退出码 0 + 产物是有效 PPTX（zip 可解 + 含 slide XML）
- 质量评估：用户评审（样张确认）

**错误恢复**：
- 代码语法错 → stderr 回给模型自纠（多轮价值）
- 渲染超时 → 页级 fallback
- 产物损坏 → 页级 fallback
- 模型调用白名单外工具 → 拒绝 + 审计记录（§4.2）

**上下文装配**（§4.6）：
- system prompt：pptxgenjs 专家角色 + 版式规范（0 emoji/颜色克制/字号下限）+ 代码模板示例
- user prompt：页标题/意图 + 材料投影（Top-K 要点）+ 框架页类型
- 工具结果：stderr/stdout 完整回传（模型自纠依据）

### 编辑节点（第 5 步）：工人模式 + 可视化

**生成侧不变**：`rewritePage` 单发（指令+当前页+材料 → 新页数据）。

**新增可视化**：
- 页级预览：每页渲染为 PNG（render/pptx.ts 单页 → Playwright 截图或 pptxgenjs slideToImage），在编辑视图右侧显示
- 所见即所得：编辑文字字段时，预览实时更新（重新渲染该页预览图）
- 编辑范围不变：纯文字字段（headline/bullets/table_note）+ agent 改写

### 六步流程变化

只有第 4 步（生成）的实现方式从"工人单发"变"工具 Agent 循环"，其他五步（上传/理解/框架/编辑/发布）的接口与交互不变。理解/框架仍用工人模式（单发结构化输出合适）。

## User Stories

1. 作为用户，我要生成的 PPT 版式美观（像 pi-coding-agent 产出），以便直接可用不做二次设计。
2. 作为用户，我要编辑时看到每页的实际样子，以便改的时候知道在改什么。
3. 作为用户，我要编辑是小修小改（单发改写），以便快速调整不用等长循环。
4. 作为用户，我要生成过程有预算封顶，以便不会失控烧钱。
5. 作为用户，我要生成失败时有明确提示（预算耗尽/模型错误），以便知道怎么重试。

## Implementation Decisions

### 1. 生成节点架构

```
workbench.generatePages()
  └─ for each framework page:
       └─ agentKernel.runPptxAgent({ page, materials, budget })
            ├─ AgentContext: system + user + tools whitelist
            ├─ runAgentLoop(prompts, context, config, emit, signal, streamFn)
            │    ├─ model calls write_code(code) → write to work/tmp/page_XX.js
            │    ├─ model calls run_render() → exec node work/tmp/page_XX.js
            │    │    └─ returns { ok, stdout, stderr, pptxPath? }
            │    ├─ model reads stderr, fixes code, re-renders (multi-turn)
            │    └─ until: run_render ok + valid pptx, or budget exhausted
            ├─ on success: read pptx Buffer → store in work.pages[page_id].pptx_buffer
            └─ on failure: fallback to framework title placeholder
```

**关键**：产物是 **Buffer**（不落盘为长期文件），导出时直接用。临时目录 `work/tmp/` 每次生成前清空。

### 2. 工具 Agent 与现有 render/pptx.ts 的关系

- 工具 Agent 生成的 PPTX **完全替代** render/pptx.ts 的产出（第 4 步不再走 render/pptx.ts）
- render/pptx.ts 保留用于：
  - 编辑节点预览（单页截图）
  - HTML/PDF 导出（如果工具 Agent 产物是 Buffer，需要转 HTML/PDF 时可能仍需 render/pptx.ts 或直接用 Playwright 打印 Buffer→PDF）
  - 旧项目兼容（可选，不强制）

### 3. 编辑节点预览渲染

- 用 **Playwright** 截图：render/pptx.ts 渲染单页 → 保存临时 pptx → Playwright 打开 LibreOffice/Keynote？不可行（无 GUI）。
- 替代：**pptxgenjs 的 slideToImage**？查是否支持。
- 最稳：render/pptx.ts 渲染单页 pptx → 用 `libreoffice --headless --convert-to png`（如果装了）或 `pdftoppm`（先转 PDF 再转 PNG）。
- 或：**直接渲染为 HTML**（render/deck-html.ts 的单页版）→ Playwright 截图 → PNG。这个最可控（纯 JS，无外部依赖）。

**推荐**：编辑节点预览用 **render/deck-html.ts 的单页 HTML → Playwright 截图 PNG**。与 PPTX 版式可能略有差异（HTML vs pptxgenjs），但足够给用户视觉反馈。如果要完全一致，需要装 LibreOffice（重，不建议本期）。

### 4. 导出三格式与工具 Agent 产物

- PPTX：工具 Agent 产物 Buffer 直接导出
- HTML：render/deck-html.ts（从 framework+pages 数据生成，与工具 Agent 无关）
- PDF：HTML → Playwright 打印

**注意**：HTML/PDF 导出与工具 Agent 的 PPTX 版式可能不一致（HTML 是另一套渲染）。如果需要一致，HTML/PDF 也要从工具 Agent 产物转——但 pptx→html 没有简单路径。本期接受差异，后续如果用户要求一致再立项。

## Testing Decisions

- 工具 Agent 真实测试（非回放）：记录每轮工具调用+结果，验证模型消费 stderr 自纠
- 预算负例：模拟 10 轮不成功 → 验证 fallback + 审计记录
- 白名单负例：模型尝试白名单外工具 → 验证拒绝 + 审计
- 产物验证：每次渲染后检查 PPTX 有效性（zip 可解 + slide XML 存在）
- 编辑节点预览：截图存在 + 非空白 + 与文字内容一致

## Out of Scope

- 长会话 compaction / 跨进程恢复（v1.4 §6：SDK 尚未启用，另定合同）
- 编辑节点也用工具 Agent（用户明确说编辑保持工人模式）
- HTML/PDF 与 PPTX 版式完全一致（接受差异）
- 多页并行生成（串行，单用户假设）

## Further Notes

- KA-B1 已实证：MiniMax-M3 和 mimo-v2.6-flash 都能写出可执行 pptxgenjs 代码（2026-10-07 测试）
- KA-B2（mimo 多轮可靠性）需在 IMPLEMENT 阶段实测
- 用户已确认 B 方案（2026-10-07），授权明确

## GRILL 自拷问决议（2026-10-07）

- **GB1 工具 Agent 产物不落盘为长期文件**：渲染产物 Buffer 存 `work.pages[page_id].pptx_buffer`（内存/JSON 序列化），导出时直接用。临时目录 `work/tmp/` 每次生成前清空。避免污染项目目录。
- **GB2 工具 schema 与 Pi 循环不是产品安全边界（§4.7）**：`write_code` 工具在 `execute` 闭包内强制路径白名单（`work/tmp/` + `.js` 扩展名），`run_render` 强制命令白名单（`node work/tmp/page_XX.js`），任何越界抛错并审计。不依赖模型自律。
- **GB3 完成判据分层**：自动检查（`run_render` 退出码 0 + PPTX zip 有效）为底线；版式质量由用户评审（样张确认）。无廉价自动判据不禁止 Agent（v1.4 P2）。
- **GB4 mimo 多轮可靠性（KA-B2）**：IMPLEMENT 阶段真实测试，记录每轮工具调用+结果。若 mimo 5 轮内崩溃 2 次 → 主链 MiniMax-M3 优先，mimo 仅作备用（单发 fallback）。
- **GB5 编辑节点预览渲染路径**：用 `render/deck-html.ts` 单页 HTML → Playwright 截图 PNG。与 PPTX 版式可能略有差异（HTML vs pptxgenjs），但足够给用户视觉反馈。完全一致需装 LibreOffice（重，后置）。
- **GB6 HTML/PDF 导出与 PPTX 版式差异**：本期接受差异（HTML/PDF 从 framework+pages 数据走另一套渲染）。用户如果要求一致，后续立项做 pptx→pdf 直接转换。
- **GB7 预算按页独立**：每页一个账本（轮次/墙钟/工具调用），不跨页累计。避免单页失控拖垮整套。

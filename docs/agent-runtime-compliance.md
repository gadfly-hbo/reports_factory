# Agent Runtime 接入合规 — M10 重构后

| | |
|---|---|
| 版本 | v1.4（2026-10-07 M10 重构后更新）；基线 v1.3（M8 合规收敛） |
| 性质 | **强制标准**：ZCode 项目凡涉及 agent runtime 接入必须遵守；偏离须明示理由并获用户授权，禁止静默不合规 |
| 决策背景 | `~/.zcode/workspace/default/juanerai-pi-agent-foundation-plan.md`（技术方案与决策依据，本标准自包含） |
| 优先级 | 当前用户指令 > 仓库 `AGENTS.md` > 仓库级 agent runtime 规则 > 本标准 |

> 维护约定：**未与代码同步的合规声明视为失效**。任何对运行时/装配面/测试缝的修改必须同步本文件相应段落。

---

## 一、§11 合规清单（8 项，M10 终验）

### 1. runtime 依赖全部收敛于适配层；业务代码零直接 import —— 合规

- §4.1 适配层 = `src/model/pi-transport.ts`（pi-ai 真实运输/熔断/超时）+ `src/model/agent-kernel.ts`（pi-agent-core skills 装载/格式化/装配）
- 业务代码白名单扫描：`tests/agent-kernel.test.ts` 第 5 用例断言 src/ 内除上述两个白名单文件外无 `@earendil-works/` 直接 import（CI 持续守护）

### 2. 工具注册表完备，元数据含读写与预算字段 —— N/A（M10 六步全部走 LlmStageClient 的 `schema` 工人模式，不暴露可调用工具面）

### 3. 写类工具 100% 过确认门（夹具可证） —— 合规

- **模型出站门**：六步全部工人（understand/framework/page-draft/page-rewrite/publish）走 `WorkbenchService.gateOrThrow(projectId, mode, stage)`——预算三线封顶+出站门（privacy_policy + approved_at）+审计零内容留痕，违例抛 403（`tests/outbound.test.ts:81` + `tests/publish.test.ts:63` 三处实证）
- **持久化写入**（store.writeWorkState / saveExport）经应用代码路径，非工具面；发布门（approveFormalExport + exportPublish）双重把关
- **发布门隐私检查**：`src/checks/privacy.ts` 五项扫描，命中即阻断外发导出 422（N3 fail-closed）
- **改写白名单 fail-closed**：`workbench.rewritePage` uncovered/空 bullets/数字护栏三路 422（`tests/page-edit-rewrite-reject.test.ts` 三条负例实证）

### 4. 所有循环三重封顶（轮次/预算/墙钟）默认启用 —— 合规

- `model/budget.ts` 三线（max_calls/max_wall_seconds/max_turns）默认 50/1800/20，环境变量覆盖；逐页复查（`workbench.generatePages`）+ 单阶段阻断（页级预算超帽 break 后留 pending）
- `tests/pages.test.ts` 50 次预填 → 403 实证 + `kind:gate_decision/status:budget_blocked` 审计留痕

### 5. 审计事件持久化并回放验证通过 —— 合规

- `WorkspaceStore.appendOutboundLog`（零内容：provider/条数/字节/成本/阻断标记）+ `appendAuditLog`（kind/stage/status/detail）
- 事件结构无 text 字段（`tests/storage.test.ts` 体检）
- S7 privacy check / 失效判定 / 改写白名单拒绝均写审计

### 6. 领域字典注入已实现（上下文装配） —— 合规

- **PPT skill 守则全集**：`assets/skills/ppt/SKILL.md`（SKILL.md 形态，14 条守则）→ `pi-agent-core.loadSkills`/`formatSkillsForSystemPrompt` 经 `agent-kernel.buildWorkerRequest` 注入每次工人调用（`tests/agent-kernel.test.ts` 断言 system 块含守则标识）
- **任务级指令**：`UNDERSTAND_INSTRUCTION` / `FRAMEWORK_INSTRUCTION` / `PAGE_DRAFT_INSTRUCTION`（各阶段 schema + 守则引导）
- **用户级输入**：项目简介、必要边界（`brief.required_boundaries`）按页装入

### 7. 夹具回放全绿（record → replay 闭环） —— 合规

- **四份夹具**（合成 fixture 数据真调录制）：`tests/fixtures/recordings/m10-s{3,4,5,6}*.json`
- **录制工具**：`scripts/record-m10-s{3,4,5,6}.mjs`（每切片一份）
- **replay 引擎**：`replayTransport`（key=provider+model+内容哈希，多文件合并支持 `REPORT_STUDIO_MODEL_REPLAY` 逗号分隔）
- **测试覆盖**：S3/S4/S5/S6 测试全部走回放，单测 105 全绿；4 文件 S6 N4 负例文件共 109 tests

### 8. §10 坑表逐条确认规避 —— 合规（逐条见下节）

### 11-2 主备供应商真实端点单轮交互测试 PASS —— 合规

- `scripts/probe-model.mjs --provider minimax-cn --model MiniMax-M3 --runs 1` ✓ 1/1
- `scripts/probe-model.mjs --provider xiaomi-token-plan-cn --model mimo-v2.6-flash --api openai-completions --base-url https://token-plan-cn.xiaomimimo.com/v1 --runs 1` ✓ 1/1

### 11-3 主备供应商真实端点多轮对话交互测试 PASS —— 合规

- `scripts/probe-multi.mjs --provider minimax-cn --model MiniMax-M3` schema 4/4 refs 3/3
- `scripts/probe-multi.mjs --provider xiaomi-token-plan-cn --model mimo-v2.6-flash --api openai-completions --base-url https://token-plan-cn.xiaomimimo.com/v1` schema 4/4 refs 3/3

### 11-4 真实单轮/多轮联调实测全绿（§7.5 硬卡点通过） —— 合规

- `scripts/probe-m10-s8-images.mjs` MiniMax-M3 vision 端到端通过（合成 PNG base64 → schema 遵从识别形状与颜色）
- mimo vision 端点（token-plan-cn openai-completions）实际不传图片块至上游，记 §3.4 差异（不要求 vision 双供应商）

---

## 二、§10 已知坑表（v1.1 共 12 坑）逐条规避

| # | 规避 |
|---|---|
| #3 system 通道 | 小米 token-plan 端点不遵循 system：M10 适配层 `pi-transport.ts:130` 把 system 并入 user 消息头部 |
| #7 <think> 剥离 | `pi-transport.ts:114 stripThinkTags`（正则）+ `pi-transport.ts:159` 调用，标准 v1.1 单测 `tests/runtime-pits.test.ts:8-13` |
| #8 流模块错配 | `pi-transport.ts:55-65 streamFnFor` 按 `model.api` 动态 import（anthropic-messages / openai-completions 两协议）；reverse config 兜底（小米 id 一律 §3.4 端点） |
| #9 runAgentLoop 吞错 | M10 工人模式走 LlmStageClient（不用 runAgentLoop）；客户端 `client.ts:209-218` 错误重抛 |
| #10 超时叠加 | `pi-transport.ts:147 maxRetries:1` + `AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)`；`client.ts:181` 默认 300s |
| #11 JSON 包装 | `client.ts:116 parseJsonLoose` ≤3 层展开 + 单测 `tests/runtime-pits.test.ts:15-28` |
| #12 配额 2067 | `client.ts:67 TRANSIENT` 正则含 2067 → 主备切换 |
| #13 多轮缺 usage | M10 单发模式无该问题；多轮录制走单发 schema |

---

## 二A、§3.4 供应商接入速查核对（v1.1）

| 供应商 | 接法 | 端点 | 协议 | 模型 ID | 密钥来源 |
|---|---|---|---|---|---|
| MiniMax（主用） | pi-ai 内置 provider `minimax-cn` | `https://api.minimaxi.com/anthropic` | anthropic-messages | `MiniMax-M3` | `MINIMAX_CN_API_KEY` |
| 小米 MIMO（备用） | **适配层 reverse config**：小米 id 一律走 token-plan-cn 端点 | `https://token-plan-cn.xiaomimimo.com/v1` | openai-completions | `mimo-v2.6-flash` | `XIAOMI_TOKEN_PLAN_CN_API_KEY` |

**已知差异**：mimo token-plan-cn 端点对 vision 图片块**实际不上传**至上游（实测验证）→ M10 多模态支持仅 MiniMax-M3；记此差异，对话式形态（需 vision 备援）立项时再补。

---

## 三、§9.2 偏差记账（已授权）

| ID | 偏差说明 | 授权依据 |
|---|---|---|
| ~~D-1~~ | ~~本项目只用 pi-ai、不引入 pi-agent-core~~ **已撤销（M10）**：用户裁定第二次重构「全程用 pi-agent-core 及 skill」，引入 `@earendil-works/pi-agent-core@0.86.1`（钉版），承载 skills 机制（assets/skills/ppt/SKILL.md 经 loadSkills/formatSkillsForSystemPrompt 注入）；装配面 = skills 装载/格式化（agent-kernel.ts），不启用 AgentHarness（D-4）。 | M10 提案 D3（用户指令）→ `src/model/agent-kernel.ts` 单点适配（§4.1） |
| D-2 | 领域字典注入形态与 deep-research 的 ModuleConfig/evidencePacks 不同（本项目：PPT skill 守则全集 + 任务级指令 + 用户 brief 边界） | 实质达标（§11-6），形态差异不构成偏离；M8 GRILL G2 达标线裁决 |
| D-3 | 默认链依据标准 v1.1 §3.4 升级（M2.7→M3 / mimo-v2.5-pro→v2.6-flash）；适配层 reverse config（`resolveModelFor`）让小米 model id 一律走 §3.4 端点；`tests/runtime-resolve.test.ts` 锁接线 | M8 收尾（产品配置对齐）→ 多轮+单轮+vision 三类真调全绿 |
| D-4 | AgentHarness 全量装配（lane/session/operation）评估后不启用：六步工人单发必须保留 LlmStageClient 主备熔断+录制回放+§10 坑规避（transport 层），AgentHarness 自有 streamFn/session 接入即需重造三样，零收益；pi-agent-core 承载面 = skills 机制。对话式形态（如立项）走 §8 闸门后重评 | M10 PRD G3 降级阶梯（动工审批门已披露）→ 用户裁决维持工人模式 + 禁多轮 tool-call 循环 |

---

## 四、维持合规的运行纪律

1. **修改即同步**：改适配层/装配形态/测试缝/阶段集必须同步本文件相应段落（含路径、阶段名、夹具名）。
2. **新接入必过 §7.5**：新供应商/新模型接入后单轮+多轮+vision 三类真调全绿方可判「接入成功」。
3. **§10 坑新增必加测试**：新增坑必须有对应 `tests/runtime-pits.test.ts` 用例守护。
4. **每切片提交前对照**：本文件 §11 八项过一遍，绿了再提交。

### 12. B 方案工具 Agent 模式（v1.4 P2，2026-10-07 启用）

- **模式**：工具 Agent（pi-agent-core `runAgentLoop` 有界循环），用于生成节点（第 4 步）——模型自主写 pptxgenjs 代码 → bash 渲染 → 自纠多轮。编辑节点保持 Worker 模式。
- **§7.5 用途验证**：MiniMax-M3 page_01（11 turns / 8 tools / 70s / 91KB / 65 shapes）；mimo-v2.6-flash page_02（15 turns / 12 tools / 227s / 66KB）。双供应商均通过工具任务验证（实际工具结果消费：stderr 自纠）。
- **预算**：每页 15 轮 / 12min / 30 次工具调用（mimo 实测需 ~15 轮）；按页独立账本；超额页级 fallback。
- **工具白名单**：write_code（限 work/tmp/*.js）/ run_render（限 node work/tmp/*.js）/ read_file / list_dir；越界调用拒绝+审计。
- **审计**：AgentEventSink 落盘 work/agent-audit/events.jsonl（零内容 hash）。
- **适配层**：`src/model/agent-loop.ts` 单点承载 runAgentLoop（与 agent-kernel.ts 并列，白名单扫描已含）。
- **D-1 补充**：B 方案不借用 pi-coding-agent（§3.3 合规），复用 pi-agent-core 批准栈。

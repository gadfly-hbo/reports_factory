# Agent Runtime 接入合规 — 对话式重构后（v2）

| | |
|---|---|
| 版本 | v2（2026-10-10 全面重构后重写；v1.4 六步形态声明随代码删除失效） |
| 标准 | `AGENT-RUNTIME` v0.3（`~/Dev/Projects/pi-agent-runtime/docs/AGENT-RUNTIME.md`） |
| SDK | `pi-agent-runtime@0.4.1`（vendored tgz，hash 见 `vendor/README.md`；内部 pi 两包精确 0.86.1） |
| 维护约定 | 未与代码同步的合规声明视为失效；运行时/装配面/测试缝改动必须同步本文件 |

## 一、宿主五输入（INTEGRATION 合同）

| 输入 | 实现 | 说明 |
|---|---|---|
| Model + transport | `src/agent/model.ts` | 显式 provider/id/protocol/endpoint（MiniMax-M3 anthropic-messages 主 + mimo openai-completions 备）；密钥宿主侧发现（env → `~/.pi/agent/auth.json`；小米条目缺失时回退 `~/.zcode/v2/config.json` 的 xiaomimimo baseURL）显式传入，不进配置/日志 |
| Authorization | `src/agent/authorize.ts` | 本地单用户预授权：模型调用放行；受限环境内 read/write/edit/bash（含 bash external 效果）放行；其余 external 拒绝；publish（本地交付）放行 |
| BudgetStore | `src/agent/budget-store.ts` | `cumulative:'unlimited'` + 单次保护四参数（输出 32768/模型 600s/工具 120s/控制 30s）+ `modelRecovery:{extraAttempts:1}`（native retry 关闭）；JSON 原子持久，崩溃残留 lease 有显式 `releaseActive` 恢复路径（自审计 JSONL） |
| AuditSink | `src/agent/audit.ts` | 零内容 JSONL（任务/阶段/模型/工具/原因/序列）；append 即持久确认，失败关准入 |
| Tools + 环境 | `src/agent/tools/*` + 原生工厂 | 自定义：propose_outline / render_deck / qa_deck / export_deck；原生 read/write/edit/bash 跑在受限单进程环境（根=项目数据目录，macOS sandbox 禁网络/fork） |

## 二、运行形态

- `createSessionRuntime`（`session-host.ts`）：每项目一个持续会话（JSONL，重启恢复）；原生 skills（`assets/skills/ppt/`）+ 自动压缩；steer/followUp（对话式插话）。
- **软失败策略**（宿主决策，P2/P3 依据）：文件类工具失败转 JSON 错误文本回模型自纠，不终止整轮（SDK 默认 after_tool 一票否决对 read 路径误伤过严）；授权/预算/审计仍逐次生效。
- 事件：审计 + harness 观察事件 → 环形缓冲 → SSE（零内容）；UI 真实状态渲染，无假进度。

## 三、已知边界（明示）

- FileBudgetStore 单进程实现（本地单用户）；多进程并发不支持。
- 压缩参数沿文档示例值（4096/8192），真实长任务触发后再调。
- 空闲会话 snapshot 需队列属主（SDK 合同）；运行中快照可用（UI 进度路径）。
- npm pi 1.1.0 / pi-coding-agent 直用不采用（标准第 1 条；如需须用户明示豁免）。

## 四、测试缝

- 主缝 = SessionHost（合成 ModelTransport 注入，离线驱动全链：工具调用/确认注入/steer/恢复）。
- 工具单测（临时目录直构产物）；fastify inject；预算合同负例；真调探针（`probe:runtime` / `probe:e2e`，不进 CI）。

## 五、升级流程

共享包发布新冻结版 → 更新 `vendor/`（hash 记录）→ `npm install --save-exact` → verify + probe 双供应商 → 提交 lockfile。不得改写 tgz。

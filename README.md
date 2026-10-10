# Report Studio（工作名）

把已有材料变成**结构清楚、视觉专业、事实有据、方便修改**的中文 PPT——对话式自主生成器。本地优先、独立运行。

- 入口是一个聊天窗口（类 Kimi Work）：上传附件、一句话描述需求即可
- AI 先**提出页面框架提案**（可编辑、可追问澄清），用户确认后**自主写代码渲染**出真正可编辑的 PPTX
- 生成后可**选中任意一页继续对话修改**；导出 pptx / html / pdf 三格式
- 数字红线：所有数字与事实逐字来自材料，不编造；0 emoji

## 快速开始

```bash
npm install
npm run verify        # typecheck + 全部测试 + 双构建
npm run build:web     # 构建 UI（首次运行前；verify 已含）
npm start             # 启动本地服务：http://127.0.0.1:8787（数据默认存 ./data）
```

模型密钥自动从 `~/.pi/agent/auth.json` 发现（minimax-cn / xiaomi-token-plan-cn 条目），或用环境变量 `MINIMAX_CN_API_KEY` / `XIAOMI_TOKEN_PLAN_CN_API_KEY` 显式提供——密钥不进仓库。

## 工作流

```
上传材料（md/csv/xlsx/docx/pdf/图片）→ 提取文本落盘（图片走 vision 预理解）
→ 对话描述需求 → AI 读材料 → propose_outline 框架提案卡（内联编辑 + ≤3 澄清问题）
→ 「按此框架生成」确认 → AI 自主写 deck/pages/page_XX.mjs + deck.mjs → render_deck 渲染自检
→ 页网格预览（近似）→ 选中页对话修改（自动重渲染）→ 质检（结构 + 隐私建议）→ 三格式导出
```

## 架构

```
src/
  agent/      Agent 运行层（唯一触达 pi-agent-runtime 的适配层）
    session-host.ts   会话宿主：createSessionRuntime（持续会话/压缩/steer）
    model.ts          模型链（MiniMax-M3 主 + mimo 备）与密钥发现
    budget-store.ts   uncapped 预算账本（原子持久）   audit.ts   零内容审计
    authorize.ts      本地授权策略                    materials.ts  材料提取/索引
    outline.ts        框架提案存储                    prompts.ts 工人系统提示词
    qa-deck.ts / export-deck.ts / deck-preview.ts    质检/导出/预览
    tools/    propose_outline / render_deck / qa_deck / export_deck
  server/     Fastify：chat（SSE 事件流）/ outline / deck / qa / exports / projects
  ingest/     材料解析（markdown 标记、csv/docx/xlsx/pdf 提取）
  schema/     zod 合同（project/sources/exports/assets）
  storage/    workspace 本地存储（文件 + 轻量索引）
  sync/       data/ 双机 git 同步（commit→rebase→push，冲突保本机）
web/          React 对话式工作台（浅色/克制绿，按 ~/.agents/ui-design/DESIGN.md）
```

核心原则：AI 对最终产物负责——导出的就是 AI 生成并自检过的 deck 工件本身（pptx 直出，不再重渲染）；确定性代码负责校验、预算与审计。

## Agent 运行时治理

经共享基础包 `pi-agent-runtime@0.4.1`（vendored tgz，见 `vendor/README.md`）接入，遵循 `AGENT-RUNTIME` 标准 v0.3：宿主五输入（显式凭据 transport / 授权 / uncapped 预算账本 / 零内容审计 / 工具与受限执行环境）；累计不封顶 + 单次保护；原生 read/write/edit/bash 限定项目数据目录。

## 常用命令

```bash
npm run verify          # typecheck + vitest + 双构建
npm run smoke           # 真实浏览器 UI 冒烟（不调模型）
npm run probe:runtime   # 主备模型链真调探针（各 1 轮）
npm run probe:e2e       # 端到端真调样张（上传→提案→确认→生成→改页→导出）
npm run data-sync       # 项目数据双机同步
```

## 故障恢复

- 会话卡住（异常退出残留占用/「任务被占用」）：项目页失败消息中有「恢复会话」按钮，或 `POST /api/projects/:id/agent/recover`——释放残留 lease、批准配置迁移（输出上限等调整后存量项目自动适配）、清理陈旧会话写锁；全部动作写入账本自审计（`data/agent-budget.json.audit.jsonl`）。
- 预算账本/会话均为本地 JSON 文件（`data/`），随双机同步；损坏时按 `docs/agent-runtime-compliance.md` §三 边界处理。

## 边界与未验证项

- 页面 HTML 预览为近似渲染（agent 未写 HTML 时从页面代码提取文本生成），实际以导出 PPTX 为准
- 预算账本为单进程实现（本地单用户）；多进程并发不支持
- XLSX 导入需显式选表；Windows/WPS 真机验证延后
- 演示数据均为虚构；「来源绑定」不等于「事实已证实」

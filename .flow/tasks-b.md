# M10-B Tasks：B 方案垂直切片

- [ ] B1. agent kernel：runAgentLoop 工具 Agent 基础（工具注册/白名单/预算/审计）
- [ ] B2. 生成节点工具 Agent 化（替换工人模式 pages/generate）
- [ ] B3. 编辑节点可视化（页级预览截图）
- [ ] B4. 导出适配（工具 Agent 产物 Buffer → PPTX 导出）
- [ ] B5. §7.5 真实验证 + §8 验收 + 视觉门

---

## B1. agent kernel：runAgentLoop 工具 Agent 基础

### What to build
`src/model/agent-loop.ts`：基于 pi-agent-core `runAgentLoop` 的有界工具 Agent 循环。工具注册表（§4.2：write_code/run_render/read_file/list_dir，元数据含读写/预算档位）；预算管理（§4.4：每页独立账本，轮次/墙钟/工具调用三线）；审计（§4.5：AgentEventSink 落盘 JSONL，零内容 hash）；路径白名单（§4.7：write_code 限 work/tmp/*.js，run_render 限 node work/tmp/*.js）；错误重抛（§10：runAgentLoop 吞错误 → 检出重抛）。

### Acceptance criteria
- [ ] 工具白名单：write_code/run_render/read_file/list_dir 四工具，越界调用抛错+审计
- [ ] 预算三线：每页轮次 ≤10、墙钟 ≤10min、工具调用 ≤20，任一触顶即停
- [ ] 审计：AgentEventSink 落盘 work/agent-audit/page_XX.jsonl（turn/tool/args_hash/result_hash/duration/status）
- [ ] 路径白名单：write_code 强制 work/tmp/ + .js，run_render 强制 node work/tmp/*.js
- [ ] runAgentLoop 错误检出重抛（不吞进消息）
- [ ] KA-B2 真实测试：mimo 5 轮内不崩溃（记录事件流）

### Blocked by
None

## B2. 生成节点工具 Agent 化

### What to build
`workbench.generatePages()` 重构：每页调 `agentLoop.runPptxAgent({ page, materials, budget })`。system prompt（pptxgenjs 专家+版式规范+代码模板）；user prompt（页标题/意图+材料投影）；循环内模型 write_code → run_render → 自纠；成功读 Buffer 存 work.pages[page_id].pptx_buffer；失败 fallback 框架标题。替换现有工人模式单发。前端 GenerateView 加过程可视化（实时状态+预算进度+日志折叠面板）。

### Acceptance criteria
- [ ] 每页独立工具 Agent 循环，产物为 Buffer 存 work.pages
- [ ] 前端实时显示：写代码/渲染/自纠/成功/预算耗尽 状态
- [ ] 预算耗尽 fallback：框架标题占位+明示原因
- [ ] 产物验证：run_render 退出码 0 + PPTX zip 有效（自动检查）
- [ ] 旧路由兼容：pages/generate 接口不变（内部实现换）
- [ ] 真实测试：3 页连续成功（非回放）

### Blocked by
- B1

## B3. 编辑节点可视化

### What to build
PageEditView 三栏改造：右侧加预览图面板。预览渲染：render/deck-html.ts 单页 HTML → Playwright 截图 PNG → data URL 前端显示。选中页加载预览；手工编辑失焦后防抖 500ms 重渲染；agent 改写成功后重渲染。预览失败显示占位图（不影响功能）。

### Acceptance criteria
- [ ] 选中页右侧显示预览图（非空白，含页标题）
- [ ] 手工编辑后预览自动更新（防抖）
- [ ] agent 改写成功后预览更新
- [ ] 预览失败有占位提示
- [ ] 预览图标注"近似渲染，实际以导出 PPTX 为准"

### Blocked by
- B2（需要 work.pages 有 pptx_buffer 或至少文字内容渲染预览）

## B4. 导出适配

### What to build
`exportPublish` 适配：PPTX 导出优先用 work.pages[page_id].pptx_buffer（工具 Agent 产物）；若无 Buffer（旧项目或失败页 fallback）则回退 render/pptx.ts 渲染。HTML/PDF 导出不变（deck-html/deck-pdf）。

### Acceptance criteria
- [ ] PPTX 导出用工具 Agent Buffer（若有）
- [ ] fallback 到 render/pptx.ts（若无 Buffer）
- [ ] HTML/PDF 导出不受影响

### Blocked by
- B2

## B5. §7.5 真实验证 + §8 验收 + 视觉门

### What to build
真实模型验证（§7.5）：MiniMax-M3 和 mimo 各跑 3 页工具 Agent 生成，记录事件流验证工具消费+可靠性。§8 验收：授权/预算/审计/工具消费/失败取消/质量评估逐项核对。视觉门：生成样张截图用户确认。

### Acceptance criteria
- [ ] §7.5：双供应商各 3 页成功（事件流证明工具消费）
- [ ] §8：合规清单逐项带证据
- [ ] 视觉门：样张用户确认

### Blocked by
- B2/B3/B4

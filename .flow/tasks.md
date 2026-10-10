# Tasks：放开 Agent 自由度（flow-2）

- [x] U0. thinking probe：M3 medium 真调 + mimo thinking 判定（定备链）
- [x] U1. skill 配方升级（吸收 ppt-generator + 图片放开 + look_page 自检节）
- [x] U2. thinkingLevel=medium 接线（session-host + 模型配置按 probe 结论）
- [x] U3. look_page 视觉自检工具（截图→image content 回模型）
- [x] U4. 联网执行环境（exec-env.ts 替换沙箱装配；路径边界/超时/审计保持）
- [x] U5. 真调对比验证（e2e + 与 pi 产物并排留证 .flow/freedom-run.md）→ VERIFY/REVIEW/SHIP

## U0 thinking probe
**What**: scripts/probe-thinking.mjs：M3+medium 单轮真调（验证出思考可用且回复正常）；mimo-v2.6-flash 带 thinkingLevel 一轮（端点是否接受 reasoning 参数）。**AC**: probe 输出判定（M3 pass；mimo 支持/不支持结论），写入本任务备注。
**Blocked by**: None

## U1 skill 配方升级
**What**: 重写 assets/skills/ppt/SKILL.md：§设计系统（5 配色 theme 对象代码）+ §篇幅三档 + §逐页结构模板（封面/目录/章节分隔/KPI卡墙/双栏对比/趋势/目标表/大数字/总结行动/ThankYou，含元素级尺寸）+ §组件配方（页码徽章/图片 sizing）+ §图片规范（sources/ 本地路径 + deck/assets/ 联网缓存）+ §视觉自检（look_page 逐页看）+ 保留红线（数字逐字/0 emoji/.mjs/buildSlide/render_deck 纪律）。删除「禁外部图片」条款。
**AC**: skill 文本断言测试（关键词集存在；禁图条款不存在；红线保留）；U5 真调中模型按配方产出组件化页面。
**Blocked by**: None

## U2 thinkingLevel 接线
**What**: session-host run 传 thinkingLevel:'medium'；按 U0 结论处理备链 reasoning 声明。
**AC**: 离线测试断言合成 transport 收到的请求含 thinkingLevel；verify 全绿。
**Blocked by**: U0

## U3 look_page 工具
**What**: src/agent/tools/look-page-tool.ts：参数 {page}；截图（HTML 优先/fallback 近似）→ {content:[{kind:'image',data,mimeType:'image/png'}], details:{page}}；host 装配。
**AC**: 单测返回 image 块；host 缝 toolCall 驱动成功。
**Blocked by**: None

## U4 联网执行环境
**What**: src/agent/exec-env.ts 实现 SDK ExecutionEnvironment（exec 走 bash -c 无网络沙箱、cwd=项目根、resolvePath 限根内、超时/输出上限）；session-host 替换 createLocalExecutionEnvironment；authorize/审计不变。
**AC**: 单测：根内读写/exec 成功、路径越界拒、exec 超时生效；**联网验证**（DNS resolve 或 HTTP HEAD 真调一次）；verify 全绿。
**Blocked by**: None

## U5 真调对比验证
**What**: probe-e2e 跑通后与用户 pi 产物并排截图，主观对比写入 .flow/freedom-run.md（含运行条件对齐清单勾选）。
**AC**: e2e ALL PASS + 对比留证 + 对齐清单 C1-C4 全勾或明示偏差。
**Blocked by**: U1,U2,U3,U4

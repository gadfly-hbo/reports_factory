# PRD：放开 Agent 自由度四项（flow-2，auto：对 proposal 纯增量细化）

## User Stories（增量）
24. 作为用户，我要 agent 带思考工作（thinking medium），让排版决策有推理质量。
25. 作为用户，我要 agent 拥有专业级设计配方（多配色/逐页布局模板/KPI 卡墙/页码徽章等组件代码），产出不再是裸矩形堆砌。
26. 作为用户，我要 PPT 能用我上传的图片素材，且 agent 可联网取图（存本地后引用、防变形），视觉密度对齐商业成品。
27. 作为用户，我要 agent 交付前逐页「看」自己的排版（视觉自检）并修正遮挡/溢出/层级问题。
28. 作为用户，我要模型 bash 具备联网能力（装库/取素材），同时授权、审计、项目根路径边界不放松。

## Implementation Decisions
1. U2 thinking：run 传 `thinkingLevel:'medium'`；probe 实测定备链（v2.6-flash thinking 不行则切 v2.5-pro 或单链）。
2. U1 skill：重写 SKILL.md（保留红线与 deck 工件纪律），吸收 ppt-generator 配方；禁图条款废除，改「图片规范」。
3. U3 look_page：effect='read'，output='content' 返回页 PNG（deck/pages HTML 优先，fallback 近似图）；skill 增视觉自检节。
4. U4 执行环境：`src/agent/exec-env.ts` 自定义 ExecutionEnvironment（exec 无沙箱网络；resolvePath 限项目根；read/write/stat 常规；超时 120s/输出 2MB）；替换 createLocalExecutionEnvironment 装配；authorize/审计不变。
5. U5 验证：probe（M3 thinking/mimo thinking）→ e2e 同材料 → 与用户 pi 产物并排截图留证（.flow/freedom-run.md）。

## Testing Decisions
- Seam 沿用 SessionHost（合成 transport）+ 工具单测 + inject。
- 新增：exec-env 单测（联网 exec 可达外网 DNS 解析或 HTTP HEAD；路径越界拒绝；超时生效）；look_page 单测（返回 content 含 image 块）；skill 文本断言（配方关键词/图片规范/自检清单存在，禁图条款不存在）。
- thinking：probe 真调验证（不进 CI）；离线断言 run 请求含 thinkingLevel=medium。

## Out of Scope
UI 变更；视频嵌入（skill 记规范不实现工具）；共享 SDK 接入；多会话。

## R1 审查回写（沿承）
outline 404/422；.zcode 密钥回退；W7 双页签豁免。

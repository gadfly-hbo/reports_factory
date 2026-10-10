# Proposal：放开 Agent 自由度（flow-2）

来源：2026-10-10 用户裁决。归因调查结论（见对话）：上一 flow 四项能力锁全部非标准/架构强制，属意图翻译失真（「对齐 pi-coding-agent」被错译为「比旧版自由」）。本 flow 修正。

## 用户原始要求（锚 = pi-coding-agent 实际运行条件）

> 「既然没有锁死，为啥不放开呢？我们要求的就是agent自由度」
> 原始需求：「引入最新的 pi-sdk，pi 将具有自主能力，类似 pi-coding-agent，不再限制 agent 自由发挥」

## 运行条件对齐清单（本 flow 验收轴，防复发）

| # | 运行条件 | pi-coding-agent 实况 | 本 flow 目标 |
|---|---|---|---|
| C1 | thinking | defaultThinkingLevel=medium（settings.json） | run 传 `thinkingLevel:'medium'`；主链验证；备链验证或调整 |
| C2 | 设计资产 | 装有实战验证的 ppt-generator skill（5 配色/逐页配方/组件代码/自检清单） | SKILL.md 吸收同源配方；禁图条款废除 |
| C3 | 视觉反馈 | 交互中看效果迭代；模型可读图 | `look_page` 工具返回页截图（vision），skill 要求交付前逐页自看 |
| C4 | 网络 | bash 全网络 | 宿主自定义执行环境（联网 exec），授权/审计/项目根路径边界保持 |

## 交付内容

1. **U1 skill 配方升级**：吸收 `~/.pi/agent/skills/ppt-generator`（用户资产，同机）：5 套配色 theme 对象、篇幅三档（电梯10/复盘20/报告30-50）、10 页结构模板（封面/目录/章节分隔/KPI 卡片墙/双栏对比/趋势+数据卡/目标拆解表/大数字视觉锤/总结行动/ThankYou）、组件代码配方（页码徽章/图片 sizing contain 防变形）、每页一行核心结论原则、自检清单。**图片放开**：用户上传素材（sources/）本地路径引用 + 联网取图先存 deck/assets/ 再引用。
2. **U2 thinkingLevel**：session-host 传 medium；真调验证 M3 thinking；probe 验证 mimo-v2.6-flash（pi 里用户日常以 medium 跑 mimo-v2.5-pro，可作备链调整依据）。
3. **U3 look_page 视觉自检**：自定义工具（output:'content' 返回 PNG），skill 要求 render 后逐页看图自检（遮挡/溢出/层级/留白）再交付。
4. **U4 bash 联网**：宿主实现 ExecutionEnvironment（exec 无网络沙箱、路径仍以项目根为界、超时/输出上限保留）；授权策略与零内容审计不变。
5. **U5 真调对比验证**：同材料 e2e，与用户 pi 产物并排主观对比留证。

## 不变项（红线，非锁）

数字逐字来自材料（不编造）；0 emoji；单次保护四参数+uncapped 合同；零内容审计；效果前授权。UI 合同（W0-W9）不变——本 flow 无用户可见界面变更（QA 卡等呈现沿用）。

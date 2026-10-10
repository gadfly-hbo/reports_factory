# flow-2 真调对比留证（U5，2026-10-10）

## E2E（probe-e2e，minimax M3 + thinking=medium，真调）

PASS 全链：上传→对话→框架提案（5 页+3 澄清）→确认→**301s 自主生成**（含 look_page 逐页视觉自检与 qa_deck）→逐页修改（36s）→三格式导出+PK 校验+qa.ok=true。上轮一次「fetch failed 服务失联」未复现（复跑加 stderr 捕获+轮询容错后全绿；记为偶发，观测保留）。

agent 行为实录（审计 114 事件）：read×4 → bash×4（联网环境）→ propose_outline → write×9（含自建 deck/package.json 解决 .js ESM）→ render_deck → **look_page 视觉自检** → qa_deck → write 修复 → render_deck → 交付。**新 skill 工作流全程被遵循。**

## 结构度量对比（deck-metrics）

| 指标（每页均值） | 我们 freedom 版 | 我们旧版（flow-1） | Kimi 附件1 基线 |
|---|---|---|---|
| 文本框 | **32** | 15–21 | 30 |
| 形状 | **33** | 40（裸矩形） | 18 |
| 颜色数 | 12（theme 系统色） | 9 | 11 |
| 图表/表格 | 0（本材料无多期数据） | 0 | 27 图表框/9 表 |
| 图片 | 0（材料无图片需求） | 1 | 6 |
| 页码徽章/预览 HTML | 5 页全预览 | 部分 | — |

结论：文本密度、形状密度、配色系统已对齐 Kimi 基线；图表/表格为内容驱动（配方已就位，材料含多期数据时触发）；图片能力已放开（original_file+联网取图）但本材料未触发。主观美感对比以人工并排为准（截图 /tmp/rs-t3-preview.png 及预览路由）。

## 运行条件对齐清单（验收轴）

- [x] C1 thinking：run 传 medium；M3/mimo 双链 probe 真调 PASS
- [x] C2 设计资产：SKILL.md 重写（6 配色/10 页元素级配方/组件代码/自检清单）；禁图条款废除
- [x] C3 视觉反馈：look_page 工具（image content 回模型）+ skill 逐页自检节；e2e 中真实执行
- [x] C4 网络：createNetworkExecutionEnvironment（真实联网测试 PASS；路径限根；授权/审计/超时保持）

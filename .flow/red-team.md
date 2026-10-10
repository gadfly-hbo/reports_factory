# Red-Team: 放开 Agent 自由度四项（flow-2）

对象：.flow/proposal.md ｜ 结论：**GO**

## Top Kill-Assumptions

1. **skill 配方升级 → M3 一次产出高保真页**
- Steelman：pi 里同模型+同源配方已实战验证；我们已证 M3 写 pptxgenjs 能渲染成功。
- Fails if：配方更长（~400 行）挤占上下文/注意力，或 M3 在我们链上（无交互纠偏）一次成图率显著低于 pi 交互模式。
- Evidence：U5 真调并排对比（强制）；失败标准=连续两轮 e2e 产物明显劣于 pi 产物 → 缩配方粒度或拆「分页生成+look_page 纠偏」循环。
2. **thinking=medium 的备链合法性**
- SDK/标准：thinking 请求时链上候选须全部声明已验证 reasoning。mimo-v2.6-flash 未验证。
- Evidence this week：先 probe（M3 medium 真调 1 轮 + mimo thinking 真调 1 轮）；mimo 不支持则备链切 mimo-v2.5-pro（用户 pi 日常 medium 跑=验证）或该用途链仅 M3。
3. **U4 联网 exec 的安全面**
- 本地单用户 + 零内容审计 + 效果前授权 = 标准允许按任务开放网络。风险=模型取任意 URL（下载恶意/超大文件）。
- 缓解：exec 超时+输出上限保留；skill 限定「素材下载到 deck/assets/ 再引用」；审计记录每次 bash。
4. **look_page 的 token 成本**
- 每页一张 1280×720 PNG 进上下文，11 页 deck 视觉自检≈11 图。M3 上下文 1M——可承受；但备用链 mimo 128k 需节制。
- 缓解：skill 写明「逐页看，发现问题才改」；截图体积压缩。

## What's Well-Reasoned
四项均有本机实证来源（pi settings/用户 skill/pi 日常使用）；保留红线（数字/0 emoji/单次保护/审计）与放开项边界清晰。

**Verdict: GO**

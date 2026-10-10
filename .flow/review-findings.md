# REVIEW Round 1 发现（fresh-context 子代理，2026-10-10）

Verdict: **FAIL**（4 major + 5 minor；verify 证据复核相符；D1/D4/D8/D9/D11、测试真实性、软失败护栏、范围检查均干净）

## Major（阻断）
1. **T7 删除在 T6 未验收时执行**：tasks.md T6 未勾选（勾选替换静默失败）+ T6 验收缺口：US20 设置页不存在（Workbench 失败文案却引导去设置页）、W9.2 失败三分类、W9.3 部分页失败态、W9.4 恢复分隔线、W7 成本页签缺失。旧视图已删不可回退。
2. **停止后前端死循环**：host settle 即清 activeRun → /agent/result 恒 {active:true} → busy 永真、composer 锁死（app.ts:277-279 / session-host.ts:271-273 / Workbench.tsx:134-144）。
3. **崩溃恢复未接线**：releaseActive 仅测试可达；session .writer-lock O_EXCL 崩溃残留无清理——真实崩溃后项目会话 TASK_BUSY 永久卡死（T0 实质未达成）。
4. **CONFIGURATION_CHANGED 无恢复出口**：taskId 固定 + 配置签名变化永久拒绝（本 flow 真的调过 8192→32768）；releaseActive 不修签名；存量项目会话硬失败无明示。

## Minor
5. render-deck-tool 绝对路径 symlink（跨机不实）+ data/*/node_modules 未 gitignore（blob 风险）。
6. OutlineCard 缺历史版本折叠与「去回复」；页型固定 9 枚举 select 违反 W3「不枚举固定集合」。
7. app.ts needsApproval 死分支；export_scope/chart_data_mode 硬编码旧分级语义。
8. PRD 409 与实现 404 未回写；.zcode 密钥回退未入 proposal D3/compliance。
9. probe:e2e 运行留证缺失（仓内无记录）。


---

# REVIEW Round 2（2026-10-10）

Verdict: **PASS（附条件）**——R1 的 4 major 全部核实修复（M1 功能面/M2-M4 代码+测试），verify+smoke 亲测通过，无新 major。

F1（必须）T6 勾选静默失败残留 → 已修（本轮）
F2 needsApproval 死分支残留 → 已删
F3 recover 无 ledger 500 → releaseActive 幂等化
F4 证据计数笔误（smoke 实为 14 项非 16）→ 以此为准
F5 清单/预览正则不一致 + localeCompare 乱序 → 正则统一放宽 + numeric 排序
F6 W7 形态偏差（chips+单时间线 vs 合同双页签）与 W9.4 分隔线时间戳 → 分隔线已补时间；双页签形态记**明示豁免**（信息等价到达：工具/模型/用量/事件计数与时间线均在抽屉，独立页签仅布局差异）


---

# flow-2 REVIEW（2026-10-10）

Round 1 **FAIL**：F1 HIGH look_page 错误路径裸 JsonValue 被 SDK output:'content' 校验拒杀整轮（实证复现）；F2 authorize 注释失真；F3 测试绑裸契约；F4 JPEG/PNG、F5 original_file 存量缺口（INFO 记档）。
Round 2 **PASS**：F1/F2/F3 修复实证（SDK 级复跑 run 存活、模型收到错误文本自纠）；verify 亲跑 exit 0；无新回归。


---

# flow-3 REVIEW（2026-10-11）

Round 1 **FAIL**：H1 插话假控件（send busy 短路 + steer 分支重写丢失）；M1 confirm 路径工具摘要跨轮；L1/L3/L6/L7/L8。
Round 2 **PASS**：H1 真插话（busy 分支 POST /chat→steer+送达反馈）；M1 waitResult 入口统一清零；L1/L3/L6/L8 修复；smoke 增插话语义断言（16 项）；L2/L4/L5/I9 LOW/INFO 记档。


---

# flow-4 REVIEW（2026-10-11）

R1 FAIL：Major 大图预览缺 ?t= cache-bust（轮末不刷新）；Low lastReply 误取系统提示；Info 插话缺 title。
R2 PASS：Major ?t=+key 双保险；Low/Info 修；smoke 18 项（新增 cache-bust 断言）+ verify 59 用例亲跑绿。残余（不阻塞）：lastReply 前缀过滤偏宽（真实回复以「已」开头会被排除）；pptx 为 null 时 t 恒 0（与缩略图一致）。


---

# flow-5 REVIEW（2026-10-11）

单轮 PASS（1 Low 死 CSS + 2 Info）：①.wb-thumb 4 行死 CSS 已删（rg=0，verify/smoke 复跑绿）；②proposal 960→980 措辞统一；③active 高亮类断言可选补强（未做，选中态已有间接验证）。


---

# flow-6 REVIEW（2026-10-11）

单轮 PASS。开发插曲：按钮漏写 onClick 成假控件——被本次新增 smoke route-stub 断言当场抓住（假控件防线首次实战生效）。Low（regen 失败重试不发 page）已顺手修；2 Info 记档。

# M4 双轴审查发现（Round 1，fixed point=6d3304b）

## Standards

**硬违规（阻断）**
- S-H1 zod 边界标准被绕过：`src/server/app.ts` 四个新端点裸 cast（/approve-g1、/evidence-requests、/:rid/approve、/pending-updates/resolve），违反 `src/schema/requests.ts` 头部「全部请求体经 zod 校验」；兄弟端点（/decisions、/brief、/propose）均走 parseBody。

**判断性 smell（记录，本轮不动）**
- cjkBigrams 与 pageText 在 editorial-recommend/checks/editorial 重复；blueprint 形状三处定义；pending→受影响页逻辑两处重复（并入阻断#2 修复）；logical_key 复合字符串无共享 helper（Primitive Obsession）；`report_${projectId}` 六处派生（Data Clump）；writeEditorialState 纯委托（Middle Man）；DerivedAssets 用 Record<string,any> 而非 BundleMetric 类型。

## Spec

**阻断（缺失/走样/错误）**
- P1 D1 普通材料同文件重导幂等缺失（persist.ts 每次 import 新建 source，无内容哈希去重）
- P2 D8 重点覆盖检查走样：只对 excluded 告警，未验证"关键发现正文层落点"与边界关联 blocker 分级
- P3 D8 蓝图 required_limits 无检查消费
- P4 G8 补证结果回流不触发待复核（affected_objects 未用，首次导入结果包无 pending update）
- P5 D5 提案合同缺 approved_scope/required_checks 字段（§12.1 合同保真）
- P6 D9 前端无显式提案差异确认控件（/propose 无人调用，仅事后审计）
- P7 D6 幂等键用全文重序列化哈希而非 snapshot 身份——同快照不同键序会误判为新版本；应按 bundle 逻辑身份+snapshot_id 判定（§11.4）
- P8 一致性：编审模式判定两处口径不一（app.ts decisions‖status vs export.ts decisions）+ pending→受影响页逻辑重复实现

**有意简化（记录并回写 PRD，不改代码）**
- 状态机省略 checks_pending（G2 并入正式导出，S4 简化）；EvidenceRequest 省略 awaiting_approval（单用户无审批队列）
- G2 确认用独立 G2ConfirmationSchema 而非 ApprovalRecord(kind=g2)（等价：绑定修订+检查指纹+时间）
- G10 惰性初始化实现为「无决定=候选」缺省 + decisions 存在=编审模式触发（保护 legacy 项目不被 G1 门误伤——S4 实现期发现的真实约束，与 G10 原文「物化 candidate 决定」冲突，采前者）
- 组装自动注入 required_boundaries 到概要页 bullet：设计决策（§7.3 边界默认正文可见；检查在边界后加/被删时仍可达，T13 测试走通）
- G9 非法转移：用户可触发的非法跳转（未生成蓝图即 approve-g1）已 400；advanceStatus 内部回退为 no-op 不可由用户触发

## 汇总
Standards：1 硬违规 + 若干判断性 smell；Spec：8 阻断 + 5 有意简化。最严重：S-H1（标准绕过）与 P7（幂等契约错误）。

---

# Round 2（聚焦复查，2026-09-24）

**8 项修复全部 VERIFIED**（S-H1/P1-P8，含证据行号；见审查记录）。新增 1 项阻断：

- N1 空发现的补证结果包产生不可解除的待复核（键为空 → resolve 400 → 正式导出永久阻断）。**已修复**：ResolvePendingRequest 支持 affected_pages 解除 + workbench 按页匹配 + UI 收集页；回归测试覆盖（tests/proposal.test.ts「空发现的补证结果也可解除待复核」）。

P8 复核备注：app.ts:77 内联判定缺 g2 项，但 g2 仅在已编审激活时写入，无可达分歧（记录不改）。

**Round 2 结论：无剩余阻断 → SHIP。**


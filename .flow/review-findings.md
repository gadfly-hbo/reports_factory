# M5 双轴审查发现（Round 1，fixed point=3934d30）

## Standards

**硬违规：0。** 核心原则（模型只做理解与表达）、zod 边界、密钥卫生、payload 白名单、录制纪律全部通过。

**判断性 smell（9 项，其中 5 项顺手修复）**：
- 已修：client.ts 重复 throw 合并；DEFAULT_TIMEOUT_MS 单一来源（三处 120000）；OUTBOUND_MODES 单一来源（union/数组/z.enum 三处）；`semantic_${kind}` id 冲突（加消息哈希）；死代码（void contentText、persistOutline project 参数）。
- 记录不改：app.ts 五个 AI 路由 catch 块重复（可提取 helper）；TRANSIENT 正则匹配错误串（Primitive Obsession，常规做法）；bytes 审计结构化建议（已部分采纳）。

## Spec

**阻断（4，已全部修复）**：
- R2-1 **G7 被 UI 丢弃**：nlDraft 未保存 expected_revision，p.edit 用当前修订 → 模型草案 409 语义失效。修复：edit 支持 opts.expectedRevision，ComposeView 草稿携带起草时刻修订。
- R2-2 **提案会编造正文**：提示词允许 field:body 但 payload 不含正文原文 → 模型从未见内容却要"完整文案"。修复：本版本限 headline（prompt+schema z.literal）。
- R2-3 **G10/US6 违反**：ComposeView NL 卡片无条件渲染（local_only 可见）；CheckView 忽略 modelAvailable。修复：均按 capabilities 渲染/禁用。
- R2-4 **审计弱化（K3 硬约束）**：bytes 恒 0、recommend 缺 modelId、阻断尝试零记录、预览缺目标模型/成本/K3 措辞。修复：ai-* 返回真实 bytes；modelId 落日志；gateOrThrow 统一记录 blocked 尝试；预览含 target/会话成本/K3 句子。

**有意偏差（记录，不改代码）**：
- D3 形态：AI 能力实现为 workbench 方法 + model/ai-*.ts 自由函数（未改 ModelGateway 接口/未用 modelFirst 助手）；出站门由 checkOutbound 承载（语义=PrivacyGate 策略 + 会话批准，门禁测试全绿）。gateway 五可选方法等未来多实现出现再抽象。
- G3 导出快照合并：语义问题不并入导出检查快照（导出快照应反映导出时刻的确定性检查；手动语义结果合并会造成"检查时点混淆"）——CheckView 分列展示满足"当次展示"。
- D5 REPORT_STUDIO_RECORD env：实现比 spec 更严格——服务端完全不提供录制，录制仅存在于 probe 脚本（天然合成数据）。无 UI/服务端路径可触达录制。
- include_sensitive 勾选：UI 未提供（D2 预览可勾选），API 层已移除该参数；当前一律默认排除（更安全方向），勾选延后。
- L1"阻断并记录"：R2-4 已补阻断审计。

**证据补全**：xiaomi mimo-v2.5-pro probe 2/2 录制入库（tests/fixtures/recordings/s1-probe-xiaomi.json）；minimax MiniMax-M2.7 probe 3/3 已入库（tests/fixtures/recordings/s1-probe-minimax.json）。K2 样板走查证据：§15 推荐断言（tests/editorial.test.ts）+ 双 provider probe schema 遵从 3/3、3/3、2/2（升格检查由 S4 断言与 T12 兜底）。

## 汇总
Standards：0 硬违规；Spec：4 阻断（全修）+ 4 有意偏差（记录）。Round 2 复核后收敛。

---

# Round 2（聚焦复核，2026-09-24）

**6 项修复全部 VERIFIED**（R2-1…R2-6 + 清理项，逐条行号证据见审查记录）：
- 修复 hunks 无新增阻断问题；/outbound/check 不经过 gateOrThrow，探测不会刷日志（flood 疑虑排除）。
- tsc 双工程通过；172/172 测试离线绿；回归零漂移；冒烟 27 步全绿。
- 非阻断小项：projectDetail.tsx:388 双分号（M4 遗留，记录）。

**Round 2 结论：无剩余阻断 → SHIP。**


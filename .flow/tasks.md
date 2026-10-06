# M8 Agent Runtime 合规收敛 — 任务拆解（tracer-bullet 垂直切片）

- [x] 1. S1 必要边界注入加固（page-draft / rewrite 请求 + 测试锁定）
- [x] 2. S2 合规审计文档（§11×8 + §10 坑表 + §9.2 偏差记账，证据锚点）
- [x] 3. S3 审计残留缺口收尾（S2 过程中发现即修，无则记账关闭）

---

## S1｜必要边界注入加固

### Parent
`.flow/prd.md`（D1、G2；标准 §4.6）

### What to build
`buildPageDraftRequest`（ai-draft.ts）与 `buildPageRewriteRequest`（ai-page.ts）user 载荷加 `boundaries` 字段（brief.required_boundaries，空则省略）；两处 system prompt 补边界遵守指令；workbench 起草与重生成调用点传参。测试：请求构造含 boundaries 断言 + 起草链路 replay 用例更新（夹具同构造器构键）。

### Acceptance criteria
- [x] 起草与重生成请求载荷含 boundaries（有测试）
- [x] workbench 两调用点从 brief 取值传入
- [x] 全量回归绿（夹具键随构造器自动一致）

### Blocked by
None

---

## S2｜合规审计文档

### Parent
`.flow/proposal.md`（范围 1/3）；标准 §11/§10/§9.2

### What to build
`docs/agent-runtime-compliance.md`：§11 清单 8 项逐项三态（合规/N-A 正面论证/偏差已授权）+ §10 坑表 6 条逐条证据 + 偏差记账（不引入 pi-agent-core——M5 R4 授权链；参照 deep-research 未钉版为反面教材自查）。每项证据锚 file:line 与测试名；头部维护约定（G1）。审计执行方式：先逐项自查取证（rg/读码/测试锚点），证据不足处补验证。

### Acceptance criteria
- [x] 8+6+偏差 逐项三态且证据锚点齐全（无裸打勾）
- [x] N/A 项三段式正面论证（G4 模板）
- [x] 文档入库存档并随本次提交

### Blocked by
- S1（边界注入完成后 §4.6 才可记合规）

---

## S3｜审计残留缺口收尾

### Parent
`.flow/prd.md`（D3、G3）

### What to build
S2 审计过程中发现的加固级缺口逐项修复（预计为注入/校验/测试级）；架构级发现停下升级用户。无发现则本切片记账关闭。

### Acceptance criteria
- [x] 发现项全部修复或记账（无静默）
- [x] verify 全绿

### Blocked by
- S2

> S3 记账关闭（2026-10-06）：S2 逐项审计未再发现代码级缺口——唯一实质项（边界注入缺失）已由 S1 修复；其余 N/A 项均为正面论证记录。无静默发现。

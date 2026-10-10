# vendor/pi-agent-runtime-0.4.1.tgz

本仓 vendor 的跨产品共享基础包冻结版，经本地 tgz 安装（`file:` 依赖 + package-lock 锁定）。

- 来源：`~/Dev/Projects/pi-agent-runtime/artifacts/releases/0.4.1/1ddace3a5b7ff97e80627dc4660d9f300ac402a4bfc67f43144380d3352d6da5/pi-agent-runtime-0.4.1.tgz`
- 版本：0.4.1（标准 AGENT-RUNTIME v0.3；Pi 两包精确 0.86.1 由其传递依赖带入）
- SHA-256：`1ddace3a5b7ff97e80627dc4660d9f300ac402a4bfc67f43144380d3352d6da5`
- 版本裁决：2026-10-10 用户明确采用 0.4.1（RELEASE-v0.4.1：「版本按用户决定使用 0.4.1」；0.5.0 为候选，不采用）

## 升级流程

共享包发布新冻结版后：更新本文件 hash 与文件名 → `npm install --save-exact ./vendor/<新 tgz>` → 跑 `npm run verify` 与 probe → 提交 lockfile。不得改写 tgz 内容。

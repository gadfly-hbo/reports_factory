#!/bin/bash
# 一键启动 Report Studio（双端通用：macmini / MacBook）
# 流程：装依赖 → 起本机服务 → 就绪后打开浏览器。
# 双机同步：数据随仓库走 git——变动端 git-commit-push 到 GitHub，另一端手动触发 git-pull-sync 拉取（拉取前先停本服务）。
set -e
cd "$(dirname "$0")"

echo "== Report Studio 工作台 =="

need_deps() { [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; }

# 依赖过期判定:node_modules 缺失,或 lockfile 比上次安装更新
if need_deps; then
  echo "[依赖] 安装/更新依赖…"
  npm install --no-audit --no-fund
fi

if [ ! -f dist/server/start.js ] || [ -n "$(find src -newer dist/server/start.js -print -quit 2>/dev/null)" ]; then
  echo "[构建] 构建后端…"
  npx tsc
fi
if [ ! -f web-dist/index.html ] || [ -n "$(find web/src -newer web-dist/index.html -print -quit 2>/dev/null)" ]; then
  echo "[构建] 重建界面…"
  npm run build:web
fi

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

PORT=${PORT:-8787}
echo "[启动] 本机服务 http://127.0.0.1:$PORT (Ctrl+C 退出)"
node dist/server/start.js &
SERVER_PID=$!

# 就绪门控（对齐 deep-research：40s 窗口；就绪才开浏览器，失败不误开）
READY=0
for i in $(seq 1 40); do
  if curl -s -o /dev/null http://127.0.0.1:$PORT/api/projects; then READY=1; break; fi
  sleep 1
done
if [ "$READY" = "1" ]; then
  open http://127.0.0.1:$PORT
else
  echo "[启动] 服务未在 40 秒内就绪——请查看上方日志排查；浏览器不自动打开" >&2
fi

wait "$SERVER_PID"

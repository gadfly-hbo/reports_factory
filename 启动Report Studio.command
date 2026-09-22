#!/bin/bash
# 一键启动 Report Studio（双端通用：macmini / MacBook）
# 流程：同步项目数据 → 起本机服务 → 打开浏览器；退出时回推数据。
set -e
cd "$(dirname "$0")"

echo "== Report Studio 工作台 =="
if [ ! -d node_modules ]; then
  echo "[首次运行] 安装依赖…"
  npm install --no-audit --no-fund
fi
if [ ! -f web-dist/index.html ]; then
  echo "[首次运行] 构建界面…"
  npm run build:web
fi
if [ ! -f dist/server/start.js ]; then
  echo "[首次运行] 构建后端…"
  npx tsc
fi

echo "[同步] 拉取双端项目数据…"
npm run data-sync --silent || echo "[同步] 跳过（无变更或无网络）"

cleanup() {
  kill "$SERVER_PID" 2>/dev/null || true
  echo ""
  echo "[同步] 回推本机项目数据…"
  npm run data-sync --silent || echo "[同步] 回推跳过"
}
trap cleanup EXIT

PORT=${PORT:-8787}
echo "[启动] 本机服务 http://127.0.0.1:$PORT (Ctrl+C 退出)"
node dist/server/start.js &
SERVER_PID=$!

for i in $(seq 1 20); do
  if curl -s -o /dev/null http://127.0.0.1:$PORT/api/projects; then break; fi
  sleep 1
done
open http://127.0.0.1:$PORT

wait "$SERVER_PID"

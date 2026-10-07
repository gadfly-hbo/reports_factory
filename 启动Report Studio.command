#!/bin/bash
# 一键启动 Report Studio（双端通用：macmini / MacBook）
# 流程：清理旧进程 → 同步代码 → 装依赖 → 构建 → 注入密钥 → 验证 → 起本机服务 → 打开浏览器。
set -e
cd "$(dirname "$0")"

echo "== Report Studio 工作台 =="

# 清理旧服务进程（防止 EADDRINUSE：端口占用时浏览器开的是旧页面）
OLD_PID=$(lsof -ti:8787 2>/dev/null || true)
if [ -n "$OLD_PID" ]; then
  echo "[清理] 杀掉占用 8787 的旧服务进程（PID: $OLD_PID）…"
  kill $OLD_PID 2>/dev/null || true
  sleep 2
fi

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if [ -z "$(git status --porcelain --untracked-files=no)" ]; then
    echo "[同步] 拉取最新代码…"
    git pull --ff-only || { echo "[同步] git pull 失败" >&2; exit 1; }
  else
    echo "[同步] 工作区有未提交改动——跳过 git pull" >&2
  fi
fi

need_deps() { [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; }
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

echo "[密钥] 注入模型密钥…"
MM=$(python3 -c "import json,os;a=json.load(open(os.path.expanduser('~/.pi/agent/auth.json')));print(a.get('minimax-cn',{}).get('key',''))" 2>/dev/null || true)
[ -n "$MM" ] && export MINIMAX_CN_API_KEY="$MM"
XM=$(python3 - <<'PY' 2>/dev/null || true
import json,os
cfg=json.load(open(os.path.expanduser('~/.zcode/v2/config.json')))
for p in (cfg.get('provider') or {}).values():
    opts=p.get('options') or {}
    if 'xiaomimimo' in str(opts.get('baseURL','')):
        print(opts.get('apiKey','')); break
PY
)
[ -n "$XM" ] && export XIAOMI_TOKEN_PLAN_CN_API_KEY="$XM"

echo "[自检] npm run verify…"
if ! npm run verify; then
  echo "[自检] verify 失败——启动器中止" >&2
  exit 1
fi

cleanup() { kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT

PORT=${PORT:-8787}
echo "[启动] 本机服务 http://127.0.0.1:$PORT (Ctrl+C 退出)"
node dist/server/start.js &
SERVER_PID=$!

READY=0
for i in $(seq 1 40); do
  if curl -s -o /dev/null http://127.0.0.1:$PORT/api/projects; then READY=1; break; fi
  sleep 1
done
if [ "$READY" = "1" ]; then
  open http://127.0.0.1:$PORT
else
  echo "[启动] 服务未在 40 秒内就绪" >&2
fi

wait "$SERVER_PID"

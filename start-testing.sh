#!/usr/bin/env bash
# macOS 本地测评入口：Ctrl+C 关闭本脚本启动的后端和课程界面，保留数据库。
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$PROJECT_DIR/local-logs"
PYTHON="$PROJECT_DIR/backend/.venv/bin/python"
BACKEND_PID=""
UI_PID=""

fail() { printf '错误：%s\n' "$*" >&2; exit 1; }

cleanup() {
  local status=$? pid attempt
  trap - EXIT INT TERM
  for pid in "$BACKEND_PID" "$UI_PID"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done
  # 只处理本次记录的子进程；给它们最多 10 秒完成退出。
  for attempt in {1..10}; do
    local alive=false
    for pid in "$BACKEND_PID" "$UI_PID"; do
      if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then alive=true; fi
    done
    [[ "$alive" == true ]] || break
    sleep 1
  done
  for pid in "$BACKEND_PID" "$UI_PID"; do
    if [[ -n "$pid" ]]; then
      kill -KILL "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

check_port() {
  if lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; then
    fail "端口 $1 已被占用。请先在原启动终端关闭对应服务，再重试；本脚本不会终止其他进程。"
  fi
}

wait_http() {
  local label="$1" url="$2" timeout="$3" pid="${4:-}"
  local deadline=$((SECONDS + timeout))
  printf '等待%s就绪（最多 %s 秒）……\n' "$label" "$timeout"
  while (( SECONDS < deadline )); do
    if [[ -n "$pid" ]] && ! kill -0 "$pid" 2>/dev/null; then
      fail "$label 已退出，请查看 $LOG_DIR 中的日志。"
    fi
    if curl --fail --silent --max-time 2 "$url" >/dev/null 2>&1; then return; fi
    sleep 1
  done
  fail "$label 未在 $timeout 秒内就绪，请查看 $LOG_DIR 中的日志。"
}

cd "$PROJECT_DIR"
for command in docker node curl lsof; do
  command -v "$command" >/dev/null 2>&1 || fail "缺少 $command，请先安装并确认命令可用。"
done
[[ -x "$PYTHON" ]] || fail "缺少 backend/.venv，请先准备 Python 3.12 虚拟环境及后端依赖。"
[[ -f backend/.env ]] || fail "缺少 backend/.env，请先完成本地后端配置；本脚本不会创建或覆盖它。"
[[ -f ui-reference/.env.local ]] || fail "缺少 ui-reference/.env.local，请先配置后端地址 http://127.0.0.1:18000。"
[[ -f ui-reference/node_modules/vite/bin/vite.js ]] || fail "缺少课程界面依赖，请先在 ui-reference 目录运行 npm ci。"
[[ -f docker-compose.yml && -f compose.local.yml ]] || fail "缺少本地数据库所需的 Compose 配置文件。"
"$PYTHON" -c 'import uvicorn, fastapi, neo4j, dotenv' >/dev/null 2>&1 || fail "后端基础依赖不完整，请先在 backend/.venv 中安装项目依赖。"
check_port 18000
check_port 3015
mkdir -p "$LOG_DIR"
docker compose version >/dev/null 2>&1 || fail "Docker Compose 不可用，请检查 Docker Desktop 安装。"

if ! docker info >/dev/null 2>&1; then
  printf '正在启动 Docker Desktop……\n'
  docker desktop start --timeout 60 >"$LOG_DIR/docker-desktop.log" 2>&1 ||
    fail "Docker Desktop 启动失败或超时，请查看 local-logs/docker-desktop.log。"
  deadline=$((SECONDS + 60))
  until docker info >/dev/null 2>&1; do
    (( SECONDS < deadline )) || fail "Docker 引擎未能就绪，请在 Docker Desktop 中检查状态。"
    sleep 2
  done
fi

printf '正在启动或复用本地测评数据库……\n'
docker compose -p ckg-accuracy -f docker-compose.yml -f compose.local.yml up -d database \
  >"$LOG_DIR/database-start.log" 2>&1 ||
  fail "数据库启动失败；请确认 7474/7687 未被其他服务占用，并查看 local-logs/database-start.log。"
wait_http "数据库" 'http://127.0.0.1:7474/' 120

# 再次检查，避免等待 Docker 期间端口被其他程序占用。
check_port 18000
check_port 3015
printf '正在启动后端及课程界面……\n'
(
  cd "$PROJECT_DIR/backend"
  exec "$PYTHON" -m uvicorn score:app --host 127.0.0.1 --port 18000
) >"$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
(
  cd "$PROJECT_DIR/ui-reference"
  exec node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3015 --strictPort
) >"$LOG_DIR/course-ui.log" 2>&1 &
UI_PID=$!

wait_http "后端" 'http://127.0.0.1:18000/health' 180 "$BACKEND_PID"
wait_http "课程界面" 'http://127.0.0.1:3015/' 60 "$UI_PID"
printf '\n课程界面：http://127.0.0.1:3015/\n后端文档：http://127.0.0.1:18000/docs\n数据库界面：http://127.0.0.1:7474/\n日志目录：%s\n\n保持此终端运行；按 Ctrl+C 停止后端及界面，数据库和数据卷会保留。\n' "$LOG_DIR"

while true; do
  kill -0 "$BACKEND_PID" 2>/dev/null || fail "后端已停止，请查看 local-logs/backend.log。"
  kill -0 "$UI_PID" 2>/dev/null || fail "课程界面已停止，请查看 local-logs/course-ui.log。"
  sleep 2
done

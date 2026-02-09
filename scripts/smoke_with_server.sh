#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3001}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"
STORAGE_DRIVER="${STORAGE_DRIVER:-memory}"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

log() {
  printf '[SMOKE-SERVER] %s\n' "$1"
}

wait_server() {
  local retries=50
  local i
  for ((i=1; i<=retries; i++)); do
    local code
    code="$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/v1/auth/sms/send" 2>/dev/null || true)"
    if [[ "$code" != "000" ]]; then
      return 0
    fi
    sleep 0.2
  done
  return 1
}

log "启动服务: STORAGE_DRIVER=$STORAGE_DRIVER PORT=$PORT"
STORAGE_DRIVER="$STORAGE_DRIVER" PORT="$PORT" npx tsx src/index.ts >/tmp/tri_journal_smoke_server.log 2>&1 &
SERVER_PID=$!

if ! wait_server; then
  echo "[SMOKE-SERVER][FAIL] 服务未在预期时间内启动，日志如下:" >&2
  cat /tmp/tri_journal_smoke_server.log >&2 || true
  exit 1
fi

log "服务可用，开始执行 acceptance"
BASE_URL="$BASE_URL" ./scripts/acceptance.sh

log "PASS: smoke_with_server 完成"

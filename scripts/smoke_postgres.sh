#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3002}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"
POSTGRES_DB="${POSTGRES_DB:-tri_journal}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
CLEAN_DB="${CLEAN_DB:-0}"

DATABASE_URL="${DATABASE_URL:-postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}}"

log() {
  printf '[SMOKE-PG] %s\n' "$1"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[SMOKE-PG][FAIL] 缺少命令: $cmd" >&2
    exit 1
  fi
}

wait_postgres() {
  local retries=60
  local i
  for ((i=1; i<=retries; i++)); do
    if docker compose exec -T postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

generate_phone() {
  local suffix
  suffix="$(printf '%08d' "$(( (RANDOM * 32768 + RANDOM) % 100000000 ))")"
  printf '138%s' "$suffix"
}

cleanup_db() {
  if [[ "$CLEAN_DB" == "1" ]]; then
    log "清理数据库容器与数据卷 (CLEAN_DB=1)"
    docker compose down -v >/dev/null 2>&1 || true
  fi
}
trap cleanup_db EXIT INT TERM

require_cmd docker
require_cmd curl
require_cmd npx

log "启动 PostgreSQL 容器"
docker compose up -d postgres

log "等待 PostgreSQL 就绪"
if ! wait_postgres; then
  echo "[SMOKE-PG][FAIL] PostgreSQL 未在预期时间内就绪" >&2
  docker compose logs --tail=100 postgres >&2 || true
  exit 1
fi

log "执行全链路冒烟（PostgreSQL 持久化模式）"
PHONE="${PHONE:-$(generate_phone)}"
DATABASE_URL="$DATABASE_URL" STORAGE_DRIVER=postgres PORT="$PORT" BASE_URL="$BASE_URL" PHONE="$PHONE" ./scripts/smoke_with_server.sh

if [[ "$CLEAN_DB" == "1" ]]; then
  log "PASS: smoke_postgres 完成（已清理数据库）"
else
  log "PASS: smoke_postgres 完成（数据库容器保持运行）"
fi

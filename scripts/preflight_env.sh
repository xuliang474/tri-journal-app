#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-.env}"
ALLOW_NON_PROD="${ALLOW_NON_PROD:-0}"
ALLOW_MEMORY_IN_PRODUCTION="${ALLOW_MEMORY_IN_PRODUCTION:-0}"

log() {
  printf '[PREFLIGHT-ENV] %s\n' "$1"
}

fail() {
  printf '[PREFLIGHT-ENV][FAIL] %s\n' "$1" >&2
  exit 1
}

load_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    fail "未找到环境变量文件: $ENV_FILE"
  fi
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

validate_node_env() {
  if [[ -z "${NODE_ENV:-}" ]]; then
    fail 'NODE_ENV 未设置'
  fi
  if [[ "$NODE_ENV" != "production" && "$ALLOW_NON_PROD" != "1" ]]; then
    fail "NODE_ENV=$NODE_ENV，不是 production（可设置 ALLOW_NON_PROD=1 跳过）"
  fi
}

validate_storage_driver() {
  if [[ -z "${STORAGE_DRIVER:-}" ]]; then
    fail 'STORAGE_DRIVER 未设置，应为 postgres 或 memory'
  fi
  if [[ "$STORAGE_DRIVER" != "postgres" && "$STORAGE_DRIVER" != "memory" ]]; then
    fail "STORAGE_DRIVER=$STORAGE_DRIVER 非法，应为 postgres 或 memory"
  fi
}

validate_database_url() {
  if [[ "$STORAGE_DRIVER" != "postgres" ]]; then
    if [[ "${NODE_ENV:-}" == "production" && "$ALLOW_MEMORY_IN_PRODUCTION" != "1" ]]; then
      fail '生产环境不建议使用 memory 存储（可设置 ALLOW_MEMORY_IN_PRODUCTION=1 跳过）'
    fi
    return
  fi

  if [[ -z "${DATABASE_URL:-}" ]]; then
    fail 'STORAGE_DRIVER=postgres 时 DATABASE_URL 必填'
  fi
  if [[ ! "$DATABASE_URL" =~ ^postgres(ql)?:// ]]; then
    fail 'DATABASE_URL 格式非法，应以 postgres:// 或 postgresql:// 开头'
  fi
}

validate_port() {
  local port="${PORT:-3000}"
  if [[ ! "$port" =~ ^[0-9]+$ ]]; then
    fail "PORT=$port 非法，必须是数字"
  fi
  if ((port < 1 || port > 65535)); then
    fail "PORT=$port 超出范围，应在 1-65535"
  fi
}

main() {
  load_env_file
  validate_node_env
  validate_storage_driver
  validate_database_url
  validate_port

  log 'PASS: 环境变量检查通过'
  log "摘要: NODE_ENV=${NODE_ENV:-unset}, STORAGE_DRIVER=${STORAGE_DRIVER:-unset}, PORT=${PORT:-3000}"
}

main "$@"

#!/usr/bin/env bash
set -euo pipefail

REQUIRE_DOCKER_SMOKE="${REQUIRE_DOCKER_SMOKE:-0}"
SKIP_POSTGRES_SMOKE="${SKIP_POSTGRES_SMOKE:-0}"

log() {
  printf '[CI-LOCAL] %s\n' "$1"
}

has_cmd() {
  command -v "$1" >/dev/null 2>&1
}

log "1/4 运行单元测试"
npm test

log "2/4 TypeScript 编译检查"
npm run build

log "3/4 运行 memory 全链路冒烟"
make smoke-memory

if [[ "$SKIP_POSTGRES_SMOKE" == "1" ]]; then
  log "4/4 跳过 postgres 冒烟 (SKIP_POSTGRES_SMOKE=1)"
else
  log "4/4 运行 postgres 全链路冒烟"
  if has_cmd docker; then
    make smoke-postgres-clean
  else
    if [[ "$REQUIRE_DOCKER_SMOKE" == "1" ]]; then
      echo "[CI-LOCAL][FAIL] 未检测到 docker，且 REQUIRE_DOCKER_SMOKE=1" >&2
      exit 1
    fi
    log "未检测到 docker，已跳过 postgres 冒烟（可设置 REQUIRE_DOCKER_SMOKE=1 强制失败）"
  fi
fi

log "PASS: ci-local 全部通过"

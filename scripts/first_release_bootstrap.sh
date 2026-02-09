#!/usr/bin/env bash
set -euo pipefail

DRY_RUN="${DRY_RUN:-0}"
RUN_CI_LOCAL="${RUN_CI_LOCAL:-1}"
SKIP_POSTGRES_SMOKE="${SKIP_POSTGRES_SMOKE:-1}"
REQUIRE_DOCKER_SMOKE="${REQUIRE_DOCKER_SMOKE:-0}"
RELEASE_AS="${RELEASE_AS:-patch}"
INITIAL_COMMIT_MESSAGE="${INITIAL_COMMIT_MESSAGE:-chore: bootstrap project}"
PUSH="${PUSH:-0}"
SKIP_PREFLIGHT="${SKIP_PREFLIGHT:-0}"

log() {
  printf '[RELEASE-BOOTSTRAP] %s\n' "$1"
}

run_cmd() {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '[DRY-RUN] %s\n' "$*"
  else
    "$@"
  fi
}

ensure_git_repo() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "[RELEASE-BOOTSTRAP][FAIL] 当前目录不是 Git 仓库" >&2
    exit 1
  fi
}

ensure_release_as() {
  case "$RELEASE_AS" in
    patch|minor|major) ;;
    *)
      echo "[RELEASE-BOOTSTRAP][FAIL] RELEASE_AS 必须是 patch/minor/major" >&2
      exit 1
      ;;
  esac
}

has_head_commit() {
  git rev-parse --verify HEAD >/dev/null 2>&1
}

main() {
  ensure_git_repo
  ensure_release_as

  if ! has_head_commit; then
    log "检测到仓库尚无提交，创建首次提交"
    run_cmd git add -A
    run_cmd git commit -m "$INITIAL_COMMIT_MESSAGE"
  else
    log "检测到仓库已有提交，跳过首次提交创建"
  fi

  if [[ "$RUN_CI_LOCAL" == "1" ]]; then
    log "执行发布前校验（ci-local）"
    run_cmd env SKIP_POSTGRES_SMOKE="$SKIP_POSTGRES_SMOKE" REQUIRE_DOCKER_SMOKE="$REQUIRE_DOCKER_SMOKE" make ci-local
  else
    log "跳过 ci-local 校验（RUN_CI_LOCAL=0）"
  fi

  if [[ "$SKIP_PREFLIGHT" == "1" ]]; then
    log "跳过 release-preflight（SKIP_PREFLIGHT=1）"
  else
    log "执行发布前体检（release-preflight）"
    if [[ "$PUSH" == "1" ]]; then
      run_cmd env REQUIRE_REMOTE=1 make release-preflight
    else
      run_cmd env REQUIRE_REMOTE=0 make release-preflight
    fi
  fi

  log "执行首次发布（first release）"
  if [[ "$DRY_RUN" == "1" ]]; then
    run_cmd npm run release:dry-run:first
  else
    run_cmd npm run release:first -- --release-as "$RELEASE_AS"
  fi

  if [[ "$PUSH" == "1" ]]; then
    log "推送提交与 tag"
    run_cmd git push --follow-tags
  else
    log "未推送远端（设置 PUSH=1 可自动推送）"
  fi

  log "完成"
}

main "$@"

#!/usr/bin/env bash
set -euo pipefail

REQUIRE_REMOTE="${REQUIRE_REMOTE:-1}"
ALLOWED_BRANCH_REGEX="${ALLOWED_BRANCH_REGEX:-^(main|master|release/.+)$}"
ALLOW_DIRTY="${ALLOW_DIRTY:-0}"

log() {
  printf '[RELEASE-PREFLIGHT] %s\n' "$1"
}

fail() {
  printf '[RELEASE-PREFLIGHT][FAIL] %s\n' "$1" >&2
  exit 1
}

ensure_git_repo() {
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail '当前目录不是 Git 仓库'
}

current_branch() {
  git branch --show-current
}

ensure_branch_allowed() {
  local branch
  branch="$(current_branch)"
  if [[ -z "$branch" ]]; then
    fail '无法识别当前分支（可能是 detached HEAD）'
  fi
  if [[ ! "$branch" =~ $ALLOWED_BRANCH_REGEX ]]; then
    fail "当前分支 '$branch' 不允许发布（允许正则: $ALLOWED_BRANCH_REGEX）"
  fi
}

ensure_worktree_clean() {
  if [[ "$ALLOW_DIRTY" == "1" ]]; then
    log '跳过工作区干净检查 (ALLOW_DIRTY=1)'
    return
  fi

  if ! git diff --quiet || ! git diff --cached --quiet; then
    fail '工作区有未提交改动，请先提交或暂存后再发布'
  fi

  if [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
    fail '工作区存在未跟踪文件，请清理或提交后再发布'
  fi
}

ensure_remote() {
  if [[ "$REQUIRE_REMOTE" != "1" ]]; then
    log '跳过远端检查 (REQUIRE_REMOTE!=1)'
    return
  fi

  git remote get-url origin >/dev/null 2>&1 || fail '未配置 origin 远端，无法执行标准发布推送流程'
}

ensure_head_commit() {
  git rev-parse --verify HEAD >/dev/null 2>&1 || fail '当前分支没有提交记录，无法发布'
}

main() {
  ensure_git_repo
  ensure_head_commit
  ensure_branch_allowed
  ensure_worktree_clean
  ensure_remote
  log 'PASS: 发布前体检通过'
}

main "$@"

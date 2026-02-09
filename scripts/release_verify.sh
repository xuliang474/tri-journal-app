#!/usr/bin/env bash
set -euo pipefail

REQUIRE_TAG="${REQUIRE_TAG:-0}"
ALLOW_UNRELEASED="${ALLOW_UNRELEASED:-0}"

log() {
  printf '[RELEASE-VERIFY] %s\n' "$1"
}

fail() {
  printf '[RELEASE-VERIFY][FAIL] %s\n' "$1" >&2
  exit 1
}

require_file() {
  local file="$1"
  [[ -f "$file" ]] || fail "缺少文件: $file"
}

current_version() {
  node -e 'const p=require("./package.json"); process.stdout.write(p.version);'
}

has_changelog_entry() {
  local version="$1"
  local escaped
  escaped="${version//./\\.}"
  grep -Eq "^##[[:space:]]+\[?v?${escaped}\]?" CHANGELOG.md
}

has_tag() {
  local version="$1"
  git rev-parse -q --verify "refs/tags/v${version}" >/dev/null 2>&1
}

main() {
  require_file package.json
  if [[ ! -f CHANGELOG.md ]]; then
    if [[ "$ALLOW_UNRELEASED" == "1" ]]; then
      log '未找到 CHANGELOG.md（ALLOW_UNRELEASED=1，按未发布状态放行）'
      log 'PASS: 发布校验通过（未发布模式）'
      exit 0
    fi
    fail '缺少文件: CHANGELOG.md'
  fi

  local version
  version="$(current_version)"
  log "当前版本: ${version}"

  if has_changelog_entry "$version"; then
    log "CHANGELOG 包含版本 ${version} 条目"
  else
    fail "CHANGELOG.md 未找到版本 ${version} 的条目"
  fi

  if has_tag "$version"; then
    log "已找到 tag: v${version}"
  else
    if [[ "$REQUIRE_TAG" == "1" ]]; then
      fail "未找到 tag: v${version}"
    fi
    log "未找到 tag: v${version}（REQUIRE_TAG=0，仅提示）"
  fi

  log 'PASS: 发布校验通过'
}

main "$@"

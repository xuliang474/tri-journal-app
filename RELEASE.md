# Release Guide

本文档定义仓库的标准发布流程，基于 Conventional Commits + `standard-version`。

## 前置条件

1. 已有至少 1 次 Git 提交（无提交历史时 `standard-version` 无法运行）。
2. 本地校验通过：`make ci-local`
3. commit message 符合 Conventional Commits（仓库已用 commitlint 强制）。

## 快捷命令

- 发布前体检：`make release-preflight`
- 发布后校验：`make release-verify`
- 首发前宽松校验：`make release-verify-soft`
- 预演 patch：`make release-dry-run`
- 预演首次发布：`make release-dry-run-first`
- 正式 patch：`make release-patch`
- 正式 minor：`make release-minor`
- 正式 major：`make release-major`
- 正式首次发布：`make release-first`
- 首发一键流程（自动首个 commit + 校验 + 发布）：`make release-bootstrap`
- 首发一键流程预演：`make release-bootstrap-dry`

## 首次发布（无历史 tag）

### 本地步骤

1. 发布前体检：`make release-preflight`
2. 确保有至少一个提交：
   - `git add .`
   - `git commit -m "chore: bootstrap project"`
3. 预演首次发布：
   - `make release-dry-run-first`
4. 正式生成版本与 changelog：
   - `make release-first`
5. 推送提交与 tag：
   - `git push --follow-tags`
6. 发布后校验：
   - `REQUIRE_TAG=1 make release-verify`

### 一键方式（推荐）

```bash
make release-bootstrap-dry
make release-bootstrap
```

可选参数示例：

```bash
# 首发时要求 docker 冒烟且自动推送
REQUIRE_DOCKER_SMOKE=1 PUSH=1 make release-bootstrap

# 本地不推远端时自动放宽 remote 检查（REQUIRE_REMOTE=0）
PUSH=0 make release-bootstrap

# 跳过 release-preflight（不推荐）
SKIP_PREFLIGHT=1 make release-bootstrap

# 不跑 ci-local，直接首发（不推荐）
RUN_CI_LOCAL=0 make release-bootstrap
```

### GitHub Actions 步骤

1. 打开 `Actions -> Release`。
2. 设置输入：
   - `release_as`: 任选（首次发布通常选 `patch`）
   - `first_release`: `true`
   - `dry_run`: 先 `true` 预演，再 `false` 正式执行

## 常规发布（已有 tag）

### 本地步骤

1. 发布前体检：`make release-preflight`
2. 预演：`make release-dry-run`
3. 正式发布（按需要选择）：
   - `make release-patch`
   - `make release-minor`
   - `make release-major`
4. 推送提交与 tag：
   - `git push --follow-tags`
5. 发布后校验：
   - `REQUIRE_TAG=1 make release-verify`

### GitHub Actions 步骤

1. 打开 `Actions -> Release`。
2. 设置输入：
   - `release_as`: `patch/minor/major`
   - `first_release`: `false`
   - `dry_run`: 先 `true` 预演，再 `false` 正式执行

## 产物说明

发布完成后会更新：

1. `package.json` 版本号
2. `package-lock.json` 版本号
3. `CHANGELOG.md`
4. Git tag（如 `v1.0.1`）
5. GitHub Release（release workflow 自动创建）

## 常见问题

1. 报错 `... does not have any commits yet`：
   - 原因：仓库没有提交历史。
   - 处理：先创建至少 1 次提交，再执行发布命令。
2. 报错 commit message 不合规：
   - 处理：修改提交信息为 Conventional Commits 形式后重试。
3. 报错 `缺少文件: CHANGELOG.md`：
   - 原因：尚未执行过首次发布。
   - 处理：首发前可用 `make release-verify-soft`，首发后再用严格校验 `make release-verify`。

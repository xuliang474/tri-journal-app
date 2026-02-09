# Contributing

## 开发环境

1. 安装依赖：`make install`
2. 复制环境变量：`cp .env.example .env`
3. 启动数据库：`make db-up`
4. 启动服务：`make dev`

## 提交前检查

推荐一条命令：`make ci-local`

该命令会执行：

1. `npm test`
2. `npm run build`
3. `make smoke-memory`
4. `make smoke-postgres-clean`（有 Docker 时）

## 发布流程（Conventional Commits）

仓库使用 `standard-version` 基于 commit message 自动生成版本与 `CHANGELOG.md`。

详细步骤见：`RELEASE.md`。

常用命令：

1. `make release-dry-run`
2. `make release-dry-run-first`
3. `make release-patch`
4. `make release-minor`
5. `make release-major`
6. `make release-first`

## Git Hooks（Husky）

仓库已启用 pre-commit 钩子：提交时自动执行 `lint-staged`。
仓库已启用 commit-msg 钩子：提交时自动执行 `commitlint`。

- 默认行为：仅校验并格式化“本次暂存”的文件。
- 手动执行：`npx lint-staged`
- 临时跳过（不推荐）：`git commit --no-verify`

### Commit Message 规范

采用 Conventional Commits：

1. `feat: 新增短信风控策略`
2. `fix: 修复周报日期边界计算`
3. `docs: 更新本地验收命令说明`

常用 type：

- `feat`、`fix`、`docs`、`refactor`、`test`、`ci`、`chore`

## 常用命令

- `make smoke-memory`：无数据库全链路冒烟
- `make smoke-postgres`：PostgreSQL 持久化冒烟
- `make smoke-postgres-clean`：PostgreSQL 冒烟后清理环境
- `make db-reset`：重建数据库（会清空数据）

## 代码规范

- 使用 TypeScript 严格模式。
- 提交前执行 `npm run lint`。
- 需要格式化时执行 `npm run format`。
- 不要提交敏感信息（密钥、token、`.env` 内容）。

## Pull Request

发起 PR 时请使用仓库模板，并至少包含：

1. 变更摘要
2. 验证结果（test/build/smoke）
3. 风险与回滚方案

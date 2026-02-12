# 三色日记 App MVP V3 - Backend + Web Prototype

这个仓库实现了 MVP V3 方案中的服务端核心能力（Fastify + TypeScript + Vitest），覆盖：

- 认证闭环：短信验证码登录、设置密码、密码登录、密码重置
- 风控规则：60 秒冷却、单号日上限 10 次、风险命中触发图形验证码、密码 5 次失败锁定 15 分钟
- 日记闭环：创建日记、短语级三色标注、用户修正保存、即时反思卡
- 复盘能力：花园日历（月视图）、周回顾报告
- 提醒设置：默认 22:00 开启，可改可关
- 计费能力：基础权益查询、订阅收据校验（示例实现）

## 存储模式

- 默认：`PostgreSQL`（持久化）
- 测试：`memory`（由测试代码显式指定）

服务端在 PostgreSQL 模式下会在启动时自动执行 `CREATE TABLE IF NOT EXISTS` 初始化。

## 一键本地启动（推荐）

1. 安装依赖并准备环境变量

```bash
make install
cp .env.example .env
# 生产部署可改用:
# cp .env.production.example .env
```

2. 启动 PostgreSQL

```bash
make db-up
```

3. 启动服务

```bash
make dev
```

服务默认地址：`http://127.0.0.1:3000`

前端页面地址：`http://127.0.0.1:3000/`

## 前端体验（Web MVP）

仓库内置了一个可直接联调后端 API 的前端页面（`web/`）：

- 登录：手机号验证码登录、设置密码
- 写作：自由/引导模式、语音转写、三色高亮编辑
- 回顾：花园月历、周报查看
- 设置：提醒开关与时间、权益查询与升级模拟

无需额外前端构建命令，后端已直接托管静态文件。

## 常用命令

```bash
make db-up      # 启动 PostgreSQL
make db-down    # 停止并移除容器
make db-logs    # 查看数据库日志
make db-reset   # 重建数据库（会清空数据）
make dev        # 启动后端
make test       # 运行测试
make build      # TypeScript 编译
make smoke      # 执行 API 全链路冒烟
make smoke-memory # 自动起服务（memory）并执行全链路冒烟
make smoke-postgres # 自动起 PostgreSQL + 起服务 + 全链路冒烟
make smoke-postgres-clean # 跑完 postgres 冒烟后自动清理容器和数据
make ci-local   # 本地发布前一键验收（test+build+smoke）
make preflight-env # 环境变量启动前检查
make release-preflight                        # 发布前体检（分支/工作区/远端）
make release-verify                           # 发布后校验（版本/changelog/tag）
make release-verify-soft                      # 首发前宽松校验（无 CHANGELOG 可放行）
npm run release:dry-run -- --release-as patch # 预演版本发布
npm run release -- --release-as patch         # 生成版本与 changelog
npm run release:dry-run:first                 # 首次发布预演
make release-patch                            # 正式 patch 发布
make release-minor                            # 正式 minor 发布
make release-major                            # 正式 major 发布
make release-first                            # 正式首次发布
make release-bootstrap                        # 首发一键流程（首次提交+校验+发布）
make release-bootstrap-dry                    # 首发一键流程预演
```

`make smoke` 默认请求 `http://127.0.0.1:3000`，可通过环境变量覆盖：

```bash
BASE_URL=http://127.0.0.1:3001 PHONE=13800000999 DEVICE_ID=smoke-2 make smoke
```

如果你不想手动起数据库和服务，可直接使用：

```bash
make smoke-memory
```

这个命令会临时以 `STORAGE_DRIVER=memory` 启动服务，然后执行完整冒烟。

如果你想验证真实持久化链路，可直接使用：

```bash
make smoke-postgres
```

这个命令会自动：

1. 启动 `docker compose` 里的 PostgreSQL。
2. 等待数据库就绪。
3. 以 `STORAGE_DRIVER=postgres` 启动服务并执行完整冒烟。

如果你希望跑完就清理数据库环境：

```bash
make smoke-postgres-clean
```

默认会为每次 `smoke-postgres` 生成随机手机号，避免重复验收时触发验证码冷却或日上限。

## 一键本地验收（推荐发布前执行）

```bash
make ci-local
```

执行顺序：

1. `npm test`
2. `npm run build`
3. `make smoke-memory`
4. `make smoke-postgres-clean`（检测到 docker 时执行）

可选参数：

```bash
# 无 docker 环境但希望流程通过（默认就是跳过 postgres 冒烟）
SKIP_POSTGRES_SMOKE=1 make ci-local

# 无 docker 也必须失败（用于严格验收）
REQUIRE_DOCKER_SMOKE=1 make ci-local
```

## 手动模式（不使用 Makefile）

```bash
npm install
cp .env.example .env
# 确保本地有 PostgreSQL，且 DATABASE_URL 正确
npm run dev
```

## 生产环境模板与启动前自检

1. 复制生产模板并填写真实值

```bash
cp .env.production.example .env
```

2. 运行自检脚本

```bash
make preflight-env
# 或指定文件:
# ENV_FILE=.env.production.example make preflight-env
```

3. 建议开启运行时自检（启动即检查）

```bash
# 在 .env 中设置
ENABLE_RUNTIME_PREFLIGHT=1
```

当 `NODE_ENV=production` 时，服务默认也会执行 runtime preflight；不通过将拒绝启动并输出具体错误项。

自检项包括：

- `NODE_ENV` 必须为 `production`（可通过 `ALLOW_NON_PROD=1` 跳过）
- `STORAGE_DRIVER` 必须是 `postgres|memory`
- `STORAGE_DRIVER=postgres` 时 `DATABASE_URL` 必填且格式正确
- `PORT` 必须是 1-65535 的数字

## 编译与测试

```bash
npm run build
npm test
npm run lint
npm run format:check
```

完整协作规范见：`CONTRIBUTING.md`
发布操作清单见：`RELEASE.md`

## CI 自动化

仓库已提供 GitHub Actions 工作流：

- 路径：`.github/workflows/ci.yml`
- 触发：`push`、`pull_request`、手动触发（`workflow_dispatch`）
- 执行内容：`npm ci -> npm run lint -> npm test -> npm run build -> make smoke-memory`
- 路径：`.github/workflows/ci-local.yml`
  - 触发：手动触发（`workflow_dispatch`）
  - 执行内容：`make ci-local`（可通过输入参数控制是否强制 Docker 冒烟、是否跳过 Postgres 冒烟）
- 路径：`.github/workflows/release.yml`
  - 触发：手动触发（`workflow_dispatch`）
  - 执行内容：校验后基于 Conventional Commits 生成版本、更新 `CHANGELOG.md`、创建 tag 并推送，同时自动创建 GitHub Release

`CI Local (Full)` 可选输入：

1. `require_docker_smoke`：`true/false`（默认 `true`）
2. `skip_postgres_smoke`：`true/false`（默认 `false`）

`Release` 可选输入：

1. `release_as`：`patch/minor/major`
2. `dry_run`：`true/false`
3. `first_release`：`true/false`（首次发布时设为 `true`）

你把代码推到 GitHub 后，可在仓库的 `Actions` 页面查看每次运行结果。

## 仓库治理自动化

- PR 模板：`.github/pull_request_template.md`
  - 统一要求填写变更摘要、验证结果和风险回滚。
- 安全扫描：`.github/workflows/codeql.yml`
  - 对 JavaScript/TypeScript 运行 CodeQL（push/PR/每周定时）。
- 依赖更新：`.github/dependabot.yml`
  - 每周自动检查 npm 与 GitHub Actions 依赖更新并创建 PR。
- Git Hooks：`.husky/pre-commit`
  - 提交时自动执行 `lint-staged`，仅检查暂存文件。
- Commit Message Hook：`.husky/commit-msg`
  - 提交时自动执行 `commitlint`，要求符合 Conventional Commits。

## API 列表（已实现）

### 运维探活

- `GET /healthz`
- `GET /readyz`
- `GET /metrics`（Prometheus 文本格式）

### 认证

- `POST /v1/auth/sms/send`
- `POST /v1/auth/sms/verify`
- `POST /v1/auth/captcha/verify`
- `POST /v1/auth/password/set`
- `POST /v1/auth/password/login`
- `POST /v1/auth/password/reset`

### 日记与分析

- `POST /v1/journals`
- `GET /v1/journals/:id`
- `POST /v1/journals/:id/analyze`
- `PATCH /v1/journals/:id/spans`
- `GET /v1/journals/:id/reflection`

### 花园/周报/提醒

- `GET /v1/calendar/garden?month=YYYY-MM`
- `GET /v1/reports/weekly?week_start=YYYY-MM-DD`
- `GET /v1/reminders/settings`
- `PATCH /v1/reminders/settings`

### 计费

- `POST /v1/billing/receipt/verify`
- `GET /v1/billing/entitlement`

## 关键业务错误码

- `42901`：短信冷却中
- `42902`：手机号日发送上限
- `40331`：需图形验证码
- `42311`：密码登录临时锁定
- `42221`：AI 标注区间非法

## 生产探活建议

可将以下探活配置接入部署平台（K8s/Nginx/云主机进程守护）：

1. Liveness：`GET /healthz`（用于进程存活检查）
2. Readiness：`GET /readyz`（用于依赖就绪检查，当前会检查存储可用性）
3. Metrics：`GET /metrics`（用于 Prometheus 抓取请求量与时延累计指标）

示例命令：

```bash
curl -sS http://127.0.0.1:3000/healthz
curl -sS http://127.0.0.1:3000/readyz
curl -sS http://127.0.0.1:3000/metrics
```

最小告警建议（示例）：

1. `readyz` 非 200 持续 3 分钟告警。
2. `tri_http_requests_total` 5xx 比例在 5 分钟窗口内 > 2% 告警。
3. `tri_http_request_duration_ms_sum / tri_http_request_duration_ms_count` 计算均值，若核心路由时延持续高于基线告警。

## 验收 PostgreSQL 持久化

1. 启动服务后，按 API 流程创建账号与日记。
2. 停掉服务再重启（数据库容器保持运行）。
3. 重新查询 `GET /v1/journals/:id`，若数据仍在，说明持久化生效。
4. 可直接运行 `make smoke` 验证登录、写作、分析、周报、提醒、计费全链路。

## 说明

- 为便于开发联调，`/v1/auth/sms/send` 在非生产环境返回 `debugCode`。
- AI 标注为启发式实现，接口和数据结构已预留为可替换模型网关。

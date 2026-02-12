SHELL := /bin/zsh

.PHONY: install db-up db-down db-logs db-reset dev test build smoke smoke-memory smoke-postgres smoke-postgres-clean ci-local preflight-env release-preflight release-verify release-verify-soft release-dry-run release-dry-run-first release-patch release-minor release-major release-first release-bootstrap release-bootstrap-dry

install:
	npm install

db-up:
	docker compose up -d postgres

db-down:
	docker compose down

db-logs:
	docker compose logs -f postgres

db-reset:
	docker compose down -v
	docker compose up -d postgres

dev:
	npm run dev

test:
	npm test

build:
	npm run build

smoke:
	./scripts/acceptance.sh

smoke-memory:
	./scripts/smoke_with_server.sh

smoke-postgres:
	./scripts/smoke_postgres.sh

smoke-postgres-clean:
	CLEAN_DB=1 ./scripts/smoke_postgres.sh

ci-local:
	./scripts/ci_local.sh

preflight-env:
	./scripts/preflight_env.sh

release-preflight:
	./scripts/release_preflight.sh

release-verify:
	./scripts/release_verify.sh

release-verify-soft:
	ALLOW_UNRELEASED=1 ./scripts/release_verify.sh

release-dry-run:
	npm run release:dry-run -- --release-as patch

release-dry-run-first:
	npm run release:dry-run:first

release-patch:
	npm run release -- --release-as patch

release-minor:
	npm run release -- --release-as minor

release-major:
	npm run release -- --release-as major

release-first:
	npm run release:first

release-bootstrap:
	./scripts/first_release_bootstrap.sh

release-bootstrap-dry:
	DRY_RUN=1 ./scripts/first_release_bootstrap.sh

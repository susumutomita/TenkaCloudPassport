.PHONY: install
# --ignore-scripts: Mini Shai-Hulud 2nd (Flatt Security, 2026-05-12) を含む
# lifecycle script 系サプライチェイン攻撃を一段目で封じるフラグ。
# Bun は npm_config_ignore_scripts 環境変数も .npmrc の ignore-scripts も読まないため
# (公式 docs では bunfig.toml のみが設定経路)、Bun を叩く側で毎回明示する必要がある。
# Bun はデフォルトで「top 500 npm パッケージ」の lifecycle script を暗黙信頼する
# 仕様もあるため、ここで全停止させる方が事故が少ない。Husky の prepare も巻き添えで
# 止まるので、フックを使う場合は make setup-hooks で明示的に再有効化する。
install:
	bun install --ignore-scripts

.PHONY: install_ci
# INSTALL_CI_FLAGS は CI 専用の seam。GitHub Actions では safe-chain shim 経由の bun に
# --safe-chain-skip-minimum-package-age を渡すために使う。素の bun はこのフラグを
# 解釈できないため、ローカル実行ではデフォルトの空のままにする。
install_ci:
	bun install --frozen-lockfile --ignore-scripts $(INSTALL_CI_FLAGS)

.PHONY: setup-hooks
# install 時に --ignore-scripts で止めた husky の prepare をここで明示的に走らせる。
# `bun run prepare` は package.json の "prepare": "husky" を叩くため、Husky 一発で済む。
setup-hooks:
	bun run prepare

.PHONY: setup-llama-native
# llama.rn の lifecycle script は通常 install で信頼しない。将来 package を追加した後も、
# Version 固定 manifest の表示、強制取得、SHA-256 marker 再検証をこの opt-in 経路だけで行う。
setup-llama-native:
	bash scripts/setup-llama-native.sh

.PHONY: build
build:
	bun run build

.PHONY: clean
clean:
	bun run clean

.PHONY: test
test:
	bun run test

.PHONY: test_coverage
test_coverage:
	bun run test:coverage

.PHONY: test_watch
test_watch:
	bun test --watch

.PHONY: lint
lint:
	bun run lint

.PHONY: lint_fix
lint_fix:
	bun run lint:fix

.PHONY: lint_text
lint_text:
	bun run lint:text

.PHONY: typecheck
typecheck:
	bun run typecheck

.PHONY: format
format:
	bun run format

.PHONY: format_check
format_check:
	bun run format:check

.PHONY: architecture_harness
ARCHITECTURE_HARNESS_ARGS ?= --staged --fail-on=error
architecture_harness:
	bun scripts/architecture-harness.ts $(ARCHITECTURE_HARNESS_ARGS)

.PHONY: harness_test
# harness 自体の invariant 検出ロジックを検証する。Expo 依存の解決前でも動くため、
# before-commit の先頭側で実行する。
harness_test:
	bun test scripts/

.PHONY: pre_release_check
pre_release_check:
	bun run check:pre-release

.PHONY: app_test
app_test:
	bun run test:coverage

.PHONY: web_export
web_export:
	bun run build:web

.PHONY: before-commit
before-commit: architecture_harness harness_test pre_release_check lint_text lint typecheck app_test web_export

.PHONY: dev
dev:
	bun run dev

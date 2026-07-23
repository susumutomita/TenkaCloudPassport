# 引数なしで `make` を叩いたときに `install` が動いてしまうと、なぜ install が
# 走ったのか分かりにくい (Issue 112)。既定 target を help 表示にし、`make start` /
# `make dev` / `make stop` の使い分けを毎回確認できるようにする。
.DEFAULT_GOAL := help

.PHONY: help
help:
	@echo "TenkaCloud Passport の主要 make target。"
	@echo ""
	@echo "開発サーバー起動:"
	@echo "  make start    Expo Go 向け (--go)。個人端末に Development Build を入れていない場合はこちら。"
	@echo "  make dev      Development Build (dev-client) 向け。expo run:ios/android で端末に入れた版と繋ぐ場合はこちら。"
	@echo "  make stop     8081 で待ち受ける Expo/Metro だけを安全に停止する (該当プロセスがなければ何もしない)。"
	@echo "  make restart  stop してから dev で再起動する。"
	@echo ""
	@echo "品質ゲート:"
	@echo "  make before-commit  architecture_harness / harness_test / dup_check / lint_text / lint 等を一括実行する。"
	@echo ""
	@echo "target 全量は AGENTS.md の「コマンド一覧」を参照する。"

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

.PHONY: release_candidate
# Values remain shell environment variables so untrusted Version / ref text is never expanded as Makefile syntax.
# source-release-cli.ts delegates validation before Git is invoked with an argv array.
release_candidate:
	bun -e 'const cli = await import("./scripts/source-release-cli.ts"); process.exitCode = await cli.executeSourceReleaseCli(Bun.argv.slice(1));' -- "$${RELEASE_VERSION:?RELEASE_VERSION is required}" "$${RELEASE_REF:-HEAD}" "$${RELEASE_OUTPUT:?RELEASE_OUTPUT is required}"

.PHONY: release_verify
release_verify:
	bun -e 'const cli = await import("./scripts/source-release-verify-cli.ts"); await cli.verifySourceReleaseCli(Bun.argv.slice(1));' -- "$${RELEASE_VERSION:?RELEASE_VERSION is required}" "$${RELEASE_OUTPUT:?RELEASE_OUTPUT is required}"

.PHONY: release_test_coverage
release_test_coverage:
	bun test --coverage scripts/source-release.test.ts

# jscpd ベースライン・ラチェット。重複ゼロは強制しない (意図的な類似は baseline に
# 焼き込み済み)。baseline を超える新規コピー&ペーストだけ fail させる (ADR-0012)。
.PHONY: dup_check
dup_check:
	bun scripts/check-duplication.ts

.PHONY: dup_baseline
dup_baseline:
	bun scripts/check-duplication.ts --update

.PHONY: dup_report
dup_report:
	bunx jscpd

# knip デッドコード検出。全量報告しかできないため gate にせず報告のみ (ADR-0012)。
# rules は knip.json で warn 化済みなので検出があっても exit 0。
.PHONY: dead_code
dead_code:
	bun run dead-code

.PHONY: before-commit
before-commit: architecture_harness harness_test release_test_coverage pre_release_check dup_check lint_text lint typecheck app_test web_export

# Development Build (dev-client) 向け。`expo run:ios` / `expo run:android` で
# 個人端末や Simulator に入れた Development Build と繋ぐときはこちら。Expo Go では
# 繋がらない (dev-client 版と Expo Go 版は別 Build)。
.PHONY: dev
dev:
	bun run dev

# スマホ (Expo Go) 向けのワンコマンド起動。expo-dev-client が入っているため素の
# `expo start` は Development Build モードになり、Expo Go の QR 読取では起動できない。
# `--go` で Expo Go モードに固定する。Development Build と繋ぐ場合は `make dev` を使う。
.PHONY: start
start:
	@[ -d node_modules ] || $(MAKE) install
	@echo "スマホに Expo Go を入れ、Mac と同じ Network (Wi-Fi) につないでから、下に出る QR を読み取ってください。"
	bunx expo start --go

# Metro/Expo (既定 8081) を停止する。ポート 8081 の PID を無差別に kill すると、
# 実機接続など他用途で 8081 を使っているプロセスまで巻き添えにしうるため、PID ごとに
# コマンドラインを確認し、Expo/Metro 由来と識別できたものだけを kill する
# (2 段階の safety net、Issue 112)。該当プロセスがなくてもエラーにしない。
.PHONY: stop
stop:
	@pids="$$(lsof -ti tcp:8081 2>/dev/null)"; \
	if [ -z "$$pids" ]; then \
		echo "ポート 8081 で待ち受けている開発サーバーは見つかりませんでした。"; \
		exit 0; \
	fi; \
	identified=0; \
	stopped=0; \
	for pid in $$pids; do \
		cmd="$$(ps -p "$$pid" -o command= 2>/dev/null)"; \
		lower="$$(printf '%s' "$$cmd" | tr '[:upper:]' '[:lower:]')"; \
		case "$$lower" in \
			*expo*|*metro*) \
				identified=1; \
				if kill "$$pid" 2>/dev/null; then \
					echo "停止しました: PID $$pid ($$cmd)"; \
					stopped=1; \
				else \
					echo "停止に失敗しました: PID $$pid ($$cmd) — 権限等を確認してください"; \
				fi;; \
			*) \
				echo "スキップしました: PID $$pid は Expo/Metro と識別できないため停止しません ($$cmd)";; \
		esac; \
	done; \
	if [ "$$stopped" = "1" ]; then \
		echo "開発サーバーを停止しました。"; \
	elif [ "$$identified" = "1" ]; then \
		echo "Expo/Metro のプロセスは見つかりましたが、停止に失敗したものがあります。上記メッセージを確認してください。"; \
		exit 1; \
	else \
		echo "Expo/Metro と識別できるプロセスが見つからなかったため、何も停止しませんでした。"; \
	fi

# stop してから dev-client 向けに再起動する。Expo Go で再起動したい場合は
# `make stop` の後に `make start` を個別に叩く。
.PHONY: restart
restart:
	$(MAKE) stop
	$(MAKE) dev

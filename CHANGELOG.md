# Changelog

この Project の注目すべき変更を記録します。Version は Semantic Versioning に従い、公開済み Artifact を
同じ Version で置き換えません。

## [Unreleased]

- Public OSS Alpha は `Blocked / Not run`。物理 Gate と外部 Pilot の証拠待ち。

## [1.0.0] - Unreleased

App Store（TestFlight 経由の Native 配布）向けの初回 Release です。Public OSS Alpha の
Source-only Candidate（下記 `0.1.0-alpha.1`）とは別の Release Track であり、Version 番号は
連動しません。

### Added

- 名刺不要・アカウント不要の自己紹介カード作成と QR 表示。相手は標準カメラで自己紹介ページを開き、連絡先への追加は任意である。
- クラウド基礎クイズと、クリア済み設問の端末内保存。
- 任意で有効化するオンデバイス AI（Qwen2.5-1.5B-Instruct、Apache-2.0、約 1.1 GB）による会話の共通点発見。同意画面を経てからのみモデルを取得し、推論はすべて端末内で完結してサーバーへは送信しない。
- 表示言語の自動検出と明示切り替え。
- バージョンタグ push から EAS Build / Submit までを自動化した TestFlight 配布経路。

### Known limitations

- 連絡先への追加操作の確認は iPhone / Safari だけである。Android は `.vcf` を開く一手間が未検証であり、SNS アプリ内ブラウザでは保存自体が失敗する場合がある。
- Public OSS Alpha（Source-only Candidate の公開）は本 Release とは独立に `Blocked / Not run` のままである。

## [0.1.0-alpha.1] - Unreleased

### Added

- Account-free Passport onboarding、Rules Provider、QR / Ready、bounded Lounge、Bridge / no-signal。
- JSON バックアップ、Local Diagnostics / Full Delete transaction、privacy-preserving Pilot Measurement。
- Group Coordinator、secure Handshake / Peer Protocol foundation、Facilitator Kit。
- Reproducible Source-only Candidate、SPDX SBOM、License Notice、SHA-256 Manifest contract。

### Known limitations

- Local LLM、GGUF、実 Nearby Transport、Native distribution は default branch の Supported 能力ではない。
- iOS / Android、Camera、Accessibility、Offline E2E、Storage / OS Log、Dry Run、Pilot は `Not run` を含む。
- 詳細は [0.1.0-alpha.1 Release Notes](./docs/releases/0.1.0-alpha.1.md)を参照する。

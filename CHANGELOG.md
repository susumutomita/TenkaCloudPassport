# Changelog

この Project の注目すべき変更を記録します。Version は Semantic Versioning に従い、公開済み Artifact を
同じ Version で置き換えません。

## [Unreleased]

- Public OSS Alpha は `Blocked / Not run`。物理 Gate と外部 Pilot の証拠待ち。

## [1.2.0] - 2026-07-28

オンデバイス AI を Apple Intelligence（OS 内蔵、FoundationModels framework）へ全面切替した Release です（ADR-0057 / ADR-0058）。

### Changed

- 会話エージェントの AI を、ダウンロード型モデル（Qwen）から OS 内蔵の Apple Intelligence へ一本化した。モデルのダウンロード・検証・削除・復旧という工程が製品からなくなり、対応端末（iPhone 15 Pro 以降＋iOS 26、Apple Intelligence 有効）では何も設定せずに AI が動作する。推論はすべて端末内で行い、内容を送信しない性質は変わらない。
- Apple Intelligence を利用できない端末では、確認済みテーマからの照合で動作し、その旨を会話画面に明示する。
- Settings からモデルの取得・削除・メモリ注意の UI を撤去した（ダウンロード型モデルの実装は再導入口として残置）。
- App Store 申請メタデータをモデルダウンロード無しの実態へ書き換えた。

## [1.1.6] - 2026-07-28

v1.1.5 はタグ運用ミス（version 不一致ガードが正しく停止）により欠番です。

### Fixed

- 起動時の復旧確認でジャーナルの読み取りが一時的に失敗しただけで、オンデバイス AI が再起動後も使えなくなる問題を修正した。「読み取れない」を「削除の中断あり」と誤分類していた分岐を、限定リトライ付きの fail-open へ改めた（ADR-0056。削除の中断が確認された場合の保護は従来どおり維持）。
- ありふれた一時的なロック競合まで「Native Context の解放を確認できません」という再起動を求める致命的な文言で表示していた問題を修正した。競合は非致命の状態コードとして扱い、重い文言は Native Context が本当に隔離された場合に限定した。

## [1.1.4] - 2026-07-28

### Fixed

- モデルのメモリ注意画面の文言を、開発用語（Risk snapshot・Resource・Context・Thermal）から消費者に通じる平易な表現へ書き換えた（判定ロジックは不変）。
- アプリのバージョン番号を実態（タグ）と同期した。v1.1.1〜v1.1.3 は TestFlight 上ですべて「1.1.0」のビルド番号違いとして表示されていた。release ワークフローにタグと `app.json` の一致ガードを追加し再発を防止する。

## [1.1.3] - 2026-07-28

TestFlight v1.1.2 の実機で owner が確認した 2 件を解決した Release です。

### Fixed

- 過去バージョンの削除バグが残した「Manifest はモデルを参照するが実体ファイルが無い」状態で、読込・取得・取り込みが恒久的に Manifest エラーになる問題を、読込時の自己修復（欠損参照の自動除去、退避ファイルがあれば復元）で解決した。壊れた状態の端末もアプリを起動するだけで回復する（ADR-0055）。
- モデル未取得の状態で会話エージェントを開いたとき、何も説明が無いまま動作していた問題を修正した。現在の動作モード（確認済みテーマから探す）と、モデル取得で増える機能を明示する常設ノートを表示し、その場から取得フロー（同意 → ダウンロード）に入れる（Issue 180）。Settings と会話画面でモデル取得 UI を共有 component 化した。

## [1.1.2] - 2026-07-28

TestFlight v1.1.1 の実機で owner が確認した 2 件を修正した Release です。

### Fixed

- モデル削除が必ず「MANIFEST_READ_FAILED」で失敗して見えた問題を修正した。真因は `File.move` が成功時に instance の uri を移動先へ付け替える仕様で、移動後の整合チェックが自分自身（移動先）を見て常に誤 throw していたこと。旧パスの不存在確認を新しい File で行う（ADR-0054 とあわせて、削除後の後始末の競合耐性と、未知エラーを実コードで表示する分類も改善）。
- AI 同士の事前会話で、相手の AI が owner 側の情報を自分のオーナーの事として話す取り違えを修正した。各 AI と profile text の対応をプロンプトで明示的に束縛する。

## [1.1.1] - 2026-07-27

TestFlight v1.1.0 の実機で owner が確認した公開 blocker 3 件（モデル取得の体験）を修正した Release です。あわせて会話体験を大きく改善しています。

### Added

- AI 同士の事前会話: あなたの AI と相手の AI が端末内で語り合って接点を探し、1 ターンずつライブで進行する（入力中インジケータ付き。ADR-0050 / ADR-0051）。話者ラベルは本人名でなく AI であることを明示し、本人の台詞を捏造して見せない。
- ホーム画面に会話エージェントの主導線「会話のきっかけを AI と見つける」を追加した（Issue 170）。

### Fixed

- 信頼済みモデルのダウンロードを画面遷移で中断しないアプリスコープの進行にした。中止は明示ボタンのみ（ADR-0052）。
- アプリのバックグラウンド遷移で転送が死ぬ問題を、AppState 監視による pause/resume（`DownloadTask.savable()`/`fromSavable()`）で解消した（ADR-0052）。
- ダウンロード完了後の検証が純 TypeScript の SHA-256（1.04 GiB、実機で数分〜十数分）で固まって見えた問題を、ネイティブ MD5 照合（数秒）へ置き換えた。MD5 参照値は公式配布ファイルから pinned SHA-256 との一致確認を経て採取し、信頼の連鎖を維持している（ADR-0053）。
- 会話エージェントの LLM 入力が petName 長超過で常に拒否されていた統合バグ、モデル出力の chat template 痕跡で JSON 解析が失敗するバグ、テーマ不一致時に LLM が呼ばれない設計ギャップ、起動のたびに 1 GiB を全ハッシュして数分ビジーになる問題を修正した（ADR-0045〜0048）。

## [1.1.0] - 2026-07-25

会話エージェントを実際に使える形にした Release です。

### Added

- 会話エージェントの「QR 再スキャン」で実カメラを開き、対面の相手が表示している自己紹介ページの QR を読み取れるようにした。これまでの読取経路は単一端末デモ用の in-process 実装だけで、対面の相手のカードは取り込めなかった（ADR-0042）。
- 自己紹介カードの自由記述（肩書き・所属・自己紹介文）を端末内モデルへ渡し、カタログの会話テーマが一致しない相手でも共通点を提示できるようにした。モデルは自分の言葉を書けず、両者の文から根拠になった箇所をそのまま引用する。表示前に引用が入力文に実在することを照合し、確認できないものは表示せず Rules の結果へ倒す（ADR-0043）。
- Settings のオンデバイス AI 有効化 UI を復元し、消費者がモデルを入手できるようにした。

### Changed

- 端末内 LLM を会話エージェントに限って再有効化した。ADR-0038 が v1.0 の暫定措置として置いていた Provider の Rules 固定を ADR-0043 が supersede する。Pet Interaction（Lounge）は自由記述を持たないため Rules のままとした。
- `NSCameraUsageDescription` を追加した。マイクと `RECORD_AUDIO` は要求しない。

### Known limitations

- ADR-0038 が記録した実機不具合 2 件の状態は次のとおりである（根拠 [ADR-0044](docs/adr/0044-correct-adr-0043-unverified-crash-basis.md)）。モデルのダウンロードが 100 パーセントで固まる件は PR 140 で原因を特定して修正し、同コミットで実機確認済みだが、本バージョンのビルドでの再確認は未実施である。未完了状態で会話エージェントを開くと native crash する件は原因が未特定で、本バージョンでの再現有無も未確認である。

## [1.0.0] - Unreleased

App Store（TestFlight 経由の Native 配布）向けの初回 Release です。Public OSS Alpha の
Source-only Candidate（下記 `0.1.0-alpha.1`）とは別の Release Track であり、Version 番号は
連動しません。

### Added

- 名刺不要・アカウント不要の自己紹介カード作成と QR 表示。相手は標準カメラで自己紹介ページを開き、連絡先への追加は任意である。
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

# TenkaCloud Passport

[English](./README.en.md)

TenkaCloud Passport は、名刺がなくても自己紹介を渡せる、無料でアカウント不要の Expo アプリです。
QR コードを見せるだけで、相手はアプリを入れずに標準カメラで自己紹介ページを開けます。詳しくは
[Landing Page](https://card.tenkacloud.com/) を見てください。

## デモ動画

[![デモ動画](https://img.youtube.com/vi/KgMwSKu05a4/hqdefault.jpg)](https://youtube.com/shorts/KgMwSKu05a4)

## 何ができるか

カード作成 → QR 表示 → 相手が標準カメラで読む → ブラウザで自己紹介ページ → 連絡先追加は任意、
という流れです。

- 名前（必須）・肩書き・所属・自己紹介・リンクを入力し、明示保存するまで端末に残さない。
- 保存すると、標準カメラで読み取れる実 QR コード（自己紹介ページの URL）を表示する。読み取ると
  ブラウザで自己紹介ページが開き、連絡先への追加はページ内のボタンを押した場合だけの任意操作
  である。
- カードの表示自体は iOS / Android で同じように動作する。連絡先への追加を確認済みなのは
  iPhone / Safari のみである。Android では `.vcf` を保存してから開く 1 手間が必要で、この
  経路は未検証である。LINE、X、Instagram などの SNS アプリ内ブラウザでは、`.vcf` の保存自体が
  失敗する場合がある。
- サーバーもアカウントも要求しない。自己紹介カードを共有するときは、自己紹介データを
  URL のフラグメントに含む QR コードを表示し、相手が読み取る。フラグメントはサーバーへ
  送信されない。手動 JSON バックアップは、自分で行う別のエクスポート経路である。
- 既存の Pet / Lounge / Bridge のコードとテストは残しているが、デフォルトの画面からは
  外している。ロードマップ Step 4（端末内エージェント同士が接点を見つける構想）で
  再登場する想定である。詳しくは LP の Roadmap 節を参照する。

本 Repository の Public OSS Alpha は現在 `Blocked` です（必須の実機検証 Gate が揃うまで
公開しません）。詳しくは [Release Status と Device Matrix](./docs/releases/status.md) を
確認してください。

## 今すぐ試す

一番簡単な順に紹介します。

### (a) Web 版を開くだけ

<https://card.tenkacloud.com/app/>

Install 不要で Browser からすぐ試せる。ホーム画面に追加すればアプリのように起動できる。

- データは Browser の端末内ストレージに保存する。Browser や端末を変えるとカードは共有
  されない。
- 初回表示にはオンライン接続が必要である。Service Worker による完全オフライン化は未対応
  である（follow-up として記録済み）。
- iOS Safari は共有ボタン（上向き矢印のアイコン）から「ホーム画面に追加」を選ぶと、Android
  Chrome はメニューから「ホーム画面に追加」または「アプリをインストール」を選ぶと、ホーム画面
  のアイコンからアプリのように起動できる。App Store 等のストア経由の配布ではない。

### (b) 開発者向け

```bash
make install
make dev
```

`make dev` は Development Build（dev-client）向けです。Native の Development Build をまだ端末や
Simulator に入れていない場合は、先に
[Native Development Build 手順](./docs/development/native-builds.md) を参照してください。
準備なしで試す場合は、`make install` の後に `make start` を使うと Expo Go（`--go`）で起動します。
`make start` と `make dev` は別の Build 向けで、互いに繋がりません。

Metro/Expo が Zombie 化してポートが解放されない場合は `make stop` で該当プロセスだけを
安全に停止できます（8081 上の無関係なプロセスまでは kill しません）。停止してから
`make dev` で再起動したい場合は `make restart` も使えます。target 一覧は `make help`
（引数なしの `make` でも同じ内容）で確認できます。

実機の標準カメラで QR を読み取り、ブラウザで自己紹介ページが開くことは owner が実機で
確認済みです。ただし Release Matrix が求める機種・OS Version 等の記録は伴わないため、
`Verified` ではなく引き続き `Not run` の扱いです。詳しくは
[Release Status と Device Matrix](./docs/releases/status.md) を確認してください。

## Contributor 向け情報

ここから先は Contributor・Native 開発者向けの内容です。

### 現在の Release 状態

| 対象 | 状態 | 現在できること | 停止条件 |
| --- | --- | --- | --- |
| Repository 開発 | `Implemented` | 自己紹介カードの端末内保存・自己紹介ページ URL の QR 生成を含め、Source、純 TypeScript Domain、Rules Provider、Web Export を検証する。 | Green CI を実機証拠にしない。 |
| Source-only Candidate | `Experimental` | 固定 Commit から Draft Candidate を再現する。 | Public Release と呼ばない。既存出力を上書きしない。 |
| Public OSS Alpha | `Blocked` | なし。 | 必須の物理 Gate が `Verified` になるまで公開しない。 |
| Local Champion Walkthrough | `Experimental` | 文書、図、役割、停止条件だけを読み合わせる。 | 実参加者データ、実 QR、Nearby、Group セッション を使わない。 |
| Product セッション | `Blocked / Not run` | なし。 | 配布、実機、Nearby、Accessibility、Full Delete、Dry Run の証拠が揃うまで開始しない。 |

`Implemented / Experimental / Planned` は Source の成熟度、`Verified / Not run / Blocked` は特定環境の
実行証拠です。同じ意味ではありません。組合せごとの根拠は
[Release Status と Device Matrix](./docs/releases/status.md) を確認してください。

### 入口を選ぶ

| 経路 | 対象 | 前提 | 最初の成功 | 現在の保証 |
| --- | --- | --- | --- | --- |
| Repository Gate | Contributor | Git、Bun 1.3.11 | `make before-commit` が exit 0 になる。 | Repository Contract だけ。 |
| Web | Rules と共通 UI の確認者 | Bun、対応 Browser | Metro が URL を表示し、初期画面が開く。 | Web Export と Rules Provider。Browser 操作は Release Matrix では `Not run`。 |
| Expo Go | 実機 UI の確認者 | 対応 Expo Go、同一 Network | QR から初期画面が開く。 | Expo Go 同梱 Native module の範囲だけ。Local LLM / Nearby は使えない。 |
| Native Development Build | Native 開発者 | macOS + Xcode、または Android SDK / JDK | 対象端末で専用 Build が起動する。 | `Not run`。Simulator や Build 成功を実機 Provider 証拠にしない。 |

#### 1. Repository Gate

固定した tag または Commit を checkout してから実行します。移動する `main` を Release 再現性の基準にしません。

```bash
make install_ci
make before-commit
```

最初の成功は、Architecture Harness、Test、Lint、Typecheck、Coverage、Web Export がすべて exit 0 になることです。
失敗時は invariant、`biome.json`、Coverage 閾値を緩めず、最初の失敗を修正します。

#### 2. Web

```bash
make install_ci
bun run web
```

Terminal に表示された URL を Browser で開き、Passport の初期画面が見えることだけを確認します。Local LLM、
実 Camera QR、Nearby Transport の証拠にはなりません。Network で開けない場合は Web Export Gate へ戻り、
Expo Go が成功したと推測しません。

#### 3. Expo Go

```bash
make start
```

スマホに Expo Go を install し、Mac と同じ Network につないでから、Terminal に表示される QR を
Expo Go で読み取ります。`make start` は依存関係が未インストールならインストールしてから、`expo-dev-client` のデフォルトを
上書きして Expo Go 向けモード（`--go`）で開発サーバーを起動します。Expo Go は任意の Custom
Native Code を追加できないため、Local LLM と実 Nearby Transport は対象外です。接続できない場合は
Network 前提を確認し、解消しなければ `Not run` のまま Web 経路へ戻ります。

#### 4. Native Development Build

OS 別の前提、生成 File、署名、復旧は
[Native Development Build 手順](./docs/development/native-builds.md) を参照してください。現在の Release Matrix では
iOS / Android 実機、Local LLM、Nearby Transport は `Not run` または `Blocked` です。

バージョンタグ push から TestFlight までの自動リリースは
[iOS TestFlight 自動リリース手順](./docs/development/ios-testflight-release.md) を参照してください。

配布は [Pilot 配布 Tier と Scale Gate](./docs/design/distribution-tiers.md) に従い、Web / Expo Go の
Tier A、少数実機の Tier B、非開発者へ継続配布する Tier C を区別します。Tier A で Local LLM や
Nearby Transport が動くとは表示しません。

### Draft Source Candidate を再現する

Public Release ではなく、固定 Commit の Source-only Candidate を検証する手順です。`<candidate-commit>` は
Release Operator が提示した 40 桁 Commit SHA へ置き換えます。

```bash
git checkout --detach <candidate-commit>
make install_ci
RELEASE_VERSION=0.1.0-alpha.1 RELEASE_REF=HEAD RELEASE_OUTPUT=release-output make release_candidate
cd release-output
shasum -a 256 -c checksums.txt
```

成功時は Source Archive、SPDX SBOM、`LICENSE`、直接依存 License Notice、Release Manifest、checksum の
6 File ができます。出力先はまだ存在しない Path に限定し、symlink や既存 Candidate を拒否します。
途中失敗や checksum 不一致では配布せず、出力を隔離して別の未作成 Path で再実行します。詳細は
[Source Release Runbook](./docs/development/source-release.md) を参照してください。

### Architecture

[Architecture Overview](./docs/architecture/overview.md) は Domain、Agent Runtime、Rules / Local LLM、Storage、
QR、Nearby Transport の依存方向を図と同等の Text で示します。現在の要点は次です。

- 純 TypeScript Domain は React Native、Storage、Transport、Model Runtime を import しない。
- App 層が Port を呼び、Platform Adapter が外部能力を実装する。
- Web / Expo Go は Rules Provider を使う。
- Local LLM と実 Nearby Transport は default branch の Supported 能力ではない。
- Lounge 由来データは永続化せず、退出、Host 終了、20 分満了の最早契機で破棄する。

### 正本と運用文書

- [Concept](./CONCEPT.md) / [Product Contract](./docs/product/product-contract.md) / [Glossary](./docs/product/glossary.md)
- [Privacy Data Inventory](./docs/privacy/data-inventory.md) / [Retention](./docs/privacy/retention-policy.md)
- [Threat Model](./docs/security/threat-model.md) / [Security Policy](./SECURITY.md)
- [Peer Protocol](./docs/architecture/peer-protocol.md) / [ADR index](./docs/adr/)
- [Facilitator Kit](./docs/facilitator/README.md) / [安全な Walkthrough](./docs/facilitator/walkthrough.ja.md) / [Pilot Protocol](./docs/research/pilot-protocol.md)
- [Release Checklist](./docs/releases/checklist.md) / [Known Limitations](./docs/releases/0.1.0-alpha.1.md)
- [Contributing](./CONTRIBUTING.md) / [Good First Issue candidates](./docs/contributing/good-first-issues.md)

Facilitator Kit は現時点で Document Walkthrough 専用です。実参加者の氏名、写真、Profile、端末 ID を入力せず、
実 QR を生成・読取せず、Nearby / Group セッションを開始しません。物理能力は `Not run` のまま
[安全な Walkthrough](./docs/facilitator/walkthrough.ja.md) を読み上げます。

### 開発規律

作業は [AGENTS.md](./AGENTS.md) と [CLAUDE.md](./CLAUDE.md) に従います。完了条件は
[Definition of Done](./docs/architecture/quality-bar.md)、機械的な禁止事項は
[Architecture Harness](./docs/architecture/harness.md) が正本です。MVP、仮実装、Green CI だけでは完了しません。

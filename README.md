# TenkaCloud Passport

[English](./README.en.md)

TenkaCloud Passport はデジタル名刺ではありません。Owner が公開を許可した手掛かりだけを Pet が扱い、
対面で人間同士の会話を始める Bridge を 1 つ見つけて退く、アカウント不要の Expo アプリです。

## 現在の Release 状態

| 対象 | 状態 | 現在できること | 停止条件 |
| --- | --- | --- | --- |
| Repository 開発 | `Implemented` | Source、純 TypeScript Domain、Rules Provider、Web Export を検証する。 | Green CI を実機証拠にしない。 |
| Source-only Candidate | `Experimental` | 固定 Commit から Draft Candidate を再現する。 | Public Release と呼ばない。既存出力を上書きしない。 |
| Public OSS Alpha | `Blocked` | なし。 | 必須の物理 Gate が `Verified` になるまで公開しない。 |
| Local Champion Walkthrough | `Experimental` | 文書、図、役割、停止条件だけを読み合わせる。 | 実参加者データ、実 QR、Nearby、Group セッション を使わない。 |
| Product セッション | `Blocked / Not run` | なし。 | 配布、実機、Nearby、Accessibility、Full Delete、Dry Run の証拠が揃うまで開始しない。 |

`Implemented / Experimental / Planned` は Source の成熟度、`Verified / Not run / Blocked` は特定環境の
実行証拠です。同じ意味ではありません。組合せごとの根拠は
[Release Status と Device Matrix](./docs/releases/status.md)を確認してください。

## 入口を選ぶ

| 経路 | 対象 | 前提 | 最初の成功 | 現在の保証 |
| --- | --- | --- | --- | --- |
| Repository Gate | Contributor | Git、Bun 1.3.11 | `make before-commit` が exit 0 になる。 | Repository Contract だけ。 |
| Web | Rules と共通 UI の確認者 | Bun、対応 Browser | Metro が URL を表示し、初期画面が開く。 | Web Export と Rules Provider。Browser 操作は Release Matrix では `Not run`。 |
| Expo Go | 実機 UI の確認者 | 対応 Expo Go、同一 Network | QR から初期画面が開く。 | Expo Go 同梱 Native module の範囲だけ。Local LLM / Nearby は使えない。 |
| Native Development Build | Native 開発者 | macOS + Xcode、または Android SDK / JDK | 対象端末で専用 Build が起動する。 | `Not run`。Simulator や Build 成功を実機 Provider 証拠にしない。 |

### 1. Repository Gate

固定した tag または Commit を checkout してから実行します。移動する `main` を Release 再現性の基準にしません。

```bash
make install_ci
make before-commit
```

最初の成功は、Architecture Harness、Test、Lint、Typecheck、Coverage、Web Export がすべて exit 0 になることです。
失敗時は invariant、`biome.json`、Coverage 閾値を緩めず、最初の失敗を修正します。

### 2. Web

```bash
make install_ci
bun run web
```

Terminal に表示された URL を Browser で開き、Passport の初期画面が見えることだけを確認します。Local LLM、
実 Camera QR、Nearby Transport の証拠にはなりません。Network で開けない場合は Web Export Gate へ戻り、
Expo Go が成功したと推測しません。

### 3. Expo Go

```bash
make install_ci
bun run start
```

同一 Network の Expo Go から Metro の QR を読み、初期画面が開くことを確認します。Expo Go は任意の Custom
Native Code を追加できないため、Local LLM と実 Nearby Transport は対象外です。接続できない場合は
Network 前提を確認し、解消しなければ `Not run` のまま Web 経路へ戻ります。

### 4. Native Development Build

OS 別の前提、生成 File、署名、復旧は
[Native Development Build 手順](./docs/development/native-builds.md)を参照してください。現在の Release Matrix では
iOS / Android 実機、Local LLM、Nearby Transport は `Not run` または `Blocked` です。

配布は [Pilot 配布 Tier と Scale Gate](./docs/design/distribution-tiers.md) に従い、Web / Expo Go の
Tier A、少数実機の Tier B、非開発者へ継続配布する Tier C を区別します。Tier A で Local LLM や
Nearby Transport が動くとは表示しません。

## Draft Source Candidate を再現する

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
[Source Release Runbook](./docs/development/source-release.md)を参照してください。

## Architecture

[Architecture Overview](./docs/architecture/overview.md) は Domain、Agent Runtime、Rules / Local LLM、Storage、
QR、Nearby Transport の依存方向を図と同等の Text で示します。現在の要点は次です。

- 純 TypeScript Domain は React Native、Storage、Transport、Model Runtime を import しない。
- App 層が Port を呼び、Platform Adapter が外部能力を実装する。
- Web / Expo Go は Rules Provider を使う。
- Local LLM と実 Nearby Transport は default branch の Supported 能力ではない。
- Lounge 由来データは永続化せず、退出、Host 終了、20 分満了の最早契機で破棄する。

## 正本と運用文書

- [Concept](./CONCEPT.md) / [Product Contract](./docs/product/product-contract.md) / [Glossary](./docs/product/glossary.md)
- [Privacy Data Inventory](./docs/privacy/data-inventory.md) / [Retention](./docs/privacy/retention-policy.md)
- [Threat Model](./docs/security/threat-model.md) / [Security Policy](./SECURITY.md)
- [Peer Protocol](./docs/architecture/peer-protocol.md) / [ADR index](./docs/adr/)
- [Facilitator Kit](./docs/facilitator/README.md) / [安全な Walkthrough](./docs/facilitator/walkthrough.ja.md) / [Pilot Protocol](./docs/research/pilot-protocol.md)
- [Release Checklist](./docs/releases/checklist.md) / [Known Limitations](./docs/releases/0.1.0-alpha.1.md)
- [Contributing](./CONTRIBUTING.md) / [Good First Issue candidates](./docs/contributing/good-first-issues.md)

Facilitator Kit は現時点で Document Walkthrough 専用です。実参加者の氏名、写真、Profile、端末 ID を入力せず、
実 QR を生成・読取せず、Nearby / Group セッションを開始しません。物理能力は `Not run` のまま
[安全な Walkthrough](./docs/facilitator/walkthrough.ja.md)を読み上げます。

## 開発規律

作業は [AGENTS.md](./AGENTS.md) と [CLAUDE.md](./CLAUDE.md) に従います。完了条件は
[Definition of Done](./docs/architecture/quality-bar.md)、機械的な禁止事項は
[Architecture Harness](./docs/architecture/harness.md)が正本です。MVP、仮実装、Green CI だけでは完了しません。

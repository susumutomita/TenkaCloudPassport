# TenkaCloud Passport

TenkaCloud Passport は、イベントで出会った Owner が公開を許可した手掛かりから、口頭会話を
始める理由である Bridge を 1 つだけ提示して退く、アカウント不要の Expo アプリです。

## 現在の基盤

- Expo SDK 57 と React Native 0.86 を使う単一アプリをリポジトリルートに置く。
- iOS、Android、Web は同じ `App.tsx`、Screen、純 TypeScript Domain を使う。
- Expo Go / Web は外部と通信しない Rules Provider で動く。
- Local Agent は Development Build 専用の遅延 loader 境界だけを持ち、`llama.rn` はまだ依存へ追加しない。
- Peer Protocol 1.2 は strict schema、Capability Negotiation、去重、順序、期限、bounded receiver を
  純 TypeScript で定義する。実 Nearby Transport Adapter と実機検証は未実装である。
- Lounge 由来データは永続化せず、退出、Host 終了、20 分満了の最早契機で破棄する。

製品契約は [プロダクト契約](./docs/product/product-contract.md)、初回フローは
[初回 Encounter の設計](./docs/design/initial-encounter.md)、基盤選定は
[ADR-0008](./docs/adr/0008-expo-local-agent-foundation.md)、Wire 契約は
[Peer Protocol Specification](./docs/architecture/peer-protocol.md) を参照する。

対面 Event の版管理済み運用文書は
[Facilitator Kit](./docs/facilitator/README.md) を参照する。Kit の物理 Dry Run と実機 Transport 検証は
`Not run` であり、文書の存在を実機利用可能の証拠にしない。

## セットアップ

```bash
make install
bunx expo install --fix -- --ignore-scripts
make setup-hooks
```

通常の install と Expo の互換バージョン調整は lifecycle script を無効化する。調整した後は、
更新された `package.json` と正規 lockfile である `bun.lock` を同時にレビューする。

## 開発

```bash
make dev
bun run ios
bun run android
bun run web
```

`make dev` は Expo 開発サーバーを起動する。Expo Go では Rules Provider を使う。Native module を
使う Local Agent は、後続 Issue で Development Build 専用 entry point から接続する。環境ごとの能力、
Xcode Personal Team、iOS / Android 実機手順は
[Native Development Build 手順](./docs/development/native-builds.md)を参照する。

## 品質ゲート

```bash
bun scripts/architecture-harness.ts --staged --fail-on=error
make before-commit
```

`make before-commit` は architecture harness、harness 自身のテスト、公開前 invariant、textlint、
Biome、型検査、Domain のカバレッジ、Web Export を順に検査する。依存を取得できない環境では
純 TypeScript Domain の `bun test` と、利用可能な静的ゲートを先に実行する。

## 主なディレクトリ

```text
.
├── App.tsx
├── index.ts
├── assets/
├── src/
│   ├── app/
│   ├── components/
│   ├── domain/
│   ├── local-agent/
│   └── screens/
├── docs/
│   ├── adr/
│   ├── design/
│   ├── facilitator/
│   ├── privacy/
│   └── product/
└── scripts/
```

## 供給網防御

- `make install` と `make install_ci` は `--ignore-scripts` を必須にする。
- `bunfig.toml` と `package.json` は `trustedDependencies = []` を指定する。
- Native Artifact は通常 install から分離し、将来 `llama.rn` を追加した後も
  `make setup-llama-native` だけで取得する。
- architecture harness は Git URL 依存、過剰な lifecycle hook、既知 IOC、lockfile の Git 解決を検出する。
- GitHub Actions は固定 SHA の Action、safe-chain、`bun.lock` の frozen install、Expo Native
  compatibility check を使う。

詳細は [ADR-0001](./docs/adr/0001-supply-chain-hardening.md) と
[architecture harness](./docs/architecture/harness.md) を参照する。

## 開発規律

[AGENTS.md](./AGENTS.md) と [CLAUDE.md](./CLAUDE.md) に従う。完了条件は
[Definition of Done](./docs/architecture/quality-bar.md) を正本とし、MVP や仮実装を完了としない。

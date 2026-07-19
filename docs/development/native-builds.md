# Native Development Build 手順

本書は Expo Go / Web の JavaScript 検証と、iOS / Android Development Build の Native 実機検証を
分離する。Local Agent の設計境界は [ADR-0008](../adr/0008-expo-local-agent-foundation.md)、Artifact と
Delivery の判断は [ADR-0010](../adr/0010-native-delivery-quality-gates.md) を正本とする。

## 能力差

| 環境 | Rules Provider | `llama.rn` Local Agent | 判定できること |
| --- | --- | --- | --- |
| Expo Go | 利用できる。 | Native module を追加できないため利用できない。 | 純 TypeScript Domain と共通 UI の動作である。 |
| Web | 利用できる。 | Native module を解決できないため利用できない。 | Web Bundle と Rules Provider の動作である。 |
| iOS Development Build | 利用できる。 | GGUF Path を設定した専用 Build だけで利用できる。 | iOS code signing、権限、Native link、実機 runtime の動作である。 |
| Android Development Build | 利用できる。 | GGUF Path を設定した専用 Build だけで利用できる。 | Android SDK、権限、ABI、Native link、実機 runtime の動作である。 |

repository は `llama.rn` と `expo-dev-client` を依存へ持つが、Expo Go と Web は Native module を
Top-level import しない。Web / Default の Platform Composition Root と、Native の Model 未設定経路は
`RULES_MODEL_PROVIDER` を返す。Native で GGUF Path を設定した場合だけ、関数内 dynamic import を通じて
`llama.rn` を初期化する。詳細は
[llama.rn Provider と Development Build 統合の設計](../design/llama-provider-development-build.md) を参照する。

## 共通準備

```bash
make install
bunx expo install --check
```

`make install` は lifecycle script を実行しない。`llama.rn` 導入後も `trustedDependencies` は空のままにし、
Native Artifact は次の opt-in command だけで取得する。

```bash
make setup-llama-native
```

command は install 済み `llama.rn` の Version、GitHub Release URL、期待 SHA-256 を表示し、公式 downloader を
強制再実行する。取得 byte の SHA-256、展開、完了 marker のいずれかが一致しなければ非 0 で終了する。
Package 導入後も通常 install は Artifact を取得しない。この command が Version 固定 Manifest、公式 Release
URL、SHA-256、展開後 Marker を検証できたときだけ Native Build へ進む。

Local Model は Model ID ではなく、Development Build 起動前に次の公開環境変数で端末内 GGUF Path と
Resource 設定を渡す。Model Weight の取込 UI と永続 Metadata は Issue 18 の責務とする。

```bash
EXPO_PUBLIC_LOCAL_MODEL_PATH=file:///path/in/app-sandbox/model.gguf \
EXPO_PUBLIC_LOCAL_MODEL_N_CTX=2048 \
EXPO_PUBLIC_LOCAL_MODEL_GPU_LAYERS=0 \
EXPO_PUBLIC_LOCAL_MODEL_N_PREDICT=96 \
bunx expo start --dev-client
```

`EXPO_PUBLIC_*` は bundle へ埋め込まれる公開設定であり、Secret、Passport Data、Prompt、Token は指定しない。
Model Path と数値 Resource 上限だけに使う。

Path が未設定なら正常な Rules Provider になる。不正 Path / 数値や Model Load 失敗は App 起動を壊さず、
Local 実行時に `LOAD_ERROR` として Rules へ 1 回だけ切り替わる。

## iOS Development Build

### 前提

- macOS、現在の Xcode、Xcode Command Line Tools を使う。
- Apple Account を Xcode の Accounts へ追加する。有料 Apple Developer Program は必須にしない。
- iPhone で Developer Mode を有効にし、Mac を信頼して USB または同一 network へ接続する。
- 初回の Native 生成と CocoaPods 解決には network が必要になる場合がある。

### 個人端末での手順

```bash
bunx expo run:ios --device
```

自動 signing で停止した場合は、生成された `ios` project を Xcode で開き、app target の
Signing & Capabilities で Automatically manage signing を有効にして自分の Personal Team を選ぶ。
bundle identifier が同じ Personal Team 内で一意であることを確認し、接続した iPhone を run destination に
選んで Build and Run する。JavaScript の変更だけを反映する場合は、Native Build を入れ直さず Metro を
起動する。

```bash
bunx expo start --dev-client
```

`make setup-llama-native`、iOS Build、実機での Local Agent 初期化、構造化成功、Streaming Cancel、
Context Release、Rules Provider fallback を同じ Version と GGUF で確認する。Airplane Mode で Bridge まで
完走して初めて Offline 成功証拠とする。

### Xcode Personal Team の制限

Personal Team では同時に登録できる App ID は 10 件、test device は platform ごとに 3 台、1 device に
install できる app は 3 件です。App ID、device、Provisioning Profile は 7 日で失効し、期限後は Build と
install をやり直す。これは個人所有端末の検証境界であり、複数人への継続配布には使わない。

有料 Apple Developer Program が必要になる境界は、App Store / TestFlight 配布、EAS 上での iOS 実機向け
signing、Personal Team の上限を越える端末共有、Personal Team で使えない entitlement や service を採用する
時点です。個人端末へのローカル Build はこの有料登録を完了条件にしない。

## Android Development Build

### 前提

- Android Studio、Android SDK、JDK、platform-tools を用意し、Expo SDK が要求する SDK を install する。
- 実機では Developer options と USB debugging を有効にし、接続時の RSA authorization を許可する。
- Emulator または実機を `adb devices` で認識できる状態にする。

### 実機または Emulator での手順

```bash
bunx expo run:android --device
bunx expo start --dev-client
```

`llama.rn` の Native Artifact は arm64-v8a / x86_64 を対象とするため、Local Agent 実機検証では端末 ABI を
確認する。モデルは app sandbox 内へ置き、共有 Storage 全体を読む権限は追加しない。Native module、model、
権限または ABI が不正な場合に Rules Provider の完走まで壊さないことを別に確認する。

## 権限と既知制約

- 現在の Rules Provider は network、camera、microphone、location、連絡先、共有 Storage の権限を要求しない。
- Metro 接続では同一 network と Local Network の許可が必要になる場合があるが、製品機能の外部通信要件では
  ない。
- iOS Simulator は `llama.rn` の Metal 実行証拠にしない。Local Agent は対応する個人端末で確認する。
- Android Local Agent は 64 bit ABI と端末 memory の制約を受ける。JavaScript test の Green で代替しない。
- Native dependency、config plugin、entitlement、Gradle、Pod が変わった場合は Development Build を作り直す。
- model weight、Provisioning Profile、Certificate、Token、生成した `ios` / `android`、Build 出力は commit しない。

## Renovate と Native Compatibility

Renovate は Expo、React、React Native、`llama.rn` を Native Compatibility group として更新する。
CI は frozen な `bun.lock` で install した直後、専用の `Expo Native compatibility` step で次を実行する。

```bash
bun run expo:check
```

`expo install --check` が Expo SDK の推奨 Version との差を検出した場合は非 0 になり、その Renovate 更新を
merge しない。その後の `make before-commit` は architecture harness、harness test、pre-release check、
textlint、Biome、typecheck、app test、Web Export をローカルと同じ順で実行する。CI Green でも iOS / Android
実機 runtime の証拠にはならないため、Native dependency 更新では両 Development Build の再検証を残す。

## 外部資料

- Expo Development Build: https://docs.expo.dev/develop/development-builds/create-a-build/ 。
- Expo Native project のローカル実行: https://docs.expo.dev/guides/local-app-development/ 。
- Apple Personal Team: https://developer.apple.com/help/account/basics/about-your-developer-account/ 。
- `llama.rn`: https://github.com/mybigday/llama.rn 。

# Native Development Build 手順

本書は Expo Go / Web の JavaScript 検証と、iOS / Android Development Build の Native 実機検証を
分離する。Local Agent の設計境界は [ADR-0008](../adr/0008-expo-local-agent-foundation.md)、Artifact と
Delivery の判断は [ADR-0010](../adr/0010-native-delivery-quality-gates.md) を正本とする。

## 能力差

| 環境 | Rules Provider | `llama.rn` Local Agent | 判定できること |
| --- | --- | --- | --- |
| Expo Go | 利用できる。 | Native module を追加できないため利用できない。 | 純 TypeScript Domain と共通 UI の動作である。 |
| Web | 利用できる。 | Native module を解決できないため利用できない。 | Web Bundle と Rules Provider の動作である。 |
| iOS Development Build | 利用できる。 | 将来、依存、Artifact、専用 composition root を組み込んだ Build だけで利用できる。 | iOS code signing、権限、Native link、実機 runtime の動作である。 |
| Android Development Build | 利用できる。 | 将来、依存、Artifact、専用 composition root を組み込んだ Build だけで利用できる。 | Android SDK、権限、ABI、Native link、実機 runtime の動作である。 |

現在の repository は `llama.rn` と `expo-dev-client` をまだ依存へ追加していない。Expo Go と Web は
`src/app/lounge-reducer.ts` から Rules Provider を直接使うため、Native module がなくても Crash せず、
Bridge または `no-signal` まで完走する。`src/local-agent/lazy-local-agent.ts` は将来の Development Build
専用 composition root が loader を注入する境界であり、現在の App module graph からは読み込まれない。

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
Issue 6 時点では package が未導入なので、この command はネットワークへ接続する前に非 0 で終了する。

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

`expo-dev-client` と `llama.rn` は未導入なので、Issue 6 では上記 Local Agent 用 Build を実行済みとは
扱わない。後続の依存導入後は `make setup-llama-native`、iOS Build、実機での Local Agent 初期化と
Rules Provider fallback を同じ Version で確認する。

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

Renovate は Expo、React、React Native、将来の `llama.rn` を Native Compatibility group として更新する。
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

# ADR-0040: Native Build の乱数源を `expo-crypto` へ切り替え、`web-crypto-random.native.ts` で Platform 分割する

- **Status**: Accepted。
- **Date**: 2026-07-25。
- **Deciders**: Susumu Tomita (@susumutomita)。

## Context

実機で会話 Agent（Issue 104、ADR-0036〜0038）を開くと確実にクラッシュする
Report が届いた。実機のスタックトレースで原因は特定済みである。

`use-conversation-agent-flow.ts` の `open()` が
`createParticipantId`（`session-identifiers.ts`）を呼び、その内部の
`validatedRandomBytes` が `webCryptoRandomBytes`（`web-crypto-random.ts`）を
呼ぶ。この関数は `globalThis.crypto.getRandomValues(bytes)` を直接呼んでいたが、
React Native の JavaScript engine である Hermes には Web Crypto API が実装されて
おらず、`globalThis.crypto` が `undefined` になる。結果として
`Cannot read property 'getRandomValues' of undefined` が同期例外として送出され、
呼び出し元がイベントハンドラ内（`onPress` 相当）のため PR #139 で入れた
Error Boundary では捕捉できずアプリ全体がクラッシュする。

依存関係には crypto polyfill が一切入っていなかった（`expo-crypto` も
`react-native-get-random-values` も未インストール）。この関数は
`createLoungeId` / `createParticipantId` / `createRoundId` の全 Session ID
発行経路（Lounge、Pet、会話 Agent）で使われる基盤 primitive であり、
乱数源の変更は品質を落とさずに全経路で一貫させる必要がある。

## Decision

### 乱数源に `expo-crypto`（`~57.0.1`、Expo SDK 57 baseline）を採用する

比較した代替案は次の 2 つ。

1. **`expo-crypto`（採用）**: Expo 公式 SDK。Native は OS の secure random
   実装、Web は内部で `globalThis.crypto.getRandomValues` へ委譲する
   （`node_modules/expo-crypto/src/ExpoCrypto.web.ts` で確認）。Expo Go にも
   標準搭載されており追加の config plugin は不要（`expo-crypto` の
   `package.json` に `expo.plugin` field が無いことを確認済み）。
2. **`react-native-get-random-values`**: サードパーティ製の polyfill で
   `expo install` の対象外、Expo SDK バージョン追従の保証が無い。本 Repository
   は `docs/evidence/nearby-transport-static-screening.json` のような Static
   Screening で「公式 SDK・exact resolution」を要求する既存方針
   （`officialSourceAndVersion` / `licenseAndMaintenance` gate）と矛盾するため
   不採用。

`expo-crypto` は Expo 公式・Apache 2.0 系ではなく MIT ライセンスで、
`bunx expo install expo-crypto -- --ignore-scripts` で Expo SDK 57 互換の
`~57.0.1` が解決された。

### 呼び出しは `getRandomValues(typedArray)` を使う（`getRandomBytes` は不採用）

`expo-crypto` は 3 通りの乱数 API を提供する。

| API | byteCount 上限 | 契約 |
| --- | --- | --- |
| `getRandomBytes(byteCount)` | **0〜1024**（超えると `TypeError`） | 新しい `Uint8Array` を返す |
| `getRandomBytesAsync(byteCount)` | **0〜1024**（超えると `TypeError`） | 同上、非同期 |
| `getRandomValues(typedArray)` | **上限なし** | 渡した TypedArray を in-place で埋めて返す（Web Crypto と同じ契約） |

既存の `webCryptoRandomBytes(length)` は `length` を 1〜65536 の範囲で受理する
契約を持つ（`session-identifiers.ts` の `SESSION_RANDOM_BYTES = 16` は
その中の一値にすぎず、関数自体の契約はより広い）。`getRandomBytes` /
`getRandomBytesAsync` は 1024 byte 超で必ず `TypeError` になり既存契約を
壊すため採用できない。`getRandomValues` は `globalThis.crypto.getRandomValues`
と完全に同じ「渡した `Uint8Array` を in-place で埋めて返す」契約かつ上限を
持たないため、既存の長さ検証ロジックをそのまま維持できる。

### `web-crypto-random.ts`（Web / Bun Test 用）と `web-crypto-random.native.ts`
### （Native Build 用）に Platform 分割する

当初の想定は `globalThis.crypto.getRandomValues` の呼び出し 1 行だけを
`expo-crypto` の呼び出しへ単純に差し替えることだったが、検証の結果これは
2 つの理由で採用できなかった。

1. **`bun test` が壊れる**: `expo-crypto` の既定 entry point
  （`build/Crypto.js` → `./ExpoCrypto`）は `expo-modules-core` の
   `requireNativeModule('ExpoCrypto')` を呼ぶ。Metro は Platform 拡張子
  （`.native.js` / `.web.js`）で解決するが、`bun test` は Metro を使わず
   plain Node 解決をするため、`bun run`/`bun test` から `expo-crypto` を
   直接 import して呼び出すと
   `Cannot find package 'react-native' from ...expo-modules-core/.../requireNativeModule.ts`
   で即座に例外になることを実機なしで再現・確認した。カバレッジ 100%
  （`bunfig.toml` の `coverageThreshold = 1`）を維持したまま `bun test` を
   通す必要があるため、単純差し替えは不可能。
2. **既存の Repository 規約**: `default-agent-model-provider.ts` /
   `.native.ts` / `.web.ts` の 3 分割のように、本 Repository は
   「Bun Test / Web は base `.ts`、Native Build（Expo Go・Development
   Build・本番ビルドすべて）は `.native.ts` へ Metro が差し替える」という
   既存 idiom をすでに複数の Native 専用 Module（`expo-file-system` 系、
   `expo-document-picker` 系）で確立している。`bun test --coverage` の
   Baseline を確認すると `.native.ts` ファイルは Coverage Report に一切
   現れない（import chain に載らないため）。つまり `.native.ts` は
   Bun Test では検証されず、Owner の実機 Build 確認に委ねる既存の
   Trade-off がすでに合意されている。

この 2 点から、`web-crypto-random.ts` を base（Web / Bun Test、
`globalThis.crypto.getRandomValues` のまま）として残し、新規
`web-crypto-random.native.ts`（`expo-crypto` の `getRandomValues`）を
追加する Platform 分割を採用した。両ファイルは `webCryptoRandomBytes(length)`
という同一の公開契約（引数検証・戻り値の型・エラー種別）を独立して実装する。

境界値検証（1〜65536、`RangeError` メッセージ）は当初 2 ファイルへ独立に
書いていたが、code review で「2 ファイルにそれぞれ書くと、片方だけ境界値や
メッセージを変更したときにもう片方が drift しても検出する仕組みが無い
（`jscpd` の `minLines: 5` 閾値では 5 行の重複ブロックが clone として
検出されず `dup_check` も通ってしまう）」との指摘を受けた。既存の
`device-resource-telemetry.native.ts` / `device-resource-snapshot.ts` が
「Platform 非依存の検証ロジックは共有 module に抽出し、`.native.ts` 側は
薄い wrapper にする」idiom をすでに確立していたため、それに合わせて
`random-byte-length-guard.ts`（`assertValidRandomByteLength`）へ検証ロジックを
抽出し、両ファイルから import する形に修正した。これにより境界値・エラー
メッセージは 1 箇所だけが正本になり、`session-identifiers.test.ts` の
既存 `RangeError` テストがそのまま共有 guard のカバレッジになる。

ファイル名は既存の `web-crypto-random.ts` のまま維持した。呼び出し元
（`session-identifiers.ts` の `RandomBytes` 型、`use-conversation-agent-flow.ts`、
`invite-lounge-flow.test.ts`、`lounge-lifecycle-test-kit.ts`）を変更しない
最小差分を優先したためで、Native では厳密には「Web Crypto」ではなくなる
という多少の命名との乖離は許容した。

## Consequences

- **Good**: 実機での会話 Agent 起動クラッシュが解消する。`createLoungeId` /
  `createParticipantId` / `createRoundId` の全 Session ID 発行経路が同じ
  `webCryptoRandomBytes` 契約のまま Native で動くようになる。Web では
  `expo-crypto` を経由せず既存の `globalThis.crypto.getRandomValues` の
  ままなので回帰リスクが無い。
- **Bad**: `web-crypto-random.native.ts` は `bun test` では実行されず
  Coverage Report にも現れない。Native 固有の乱数生成コードパスは
  Owner の実機 / Development Build 確認でしか検証できない
  （既存の `.native.ts` ファイル群と同じ Trade-off）。
- **Tradeoff**: 乱数生成呼び出し自体（`globalThis.crypto.getRandomValues` vs
  `expo-crypto` の `getRandomValues`）は 2 ファイルに独立実装したまま残した
  （Metro の Platform 拡張子解決は file 単位のため、公開関数
  `webCryptoRandomBytes` 自体をどちらか 1 ファイルに一本化することはできない）。
  境界値検証だけを共有 module へ抽出したので、乱数源の選択と契約検証の
  責務は分離されたが、ファイル数は 1 つ増えた。

## References

- 関連コード: `src/protocol/web-crypto-random.ts`,
  `src/protocol/web-crypto-random.native.ts`,
  `src/protocol/random-byte-length-guard.ts`,
  `src/domain/session-identifiers.ts`,
  `src/app/use-conversation-agent-flow.ts`
- 関連 Issue: Issue 138（実機 blocker、ADR-0038 と同根）の後続クラッシュ。
- 関連 ADR: [ADR-0036](./0036-on-device-conversation-agent.md),
  [ADR-0038](./0038-v1-disable-on-device-llm-for-consumers.md)
- 外部資料: <https://docs.expo.dev/versions/latest/sdk/crypto/>

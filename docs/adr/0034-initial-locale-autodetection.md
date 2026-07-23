# ADR-0034: 端末ロケールに基づく初期表示言語の自動判定と明示選択の永続化

- **Status**: Accepted
- **Date**: 2026-07-23
- **Deciders**: Susumu Tomita (@susumutomita)

## Context

Issue 111（GitHub Issue 111）で、アプリ初回起動時に日本語話者以外が開いても UI が日本語
固定のままで「英語版が無い」ように見える問題が報告された。`src/app/i18n/locale.ts` の
`DEFAULT_LOCALE = 'ja'` は固定値であり、端末 / ブラウザの言語設定を一切参照しない。

英語翻訳と切替 UI 自体は Issue 15（`docs/design/i18n-and-accessibility.md`）と
Issue 118（PR #127、`AppScreen` 右上ヘッダーの JA/EN トグル）で既に揃っている。本 ADR が
対象にするのは次の 2 点だけである。

1. 初回起動時、保存済みの明示選択が無い場合に、端末 / ブラウザの優先言語から初期表示言語を
   決める判定ロジック。
2. 一度ユーザーが切替 UI で明示的に選んだ言語を端末内へ永続化し、次回以降はそれを自動判定より
   優先する仕組み。

このリポジトリには端末ロケールを読む手段（依存）が無い。Expo SDK 57 は `expo-localization`
という第一級パッケージを提供しており、iOS / Android / Web / Expo Go の全対象プラットフォームで
動作し、`getLocales()` という同期 API でユーザーの優先言語列を返す
（[Expo Localization docs](https://docs.expo.dev/versions/latest/sdk/localization/)）。
ADR-0001（サプライチェーン強化）により、新規依存の追加は `bunx expo install <pkg>
--ignore-scripts` で SDK 互換バージョンに固定し、`bun.lock` のハッシュを更新した上で ADR を
残すことが必須になっている。

## Decision

### 1. 依存追加: `expo-localization`

`bunx expo install expo-localization --ignore-scripts` で追加する。Web / Expo Go / Native の
いずれでも動作し、端末設定を読むだけで外部へ送信しない（Privacy への影響なし）。

### 2. 判定 Port（`src/app/initial-locale-port.ts`）

`src/app/reduced-motion-port.ts` と同じ「Port + 環境注入」設計を踏襲する。Port 自体は
`expo-localization` を直接 import せず、優先言語タグの列を返す `InitialLocaleEnvironment` を
注入される。これにより、Native module を import できない `bun test` 環境でも、実際の別実装
（固定の言語タグ列を返す環境、例外を投げる環境）で挙動を検証できる（No Mock）。

判定を行う純関数 `pickInitialLocale(preferredLanguageTags: readonly string[]): Locale` は
次の規則で決める。

- 先頭タグ（最優先言語）の言語サブタグ（`-`/`_` 区切りの最初の部分、大文字小文字を無視）が
  `ja` なら `'ja'`。
- それ以外の非空タグ（`en` 以外も含め、`LOCALES` に無い言語すべて）は `'en'` にフォールバック
  する。
- 空配列（判定手段が無い、権限拒否等で本当に何も分からない）は `DEFAULT_LOCALE`（`'ja'`）を
  返す。これは「情報が無いときは既存の既定値を変えない」という保守的な選択で、今日まで
  `DEFAULT_LOCALE = 'ja'` 固定だった挙動を、判定不能な場合に限り後方互換に保つ。

`createInitialLocalePort` は `reduced-motion-port.ts` と同じ fail-safe を持ち、環境からの取得が
例外を投げても `DEFAULT_LOCALE` を返す。

### 3. 永続化 Port（`src/app/locale-preference-storage.ts`）

`src/app/local-deletion-journal.ts` と同じ「単一の小さな値、Web/Native 2 adapter、
`ProfileDocument` / `WebKeyValueStorage`（`local-profile-storage.ts` 系統の既存型）を再利用する」
設計を踏襲する。`LocalProfileStoragePort` のような JSON schema バージョニングは、値が
`'ja' | 'en'` の 2 値でしかなく将来のスキーマ進化を要しないため過剰と判断し、持たせない。
`src/app/default-locale-preference-storage.ts` が `Platform.OS` で Web
（`localStorage`）/ Native（`expo-file-system` の File）を選ぶ。

### 4. `PassportApp.tsx` での優先順位配線

`locale` state の初期値を `initialLocalePort.resolveInitialLocale()`（同期）にする。既存の
起動時 `Promise.all`（Local Profile 復元・Intro Card 読込・下書き読込を束ねる 1 つの副作用）に
`localePreferenceStorage.load()` を追加し、保存済みの明示選択があれば同じコミットで `locale` を
上書きする。既存の「複数 state を同じ render にまとめてコミットし、中間 render を作らない」
方針（Room 満了判定などで既に採用済み）をそのまま流用し、ハイドレーション時のちらつきを
最小化する。

明示切替（Settings 画面・`AppScreen` ヘッダーの JA/EN トグル、いずれも Issue 15 / 118 で
既存）は、`setLocale` を直接受け取るのをやめ、1 つの `handleChangeLocale` へ集約する。
`handleChangeLocale` は `setLocale` で即座に表示を切り替えたあと、
`localePreferenceStorage.save(next)` を fire-and-forget で呼ぶ（保存失敗は次回起動時の自動判定に
委ねるだけで、その場の切替操作自体は失敗させない）。

## Consequences

- **Good**: 初回起動時、日本語話者以外は英語表示になる。一度明示的に選んだ言語は次回以降も
  優先される。既存の「Context を使わず `PassportApp` が state を持つ」設計・「Port + 環境注入で
  No Mock テストする」設計のどちらも変えずに拡張できる。
- **Bad**: `expo-localization` という新しい Native 依存が増え、以後のサプライチェーン監査対象が
  1 つ増える。保存済み選好の読込を起動時の `Promise.all` に含めたため、自動判定結果と保存値が
  異なる場合、理論上は 1 回の commit まで表示が確定しない待ち時間がわずかに生じる
  （既存の Profile 復元と同じ待ち時間に相乗りするため、体感の追加コストはほぼ無い）。
- **Tradeoff**: 判定不能時（空配列）を `'en'`（英語圏を安全側と仮定）ではなく `'ja'`
  （既存の既定値を維持）にした。今後、英語話者比率が高い配布チャネルが増えるなど前提が変われば、
  この既定値は新しい ADR で再検討する。

## References

- 関連コード: `src/app/initial-locale-port.ts`, `src/app/locale-preference-storage.ts`,
  `src/app/default-initial-locale-port.ts`, `src/app/default-locale-preference-storage.ts`,
  `src/app/PassportApp.tsx`, `App.tsx`
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/111
- 関連 ADR: [ADR-0001](./0001-supply-chain-hardening.md)（サプライチェーン強化、依存追加手順の
  正本）
- 関連設計: `docs/design/i18n-and-accessibility.md`（i18n 全体設計の正本）
- 外部資料: https://docs.expo.dev/versions/latest/sdk/localization/

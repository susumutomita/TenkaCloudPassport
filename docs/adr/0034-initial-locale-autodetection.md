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
-- --ignore-scripts` で SDK 互換バージョンに固定し、`bun.lock` のハッシュを更新した上で ADR を
残すことが必須になっている（`--ignore-scripts` は `expo install` 自身のオプションではなく、
内部で呼ぶ `bun add` へそのまま渡す pass-through 引数のため、`--` で明示的に区切る）。

## Decision

### 1. 依存追加: `expo-localization`

`bunx expo install expo-localization -- --ignore-scripts` で追加する。Web / Expo Go / Native の
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
`localePreferenceStorage.load()` を追加する。

`Promise.all` が解決する単一の `.then()` の中で、`resolveEffectiveStartupLocale`（保存済みの
明示選択があればそれを、無ければ自動判定の値をそのまま採用する純関数）を使って
effective locale を 1 回だけ確定し、`locale` state・`localeRef.current` の両方をその値へ
同期的に揃える（`applyEffectiveStartupLocale`）。Intro Card Notice のような locale 依存の
起動通知（`startupIntroCardOutcome`）は、この effective locale が確定した「後」にだけ組み立てる。

この順序が必須である理由はコードレビュー（Codex）で見つかった回帰にある。当初の実装は
`introCardStorage.load()` の `.catch()` の中で直接 Notice を組み立てていたが、この catch
ハンドラは自分が属する Promise が解決した時点で即実行されるため、同じ `Promise.all` に束ねた
`localePreferenceStorage.load()` がまだ解決していないタイミングで発火しうる。端末ロケールの
自動判定が `ja` で保存済みの明示選択が `en` のようなケースでは、画面のタイトルは現在の
`locale` state（`en`）で都度訳すのに Notice 本文だけ古い自動判定言語（`ja`）のまま固定される
言語混在バグになっていた。`settleIntroCardLoad` で読込の成否を一旦保持だけしておき、
effective locale が判明してから Notice を組み立てる現在の設計は、このレースを構造的に
無くす（`src/app/initial-locale-port.test.ts` / `src/app/intro-card-notice.test.ts` /
`src/app/intro-card-app-wiring.test.ts` に、この修正を固定する挙動テストがある）。

既存の「複数 state を同じ render にまとめてコミットし、中間 render を作らない」方針
（Room 満了判定などで既に採用済み）はそのまま流用し、ハイドレーション時のちらつきを
最小化する。

明示切替（Settings 画面・`AppScreen` ヘッダーの JA/EN トグル、いずれも Issue 15 / 118 で
既存）は、`setLocale` を直接受け取るのをやめ、1 つの `handleChangeLocale` へ集約する。
`handleChangeLocale` は `setLocale` で即座に表示を切り替えたあと、
`localePreferenceStorage.save(next)` を fire-and-forget で呼ぶ。保存失敗時のセマンティクスは
best-effort であり、「次回起動時は必ず自動判定に委ねられる」わけではない点に注意する。
端末内に以前保存した値が既にある状態で今回の保存が失敗した場合、次回起動時に
`localePreferenceStorage.load()` が返すのはその古い保存値であり、それが effective locale として
優先され続ける。今回が初めての保存で、かつそれが失敗した場合に限り、保存済み値が存在しない
ため自動判定に委ねられる。いずれの場合も、今回の切替操作自体（表示の即時切替）は保存の成否に
関係なく成功する。

#### Alternatives（起動時の locale 依存 Notice をどう正しくするか）

Codex レビューで指摘された上記の回帰を直すにあたり、2 つの案を比較した。

- **案 A（生データ保持 + レンダー時翻訳）**: `ProfileNotice` / `IntroCardNotice` を
  「メッセージキー + パラメータ」のような locale 非依存の生データとして保持し、
  画面側の render 時に現在の `locale` で都度翻訳する。理論的にはより汎用的で、
  locale 切替のたびに過去の Notice も遡って正しい言語に翻訳し直せる。
  ただし、両型は現在どちらも「作成時点で locale を受け取り事前翻訳済みの message を保持する」
  設計で全画面（`IntroCardEditScreen` 等）・全呼び出し箇所
  （保存・削除・検証エラー等、起動以外の経路も含む）に浸透しており、型定義そのものと
  呼び出し側の書き換えが必要になる。加えて、型を持たない例外由来の Fallback 文言以外
  （`IntroCardError` 等の domain 由来メッセージ）は意図的に「作成時点の言語のまま」で
  据え置く設計（`docs/design/i18n-and-accessibility.md` の Known follow-up）のため、
  「常にレンダー時翻訳」にすると既存の設計判断と衝突し、Notice の種類ごとに
  レンダー時翻訳するかどうかを再度作り分ける必要が生じる。
- **案 B（起動 sequencing、採用）**: 起動時の `Promise.all` が解決する単一の `.then()`
  まで、locale 依存の起動通知の組み立てそのものを遅らせる（本 ADR が採用した方式）。
  `ProfileNotice` / `IntroCardNotice` の型・既存の全呼び出し箇所は変えず、起動 hydration
  の 1 箇所（`PassportApp.tsx` の起動 `useEffect`）だけを直せば、回帰の根本原因
  （`introCardStorage.load()` の catch ハンドラと `localePreferenceStorage.load()` の
  どちらが先に解決するかというタイミング依存）を解消できる。

案 B を採用した理由は、変更範囲と既存 type 契約の破壊を最小化できる点にある。案 A は
より一般的な解決だが、本 Issue のスコープ（起動時 1 回だけの通知生成）を大きく超える
横断的な再設計になる。既存の Notice 型を「常に render 時翻訳」に寄せたくなった場合は、
別 Issue・別 ADR として再検討する。

## Consequences

- **Good**: 初回起動時、日本語話者以外は英語表示になる。一度明示的に選んだ言語は次回以降も
  優先される。既存の「Context を使わず `PassportApp` が state を持つ」設計・「Port + 環境注入で
  No Mock テストする」設計のどちらも変えずに拡張できる。起動時の locale 依存 Notice
  （Intro Card Notice 等）は、自動判定と保存済み選好が食い違う場合でも常に effective locale
  で組み立てられ、画面タイトルとの言語混在が起きない。
- **Bad**: `expo-localization` という新しい Native 依存が増え、以後のサプライチェーン監査対象が
  1 つ増える。保存済み選好の読込を起動時の `Promise.all` に含めたため、自動判定結果と保存値が
  異なる場合、理論上は 1 回の commit まで表示が確定しない待ち時間がわずかに生じる
  （既存の Profile 復元と同じ待ち時間に相乗りするため、体感の追加コストはほぼ無い）。
  起動時 effect の `.then()` が 1 箇所に集約する関心事（effective locale の確定・Intro Card
  の成否判定・Notice 組み立て）が増えたため、Cognitive Complexity 対策として
  `applyEffectiveStartupLocale` / `startupIntroCardOutcome` の 2 つの補助関数へ分割した。
- **Tradeoff**: 判定不能時（空配列）を `'en'`（英語圏を安全側と仮定）ではなく `'ja'`
  （既存の既定値を維持）にした。今後、英語話者比率が高い配布チャネルが増えるなど前提が変われば、
  この既定値は新しい ADR で再検討する。起動時 Notice の言語決定方式は案 B（起動
  sequencing）を採用し、案 A（生データ保持 + レンダー時翻訳）は見送った（上記
  Alternatives 節を参照）。

## References

- 関連コード: `src/app/initial-locale-port.ts`（判定・reconciliation の純関数群を含む）,
  `src/app/locale-preference-storage.ts`, `src/app/default-initial-locale-port.ts`,
  `src/app/default-locale-preference-storage.ts`, `src/app/intro-card-notice.ts`
  （起動時 Notice 組み立ての純関数を含む）, `src/app/PassportApp.tsx`
  （起動 hydration の配線本体）, `App.tsx`
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/111
- 関連 ADR: [ADR-0001](./0001-supply-chain-hardening.md)（サプライチェーン強化、依存追加手順の
  正本）
- 関連設計: `docs/design/i18n-and-accessibility.md`（i18n 全体設計の正本）
- 外部資料: https://docs.expo.dev/versions/latest/sdk/localization/

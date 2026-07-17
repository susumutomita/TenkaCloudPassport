# 日本語・英語 i18n と主要フローの Accessibility の設計

本書は Issue 15 の設計を定める。M1 の最後の Issue として、日本語・英語の Runtime 切り替え、
Rules Provider 由来 Bridge の多言語定型表現、VoiceOver / TalkBack だけでの完走、200％ Text、
44 pt 以上の操作領域、Reduce Motion、色以外の状態表現を主要フロー全体へ適用する。用語は
[用語集](../product/glossary.md) を正本とし、Issue 13 の Bilingual Bridge テンプレートは
[Agent Model Provider Contract の設計](./agent-model-provider-contract.md) を正本とする。

## 目的と対象範囲

- 目的: 異なる言語の参加者が同じ Lounge に参加しても、Privacy / Consent / Bridge を同じ強さで
  理解できる状態にする。介助技術・文字拡大を使っても主要フローを完走できるようにする。
- 対象: `src/app/i18n/`（型付き Message Catalog + Locale）、9 個の notice / error モジュール、
  12 Screen + 6 Component、新設 `SettingsScreen`、`src/domain/bridge.ts` の言語引数と
  原文/生成文の分離（`sourceLabels`）、Reduce Motion の Port と Pet 表示の静的差し替え、
  44 pt 共有定数、`docs/checklists/accessibility.md` の検証マトリックス。
- 対象外: 全言語対応（JA/EN の 2 言語だけ）、Cloud Translation、音声録音・文字起こし、
  カタログ手掛かり Label 自体の翻訳（Issue 13 が定めた Known follow-up を継続する）、
  Owner Question の質問文（`OWNER_QUESTION_CATALOG`、Wire Protocol）自体の翻訳。
  実機 VoiceOver / TalkBack 実行と JA/EN 各 2 名の初見テストは人間検証（Issue 30）。

## 設計判断

### 1. Message Catalog は React Context ではなく、既存の prop drilling へ揃える

この repo は Screen 間の横断状態（`backupFlow`、`errorMessage` 等）を、既存の `ProfileHomeGate` /
`SharePreviewGate` と同じ「`PassportApp` が state を持ち、Prop として渡す」設計で統一しており、
`createContext` はどこにも存在しない。3 案を比較した。

1. **React Context + `useLocale()` hook** — Locale をどこからでも読めるが、この repo に
   Context の前例が無く、レンダリング用の統合テスト基盤（React Testing Library 相当）を
   持たないため、Context の Provider/Consumer 配線が実際に機能することを検証する手段が
   ソーステキスト検査だけになり、既存の prop drilling より確認の粒度が粗くなる。
2. **`locale` を Global 変数・Module 変数で保持する** — 配線は簡単だが、React の
   再 render トリガーと分離すると画面が切り替わらない。テストで状態の独立性
  （Lounge 中の切替が消えないこと）も確認しにくい。
3. **`PassportApp` が `useState<Locale>` を持ち、既存の Gate と同じ Prop 経由で
   Screen へ渡す** — 配線は他の横断状態と同じ形になり、`discardInviteFlow` /
   `restartEncounter` などの破棄関数が `setLocale` を一切呼ばないことをソーステキストで
   固定でき、「Lounge State と Consent を失わない」という受け入れ条件を機械的に検証できる。

案 3 を採用する。`useLocale()` という名前の hook は用意せず（Context が無いため hook 化する
意味が薄い）、`src/app/i18n/locale.ts` は型と定数だけを提供する。

### 2. 型で JA/EN の対応漏れを防ぐ Message Catalog

`src/app/i18n/messages.ts` は次の形にする。

```ts
export type Locale = 'ja' | 'en';
interface AppMessages { passportCreation: {...}; encounterSetup: {...}; ... }
export const MESSAGES: Record<Locale, AppMessages> = { ja: {...}, en: {...} };
```

`Record<Locale, AppMessages>` は `ja` と `en` の両方が `AppMessages` の全 key を実装することを
コンパイル時に強制する。新しい画面文言を 1 つ足すたびに、`en` を書き忘れると
`bun run typecheck` が落ちる。これは「JA / EN 文言がある」という受け入れ条件を、レビューや
実行時テストではなく型システムで機械的に担保する設計にする。カウンタ・残り時間のような
動的な文言は `(current: number, max: number) => string` のような関数値にし、テンプレート
文字列を JA/EN 双方が独立して持てるようにする（英語の "3 / 5 clues" のような語順の違いを
1 つのテンプレートで無理に共有しない）。

### 3. 製品語彙（Bridge / Lounge / Pet / Owner / Passport 等）は翻訳しない

[用語集](../product/glossary.md) の英語節も、地の文が英語であっても `Bridge` / `Lounge` /
`Owner` / `Pet` / `Passport` / `no-signal` / `retired` のような指定用語は変えていない。
Message Catalog も同じ規律に従い、これらの語をそのまま両方の Locale で使う。翻訳対象は
その前後を接続する自然文だけとする。

### 4. Bridge の言語追従は「デフォルト `ja` の追加引数」で後方互換に接続する

Issue 13 の `agent-model-provider.ts` は Golden Contract 専用のモジュールで、2 者間 Live 経路
（`bridge.ts` の `createBridge` / `createComplementBridge` / `createBridgeFromEvidence`）へは
まだ配線されていない。この Issue で初めて Live 経路の Bridge 文言を言語追従させる。

3 案を比較した。

1. Live 経路を `agent-model-provider.ts` の Contract へ載せ替える — Wire 型
  （`MatchEvidence`）の拡張が必要になり、この Issue の本来の目的に対して不釣り合いに大きい
   変更になるため見送る（Issue 13 が同じ理由で見送った判断を踏襲する）。
2. `Bridge.message` を `Record<LanguageCode, string>` に変える — 既存の 100％ カバレッジ済み
  `bridge.test.ts` / `lounge.test.ts` 等の `bridge.message` を直接文字列比較するテストを
   すべて書き換える必要があり、影響範囲が広い。
3. `createBridge` / `createComplementBridge` / `createBridgeFromEvidence` にデフォルト値 `'ja'` の
   追加引数 `language?: LanguageCode` を足す — 呼び出しを省略した既存呼び出し・既存テストは
   無変更で Green を保ったまま、新しい呼び出し（`receiveOwnerAnswer` 経由）だけが
   `language: 'en'` を渡せる。

案 3 を採用する。`receiveOwnerAnswer`（`pet-interaction.ts`）にも同じデフォルト `'ja'` の追加引数を
足し、`submitOwnerQuestionAnswer`（`pet-interaction-flow.ts`）→ `PassportApp.tsx` の
`submitOwnerAnswer` まで一本の追加引数として通す。UI の `Locale`（`'ja' | 'en'`）と Domain の
`LanguageCode`（`'ja' | 'en'`、`clue-catalog.ts`）は現在たまたま同じ 2 値だが、概念上は
「UI 表示言語」と「Passport の会話材料としての言語」という別概念であるため、型を統合せず
文字列リテラルの構造的な互換性だけで受け渡す（将来 UI 言語だけ増えても Passport の
Language カタログを変えずに済む）。

### 5. Owner Question の質問文とカタログ Label は今回も翻訳しない

`OWNER_QUESTION_CATALOG`（`owner-question.ts`）は `protocol/schema.ts` の
`parseOwnerQuestion` が `assertLiteral` で厳格比較する Wire 型の一部であり、Bilingual 化には
Strict Validator 自体の変更が要る。Owner Question 画面の開示文・選択肢ラベル・エラーは
Locale 対応するが、質問文そのもの（`displayText`）と Clue Label は Issue 13 の Known
follow-up と同じ扱いで日本語のみ据え置く。`docs/design/agent-model-provider-contract.md` の
Known follow-up にこの Issue でも変わらないことを追記する。

### 6. Bridge の原文と端末内生成の補助文を `sourceLabels` として分離する

受け入れ条件「異言語 Bridge は原文と端末内生成の補助文を区別し、Rules の安全な定型
Fallback がある」を満たす必要がある。後半（Rules の安全な定型 Fallback）は Rules Provider
（Issue 4/13）が既に満たしている。前半（原文と補助文の区別）は、決定判断 5 のとおり
Clue Label（`clue.label`）を翻訳しないため、`message`（`language` ごとの定型文で Label を
包んだもの）の中に「翻訳していない原文」と「今回端末内で生成した接続文」が 1 つの文字列
として混在していた。UI がこれを 1 つの Text としてしか提示しないと、利用者（特に
VoiceOver / TalkBack 利用者）はどこまでが原文でどこからが生成物かを判別できない。

2 案を比較した。

1. `message` の文字列を正規表現等で分解し、UI 側で原文部分だけを抜き出す — `message` は
   自然文であり、JA/EN で語順もクォート文字も異なるため、抽出ロジックが言語ごとの
   フォーマットに強く依存し、テンプレート文言を変えるたびに壊れやすい。
2. `Bridge` 生成時点（`clueById` で Label を解決した直後）に、そのまま `sourceLabels`
  （原文の配列）として型に持たせる — 生成側は既に Label を持っているため追加コストが
   小さく、UI は文字列解析をせずに原文・生成文をそれぞれ独立した値として受け取れる。

案 2 を採用する。`Bridge.sourceLabels: readonly string[]` を追加し、`createBridge` /
`createComplementBridge` / `createBridgeFromEvidence` それぞれが `message` と同時に
組み立てる。Wire Protocol（`src/protocol/schema.ts` の `parseBridge`）は元々
`schemaVersion` / `messageKey` / `evidence` だけを運び、`message` 自体は端末間を
一切越えない（受信側が `evidence.clues`（Clue ID）から `createBridgeFromEvidence` /
`createComplementBridge` を呼んでその場で再生成する）ため、`sourceLabels` も
`message` と同じく受信側のローカル計算だけで揃い、Wire 型の拡張を必要としない。
`OutcomeScreen.tsx` は `bridgeIsVisible`（Owner が Reveal した）ときだけ、`message`
（生成された接続文、`t.generatedNoteCaption` という注記付き）とは別の Text として
`sourceLabels`（原文、`t.sourceLabelCaption` という見出し付き）を表示する。

## Reduce Motion と Pet 表示

この repo に既存の Pet Animation は無い（`PetEmojiSelector` は静的な選択 UI）。新設する
`src/app/reduced-motion-port.ts` は `AccessibilityInfo.isReduceMotionEnabled()`
（React Native 同梱、新規依存なし）を直接 import しない Port として定義し、
`PassportApp.tsx`（Composition Root）だけがデフォルト実装を組み立てる。`ActiveLoungeScreen`
の Pet 表示（`PassportSummary`）に、Interaction 実行中だけ Pet Emoji を軽く拍動させる
`Animated.loop` を追加し、`reduceMotion` が真のときは `Animated` を一切使わず静的な View を
描画する。テストはレンダリング基盤が無いため、他の Screen と同じソーステキスト検査で
「`reduceMotion` が真の分岐に `Animated.loop` / `Animated.timing` を含まない」ことを固定する。
Port 自体は実際の代替実装（デフォルト値を返す環境なし版、デフォルト値を返す環境あり版）で 100％ テストする。

## 44 pt Touch Target と 色以外の状態表現

`src/ui/touch-target.ts` に `MIN_TOUCH_TARGET = 44` という共有定数だけを定義する。
既存の `ActionButton`（`minHeight: 50`）・`ClueSelector`（`minHeight: 64`）・
`PetEmojiSelector`（`height: 52`）・`LanguageSelector`（`minHeight: 52`）は元から
この定数を上回る値で満たしていたため、スタイル自体を書き換える必要はなく、
`src/screens/touch-target.test.ts` が各コンポーネントの宣言値を数値抽出して
`MIN_TOUCH_TARGET` 以上であることを機械検証するだけに留める（スタイルを差し替える
`minTouchTargetStyle` / `accessibleHitSlop` のような補助関数は、呼び出し側が実質
1 箇所しかなく Reuse の裏付けが無いため追加しない）。唯一 44pt ちょうどの境界に
なる 24×24 の checkbox 装飾（`EncounterSetupScreen` の確認チェックボックス、
`ClueSelector` の checkbox）は装飾要素であり、実際に反応する Pressable 本体
（`confirmation` / `option`）側だけが `MIN_TOUCH_TARGET` を明示的に import して
`minHeight: MIN_TOUCH_TARGET` を使う。状態は既存から一貫して色だけに依存せず、
`accessibilityState`、テキストラベル（'ON' / 'OFF'、'Ready' / '未 Ready'）、チェックマーク
（`✓`）で表現している。この Issue では新しい状態表現を追加せず、Message Catalog 化した後も
この規約を保つことをテストで確認する。

## 200％ Text

`allowFontScaling` は React Native のデフォルト `true` のままにし、無効化しない。既存の Screen は
`numberOfLines` を使っておらず、Text を格納する View に固定 `height`（`minHeight` のみ）を
与えている。`src/screens/font-scaling.test.ts` で、主要 Screen が Privacy / Consent に関わる
Text へ `numberOfLines={1}` を付けないこと、`allowFontScaling={false}` を明示しないことを
ソーステキストで固定する。

## テスト戦略

この repo はレンダリング用の統合テスト基盤を持たないため、既存の規約に揃えて次の 3 層で
検証する。

1. **Message Catalog の純粋関数テスト** — `ja` / `en` の Key 集合が一致すること（型で保証済み
   だが、実行時に空文字列や `ja` と同一文字列になっていないかを追加で確認する）、パラメータ化
   された関数値が期待どおりの文字列を返すこと。
2. **Domain / App 層のテスト** — `bridge.ts` / `pet-interaction.ts` / `pet-interaction-flow.ts` の
   `language` 引数、Notice 系モジュールの `locale` 引数を、実際に関数を呼んで確認する
  （No Mock）。
3. **ソーステキスト検査** — 既存の `accessibility-test-kit.ts` の規約を踏襲し、Screen が
   Message Catalog の Key を参照していること、禁止語彙が無いこと、Locale 切替が Lounge /
   Consent の state を破棄しないことを固定する。既存の accessibility テストのうち、画面の
   レイアウト順序を確認する目的のものは「特定の日本語文字列」ではなく「Message Catalog の
   Key 参照」を検査対象に変更し、正確な文言のピン留めは Message Catalog 自身のテストへ移す。

## Known follow-ups

- カタログ Clue Label・Owner Question の質問文（Wire Protocol）の翻訳（Issue 13 から継続）。
- 実機 VoiceOver / TalkBack の実行、JA/EN 各 2 名以上の初見テストは Issue 30 のパイロットで
  実施する（本 Issue はソーステキスト検査までを実装する）。
- Reduce Motion の Pet 拍動は Active Lounge の 1 箇所のみ実装し、将来 Pet Animation が増えた
  場合は同じ Port を再利用する。

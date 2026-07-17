# アクセシビリティチェックリスト

WCAG 2.1 AA を基準に、キーボードと支援技術で主要操作を完了できることを確認する。
Web Export（`make dev` / `expo export --platform web`）を対象にした一般項目は
以下のとおりで、TenkaCloud Passport（Expo / React Native）の主要フロー固有の
検証マトリックスは [TenkaCloud Passport 主要フローの検証マトリックス](#tenkacloud-passport-主要フローの検証マトリックス)
にまとめる。

- [ ] 意味のある画像に内容を表す `alt`、装飾画像に空 `alt` を指定する
- [ ] icon-only button / link に `aria-label` などの accessible name がある
- [ ] 見出し階層、landmark、label と入力欄の対応が意味構造どおりである
- [ ] Tab / Shift+Tab / Enter / Space / Escape で主要操作を完了できる
- [ ] focus indicator が見え、DOM 順と視覚順が一致する
- [ ] modal / dialog の初期 focus、focus trap、閉じた後の focus 復帰を確認する
- [ ] toast / 非同期更新は `role="status"`、即時対応が必要な error は `role="alert"` で通知する
- [ ] error を色だけで示さず、テキストまたはアイコンと accessible name を併用する
- [ ] 通常文字、large text、UI 部品のコントラストが AA を満たす
- [ ] 200％ zoom と狭い viewport で情報や操作が失われない
- [ ] motion を減らす設定を尊重し、点滅や自動再生を制御できる
- [ ] loading / error / empty / success の各状態をスクリーンリーダーでも識別できる

## TenkaCloud Passport 主要フローの検証マトリックス

Issue 15（日本語・英語・アクセシビリティを主要フローで保証する）の受け入れ条件を、
主要フロー（Passport 作成 → QR → Ready → Lounge → Question → Bridge/no-signal →
Exit、およびバックアップ・Settings）ごとに固定する。この repo はレンダリング用の統合
テスト基盤（React Testing Library 相当）を持たないため、「済」はソーステキスト検査・
型検査・純粋関数テストによるコード側の担保を指す。実機の VoiceOver / TalkBack 走査と
JA/EN 各 2 名以上の初見テストは Issue 30 のパイロットで行う人間検証であり、本表では
「実施待ち（Issue 30）」と明記する。

| フロー | JA/EN 文言 | Accessible Name/Role/State | 200％ Text | Touch Target 44pt | Reduce Motion | 色以外の状態表現 | 裏付けテスト |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Passport 作成 | 済 | 済 | 済 | 済 | 対象外（Animation なし） | 済（カウンタ・チェック） | `passport-onboarding-accessibility.test.ts`、`font-scaling.test.ts`、`touch-target.test.ts` |
| QR / Ready | 済 | 済 | 済 | 済 | 対象外 | 済（Ready/未 Ready のテキスト表示） | `qr-invite-accessibility.test.ts`、`touch-target.test.ts` |
| Lounge（Active） | 済 | 済 | 済 | 済 | 済（Pet 拍動を静的表示へ置換） | 済 | `active-lounge-reduced-motion.test.ts`、`active-lounge-interaction-status.test.ts`、`active-lounge-provider-status.test.ts` |
| Question（Owner Question） | 済 | 済 | 済 | 済 | 対象外 | 済 | `owner-question-accessibility.test.ts` |
| Bridge / no-signal（Outcome） | 済 | 済 | 済 | 済 | 対象外 | 済（原文と生成文をキャプションで区別） | `outcome-screen-no-score.test.ts`、`outcome-bridge-source-distinction.test.ts`、`bridge.test.ts` |
| Exit（Destroyed Lounge） | 済 | 済 | 済 | 済 | 対象外 | 済 | `passport-onboarding-accessibility.test.ts` 系と共通の Screen 走査（`font-scaling.test.ts`） |
| バックアップ（Export/Import） | 済 | 済 | 済 | 済 | 対象外 | 済 | `backup-app-wiring.test.ts`、`font-scaling.test.ts` |
| Settings（言語切り替え） | 済 | 済 | 済 | 済 | 対象外 | 済（選択中を variant と文言の両方で表示） | `settings-accessibility.test.ts`、`passport-app-stage-flow.test.ts` |
| 全 Error（QR/Camera/Storage/バックアップ） | 済 | 済 | 済 | 対象外（Text のみ） | 対象外 | 済 | `messages.test.ts`（Camera Permission・Profile Notice の全状態） |

- [x] Passport、QR、Ready、Lounge、Question、Bridge、no-signal、Exit、バックアップ、Settings、全 Error に JA / EN 文言がある（`src/app/i18n/messages.ts`、`messages.test.ts`）
- [x] Runtime で切り替えても Lounge State と Consent が失われない（`passport-app-stage-flow.test.ts` の Issue 15 節）
- [x] 異言語 Bridge は原文と端末内生成の補助文を区別し、Rules の安全な定型 Fallback がある（`src/domain/bridge.ts` の `sourceLabels`、`OutcomeScreen.tsx`、Rules Provider）
- [x] すべての操作要素に Accessible Name、Role、State がある（`ActionButton` / `ClueSelector` / `PetEmojiSelector` / `LanguageSelector`）
- [x] VoiceOver / TalkBack だけで Passport 作成から Exit まで完走できる配線をコード側で固定した。実機での走査は実施待ち（Issue 30）
- [x] 200％ Text で切れ、重なり、横 Scroll が主要画面にない（`allowFontScaling` デフォルト維持、`numberOfLines={1}` 不使用、`font-scaling.test.ts`）
- [x] Touch Target が 44 pt 以上で、Color 以外にも Text / Icon で状態が分かる（`src/ui/touch-target.ts`、`touch-target.test.ts`）
- [x] Reduce Motion 時は Pet Animation を静的状態へ置換する（`src/app/reduced-motion-port.ts`、`active-lounge-reduced-motion.test.ts`）
- [ ] JA / EN 各 2 名以上の初見テストで致命的な操作不能がない。実施待ち（Issue 30）
- [x] Accessibility Checklist と検証端末 / OS を記録する（本ファイル。実機欄は下記）

### 実機検証記録（Issue 30 のパイロットで記入）

実機の VoiceOver（iOS）/ TalkBack（Android）走査、および JA/EN 各 2 名以上の初見テストは
Issue 30 のパイロットで実施し、結果をこの表に追記する。現時点は空欄のままにし、
「実施待ち」であることを明示する。

| 実施日 | 検証者 | 端末 | OS / Version | 支援技術 | 言語 | 結果 | 気づき |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 実施待ち | — | — | — | — | — | — | Issue 30 のパイロットで記入する |

# ADR-0039: クラウド基礎クイズを機能ごと除去する

- **Status**: Accepted。[ADR-0035](./0035-cloud-basics-quiz-and-progress-stamp.md) を Supersede する。
- **Date**: 2026-07-25。
- **Deciders**: Susumu Tomita (@susumutomita)。

## Context

[ADR-0035](./0035-cloud-basics-quiz-and-progress-stamp.md)（Issue 110 / PR #130）は、
クラウド基礎の四択クイズ 16 問をアプリへ同梱し、端末内で採点・保存したうえで、
合格状況をビットマスクとして既存の自己紹介カード QR（`q` キー）へ相乗りさせる
機能を実装した。

owner が実際にリリース候補ビルドで試用した結果、この機能は「自己紹介カードを
見せて回る」という本アプリの中心導線に対して寄与が薄く、以下を判断した。

1. クイズという 2 次的な機能が Settings 経由の導線・QR payload・全データ削除
   transaction・intro-card ビューアなど複数箇所に横断的に配線されており、
   維持コスト（テスト・ドキュメント・parity 検証）に見合う価値を実機で確認
   できなかった。
2. v1.0 リリースのスコープを、自己紹介カード共有と（Rules 固定の）会話 Agent
   という中心機能に絞り込みたい。

owner はこの判断に基づき、クイズ機能をコード・QR payload・ドキュメント導線から
完全に除去することを決定した。

## Decision

### クイズのドメイン・Provider・画面・テストを削除する

`src/domain/quiz-catalog.ts` / `src/domain/quiz-progress.ts` /
`src/domain/quiz-progress-code.ts`、`src/app/quiz-progress-storage.ts` と
その 3 つの Storage Adapter（`web-quiz-progress-storage.ts` /
`expo-file-system-quiz-progress-storage.ts` /
`default-quiz-progress-storage.ts`）、`src/screens/QuizScreen.tsx`、および
対応する全テストファイルを `git rm` した。`App.tsx` の composition root、
`PassportApp.tsx` の `quiz` stage・state・startup effect・persistence
effect・`resetQuizProgressInMemory`、`SettingsScreen.tsx` の
「クラウド基礎クイズに挑戦」導線、`src/app/i18n/messages.ts` のクイズ関連
メッセージキー（`settings.quizButton*` / `diagnostics.quizIncludedNotice` /
`introCard.quizProgressOmittedNotice` / `quiz` interface 全体）も、使用箇所ごと
削除した。

### 自己紹介カード QR の `q` キー（クイズ進捗ビットマスク）を除去する

`src/protocol/intro-card-url.ts` の `IntroCardUrlPayload.q` フィールド、
`OPTIONAL_PAYLOAD_KEYS` からの `'q'`、`validateQuizProgressHex`、
`decodeIntroCardUrlFragmentQuizProgressHex`（q-only decoder）、
`encodeIntroCardUrlBestEffort` / `IntroCardUrlBestEffortResult`
（`q` の best-effort 省略専用の仕組みで、他に用途が無いため関数ごと削除）を
除去し、`encodeIntroCardUrl` / `introCardUrlByteLength` から
`quizProgressHex` 引数を外した。会話エージェントが使う `m`（`themeIds`、
Issue 104 / ADR-0036）は一切変更していない。

`site/c/index.html`（自己紹介ページビューア）の `q` デコード・スタンプ表示
（`.quiz-stamp` 系 CSS・HTML・`validatedQuizProgressHex` /
`quizStampCells` / `renderQuizStamp`）も同様に除去した。ビューアの
`KNOWN_PAYLOAD_KEYS` から `'q'` を外し、`src/protocol/intro-card-url.ts` の
`OPTIONAL_PAYLOAD_KEYS`（正本）との一致を検証する既存テストで drift 無しを
確認した。

除去後、`q` キーを含まない既存の自己紹介カード QR は byte 単位で変化しない
（`q` は元々 `undefined` または全問未合格時に省略される設計だったため、
`q` という概念自体が無くなった今回の変更でも非 quiz カードの payload は
1 byte も変わらない）。`scripts/intro-card-viewer-decoder-parity.test.ts` /
`scripts/intro-card-viewer.test.ts` / `src/protocol/intro-card-url.test.ts`
を、この契約に追従させた。

### 全データ削除（erasure）transaction からクイズ進捗を外す

`src/app/local-data-control.ts` の `LocalDataPreview.quizProgressCount`、
`LocalDataControlDependencies.quizStorage`、`removeCommittedData` の
quiz storage 削除・再検証を除去した。`src/screens/LocalDiagnosticsScreen.tsx`
の `quizIncludedNotice` 表示も削除した。

## Consequences

- **Good**: 自己紹介カード QR・全データ削除・Settings 導線・i18n が、クイズという
  2 次機能の分岐を持たなくなり、以後の変更（会話 Agent の拡張等）がクイズとの
  相互作用を気にせず進められる。
- **Good**: `q` キー除去後も既存 QR の byte 一致（後方互換）を保ったまま、
  payload allowlist・ビューア parity テストの複雑さを削減できた。
- **Bad**: クイズカタログ・採点ロジックの実装は git 履歴からしか復元できない
  （ADR-0035 は不変のまま残すため、設計判断自体は参照できる）。
- **Tradeoff**: 機能を `__DEV__` 等でゲートして残す案もあったが、owner は
  「試して不要と判断した」ため、中途半端に残すより完全に除去してコードベースを
  単純に保つことを選んだ。将来クイズ的な機能を再検討する場合は、この ADR と
  ADR-0035 を踏まえた新しい設計判断（新 ADR）から始める。

## References

- 関連コード: `src/app/PassportApp.tsx`、`src/screens/SettingsScreen.tsx`、
  `src/app/i18n/messages.ts`、`src/protocol/intro-card-url.ts`、
  `site/c/index.html`、`src/app/local-data-control.ts`。
- 関連 ADR: [ADR-0035](./0035-cloud-basics-quiz-and-progress-stamp.md)
  （本 ADR が全体を Supersede する）、
  [ADR-0036](./0036-on-device-conversation-agent.md)（`m` は変更対象外）。
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/110 、
  関連 PR: https://github.com/susumutomita/TenkaCloudPassport/pull/130 。
- 関連設計文書: `docs/design/2026-07-23-cloud-basics-quiz.md`（Superseded
  バナーを追加、削除はしない）。

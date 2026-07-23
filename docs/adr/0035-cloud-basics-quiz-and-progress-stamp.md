# ADR-0035: クラウド基礎クイズと進捗スタンプ（ビットマスク QR 相乗り）

- **Status**: Accepted
- **Date**: 2026-07-23
- **Deciders**: susumutomita (owner, Issue 110), Claude Fable 5 (実装: Claude Sonnet 5)

## Context

自己紹介カード（Intro Card）ピボット後、TenkaCloud（クラウド競技コミュニティ、天下一武道会）という
ブランドの文脈づけが弱く、勉強会・イベントでの会話のフックが乏しい。owner は Issue 110 で、クラウド
基礎の四択クイズ 16 問をアプリに同梱し、端末内で採点・保存し、合格状況を既存の自己紹介カード QR に
「ファミコン風の 16 進数ビットマスク」として相乗りさせる機能を要求した。Passport の哲学（サーバーなし・
データは端末内のみ・受け手はアプリ不要）は維持する。

## Decision

- **クイズカタログを版管理された同梱データとして追加する**（`src/domain/quiz-catalog.ts`）。
  `src/domain/clue-catalog.ts` と同じ `Record` + `as const` の流儀に、`satisfies` によるタプル/
  リテラル制約を足す。カテゴリは `iam` / `network` / `storage` / `compute` / `observability` の
  5 種、AWS クラウド基礎の 16 問を ja/en で持つ。TenkaCloudChallenge 等の外部サービスへの通信・
  依存は持たない（「A: 同梱のみ」を採用、「B: カタログ取り込み」への差し替えは将来の拡張点として
  構造だけ残す）。
- **各設問に固定・append-only の `bitIndex`（0 起点）を割り当てる不変条件を導入する**。既存設問の
  `bitIndex` は変更・再利用しない。理由はビットマスクの意味が過去に発行済みの QR と食い違わないように
  するため。カタログ整合テストでこの不変条件を機械的に固定する。
- **進捗はクリア済み設問 id の `ReadonlySet` として持つ**（`src/domain/quiz-progress.ts`）。正誤の
  詳細・解答履歴・不正解の記録は持たない（自己申告のスタンプで十分という owner の判断）。
- **ビットマスク codec は `BigInt` を使う**（`src/domain/quiz-progress-code.ts`）。JS のビット演算子
  （`<<`/`|`）は 32bit 符号付き整数に丸められ 31 bit を超えると壊れるため、将来カタログが 32 問を
  超えても壊れない設計を最初から選ぶ。16 進文字列は可変長（zero-pad しない）にし、未定義の高位ビットは
  デコード時に安全に無視する。
- **端末内保存は `IntroCardStoragePort` と同型の Port + Web/Native adapter + factory の 4 ファイル
  構成にする**（`src/app/quiz-progress-storage.ts` ほか）。下書き概念は持たない。保存データに未知 id
  が混ざっていても、エラーにせず黙って除外して読み込む（ローカル保存はユーザー本人のデータであり、
  QR 側の fail-closed とは非対称な Fail-soft を意図的に採る）。保存失敗は fire-and-forget にする
  （下書き保存と同じ扱い、単一責務を優先しクイズ画面に intro card 相当のフル Notice 体系を持ち込まない）。
- **既存の自己紹介カード URL payload（`src/protocol/intro-card-url.ts` の `{v,n,t,o,s,l,e,p}`）へ
  任意キー `q`（進捗ビットマスクの 16 進文字列）を追加する**。`quizProgressHex` が `undefined` または
  `'0'`（全問未合格）なら `q` を省略し、既存 QR のバイト数は変化しない（後方互換）。`q` の値は 16 進
  文字列かつ上限桁数以内でなければ、その他のフィールドと同じ all-or-nothing 契約でフラグメント全体を
  fail-closed に拒否する。
- **`encodeIntroCardUrlBestEffort` を追加し、`q` を含めると QR byte 予算を超過する場合は `q` を
  黙って省略する**。カード本体（氏名・連絡先等）の表示を、進捗スタンプという付加情報の都合で失敗させ
  ないための優先順位付け。
- **`site/c/index.html`（完全静的ビューア）は bitIndex→カテゴリ対応表ではなく、ファミコン風マス目
  グリッド + "N / 16 クリア" で表示する**。対応表方式はカタログとビューアの手動同期箇所を増やす
  （カテゴリ名・カテゴリ数の複製）ため、ドリフト面が小さいグリッド方式を選ぶ。ビューアは `q` を
  `quiz-progress-code.ts` と同じ BigInt アルゴリズムで独立に再実装し、定数（`QUIZ_QUESTION_COUNT` /
  `QUIZ_PROGRESS_HEX_MAX_LENGTH`）のドリフトをソーステキスト検査で固定する。
- **画面導線は `SettingsScreen` からの 1 経路に絞る**。`SetupStage` に `'quiz'` を追加し、既存の
  `diagnostics` / `pilot-measurement` と同じ `UTILITY_STAGES` 集合に含める（開始は Settings のボタン、
  終了は Settings へ戻る、という一貫した経路）。`IntroCardScreen` からの直接導線は追加しない
  （着地先分岐の増加による `PassportApp.tsx` の Cognitive Complexity 上昇を避けるため）。

## Consequences

- **Good**: 既存の QR 発行フロー・ビューア・自己紹介カード domain 型に対する破壊的変更を最小限に
  留めつつ、クラウド学習コンテンツと進捗共有という新しい価値を追加できる。`bitIndex` の append-only
  契約とビューアのグリッド表示により、将来の設問追加がドリフトなく安全に行える。
- **Bad**: クイズ進捗のローカル保存は Fail-soft（未知 id を黙って除外）であり、QR 側の fail-closed と
  非対称な設計になる。読み手が「なぜ 2 つの脅威モデルが混在するのか」を本 ADR を読まずに把握するのは
  難しい。
- **Tradeoff**: `IntroCardScreen` からの直接導線を持たないため、クイズへの到達が Settings 経由の
  1 ステップ増える。owner の「勉強会での会話フック」という狙いに対しては、発見しやすさより
  `PassportApp.tsx` の回帰リスク低減を優先した。利用実績次第で follow-up として導線追加を再検討する。

## References

- 関連コード: `src/domain/quiz-catalog.ts`, `src/domain/quiz-progress.ts`,
  `src/domain/quiz-progress-code.ts`, `src/app/quiz-progress-storage.ts`,
  `src/protocol/intro-card-url.ts`, `site/c/index.html`, `src/screens/QuizScreen.tsx`
- 関連 PR / Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/110
- 関連ドキュメント: [`docs/design/2026-07-23-cloud-basics-quiz.md`](../design/2026-07-23-cloud-basics-quiz.md)
- 関連 ADR: [ADR-0026](./0026-intro-card-pivot.md)（Intro Card ピボット）,
  [ADR-0027](./0027-intro-card-url-viewer.md)（URL ビューア方式）,
  [ADR-0032](./0032-qr-error-correction-level-l.md)（QR byte 予算）

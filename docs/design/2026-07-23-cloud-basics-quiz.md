# クラウド基礎クイズと進捗スタンプ（端末内・ビットマスク QR 共有）

Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/110 （owner の意図が正本）。

## 目的

TenkaCloud（クラウド競技コミュニティ、天下一武道会）らしさを自己紹介カードアプリへ足す。クラウド基礎の
四択クイズ 16 問をアプリへ同梱し、端末内で採点・保存する。合格状況を「ファミコン風の 16 進数ビットマスク」
として既存の自己紹介カード QR に相乗りさせ、勉強会・イベントで「何問クリアした？」という会話のフックを作る。

Passport の哲学（サーバーなし・データは端末内のみ・受け手はアプリ不要）は崩さない。クイズ内容はアプリに
同梱する版管理カタログとして持ち、TenkaCloud 本体（TenkaCloudChallenge 等）への通信・依存は持たない
（本 Issue では「A: 同梱のみ」を採用し、将来カタログを外部から取り込む「B: カタログ取り込み」へ差し替え
可能な構造にはするが実装しない）。採点は自己申告のスタンプで十分とする（不正な自己申告を検出する仕組みは
持たない。ADR-0007 の脅威モデルの対象外）。

## 全体構成

```
src/domain/quiz-catalog.ts       … 16 問の版管理カタログ（設問・選択肢・正解・解説、ja/en）
src/domain/quiz-progress.ts      … 採点・進捗の純関数（cleared ids の集合を操作する）
src/domain/quiz-progress-code.ts … cleared ids ⇄ 16 進ビットマスクの codec（QR 共有用）
src/app/quiz-progress-storage.ts … Storage Port + 共通 parse/serialize（intro-card-storage.ts に倣う）
src/app/web-quiz-progress-storage.ts        … Web (localStorage) adapter
src/app/expo-file-system-quiz-progress-storage.ts … Native (expo-file-system) adapter
src/app/default-quiz-progress-storage.ts    … Platform 判定ファクトリ
src/screens/QuizScreen.tsx        … 出題・回答・採点・進捗表示の画面
src/protocol/intro-card-url.ts    … 既存 payload に任意キー `q`（進捗ビットマスク）を追加
site/c/index.html                 … `q` をデコードしてスタンプ（マス目グリッド）を表示
```

## 1. クイズカタログ（`src/domain/quiz-catalog.ts`）

`src/domain/clue-catalog.ts` と同じ「バージョン付き同梱カタログ」の流儀（`CATALOG_VERSION` 定数、
`Record` を `as const` でキー付けし `keyof typeof` で ID の型を導出する）を踏襲する。

```ts
export type QuizCategory = 'iam' | 'network' | 'storage' | 'compute' | 'observability';

interface QuizQuestionDefinition {
  readonly bitIndex: number;
  readonly category: QuizCategory;
  readonly prompt: { readonly ja: string; readonly en: string };
  readonly choices: readonly [LocalizedText, LocalizedText, LocalizedText, LocalizedText];
  readonly correctIndex: 0 | 1 | 2 | 3;
  readonly explanation: { readonly ja: string; readonly en: string };
}

export const QUIZ_CATALOG = { 'iam-explicit-deny': { bitIndex: 0, ... }, ... }
  as const satisfies Record<string, QuizQuestionDefinition>;
```

`satisfies`（TS 4.9+）を使うことで、`as const` によるリテラル型の精度（`choices` が正確に 4 要素の
タプルであること、`correctIndex` が各設問固有のリテラルであること）を保ったまま、`QuizQuestionDefinition`
の構造を型チェック時に強制する。`CLUE_CATALOG` は単一言語（ja のみ）のラベルだが、クイズは Issue の要求
どおり設問・選択肢・解説を `{ja, en}` で持つ（UI chrome の文言は `messages.ts` 側、設問内容はカタログ側、
という役割分担にする）。

### bitIndex の不変条件

各設問に固定のビット位置（0 起点、append-only）を割り当てる。**既存設問の bitIndex は変更・再利用
しない**。理由は、進捗を id の配列ではなく bitIndex ベースのビットマスクとして QR に載せるため、
bitIndex がずれると過去に発行された QR の意味（どの設問をクリアしたか）が変わってしまうこと。
カタログ整合テスト（`quiz-catalog.test.ts`）で bitIndex の一意性・連続性（0..15）を固定する。将来
設問を追加する場合は、既存 bitIndex を保ったまま 16 の次（bitIndex 16）から採番する
（`quiz-progress-code.ts` は未定義の高位ビットを安全に無視する設計のため、後方互換は崩れない）。

### 設問構成（16 問、AWS クラウド基礎、5 カテゴリ）

正確性を最優先し、AWS 公式ドキュメントで確認できる事実だけを出題する。誤答を正解にしない。

| bitIndex | id | category | 概要 |
| --- | --- | --- | --- |
| 0 | `iam-explicit-deny` | iam | IAM ポリシー評価で明示 Deny が Allow に優先する |
| 1 | `vpc-public-subnet` | network | パブリックサブネットは IGW 宛ルートを持つ |
| 2 | `s3-consistency` | storage | S3 は全操作で強い整合性を持つ（2020 年 12 月以降） |
| 3 | `lambda-basics` | compute | Lambda はサーバー管理不要のイベント駆動 FaaS |
| 4 | `cloudwatch-role` | observability | CloudWatch はメトリクス/ログの収集・監視・アラーム |
| 5 | `iam-role-purpose` | iam | IAM ロールは一時認証情報を委任する仕組み |
| 6 | `security-group-stateful` | network | セキュリティグループはステートフル |
| 7 | `ebs-basics` | storage | EBS は AZ 内限定のブロックストレージ |
| 8 | `auto-scaling-purpose` | compute | Auto Scaling は需要に応じた台数調整 |
| 9 | `cloudtrail-role` | observability | CloudTrail は API 呼び出しの監査ログ |
| 10 | `root-user-best-practice` | iam | ルートユーザーは MFA・日常利用回避がベストプラクティス |
| 11 | `vpc-basics` | network | VPC はアカウント内の論理分離ネットワーク |
| 12 | `s3-glacier-retrieval` | storage | Glacier Flexible Retrieval は取り出しに待ち時間がある |
| 13 | `fargate-basics` | compute | Fargate はサーバーレスのコンテナ実行エンジン |
| 14 | `cloudwatch-alarm` | observability | CloudWatch Alarm はしきい値超過で通知・アクション |
| 15 | `xray-basics` | observability | X-Ray は分散トレーシングサービス |

各設問は 4 択・1 正解・簡潔な解説（誤答を選んだ場合も含め、なぜ正解がその選択肢かを 1-2 文で示す）を
ja/en で持つ。内容は code-reviewer / QA レビューで事実正確性を重点確認する（誤りは blocker 扱い）。

## 2. 採点・進捗ドメイン（`src/domain/quiz-progress.ts`）

進捗は「クリア済み設問 id の集合」として持つ（`ReadonlySet<QuizQuestionId>`）。純関数のみで構成する。

- `scoreQuizAnswer(question, selectedIndex)` — 正誤判定を返す（副作用なし）。
- `withQuizQuestionCleared(progress, id)` — クリア済み集合へ 1 件追加した新しい集合を返す（不変更新、
  既にクリア済みなら同じ参照を返し無駄な再 render を避ける）。
- `quizClearedCount(progress)` / `isQuizComplete(progress)` — 進捗表示・全問クリア判定用。

「不正解を記録する」「解答履歴を保持する」機能は持たない（採点は自己申告のスタンプで十分、という owner の
判断どおり、集合に入っているかどうかの 2 値だけを保持する）。これは data-inventory.md の
「QR に載るのは合格 id のみで、正誤の詳細や解答履歴は載せない」という設計判断とも整合する。

## 3. ビットマスク codec（`src/domain/quiz-progress-code.ts`）

クリア済み集合と 16 進文字列を相互変換する。

```ts
export const QUIZ_PROGRESS_HEX_MAX_LENGTH = 32; // fail-closed 用の粗い上限（後述）

export function encodeQuizProgressHex(progress: ReadonlySet<QuizQuestionId>): string {
  let mask = 0n; // BigInt: bitIndex が 31 を超えても JS の 32bit 整数ビット演算の上限に当たらない
  for (const question of catalog entries) {
    if (progress.has(question.id)) mask |= 1n << BigInt(question.bitIndex);
  }
  return mask.toString(16); // 0 なら '0'
}

export function decodeQuizProgressHex(hex: string): ReadonlySet<QuizQuestionId> {
  // 16 進以外の文字・QUIZ_PROGRESS_HEX_MAX_LENGTH 超過は fail-closed で throw する。
  const mask = BigInt(`0x${hex}`);
  // カタログが知っている bitIndex だけを見るループのため、上位の未定義ビットは
  // 自動的に無視される（将来の桁拡張・逆に古いビューアで新しいカードを開いた場合の
  // 両方で安全）。
}
```

`number` のビット演算（`<<` / `|`）は 32bit 符号付き整数に丸められるため、31 bit を超えると正しく
動作しなくなる。今は 16 問（16 bit）で十分足りるが、Issue が明示する「将来のカタログ拡張で桁が増えても
壊れない設計」を満たすため、最初から `BigInt` を使う（16 問の間はこの選択によるパフォーマンス上の
デメリットは無視できる）。

16 進文字列の桁数は問題数に比例して可変にする（固定 4 桁へ zero-pad しない）。0 マスク（全問未合格）は
`'0'` という最短表現になり、これを「進捗なし」の目印として扱う（後述の QR 側の省略判定に使う）。

### エッジケース

- **不正な 16 進文字列**（`g`〜`z` 等の非 16 進文字、空文字）: `decodeQuizProgressHex` が throw する
  （fail-closed）。
- **異常に長い文字列**（DoS 目的の手作りペイロード）: `QUIZ_PROGRESS_HEX_MAX_LENGTH`（32 桁 = 128 bit
  相当、現行 16 問の 8 倍の余裕）を超えたら throw する。
- **未来のカタログにしか存在しない高位ビット**（現在のカタログより新しいアプリで発行された QR を、
  古いアプリ/ビューアが開く場合）: 現在のカタログが知っている bitIndex だけを見るため、未知の高位ビットは
  黙って無視する（クラッシュしない、余分な進捗として誤表示もしない）。
- **過去のカタログにしか存在しない下位ビット**（将来 bitIndex を割り当て直すことは禁止しているため
  原理的に起きないが、念のため）: 該当しない。bitIndex は append-only 不変のため、新しいカタログは
  古い QR のビット位置をそのまま正しく解釈できる。

## 4. Storage（`src/app/quiz-progress-storage.ts` ほか）

`src/app/intro-card-storage.ts`（Port + Web/Native 2 adapter + factory の 4 ファイル構成）を踏襲する。
下書き（`loadDraft`/`saveDraft`）に相当する概念はクイズには不要なため持たない（回答は都度採点が完了し、
「クリア済みかどうか」という最終結果だけを保存する。回答の途中経過や選択中の選択肢は画面のローカル state
に閉じ、アプリを離れると失われてよい。「クリアした問題の一覧」という自己申告スタンプの粒度に対して、
これ以上の永続化は過剰品質と判断した）。

- `QuizProgressStoragePort.load(): Promise<ReadonlySet<QuizQuestionId>>`
- `QuizProgressStoragePort.save(progress): Promise<void>`
- 保存 JSON は `{ clearedQuestionIds: string[] }`。読込時、現在のカタログに存在しない id は
  （エラーにせず）黙って除外する。bitIndex 同様 id も append-only 前提だが、万一将来カタログを整理する
  ことがあっても、ローカルの古い保存データで起動不能になる（アプリを壊す）よりは、無害に一部の
  スタンプが消える方を選ぶ、という Fail-soft の判断（ローカル保存はユーザー本人の端末内データであり、
  QR 側の fail-closed とは非対称な設計を意図的に採る。QR は他者から見える／転送され得る攻撃対象面、
  ローカル保存は自分のデータの読み直しという別の脅威モデルのため）。
- 保存キー: Web は `localStorage` の `tenkacloud-passport.quiz-progress`、Native は
  `tenkacloud-passport-quiz-progress.json`（`intro-card` 系と同じ命名規則、別ファイル・別キー）。
- 保存失敗は「採点は自己申告のスタンプで十分」という前提に合わせ、下書き保存と同じ fire-and-forget
  （`.catch(() => undefined)`）にする。正答した瞬間に UI 上はスタンプが付くため、保存の成否をエラー
  通知として画面に出す価値は低いと判断した（`docs/architecture/quality-bar.md` の「単一責務」に照らし、
  クイズ画面に intro card 相当のフル Notice 体系を持ち込まない）。

## 5. QR 共有（`src/protocol/intro-card-url.ts` の拡張）

既存の自己紹介カード URL payload `{v,n,t,o,s,l,e,p}` に、任意キー `q`（進捗ビットマスクの 16 進文字列）
を追加する。

```ts
export function encodeIntroCardUrl(card: IntroCard, quizProgressHex?: string): string;
export function introCardUrlByteLength(card: IntroCard, quizProgressHex?: string): number;
export function encodeIntroCardUrlBestEffort(card: IntroCard, quizProgressHex?: string): string;
```

- **省略ルール**: `quizProgressHex` が `undefined` または `'0'`（全問未合格）なら `q` キー自体を
  payload に含めない。既存の QR（`q` を持たない）はこれまでどおりのバイト数のまま変化しない
  （後方互換）。
- **未知キー拒否との両立**: `decodeIntroCardUrlFragment`（IntroCard を復元する既存関数）・新設の
  `decodeIntroCardUrlFragmentQuizProgressHex`（`q` だけを取り出す関数）はどちらも同じ許可 key 集合
  （`t,o,s,l,e,p,q`）を使う。`q` の値は 16 進文字列かつ `QUIZ_PROGRESS_HEX_MAX_LENGTH` 以内でなければ
  **fragment 全体を** fail-closed で拒否する（既存の all-or-nothing 契約を維持し、`q` だけを無視して
  カード部分だけ復元する、という中途半端な動作にしない）。
- **QR 予算**: 16 問 = 16 bit = 16 進最大 4 桁。JSON 上は `"q":"ffff"` の 10 byte 程度の追加で、
  QR_ENCODER_MAX_BYTES（1,367 byte、ADR-0032）に対してほぼ無視できる増分である。ただし
  Issue 121 で発覚した「フルカードは 1,351 byte まで達する」という実例（`intro-card-url.test.ts`）
  を踏まえ、既に上限ぎりぎりのカードに `q` を足すと超過し得るという理論上のエッジケースが残る。
  この対策として `encodeIntroCardUrlBestEffort` を用意し、`quizProgressHex` を含めると超過する場合
  だけ黙って `q` を省略し（カード本体の表示は絶対に落とさない）、含めても収まる場合はそのまま返す。
  `IntroCardScreen.tsx` はこの best-effort 版を呼ぶ（カード本体の表示を、進捗スタンプの都合で
  壊さないための設計判断）。

### 代替案

- **案 A: `quizProgressHex` を `IntroCard` domain 型自体のフィールドにする** → 却下。Intro Card は
  「Owner が自分について入力する情報」という一貫した意味を持つドメイン型であり、クイズ進捗という別種の
  データを混ぜると `createIntroCard` のバリデーション対象・保存責務が肥大化する。QR payload レベルの
  「追加で相乗りさせる任意フィールド」として protocol 層だけに閉じる方が単一責務を保てる。
- **案 B: クイズ専用の QR を別発行する** → 却下。Issue が「フル統合ではなく」「既存の自己紹介カード QR
  に相乗り」を明示しており、QR がもう 1 種類増えると「どちらの QR を見せればいいか」という認知負荷が
  増える。1 枚の QR で自己紹介と学習進捗を同時に見せられる方が、勉強会での会話のフックとして機能する。

## 6. ビューア（`site/c/index.html`）表示形式

owner が挙げた 2 案（bitIndex→カテゴリ対応表 vs. ファミコン風マス目グリッド）のうち、**マス目グリッド
+ "N / 16 クリア"** を採用する。

- 対応表方式は、ビューア（ビルドステップを持たない完全静的ファイル）がカテゴリ名・カテゴリ数を
  カタログと同期して複製し続ける必要があり、設問を増減するたびに 2 箇所（`quiz-catalog.ts` と
  `site/c/index.html`）を手で揃えないと表示が壊れる。
- グリッド方式は「クリア済み設問数」という 1 つの数値と、ビット位置ごとの塗り/空だけで表現でき、
  カテゴリ名を一切ビューアへ持ち込まなくてよい。桁数が増えても `QUIZ_QUESTION_COUNT`（新設定数）
  1 つを揃えるだけで済み、ドリフトの起きる面が小さい。owner の「ファミコン風」という嗜好にも
  グリッド表現の方が近い。

ビューアは `q` を `decodeQuizProgressHex` と同じアルゴリズム（BigInt ビット演算）で独立に再実装し
（他のフィールドと同じ「ビルドステップを持たない静的ファイルのため import できない」制約）、
`scripts/intro-card-viewer.test.ts` のソーステキスト検査で `src/domain/quiz-progress-code.ts` との
定数（`QUIZ_QUESTION_COUNT`、`QUIZ_PROGRESS_HEX_MAX_LENGTH`）drift を固定する。`q` が存在しない、または
省略された（全問未合格）カードでは、スタンプ表示自体を出さない（既存 QR を読んだ相手には見た目の変化が
一切ない）。

## 7. 画面（`src/screens/QuizScreen.tsx`）と導線

既存の `IntroCardScreen` / `SettingsScreen` と同じ `AppScreen` + `ActionButton` の組み合わせで作る。

- **導線**: `SettingsScreen` に「クイズに挑戦」ボタンを追加し、`SetupStage` に `'quiz'` を追加して
  `UTILITY_STAGES`（既存の `settings` / `diagnostics` / `pilot-measurement` と同じ集合）へ加える。
  `diagnostics` / `pilot-measurement` と同じく、開始は Settings 画面のボタンから、終了は Settings
  画面へ戻る、という一貫した経路にする（`IntroCardScreen` からの直接導線は追加しない。理由は次項）。
- **`IntroCardScreen` から直接開かない判断**: 追加すると「クイズを終えたら Settings に戻るのか、
  Intro Card 表示画面に戻るのか」という着地先の分岐が入口ごとに増え、`PassportApp.tsx`
  （既に 2,300 行超）の Stage 遷移契約（`passport-app-stage-flow.test.ts`）に新しい分岐パターンを
  持ち込むことになる。Issue は「intro card 画面か新 stage からクイズへ到達できるようにする」を
  "どちらか" として許容しているため、`diagnostics`/`pilot-measurement` と完全に同型の導線
  （Settings 経由）に寄せ、認知負荷と回帰リスクを抑える。
- **画面構成**:
  1. 一覧（既定表示）: 16 問をカテゴリ順に並べ、クリア済み/未クリアを枠とテキストで示し
     （色だけに依存しない）、「N / 16 クリア」を表示する。
  2. 出題（一覧から 1 問選ぶと遷移）: 4 択を表示し、選択 → 「回答する」で採点 → 正誤 + 解説を表示
     → 「一覧に戻る」。
  3. 進捗の永続化は「正解した設問の id を集合へ追加する」タイミングだけで行い、途中で画面を離れても
     未回答分の再開位置は保持しない（3. の Storage 節参照）。

## 8. i18n

UI chrome（画面タイトル・ボタン・「N / 16 クリア」等の文言）は `src/app/i18n/messages.ts` へ `quiz`
セクションとして追加する。設問・選択肢・解説はカタログ側の `{ja, en}` を直接使う（`clue-catalog.ts` の
ラベルとは異なり、クイズは Issue の要求どおり両 Locale を用意する）。

## 9. 検証・エッジケース一覧

| ケース | 扱い |
| --- | --- |
| 16 進以外の `q` | fragment 全体を fail-closed で拒否（protocol 層・viewer 双方） |
| `q` の桁数超過 | 同上 |
| 未定義の高位ビット（将来拡張後の QR を古いカタログで開く） | 無視（クラッシュしない） |
| 全問未合格（マスク 0） | `q` キー自体を省略、既存 QR と完全に同じバイト数 |
| カード本体が上限ギリギリで `q` を足すと超過する | `encodeIntroCardUrlBestEffort` が `q` を省略してでも
  カード本体の表示を優先する |
| ローカル保存データに未知 id が混ざる | 除外して読み込む（アプリを壊さない） |
| 保存失敗（端末ストレージ不調） | fire-and-forget、UI の採点結果表示自体は失敗させない |

## 10. Follow-up（scope 外、`/follow-up add` で記録）

- クイズ進捗を Diagnostics の「全データ削除」対象に含めるかどうかは owner 判断が必要
  （Intro Card 本体も同様に対象外という既存踏襲に倣ったが、明示的な ADR 判断ではない）。
- 将来「B: カタログ取り込み」（TenkaCloudChallenge 本体との連携）へ拡張する場合の認証・同期方式は
  本 Issue の scope 外。

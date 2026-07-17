# Owner Question の段階的開示・Consent Flow の設計

本書は Issue 11 の設計を定める。Issue 10 が実装した bounded protocol
（`src/domain/pet-interaction.ts`）の `clarifying` フェーズを、実際に Owner へ提示する UI と
Active Lounge の実判定経路へ配線する。用語は [用語集](../product/glossary.md)、bounded
protocol 本体は
[Pet の短時間・制限付き交流 State Machine の設計](./pet-interaction-protocol.md) を正本とする。
本書はこれらを **拡張** する差分であり、`PetInteractionState` / `reducePetInteraction` という
既存の状態機械を重複実装しない。

## 目的と対象範囲

情報が足りないことを欠陥にせず、人間へ聞けば分かることだけを短く確認する。回答しない権利と、
回答の共有・削除境界を質問より先に示す。1 人につき 1 Lounge 最大 1 問、1 問は 1 つの論点だけを
扱い、`答える` / `分からない` / `パス` を常に用意し、Answer は Lounge 内だけで使い Passport へ
自動保存しない。

対象は新規モジュール `src/domain/owner-question.ts`（`purpose` / メモ検証の拡張）と
`src/app/owner-question-disclosure.ts`（事前開示文言）、
`src/app/owner-question-answer-flow.ts`（最終 Consent 前の 2 段階 UI State）、
`src/app/pet-interaction-flow.ts`（bounded protocol を Active Lounge の実判定経路へ配線する
純粋関数）とする。加えて `src/screens/OwnerQuestionScreen.tsx`（質問画面）と
`PassportApp.tsx` の配線も対象に含む。

## Question の目的（purpose）と Sensitive Attribute の構造的排除

`OwnerQuestion` に `purpose: 'canOffer' | 'lookingFor' | 'currentGoal'` という閉じた
Union を追加する。この値は候補手掛かり（`ConfirmedClue`）が属する `PassportField`
（`topics` / `offers` / `lookingFor` / `goal`）から機械的に導出し（`topics` は「何を
提供できるか」に近い性質のため `canOffer` へ寄せる）、呼び出し側が任意の目的を指定する余地は
ない。

Owner Question は自由記述の質問文を一切持たない。表示文言は版管理済みカタログ
（`OWNER_QUESTION_CATALOG`）だけから作られ、候補手掛かりも版管理済みカタログ
（`src/domain/clue-catalog.ts`）に列挙された 11 件だけから選ばれる。人種、宗教、健康、政治、
性的指向、正確な住所、連絡先を質問候補にしないという受け入れ条件は、これらの語彙を尋ねられる
自由入力の質問文そのものが存在しないという構造によって満たす（フィルタで弾く対象が存在しな
い）。`src/domain/owner-question.test.ts` は、カタログの全 11 件の表示ラベルにこれらの語彙が
含まれないことと、`purpose` が常に許可された 3 値のいずれかになることを固定する。

## 事前開示（disclosure）

`src/app/owner-question-disclosure.ts` の `ownerQuestionDisclosure()` が、質問文より前に
必ず表示する 3 つの固定文言（誰へ共有されるか、いつ消えるか、Passport に残らないか）を返す。
`expiry-notice.ts` / `interaction-status-notice.ts` と同じ、内容を持たない状態表示専用の
mapper として実装する。`OwnerQuestionScreen` はこの開示ブロックを質問文より前に配置し、
`src/screens/owner-question-accessibility.test.ts` がソーステキストの出現順序で固定する。

## 3 択（答える / 分からない / パス）と自由記述メモ

`clarifying` フェーズの回答画面は、常に次の 3 操作を提供する。

| 操作 | 対応する `OwnerAnswerValue` | 遷移 |
| --- | --- | --- |
| 答える | `'yes'`（最終確認を経て確定） | `confirming-share` を経てから `onAnswer('yes')` |
| 分からない | `'no'` | 直ちに `onAnswer('no')` |
| パス | `'decline'` | 直ちに `onAnswer('decline')` |

自由記述のメモ（`OWNER_ANSWER_NOTE_MAX_LENGTH = 140` 文字）は任意入力であり、
`validateOwnerAnswerNote`（`src/domain/owner-question.ts`）が前後の空白除去と上限超過の
型付きエラー（`OwnerQuestionError`、`code: 'NOTE_TOO_LONG'`）を担う。このメモは Owner
自身が「答える」を確定する前に見返すための、この端末だけのローカル UI State であり、
Bridge Evidence（`MatchEvidence`）、Peer Envelope（`peer-envelope.ts`）、Storage の
いずれにも渡さない。選択肢（答える / 分からない / パス）だけでも常に回答が完結し、メモの
入力有無は `onAnswer` の呼び出しを妨げない。

## 最終 Consent（answering → confirming-share）

`src/app/owner-question-answer-flow.ts` が、回答画面が持つローカルな 2 段階の UI State
（`answering` / `confirming-share`）を純粋な reducer として持つ。「答える」を選んだだけでは、
まだ回答を Peer 共有可能な Bridge の判定へ渡さない。`confirming-share` の最終確認画面
（今回の Lounge の相手にも見える Bridge として使うことの再確認とメモの見返し）を経て、
「確定して共有する」を押した瞬間に初めて `onAnswer('yes')` を呼ぶ。「やめる」は
`answering` へ戻り、回答をまだ確定しない。`分からない` / `パス` はどちらも Peer に何も
共有しないため、この最終確認を経由せず直接回答を確定する。

## Active Lounge への実判定経路への配線

`src/app/pet-interaction-flow.ts` が、bounded protocol（Issue 10）を Active Lounge の実判定
経路へ配線する 3 つの純粋関数を提供する。`lounge-reducer.ts` が `lounge.ts` を包むのと同じ
役割分担で、Domain の Transition 関数をそのまま呼び出し、React には依存しない。

- `beginPetInteraction(active, provider, clock)`:「会話の糸を探す」操作 1 回で、
  discovering → clarifying / no-signal まで進める。Rules Provider は同期関数のため、
  discovering はこの呼び出しの中だけで一瞬経由し、観測可能な状態として保持しない。
- `submitOwnerQuestionAnswer(interaction, active, answer, clock)`: Owner の回答を適用する。
  `clarifying` 以外で呼ばれても状態を変えない、二重送信に対する冪等な no-op。
- `applyPetInteractionTick(interaction, active, clock)`: Provider / Owner の応答を待たずに
  45 秒の締切だけを確認する。Lounge の 1 秒 tick / Background 復帰から呼ぶ。

`bridging` / `no-signal` は確定した瞬間に `retireInteraction` へ委譲し、Lounge 本体の
`RetiredLounge` へ収束させる（`collapseToRetiredLounge`）。App 層が実際に保持・表示する
`PetInteractionState` は `clarifying`（Owner Question の回答待ち）か `null`
（未着手または確定済み）だけになる。`PassportApp.tsx` は Active Lounge の 1 秒 tick と
Background 復帰の両方を単一の `applyLoungeAdvance` 関数へ委譲し、Lounge 本体の期限
（`reduceLounge`）と Pet Interaction の 45 秒締切（`applyPetInteractionTick`）を同じ
関数呼び出しの中でまとめて評価する。これは Issue 9 の `applyRoomAdvance` と同じ設計原則
（2 つの state を別の render にまたがず同期的に更新し、中間 render を作らない）を踏襲する。

## Question Budget・二重送信・取消・期限切れ・退出

- **Question Budget 超過**: `clarifying` は `discovering` からの 1 方向遷移としてしか
  到達できず（Issue 10 の型設計）、`OwnerQuestionScreen` は `interaction` が確定した瞬間に
  `null` へ戻って表示されなくなるため、同じ Lounge で 2 問目を尋ねる経路は UI 上に存在しない。
- **二重送信**: `submitOwnerQuestionAnswer` は `interaction.phase !== 'clarifying'` を
  ガードするため、確定直後の重複呼び出しは無変化の no-op になる。
- **取消（Cancel）**: 退出（`leave`）・Host 終了（`endAsHost`）は、`clarifying` 中に
  呼ばれても `PassportApp.tsx` がその場で `interaction` を `null` へ戻す。Lounge 自体の
  Destroy 経路（`lounge-reducer.ts` / `lounge-room.ts`）が既に Terminal Event を扱うため、
  この App 層は `cancelInteraction`（`lounge-expired` / `lounge-exit` の理由付け）を
  呼ばずに済む。Active Lounge 自体が 20 分満了した場合は `applyLoungeAdvance` が Pet
  Interaction の締切確認より先に Lounge の Destroy を検出し、`interaction` を破棄する。
- **期限切れ**: `applyPetInteractionTick` が 45 秒締切超過を検出すると、Owner の応答を待たず
  timeout（`no-signal`）へ収束し、`RetiredLounge` へ変換される。`OwnerQuestionScreen` は
  自動的に非表示になる。
- **退出**: `OwnerQuestionScreen` は `ActiveLoungeScreen` / `OutcomeScreen` と同じ
 「退出して破棄」「Host として終了」を常設し、質問への回答中でも 1 操作で Lounge を
  終了できる。

## Storage / バックアップへの非保存

`src/app/lounge-privacy-regression.test.ts` を拡張し、`clarifying` を経由して Owner が
「答える」を最終確認まで確定した Bridge 経路でも、実際に `PassportApp` が呼ぶのと同じ
`pet-interaction-flow.ts` の関数列だけで実行し、Storage には Local Private Profile 以外
何も増えないことを固定する。禁止語彙のリストに `confirm-shared-clue` / `clarifying` /
`candidateClue` / `questionId` / `sharingConsent` / `purpose` / `canOffer` を追加した。
`src/domain/backup.ts`（手動 JSON バックアップの型）のソーステキストにもこれらの語彙が
含まれないことを固定する。自由記述メモは Storage / バックアップどちらの経路にも渡らない
React コンポーネントのローカル State に留まるため、`OwnerQuestionScreen.tsx` /
`owner-question-answer-flow.ts` / `owner-question-disclosure.ts` / `pet-interaction-flow.ts`
のいずれも Storage Port を import しないことをソーステキストで固定する。

## Passport への追加操作（Known follow-up の Seam）

Answer を Passport へ追加する操作は Lounge 終了後の別 Action とし、デフォルトは追加しない。この
Issue では実際に「追加する」UI は実装せず、次の Seam だけを用意する。

- `MatchEvidence` の `clues`（`ConfirmedClue[]`）は、既に `createLocalPrivateProfile` の
  `candidateClueIds` と同じ形（`ClueId` の配列）であるため、将来の「追加する」操作は
  既存の Local Profile 保存経路（`saveLocalProfile` → `localProfileStorage.save`）へ
  そのまま渡せる。新しい型やスキーマを追加しなくてよい。
- 現在この経路を呼ぶコードは存在せず（`OwnerQuestionScreen` / `pet-interaction-flow.ts` の
  いずれも Storage Port を参照しない、前節参照）、デフォルトで追加しないという受け入れ条件は
 「呼び出し経路が実装時点で 1 つも存在しない」という構造で満たしている。
- 実際の「Lounge 終了後にこの手掛かりを Passport へ追加しますか」という確認 UI と、
  重複時の統合方針（Local Profile の `PROFILE_MAX_CLUES` 上限との整合）は Known
  follow-ups とする。

## Accessibility

`OwnerQuestionScreen` の全操作（答える / 分からない / パス / 確定して共有する / やめる /
退出して破棄 / Host として終了、メモの `TextInput`）に `accessibilityLabel` /
`accessibilityRole` / `accessibilityHint` を付ける。既存の Screen（`ActionButton`,
`AppScreen`）が持つ Software Keyboard 対応（`TextInput` の標準挙動、`ScrollView` の
`keyboardShouldPersistTaps`）をそのまま利用し、新しい Native Module を追加しない。
`src/screens/owner-question-accessibility.test.ts` が、この repo の既存 Accessibility Test
と同じソーステキスト検査（レンダリング用の統合テスト基盤を持たない、新規依存を増やさない
方針）で、開示の表示順序、3 択の常設、最終 Consent の経由、内部推論・Prompt・Evidence の
中身を直接埋め込まないことを固定する。

## 代替案

### `分からない` / `パス` を同じ内部処理へ統合する案

`分からない`（`'no'`）と `パス`（`'decline'`）は、現在の Rules Provider 経路ではどちらも
`insufficient-evidence` の `no-signal` へ収束するため、UI 上も 1 つのボタンへ統合する案を
検討した。しかし用語集は「回答しない権利」と「判断できないという回答」を意味的に区別しており、
将来 Local Agent が回答内容を Telemetry や UX 改善のシグナルとして参照する可能性を残すため、
ボタンと `OwnerAnswerValue` の対応は現在の 3 値のまま個別に保つ。

### メモを Bridge Evidence / Peer Envelope へ含める案

自由記述メモを Bridge の message へ連結し、相手にも伝える案も検討した。しかし
`MatchEvidence` / `Bridge` / `peer-envelope.ts`（Issue 5 で固定した Wire Protocol）を
拡張する必要があり、この Issue の本来の目的（段階的開示・Consent UI の配線）に対して
不釣り合いに大きい変更になる。メモは「答える」を確定する前に Owner 自身が見返すための
ローカルな確認材料に留め、Peer への追加共有チャネルにはしない。

### `clarifying` の間、Owner Question 専用の 45 秒カウントダウンを表示しない案

`expiry-notice.ts`（20 分 Lounge TTL 用の 60 秒警告閾値）を流用する案も検討したが、
45 秒という Pet Interaction 自体の締切は常に 60 秒未満であり、`expiry-notice.ts` の
警告閾値をそのまま適用すると常に警告状態になってしまう。`OwnerQuestionScreen` は
`expiry-notice.ts` を使わず、独立した「残り N 秒で自動的に終了します」という単純な
カウントダウン文言を持つ。

### `collapseToRetiredLounge` の引数型を `cancelled` を除いた Union へ narrowing する案

`collapseToRetiredLounge(active, outcome: InteractionOutcome)` は `outcome.kind ===
'cancelled'` を実行時ガードで拒否する（呼び出し元 3 関数はいずれも `cancelInteraction`
を呼ばないため到達しない）。レビューで、引数型を `Extract<InteractionOutcome, {kind:
'bridge'} | {kind: 'no-signal'}>` へ狭め、この到達不能な分岐と、それを踏むためだけの
契約的なテストを削除する案を検討した。しかし `retireInteraction`（Issue 10 の Domain
関数）は `state.phase === 'retired'`（すでに Cancel 済みで再度 retire された場合）を
経由すると `'cancelled'` な `outcome` を正当に返しうる。つまり `InteractionOutcome` が
広い理由は型の書き損じではなく、Domain の正しい契約を反映している。呼び出し側で型を狭めるには
結局どこかで同じ実行時ガードが要る。3 箇所（`beginPetInteraction` /
`submitOwnerQuestionAnswer` / `applyPetInteractionTick`）それぞれに同じガードを複製する
より、1 箇所に集約したまま fail loudly するほうが保守しやすいと判断し、現状の設計を維持
した。

## エッジケース

- 共有手掛かりの候補が 1 件もなければ `clarifying` を経由せず、`beginPetInteraction` が
  直接 `RetiredLounge`（`no-signal`）を返す。
- `分からない` / `パス` は Owner Question の内部処理を止めず、必ず `no-signal` の
  `RetiredLounge` へ進む（Agent が沈黙したまま止まる経路は存在しない）。
- 45 秒締切の超過は、Owner が回答する直前でも Owner の回答を待たず timeout(no-signal) を
  優先する。
- Active Lounge 自体の 20 分満了が Pet Interaction の 45 秒締切より先に発生した場合、
  `applyLoungeAdvance` は Lounge の Destroy を優先し、`interaction` を破棄する
 （Pet Interaction の締切超過を検出する前に Lounge の Destroy を検出する分岐が先に走る）。
- `answering` の間に「退出して破棄」「Host として終了」を押しても、`interaction` は
  直ちに破棄され、二重送信や不整合な状態遷移を起こさない。
- メモが 140 文字を超える入力（貼り付け等で `TextInput` の `maxLength` を経由しない経路）は
  `validateOwnerAnswerNote` が型付きエラーで拒否し、直前の値を保つ。

## 人間検証

実際の Screen Reader（VoiceOver / TalkBack）と Software Keyboard だけで、開示の読み上げ
順序、3 択の到達性、最終 Consent 画面への遷移と復帰が違和感なく完了できるかは人間検証に
委ねる。機械テストは、Consent Flow の状態遷移、Storage / バックアップへの非保存、Accessibility
属性の付与とソーステキスト順序を対象にする。

## Known follow-ups

- Lounge 終了後に Owner Answer を Passport へ明示的に追加する確認 UI（前述の Seam を使う）。
- 実際の Local Agent（`llama.rn`）を `InteractionDiscoveryProvider`（`kind: 'local-agent'`）。
  として接続し、`beginPetInteraction` の同期呼び出しを非同期の待機表示へ拡張する
 （Issue 10 の Known follow-ups を引き継ぐ）。
- Owner Question のカタログが将来複数の質問 ID を持つようになった場合、`purpose` の
  導出元を `PassportField` だけでなく質問 ID 自体からも選べるよう拡張するかどうかの再検討。
- `OwnerQuestion` は `schemaVersion: 1` のまま必須 `purpose` を追加した。実際に Wire
 （`PeerEnvelope` / `PeerPayload`）へ乗せる配線がまだ存在しないため今回は安全だが、
  将来 M3 の Peer 間で `OwnerQuestion` そのものを送受信するようになった時点で、
  schemaVersion を上げるべきか、`purpose` 追加以降を実質的な schemaVersion 1 の
  契約として扱ってよいかを改めて判断する。

# Pet の短時間・制限付き交流 State Machine の設計

本書は Issue 10 の設計を定める。Active Lounge の中で Pet が自由会話を続けず、共有済みの
情報から 1 本の会話の糸だけを探し、必要なら Owner へ 1 問だけ尋ね、Bridge または
`no-signal` を返して `retired` になる bounded protocol を対象とする。用語は
[用語集](../product/glossary.md)、
Lounge 本体の状態機械は [初回 Encounter の設計](./initial-encounter.md) と
[Lounge の状態機械・退出・完全破棄の設計](./lounge-lifecycle.md) を正本とする。本書は
これらを **拡張** する差分であり、`ActiveLounge` / `RetiredLounge` / `DestroyedLounge`
という既存の Lounge 本体の状態機械を重複実装しない。

## 目的と対象範囲

Issue 9 の設計書は、Rules Provider の `decide()` が同期関数であるため、`clarifying` を
実装が到達しない概念上の状態としてだけ扱い、独立した型やテスト対象にしないと決めていた
（同書「`clarifying` が実装で独立した状態を持たない理由」）。Issue 10 は、その Known
follow-up を解消し、`clarifying` を Owner Question を経由する独立した観測可能な状態として
実装する。ただし、この bounded protocol は Active Lounge の中で 1 回の Encounter が
どう決着するかを表す **より詳細な粒度の状態機械** であり、`evaluateLounge`（同期の
Rules Provider 判定）を置き換えるものではない。両者は共存し、`evaluateLounge` は
これまでどおり `RULES_PROVIDER` を同期的に呼ぶ。実際の Local Agent（`llama.rn`）を
この bounded protocol へ接続し、`ActiveLounge` の判定操作そのものを非同期化する配線は
別 Issue の Known follow-ups とする。

対象は新規モジュール `src/domain/pet-interaction.ts`（状態機械本体）、
`src/domain/interaction-discovery-provider.ts`（Discovery Provider の Port と Rules 実装）、
`src/domain/shared-clue-match.ts`（Rules Provider と共有する一致判定）、
`src/app/interaction-status-notice.ts`（UI 向けの状態文言）です。Owner Question の
入力 UX そのもの（実際にテキストや選択肢を Owner へ提示する画面）は Issue 11 の対象とし、
本書では型付きの質問・回答契約と `clarifying` 状態の受け入れ・払い出しだけを固める。

## 状態列と Transition 関数

`waiting → discovering → clarifying → bridging | no-signal → retired` を、6 つの
discriminated union（`PetInteractionState`）と、それぞれ 1 つの入力だけを受け付ける
純粋関数で実装する。

| 状態 | 保持する値 | 受け付ける Input | 生成できる Output |
| --- | --- | --- | --- |
| `waiting` | なし。 | `begin`。 | `discovering`。 |
| `discovering` | 開始時刻、45 秒後の締切、Round 番号（1）。 | `discovery-result`、`tick`、`cancel`。 | `clarifying`、`no-signal`（情報不足 / timeout）、`retired`（cancelled）。 |
| `clarifying` | 開始時刻、締切、Round 番号（2）、Owner Question、候補手掛かり。 | `owner-answer`、`tick`、`cancel`。 | `bridging`、`no-signal`（根拠不足 / timeout）、`retired`（cancelled）。 |
| `bridging` | 確定した Bridge。 | `retire`、`cancel`。 | `retired`。 |
| `no-signal` | 理由（情報不足 / 根拠不足 / timeout）。 | `retire`、`cancel`。 | `retired`。 |
| `retired` | 確定した Outcome（`bridge` / `no-signal` / `cancelled`）。 | なし（終端）。 | なし。 |

各 Action の Payload と、対応する状態が受け付ける／受け付けない組み合わせは
`PetInteractionAction`（discriminated union）と `reducePetInteraction` の
exhaustive な switch だけで決まる。個々の遷移（`beginInteraction` /
`receiveDiscoveryResult` / `receiveOwnerAnswer` / `advanceInteraction` /
`cancelInteraction` / `retireInteraction`）はそれぞれ独立した純粋関数として公開し、
`reducePetInteraction` はその薄い composition root に留める。

## Round と 45 秒締切

「最大 45 秒、最大 2 Round」という受け入れ条件を、状態機械の形そのもので満たす。
`discovering`（Round 1）から `clarifying`（Round 2）への遷移は 1 方向にしか存在せず、
`clarifying` から `discovering` へ戻る遷移も、`clarifying` を 2 回経由する遷移も型として
存在しない。Owner Question は「1 人 1 問」であるため、Round 2 を超える追加の質問ラウンドは
構造的に発生しない。

締切は `discovering` へ入った瞬間の壁時計 + 45,000ms として記録し、`clock-guard.ts` の
`hasElapsedTtl`（壁時計と単調増加時計の OR 判定、Lounge 本体・Room と同じ規則）で判定する。
`tick`（Provider の応答を待たずに締切だけを確認する）、または `discovery-result` /
`owner-answer`（締切超過後に届いた遅延応答）のどちらの経路でも、締切超過は必ず
`no-signal`（`reason: 'timeout'`）へ収束する。

## Cancel と遅延 Output の破棄

Lounge の Expire（20 分満了）または Exit（退出・Host 終了）は、bounded protocol から見ると
「まだ結果が確定していない実行中の Provider を打ち切って `retired` にする」という 1 つの
Action（`cancel`、`reason: 'lounge-expired' | 'lounge-exit'`）として表現する。
`cancelInteraction` はどのフェーズからも呼べるが、「最も早い Event が理由を決める」原則を
`bridging` / `no-signal` にも適用する。すでに `bridging` または `no-signal` として
Bridge / no-signal が確定していれば、Cancel はその確定結果を上書きせず、
`retireInteraction` と同じ結果のまま `retired` にする（Provider がまだ何も確定していない
`waiting` / `discovering` / `clarifying` のときだけ `cancelled` として確定する）。
すでに `retired` であれば、その終了理由をそのまま保持する。

Cancel 後に Provider から遅れて届く `discovery-result` や、Owner から遅れて届く
`owner-answer` は、`receiveDiscoveryResult` / `receiveOwnerAnswer` が
「現在のフェーズが `discovering` / `clarifying` と一致するときだけ適用する」ことで
自動的に破棄する。両関数は `{ state, applied }` を返し、`applied: false` が
「新規 Output を破棄した」ことを明示する。無言で握り潰すのではなく、呼び出し側が
「この Output は反映されなかった」と観測できる形にした。

## Evidence 昇格の一方向性

未確認の候補手掛かりを Bridge Evidence へ昇格できるのは `buildConsentedEvidence`
だけであり、これは Owner の回答が厳密に `'yes'`（`match-evidence.ts` の
`OwnerAnswerValue`）のときにしか `MatchEvidence` を組み立てない。`'no'` や
`'decline'` を渡すと `PetInteractionError`（`code: 'INVALID_TRANSITION'`）を投げる。
`receiveOwnerAnswer` はこの関数だけを Bridge 昇格の唯一の経路として使うため、
`clarifying` を経由しない限り `MatchEvidence` を作る手段が存在しない。

## Discovery Provider（Rules 実装）

`interaction-discovery-provider.ts` は `InteractionDiscoveryProvider`
（`kind: 'rules' | 'local-agent'`、`discover()` は同期または非同期）という Port と、
その Rules 実装 `RULES_INTERACTION_PROVIDER` を持つ。一致判定は Rules Provider
（`rules-provider.ts`）と同じ「カタログ順で最初に一致する確認済み手掛かり」であり、
両者は `shared-clue-match.ts` の `findFirstSharedConfirmedClue` を共有する
（判定ロジックの重複を避ける）。Rules 実装は同期的に確定するため、より狭い
`RulesInteractionDiscoveryProvider` 型（`discover()` が `Promise` を含まない）で公開し、
呼び出し側が毎回 `await` する必要をなくす。Local Agent 版の実装（`llama.rn` を使う
非同期 `discover()`）は本 Issue の対象外とし、Port だけを用意して次の Issue へ引き継ぐ。

## UI: 状態文言だけを表示する

`src/app/interaction-status-notice.ts` の `interactionStatusNotice(phase)` は、
6 つのフェーズそれぞれに対応する固定文言（「手掛かりを探しています」「Owner に
確認しています」等)を返すだけの純粋関数であり、Chain of Thought、Raw Prompt、
候補手掛かりの内容、Evidence の中身を一切含まない。`ActiveLoungeScreen.tsx` は
`interactionStatusNotice('discovering')` を呼び出し、Rules Provider 判定前の
Active Lounge が bounded protocol でいう `discovering` フェーズに常に対応する固定の
説明文を 1 行だけ追加する。既存の画面遷移・操作導線・スタイル構成は変更しない
（`docs/design/qr-invite-and-ready-flow.md` や `lounge-lifecycle.md` が確立した
「既存 Screen を配線として使い、状態機械を重複実装しない」方針を踏襲する）。

この画面はまだ実際に稼働する `PetInteractionState` セッションを保持しない
（`pet-interaction.ts` は `evaluateLounge` へまだ配線されていない、前述の
Known follow-ups 参照）。そのため、この 1 行は特定のセッションを逐次追跡する live な
readout ではなく、常に `discovering` を渡す固定の説明文です。逐次更新される値である
かのように読める `accessibilityLabel`（例:「現在の状態」を名乗るラベル）は付けず、
このことを `src/screens/active-lounge-interaction-status.test.ts` で固定した。

## 代替案

### Local Agent の非同期判定を `evaluateLounge` へ直接組み込む案

`ActiveLounge` の `evaluateLounge` 自体を非同期化し、`clarifying` をその内部状態として
持たせる案も検討した。しかし `evaluateLounge` は Issue 4 / 8 / 9 を通じて 100％ カバレッジで
固定された同期契約であり、`PassportApp.tsx` の `reduceLounge`/`evaluate()` 呼び出し規約も
同期を前提にしている。この Issue の本来の目的（bounded protocol の状態機械そのものを
実装し、Timeout / Cancel / Evidence 昇格の規律を固定すること）に対して、既存の
100％ カバレッジ済み契約を破壊的に書き換える手間が不釣り合いに大きいため見送った。
bounded protocol を独立したモジュールとして実装し、`evaluateLounge` への実配線
（Local Agent が実際に `ActiveLounge` の判定を担う経路）は Known follow-ups とする。

### `clarifying` を経ずに Discovery Provider が直接 Bridge を返せるようにする案

Rules Provider（`rules-provider.ts`）は実際にこの経路（共通手掛かりがあれば即座に
Bridge を返す）を採用しているが、これは「Owner の Passport 掲載時点の同意」だけを
根拠にした、より単純な決定的判定です。bounded protocol は Local Agent が候補を
見つけた場合に「その手掛かりを **今回の Lounge で** 使ってよいか」という追加の同意を
Owner Question として挟む設計を意図的に採用した（受け入れ条件 3「未確認情報を Fact として
Bridge Evidence へ昇格させられない」）。Discovery Provider が候補を返した時点では
`MatchEvidence` の `ownerAnswer` がまだ存在しないため、明示的な `clarifying` を経ない
限り Bridge Evidence を作れない状態を型でも強制する。

### Provider 呼び出しの Retry を Round 2 の中に持たせる案

Round 2（`clarifying`）で Discovery Provider を再度呼び直し、Owner の回答を追加根拠として
Local Agent に再評価させる案も検討した。実際の Local Agent 実装（`llama.rn` 接続）が
まだ存在しない段階でこの再評価ロジックを設計すると、実装できない振る舞いを仕様として
固定してしまう。「Owner Question は 1 人 1 問」という受け入れ条件は、`clarifying` が
Owner の生の回答（`'yes' | 'no' | 'decline'`）を受け取って純粋に確定させるだけで
十分に満たせるため、今回は Provider を再呼び出ししない、より単純な設計を採用した。

## エッジケース

- 共有する確認済み手掛かりが 1 件もなければ、`clarifying` を経由せず `discovering` から
  直接 `no-signal`（`reason: 'insufficient-information'`）になる。
- 候補が見つかっても Owner が `'no'` または `'decline'` と答えると
  `no-signal`（`reason: 'insufficient-evidence'`）になり、候補手掛かりは
  Bridge Evidence へ昇格しない。
- 45 秒の締切は `discovering` / `clarifying` のどちらでも有効であり、Provider や Owner の
  応答が締切後に届いても `no-signal`（`reason: 'timeout'`）を優先する。
- Cancel（Lounge Expire / Exit）はどのフェーズからも直ちに `retired` へ収束し、すでに
  `retired` であれば最初の終了理由を保つ。Cancel 後に届く Output は破棄され、新しい
  `retired` を上書きしない。
- `waiting` 以外から `begin` する、`bridging` / `no-signal` 以外から `retire` する等の
  Schema で許可されない遷移は `PetInteractionError`（`code: 'INVALID_TRANSITION'`）を
  投げる。すでに `retired` な状態への `retire` は同じ結果を返す冪等な no-op とする。
- `waiting` / `retired` などフェーズが一致しない状態で `discovery-result` /
  `owner-answer` を受け取っても、状態を変えずに `applied: false` を返す（破棄）。

## 人間検証

実際の Local Agent（`llama.rn`）による非同期 `discover()` の実機動作、45 秒締切に対する
実機の応答速度は、Local Agent が接続される後続 Issue でまとめて人間検証する。機械テストは、
本書の状態機械（正常系、情報不足、根拠不足、Provider Timeout、Cancel、Invalid Transition、
決定性）と、UI 状態文言が内部推論を含まないことを対象にする。

## Known follow-ups

- 実際の Local Agent（`llama.rn`）を `InteractionDiscoveryProvider`（`kind: 'local-agent'`）。
  として実装し、`createLazyLocalAgent` と同じ遅延 loader 境界に接続する。
- この bounded protocol を `ActiveLounge` / `evaluateLounge` の実判定経路へ接続し、
  `PassportApp.tsx` から実際に `discovering` → `clarifying` → `bridging` / `no-signal`
  の非同期遷移を駆動する（Issue 11 の Owner Question UI が前提）。
- `clarifying` の Owner Question を実際に Owner へ提示する UI（質問文、Yes / No / Decline
  の入力操作、締切のカウントダウン表示）は Issue 11 で実装する。

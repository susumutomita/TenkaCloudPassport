# 20 分 Lounge の状態機械・退出・完全破棄の設計

本書は Issue 9 の、Lounge を「使い捨て」と言える削除動作まで含めて実装する設計を定める。
用語は [用語集](../product/glossary.md)、保持契約は
[Privacy 保持ポリシー](../privacy/retention-policy.md)、Issue 4 由来の Lounge 状態機械は
[初回 Encounter の設計](./initial-encounter.md)、Issue 8 由来の Room（Ready gating）は
[QR 招待・共有確認・Ready フローの設計](./qr-invite-and-ready-flow.md) を正本とする。本書は
これらを **拡張** する差分であり、既存の状態機械を重複実装しない。

## 目的と対象範囲

終了、退出、期限切れ、Application Background、再起動を同じ Domain State Machine で扱い、
Host 終了・個人退出・20 分満了のうち最も早い Event で Lounge Data を破棄する。全主要画面から
2 操作以内に「退出して忘れる」を実行でき、終了後は「この Lounge のデータを端末から破棄した」と
表示する。満了 1 分前には内容を含まない通知を表示し、期限切れ後は Agent 推論・質問・Bridge・
Peer Send を新規開始しない。

対象は `src/domain/lounge.ts`（Active Lounge 以降）と `src/domain/lounge-room.ts`（Room、
waiting / ready 段階）、およびそれらを呼ぶ `src/app/PassportApp.tsx` の配線とする。実カメラ
Transport、複数デバイス間同期、N 者間 Bridge は対象外のまま据え置く（Issue 8 の Known
follow-ups を維持）。

## Issue 9 の状態列と実装への対応

Issue 9 は状態列を `waiting → ready → discovering → clarifying → bridging | no-signal →
retired → expired` と表現する。実装は Issue 4 / 8 で確定した型をそのまま使い、次のとおり
対応させる。

| Issue 9 の状態名 | 実装上の表現 | 備考 |
| --- | --- | --- |
| `waiting` | `FormingLoungeRoom`（`lounge-room.ts`） | 参加者 0〜2 名、双方 Ready 前。 |
| `ready` | `ReadyLoungeRoom` | 定員 2 名かつ双方 Ready の瞬間だけ通過する。`startLoungeFromRoom` で即座に `ActiveLounge` へ移行し、この状態機械からは離れる（Issue 8 で確定済み）。 |
| `discovering` | `ActiveLounge`（判定前） | Rules Provider を呼ぶ前の状態。 |
| `clarifying` | 実装未到達（下記参照） | Rules Provider は同期的に確定するため、この Issue の範囲では観測可能な独立状態を持たない。 |
| `bridging` / `no-signal` | `RetiredLounge.outcome.kind`（`'bridge'` \| `'no-signal'`） | 連続する別状態ではなく、`retired` が保持する結果の種別として表現する。 |
| `retired` | `RetiredLounge` | 判定結果確定直後の終端に近い状態。Bridge の表示切替、結果終了、退出、Host 終了、期限確認だけを許可する。 |
| `expired` | `DestroyedLounge`（`reason: 'expired'`） | Room 段階・Lounge 段階のどちらの満了も同じ型へ収束させる（後述）。 |

### `clarifying` が実装で独立した状態を持たない理由

`EncounterDecisionProvider.decide()`（`src/domain/rules-provider.ts`）は同期関数であり、
Rules Provider は呼び出しの中で確定的に `bridge` か `no-signal` を返す。Owner Question
（`src/domain/owner-question.ts`）は将来 Local Agent が非同期に確認を挟む拡張点として型だけ
存在するが、この Issue の Rules Provider 経路では一度も呼ばれない。「discovering の次に
clarifying を経て bridging/no-signal へ至る」という概念上の遷移は、`evaluateLounge` 1 回の
呼び出しの中で不可分に発生する。存在しない非同期の待機状態を UI 上にでっち上げることは
`INVARIANT_NO_MVP_PLACEHOLDER` の精神（作業中マーカー・未実装の作り込みを残さない）に反する
ため、`clarifying` は概念のマッピング表にだけ記載し、独立した型やテスト対象の状態にはしない。
Local Agent を Lounge 判定へ接続する将来 Issue で、`decide()` が非同期化された時点で
再検討する（Known follow-ups）。

**追記（Issue 10）**: `evaluateLounge` の同期契約は本書の記述のまま変わらない。一方で
Issue 10 は、Active Lounge の中で 1 回の Encounter がどう決着するかを表す別モジュール
（`src/domain/pet-interaction.ts`）として `clarifying` を独立した観測可能な状態で実装した。
詳細は
[Pet の短時間・制限付き交流 State Machine の設計](./pet-interaction-protocol.md) を
参照する。

## Terminal Event を Room 段階にも拡張する

Issue 8 まで、`leaveLounge` / `endHostedLounge`（`lounge.ts`）は `ActiveLounge` /
`RetiredLounge` に割り込む個人退出・Host 終了を実装済みだったが、Room（`forming` /
`ready`）にはそれに相当する **Domain 関数が存在せず**、`PassportApp.tsx` が
`setLoungeRoom(null)` を直接呼んで状態を消す実装になっていた。これには 2 つの実害があった。

1. Room 段階での退出・Host 終了・20 分満了が `DestroyedLounge` を経由しないため、
  「この Lounge のデータを端末から破棄した」画面を一度も表示できなかった。
2. Room の 20 分満了は `advanceLoungeRoom` が `ExpiredLoungeRoom` を返すだけで、
   `PassportApp` 側にそれを検出して遷移する処理がなく、`invite` /
   `hostParticipantId` が `null` になるという `HostInviteScreen` の表示条件に埋もれて
   画面が `PassportCreationScreen`（Step 1）へ無言で戻る経路になっていた。

この Issue で `src/domain/lounge-room.ts` に `destroyLoungeRoom(state, reason)` を追加する。
`reason` は `'owner-exit' | 'host-ended'` の 2 値で、`lounge.ts` の
`LoungeDestructionReason` が定義する `DestroyedLounge` をそのまま返す。Room 側に新しい終端型を
作らず、Lounge 本体の終端型へ収束させることで、Room 段階の終了も Active Lounge 以降の終了も
同じ `DestroyedLoungeScreen` を共有する（「同じ Domain State Machine で扱う」という受け入れ
条件を、型の共有によって満たす）。

```ts
export type LoungeRoomTerminationReason = 'owner-exit' | 'host-ended';

export function destroyLoungeRoom(
  state: LoungeRoomState,
  reason: LoungeRoomTerminationReason
): DestroyedLounge {
  if (state.status === 'expired') {
    return { status: 'destroyed', reason: 'expired' };
  }
  return { status: 'destroyed', reason };
}
```

Room がすでに 20 分満了で `expired` になっていた場合、後から届く個人退出・Host 終了より
満了を優先する。これは「最も早い Event が終了理由を決める」という Privacy 保持ポリシーの
原則をそのまま反映する。

## `PassportApp.tsx` の配線

### Room 満了の検出（tick / resume ハンドラの中で即座に破棄する）

Room の 1 秒 tick（既存の `useEffect`）が `advanceLoungeRoom` で `expired` を返しても、
そのまま state へ保持するだけでは上記の実害が残る。当初、`loungeRoom?.status ===
'expired'` を監視する別の `useEffect` を追加して検出する 2 段構えを実装したが、
これは「`loungeRoom` が `expired` を保持する render」と「`lounge` へ `destroyed` を
設定する render」の間に 1 render の隙間を作ってしまう。その隙間では `invite` /
`hostParticipantId`（どちらも `loungeRoom.status !== 'expired'` を要求する
`useMemo`）が `null` になり、`HostInviteScreen` の表示条件が崩れて
`PassportCreationScreen`（Step 1）へ一瞬フォールバックする、まさに直したかった回帰と
同じ形の問題を作り直してしまうことがレビューで判明した。

最終実装では `applyRoomAdvance(current, clock)` という 1 つの関数へ集約し、Room の
tick effect と Background 復帰（`app-resumed`）ハンドラの両方がこの関数だけを呼ぶ。
`advanceLoungeRoom` の結果が `expired` なら、同じ関数の中で
`discardInviteFlow()` と `setLounge({ status: 'destroyed', reason: 'expired' })` を
同期的に呼ぶ。React 19 の automatic batching により、`loungeRoom` を `null` にする
更新と `lounge` を `destroyed` にする更新が同じ commit にまとまるため、`loungeRoom` が
`'expired'` という値を一度も観測可能な state として持たず、中間 render を経由せず
`DestroyedLoungeScreen` へ直接遷移する。

### 個人退出・Host 終了

- `HostInviteScreen` の「Lounge をキャンセルする」操作（`cancelInvite`）は、Host が
  明示的に Lounge を終了する意思表示のため、`endInvite('host-ended')` を経由して
  `destroyLoungeRoom` を呼び、`DestroyedLoungeScreen` へ遷移する。これは Active Lounge
  以降の「退出して破棄」「Host として終了」ボタンと同じ 1 タップ・同じ着地画面にすることで、
  全 Lounge 段階で挙動を統一する。
- `QrScanScreen` の「Passport の編集へ戻る」操作（`editLocalProfile`）は、Room に
  参加者データがあっても Room データを破棄したうえで直接 Profile 編集画面へ 1 タップで
  戻す（既存の UX を保つ）。フルスクリーンの `DestroyedLoungeScreen` を挟むと
 「Profile を編集したいだけ」の利用者に 1 手余分な確認画面を強制するため、代わりに
  `ProfileNotice` の新しい `'lounge-discarded'` kind を使い、Profile 画面へ着地した直後に
「この Lounge のデータを端末から破棄しました」という Notice を表示する。破棄という
  事実の通知と、次にしたい操作への最短導線を両立させる設計判断である（詳細は後述の代替案）。

### `discardInviteFlow` が破棄する範囲（相手の宣言内容を含める）

`discardInviteFlow()` は Room（`loungeRoom`）、Guest 用の共有内容（`guestProfile` /
`guestShareSelection`）、既読 QR 集合（`seenRawPayloads`）に加えて、
`encounteredPetName` / `encounteredPetEmoji` / `encounteredSelection` /
`encounteredConfirmed` も初期値へ戻す。これらは対面の相手が今回の Lounge で declare した
内容そのものであり、`guestProfile` を組み立てる元データでもある。レビューで、この 4 つの
state を破棄対象に含めていないと、`'lounge-discarded'` Notice が案内する「参加者、
共有内容、Invite QR は残っていません」という文言が事実と矛盾する回帰を指摘された。
QR Scan 画面から Passport 編集へ戻り、Local Profile を保存し直して再び Encounter 画面へ
進んでも、前回 Lounge の相手の宣言内容が残らないことを
`src/app/passport-app-stage-flow.test.ts` で固定する。

### Background / Foreground 復帰（`app-resumed`）

`react-native` の `AppState`（`OutcomeScreen.tsx` の Bridge mask 実装がすでに使っている
API）を `PassportApp.tsx` にも配線し、`nextState === 'active'` になった瞬間に壁時計を
読み直して Room / Lounge 双方の期限を再評価する。Lounge 側は `lounge-reducer.ts` に
`'app-resumed'` という新しい Action を追加し、`'clock-tick'` と全く同じ
`advanceLounge` 呼び出しへ委譲する。

```ts
case 'clock-tick':
case 'app-resumed':
  return advanceLounge(state, action.clock);
```

既存の `hasElapsedTtl`（`clock-guard.ts`）は「壁時計が期限へ達しているか、単調増加時計が
20 分経過しているかの OR」で判定するため、端末が Suspend している間に単調増加時計が
ほとんど進まなくても、壁時計が現実の経過時間どおりに進んでいれば正しく期限切れを検出する。
`app-resumed` は既存ロジックを変えず、「Background から戻った直後に、1 秒 tick を待たず
即座に再評価する」という明示的なタイミングを追加するにとどめる。これにより、1 秒 tick の
`setInterval` がバックグラウンド中に間引かれる実行環境でも、Foreground 復帰直後に期限切れが
検出される。

## 満了 1 分前の content-free 通知

`src/app/expiry-notice.ts` に `expiryNotice(remainingMs): { level, message }` という
純粋関数を追加する。残り時間が `EXPIRY_WARNING_THRESHOLD_MS`（60,000ms）以下になった瞬間から
`level: 'warning'` を返し、Bridge・相手の手掛かり・判定結果など Lounge 由来の内容を一切
含まない固定文言だけを返す。Room（`HostInviteScreen`）、Active Lounge
（`ActiveLoungeScreen`）、Retired（`OutcomeScreen`）の 3 画面が同じ関数を呼ぶことで、
waiting / discovering / retired のどの段階でも同じ基準で警告する。

## 全主要画面 2 操作以内の「退出して忘れる」監査

| 画面 | 対応する Lounge 段階 | 退出して忘れる操作 | 操作数 |
| --- | --- | --- | --- |
| `HostInviteScreen` | waiting / ready | 「Lounge をキャンセルする」 | 1 |
| `QrScanScreen` | waiting | 「Passport の編集へ戻る」 | 1 |
| Guest の共有 Preview（`SharePreviewGate`） | waiting | 「戻る」→ Host Invite の「キャンセル」 | 2 |
| `ActiveLoungeScreen` | discovering | 「退出して破棄」/「Host として終了」 | 1 |
| `OutcomeScreen` | retired | 「退出して破棄」/「Host として終了」/「結果を閉じて破棄」 | 1 |

Owner 自身の共有 Preview（`share-preview`）と `EncounterSetupScreen` は Room 作成前
（`hostLounge()` 呼び出し前）の段階であり、破棄すべき Lounge Data がまだ存在しないため、
この監査の対象外とする。

## Storage Privacy Regression Test

`src/app/lounge-privacy-regression.test.ts` が、Room の forming から Bridge 確定・
`completeLounge` による完全破棄までのフル行程を、実際に `PassportApp` が呼ぶのと同じ
Use Case 関数の並びで実行したうえで、実 Storage adapter（`WebLocalProfileStorageAdapter` /
`ExpoFileSystemLocalProfileStorageAdapter`、いずれも実ファイル I/O、No Mock）へ書き込まれた
**全キー** を列挙する。

- Web 相当（`FileBackedWebStorage`）は保存先ディレクトリを `readdirSync` 相当で列挙し、
  `LOCAL_PROFILE_STORAGE_KEY` 以外のキーが増えていないことを確認する。
- Native 相当（`ExpoFileSystemLocalProfileStorageAdapter`）は保存先ディレクトリに
  Local Profile 用の 1 ファイルしか存在しないことを確認する。
- 保存された JSON の最上位 key が `LocalPrivateProfile` の allowlist と一致すること、
  および `loungeId` / `outcome` / `messageKey` / `evidence` などの Lounge 由来語彙を
  生文字列として一切含まないことを確認する。

`src/app/local-profile-storage.test.ts` と重複していた実ファイル I/O ヘルパー
（`FileBackedWebStorage` / `BunProfileDocument` / 一時ディレクトリ管理）は
`src/app/storage-test-kit.ts` へ集約し、既存テストと新しい Privacy Regression Test の
両方がそこから import する（`src/screens/accessibility-test-kit.ts` と同じ集約方針）。

## 代替案

### throw-style の型付き Error を Result 型（return-not-throw）へ全面書き換える案

既存の `LoungeTransitionError` / `LoungeRoomError` は例外を `throw` する設計であり、
純粋関数として状態を変更しない点は変わらない。全面的に「返り値としての型付き Error」へ
書き換える案は、新規に追加するロジックだけを見れば一貫性が高まる。一方で Issue 4 / 8 で
100％ カバレッジ済みの数十件のテストと、それらに依存する `PassportApp.tsx` の
try/catch ベースの呼び出し規約すべてを書き換える必要がある。状態機械の欠落箇所を埋め、
退出と完全破棄を保証するというこの Issue の本来の目的に対して不釣り合いに大きい変更に
なるため採用しない。新規に追加する `destroyLoungeRoom` は無効な遷移を持たない
（どんな Room 状態を渡しても必ず成功する）ため、そもそも Result 型にする対象がない。
将来 Invalid Transition を伴う新しい Domain 関数を追加する際に、throw-style と
return-style のどちらを採用するかは改めて ADR で判断する。

### `cancelInvite` も `editLocalProfile` と同様に軽量 Notice へ統一する案

一貫性は高まるが、「Lounge をキャンセルする」は Host が明示的に Lounge を終わらせる意思を
持つ操作であり、Active Lounge 以降の「退出して破棄」「Host として終了」と同じ重みを持つ。
軽量 Notice に格下げすると、他の終了操作との一貫性がむしろ崩れる。今回は Room 段階の
「終わらせる」操作は `DestroyedLoungeScreen` へ、「まだ終わらせるつもりはなく別画面へ
移動するだけ」の操作は軽量 Notice へ、という使い分けを採用する。

### Room の `'expired'` 型を `HostInviteScreen` の props から削除する案

Room の 20 分満了を `PassportApp` 側で確実に検出して `DestroyedLounge` へ変換する
（本書の対応）ことで、`HostInviteScreen` が `'expired'` な Room を受け取ることは実行時に
起こらなくなる。この事実を型でも保証するために `HostInviteScreen` の `room` prop を
`FormingLoungeRoom | ReadyLoungeRoom` へ狭める案も検討したが、`markParticipantReady`
（`lounge-room.ts`）の型注釈を合わせて narrowing する追加変更を要する。既存の防御的な
`isExpired` 分岐は到達しなくなるだけで実害はないため、この Issue の diff を状態機械と
退出・完全破棄の欠落箇所に絞り、型の狭小化は見送って Known follow-ups とする。

## エッジケース

- **0 秒**: Room 作成直後（0 秒経過）の期限確認は `forming` を変更しない
 （`lounge-room.test.ts` の新規テスト）。
- **期限境界**: 壁時計がちょうど 20 分後に達した瞬間に Room / Lounge のどちらも完全破棄する
 （既存テストに加え、`app-resumed` 経由の境界テストを追加）。
- **連続する終了 Event**: Room の `destroyLoungeRoom` が返す `DestroyedLounge` に対して
  `lounge.ts` の `endHostedLounge` / `leaveLounge` を重ねて呼んでも、最初の終了理由を
  維持する（`lounge-room.test.ts` の新規テスト）。
- **二重退出**: 同じ個人退出 Event が重ねて届いても終端状態は変わらない
 （既存の `lounge.test.ts` の冪等性テストと同じ契約を Room 側にも適用）。
- **Clock Change**: 端末の Suspend で単調増加時計がほぼ進まず、壁時計だけが 20 分先へ
  進んだ場合も、`app-resumed` イベントは停止時間を延長扱いにせず完全破棄する
 （`lounge-reducer.test.ts` の新規テスト）。

## 人間検証

対面会場での実機 Background / Foreground 遷移（OS のプロセス凍結タイミング、
`AppState` イベントの発火遅延）は人間検証に委ねる。機械テストは、Room / Lounge の
Terminal Event、境界値、Privacy Regression、`expiry-notice` の純粋ロジックを対象にする。

## Known follow-ups

- `HostInviteScreen` の `room` prop を `FormingLoungeRoom | ReadyLoungeRoom` へ型で
  狭小化する（`markParticipantReady` の返り値型の narrowing を伴う）。
- Issue 10 で `src/domain/pet-interaction.ts` を追加し、`clarifying` を独立した
  観測可能な状態として実装した。詳細は
  [Pet の短時間・制限付き交流 State Machine の設計](./pet-interaction-protocol.md) を
  参照する。ただしこれは Active Lounge の中の 1 回の Encounter を表す別モジュールであり、
  `evaluateLounge`（本書が扱う同期の Rules Provider 判定）はまだこの bounded protocol を
  経由しない。Local Agent を Lounge の実判定経路へ接続する配線は、その設計書の
  Known follow-ups に引き継いだ。

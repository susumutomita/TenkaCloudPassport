# 個人追跡なしの実地評価設計

Issue 26 のアプリ内計測境界を定義する。成功指標の意味は
[成功指標](../product/success-metrics.md)、データ分類は
[Privacy データ台帳](../privacy/data-inventory.md)、判断理由は
[ADR-0021](../adr/0021-memory-only-pilot-aggregate.md) を正本とする。

## 目的と非目標

目的は、人間の口頭会話開始を、Lounge の進行状態と任意 Self-report の固定 Counter で評価することである。
個人、端末、Lounge、地域、Facilitator の比較、会話の長さや内容の評価、継続利用分析は行わない。
Bridge 表示率と `no-signal` の低さを成功指標にしない。

## 比較した設計

| 案 | 利点 | 棄却理由 |
| --- | --- | --- |
| Analytics SDK と中央 Event Collector | 複数端末の統合が容易である。 | 自動送信、安定追跡、Endpoint、第三者依存を増やす。 |
| 識別子なしの端末内 Event Log | 後から指標を再計算できる。 | 正確な順序と時刻を残し、個別参加を復元できる。 |
| Process 内の固定 Counter | 個別 Event を復元できず、共有を手動に閉じられる。 | Process 終了で失われるが、Pilot の Privacy を優先して採用する。 |

## Data Flow

1. Process 起動時の Research Counter は OFF である。Facilitator が別 Research Consent を確認した
   Session だけ Settings から ON にする。OFF の Product Event は数えない。
2. Host が Lounge Start を明示し、現在世代の Handshake が成立した後だけ `started` を 1 増やし、未完了
   Session を Memory に 1 件だけ持つ。Handshake の失敗と破棄済み世代は数えない。
3. 全参加者が Ready になったとき `ready` を 1 増やし、その時点の単調増加時計を一時的に保持する。
4. Outcome 確定時に Bridge / `no-signal` と実行 Provider を Counter へ加算する。
5. Bridge の場合だけ Ready との差を `under-30-seconds`、`30-to-89-seconds`、
   `90-to-179-seconds`、`180-seconds-or-more` のどれかへ加算し、元の差を捨てる。
6. Lounge 本文を `completed` として破棄した後、Bridge 対象者へ任意 Self-report を 1 回だけ表示する。
7. Facilitator が Settings から Pilot Measurement を開く。Outcome 確定 5 件以上の場合だけ固定 JSON の
   Preview を生成し、明示 Share 操作で OS Share Sheet へ渡す。共有または保存の成立後は Preview を消費し、
   Share Sheet の取消または失敗時だけ同じ Preview の再試行を許可する。
8. Share の成否、保存先、共有先、時刻をアプリへ保存しない。自動送信、Background retry は行わない。

Pilot Measurement Controller は Profile Storage、Backup、Diagnostic Report、Lounge State の所有者ではない。
React Composition Root が明示 Event を渡すだけであり、Store から Domain 内容を読めない。正確な
monotonic 値は未完了 Session の duration 計算だけに使い、JSON と Preview Item へ投影しない。

## State と冪等性

Store の未完了状態は `none`、`started`、`ready`、`awaiting-self-report` の 4 つである。新しい Start は
以前の未完了状態を成功と推測せず破棄し、新しい `started` だけを作る。順序外 Ready、二重 Outcome、
二重 Self-report は no-op とする。退出、Host 終了、期限切れ、Self-report Skip は未完了状態だけを破棄し、
すでに加算した Start / Ready / Outcome Counter を巻き戻さない。

Research Counter を OFF にすると未完了状態を破棄する。その後の Product Event は Counter を変更せず、
Self-report 画面も表示しない。再度 ON にした後の新しい Start からだけ測定を始め、途中 Session の Ready や
Outcome を補完しない。

Bridge Outcome が確定すると `eligible` を 1 増やす。「会話が始まった」と「まだ」だけを有効回答とし、
「回答しない」は明示拒否として数えるが成功率の分母へ含めない。画面を閉じた未回答は
`eligible - startedConversation - notYet - preferNotToAnswer` からだけ求め、回答したと推測しない。

## Event Aggregate Schema

[Event Aggregate JSON Schema](../research/event-aggregate.schema.json) は次の固定 field だけを許可する。

- `aggregateSchemaVersion` と `minimumAggregationUnit`。
- `startReady.started` / `startReady.ready`。
- `readyToBridgeDurationBuckets` の 4 Bucket。
- `outcomes.bridge` / `outcomes.noSignal`。
- `providerRuns.rules` / `providerRuns.localLlm` / `providerRuns.fallback`。
- `conversationStartSelfReport.eligible` / `startedConversation` / `notYet` / `preferNotToAnswer`。

全値は非負の安全な整数である。未知 field、正確な時刻、生成時刻、ID、氏名、場所、Passport、Bridge、
Prompt、Output、会話内容、Network metadata を拒否する。Schema の `minimumAggregationUnit` は 5 に固定し、
`bridge + noSignal >= 5` を満たさなければ Preview と JSON を生成しない。この Gate は同じ会場内の
知識との組合せによる推測を完全には防がないため、Aggregate を公開 Dataset や地域 Ranking にしない。

## UI 状態

Self-report 画面は JA / EN で、質問、任意であること、保存内容、3 回答、回答せず終了を同じ画面に出す。
どの操作も Lounge の再判定、追加質問、内容保存を行わず Destroyed 画面へ進む。Owner Exit と Host End は
Self-report を挟まず即時終了する。

Pilot Measurement 画面は次を区別する。

- Research OFF / ON: 既定 OFF とし、Research Consent 確認後の明示操作だけで ON にする。
- 5 Outcome 未満: JSON を作らず、必要な最低単位と Process 終了で消えることを表示する。
- Preview 可能: 全 field と JSON を表示するが、まだ共有しない。
- Sharing: 二重 Share を無効化する。
- Shared / saved: Preview を消費して同じ JSON の再共有を閉じ、内容を含まない固定文言を表示する。
- Dismissed / error: Preview を保持して再試行を許可し、内容を Error へ反射せず固定文言を表示する。

## Facilitator Observation

Setup / Support 時間と Privacy / Safety Incident はアプリが推測できないため、
[Observation Sheet](../research/observation-sheet.md) で取得する。時間は粗い Bucket、Incident は件数と
即時停止 Check だけにし、参加者名、場所、時刻、会話内容、Passport 内容を書かない。Incident の原因調査が
必要な場合も、この Sheet に内容を書かず、別の Security Process で本人同意とアクセス制御を設計する。

## Edge Cases

- Process 終了は Aggregate と未回答を失う。復元や自動 Upload を試みない。
- Counter が Schema の 1,000,000 件上限へ達した後は Product Flow を止めず、Research Counter だけを
  OFF にして Aggregate を上限内に保つ。
- Clock が有限値でない、または Ready より小さい場合は Outcome Counter を加算せず固定 Error とする。
- `no-signal` は duration Bucket と Self-report の対象にしないが、失敗とも成功とも自動判定しない。
- Local LLM が Rules へ切り替わった Outcome は Local LLM と Rules の両方ではなく `fallback` だけを 1 増やす。
- 現在の Live Interaction が Rules Provider だけを使う間は `rules` だけを記録する。Native Provider 接続時は
  確定した `settledBy` を Event として渡し、Runtime 表示状態から推測しない。
- 全 Local Data 削除は Process 内 Aggregate も消す。Passport だけの Reset と Lounge 終了は Pilot 全体の
  Aggregate を消さない。

## Verification

- Store の正常系、順序外、二重 Event、Clock 境界、Process 相当の再生成を日本語 BDD Test で固定する。
- strict parser と Snapshot で field allowlist、5 件 Gate、禁止語彙、未知 field を検証する。
- Pilot Measurement module と dependency manifest に Analytics SDK、`fetch`、`XMLHttpRequest`、
  `WebSocket`、送信 URL がないことを回帰 Test にする。
- Preview 前の Share、5 件未満の Share、共有中と成功後の二重 Share が Port を呼ばないことを検証する。
- 第三者 Dry Run は Test で代替せず、[Pilot Protocol](../research/pilot-protocol.md) の記録を物理 Gate とする。

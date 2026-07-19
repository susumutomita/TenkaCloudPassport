# 対面イベント Service Blueprint

- Research execution: `Not run`
- Blueprint status: `Hypothesis baseline / Not validated`
- Related issue: https://github.com/susumutomita/TenkaCloudPassport/issues/2

本書は [Interview Guide](./interview-guide.md) に従う実調査前の 1 枚の仮説ベースラインです。
現在の Cell は Product Contract、Facilitator Guide、実装された状態遷移から作った調査対象であり、参加者や
Event 主催者の検証済み事実ではない。調査後の優先判断は [Top Five Hypotheses](./hypotheses.md) に反映する。

## One-page journey blueprint

`Participant experience` は表側、`Facilitator work` は現場支援、`On-device processing` は見えない端末内処理、
`Failure and recovery` は安全な停止または回復、`Evidence status` は調査証拠の状態を表す。

| Journey stage | Participant experience | Facilitator work | On-device processing | Failure and recovery | Evidence status |
| --- | --- | --- | --- | --- | --- |
| Arrival | 目的、任意参加、必要端末を理解し、参加・見学・退出を選ぶ。 | 60 秒紹介、Locale、2〜6 名、Host、退出経路を確認する。 | まだ Profile、QR、Lounge Data を作らない。 | 1 名、非対応端末、説明不能は Product を開始せず Walkthrough にする。 | `Untested`。 |
| Passport setup | 端末内 Profile と今回だけの Public Passport を区別し、共有 Field を Preview する。 | 代理入力せず、Product Consent と Research Consent を別に説明する。 | Local Private Profile から選択済み最大 3 Clue だけを Public Passport へ投影する。 | 保存拒否、共有拒否、説明不明は本人を待たせず退出へ進める。 | `Untested`。 |
| Lounge join | Camera と fresh QR を本人が選び、認証後に Ready する。 | Host が Guest ごとに 1 回限り QR を表示し、All-Ready 前に開始しない。 | QR schema、期限、Secret、Fingerprint、Capacity を検証し、Passport 送信前に認証する。 | F1 Network unavailable / F2 QR scan failure は未検証経路や Secret 手入力へ迂回せず停止する。 | `Untested`。 |
| Pet exchange | 端末内 Pet が必要最小限の確認済み手掛かりを交換していると理解する。 | 内容を見ず、待機、Provider、期限の状態だけを案内する。 | 認証済み Transport 上で bounded Message を処理し、外部 Tool や中央推論へ送らない。 | 切断、Timeout、Invalid Peer は bounded fallback または現在 Lounge の終了へ収束する。 | `Untested`。 |
| Owner Question | 本人が質問を読み、回答・拒否・退出を選ぶ。 | 回答を促さず、画面を覗かず、拒否を正常な選択として扱う。 | 同意済み参照だけを現在 Round に使い、回答本文を永続化しない。 | F3 Owner Question declined は再質問や不利益なしで `no-signal` または退出へ進める。 | `Untested`。 |
| Bridge or `no-signal` | 最大 1 Bridge を会話の糸口として受け取るか、正常な `no-signal` を受け取る。 | 人物、相性、結果を評価せず、本人へ次行動を戻す。 | Evidence にない Claim を拒否し、結果後は追加推論せず Pet を `retired` にする。 | F4 `no-signal` は retry、ranking、別人物探索をせず正常終了として扱う。 | `Untested`。 |
| Human conversation | App が退いた後、話す・話さない・去るを本人同士で決める。 | 会話、連絡先、写真を記録せず、任意 Self-report を待つ条件にしない。 | Lounge 本文を破棄した後だけ、同意済み Pilot では内容なし Counter を任意更新する。 | 会話が始まらない場合も結果を修正せず、退出または Event の公開案内だけを選べる。 | `Untested`。 |
| Exit | 理由を言わず終了し、今回の Data が消えたと理解する。 | 個人退出と Host Loss を区別し、旧 QR を次 Group へ持ち越さない。 | Queue、Key、Membership、Passport Snapshot、Answer、Bridge を期限内に破棄し復元しない。 | F5 Early exit / F6 Screen closed はローカル削除を先行し、安全確認できなければ新規 Lounge にする。 | `Untested`。 |

## Failure cards under study

成功経路だけを観察しない。実機で安全に発生させられない状態は [Interview Guide](./interview-guide.md) の
Scenario Card として読み、期待する Stop / Recovery を調べる。

| ID | Scenario | Safe contract | Evidence status |
| --- | --- | --- | --- |
| F1 Network unavailable | Internet または会場 Transport を利用できない。 | 検証済み Offline Transport がなければ `NOT STARTED` とする。 | `Untested`。 |
| F2 QR scan failure | Camera 拒否、不正、使用済み、期限切れ、別 Group である。 | 推測で成功扱いせず、原因に応じて fresh Invite または終了を選ぶ。 | `Untested`。 |
| F3 Owner Question declined | 本人が回答しない。 | 圧力、再質問、内容記録なしで `no-signal` または退出へ進める。 | `Untested`。 |
| F4 `no-signal` | 根拠が足りず Bridge を作らない。 | 人物評価にせず再推論を行わず、正常終了を案内する。 | `Untested`。 |
| F5 Early exit | Guest または Host が途中退出する。 | Guest は本人 Data を破棄、Host は全 Lounge を停止し、理由を尋ねない。 | `Untested`。 |
| F6 Screen closed | App Background、画面終了、Process 終了が起きる。 | 旧 State を復元せず、現在期限で終了または fresh Join を必要とする。 | `Untested`。 |

## Evidence update rule

1. 個別セッションの Record、Locale 名、Role × Locale、正確な人数をこの表へ貼らない。固定 Behavior Code から
   作った Public Aggregate だけを使う。
2. `Observed` は最低 3 セッションで同じ非内容 Pattern が確認され、2 つ以上の Role または Locale Stratum に
   広がる場合だけ付ける。これは一般化や多数派を意味しない。
3. `Contradicted` は 1 件でも Privacy、Consent、退出の仮定に反する事実があれば付け、支持件数で打ち消さない。
   小 Cell の説明は公開せず、独立 Privacy Reviewer の停止判断だけを残す。
4. 観察機会がなかった Cell は実調査終了後に `Not observed`、調査前は `Untested` のままにする。
5. Public Aggregate の要約は 140 文字以内とし、Sensitive Data、回答内容、逐語引用を含めない。
6. Blueprint から生じる設計変更は本書へ実装せず、根拠、反証条件、影響 Stage を添えた別 Issue 候補にする。

## Completion boundary

Participant 4 名以上、Event organizer 4 名以上、2 Locale Cohort 以上の Consent 済み調査と、全 Stage / Failure の
明示的な Evidence Status が揃うまで本 Blueprint は `Hypothesis baseline / Not validated` です。Repository の
文書契約 Test、コード coverage、Facilitator Kit の Dry Run はこの Research execution の代替になりません。

# 個人追跡なし Pilot Protocol

本書は、TenkaCloud Passport が人間同士の口頭会話開始を支えたかを、個人追跡なしで評価する手順である。
指標の意味は [成功指標](../product/success-metrics.md)、アプリ内の集計境界は
[実地評価設計](../design/privacy-preserving-pilot-measurement.md) を正本とする。

## 対象と役割

- Participant は Product を利用するか、Research に参加するかを別々に選ぶ。
- Facilitator は Consent Script を読み、操作を代行せず、Observation Sheet の Tally だけを記録する。
- Aggregate Exporter は最低集計単位を満たした端末だけで Preview を確認し、手動共有する。
- Pilot Owner は Decision Gate と Postmortem を公開し、良い結果だけを選ばない。

Research への拒否は Product 利用、Bridge 表示、退出、次回参加へ影響させない。Product の Passport 公開、
Owner Question、Bridge 表示に必要な同意はアプリ内で別に取得し、Research Consent で代替しない。

## 実施前

1. [日本語 Consent Script](./consent-script.ja.md) または
   [English Consent Script](./consent-script.en.md) を選ぶ。
2. 端末が Offline で中核 Flow を完走でき、Analytics SDK と自動送信がない Build であることを確認する。
3. Observation Sheet に氏名、端末 ID、Lounge ID、場所、正確な時刻、Passport / Bridge / 会話内容を
   書く欄がないことを確認する。
4. Research Consent を参加者ごとに口頭で確認する。回答は参加可否の Tally だけとし、誰がどちらかを残さない。
5. 参加者全員が Research に同意した Session だけ、Settings で Research Counter を ON にする。不参加者が
   いる Session は OFF のまま Product を利用する。次の Session の Consent が変われば開始前に切り替える。
6. Product Consent は実際の共有 Preview で本人が選ぶ。Facilitator が代理で押さない。
7. Pilot 前 Dry Run を、設計または実装を担当していない第三者 1 名が実施する。

## 1 Session の手順

1. Facilitator は Start 操作の説明を始めてからの Setup 時間を、正確な値ではなく Sheet の Bucket へ記録する。
2. Research Counter の ON / OFF が今回の Research Consent と一致することを確認する。
3. Participant が Product Consent を確認し、Start と Ready を自分で操作する。
4. Bridge または `no-signal` が出ても、Facilitator は成功・失敗と評さず、人間が話す機会を妨げない。
5. Bridge を表示した Participant が結果を閉じると、Lounge 内容の破棄後に任意 Self-report が 1 回だけ出る。
6. Participant は「会話が始まった」「まだ」「回答しない」または「回答せず終了」を選べる。回答を促さない。
7. 操作支援が必要だった場合、内容を記録せず Support 時間 Bucket と件数だけを Sheet に加える。
8. Privacy / Safety Incident を認識したら、その場で新規 Session と Aggregate Export を停止する。

## Metric Dictionary

| 指標 | 定義 | 算出式 | 取得時点 | 保存期間 | 誤解しやすい点 |
| --- | --- | --- | --- | --- | --- |
| Start → Ready 完了率 | Start した Session のうち全参加者 Ready に到達した割合である。 | `ready / started`。`started = 0` は算出しない。 | Start と Ready の Domain 遷移時である。 | Counter は Process 終了まで、手動 Export 後は受領者が削除するまでである。 | Product 成功率ではなく Setup / Transport の摩擦を示す。 |
| Ready → Bridge 時間 Bucket | Ready から Bridge 確定までを 4 区分で数えた分布である。 | 各 Bucket / Bridge 件数である。 | Bridge 確定時に単調増加時計の差を即 Bucket 化する。 | 正確な差は保持せず、Counter だけ Process 終了までである。 | 平均時間、会話時間、参加者の速さではない。`no-signal` は分母に入れない。 |
| Bridge / `no-signal` 率 | Outcome 確定の内訳である。 | 各 Outcome / `(bridge + noSignal)` である。 | Participant Outcome 確定時である。 | Counter は Process 終了までである。 | Bridge 率の高さと `no-signal` 率の低さは成功を意味しない。 |
| Provider 件数 | Outcome を確定した Rules、Local LLM、Rules Fallback の排他的件数である。 | 各 Provider / Provider 総数である。 | Provider の確定 `settledBy` を受けた Outcome 時である。 | Counter は Process 終了までである。 | Model 品質や参加者の価値を示さない。Fallback を Rules と二重計上しない。 |
| 会話開始 Self-report | Bridge 対象者の有効回答中、「会話が始まった」の割合である。 | `startedConversation / (startedConversation + notYet)` である。 | 話す機会の後、Lounge 破棄後の任意 1 Tap である。 | Counter は Process 終了までである。 | 未回答と「回答しない」を Yes と推測しない。回答率と eligible を併記する。 |
| Facilitator Setup 時間 | Session 開始説明から参加者が Product 操作を始めるまでの粗い区分である。 | Bucket ごとの Tally である。 | Session ごとに 1 回、Observer が Sheet へ記入する。 | Pilot 中だけ保持し、Postmortem 確定後に原 Sheet を削除する。 | Product 処理時間ではなく、説明と準備の負荷を含む。個人評価に使わない。 |
| Facilitator Support 時間 | Session 中の操作支援に費やした粗い区分である。 | Bucket ごとの Tally と支援 Session 件数である。 | Session 終了時に Observer が Sheet へ記入する。 | Pilot 中だけ保持し、Postmortem 確定後に原 Sheet を削除する。 | Participant の能力を示さない。支援内容や発言を記録しない。 |
| Privacy / Safety Incident | Contract に反する開示、同意逸脱、危険な継続を認識した件数である。 | Privacy と Safety の Tally である。 | 認識した時点で 1 を加え、新規 Session を停止する。 | 件数だけ Postmortem まで、調査内容はこの Protocol の外で管理する。 | 0 件は安全の証明ではない。1 件でも拡大停止である。 |

## 収集と保持

アプリ内 Counter は Process Memory にだけ置き、再起動後に復元しない。Outcome 確定 5 件未満では JSON
Preview を生成しない。5 件以上でも個人推測が不可能になるとは説明しない。共有する場合は全 field を
Preview し、OS Share Sheet の保存先を Facilitator が選ぶ。自動 Upload、Account、Background retry、
受信確認 Beacon は使わない。

Observation Sheet は会場単位の Tally だけを持つ。原 Sheet は Pilot Decision と Postmortem の確定後に
削除し、公開物には最低集計単位以上の Aggregate と Gate 判定だけを残す。個人から撤回依頼があった場合、
まだ Aggregate へ混合していない Observation は除外する。混合後は個人を特定できないため個別除外できない
ことを Consent 前に説明する。

## Pilot 前 Dry Run Gate

設計・実装を担当していない第三者 1 名へ Consent Script と空の Observation Sheet だけを渡す。口頭で
補足せず、次を観察する。

- Research Consent と Product Consent を別に説明できる。
- 禁止情報を書かずに Start / Ready / Outcome / Provider / Self-report を Tally できる。
- Setup / Support を正確な時刻ではなく Bucket に入れられる。
- 未回答者を待たせず終了できる。
- Incident 1 件の想定で新規 Session と Export を止められる。
- 5 Outcome 未満の端末で Export できない理由を説明できる。

Observer は [Observation Sheet](./observation-sheet.md) の Dry Run 欄へ、完了可否と迷った項目の分類だけを
記録する。全項目が補足なしで完了するまで Pilot を始めない。この実在第三者による実施記録は Repository の
Test で代替しない。

## 終了と公開

[Decision Gates](./pilot-decision-gates.md) を先に判定し、成功・失敗のどちらでも
[Postmortem Template](./pilot-postmortem-template.md) を埋める。`no-signal`、未回答、Fallback、途中退出を
除外して見栄えを整えない。Privacy Incident が 1 件でもあれば拡大を停止し、数値改善より先に原因と
再発防止を別の承認済み Process で扱う。

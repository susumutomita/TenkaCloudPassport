# Pilot Decision Gates

Gate は Pilot 開始前に固定し、結果を見てから閾値や分母を変えない。主成功指標は
[成功指標](../product/success-metrics.md) に従い、Bridge 率や `no-signal` の低さへ置き換えない。

## Gate 0: Dry Run

- 設計・実装を担当していない第三者 1 名が Consent Script と Observation Sheet だけで Dry Run を完了する。
- Research / Product Consent の混同、禁止情報の記入、未回答者の待機、Incident 時の継続が 1 件でもあれば
  Pilot を開始せず、文書を改訂して再実施する。

## Gate 1: Privacy / Safety Stop

- Privacy Incident が 1 件以上なら新規 Session、Aggregate Export、Pilot 拡大を停止する。
- Safety Incident が 1 件以上なら同じく停止する。
- 成功率、完了率、参加人数が高くても、この Gate を上書きしない。
- 原因、影響、本人への連絡が必要な場合は、この匿名 Sheet へ内容を追記せず、別の承認済み Incident Process を
  作るまで再開しない。

## Gate 2: Data Integrity

- Outcome 確定 5 件未満の端末 Aggregate は Export しない。
- `ready <= started`、`bridge + noSignal <= ready`、Provider 総数が Outcome 総数と一致する。
- Self-report の 3 回答合計は eligible 以下である。
- Guardrail 違反が 1 件でもあれば成功判定を行わない。
- 欠損、Process 終了で失った Aggregate、Research 不参加を補完または推測しない。

## Gate 3: Interpretation

次をすべて併記する。

- Start → Ready 完了率と分子 / 分母。
- Bridge / `no-signal` の件数。ただし良否を単独で判定しない。
- Ready → Bridge の Bucket 分布。平均や正確な Median に変換しない。
- Rules / Local LLM / Fallback 件数。
- 会話開始 Self-report の Yes / `(Yes + No)`、有効回答数、eligible、回答率。
- Facilitator Setup / Support Bucket と Privacy / Safety Incident 件数。

未回答と「回答しない」を成功率の分母から除くが、eligible と回答率を隠さない。地域、会場、Participant、
Facilitator、端末の Ranking を作らない。

## Gate 4: 次の判断

| 判定 | 条件 | Action |
| --- | --- | --- |
| Stop | Privacy / Safety Incident が 1 件以上、Consent 混同、内容収集、自動送信がある。 | 拡大を止め、Postmortem を公開し、Contract 修復を先に行う。 |
| Revise | Gate 0 は通るが Ready 完了、回答率、Support 負荷に大きな欠損や摩擦がある。 | 成功を主張せず、UI / Kit を修正して同じ Gate で再 Pilot する。 |
| Continue | Gate 0〜3 を満たし、成功指標と回答率を分母付きで解釈できる。 | 小さな次段階だけを承認し、中央追跡や個人評価を追加しない。 |

`Continue` は Product 成功や一般化を意味しない。次段階の人数、地域、配布 Tier を増やす前に、同じ Privacy
Stop Gate と最低集計単位を維持できるか再確認する。

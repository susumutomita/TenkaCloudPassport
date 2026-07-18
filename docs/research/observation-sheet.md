# Pilot Observation Sheet

この Sheet は 1 会場分の Aggregate Tally である。氏名、連絡先、端末 ID、Participant / Lounge ID、場所、
正確な時刻、Passport / Bridge / 会話 / Incident の内容を書かない。個人ごとの行を作らない。

## 実施前 Check

- [ ] Research Consent と Product Consent を別に説明した。
- [ ] Research を拒否しても Product 利用を続けられると説明した。
- [ ] Research 不参加 Session では Counter を OFF のままにした。
- [ ] Self-report は任意で、未回答でも即時終了できると説明した。
- [ ] 5 Outcome 未満では Aggregate Export できず、5 件でも匿名性の保証ではないと説明した。
- [ ] 自動送信、Analytics SDK、安定 ID、内容収集がない Build であることを確認した。

## 会場 Tally

Research Consent は件数だけを記録し、誰の選択かを残さない。

| 項目 | Tally |
| --- | --- |
| Research 参加 |  |
| Research 不参加 |  |
| Product を利用せず終了 |  |

App Event は手動 Observation で個人と照合せず、端末の Event Aggregate Preview から転記する。

| App Event | Count |
| --- | --- |
| Start |  |
| Ready |  |
| Bridge |  |
| `no-signal` |  |
| Rules |  |
| Local LLM |  |
| Fallback |  |
| Ready → Bridge: 30 秒未満 |  |
| Ready → Bridge: 30〜89 秒 |  |
| Ready → Bridge: 90〜179 秒 |  |
| Ready → Bridge: 180 秒以上 |  |
| Self-report eligible |  |
| 会話が始まった |  |
| まだ |  |
| 回答しない |  |
| 未回答 | `eligible - 3 回答の合計` だけで算出する。 |

## Facilitator 時間 Bucket

Stopwatch の正確な値、開始・終了時刻、誰を支援したかを残さない。

| Setup | Tally |
| --- | --- |
| 5 分未満 |  |
| 5〜14 分 |  |
| 15 分以上 |  |

| 1 Session あたりの Support | Tally |
| --- | --- |
| 支援なし |  |
| 1 分未満 |  |
| 1〜4 分 |  |
| 5 分以上 |  |

## Incident Stop Gate

| 項目 | Count |
| --- | --- |
| Privacy Incident |  |
| Safety Incident |  |

- [ ] どちらかが 1 件以上なら、新規 Session を停止した。
- [ ] Aggregate Export を停止した。
- [ ] この Sheet に Incident の内容や人物を書かなかった。
- [ ] 再開可否を Pilot Decision Gate へ渡した。

## 第三者 Dry Run Record

この欄は設計・実装を担当していない第三者が Pilot 前に記入する。氏名は記録せず、実施日も正確な時刻を
含めない年月だけにする。

- 実施月: `YYYY-MM`
- [ ] Script だけで Research / Product Consent を分離できた。
- [ ] 禁止情報なしで全 Tally を記入できた。
- [ ] 未回答の即時終了を扱えた。
- [ ] Incident 想定で Session と Export を停止できた。
- [ ] 5 Outcome 未満の Export 拒否を説明できた。
- 迷った分類（内容を書かず選ぶ）: Consent / Tally / Bucket / Exit / Incident / Export / なし
- Dry Run 判定: Pass / Revise and repeat

`Pass` でない場合は文書を改訂し、別の空 Sheet でもう一度実施する。Repository の Test 結果をこの欄へ
転記しない。

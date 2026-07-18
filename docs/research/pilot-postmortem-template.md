# Pilot Postmortem Template

成功・失敗のどちらでも同じ Template を使う。氏名、連絡先、場所、正確な時刻、端末 / Participant /
Lounge ID、Passport / Bridge / 会話 / Incident の内容を記載しない。

## Scope

- Pilot の仮説:
- 事前に固定した Decision Gate:
- 実施月（`YYYY-MM`）:
- 配布 Tier:
- Process 終了などで失われた Aggregate の件数または「不明」:

## Consent and Safety

- Research 参加 / 不参加 Tally:
- Research と Product Consent を分離できたか:
- Privacy Incident 件数:
- Safety Incident 件数:
- Stop Gate を適用したか:
- Dry Run の判定と改訂回数:

## Aggregate Results

- Start / Ready と完了率:
- Bridge / `no-signal`:
- Ready → Bridge duration Bucket:
- Rules / Local LLM / Fallback:
- Self-report eligible / Yes / No / Prefer not / 未回答:
- 会話開始自己申告率と有効回答数:
- 回答率:
- Facilitator Setup / Support Bucket:

## Contract Guardrails

- 根拠確認率:
- 主要 Bridge 上限違反数:
- `retired` 違反数:
- Owner Question 上限違反数:
- Analytics SDK / 自動送信 Endpoint 不在の Build Gate:

## Interpretation

- この結果が示すこと:
- この結果が示さないこと:
- 欠損、自己選択、最低集計単位、単一会場 / 端末による限界:
- `no-signal` と Fallback を除外せずどう解釈したか:

## Decision

- 判定: Stop / Revise / Continue
- 事前 Gate との対応:
- 次に承認する最小の範囲:
- しないこと:

## Changes and Publication

- Protocol / UI / Kit の変更:
- 成功・失敗の両結果を掲載した公開先:
- 原 Observation Sheet の削除確認:
- 手動 Export ファイルの保持責任者と削除時期:

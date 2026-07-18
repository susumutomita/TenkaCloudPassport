# Facilitator Kit Dry Run Record

- Kit Version: 1.0。
- Current Status: `Not run`。
- Physical Gate: Repository Test で代替しない。

この Record は、設計、実装、Kit 執筆を担当していない未経験者 1 名が記入する。氏名、連絡先、会場、
正確な日時、端末 ID、Lounge ID、Passport、Bridge、会話内容を書かない。実施月は `YYYY-MM` だけにする。

One inexperienced person who did not design, implement, or write the Kit completes this Record. Never record a
name, contact detail, venue, exact date or time, device ID, Lounge ID, Passport, Bridge, or conversation content.
Record only the month as `YYYY-MM`.

## 実施条件 / Conditions

- Kit Commit: `________________`。
- App Build ID / Version: `Not run` または公開 Build 識別子だけを書く / Write only `Not run` or a public build identifier.
- Build / OS / Transport: `Not run`、または公開 Support Matrix の項目名だけを書く / Write only `Not run`
  or the name of a capability in the public Support Matrix.
- 実施月 / Month: `YYYY-MM`。
- 読み上げ Locale / Read-aloud Locale: `JA / EN / JA + EN` から選ぶ / Choose one.
- Orientation: `30 分以内 / 30 分超 / Not run` または `Within 30 minutes / Over 30 minutes / Not run` から選ぶ / Choose one.
- 事前説明 / Explanation: `0〜5 分 / 6〜10 分 / 10 分超` または
  `0–5 minutes / 6–10 minutes / over 10 minutes` から選ぶ / Choose one range.
- 60 秒紹介 / 60-second introduction: `上限内 / 超過 / Not run` または `Within limit / Over / Not run` から選ぶ / Choose one.
- 5 分 Setup / Five-minute setup: `上限内 / 超過 / Not run` または `Within limit / Over / Not run` から選ぶ / Choose one.
- 口頭補足 / Oral hints after start: `0 件 / 1 件以上` または `0 / 1 or more` から選ぶ / Choose one.
- Event Format: `30 分 / 60 分 / 90 分` または `30 / 60 / 90 minutes` から選ぶ / Choose one.
- Format Timing: `上限内 / 超過 / Not run` または `Within limit / Over / Not run` から選ぶ / Choose one.
  正確な開始、終了、秒数を書かない / Never write exact start, end, or seconds.
- Capability: `Tabletop / Verified physical path / Not run` から選ぶ。

## 完了 Check / Completion Check

- [ ] 60 秒紹介と Product Privacy Script を見つけて読めた / Found and read the 60-second introduction and
  Product privacy script.
- [ ] Product Consent と Research Consent を分けられた / Kept Product and Research consent separate.
- [ ] `P0`〜`P10` を順にたどり、5 分 Setup を 1 回だけ実施できた / Followed `P0` through `P10` in order
  and ran the five-minute setup only once.
- [ ] Host、Participant、Facilitator、Observer、必要端末、Group Locale を区別できた / Distinguished the
  Host, Participant, Facilitator, Observer, required devices, and Group locale.
- [ ] 2〜6 名、1 名、7 名以上の Group 判断ができた / Correctly handled a two-to-six-person group, one person,
  and seven or more people.
- [ ] `R1`〜`R10` の 6 必須 Recovery と 4 QR Recovery を判断できた / Decided all six required recoveries
  and four QR recoveries from `R1` through `R10`.
- [ ] Invite 生成後から最大 20 分を数え、Ready や Recovery で延長しなかった / Counted at most 20 minutes
  from Invite creation and did not extend it for Ready or recovery.
- [ ] 2 名以上が接続し、接続中 Participant 全員が Ready になるまで `P7` を開始しなかった / Did not
  begin `P7` until at least two participants were connected and every connected participant was Ready.
- [ ] Host 以外へ 1 名ずつ fresh Invite を表示し、成功ごとに旧 QR を取り下げて Secret を Rotate した /
  Displayed one fresh Invite per non-Host participant, removed each used QR, and rotated the Secret after success.
- [ ] `no-signal`、Research 不参加、未回答、途中退出を失敗にしなかった / Did not treat `no-signal`,
  declining research, no answer, or an early exit as failure.
- [ ] 個人退出では退出者の Data だけを直ちに破棄し、他の端末の終了まで待たせなかった / Discarded only
  the exiting person's data immediately and did not make that person wait for other devices.
- [ ] 共有内容、20 分削除、バックアップ除外を説明できた / Explained sharing, 20-minute deletion, and
  backup exclusions.
- [ ] Incident 想定で新規セッションと Aggregate Export を停止できた / Stopped new Lounges and aggregate
  export in the incident scenario.
- [ ] 終了案内を読み、連絡先を集めなかった / Read the closing and collected no contact details.

## Recovery 判断 / Recovery Decisions

各 ID で `安全側を選択 / 判断不能 / Not run` または `Safe decision / Undecidable / Not run` を 1 つ選ぶ。
Choose one state per ID; do not add a narrative。

| ID | Decision |
| --- | --- |
| `R1` | `Not run` |
| `R2` | `Not run` |
| `R3` | `Not run` |
| `R4` | `Not run` |
| `R5` | `Not run` |
| `R6` | `Not run` |
| `R7` | `Not run` |
| `R8` | `Not run` |
| `R9` | `Not run` |
| `R10` | `Not run` |

## Kit 改訂入力 / Revision Input

件数だけを書く。内容、発言、人物、会場を記述しない。

Write counts only. Do not describe content, speech, a person, or a venue.

| 分類 / Category | Count |
| --- | --- |
| 文書の場所に迷った / Navigation confusion |  |
| 手順の意味に迷った / Instruction confusion |  |
| 続行か停止か判断不能 / Undecidable continue-or-stop step |  |
| Product / Research Consent の混同 / Consent confusion |  |
| 共有内容の説明漏れ / Shared-data omission |  |
| 20 分削除の説明漏れ / 20-minute deletion omission |  |
| バックアップ除外の説明漏れ / backup exclusion omission |  |
| QR 再利用禁止の説明漏れ / QR-reuse omission |  |
| 退出または `no-signal` の圧力 / Exit or `no-signal` pressure |  |
| Role または必要端末の判断不能 / Role or device confusion |  |
| JA / EN 導線の判断不能 / Locale-flow confusion |  |
| Setup の二重実施 / Duplicated setup |  |
| `NORMAL END` / `NOT STARTED` / `STOP THIS LOUNGE` の混同 / State-label confusion |  |

- 判定 / Decision: `Pass / Revise and repeat / Not run`。
- 改訂 Pull Request / Revision PR: `Not applicable / URL`。
- 再実施 / Repeat: `Not run / Pass / Revise and repeat`。

`Pass` は Kit の理解可能性だけを示し、Product、Transport、OS、Device、Event の安全性や利用可能性を証明しない。
1 件でも迷い、判断不能、Privacy 説明漏れ、口頭補足があれば `Revise and repeat` とし、Kit を改訂して別の空
Record で再実施する。

`Pass` proves only that the Kit can be understood. It does not prove Product, transport, OS, device, or event
safety or availability. If there is any confusion, undecidable step, privacy omission, or oral hint, choose
`Revise and repeat`, revise the Kit, and rerun with another blank Record.

# Facilitator Kit QA Plan

## Scope

- Issue: <https://github.com/susumutomita/TenkaCloudPassport/issues/27>。
- Role: QA Engineer。
- Repository gate: automated document contract and review。
- Physical gate: inexperienced person、real devices、print、assistive technology。

## Automated behavior matrix

| Given | When | Then |
| --- | --- | --- |
| JA / EN Kit がある。 | Version と `P0`〜`P10`、`R1`〜`R10` を読む。 | 対応する文書と ID が揃う。 |
| 物理能力の Evidence がない。 | Support Matrix を読む。 | 各能力は `Not run` であり、`Verified` へ変えられない。 |
| Host 以外が複数いる。 | `P6` を読む。 | 1 名ごとに fresh Invite を使い、成功後に Secret を Rotate する。 |
| 2 名以上が接続している。 | 一部だけが Ready になる。 | 全接続 Participant が Ready になるまで `P7` を開始しない。 |
| Participant が退出する。 | Lounge が継続可能である。 | 退出者だけを破棄し、Host Loss と混同しない。 |
| Host が失われる。 | Recovery を読む。 | 全残存端末の破棄完了表示がなければ再開しない。 |
| Public Passport を説明する。 | Privacy Script を読む。 | Pet Name、任意 Pet Emoji、任意 Alias、Languages、最大 3 手掛かりを説明する。 |
| Camera を拒否する。 | `R2` を読む。 | 本人の Product 参加は `NOT STARTED` であり、拒否自体を失敗にしない。 |
| Poster へ Payload や画像を埋める。 | QR 安全性検査を行う。 | `TCPQ1:`、画像、Data URL、Secret 値、入力欄を拒否する。 |
| Dry Run Record へ禁止 Field を足す。 | Record Allowlist を検査する。 | 氏名、連絡先、場所、ID、自由記述を拒否する。 |
| Kit に Link を足す。 | Link 検査を行う。 | Repository 内相対 Path と実在 Fragment 以外を拒否する。 |

## Physical and human gates

| Gate | Required evidence | Current state |
| --- | --- | --- |
| Novice Dry Run | 10 分以内の説明後、口頭補足なしで Record が `Pass` である。 | `Not run` |
| Real QR and rotation | 対象 Build と OS で Guest ごとの Invite が成功し、旧 QR が拒否される。 | `Not run` |
| Group Lounge | 2〜6 台、All-Ready、個人退出、Host Loss が端末上で完走する。 | `Not run` |
| Print | A4 / Letter の内容欠落、折返し、Poster 誤認を検査する。 | `Not run` |
| Accessibility | 読上げ順、Keyboard、Screen Reader、200％ Zoom を検査する。 | `Not run` |

Repository の Green は Physical Gate の代替証跡にしない。

# Facilitator Kit と Local Champion 運用設計

## 目的と責務

Issue 27 の運用 Kit を、Product Contract と Privacy Contract の薄い現場導線として設計する。Kit は
参加者管理、人物評価、調査データベースではない。Product の技術契約は既存の正本を参照し、運用文書が
別の保持期間や共有範囲を発明しない。

## 比較した案

| 案 | 利点 | 欠点と判断 |
| --- | --- | --- |
| 中央 CRM と認定 Champion 制度 | 招待履歴と開催回数を一元管理しやすい。 | 個人追跡、採点、削除要求、資格による権力差を作るため棄却する。 |
| 文書 URL だけを渡し、同期確認を行わない | Core Team の時間を最小化できる。 | Product / Research Consent の混同や Recovery の誤判断を Pilot 前に検出できないため棄却する。 |
| Repository Kit、30 分以内の Orientation、第三者 Dry Run | 変更履歴を公開し、短い同期確認と実地 Gate で誤説明を止められる。 | 同期時間と実在者の協力が必要だが、個人台帳なしで安全境界を確認できるため採用する。 |

採用案では、Repository が Kit Version と文言の正本を持つ。Core Team は Champion を認定または採点せず、
公開情報を入口に本人へ関心と開催可能性を尋ねる。Orientation と Dry Run は合否資格ではなく、Kit の不足を
発見する段階 Gate と位置づける。

## 文書構成と依存方向

```text
Product Contract / Privacy / Pilot Protocol
                    |
                    v
        JA / EN Facilitator Guide
          |        |          |
          v        v          v
      Checklist  QR Poster  Dry Run Record
                    |
                    v
          Local Champion Lifecycle
```

- Product、Privacy、Research の正本から Guide へ一方向に参照する。
- Checklist と QR 掲示物は Guide を短くした現場用表示であり、独自の例外を設けない。
- Dry Run Record は Kit の理解可能性だけを記録し、参加者、Champion、会場の識別情報を持たない。
- Champion Lifecycle は招待と辞退の運用だけを持ち、Product の参加者状態へ接続しない。

## Field Action と状態表示

Guide と Checklist は `P0`〜`P10` を同じ意味で使う。Recovery は Issue 27 の 6 状態を `R1`〜`R6`、
QR 境界の不正、重複、期限切れ、別 Group / 非対応を `R7`〜`R10` とする。JA / EN の片方だけへ ID や
続行条件を追加しない。

状態は色だけで伝えず、次の 3 Label を文頭に表示する。

- `NORMAL END`: `no-signal`、Research 不参加、未回答、個人退出である。謝罪や再試行を求めない。
- `NOT STARTED`: 2 名未満、未検証能力、許可拒否、利用可能な Provider 無しである。Walkthrough または後の回にする。
- `STOP THIS LOUNGE`: Host Loss、期限切れ、未知状態、Privacy / Safety Incident である。現在の Lounge を破棄する。

## 現場 Data Flow

1. Champion は `P0` で Kit Version、利用 Build、対応済み能力を確認する。未検証能力は `Not run` とする。
2. `P1`〜`P5` の 5 分 Setup を 1 回だけ実施する。参加者へ 60 秒紹介を読み、Research は Product 利用と
   別で任意だと説明する。
3. Research を実施する場合だけ、既存 Consent Script で `P4` を別に判断する。Owner 自身が `P5` で
   Product の Preview と共有項目を確認する。Facilitator は代理操作しない。
4. 全員が Scan できる状態になってから、Host は `P6` で現在の Lounge の QR を生成する。Host 以外の
   Participant 1 名だけが Scan し、認証成功で旧 QR を取り下げる。次の Participant には同じ Lounge 内で
   Secret を Rotate した別の fresh Invite を表示し、予定した Group が揃うまで 1 名ずつ繰り返す。写真、
   事前印刷、同じ QR、別 Group の QR を再利用しない。最初の Invite 生成時点から最大 20 分の期限を数える。
5. `P6`〜`P9` を 20 分以内で進める。`no-signal`、回答しない、個人退出は `NORMAL END` として直ちに扱い、
   退出する本人を Group 終了まで待たせない。
6. `P10` で任意の次回案内だけを読む。Facilitator が連絡先を集めたり参加を推測したりしない。
7. Research を実施する場合だけ、別 Consent と既存 Observation Sheet を使う。Kit Feedback は個人や発言を
   書かず、迷いの分類と判断不能箇所だけを Repository 改訂へ渡す。

## Recovery の責務境界

| 状態 | 続行条件 | 安全側の終了 |
| --- | --- | --- |
| Internet 無し | Build と会場で検証済みの近距離 Transport が Internet なしで動く場合だけ続行する。 | 能力が未検証または接続不能なら Lounge を作らず、説明だけで終了する。 |
| Camera 拒否 | 本人が説明後に自分で権限を許可した場合だけ Scan する。 | 拒否を尊重し、Secret の手入力や代理撮影をせず、観察または退出を案内する。 |
| 参加者不足 | 2 名以上になった場合だけ新しい Lounge を始める。 | 1 名では Product セッションとして数えず、任意の Walkthrough で終了する。 |
| 満員 | 6 名以下の別 Group と新しい Host / QR を作れる場合だけ分割する。 | 既存 Group へ 7 人目を追加せず、次の回を案内する。 |
| Host Loss | 全残存端末で現在の Lounge を終了し、端末ごとの破棄完了表示を確認した後だけ新しい Host で再開する。 | 1 台でも破棄完了を確認できなければ再開せず、Snapshot、QR、Secret を復元または再利用しない。 |
| Model 無し | Rules Provider が利用可能なら正常経路として続行する。 | Event 中に Model を Download せず、Rules も利用不能ならセッションを始めない。 |
| 不正または非 Passport QR | App の型付き拒否表示を確認し、対応 Build の Host が新しい Invite を表示できる場合だけ再開する。 | URL として開いたり Payload を転記したりしない。 |
| 重複または使用済み QR | 旧 Invite / Handshake だけを破棄し、認証済み Membership を保持した同じ Lounge で Secret を Rotate する。 | 同じ QR の再 Scan、受理済み Participant の除外、Secret 再利用を行わない。 |
| 期限切れ QR | 全端末で期限切れ Lounge を終了した後、新しい Lounge と Invite だけを使う。 | 期限延長、旧 QR、Snapshot を使わない。 |
| 別 Group または非対応 QR | 対象 Group の Host と対応 Build が表示する現在 Invite だけを使う。 | Group 間転送や非対応 Payload の読み替えを行わない。 |

Recovery は成功率を守る仕組みではなく、Privacy と参加者の選択を守る停止条件として扱う。

## Champion Lifecycle

Lifecycle は `発見 → 招待 → Orientation → Dry Run → 初回開催 → Feedback → 再開催 / 辞退` とする。
候補の発見には OSS Contribution、Cloud / CTF / 教育 Community の公開 Event、公開 Talk、公開 Organizer 情報だけを
使う。関心、開催可能性、地域との接続、継続意思を本人との会話で確認し、Score、順位、比較表を作らない。

招待は義務、雇用、報酬、認定を意味しない。本人はどの段階でも理由を言わず辞退できる。招待に使った既存
Channel で保持した任意の Contact や手動 Note は、本人の要求時に管理者が削除する。公開 Source 自体と、すでに
個人を識別しない Aggregate へ混合済みの件数を削除できるとは約束しない。中央 Registry へ複製しないため、
削除対象と管理者を招待時の Channel に限定できる。

## Orientation と Dry Run Gate

同期 Orientation は最大 30 分とし、次の 4 区分を延長しない。

1. 5 分で Product Contract と `no-signal` を確認する。
2. 10 分で Privacy Script と Product / Research Consent の分離を読み合わせる。
3. 10 分で 6 Recovery と QR 境界を Scenario で確認する。
4. 5 分で Dry Run Record、辞退、削除要求、Support Channel を確認する。

未経験者の Dry Run 前説明は Guide と Checklist の場所を示す 10 分以内の説明だけにする。その後は口頭補足を
せず、迷い、判断不能、Privacy 説明漏れを分類だけで記録する。1 件でもあれば Kit を改訂し、別の空 Record で
再実施する。実在する第三者の結果は Repository Test で代替せず、未実施なら `Not run` と表示する。

## Edge Cases

- 対応 Transport や配布 Build が未完成でも、文書完成を実機利用可能の証拠にしない。
- 参加者が Research を断っても Product は利用できる。全員同意でなければ Research Counter は OFF にする。
- Product Consent の代理操作、Camera 権限の強制、Secret の手入力は行わない。
- `no-signal` と途中退出を成功率から隠さず、Champion の能力不足へ帰属させない。
- Privacy / Safety Incident が 1 件でもあれば新規セッションと Aggregate Export を停止する。
- QR 掲示物は静的な Invite や貼付欄を含めず、QR が Host の手元の端末にあることを文章と矢印で示す。
- 90 分 Format でも 1 Lounge を 20 分以上へ延長せず、複数の独立した Lounge と休憩に分ける。

## Verification

- JA / EN の Guide と Checklist が同じ項目を持つことを実 file I/O Test で検査する。
- 10 Recovery、3 Event Format、3 つの Privacy 説明境界、QR の再利用禁止を固定する。
- README と各文書から正本へ到達できる Link を検査する。
- 文書 Review で個人 Score、中央 Registry、Contact 収集、Research 強制がないことを確認する。
- 物理 Dry Run は [Dry Run Record](../facilitator/dry-run-record.md) に `Not run` または実在者の分類結果を記録する。

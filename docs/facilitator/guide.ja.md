# Facilitator Guide（日本語）

- Kit Version: 1.0。
- この日本語版を意味の正本とする。
- Physical Dry Run: `Not run`。

## この役割がすること

Facilitator は参加者が自分で Passport、権限、Research、退出を選べるように進行する。参加者の代わりに
画面を押さず、Bridge を評価せず、会話や連絡先交換を仲介しない。`no-signal`、回答しない、途中退出は
正常な選択であり、Facilitator や参加者の失敗ではない。

## 役割と必要端末

- Host は 2〜6 名に含まれる Owner 1 名であり、自分の対応済み端末で現在 QR を生成し、Lounge を終了する。
- Participant は Host を含む 2〜6 名の Owner であり、1 人 1 台の対応済み端末を自分で操作する。
- Facilitator は読み上げと停止判断を担う。Participant または Host を兼ねる場合も、自分の端末だけを操作し、
  2 人目として数えたり他人の端末を操作したりしない。
- Dry Run Observer は Kit の迷いを分類するが、Product Participant 数へ含めない。

Group で読み上げる Locale を Setup 前に選ぶ。理解に必要な Locale が混在する場合は JA / EN Script を別々に
読み、時間超過を理由に省略しない。全員が選択と Stop 条件を理解できるか確認できなければ `NOT STARTED` とする。

## Field Action ID

Guide と 1 Page Checklist は同じ ID を使う。途中から推測で再開せず、別 Group や次の回は `P2` へ戻る。

| ID | 完了状態 |
| --- | --- |
| `P0` | Build と会場 Capability が Verified または `Not run` と判定済みである。 |
| `P1` | Kit、端末、QR 掲示物、退出経路が準備済みである。 |
| `P2` | Host を含む 2〜6 名の Group が決まっている。 |
| `P3` | 60 秒の Product 紹介を読み終えた。 |
| `P4` | Research を別に判断し、不参加を含むセッションは Counter OFF である。 |
| `P5` | Owner が Product の Preview、共有、Camera を自分で選べる。 |
| `P6` | Host が Participant ごとに 1 回限りの Invite QR を新規表示し、2 名以上の接続中 Participant 全員が自分で Ready へ進む。 |
| `P7` | Lounge 中に代理操作、評価、回答圧力を行わない。 |
| `P8` | Outcome または退出を正常終了か Stop 状態として説明した。 |
| `P9` | 全端末が現在の Lounge を終了し、旧 QR を再利用しない。 |
| `P10` | 連絡先を集めず、任意の公開 Event 案内だけを示した。 |

## P0 — 開催前の Stop Gate

次のどれかが確認できなければ、Product セッションを開始せず Walkthrough だけにする。

- [Kit Support Matrix](./README.md#kit-version-10-support-matrix) で使用 Build と OS の組が Verified である。
- Native Build の配布経路、Participant ごとの Invite Rotation、Rules Provider または Local Model、Host Loss の
  端末別破棄完了が Verified である。
- 会場で使う Transport が、その会場条件で検証済みである。
- 印刷物を使う場合は A4 / Letter 出力と読上げ順が Verified であり、未検証なら画面上の Guide だけを使う。
- 2〜6 名の参加者が、自分の端末と判断で参加する。
- Host Loss、権限拒否、退出時に終了できる人がいる。
- Research を行う場合は、Product と別の Consent Script と空の Observation Sheet がある。

Repository の Test が Green でも実機経路は Green と推測しない。未確認は `Not run` とする。

## P3 — 60 秒紹介

次をそのまま読む。

> TenkaCloud Passport は、イベントで本人が公開を選んだ少量の手掛かりから、相手へ話しかける理由を
> 1 つだけ示して退くアプリです。アカウントや中央人物台帳は使いません。根拠が足りないときは
> `no-signal` で終わります。これは正常な結果で、人や相性の評価ではありません。
>
> 参加、Camera 権限、Passport の各項目、質問への回答、Research、退出はすべて任意です。断っても
> 不利益はありません。共有前に本人が画面で内容を確認します。Facilitator は代理操作をしません。
>
> Lounge のデータは端末のメモリだけで扱い、退出、Host 終了、20 分満了のうち最も早い時点で消えます。
> 会話は人間同士で行い、アプリは連絡先を集めません。

質問があれば、推測で答えず [Privacy Script](#p5--privacy-script) または正本を開く。説明できない場合は開始しない。

## P1〜P6 — 5 分 Setup

この Setup は 1 回だけ実施し、完了後に Host が QR を作る。20 分 Script の中で繰り返さない。

| 目安 | ID | Facilitator の操作 |
| --- | --- | --- |
| 0:00〜1:00 | `P1` | Build、Group の Locale、Transport、Rules Provider、[QR 掲示物](./qr-poster.ja.md)、退出経路を確認する。 |
| 1:00〜2:00 | `P2` | 2〜6 名と Host を決める。1 名は Walkthrough、7 名以上は別 Host / Lounge にする。 |
| 2:00〜3:00 | `P3` | [60 秒紹介](#p3--60-秒紹介) を読む。 |
| 3:00〜4:00 | `P4` | Research を行う場合だけ、別の Research Consent Script を読み始める。不参加なら Counter OFF のままにする。 |
| 4:00〜5:00 | `P5` | [Privacy Script](#p5--privacy-script) を読み、Owner 自身が Preview と Camera を選ぶと確認する。 |
| 最後 | `P6` | 全員が Scan できる状態になってから、Host が新しい Lounge と最初の Guest 専用 QR を作る。 |

Research Consent Script や本人の判断で 5 分を超えた場合も急かさない。続く Lounge 枠を短くするか
Walkthrough へ切り替え、Privacy 説明を省略しない。

## P6〜P9 — 最大 20 分セッション Script

この時計は `P6` で現在の Invite を生成した時点から始まる。Setup を二重に数えず、Ready や Recovery に
時間がかかっても期限を延長しない。

| Invite 生成後 | ID | 読み上げと進行 |
| --- | --- | --- |
| 0:00〜5:00 | `P6` | Host 以外の Participant は 1 名ずつ自分専用の current QR を Scan し、自分の Preview と Product Consent を確認して Ready を選ぶ。 |
| 5:00〜10:00 | `P7` | Lounge を進める。Owner Question は本人が回答、拒否、退出を選び、Facilitator は評価しない。 |
| 10:00〜15:00 | `P7` | Pet が退いた後、人間同士が話す余白を保つ。会話内容、連絡先、写真を記録しない。 |
| 15:00〜18:00 | `P8` | Bridge、`no-signal`、任意退出を対応する正常終了文で説明する。 |
| 18:00〜20:00 | `P9` | 全端末の Lounge 終了を確認する。任意 Self-report は待たせず Skip できる。 |

20 分満了または Host 終了が先に起きたら、その時点で全端末の現在 Lounge を終了する。個人退出では
退出者の現在 Data だけを直ちに破棄し、残る Membership は続行する。Round 中に残り 1 名になった場合は、
その Participant を正常な `no-signal` へ収束させて終了し、退出者を Outcome に残さない。Host の退出は
個人退出ではなく `R5` Host Loss として全端末を停止する。
`P7` は、2 名以上が接続し、接続中 Participant 全員が自分で Ready を選ぶまで開始しない。Ready していない
Participant を除外して開始したり、Facilitator が代理で Ready にしたりしない。条件が 20 分満了までに
揃わなければ `STOP THIS LOUNGE` とし、期限を延長しない。

Host 以外の Participant ごとに、Host は fresh Invite を 1 つ表示し、その 1 名だけが Scan する。認証成功後は
その QR を直ちに取り下げ、次の人には同じ Lounge 内で Secret を Rotate した別の fresh Invite を表示する。
Host 自身は Guest QR を Scan しない。同じ QR を 2 名へ見せたり、同時に Scan させたりしない。予定した
2〜6 名へ順番に Invite を発行できない Build は Support Matrix を `Not run` とし、Product セッションを開始しない。

## Event Format

| 全体時間 | 構成 | 上限 |
| --- | --- | --- |
| 30 分 | 5 分 Setup、最大 20 分の Lounge、5 分終了案内である。 | 1 Lounge である。 |
| 60 分 | 5 分 Setup、最大 20 分の Lounge、10 分休憩、5 分の新 Setup、最大 15 分の Lounge、5 分終了案内である。 | 各 Lounge は新しい Host QR を使う。 |
| 90 分 | 5 分 Setup と最大 20 分 Lounge、10 分休憩、5 分 Setup と最大 20 分 Lounge、10 分休憩、5 分 Setup と最大 10 分 Lounge、5 分終了案内である。 | Lounge を接続せず、各回を 20 分以内に閉じる。 |

30 / 60 / 90 分のどれでも、Research 参加、再参加、Meetup 案内への反応を必須にしない。

## P5 — Privacy Script

Product 操作前に次をそのまま読む。

> 共有するのは、あなたが今回の Preview で ON にした Pet Name、任意 Pet Emoji、任意 Alias、Languages、最大 3 件の
> 手掛かりです。現在の QR を見られる人と、認証された現在の Lounge の Pet だけが対象です。
> 質問への回答そのものは送らず、本人が今回の Lounge で利用を許可した確認済み参照だけを使います。
>
> Public Passport、QR、Lounge ID、参加状態、Owner Question と Answer、Pet Message、推論中のデータ、
> Bridge、`no-signal` は永続化しません。画面終了、退出、Host 終了、20 分満了など、それぞれの最も早い
> 削除契機で消えます。途中で退出して構いません。
>
> 手動 JSON バックアップに入るのは Local Private Profile、端末設定、Model 検証記録だけです。Public Passport、
> QR、Lounge、Owner Answer、Pet Message、推論データ、Bridge、`no-signal`、GGUF Model 本体は入りません。
> 端末内の Local Private Profile と Model は Lounge 終了では消えず、Owner が別の削除操作を選ぶまで残ります。
>
> Product の利用と Research への参加は別です。Research を断っても Product を使えます。Research の判断は
> 別の Script で尋ねます。今は自分の Product 共有 Preview を確認し、共有しない場合は進まず退出してください。
> どちらを選んでも不利益はありません。

全員が Product 共有を確認してから進む。Research を行う場合は
[Research Consent Script](../research/consent-script.ja.md) を別に読み、全員が明示同意したセッションだけ
Counter を ON にする。Research Consent を Product Consent の代わりに使わない。

## Recovery Card

色だけに依存せず、各状態の先頭で `NORMAL END`、`NOT STARTED`、`STOP THIS LOUNGE` のどれかを読む。

### R1 — Internet 無し

- Label: `NOT STARTED` である。
- Do: Build と会場で Offline Transport が Verified の場合だけ続ける。
- Do not: 外部 Relay や未検証経路を足さない。
- End: 未検証または接続不能なら Lounge を作らず Walkthrough にする。

### R2 — Camera 拒否

- Label: 本人の Product 参加は `NOT STARTED` である。拒否や退出の選択自体は正常であり、2 名未満になれば
  Group も `NOT STARTED` である。
- Do: 本人が自分で許可した場合だけ Scan し、拒否なら観察または退出を案内する。
- Do not: 強制、Secret 手入力、代理撮影を行わない。
- End: 拒否した本人を待たせず終了する。

### R3 — 参加者不足

- Label: `NOT STARTED` である。
- Do: 2 名以上になるまで待つか Walkthrough にする。
- Do not: 1 名や Facilitator を Product セッションへ数えない。
- End: Lounge を作らない。

### R4 — 満員

- Label: 追加 Group は `NOT STARTED` である。
- Do: 2〜6 名の別 Group、別 Host、新しい QR に分ける。
- Do not: 7 人目を追加せず、既存 QR を再利用しない。
- End: 分割できなければ次の回を案内する。

### R5 — Host Loss

- Label: `STOP THIS LOUNGE` である。
- Do: 全残存端末で「この Lounge のデータを端末から破棄しました」を確認し、その後だけ別の Host が
  新規 Lounge を作る。
- Do not: Snapshot、旧 QR、Secret、Outcome を復元しない。
- End: 1 台でも破棄完了表示を確認できなければ再開せず、現在の回を終了する。

### R6 — Model 無し

- Label: Rules があれば続行、無ければ `NOT STARTED` である。
- Do: Rules Provider を正常経路として使う。
- Do not: Event 中の Model Download や外部推論を使わない。
- End: Rules も利用不能なら Lounge を作らない。

### R7 — Passport ではない QR または不正形式

- Label: `NOT STARTED` である。
- Do: App の型付き拒否表示に従い、現在の Host 画面を確認する。
- Do not: URL として開いたり、内容を転記したりしない。
- End: Host が対応 Build で新しい Invite を表示できなければ開始しない。

### R8 — 重複または使用済み QR

- Label: `NOT STARTED` である。
- Do: 同じ QR を再 Scan せず、Host は旧 Invite / Handshake だけを Dispose する。受理済み Membership を
  保持した同じ Lounge で Secret を Rotate し、次の 1 名専用の fresh Invite を表示する。
- Do not: `DUPLICATE_SCAN` を成功扱いせず、受理済み Participant を除外せず、Secret を再利用しない。
- End: 新しい Invite を安全に作れなければ次の人を追加せず、All-Ready Gate が成立しない限り `P7` を開始しない。

### R9 — 期限切れ QR

- Label: `STOP THIS LOUNGE` である。
- Do: 全端末で期限切れ Lounge を終了し、続ける場合は新しい Lounge と Invite を作る。
- Do not: 期限を延長せず、古い QR を再表示せず、旧 Snapshot を復元しない。
- End: 期限切れの回を終了する。

### R10 — 別 Group または非対応 Version の QR

- Label: `NOT STARTED` である。
- Do: 対象 Group の Host と対応 Build を確認し、その Host が現在の Invite を表示する。
- Do not: Group 間で QR を転送せず、非対応 Payload を読み替えない。
- End: 対応する現在 Invite がなければ開始しない。

未知の表示は推測で続行せず `STOP THIS LOUNGE` とする。Privacy / Safety Incident を 1 件でも認識した場合は、
新規セッションと Aggregate Export を停止する。内容を Observation Sheet へ書かず、再開判断を
[Pilot Decision Gates](../research/pilot-decision-gates.md) へ渡す。

## P8 — Outcome と退出の読み上げ

### Bridge

> Pet は退きました。希望する場合は、ここから人間同士で会話してください。

### `no-signal`

> これは正常な `no-signal` です。この Lounge では推測も再試行もしません。

### 退出

> 理由を言わずに退出できます。この端末の現在の Lounge Data は破棄されます。

### Research 不参加または未回答

> 回答は不要です。待たずに Product を続けるか終了できます。

## P9 — End and forget

個人退出は `P8` で直ちに完了し、退出する本人を他の端末の終了まで待たせない。Group の終了時は残る全端末が
現在の Lounge を終了したことを確認する。旧 QR、画面写真、Checklist の書き込みを次の Group へ引き継がない。
次の Group は `P2` から新しく始める。

## P10 — 終了案内

> 興味がある方には、主催者がすでに公開している TenkaCloud Meetup または Local Tournament の案内だけを
> お見せできます。参加表明や連絡先を Facilitator へ渡す必要はありません。今ここで決めなくて構いません。

## Local Champion Lifecycle

### 1. 発見

OSS Contribution、Cloud / CTF / 教育 Community の公開 Event、公開 Talk、公開 Organizer 情報だけを見る。
非公開 Group、Member List の Scrape、購入名簿、紹介者の私的評価を使わない。

公開情報は候補への丁寧な招待文を作るための入口であり、Score ではない。本人との会話で次だけを尋ねる。

- Product の目的に関心があるか。
- 2〜6 名の場、端末、場所を準備できる可能性があるか。
- 地域 Community とどのような公開上の接続があるか。
- 初回後に再開催を検討したいか、1 回だけにしたいか。

回答を点数化、順位付け、比較しない。開催できない、継続しないという回答も不合格ではない。

### 2. 招待と Orientation

招待には雇用、報酬、認定資格、開催義務がないこと、理由なしで辞退できること、招待 Channel で保持した
任意 Contact と手動 Note の削除を依頼できることを書く。中央 Champion Registry へ複製しない。

同期 Orientation は 30 分以内とする。

1. 5 分で Product Contract と `no-signal` を確認する。
2. 10 分で Privacy Script と Product / Research Consent を分けて読む。
3. 10 分で 10 Recovery と QR 再利用禁止を Scenario 確認する。
4. 5 分で Dry Run、辞退、削除要求、Support Channel を確認する。

### 3. Dry Run から再開催 / 辞退まで

未経験者へ Guide と Checklist の場所を 10 分以内で説明し、その後は口頭補足をせずに Dry Run を行う。
[Dry Run Record](./dry-run-record.md) へ、個人情報ではなく迷い、判断不能、Privacy 説明漏れの分類だけを
記録する。1 件でもあれば Kit を改訂して再実施する。

初回開催後も参加者数、Bridge 率、Champion の速さで評価しない。Kit の迷いだけを Feedback にし、本人が
再開催または辞退を選ぶ。辞退理由を求めない。

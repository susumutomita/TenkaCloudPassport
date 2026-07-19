# Privacy データ台帳

本書を TenkaCloud Passport が生成、保存、共有、Export するデータの日本語正本とする。
指定用語は [用語集](../product/glossary.md) に従う。保持と破棄の時系列は
[保持ポリシー](./retention-policy.md)、攻撃と対策は
[脅威モデル](../security/threat-model.md) を正本とする。

## データ最小化の契約

本プロダクトで「個人情報を扱わない」とは、Owner または端末を直接識別、追跡、再連絡する
フィールドを設けず、Owner が公開を許可した非識別の手掛かりだけを Public Passport へ
投影することを指す。手掛かりの組み合わせから第三者が Owner を推測する可能性までは
なくならないため、入力候補と公開数を制限し、公開前に Owner の確認を必須にする。

本書では、Pet が Lounge 内で交換するアプリケーションデータの日本語正本名を Pet Message とする。
Issue 3 の不変条件にある Peer Message は同じデータ種別を指し、実装の型名は本書で固定しない。

Local Private Profile、Public Passport、QR、Pet Message、バックアップは、次の値を受け付けない。

- 氏名、アカウント名、メールアドレス、電話番号、住所、連絡先、写真である。
- 安定 ID、端末 ID、広告 ID、Cookie ID、永続する公開鍵である。
- 緯度、経度、住所、施設名、移動履歴などの位置情報である。
- SNS URL、個人 URL、外部アカウントへのリンクである。
- Pet Name と任意の Owner Alias 以外の自由記述、ファイル添付、端末の絶対パスである。

Pet Name と Owner Alias は 24 UTF-16 code unit 以下の表示用文字列だけを許可する。Owner Alias は
空を許可し、本名を要求しない。UI は氏名、連絡先、会社名、機密情報を入力しないよう案内する。
これらも Public Passport へ自動では含めず、Lounge 参加直前に Owner が項目単位で ON にした場合だけ
投影する。

Local Private Profile の手掛かりは、アプリに同梱した版管理済みカタログから選ぶ。カタログは
`interest`、`activity`、`skill`、`conversation-topic` の分類と非識別の値を持つ。入力欄から
カタログ外の値を保存する経路は設けない。Owner Question への回答は `yes`、`no`、`decline` の
選択式とし、自由記述を受け付けない。

GitHub Token は機能要件でも設定値でもなく、要求、生成、保存、Export、送信の対象にしない。
Analytics SDK を組み込まず、利用状況、広告、クラッシュ内容を外部へ送信しない。推論は Owner が
端末へ配置した GGUF モデルだけで行い、入力、出力、手掛かりを外部推論 API へ送信しない。

## データ分類

| 区分 | 意味 | 許可する保存先 |
| --- | --- | --- |
| `L0` 公開アプリ資産 | アプリと一緒に配布できる定義、カタログ、検証情報である。 | アプリ領域へ永続保存できる。 |
| `L1` 端末内限定 | Owner が端末内だけで保持する設定と手掛かり候補である。 | OS のアプリ専用保護領域へ永続保存できる。 |
| `L2` 公開投影 | Owner が現在の Lounge のために明示的に公開した最小データである。 | メモリ、画面、短命な QR に限る。 |
| `L3` Lounge 限定 | Lounge への参加中だけ必要な通信、推論、結果データである。 | メモリに限る。永続ストレージへ書き込まない。 |
| `L3P` Process 限定集計 | 複数の Lounge をまたいで件数だけを集計し、Process 終了までに限って必要な非識別 Aggregate である。 | Process Memory に限る。Event Log や永続ストレージへ書き込まない。 |
| `L4` Owner 管理 Export | Owner が明示操作でアプリ外へ複製したバックアップである。 | Owner が選んだ保存先に限る。 |
| `L5` 管理された Engineering Evidence | 明示した実機 Security Test だけで作る、Network metadata を含み得る短命な証拠である。Product 機能と Pilot では生成しない。 | 暗号化した検証端末に限る。Repository、CI Artifact、Cloud Storage へ保存しない。 |
| `L5P` 公開 Engineering Evidence | `L5` の内容を含めず、再現性と判定に必要な allowlist Field だけへ明示投影した公開証拠である。 | 公開 Repository と Review PR に保存できる。 |
| `L6` 管理された Formative Research Record | 明示的な Research Consent 後に 1 セッションだけ作る、7 Field の Temporary Coded Record である。Product Data と Pilot Aggregate から生成しない。 | Researcher だけが扱える暗号化済み一時領域に限る。Repository、Issue、PR、Cloud Analytics へ保存しない。 |
| `L6P` 公開 Formative Research Aggregate | `L6` の個別 Record を含めず、小 Cell 抑制を通った Pattern と Evidence Direction だけへ明示投影した公開 Aggregate である。 | 独立 Privacy Review 後の公開 Repository と Review PR に保存できる。 |

Diagnostic Report は `L0` の Version と、内容を持たない現在状態・件数だけを Owner の明示操作で
組み立てる。Report 自体は永続保存せず、Preview 中のメモリだけで扱う。Owner が Share Sheet を確定した
後の保存先は `L4` と同じく Owner 管理とする。正確な時刻、識別子、内容、パス、Network metadata は
Diagnostic Schema に存在しない。

Pilot Event Aggregate は `L3P` の Process 内 Counter として Start、Ready、Outcome、Provider、任意の
Self-report を件数だけで集計する。個別 Event、正確な時刻、ID、内容を保持せず、Ready から Bridge までの
差は即座に粗い Bucket へ変換する。Outcome 確定 5 件以上の場合だけ固定 Schema の Preview を作り、Owner /
Facilitator の明示 Share 後は Owner 管理の `L4` とする。Research Consent は Product Consent を代替しない。

Formative Event Research は Product と Pilot から独立した境界である。`L6` は Research Consent 後にだけ作り、
Role cohort、Locale cohort、Journey stage、Outcome class、Behavior code、Evidence direction、Hypothesis reference の
7 Field に固定する。`L6P` は同じ Pattern が 3 セッション以上、かつ 2 つ以上の Role または Locale Stratum に
広がる場合だけ作り、Locale 名、Role × Locale、正確な人数、個別 Record を含めない。

## L6 Temporary Coded Record allowlist

| Field | Allowed value |
| --- | --- |
| Role cohort | `participant` / `event-organizer` |
| Locale cohort | `ja` / `en` / `approved-other` |
| Journey stage | Interview Guide の 8 Stage のいずれかである。 |
| Outcome class | `continued` / `recovered` / `declined` / `exited` / `blocked` |
| Behavior code | `self-directed` / `neutral-repeat-needed` / `help-requested` / `privacy-confusion` / `recovery-chosen` / `stop-chosen` |
| Evidence direction | `supporting` / `contradicting` / `not-observed` |
| Hypothesis reference | `H1`〜`H5` / `none` である。 |

## L6P Public Aggregate allowlist

| Field | Allowed value |
| --- | --- |
| Journey stage | `L6` の Journey stage だけである。 |
| Outcome class | `L6` の Outcome class だけである。 |
| Behavior code | `L6` の Behavior code だけである。 |
| Evidence direction | `supporting` / `contradicting` / `not-observed` |
| Hypothesis reference | `H1`〜`H5` / `none` である。 |
| Sanitized pattern summary | 上の固定 Code だけから作る 140 UTF-16 code unit 以下の要約である。参加者の回答や会話に由来する自由記述を使わない。 |

## 全データ種別

`Export 可否` の「可」は、Owner が明示した手動 JSON バックアップに含められることを表す。
画面表示や Lounge 内共有の可否とは区別する。

| データ種別 | 区分 | 生成元 | 主な内容 | 保存場所 | 共有先 | TTL | 削除契機 | Export 可否 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 手掛かりカタログ | `L0` | アプリの版管理済み資産である。 | 分類、値、表示文言、カタログ版である。 | アプリ領域である。 | Owner の画面と端末内 Pet である。 | アプリの版と同じである。 | アプリ更新または削除である。 | 否である。 |
| Local Private Profile | `L1` | Owner が明示保存する。 | `schemaVersion`、Pet 表示情報、任意 Alias、手掛かり候補、Languages である。 | OS のアプリ専用保護領域である。 | Owner と端末内 Pet だけである。 | Owner が削除するまでである。 | 個別削除、Profile 初期化、アプリ削除である。 | 可である。 |
| Public Passport | `L2` | Owner の確認操作により Local Private Profile から投影する。 | `schemaVersion`、Pet Name、今回 ON にした任意表示情報、Languages、最大 3 件の手掛かりである。 | 現在の QR を作る間のメモリだけである。 | QR を見る人と参加を許可された Pet である。 | 投影から最大 20 分である。 | QR の閉鎖、再生成、退出、Host 終了、20 分満了のうち最も早い時点である。 | 否である。 |
| QR 参加情報 | `L2` | Lounge を作成する Owner の端末が生成する。 | Protocol 版、使い捨て Lounge ID、Join Secret、Discovery Hint、Transport Fingerprint、発行時刻、満了時刻、定員、Required Capability である。 | 画面と生成中のメモリだけである。 | QR を撮影または読み取れる人である。 | 発行から最大 20 分である。 | Join Secret の受理、QR の閉鎖、Rotation、Host 終了、20 分満了のうち最も早い時点である。 | 否である。 |
| 参加 capability | `L2` | Host が参加 Pet ごとに暗号学的乱数から生成する。 | 1 回限りの Join Secret と、Host の HMAC 検証状態である。 | QR と Host のメモリだけである。 | raw Secret は QR を読み取る Pet だけであり、Key Buffer は共有しない。 | 発行から最大 20 分かつ Lounge の残り時間以内である。 | 受理時の Key Buffer 上書き、QR の閉鎖、Rotation、Host 終了、20 分満了のうち最も早い時点である。 | 否である。 |
| 近距離探索メタデータ | `L3` | OS の近距離通信または同一 LAN の通信層が生成する。 | 一時的な接続候補と通信層アドレスである。 | OS とアプリのメモリだけである。 | OS、ルーター、接続先端末である。 | 接続試行中だけである。 | 接続成立、失敗、キャンセル、退出、Host 終了、20 分満了のうち最も早い時点である。 | 否である。 |
| Lounge セッション状態 | `L3` | Host と参加 Pet が QR 検証後に生成する。 | 一時 Lounge ID、参加状態、Host の `available` / `verifying` / `used` 状態、満了期限、`retired` 状態である。 | アプリのメモリだけである。 | 認証済みの参加 Pet である。Join 認証状態は Host だけである。 | 生成から最大 20 分である。 | 退出、Host 終了、全 Pet の `retired`、20 分満了のうち最も早い時点である。 | 否である。 |
| 暗号鍵と Replay 防止状態 | `L3` | QR Secret と採用 Transport の標準暗号から生成する。 | HMAC Key Buffer、Transport セッション Key、message nonce、受理済み sequence である。 | アプリと Transport Runtime のメモリだけである。 | Key 自体は共有せず、Join Proof と Transport Fingerprint だけを参加 Pet と共有する。 | Lounge セッションと同じである。 | 退出、Host 終了、20 分満了、プロセス終了のうち最も早い時点で Buffer を上書きして参照を破棄する。 | 否である。 |
| Owner Question | `L3` | 端末内 Pet が Bridge 判定に不可欠な不明点から最大 1 問生成する。 | カタログ版で定義した質問 ID と表示文である。 | アプリのメモリだけである。 | 自分の Owner の画面だけである。 | 自分の Lounge 参加中だけである。 | 回答、`decline`、`no-signal`、`retired`、退出、Host 終了、20 分満了のうち最も早い時点である。 | 否である。 |
| Owner Answer | `L3` | Owner が `yes`、`no`、`decline` から明示選択する。 | 質問 ID、選択値、当該 Lounge での共有同意である。 | アプリのメモリだけである。 | 選択値自体は Wire へ送らない。同意済み Answer から導いたカタログ内 Field Reference と Lounge-scoped Evidence ID だけを共有できる。 | Bridge 判定と許可済み共有が終わるまで、かつ自分の Lounge 参加中だけである。 | 判定と共有の完了、`no-signal`、`retired`、退出、Host 終了、20 分満了のうち最も早い時点である。 | 否である。 |
| Pet Message | `L3` | 参加 Pet が Lounge 内で生成する。 | Protocol Version、Message ID、一時 Participant ID、sequence、送信 / 満了時刻、許可 kind、Public Passport、確認済み Field Reference、Evidence ID、現在 Membership である。Owner Answer、Prompt、Model Output、自由記述 Claim は含めない。 | 送受信キューを含むアプリのメモリだけである。最新 Membership と Public Passport 以外の本文履歴は保持しない。 | 認証済みの参加 Pet である。 | Lounge セッションと同じである。 | 処理完了後に本文を解放し、遅くとも退出、Host 終了、20 分満了で全件破棄する。 | 否である。 |
| 端末内推論データ | `L3` | 端末内 Pet が Public Passport、Pet Message、Owner Answer から生成する。 | 構造化入力、token buffer、候補、検証前のモデル出力である。 | アプリのメモリと GGUF runtime のメモリだけである。 | 外部とは共有しない。 | 1 回の推論処理中だけである。 | 推論完了、失敗、キャンセル、退出、Host 終了、20 分満了のうち最も早い時点である。 | 否である。 |
| Bridge | `L3` | 端末内 Pet が確認済みの手掛かりから生成し、検証する。 | 最大 1 件の主要 Bridge と根拠に使った一時参照である。 | アプリのメモリと Owner の画面だけである。 | 自分の Owner だけである。 | Owner が表示を閉じるまで、かつ Lounge セッションの期限内である。 | 画面を閉じる操作、退出、Host 終了、20 分満了のうち最も早い時点である。 | 否である。 |
| `no-signal` と `retired` | `L3` | 端末内 Pet の状態機械が生成する。 | 現在の参加に限る結果と終端状態である。 | アプリのメモリと Owner の画面だけである。 | 自分の Owner と終了同期が必要な参加 Pet である。 | Lounge セッションと同じである。 | 画面終了、退出、Host 終了、20 分満了、プロセス終了のうち最も早い時点である。 | 否である。 |
| 端末設定 | `L1` | Owner の設定操作とアプリが生成する。 | 言語、アクセシビリティ、選択中のモデル digest、カタログ版である。 | OS のアプリ専用保護領域である。 | Owner と端末内アプリだけである。 | 設定の変更または初期化までである。 | 設定初期化、モデル解除、アプリ削除である。 | 可である。ただし端末パスは含めない。 |
| GGUF モデルファイル | `L0` | Owner が Files から手動で選ぶ。アプリは入手元を信頼済みと判定しない。 | モデル本体である。Size と digest は private Manifest に分離する。 | OS のアプリ専用モデル領域である。 | 端末内推論 runtime だけである。 | Owner が置換または削除するまでである。 | モデル削除、検証失敗時の隔離、アプリ削除である。 | 否である。 |
| モデル検証記録 | `L1` | アプリが GGUF の検証時に生成する。 | digest、サイズ、検証結果、検証したアプリ版である。 | OS のアプリ専用保護領域である。 | Owner と端末内アプリだけである。 | モデルの置換またはアプリ更新後の再検証までである。 | モデル削除、置換、設定初期化、アプリ削除である。 | 可である。 |
| Local Model Benchmark | `L1` | Owner が開始した Import または端末内推論に伴いアプリが生成する。 | Model digest、Import / Load / First Token / Completion 時間、Peak Process Memory、Thermal、Battery Delta である。推論内容と端末識別子は含まない。 | OS のアプリ専用保護領域である。 | Owner と端末内アプリだけである。 | Model ごとに直近 20 件である。 | Model 削除、計測記録削除、設定初期化、アプリ削除である。 | 否である。 |
| 手動 JSON バックアップ | `L4` | Owner が Export を明示実行する。 | バックアップ schema 版、Local Private Profile、端末設定、モデル検証記録である。 | Owner がファイル選択画面で指定した保存先である。 | Owner と保存先を扱えるアプリまたはサービスである。 | Export 後は Owner が削除するまでである。 | Owner が保存先から削除する。アプリ内一時データは完了、取消、失敗、再起動で破棄する。 | 対象そのものである。 |
| Sanitized Diagnostic Report | `L4` | Owner が Preview 後に Share を明示実行する。 | Version、Provider / Transport / Permission 状態、Model の Architecture / Size / digest 先頭 8 桁、固定 Error Code / Phase、Storage 件数 / Byte 数である。 | Preview 中はメモリだけ、Share 後は Owner が選んだ保存先である。 | Owner が選んだ保存先または共有先である。 | Preview 終了まで、Share 後は Owner が削除するまでである。 | Preview 終了または Owner が保存先から削除する。 | 対象そのものである。 |
| Pilot Event Aggregate | `L3P`、手動 Share 後は `L4` | Lounge の固定遷移と任意 Self-report が内容なしの Counter を加算する。 | Schema Version、最低集計単位、Start / Ready、duration Bucket、Bridge / `no-signal`、Rules / Local LLM / Fallback、Self-report 件数である。 | Process Memory だけ、手動 Share 後は Owner が選んだ保存先である。 | Preview は Owner / Facilitator、Share 後は選択した保存先または共有先である。 | Process 終了まで、Share 後は Owner が削除するまでである。 | Process 終了、全 Local Data 削除、または Owner が保存先から削除する。 | Outcome 5 件以上の固定 Aggregate だけが対象である。 |
| Formative Event Temporary Coded Record | `L6` | Product Consent とは別の明示的な Research Consent 後に Researcher が 1 セッション分を作る。 | Role cohort、Locale cohort、Journey stage、Outcome class、Behavior code、Evidence direction、Hypothesis reference の 7 Field だけである。氏名、連絡先、正確な日時、会場、端末 / Lounge ID、回答や会話の内容、逐語引用、Sensitive Data を含めない。 | Researcher だけが扱える暗号化済み一時領域である。 | 指定 Researcher だけである。Facilitator、Product、Repository、Issue、PR、Cloud Analytics と共有しない。 | Public Aggregate 更新直後またはセッション終了から 7 日以内の早い方である。 | セッションを閉じる確認前の撤回、Aggregate 更新、7 日満了、禁止 Field の発見のうち最も早い時点で Record 全体を削除する。 | 否である。`L6P` への明示投影だけを許可する。 |
| Sanitized Formative Event Public Aggregate | `L6P` | 3 セッション以上、かつ 2 つ以上の Role または Locale Stratum に広がる `L6` Pattern を独立 Privacy Reviewer の確認後に投影する。 | Journey stage、Outcome class、Behavior code、`supporting` / `contradicting` / `not-observed`、Hypothesis reference、固定 Code だけから作る 140 文字以内の sanitized pattern summary である。Role cohort、Locale cohort、正確な人数、個別 Record、参加者の回答や会話に由来する自由記述、逐語引用を含めない。Privacy、Consent、退出に反する 1 件は内容を公開せず停止判断だけを残せる。 | 公開 Repository と Review PR である。 | Repository と Review PR の閲覧者である。 | Repository history と同じである。 | 誤りまたは禁止 Field は Public Aggregate と Review PR を Supersede して訂正する。元の `L6` は保持せず復元しない。 | 否である。手動 JSON バックアップへ含めない。 |
| Nearby Transport Spike raw Packet Capture | `L5` | 承認済みの実機 Spike Operator が隔離 Network で明示取得する。 | 暗号化済み Packet、通信層 Address、Packet size、相対 Timing、非識別 Canary である。実在 Owner の Passport は使わない。 | 暗号化した検証端末だけである。 | 指定 Reviewer だけである。 | Review 完了直後または取得から 7 日以内の早い方である。 | Review 完了、7 日満了、手順逸脱の発見のうち最も早い時点である。 | 否である。`L5P` への明示投影だけを許可し、raw Capture を Export しない。 |
| Sanitized Nearby Transport Spike Evidence Record | `L5P` | `L5` の内容を保持せず、承認済み Operator と Reviewer が実施結果から明示投影する。 | Schema / Record Version、Evidence Bundle ID、Candidate exact route / version / source、Repository commit、公開 Build ID と artifact digest、`physical-iphone` / `physical-android`、OS major、実行月、集計 Metric と Gate Status、cipher / fingerprint 判定、Capture / Canary / Serialized Envelope / Analyzer / Sensitive Field Manifest / Positive-control Fixture の digest、内容なしの Capture coverage と packet / byte / Envelope 件数、Tool Version、Review PR、Attestation、`L5` 削除 Attestation だけである。 | 公開 Repository と Review PR である。 | Repository と Review PR の閲覧者である。 | Repository history と同じである。 | 誤りは Record と Review PR を Supersede して訂正する。raw `L5` の削除とは独立する。 | 否である。手動 JSON バックアップへ含めない。製品 model、端末 ID、Network ID、Address、正確な日時、raw Capture、Canary cleartext、Packet Timing を含めない。 |
| 実行時 Security Signal | `L3` | schema、認証、Replay、モデル出力の検証失敗が生成する。 | 内容を持たない失敗種別と現在の Lounge 内回数である。 | アプリのメモリだけである。 | Owner の警告画面だけである。 | Lounge セッションと同じである。 | 退出、Host 終了、20 分満了、プロセス終了のうち最も早い時点である。 | 否である。 |

通信層アドレスは OS とネットワーク機器から見える場合があるが、QR、Public Passport、
Pet Message、ログ、バックアップのアプリケーションデータへ複製しない。

全削除 transaction の tombstone は内容を持たない固定 marker であり、`L1` としてアプリ専用領域へ保存
できる。削除対象の値、件数、パス、識別子を marker に含めない。marker が存在する間は既存の Local Data を
復元せず、新規 Profile write と Model Context 取得も共有 lease で拒否する。冪等削除を完了して全 Resource
の不在を確認した後に marker 自体を削除し、lease を解除する。

## Local Private Profile と Public Passport の差分

Public Passport は Local Private Profile 全体の別名でも複製でもない。Owner が QR の生成ごとに
公開候補を確認し、選択した最大 3 件だけを新しい短命データとして投影する。

| フィールド | Local Private Profile | Public Passport | 投影規則 |
| --- | --- | --- | --- |
| `schemaVersion` | ある。 | ある。 | 対応する Public Passport schema 版へ変換する。 |
| `petName` | ある。 | ある。 | 今回 ON であり、24 文字以下のときだけ必須 field として投影する。 |
| `petEmoji` | ある。 | 任意である。 | 今回 ON の場合だけ同梱カタログ値を投影する。 |
| `ownerAlias` | 任意である。 | 任意である。 | 空でなく、今回 ON の場合だけ投影する。本名を要求しない。 |
| `candidateClues[].category` | カタログ内の候補を保持する。 | 選択された候補だけを保持する。 | 許可する 4 分類以外は拒否する。 |
| `candidateClues[].value` | カタログ内の値を保持する。 | 選択された最大 3 件だけを `clues[].value` として保持する。 | 自由記述へ変換せず、カタログ版と値を検証する。 |
| `candidateClues[].selectedForPassport` | ある。 | ない。 | `true` の候補を Owner が QR 生成時に再確認した場合だけ投影する。 |
| `excludedTopics[]` | ある。 | ない。 | 共有せず、端末内の生成抑止にだけ使う。 |
| `languages[]` | ある。 | 任意である。 | 今回 ON にしたカタログ値だけを最大 3 件投影する。 |
| `source` | ない。 | 各手掛かりで `owner-selected` に固定する。 | 別の値や Peer 由来の値を許可しない。 |
| 安定 ID、端末 ID、広告 ID | ない。 | ない。 | schema と serializer の両方で拒否する。 |
| 位置情報、連絡先、URL、表示用 Pet Name と任意 Alias 以外の自由記述 | ない。 | ない。 | schema と UI の両方で入力経路を設けない。 |
| Lounge セッション、Owner Answer、Pet Message、Bridge | ない。 | ない。 | Lounge からの逆投影を禁止する。 |

QR の Lounge Invite は Public Passport と分離し、使い捨て Lounge ID、Join Secret、
Discovery Hint、Transport Fingerprint、発行時刻、満了時刻、定員、Required Capability だけを
持つ。これらは Lounge をまたいで再利用しないため安定 ID ではなく、Public Passport の
Field にも昇格させない。

## 手動 JSON バックアップの allowlist

バックアップは `backupSchemaVersion`、`exportedAt`、`localPrivateProfile`、`deviceSettings`、
`modelVerification` だけを直列化する。次のデータは暗黙にも選択式にも含めない。

- Public Passport と QR 参加情報である。
- Lounge セッション、暗号鍵、Replay 防止状態、Owner Question、Owner Answer である。
- Pet Message、端末内推論データ、Bridge、`no-signal`、`retired`、Security Signal である。
- GGUF モデル本体、端末の絶対パス、OS またはネットワークの識別子である。
- Local Model Benchmark、process memory sample、Thermal State、Battery Delta である。
- GitHub Token、Analytics データ、外部推論 API の設定値である。

Import は同じ strict schema で未知フィールドを拒否する。バックアップ内のデータから
Public Passport を自動生成せず、Owner が Import 後に公開候補を確認して QR を生成する。

Pilot Event Aggregate は手動 JSON バックアップと Diagnostic Report の Schema へ混ぜない。
`aggregateSchemaVersion`、`minimumAggregationUnit`、`startReady`、`readyToBridgeDurationBuckets`、
`outcomes`、`providerRuns`、`conversationStartSelfReport` だけを直列化する。生成時刻、Event 配列、氏名、
端末 / Participant / Lounge ID、場所、Passport / Bridge / Prompt / Output / 会話内容、Network metadata を
含めない。Outcome 5 件未満では JSON 自体を作らず、自動 upload、Background retry、受信確認 Endpoint を
設けない。

## データフロー

1. Owner は Pet 表示情報を入力し、版管理済みカタログから Local Private Profile の候補を選んで
   明示保存する。
2. QR 生成時に Owner が最大 3 件を再確認し、Public Passport をメモリ上へ投影する。
3. アプリは Public Passport と使い捨て参加情報を QR として表示する。
4. 読み取り側は schema、サイズ、版、満了時刻、一時公開鍵を検証してから Lounge へ参加する。
5. 認証済みの暗号化チャネルでは、確認済みの手掛かりと同意済み Owner Answer だけを
   Pet Message として交換する。
6. 端末内 Pet は外部通信機能を持たない GGUF runtime で Bridge または `no-signal` を判定する。
7. Lounge 由来データは保持期限に従って破棄し、Passport またはバックアップへ逆流させない。

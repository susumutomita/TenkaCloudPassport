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
| `L4` Owner 管理 Export | Owner が明示操作でアプリ外へ複製したバックアップである。 | Owner が選んだ保存先に限る。 |

## 全データ種別

`Export 可否` の「可」は、Owner が明示した手動 JSON バックアップに含められることを表す。
画面表示や Lounge 内共有の可否とは区別する。

| データ種別 | 区分 | 生成元 | 主な内容 | 保存場所 | 共有先 | TTL | 削除契機 | Export 可否 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 手掛かりカタログ | `L0` | アプリの版管理済み資産である。 | 分類、値、表示文言、カタログ版である。 | アプリ領域である。 | Owner の画面と端末内 Pet である。 | アプリの版と同じである。 | アプリ更新または削除である。 | 否である。 |
| Local Private Profile | `L1` | Owner が明示保存する。 | `schemaVersion`、Pet 表示情報、任意 Alias、手掛かり候補、Languages である。 | OS のアプリ専用保護領域である。 | Owner と端末内 Pet だけである。 | Owner が削除するまでである。 | 個別削除、Profile 初期化、アプリ削除である。 | 可である。 |
| Public Passport | `L2` | Owner の確認操作により Local Private Profile から投影する。 | `schemaVersion`、Pet Name、今回 ON にした任意表示情報、Languages、最大 3 件の手掛かりである。 | 現在の QR を作る間のメモリだけである。 | QR を見る人と参加を許可された Pet である。 | 投影から最大 20 分である。 | QR の閉鎖、再生成、退出、Host 終了、20 分満了のうち最も早い時点である。 | 否である。 |
| QR 参加情報 | `L2` | Lounge を作成する Owner の端末が生成する。 | プロトコル版、Public Passport、使い捨て Lounge nonce、参加 capability、一時公開鍵、発行時刻、満了時刻である。 | 画面と生成中のメモリだけである。 | QR を撮影または読み取れる人である。 | 発行から最大 20 分である。 | 参加 capability の受理、QR の閉鎖、再生成、Host 終了、20 分満了のうち最も早い時点である。 | 否である。 |
| 参加 capability | `L2` | Host が参加 Pet ごとに暗号学的乱数から生成する。 | 1 回限りの未使用 token である。 | QR と Host のメモリだけである。 | QR を読み取る Pet である。 | 発行から最大 20 分かつ Lounge の残り時間以内である。 | 受理時の raw token 破棄、QR の閉鎖、再生成、Host 終了、20 分満了のうち最も早い時点である。 | 否である。 |
| 近距離探索メタデータ | `L3` | OS の近距離通信または同一 LAN の通信層が生成する。 | 一時的な接続候補と通信層アドレスである。 | OS とアプリのメモリだけである。 | OS、ルーター、接続先端末である。 | 接続試行中だけである。 | 接続成立、失敗、キャンセル、退出、Host 終了、20 分満了のうち最も早い時点である。 | 否である。 |
| Lounge セッション状態 | `L3` | Host と参加 Pet が QR 検証後に生成する。 | 一時 Lounge nonce、参加状態、Host の使用済み capability digest 集合、満了期限、`retired` 状態である。 | アプリのメモリだけである。 | 認証済みの参加 Pet である。使用済み capability digest 集合は Host だけである。 | 生成から最大 20 分である。 | 退出、Host 終了、全 Pet の `retired`、20 分満了のうち最も早い時点である。 | 否である。 |
| 暗号鍵と Replay 防止状態 | `L3` | QR の一時公開鍵と各 Pet の一時鍵から生成する。 | セッション鍵、message nonce、受理済み sequence である。 | アプリのメモリだけである。 | 鍵自体は共有せず、公開鍵だけを参加 Pet と共有する。 | Lounge セッションと同じである。 | 退出、Host 終了、20 分満了、プロセス終了のうち最も早い時点でゼロ化して参照を破棄する。 | 否である。 |
| Owner Question | `L3` | 端末内 Pet が Bridge 判定に不可欠な不明点から最大 1 問生成する。 | カタログ版で定義した質問 ID と表示文である。 | アプリのメモリだけである。 | 自分の Owner の画面だけである。 | 自分の Lounge 参加中だけである。 | 回答、`decline`、`no-signal`、`retired`、退出、Host 終了、20 分満了のうち最も早い時点である。 | 否である。 |
| Owner Answer | `L3` | Owner が `yes`、`no`、`decline` から明示選択する。 | 質問 ID、選択値、当該 Lounge での共有同意である。 | アプリのメモリだけである。 | 同意された `yes` または `no` だけを確認済みの手掛かりとして参加 Pet と共有できる。 | Bridge 判定と許可済み共有が終わるまで、かつ自分の Lounge 参加中だけである。 | 判定と共有の完了、`no-signal`、`retired`、退出、Host 終了、20 分満了のうち最も早い時点である。 | 否である。 |
| Pet Message | `L3` | 参加 Pet が Lounge 内で生成する。 | メッセージ種別、Public Passport の手掛かり、同意済み Owner Answer、一時 sequence である。 | 送受信キューを含むアプリのメモリだけである。 | 認証済みの参加 Pet である。 | Lounge セッションと同じである。 | 処理完了後に本文を解放し、遅くとも退出、Host 終了、20 分満了で全件破棄する。 | 否である。 |
| 端末内推論データ | `L3` | 端末内 Pet が Public Passport、Pet Message、Owner Answer から生成する。 | 構造化入力、token buffer、候補、検証前のモデル出力である。 | アプリのメモリと GGUF runtime のメモリだけである。 | 外部とは共有しない。 | 1 回の推論処理中だけである。 | 推論完了、失敗、キャンセル、退出、Host 終了、20 分満了のうち最も早い時点である。 | 否である。 |
| Bridge | `L3` | 端末内 Pet が確認済みの手掛かりから生成し、検証する。 | 最大 1 件の主要 Bridge と根拠に使った一時参照である。 | アプリのメモリと Owner の画面だけである。 | 自分の Owner だけである。 | Owner が表示を閉じるまで、かつ Lounge セッションの期限内である。 | 画面を閉じる操作、退出、Host 終了、20 分満了のうち最も早い時点である。 | 否である。 |
| `no-signal` と `retired` | `L3` | 端末内 Pet の状態機械が生成する。 | 現在の参加に限る結果と終端状態である。 | アプリのメモリと Owner の画面だけである。 | 自分の Owner と終了同期が必要な参加 Pet である。 | Lounge セッションと同じである。 | 画面終了、退出、Host 終了、20 分満了、プロセス終了のうち最も早い時点である。 | 否である。 |
| 端末設定 | `L1` | Owner の設定操作とアプリが生成する。 | 言語、アクセシビリティ、選択中のモデル digest、カタログ版である。 | OS のアプリ専用保護領域である。 | Owner と端末内アプリだけである。 | 設定の変更または初期化までである。 | 設定初期化、モデル解除、アプリ削除である。 | 可である。ただし端末パスは含めない。 |
| GGUF モデルファイル | `L0` | Owner が Files から手動で選ぶ。アプリは入手元を信頼済みと判定しない。 | モデル本体である。Size と digest は private Manifest に分離する。 | OS のアプリ専用モデル領域である。 | 端末内推論 runtime だけである。 | Owner が置換または削除するまでである。 | モデル削除、検証失敗時の隔離、アプリ削除である。 | 否である。 |
| モデル検証記録 | `L1` | アプリが GGUF の検証時に生成する。 | digest、サイズ、検証結果、検証したアプリ版である。 | OS のアプリ専用保護領域である。 | Owner と端末内アプリだけである。 | モデルの置換またはアプリ更新後の再検証までである。 | モデル削除、置換、設定初期化、アプリ削除である。 | 可である。 |
| Local Model Benchmark | `L1` | Owner が開始した Import または端末内推論に伴いアプリが生成する。 | Model digest、Import / Load / First Token / Completion 時間、Peak Process Memory、Thermal、Battery Delta である。推論内容と端末識別子は含まない。 | OS のアプリ専用保護領域である。 | Owner と端末内アプリだけである。 | Model ごとに直近 20 件である。 | Model 削除、計測記録削除、設定初期化、アプリ削除である。 | 否である。 |
| 手動 JSON バックアップ | `L4` | Owner が Export を明示実行する。 | バックアップ schema 版、Local Private Profile、端末設定、モデル検証記録である。 | Owner がファイル選択画面で指定した保存先である。 | Owner と保存先を扱えるアプリまたはサービスである。 | Export 後は Owner が削除するまでである。 | Owner が保存先から削除する。アプリ内一時データは完了、取消、失敗、再起動で破棄する。 | 対象そのものである。 |
| 実行時 Security Signal | `L3` | schema、認証、Replay、モデル出力の検証失敗が生成する。 | 内容を持たない失敗種別と現在の Lounge 内回数である。 | アプリのメモリだけである。 | Owner の警告画面だけである。 | Lounge セッションと同じである。 | 退出、Host 終了、20 分満了、プロセス終了のうち最も早い時点である。 | 否である。 |

通信層アドレスは OS とネットワーク機器から見える場合があるが、QR、Public Passport、
Pet Message、ログ、バックアップのアプリケーションデータへ複製しない。

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

QR の外枠は Public Passport に加え、使い捨て Lounge nonce、参加 capability、
一時公開鍵、発行時刻、満了時刻を
持つ。これらは Lounge をまたいで再利用しないため安定 ID ではなく、Public Passport の
フィールドにも昇格させない。

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

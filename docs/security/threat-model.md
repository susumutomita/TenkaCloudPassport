# TenkaCloud Passport 脅威モデル

本書を TenkaCloud Passport の Privacy と端末間通信に関する脅威評価の日本語正本とする。
対象データは [Privacy データ台帳](../privacy/data-inventory.md)、削除時系列は
[保持ポリシー](../privacy/retention-policy.md) に従う。

## 守る対象

- Local Private Profile と端末設定が Owner の端末外へ意図せず出ないことである。
- Public Passport が Owner の確認した最小の手掛かりだけを含むことである。
- Lounge セッション、Owner Answer、Pet Message、Bridge が認証済み参加者以外へ開示されず、
  改ざんまたは再利用されないことである。
- Lounge 由来データが退出、Host 終了、20 分満了のうち最も早い時点で消え、再起動後に
  復元されないことである。
- GGUF モデルとその出力を信頼済みコードや確認済み事実として扱わないことである。
- 手動 JSON バックアップが Owner の明示操作なしに作成または共有されないことである。
- Pilot Event Aggregate が個別 Event、正確な時刻、安定 ID、内容を持たず、最低集計単位未満で共有されない
  ことである。

可用性を妨げる電波妨害、端末 OS 自体の侵害、Owner が意図して画面またはバックアップを公開する行為は、
アプリだけでは防げない。ただし安全でない入力を受けた場合は Bridge を無理に生成せず、
`no-signal` または Lounge 終了へ安全側に倒す。

## 信頼境界

| 境界 | 信頼するもの | 信頼しないもの | 必須の制御 |
| --- | --- | --- | --- |
| Owner と画面 | 現在の端末を操作して公開を確認した Owner の操作である。 | 周囲の視線、画面撮影、誤操作、OS の通知 preview である。 | 公開前確認、秘密画面の自動 mask、QR の短時間表示、画面終了である。 |
| アプリと端末 OS | OS のアプリ sandbox、保護ストレージ、暗号 API、単調増加時計である。 | root 化端末、解除済み紛失端末、OS 全体の侵害である。 | アプリ専用領域、端末保護、Lounge のメモリ限定処理である。 |
| QR の表示と読み取り | schema 検証を通った版、上限、期限、1 回限り Secret、Transport Fingerprint である。 | QR の作成者、内容、URL、命令文、撮影者である。 | strict schema、サイズ上限、Host 基準の期限、使い捨て Secret、URL 非対応である。 |
| 近距離通信と同一 LAN | 認証済み暗号化チャネルの暗号検証結果である。 | 通信相手、LAN 利用者、ルーター、探索情報、平文通信である。 | 一時鍵、相互認証、AEAD、sequence、Replay 拒否、平文 fallback 禁止である。 |
| 参加 Pet と参加者 | 暗号化チャネル上で検証した一時的な参加状態である。 | 相手の自己申告、Public Passport の客観的真実、相手 Pet のモデル出力である。 | 来歴検証、参加表示、Host 終了、最小開示である。 |
| アプリと GGUF | digest と形式検証を通ったモデルファイルである。 | モデルの出力、モデル内の指示、改ざん済みファイル、parser 入力である。 | digest allowlist、サイズ上限、隔離 runtime、出力 schema と根拠検証である。 |
| アプリとバックアップ保存先 | Owner が OS の保存画面で選んだ 1 回の書き込み先である。 | 保存先の同期、共有権限、履歴、外部アプリ、Import ファイルである。 | 明示確認、allowlist Export、strict Import、一時データ破棄である。 |
| アプリと Pilot 調査 | Research 参加を別に明示した Participant と、固定 Counter の Schema である。 | Research Consent から Product Consent を推測すること、Facilitator の記憶、少人数 Aggregate、自動収集基盤である。 | Consent 分離、Memory-only Counter、最低 5 Outcome、Preview 後の手動 Share、内容なし Observation Sheet である。 |

中央サーバー、Analytics、外部推論 API は信頼境界へ置かない。中核フローはこれらへの通信を
必要とせず、アプリは GitHub Token を要求または保存しない。

## 想定する脅威源

- QR を差し替える人、Lounge へ無断参加を試みる人、認証済みだが悪意のある参加者である。
- 同一 LAN 上で探索、盗聴、改ざん、Replay を試みる利用者またはネットワーク機器である。
- Prompt Injection を含む Public Passport、Owner Answer、Pet Message、GGUF 出力である。
- 端末を拾得または盗取した人、画面を肩越しに見る人である。
- 改ざん、不正形式、過大サイズの GGUF モデルまたは JSON バックアップである。

## リスク評価

可能性と影響を低、中、高の 3 段階で評価する。Risk は制御を実装する前の組み合わせであり、
残余リスクは制御後にも残る条件を表す。

| 脅威 | 攻撃または失敗シナリオ | 可能性 | 影響 | Risk |
| --- | --- | --- | --- | --- |
| 端末紛失 | 解除済み端末またはバックアップから Local Private Profile と設定を読む。 | 中 | 高 | 高である。 |
| 肩越し閲覧 | QR、Owner Question、Owner Answer、Bridge を周囲から見るか撮影する。 | 高 | 中 | 高である。 |
| 悪意ある QR | 過大、不正 schema、期限切れ、URL、命令文を含む QR で crash、誘導、参加先差し替えを狙う。 | 高 | 高 | 高である。 |
| Prompt Injection | Public Passport、Pet Message、GGUF が Pet に命令し、秘密の開示や根拠のない Bridge を狙う。 | 高 | 高 | 高である。 |
| Lounge 侵入 | QR の盗み見、推測、再配布により許可されていない Pet が参加する。 | 中 | 高 | 高である。 |
| Replay | 過去の QR、参加 capability、Pet Message、終了通知を再送して状態や Bridge を再現する。 | 高 | 高 | 高である。 |
| パケット盗聴 | 同一 LAN 利用者が手掛かり、Owner Answer、Bridge、通信相手を観測する。 | 高 | 高 | 高である。 |
| 改ざん済み GGUF | 改ざんモデルが不正出力、過大消費、runtime の脆弱性悪用を狙う。 | 中 | 高 | 高である。 |
| バックアップ誤公開 | 平文 JSON バックアップを共有フォルダー、公開リポジトリ、誤った相手へ保存する。 | 中 | 高 | 高である。 |
| 診断情報の過剰開示 | 障害調査 Report に内容、識別子、Model Path、Network metadata、秘密が混入する。 | 中 | 高 | 高である。 |
| 全削除の中断 | 複数保存先の削除途中で Process または Storage が失敗し、一部 Data が次回起動で復元される。 | 中 | 高 | 高である。 |
| Pilot Aggregate からの推測 | 少人数の Outcome、duration Bucket、Self-report と会場の知識を組み合わせ、個人の回答を推測する。 | 中 | 高 | 高である。 |
| Research Consent の強制 | Research 拒否や Self-report 未回答を Product 利用、退出、支援の条件にする。 | 中 | 高 | 高である。 |

## 脅威別の対策

| 脅威 | 予防 | 検出 | 回復 | 残余リスク |
| --- | --- | --- | --- | --- |
| 端末紛失 | OS の端末ロックとアプリ専用保護領域を使い、Lounge データをメモリだけで扱う。通知とタスク切替画面へ内容を出さない。 | アプリ起動時に OS の保護状態を確認し、保護を利用できない場合は Local Private Profile とバックアップの Import を開かない。 | Owner は OS の端末探索と遠隔消去を使う。新端末へは Owner が保持する最小のバックアップだけを Import する。 | 解除済み端末、OS 侵害、外部に保存済みのバックアップはアプリから回収できない。 |
| 肩越し閲覧 | QR は参加受付中だけ表示し、Owner Answer と Bridge はデフォルトで mask して明示操作中だけ表示する。画面収録と task snapshot は OS が許す範囲で抑止する。 | 受動的な目視と外部カメラはアプリから検出できない。QR の読み取りと参加要求は補助的な異常として即時表示し、想定外の参加数を Owner が確認する。 | Host は直ちに Lounge を終了し、新しい nonce と一時鍵で QR を再生成する。Local Private Profile の公開選択も見直す。 | 目視、外部カメラ、Owner が表示を許した時間の撮影は防げない場合がある。 |
| 悪意ある QR | QR は JSON 以外の URL や命令を開かず、strict schema、型、版、長さ、配列数、総 byte、20 分以内の期限を検証する。読み取りだけで通信または推論を開始しない。 | 検証失敗理由を内容なしの Security Signal として現在の画面に表示し、同じ nonce の反復を Lounge 中だけ数える。 | 入力を破棄し、既存 Lounge と Local Private Profile を変更せず、Owner に正規 QR の再提示を求める。 | 対応 schema 内の有害な意味内容と、正規 QR 自体の差し替えは構文検証だけでは判別できない。 |
| Prompt Injection | 外部文字列を命令として prompt へ連結しない。Pet Name、Alias、Owner Answer を除外し、Domain が再導出した canonical Evidence ID だけを System Instruction とは別 Message で渡す。モデルには network、file、tool、バックアップ、Profile の操作権限を与えず、Tool Definition を空にする。 | Input の Unicode 制御、byte、深さ、node、strict field を検証する。出力を strict schema、根拠集合、Bridge 上限で検証し、未確認の手掛かり、連絡先、URL、命令文、Tool Call を含む出力全体を拒否する。 | 推論状態と出力を破棄し、その参加者へ Rules Provider の `no-signal` または検証済み Bridge を Encounter ごとに 1 回だけ返す。攻撃 Text をモデルへ再投入しない。 | 許可済み Evidence ID の範囲で不適切な選択をする可能性は残るため、Owner の表示前確認と実 GGUF の実機 Corpus Gate を維持する。 |
| Lounge 侵入 | 参加 Pet ごとに 1 回限りの Secret と QR を発行し、HMAC Proof と Transport Fingerprint を照合してから Host が使用済みへ原子的に遷移する。安定 ID を参加判定に使わない。 | Host と参加 Pet に現在の参加数、追加、離脱を表示し、Secret の二重利用と認証失敗を検出する。 | Host は Lounge を終了し、すべてのローカルデータを削除する。続行する場合は新しい Secret と QR へ Rotation する。 | QR を正規に受け取った悪意ある参加者は Public Passport を見られ、他の参加者へ内容を口頭で伝えられる。 |
| Replay | Lounge ごとに暗号学的乱数の nonce、Participant ID、Join Secret を生成し、Join Proof を Lounge、Participant、期限、Capability、Transport Fingerprint に結び付ける。各 Pet Message は Message ID、単調増加 sequence、Transport の nonce、認証 tag に結び付ける。Host は検証開始を同期的に予約し、成功後に Secret Key Buffer を上書きする。 | Host の `verifying` / `used` 状態と、各端末の受理済み Message ID、sequence、期限、Transport 認証により、二重参加、重複、順序戻り、別 Lounge の message を拒否する。 | 該当接続を閉じ、鍵とキューを破棄する。状態に矛盾があれば Lounge 全体を終了する。再参加には Host が発行する新しい Secret を必要とする。 | Guest の端末時刻は最終判定に使わず Host の期限へ収束する。Host の再起動後は状態を復元せず、Secret Key を失った以前の Lounge 全体を無効にする。 |
| パケット盗聴 | QR の Join Proof と Transport Fingerprint を、採用 Transport が標準暗号で確立した Channel に結合する。全 Pet Message と終了通知を Transport が暗号化し、平文 fallback、外部 relay、外部推論 API を持たない。 | 改ざんを伴わない受動的な盗聴はアプリから検出できない。Transport の認証 tag、Fingerprint、sequence の検証失敗は能動的な改ざんの補助 Signal として接続を閉じる。 | Lounge を終了し、鍵を破棄して新しい QR で再作成する。 | 通信量、時刻、通信層アドレス、同一 LAN 上に端末がいる事実などのメタデータは OS とネットワーク機器から見える場合がある。 |
| 改ざん済み GGUF | 対応形式、最大サイズ、digest allowlist を満たすモデルだけを、network、ファイル書き込み、アプリ状態変更の権限を持たない隔離 runtime で開く。 | 読み込み前とアプリ更新後に digest と構造を再検証し、runtime crash、資源上限超過、schema 外出力を失敗として扱う。 | モデルを無効化して隔離し、Owner に削除または既知 digest のモデルへの置換を求める。Lounge は `no-signal` または終了とする。 | GGUF parser と推論 runtime の未知の脆弱性、正規モデルの不適切な出力、入手元の侵害は残る。 |
| バックアップ誤公開 | Export 対象を allowlist に固定し、Lounge データ、GGUF、端末パス、識別子を除外する。保存前に平文 JSON と保存先の管理責任を表示し、自動同期や自動 upload を行わない。 | Export 後の誤公開はアプリから検出できない。Export 前 preview と件数は誤操作の補助シグナルとし、Owner は保存先の共有状態を確認する。Import は strict schema で未知フィールドと Lounge 由来フィールドを拒否する。 | Owner は保存先の共有を解除してファイルを削除し、必要なら Local Private Profile の内容を変更する。アプリ内一時 copy は直ちに破棄する。 | 保存先の履歴、同期先、受信者の copy、公開済みリポジトリからの回収は困難である。 |
| 診断情報の過剰開示 | Report は strict allowlist とし、正確な時刻、内容、識別子、Path、IP / SSID / 位置、Key / Token を型で表現しない。 | Snapshot と strict parser で未知 field と禁止語彙を拒否し、Preview で全項目を Owner に示す。 | Preview を破棄し、固定 Error Code と Recovery だけで再生成する。 | Owner が共有した Report の保存先と受信者 copy はアプリから回収できない。 |
| 全削除の中断 | write-ahead tombstone を物理削除より先に永続化し、以後の復元を閉じる。削除対象の Snapshot は作らない。 | 起動時に tombstone を Profile load より先に確認し、残る Resource 件数を内容なしで検査する。 | 各 Resource の削除を冪等に再開し、全件 0 の確認後だけ tombstone を消す。 | OS 自体の侵害、filesystem snapshot、Owner が外部保存した Backup はアプリ内全削除の対象外である。 |
| Pilot Aggregate からの推測 | 個別 Event と正確な時刻を持たず、duration を即 Bucket 化し、Outcome 5 件未満では JSON を生成しない。Aggregate を地域、会場、人物の Ranking に使わない。 | strict parser と禁止 field Test で Schema を固定し、Preview で全 field を確認する。 | 少人数、禁止 field、Consent 逸脱を認識したら Export と Pilot 拡大を停止し、未共有 Counter を Process Memory から消す。 | 5 件でも会場の知識との組合せによる推測は残り、手動共有後の copy は回収できない。 |
| Research Consent の強制 | Research と Product の Script / UI を分離し、Research 拒否でも Product を利用できる。Self-report に「回答しない」と即時 Skip を置く。 | 第三者 Dry Run と Observation Sheet で Consent 混同、未回答者の待機を確認する。 | 混同が 1 件でもあれば新規 Session と拡大を停止し、Script / UI を改訂して再 Dry Run する。 | Facilitator の口頭圧力や周囲の同調圧力をアプリだけで完全には検出できない。 |

## 横断的な検証規則

- QR、バックアップ、Pet Message、モデル出力はすべて外部入力として、利用前に strict schema で検証する。
- 不明なフィールドを無視して処理を続けず、入力全体を拒否する。
- 失敗時に Local Private Profile、Public Passport、既存バックアップを変更しない。
- Security Signal に入力本文、手掛かり、鍵、端末情報、通信層アドレスを含めず、Lounge 終了時に消す。
- 検出不能または根拠不足の場合は Bridge を生成せず、`no-signal` または Lounge 終了を選ぶ。
- 依存関係と通信先の検査で Analytics SDK と外部推論 API が存在しないことを継続確認する。
- Pilot Measurement module は `fetch`、`XMLHttpRequest`、`WebSocket`、自動送信 URL を持たず、既存の
  Share Sheet Port を Preview 後の明示操作からだけ呼ぶ。

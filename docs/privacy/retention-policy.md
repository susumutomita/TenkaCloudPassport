# Privacy 保持ポリシー

本書を TenkaCloud Passport のデータ保持、削除、再起動時の扱いに関する日本語正本とする。
データ項目と Export 可否は [Privacy データ台帳](./data-inventory.md) に従う。

## 基本原則

- `L3` の Lounge 由来データは永続ストレージ、ファイル、ログ、クラッシュレポートへ書き込まない。
- 各端末は他端末からの終了通知に依存せず、自分の期限と状態遷移で削除を完了する。
- Lounge 由来データは、Owner の退出、Host 終了、生成から 20 分満了のうち最も早い時点で破棄する。
- Pet が Bridge を表示または `no-signal` を確定して `retired` になった後は、追加の質問、推論、
  Pet Message を停止する。Owner が表示中の結果は退出、Host 終了、20 分満了まで延長しない。
- Public Passport、Owner Answer、Pet Message、Bridge を Local Private Profile またはバックアップへ
  自動保存しない。再利用には Local Private Profile での新しい明示操作を必要とする。

## Lounge の期限

Host は Lounge セッションの作成時に、使い捨て Lounge nonce、一時鍵、`issuedAt`、
`expiresAt` を生成する。`expiresAt` は `issuedAt` の 20 分後を超えてはならない。Host は
参加 Pet ごとに 1 回限りの参加 capability を生成し、未使用の capability を持つ QR を一度に
1 つだけ表示する。受理、閉鎖、期限切れの後に別の Pet を迎える場合は、新しい capability で
QR を生成する。参加 Pet は
QR を読み取った時点で次の条件をすべて検証し、1 つでも満たさない場合は参加しない。

- schema とプロトコル版が対応範囲内である。
- QR 全体、Public Passport、配列、文字列が実装上の上限以内である。
- `expiresAt` が `issuedAt` より後で、差が 20 分以下である。
- `expiresAt` が端末の許容する時刻ずれを含めても満了していない。
- Lounge nonce、参加 capability、一時公開鍵が schema の長さと形式を満たす。

Host は handshake 時に capability が未使用で期限内であることをメモリ内で確認し、参加を許可する
前に raw token を破棄して一方向 digest だけを使用済み集合へ原子的に追加する。参加 Pet は Host が
QR 内の一時公開鍵に対応する秘密鍵を持つことを検証する。参加 Pet の過去履歴を capability の
使用済み判定には使わない。

参加後は壁時計の変更で期限を延長できないよう、単調増加時計で残り時間を減らす。ローカル削除
期限は、検証済み `expiresAt` と参加端末で計測する残り時間のうち早い方とする。端末時刻のずれが
許容範囲を超える場合は期限を推測せず、参加を拒否して QR の再生成を求める。

## 削除契機と順序

削除処理は何度実行しても同じ終端状態になるようにし、次の順序で行う。

1. 新しい QR 読み取り、Pet Message 送受信、Owner Question、推論の受付を停止する。
2. 通信チャネルを閉じ、未送信と未処理のキューを破棄する。
3. 未使用の参加 capability、使用済み capability digest 集合、セッション鍵、一時秘密鍵、nonce、sequence、
   受理済み Replay 集合への参照を破棄する。
4. Owner Question、Owner Answer、Pet Message、推論 buffer、候補、Bridge の本文を破棄する。
5. Public Passport、QR bitmap、Lounge セッション、Security Signal、結果状態を破棄する。
6. Lounge 由来データが永続ストレージとバックアップの対象に存在しないことを確認して終了する。

言語 runtime や OS が物理メモリを直ちに上書きすることは保証できない。鍵を保持する mutable buffer は
利用後にゼロ化し、その他の値は参照とキャッシュを残さない。スワップ、プロセス dump、端末全体の
メモリ保護は OS の保護機能に依存する。

## データ種別ごとの保持

| データ群 | 保持上限 | 削除契機 | 再起動後 | バックアップ |
| --- | --- | --- | --- | --- |
| Local Private Profile | Owner が削除するまでである。 | 個別削除、Profile 初期化、アプリ削除である。 | 復元できる。 | 明示 Export の対象である。 |
| Public Passport と QR 参加情報 | 生成から最大 20 分である。 | QR の閉鎖、再生成、退出、Host 終了、20 分満了のうち最も早い時点である。 | 復元しない。 | 対象外である。 |
| Lounge セッションと暗号材料 | 生成から最大 20 分である。 | 退出、Host 終了、全 Pet の `retired`、20 分満了、プロセス終了のうち最も早い時点である。 | 復元しない。 | 対象外である。 |
| Owner Question | 回答または `decline` まで、かつ自分の Lounge 参加中だけである。 | 回答、`decline`、`no-signal`、`retired`、退出、Host 終了、20 分満了の契約に従う。 | 復元しない。 | 対象外である。 |
| Owner Answer | Bridge 判定と許可済み共有が終わるまで、かつ自分の Lounge 参加中だけである。 | 判定と共有の完了、`no-signal`、`retired`、退出、Host 終了、20 分満了の契約に従う。 | 復元しない。 | 対象外である。 |
| Pet Message と推論データ | 処理中かつ Lounge 参加中だけである。 | 処理完了、失敗、キャンセル、`retired`、退出、Host 終了、20 分満了の契約に従う。 | 復元しない。 | 対象外である。 |
| Bridge、`no-signal`、`retired` | 結果画面を閉じるまで、かつ Lounge セッションの期限内である。 | 画面終了、退出、Host 終了、20 分満了の契約に従う。 | 復元しない。 | 対象外である。 |
| 端末設定とモデル検証記録 | 設定変更または初期化までである。 | 設定初期化、モデル解除、アプリ削除である。 | 復元できる。 | allowlist 内の項目だけが対象である。 |
| GGUF モデル | Owner が置換または削除するまでである。 | 削除、検証失敗時の隔離、置換、アプリ削除である。 | 検証後に利用できる。 | 対象外である。 |
| アプリ内のバックアップ一時データ | Export 処理中だけである。 | 完了、取消、失敗、プロセス終了のうち最も早い時点である。 | 復元しない。 | 一時データ自体は対象外である。 |
| Owner が保存した JSON バックアップ | アプリは期限を管理できない。 | Owner が保存先から削除する。 | 保存先の機能に依存する。 | 対象そのものである。 |

## 終了、期限切れ、再起動後に復元してはいけないデータ

次のデータには永続化 adapter、再水和処理、履歴画面、最近使った項目、復旧 snapshot を設けない。

- Public Passport と QR bitmap、参加 capability、使い捨て Lounge nonce、一時公開鍵である。
- Lounge セッション、参加者の一時状態、一時秘密鍵、セッション鍵である。
- message nonce、sequence、受理済み Replay 集合、送受信キューである。
- Owner Question、Owner Answer、共有同意、回答から導いた手掛かりである。
- Pet Message、Pet 間の会話、端末内推論の入力、token buffer、候補、モデル出力である。
- Bridge と根拠参照、`no-signal`、`retired`、Security Signal である。
- QR と近距離通信から得た通信層メタデータである。

アプリの強制終了、OS によるプロセス終了、クラッシュ、端末再起動の後は、以前の Lounge を
`expired` とみなす。参加 Pet の再起動後は以前の接続を再開せず、再参加には稼働中の Host が
発行する新しい capability を必要とする。Host は同じ Lounge の使用済み capability を拒否する。
Host の再起動後は一時秘密鍵と Lounge セッションが失われるため、写真に残った QR との
handshake を成立させず、Owner が新しい Lounge nonce と一時鍵で Lounge を作り直す。

## 退出と Host 終了

Owner が退出を選んだ端末は、終了通知の送信成否を待たずローカル削除を開始する。Host 終了は
認証済みチャネルで参加 Pet へ通知するが、通知を受信できない端末もローカル期限で必ず削除する。
Host がクラッシュした場合、参加 Pet は切断を終了契機として扱い、20 分を待たず削除する。

すべての Pet が `retired` になったことを確認した Host は Lounge を閉じる。確認できない Pet が
あっても 20 分満了を超えて待機せず、残存データを破棄する。

## バックアップの保持境界

Export は Owner の明示操作、対象の確認、OS の保存先選択を順に要求する。JSON が平文であり、
選択した保存先の同期、共有、版管理、削除の挙動はアプリの管理外になることを保存前に表示する。
アプリは自動バックアップ、自動 upload、最近の Export 内容を保持しない。

Import は strict schema で未知フィールドを拒否し、Lounge 由来フィールドを無視して続行しない。
検証に失敗したバックアップは取り込まず、既存の Local Private Profile と端末設定を変更しない。

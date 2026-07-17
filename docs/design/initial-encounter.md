# 初回 Encounter の設計

本書は、Owner が Passport を作成してから、単一端末 Lounge の結果を確認し、Lounge 由来データを
完全破棄するまでの設計を定める。用語は [用語集](../product/glossary.md)、行動は
[プロダクト契約](../product/product-contract.md)、保持期限は
[保持ポリシー](../privacy/retention-policy.md) を正本とする。

## 対象範囲

Issue 4 では iOS、Android、Web で共通する最初の縦断フローを作る。端末間通信、QR、暗号鍵、
GGUF モデルの配置、Native runtime の接続は対象外とする。単一端末 Lounge では、Owner 自身の
Passport と、実在する相手がその場で公開した Passport のカタログ項目を同じ端末へ入力する。
Demo Peer、組み込みプロフィール、架空の接触履歴は使わない。

## 体験の流れ

1. Owner は版管理済みの手掛かりカタログから候補を選ぶ。自由記述、氏名、連絡先、位置情報、
   URL は入力できない。
2. Owner は現在の Encounter で公開する 1 件以上 3 件以下を確認し、Local Private Profile に
   公開選択を記録する。この時点では Public Passport を投影しない。
3. 同じ端末で、相手がその場で公開した 1 件以上 3 件以下のカタログ項目を入力し、公開確認を行う。
4. アプリは Lounge の開始操作で 2 つの Public Passport を投影し、メモリだけに保持する。開始時に
   壁時計の 20 分後と単調増加時計の 20 分後を期限として記録する。
5. Owner が判定すると、Rules Provider は両 Passport の確認済み手掛かりを比較する。
6. 共通する手掛かりがあれば、そのうちカタログ順で最初の 1 件だけから主要 Bridge を生成する。
   共通する手掛かりがなければ、推測せず `no-signal` を返す。
7. 結果の確定直後に Pet は `retired` になる。Passport と判定入力への参照を破棄し、再判定、
   追加説明、継続チャットを受け付けない。
8. Bridge はデフォルトで mask し、Owner の明示操作中だけ表示する。アプリが inactive または
   background へ移った場合は直ちに再び mask する。`no-signal` は機密 Bridge を含まないためそのまま表示する。
9. Owner が結果画面を閉じると、結果を含む Lounge 由来データを完全破棄する。退出、Host 終了、
   20 分満了も同じ削除契機とする。終了処理は複数回呼ばれても同じ破棄済み状態を返す。

## 状態機械

| 状態 | 保持できる値 | 許可する操作 | 次の状態 |
| --- | --- | --- | --- |
| Passport 編集中 | Local Private Profile の候補である。 | 候補選択、公開確認である。 | Lounge 準備である。 |
| Lounge 準備 | 公開前確認中の 2 つの Passport である。 | Lounge 開始、取消である。 | `active` または Passport 編集中である。 |
| `active` | 2 つの Public Passport、開始時刻、期限である。 | Rules 判定、退出、Host 終了、期限確認である。 | `retired` または `destroyed` である。 |
| `retired` | mask 済みの Bridge または `no-signal` 1 件と期限だけである。 | Bridge の一時表示と再 mask、結果終了、退出、Host 終了、期限確認である。 | `destroyed` である。 |
| `destroyed` | 非機密な終了理由だけである。 | 新しい Encounter の開始である。 | Passport 編集中である。 |

`retired` は Pet の終端状態であり、Lounge 由来データの保持を許す状態ではない。結果画面に必要な
単一結果だけを期限内に保持し、Public Passport、相手の手掛かり、候補、判定入力は残さない。

## Domain と UI の境界

`src/domain/` は React、React Native、Expo、時刻 API に依存しない。時刻は UI から壁時計と
単調増加時計の値を渡し、Domain が最早期限を判定する。Domain は次の責務に分ける。

- Passport はカタログ検証、重複拒否、明示確認、最大 3 件の公開投影を担当する。
- Bridge は確認済みの共通手掛かりだけから単一メッセージを生成する。
- Rules Provider は Bridge または `no-signal` の二者択一を返す。
- Lounge は開始、判定、`retired`、退出、Host 終了、20 分満了、完全破棄を担当する。

Screen は入力と状態表示だけを担当し、iOS、Android、Web の entry point は同じ App と Screen を
登録する。Bridge の表示状態は結果画面の一時的な UI state とし、初期値とバックグラウンド遷移時は
mask にする。Lounge 由来データを永続ストレージ、URL、ログ、Analytics へ送らない。

## Rules Provider と Local Agent

Expo Go / Web のデフォルト Provider は Rules Provider とする。Rules Provider は端末外へ通信せず、
カタログ ID の完全一致だけを根拠にするため、根拠がない場合は必ず `no-signal` になる。

Local Agent は Rules Provider と同じ結果契約へ接続できる interface を持つ。`llama.rn` の import は
Development Build 専用の composition root が渡す非同期 loader の中に閉じ込める。Issue 4 では
`llama.rn` の依存も composition root も追加しないため、Expo Go / Web の module graph は Native
module を解決しない。loader は最初の生成要求まで呼ばれず、読み込み結果を同一 instance 内で再利用する。

## 代替案

### Expo アプリを workspace に置く案

将来複数アプリを持つ場合は境界が明確になる。一方、現在は単一アプリであり、root から Metro の
探索範囲、asset path、TypeScript 設定、Bun script を二重に管理する。Hono / Vite workspace を
残す理由もないため採用しない。

### `llama.rn` を直接 import する案

Native 実装の接続点は明快になるが、Expo Go では動かず、依存がない Issue 4 の時点で Metro と
Web Bundle の解決を壊す。Development Build 専用 composition root が loader を注入する方式を選ぶ。

### Rules Provider が候補を複数提示する案

Owner に選択肢を与えられるが、参加者ごとの主要 Bridge を 1 つに制限するプロダクト契約に反する。
決定的なカタログ順で 1 件だけを返し、根拠がなければ `no-signal` とする。

### 結果履歴を端末へ保存する案

再表示と障害調査は容易になるが、Lounge を使い捨てにし、再起動後に復元しない保持契約に反する。
結果は現在の Lounge のメモリと画面だけに置き、終了時に破棄する。

## エッジケース

- 公開項目が 0 件、4 件以上、重複、カタログ外、Owner の未確認であれば Passport を作らない。
- 相手の公開確認がない場合は Lounge を開始しない。
- 共通項目が複数あっても主要 Bridge は 1 件だけにする。
- 共通項目がなければ正常結果として `no-signal` を返す。
- Bridge または `no-signal` の確定後に判定を再要求された場合は拒否する。
- Bridge の表示前、明示的な再 mask 後、アプリの inactive / background 遷移後は内容を表示しない。
- 壁時計が戻っても、単調増加時計の経過が 20 分へ達したら破棄する。
- 壁時計が先に 20 分後へ達した場合も、単調増加時計を待たず破棄する。
- 退出または Host 終了が結果確定と競合しても、破棄済み状態を優先して結果を復元しない。
- 破棄処理が重複しても、最初の終了理由と破棄済み状態を維持する。
- アプリの再読み込み後は以前の Lounge を再水和せず、Passport 作成からやり直す。
- Local Agent の loader が失敗した場合は未検証出力を使わず、後続実装で `no-signal` または
  Lounge 終了へ安全側に倒す。

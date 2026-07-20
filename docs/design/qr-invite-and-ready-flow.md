# QR 招待・共有確認・Ready フローの設計

本書は Issue 8 の、閉じた Lounge への QR 招待、共有 Preview を挟んだ明示 Consent、
参加者全員が Ready になるまで Agent State Machine を動かさない Ready gating を定める。
用語は [用語集](../product/glossary.md)、保存と共有の境界は
[Privacy データ台帳](../privacy/data-inventory.md)、Lounge の状態機械は
[初回 Encounter の設計](./initial-encounter.md) を正本とする。

## 目的と対象範囲

対面会場で、Host が作った 20 分の Lounge へ Guest が QR 読取だけで安全に参加できるようにする。
QR 読取から参加確定までは、共有 Preview の確認と明示 Consent（Ready 操作）を必ず挟む。
参加者が 2 名かつ双方 Ready になるまで、既存の Lounge 状態機械（Rules Provider による判定と
Bridge / no-signal の確定）を開始しない。

M1 は単一端末で完結させる。実カメラでの走査、実ネットワーク Transport、複数デバイス間の
同期は対象外とし、`QrScannerPort` という型付き Port と、その M1 実装である in-process
adapter だけを用意する。M3 で Port の実装を実カメラ / 実 Transport へ差し替えても、
Screen と Domain の呼び出し方は変わらない。

## QR が運ぶ内容

QR は Versioned Public Passport または Versioned Lounge Invite だけを運ぶ。両者は
`src/protocol/qr-payload.ts` の共通 envelope（`TCPQ1:` という固定 Prefix + JSON）で
encode / decode する。

```text
TCPQ1:{"qrProtocolVersion":{"major":1,"minor":2},"kind":"lounge-invite","value":{...}}
```

`kind` が `lounge-invite` の場合、`value` は Host が `src/domain/lounge-invite.ts` の
`createLoungeInvite` で作る schema v2 です。Lounge ID、1 回限り Join Secret、短命な
Discovery Hint、Transport Fingerprint、発行時刻、20 分以内の期限、2〜6 名の定員、必須
Capability だけを持つ。詳細は
[一時 Lounge Handshake の設計](./secure-lounge-handshake.md)を正本とする。
安定 ID、Device ID、位置情報、連絡先はどちらの `kind` の `value` にも型として存在しない
（`src/protocol/qr-payload.test.ts` の Privacy 契約テストが、encode した QR の生文字列に
禁止語彙が含まれないことと、decode した `value` のキー集合が allowlist と一致することを
固定する）。

### 8 種類の型付き Error

`decodeQrPayload` と `joinLoungeRoom` は、受け入れ条件が挙げる 8 種類の異常を、
`QrPayloadError`（6 種類）と `LoungeRoomError`（該当する 2 種類）という別クラスの
型付き Error として区別する。

| 受け入れ条件の異常 | 型と code | 判定層 |
| --- | --- | --- |
| 非 Passport QR | `QrPayloadError('NOT_PASSPORT_QR')` | protocol（生文字列が `TCPQ` 系の Prefix を持たない） |
| 不正 Prefix | `QrPayloadError('INVALID_PREFIX')` | protocol（`TCPQ` 系だが厳密な `TCPQ1:` と一致しない） |
| 不正 JSON | `QrPayloadError('INVALID_JSON')` | protocol（Prefix 後の JSON.parse 失敗、または envelope 構造が不正） |
| 未知 Version | `QrPayloadError('UNKNOWN_VERSION')` | protocol（`qrProtocolVersion` 不一致、または内側 Schema Version 不一致） |
| 過大 Payload | `QrPayloadError('OVERSIZED_PAYLOAD')` | protocol（`QR_PAYLOAD_MAX_BYTES` = 1024 byte 超過） |
| 重複読取 | `QrPayloadError('DUPLICATE_SCAN')` | protocol（同じ生文字列が既読集合に存在） |
| 期限切れ | `LoungeRoomError('ROOM_EXPIRED')` | domain（Room の 20 分期限超過） |
| 満員 | `LoungeRoomError('ROOM_FULL')` | domain（定員 2 名に到達済み） |

decode 時の判定（非 Passport QR・不正 Prefix・不正 JSON・未知 Version・過大 Payload・
重複読取）は、Room の状態を必要としない純粋関数として protocol 層に置く。期限切れと
満員は Room の現在状態に依存するため、domain 層の `joinLoungeRoom` に置く。M3 の Guest は、
さらに Host の Handshake が Join Proof と Transport Fingerprint を検証した後だけこの関数へ
Public Passport を渡す。この分離により、QR の内容、参加認証、Room の現在状態を別の関心事として
検証できる。

## Lounge Room の Ready gating

`src/domain/lounge-room.ts` に、既存の 2 者間 Lounge（`src/domain/lounge.ts` の
`ActiveLounge` 以降）とは別の、参加者を集めて Ready を待つ前段の状態機械を追加する。

| 状態 | 保持する値 | 許可する操作 | 次の状態 |
| --- | --- | --- | --- |
| `forming` | Lounge ID、期限、0〜2 名の参加者（各人の Public Passport と Ready 可否）である。 | 参加、Ready 化、期限確認である。 | `forming`、`ready`、`expired` である。 |
| `ready` | 定員 2 名分の参加者とその Public Passport である。 | Agent State Machine（既存 Lounge）の開始である。 | （`startLoungeFromRoom` で既存 `ActiveLounge` へ移行し、この状態機械からは離れる）。 |
| `expired` | Lounge ID だけである。 | なし（終端）である。 | なし。 |

Rules Provider による判定は 2 者間の Bilateral 比較だけを扱うため、定員 `ROOM_CAPACITY` は
2 に固定する。「参加者が 2 名以上」という受け入れ条件は、この Issue の範囲では「ちょうど
2 名」として扱い、2 名を超える N 者間判定は Known follow-ups とする。

参加者が定員に達し、かつ全員が Ready になった時点でだけ `ready` へ遷移し、`ready` の
Room から `startLoungeFromRoom` を呼んで初めて、既存の Agent State Machine（Rules Provider
による判定を含む `ActiveLounge`）を開始する。`ready` になる前は、Host 側が 1 名だけ
Ready にしても `forming` のままであることを `src/domain/lounge-room.test.ts` と
`src/app/invite-lounge-flow.test.ts` で固定する。

`ready` へ遷移する瞬間の壁時計・単調増加時計は Room の作成時刻（Host が Invite を
発行した時刻）をそのまま引き継ぐ。Ready 化にかかった時間の分だけ Lounge の保持期限を
延長しない（Issue 4 で一度発生した「準備画面の滞在で期限が延びる」問題の再発防止）。

## Camera Permission と QrScannerPort

`src/app/qr-scanner-port.ts` に `CameraPermissionState`
(`not-determined` / `granted` / `denied` / `revoked` / `hardware-unavailable`) と
`QrScannerPort`（`getPermissionState` / `requestPermission` / `scan`）を定義する。
M1 の実装 `createInProcessQrScannerPort` は、同一端末内で Host が `publish(rawQrText)`
した内容を、Guest 側の `scan()` がそのまま受け取る単一端末専用の in-process adapter だ。
Camera Hardware は存在しないが、Port の状態遷移だけは
5 状態すべてを模擬できるようにし、Screen 側の UI 分岐を各状態ごとにテストできるようにする。

`src/app/camera-permission-notice.ts` が状態ごとの UI 文言を一元管理し、`denied` /
`revoked` / `hardware-unavailable` のいずれでも Passport の編集、バックアップ、Settings は
そのまま利用できるという案内を含める。`QrScanScreen` は Camera 権限の状態に関わらず
「Passport の編集へ戻る」操作を常設し、Camera 拒否がアプリ全体の利用不能に波及しない
構造を保証する。

## QR 読取から Ready までの操作数

Guest 視点の操作は、QR 読取（Scan ボタン）の後、共有 Preview の確認（画面遷移だけで
追加操作は不要）と Ready ボタンの 2 操作で完了する。相手の Pet Name / 手掛かりの入力は
実在する相手がその場で declare した内容を単一端末へ転記する既存 Issue 4 由来の操作であり、
Ready までの操作数としては Preview 確認と Ready の 2 手を指す。3 操作以内という
受け入れ条件を満たす。

## 単一端末 2 人分フローの構成

単一端末では、対面の相手が declare した Pet Name / 手掛かりを Owner が代わりに入力する
既存 `EncounterSetupScreen`（Issue 4 由来）を、QR 参加より前段の Encounter Screen として
そのまま使う。QR による Room 参加は、この入力済みデータを Guest 役の共有内容として使う。

画面遷移の順序は次のとおりだ。

1. Owner が Local Profile を保存・復元すると Encounter Screen へ進み、対面の相手が
   declare した内容を入力する。
2. Owner 自身の共有 Preview（`share-preview`）で自分の共有内容を確認し、開始操作
  （`hostLounge`）で Room を作り自分の Public Passport を join した直後に Invite を
   発行し、Invite QR を表示する（`host-invite`）。
3. 同一端末内で「ゲストとして QR を読み取る」操作に切り替えると（`guest-scan`）、
   `QrScannerPort` が publish 済みの Invite 文字列を返す。decode 成功後、手順 1 で
   すでに入力済みの相手の宣言内容から Guest 用の共有 Preview（`guest-share-preview`）を
   組み立てる。新たな入力は求めない。
4. Guest が共有 Preview を確認して Ready にすると Room へ join し Ready 化する。
   Host も別途 Ready にすると、Room が `ready` へ遷移し、既存の `startLounge` 相当の
   `startLoungeFromRoom` で Agent State Machine が開始する。Room の 1 秒 tick は
   Agent State Machine 開始と同時に破棄し、20 分の TTL が尽きるまで無駄に動き続けない
   ようにする。

この一連の呼び出し列はネットワーク I/O を持たず、`src/app/invite-lounge-flow.test.ts` が
インターネット接続なしで完走することを固定する。

## QR の視覚表現

M1 は実カメラでの走査を持たないため、QR の視覚表現は標準準拠の走査可能な行列ではなく、
`src/components/qr-matrix.ts` が Payload から決定論的に導出する見た目だけの Grid とする。
新しい依存を追加せず、`react-native-svg` などの Native module も使わない。Grid は
Screenshot・画面共有時にも Payload の内容自体は判読できない（元々ただの真偽値の格子であり、
文字情報を含まない）。

`HostInviteScreen` は QR とともに、残り時間（分）と、Screenshot / 画面共有で対面以外の
相手に見られるリスクの案内を常設する。Screenshot を防止できるとは扱わず、Host の原子的な
1 回利用と Secret Rotation を Replay 防止の正本にする。

## 代替案

### 実 QR エンコーダ（Reed-Solomon 準拠）を自作または追加依存する案

実カメラでの相互運用性は高いが、M1 は実カメラでの走査を要件にしておらず（Development
Build 専用の M3 で対応）、自作は誤り込みやすく 100％ カバレッジの検証コストも高い。
依存追加は「Zero new deps が望ましい」という方針にも反するため、決定論的な視覚表現に
留める。

### Room の定員を可変にし、N 者間判定を実装する案

将来の複数人 Lounge に対応できるが、既存の Rules Provider（`RULES_PROVIDER`）は
2 者間の Bilateral 比較しか実装しておらず、N 者間の Bridge 選定ロジックは別途設計が
必要になる。この Issue の範囲を超えるため、定員 2 名に固定し、N 者間対応は
Known follow-ups とする。

### Guest の情報を QR 経由の Public Passport 交換で得る案

各参加者が別々の Local Private Profile を持つ実運用に最も近いが、単一端末は 1 つの
Local Private Profile しか保存できない（Issue 7 の Storage Port は単一 Profile 前提）。
2 つ目の Profile を単一端末に持たせる設計は Onboarding のやり直しに等しく、この Issue の
範囲を超える。実在する相手がその場で declare した内容を入力する既存 `EncounterSetupScreen`
は Host が Lounge を作る前段のまま据え置き、その入力内容を Guest 役の共有内容として
Scan 後にそのまま再利用する（コピーの意味は変わらない）。

### QR 読取と同時に参加を確定する案

操作数は減るが、「QR 読取だけで参加確定せず、共有 Preview と明示 Consent を挟む」という
設計判断に反する。読取後に必ず共有 Preview 画面を経由し、Ready 操作を独立した Consent と
する。

## エッジケース

- 非 Passport QR、不正 Prefix、不正 JSON、未知 Version、過大 Payload、重複読取は
  `decodeQrPayload` が個別の `QrPayloadError` code で拒否する。
- 期限切れ、満員は `joinLoungeRoom` が個別の `LoungeRoomError` code で拒否する。
- 参加者が 1 名だけ Ready でも、2 名かつ双方 Ready になるまで `ready` へ遷移しない。
- Camera 未許可、拒否、後から無効化、Hardware 不在はそれぞれ別の UI 文言を持ち、
  いずれでも Passport 編集への導線を残す。
- 同じ QR の生文字列を連続して decode すると、2 回目は重複読取として拒否する。
  人物の安定 ID として扱わない設計判断の直接的な帰結だ。
- Ready 化にかかった時間の分だけ Lounge の保持期限を延長しない。
- Room が `expired` へ遷移した後の参加・Ready 操作は拒否し、Host は新しい Lounge を
  作り直す。

## 人間検証

対面会場での QR 表示・読取の実機動作（明るさ、距離、画面サイズ差）は人間検証待ちだ。
機械テストは、QR encode / decode の正常系・8 種類の異常系・Privacy 契約、Room の
Ready gating の状態遷移、Camera Permission の 5 状態別 UI 文言、単一端末 2 人分フローの
オフライン完走を対象にする。

## M3 受け入れ基準

M1 の決定論的な Grid（`src/components/qr-matrix.ts`）を M3 で実カメラ走査可能な
renderer / scanner に差し替えるときの受け入れ基準を、Issue 66 レビューのフォローアップ
（F-DATZE4、Issue 73）として明文化する。正本資料は
[QR エンコーダサルベージ設計レビュー](../specs/qr-encoder-salvage-design-review.md) と
[QR エンコーダサルベージ User フィードバック](../specs/qr-encoder-salvage-user-feedback.md) だ。

### renderer

- Quiet zone は 4 module 以上を確保する（module サイズに比例させる）。
- QR カードはダークモードでも白地固定とし、明暗反転（背景が黒地の QR）を禁止する。
- 1 module あたり物理 2 px 以上で表示する。誤り訂正 M・schema v2 の Lounge Invite が
  取り得る最大 Version 26 では 121 module になるため、最低でも 258 px 四方の表示領域が
  必要になる。
- 誤り訂正 M の訂正予算をロゴ等の上乗せ描画で消費しない。
- 表示中は端末の輝度を確保し、暗い会場でも読み取れるようにする。

### scanner

- 読取成功直後の debounce を設ける。同一 QR の連続デコードが
  `QrPayloadError`（`DUPLICATE_SCAN`）としてユーザーに見えてしまう導線を作らない。
- 読取に失敗したときの再試行導線（再スキャン操作）を用意する。

### payload 予算

- 設計目標は Version 17・504 byte 以下（`src/protocol/qr-payload-budget.test.ts` が
  典型的な Lounge Invite でこの予算に収まることを固定する）。
- `hostDiscoveryHint`（最大 128 文字）と `requiredCapabilities`（最大 4 件）を
  `src/domain/lounge-invite.ts` の制約どおり同時に最大まで満たすと、
  実測 725 byte（Version 22 相当）まで膨らみ、504 byte 予算を超過する。この超過は
  `src/protocol/qr-payload-budget.test.ts` が既知の事実として固定しており、
  `QR_PAYLOAD_MAX_BYTES`（1,024 byte、`src/qr/encoder.ts` の `QR_ENCODER_MAX_BYTES`
  を正本として re-export した「壊れない上限」）自体は超過しない。フィールド上限の
  見直しは M3 wiring 時に owner 判断とする。
- `hostDiscoveryHint` は `isHostDiscoveryHint`（`src/domain/lounge-invite.ts`）の
  正規表現 `/^[A-Za-z0-9._~:/-]+$/` により ASCII 以外を受け付けない。そのため
  [QR エンコーダサルベージ User フィードバック](../specs/qr-encoder-salvage-user-feedback.md)
  が想定する「日本語 128 文字で 750 byte 超」という組み合わせは
  `createLoungeInvite` を経由する限り実際には作れない。ここで固定する 725 byte は
  ASCII 128 文字での実測値であり、同程度に予算を超過する。

### 検証範囲

- jsQR round-trip（`src/qr/encoder.test.ts`）は理想画素での decode 可能性を検証する
  もので、実機・実会場（照明、距離、手ブレ）での読み取りやすさを保証しない。実機・実会場
  検証は M3 の完了条件に含める。
- encoder の `INVALID_DATA`（内部不整合を示す型付き Error）を、consumer 側でユーザー入力
  エラーと誤表示しないこと。エラー分類（code taxonomy）の見直しが必要かどうかは M3 で
  renderer / scanner を実配線するときに判断する。

## Known follow-ups

- Room の定員を 2 名超へ拡張する場合は、N 者間の Bridge 選定ロジックを別 Issue で設計する。
- 実カメラでの QR 走査（`expo-camera` 等を用いた Development Build 専用 adapter）は
  M3 で `QrScannerPort` の別実装として追加する。
- バックアップ / Settings 画面自体は本 Issue 時点でまだ実装されておらず、Camera 権限拒否時の
  案内文言はそれらの画面の存在を前提にしている。画面自体の実装は別 Issue で追う。
- Invite payload が 504 byte 予算を超過する件（`hostDiscoveryHint` / `requiredCapabilities`
  の上限見直しの要否）は owner 判断待ちとする（Issue 73）。

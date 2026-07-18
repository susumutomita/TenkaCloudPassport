# 一時 Lounge Handshake の設計

本書は Issue 21 の QR 認証、期限、Replay 防止、Transport Binding、Key 破棄を定める。
暗号化済み Channel の具体方式と実機相互接続は Issue 20、Nearby Transport Adapter は Issue 22、
認証後の Message は [Peer Protocol](../architecture/peer-protocol.md) を正本とする。

## 目的と非目的

- Lounge ID、Participant ID、Join Secret を Lounge ごとに暗号学的乱数から生成する。
- QR を見た Guest だけが作れる Join Proof と、Transport が検証した Fingerprint を結合する。
- 期限切れ、改ざん、同時二重利用、使用済み QR を Public Passport の共有前に拒否する。
- raw Secret、Key、安定 ID、Device ID、SSID、Owner Alias を永続化または送信しない。
- TLS、DTLS、Noise、WebRTC、Socket の選定や暗号化を本 Issue で再実装しない。

## Invite v2

`lounge-invite` は次の allowlist だけを持つ。

| Field | Contract |
| --- | --- |
| `schemaVersion` | `2` である。 |
| `loungeId` | 128 bit 乱数由来の Lounge-scoped ID である。 |
| `joinSecret` | 256 bit 乱数を 64 桁の lowercase hexadecimal にした 1 回限り Secret である。 |
| `hostDiscoveryHint` | 選定 Transport が解釈する 128 byte 以下の短命な Hint である。 |
| `transportFingerprint` | Transport が検証する SHA-256 Fingerprint である。 |
| `issuedAtEpochMs` | Host が発行した壁時計である。 |
| `expiresAtEpochMs` | 発行後 20 分以内の Host 壁時計である。 |
| `capacity` | `2` 以上 `6` 以下である。 |
| `requiredCapabilities` | 重複しない Versioned Capability を最大 4 件持つ。 |

QR Protocol は `1.2` とし、v1 Invite を暗黙移行しない。QR Screenshot は Secret を複製できるため、
秘匿表示だけに依存せず、Host の 1 回利用状態を正本にする。

## Join Proof と Transport Binding

Guest は Invite の `joinSecret` を HMAC-SHA-256 Key として扱い、次の値を長さ付きで正規化した
Transcript に署名する。実装は `@noble/hashes` 2.2.0 の HMAC / SHA-256 を固定 Version で使い、
アプリ独自の Hash または HMAC primitive を実装しない。

1. Protocol Label。
2. Lounge ID。
3. Guest の一時 Participant ID。
4. Host 発行時刻と期限。
5. 定員と Required Capability。
6. Host Discovery Hint。
7. Transport Fingerprint。

Join Request は Version、Lounge ID、Participant ID、HMAC Proof だけを Transport へ渡す。
Host は Transport Adapter が安全な Channel から別に返した実測 Fingerprint を Invite の値と
照合してから、固定長で全 byte を走査する比較で `@noble/hashes` の Proof を検証する。Wire 本文が主張する
Fingerprint や認証済み Identity は信用しない。

## 状態遷移と原子的 1 回利用

Host の認証状態は `available`、`verifying`、`used`、`disposed` の 4 状態です。

1. 最初の要求が `available` を同期的に `verifying` へ予約する。
2. 同時要求は Secret が正しくても `REPLAYED_INVITE` で拒否する。
3. Fingerprint、期限、Schema、Proof のいずれかが不正なら Payload を扱わず `available` へ戻す。
4. 正しい要求だけが `used` へ遷移し、認証済み Transport Identity を返す。
5. `rotate` は現在の状態を破棄して Key Buffer を上書きし、同じ Lounge の新しい Secret を発行する。
6. Lounge 終了、退出、20 分満了、Process 終了で `dispose` し、再起動後に復元しない。

JavaScript は GC 管理の文字列や Runtime 内部 Copy の物理ゼロ化を保証できない。Host が保持する
32 byte の Secret Buffer と一時 Proof は利用後に上書きし、QR 表示文字列への参照を最も早い
終了時点で破棄する。この制約を
「完全な Memory Zeroization」と表現しない。

## Clock Contract

Host の壁時計と単調増加時計を参加許可の最終判定とする。`hostNow < expiresAtEpochMs` かつ発行からの
単調増加時計の経過が 20 分未満の場合だけ許可し、どちらかが期限へ達した時点で期限切れです。
これにより Host の壁時計が巻き戻っても実時間上限を延長しない。Guest の時計は Preview 表示と
明らかな破損検出にだけ使い、Host の許可を上書きしない。Host と Guest の時計差で正規 QR が Guest
側の表示上期限切れに見えても、参加要求を送れる限り Host 判定へ収束する。Host 再起動では Key を
復元せず、以前の Lounge 全体を無効にする。

## 認証前の Data Flow

1. Host は Room と Invite をメモリ上で作り、QR を表示する。
2. Guest は strict schema を通した Invite から Join Proof を作る。
3. Transport Adapter は暗号化済み Channel の Fingerprint と raw Join Request を Host へ渡す。
4. Handshake は認証成功時だけ `AuthenticatedTransportIdentity` を返す。
5. Application はその Identity を得た後だけ Public Passport と Peer Message を Channel へ渡す。

Handshake API は Public Passport、Owner Answer、Bridge、Prompt、Model Output を引数に取らない。
失敗結果にも入力本文、Secret、Proof、Fingerprint を含めない。

## 代替案

### raw Secret を比較する案

実装は少ないが、Host が raw Secret を保持し、比較実装と Error 経路へ漏れる余地が増えるため
採用しない。

### アプリ独自の暗号化 Channel を作る案

Transport 非依存になる一方、独自暗号を禁止する契約と Issue 20 の選定責務に反するため採用しない。

### 標準 HMAC Proof と Transport Fingerprint を結合する案

監査済み HMAC、固定長比較、原子的な 1 回利用により、QR 所持と Channel の双方を確認できる。
Transport の暗号方式を再実装せず認証境界を固定できるため採用する。

## エッジケース

- `expiresAt` が発行時刻以下、20 分超、safe integer 外なら Invite を発行しない。
- 未知 Field、未知 Version、重複 Capability、不正 Fingerprint、過大 Hint を拒否する。
- QR の 1 byte 改ざん、別 Participant ID、別 Lounge、別 Fingerprint の Proof は一致しない。
- 正しい Proof でも使用済み、検証中、破棄済みの Invite は再利用できない。
- 不正要求の後は同じ正規 QR を 1 回だけ再試行できるが、同時要求へ権利を二重付与しない。
- Key Rotation 後は旧 Secret の Proof を拒否し、新 Secret の Proof だけを許可する。
- 認証失敗時は Public Passport を encode、queue、send しない。

## 証跡境界

機械テストは Known-answer、Tamper、Replay、同時利用、期限境界、Key Rotation、strict schema、
認証前 Payload 不在を検証する。iOS / Android の Secure Channel、Fingerprint 取得、Packet Capture、
Internet 遮断は Issue 20・22 の実機証跡であり、本 Issue の単一端末テストで代替しない。
単一端末 Adapter は Lounge ID を含む Adapter identity の SHA-256 を使い、Lounge 間で同じ
Fingerprint を再利用しないが、実 Transport の認証済み Fingerprint とは扱わない。

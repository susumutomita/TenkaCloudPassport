# Nearby Transport Port と Loopback Reference Adapter の設計

本書は Issue 22 の Platform 非依存 Port、Host Relay、上限、Event、Reference Contract Test を定める。
Native Library と Secure Channel の採用判断は Issue 20 の実機 Spike と Accepted ADR が正本であり、
本設計は Native Adapter、暗号方式、iOS / Android 相互接続を確定しない。

## 目的と非目的

- Domain、Agent、UI へ Socket、WebRTC、mDNS、Local Network API を公開しない。
- 2〜6 名の Star Topology で Host が認証済み Membership と Routing を管理する。
- QR Join Proof と Transport Fingerprint の検証、Host / Guest の Owner Ready が完了するまで
  Application Envelope を送信できない。
- Payload、Queue、Send Rate、rolling byte、Peer、Listener を有限にする。
- Permission、Network 切替、Hotspot 切断、Background、Host End を別 Event にする。
- Reference Adapter と将来の実 Adapter が同じ Contract Suite を実行できる形にする。
- Loopback を暗号化済み Native Transport、実機、Packet Capture の証拠にしない。

## 比較した案

### 案 1: Peer Protocol Session に Network 接続と Queue を持たせる

Envelope の型を再利用しやすい一方、Protocol の認証、順序、Capability と Socket lifecycle、Permission、
Backpressure が結合する。Native Adapter ごとに Protocol を再実装し、Domain から Platform 詳細を隔離できない。

### 案 2: Native Library の API を App から直接呼び、Platform ごとに Flow を分ける

最初の接続は短いが、QR Authorization Root、Ready Gate、上限、Error、cleanup が iOS / Android で分岐する。
Expo Go / Web の Rules Flow へ Native import が混入し、同じ Contract Test を実 Adapterへ適用できない。

### 案 3: App と Infrastructure の間に bounded `NearbyTransport` Port を置く

Adapter は短命 Binding、接続、Queue、Event、cleanup だけを所有する。App は Binding から実
`LoungeHandshakeHost` と QR Invite を発行し、Adapter は認証 callback と Ready callback の成功後だけ
接続済みにする。Protocol は受信した raw UTF-8 Envelope と Adapter 由来認証 Identity を検証する。

案 3 を採用する。Issue 20 がどの Native Library を採用しても、実 Adapter は同じ Port と Contract Suite を
満たさなければ Production Composition へ入れない。

## Port と Data Flow

`NearbyTransport` は `host(invitePolicy)`、`join(invite)`、`send(envelope)`、`leave(reason)`、
Connection / Membership / Envelope Event の購読、`dispose()` だけを公開する。

### Host

1. Adapter が Process 内だけの短命 `hostDiscoveryHint` と Secure Channel Fingerprint を作る。
2. Adapter は `invitePolicy.issueInvite(binding)` を呼ぶ。
3. App は Binding を `issueLoungeHandshake()` へ渡し、QR 用 `LoungeInvite`、`authorizeJoin()`、
   Participant ごとの `waitUntilReady()` を返す。
4. Adapter は Invite の Hint / Fingerprint と実 Binding の完全一致、Host ID、定員 2〜6 名を検証する。
5. Adapter は Join Proof を Secure Channel から受け、実測 Fingerprint とともに `authorizeJoin()` へ渡す。
6. 認証済み Identity と Host / Guest の Ready callback が完了した後だけ Membership を追加する。

1 Guest の認証後は同じ短命 Binding と既存 Membership を保ったまま `host(invitePolicy)` を再度呼び、
次の Guest 専用の Join Secret と Handshake Host へ交換する。再発行で Lounge ID、Host ID、Fingerprint、
Hint、定員を変更できず、旧 QR を再利用できない。
同じ Endpoint で Host 開始 / 再発行が並行した場合は後発 Operation だけを有効とし、先行していた
Authorization を破棄する。Host 開始中の `dispose()` も遅延完了した Binding / Authorization を登録しない。
Join は開始時点の Authorization 世代を固定し、認証または Ready 待機中に Invite が再発行された場合は
`CONNECTION_INTERRUPTED` で終了する。旧 Authorization の認証結果を新しい Invite の Ready callback と混在させない。
認証待機中の Participant ID と定員枠は同期的に予約し、同一 ID、Host ID、定員超過を callback 実行前に拒否する。
予約は成功、認証失敗、Ready 失敗、再発行、Host End、Guest dispose の全経路で解放する。
Host の Condition は接続済み Guest だけでなく pending Join も同じ世代で中断する。旧 Authorization の cleanup が
reentrant に Host を dispose した場合だけでなく、Rotation 中断通知の listener が Host を dispose した場合も、
新 Authorization を保存せず、その場で破棄する。

Adapter は `joinSecret` を保存、比較、Log 出力しない。保持するのは Secret を持たない Invite Descriptor、
認証 callback、現在 Membership、bounded Queue だけである。

### Guest

1. Guest App は strict QR Invite から外側で Join Proof を作る。
2. `join()` へ Secret を除いた Invite Descriptor、raw Join Request、一時 Participant ID、
   `waitUntilReady()` を渡す。
3. Hint で Host を特定し、実 Binding Fingerprint と Descriptor の Fingerprint を一致確認する。
4. Host の認証と双方 Ready が成功するまで Guest は `joining` または `reconnecting` である。
5. 成功後だけ `connected` となり、`send()` が Application Envelope を受理する。

1 Endpoint で同時に実行できる Join / Reconnect は 1 件だけとし、後発は `INVALID_STATE` で拒否する。
Host 側の再接続では Authorization 再発行だけで `connected` へ戻さず、既存 Guest 全員の再 Ready 完了まで
Group 全体の `send()` を `NOT_READY` で閉じる。

Reconnect は同じ Process 内で認証済み Membership と Adapter Instance が残る場合だけ再利用する。
新しい Adapter Instance が Participant ID を自己申告して再接続することは許可しない。実 Adapter の
Secure Session Resume / 再認証方式は Issue 20 の ADR に従う。
既存 Endpoint の Reconnect は安定した Lounge / Binding / Capacity と保存済み Identity を照合し、次 Guest 用の
Fresh Invite で更新された発行・期限時刻を旧 Descriptor と一致させることは要求しない。

### Routing

- Host の Broadcast は接続中 Guest 全員へ送る。
- Guest の Broadcast は Host Relay を経由して Host と他の接続中 Guest へ送る。
- Target Send は現在 Membership の 1 Participant だけへ送る。
- 自分自身、退出済み、未接続 Participant は Target にできない。
- Host が `leave()` または `dispose()` すると全 Guest を即時 `host-ended` Terminal State へ移す。
  実 Adapter は Issue の 5 秒上限を同じ Contract Suite で満たす。

## Bounded Contract

| 境界 | 上限 | 超過時 |
| --- | ---: | --- |
| Lounge Participant | Host を含め 6 | `CAPACITY_EXCEEDED` |
| UTF-8 Payload | 4,096 byte | `PAYLOAD_LIMIT_EXCEEDED` |
| Endpoint outbound Queue | 8 Envelope | `QUEUE_LIMIT_EXCEEDED` |
| rolling 1 秒 Send | 16 Envelope | `RATE_LIMIT_EXCEEDED` |
| rolling 1 秒 Send byte | 8,192 byte | `BYTE_RATE_LIMIT_EXCEEDED` |
| Event Listener | 16 | `LISTENER_LIMIT_EXCEEDED` |

Queue は payload string を最大 8 件だけ保持し、microtask ごとに drain する。`dispose()` は未配送 Queue を
`DISPOSED` で reject し、Listener、Membership、Network 登録を同期的に切ってから完了する。
Transcript、Passport、Prompt、Model Output の履歴を Adapter に残さない。
認証・Ready callback の遅延完了は `disposed` を `terminal` へ巻き戻してはならず、Host End、Invite Rotation、
新しい Condition 世代を古い callback 結果より優先する。
Connection / Membership Event listener の reentrant `dispose()` 後は、未開始 Authorization、成功 return、
後続 Membership Event を継続しない。Membership と Ready State は `joined` 通知前に原子的に commit し、
その listener から現在 Membership への送信を許可する。外部 Event は `joined` より後に `left` が現れる順序を維持する。
同一 Event の listener が `leave()`、Host End、Condition を開始して operation generation を進めた場合、古い dispatch は
同じ Endpoint の後続 listener に継続しない。Leave / Host End は対象 Endpoint を外部 callback より先に terminal 相当へ
commit し、Membership `left` → terminal の外部順序を保ちながら callback から `reconnecting` へ復活できないようにする。
Recoverable Condition は Host と現在 Membership を外部 callback より先に `reconnecting` へ commit して Group の送信を閉じる。
Condition listener から即時に Invite を再発行しても、全 Guest の再 Join と双方 Ready なしに `connected` へ戻さない。
Local Network Permission 拒否は同様に terminal を先行 commit し、callback から再 Host して送信境界を迂回できないようにする。
Host Condition の各 Guest 通知後にも Host Record と Guest Membership を再確認し、通知中の Host End 後に
`terminal` を `reconnecting` へ戻さない。旧 Authorization を破棄した後で operation ownership を失った Rotation は、
candidate を破棄するだけでなく、破棄済み Authorization を持つ Host Record も fail-closed に終了する。

## Event と Error

Connection State は `idle | hosting | joining | connected | reconnecting | terminal | disposed` とする。
Transport Condition は次を同じ文字列へ畳まず、固有 Event として通知する。

- `local-network-permission-denied`
- `network-changed`
- `hotspot-disconnected`
- `app-background`

Membership Event は認証済み Lounge / Participant ID、`joined | left`、現在の bounded Snapshot だけを持つ。
受信 Event は raw UTF-8 Envelope、送信元の `AuthenticatedTransportIdentity`、broadcast / target の配送範囲だけを
持ち、Transport 自身は Peer Payload を parse しない。

失敗は固定 Code の `NearbyTransportError` とし、Join Proof、Secret、Payload、Fingerprint、SSID、端末名、
Native Error 本文を反射しない。Listener が Error 本文や入力を Log する API も設けない。
Join Descriptor、Join Input、Host Policy / Authorization / Binding、認証 Identity、Outbound Envelope は
accessor と Symbol を含まない既知 data field の Snapshot だけから再構築し、未知 field を入力全体として拒否する。
上限を検証した後に caller-owned object を読み直さない。Error の code と秘匿済み message は Port の共有実装で閉じ、
Native Error を Adapter ごとの message へ反射できないようにする。Event Listener の例外は他の Listener と Transport State から隔離し、Membership 更新を
巻き戻したり、配送済み Envelope を失敗扱いにしない。`DELIVERY_FAILED` は Queue 受理後の退出など、実配送時点で
宛先を確定できなかった場合に限る。
これらの strict rebuild、bounded byte、固定 Error、immutable Event は Port 共通 validator を正本とし、
Loopback と実 Native Adapter が同じ境界処理を再実装しない。
Proxy の descriptor trap が validation 中に `dispose()` または Condition を reentrant 実行する可能性も入力境界に含める。
Adapter は shared validator の直後に operation generation と ownership を再確認し、破棄後の Ready callback、Queue 追加、
Membership commit を行わない。validation 自体が失敗した経路も同じ再確認を先に行い、途中で成立した Host End、
dispose、Invite Rotation の terminal state / reason を古い validation error で上書きしない。terminal reason は最初に
commit した終了操作だけが決め、stale Condition、pending Join 中断、cleanup callback から上書きしない。

## Reference Adapter と Production Boundary

Loopback Reference Adapter は同一 Process の実 Queue / Event / Routing を使う Contract 実装であり、Mock API ではない。
ただし暗号化、OS Permission、Socket、mDNS、Background 実行を提供しないため Production Composition から import しない。
Portable Contract Suite は `NearbyTransport` と Condition 注入だけで実行し、Reference Adapter の白箱 Resource
diagnostics は別 Suite に分ける。Source Contract Test で root entrypoint と全 production source からの import 不在を
確認し、Web Export に Reference Adapter 固有 label が入らないことを Gate 後に確認する。

実 Native Adapter の完了には以下が別途必要である。

- Issue 20 の Accepted Transport ADR と Production Library。
- Loopback と実 Adapterの同一 Contract Suite Green。
- Internet 無しの iOS ↔ Android、iOS ↔ iOS、Android ↔ Android。
- Wi-Fi / Personal Hotspot、100 回 Join、3 台以上 Star Relay、Host End 5 秒以内。
- Packet Capture で Application Payload の平文不在。
- Permission、Network 切替、Hotspot 切断、Background、dispose 後 Resource の実機 Inspection。

これらは本 Foundation の自動 Test で代替せず `Not run` とする。

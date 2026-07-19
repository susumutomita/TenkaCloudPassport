# Nearby Transport 実機 Spike Protocol

- 対象 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/20
- 現在の選定状態: [Evidence Record の Decision record](../evidence/nearby-transport-spike-record.md#decision-record)

本書は、中央 Relay、Account、必須 Telemetry を使わない 2〜6 台の Nearby Transport を選ぶ手順の正本です。
判断の理由は [ADR-0023](../adr/0023-nearby-transport-evidence-gate.md)、Port の契約は
[Nearby Transport Contract](./nearby-transport-contract.md)、Engineering Evidence のデータ種別と保持は
[Privacy データ台帳](../privacy/data-inventory.md) と [保持ポリシー](../privacy/retention-policy.md) を正本とする。

## Evidence boundary

- Phase A では 4 Candidate を同じ静的 Gate で Screening する。静的資料だけで Preferred Baseline を選ばない。
- Phase B へ進めるのは、Static Status が `Pass` の Candidate から理由を記録して選んだ 1 Candidate だけである。
- Expo Go、Web、Simulator、Loopback、Unit Test は物理端末証拠ではない。
- Phase B の全結果を 1 つの Evidence Bundle ID、Candidate route、source version、Git commit、両 Build ID、
  Build artifact SHA-256、platform class、OS major、analysis script SHA-256、Review PR に結び付ける。
- 公開 Record は iPhone / Android の platform class と OS major だけを持つ。製品 model、UDID、Android ID、
  Serial、IP、MAC、SSID、BSSID、Owner 名、正確な実行日時を持たない。
- Candidate 固有の Native code と dependency は Spike Branch だけに置き、Production root、`src/domain`、
  `src/ports`、`src/app` から import しない。
- 必須 Field の欠落、Bundle ID の不一致、`Not run`、判定不能、Gate failure のいずれかがあれば
  Selection Status を `Undecided` のままにする。

Phase A の Candidate Status は、未判定または不明が 1 件でもあれば `Fail` の有無にかかわらず `Not run`、
7 Static Gate がすべて判定済みで、すべて `Pass` なら `Pass`、それ以外は `Fail` とする。
Static Screening Status は、4 Candidate の全 Gate が
判定済みで、各 Candidate が `Pass` または `Fail`、かつ 1 Candidate 以上が `Pass` の場合だけ `Complete` とする。
全 Candidate が `Fail` なら `No viable candidate` とし、Phase B へ進まない。Phase A で正しく棄却した Candidate の
`Fail` は、通過 Candidate の Phase B 実行を妨げない。

## Phase A static screening rubric

| Static gate | Pass condition | Fail condition |
| --- | --- | --- |
| Official source and version | 公式 Source、Candidate version または OS API version、Candidate 種別に応じた source locator を固定する。 | 出所、version、source locator、実装 route のいずれかが不明である。 |
| Cross-platform route | iPhone と Android が同じ Wire または互換 Adapter で接続する具体 route を示す。 | iOS 専用 API と Android 専用 API を互換性の根拠なしに組み合わせる。 |
| Expo and New Architecture | Expo SDK 57、React Native 0.86 New Architecture の Development Build 手順を示す。 | Expo Go、旧 Architecture、未検証 config plugin だけである。 |
| Standard secure channel | 標準 Secure Channel の protocol、peer key または certificate fingerprint の取得方法を示す。 | 独自暗号、fingerprint 取得不能、平文 fallback が必要である。 |
| License and maintenance | License、Maintainer の更新状況、Native Artifact、downloader、取得元を記録する。 | License 不明、floating version、未監査 downloader である。 |
| Application-controlled telemetry | Application 側で収集を無効化できる公式 API または config と Build artifact 上の適用方法を示す。 | 利用者の OS 設定だけに opt-out を委ねる、送信だけを遮断する、収集状態が不明である。 |
| Topology and discovery | 2〜6 台の Star と、Discovery 無効時の QR direct hint route を示す。 | Discovery または中央 Signaling / Relay が必須である。 |

Google Nearby Connections は公式資料上、performance metrics と端末情報を収集し、利用者の端末設定で制御する。
Application-controlled telemetry を無効化する公式手段と Build 適用証拠がなければ、この Candidate の Static Status は
機械的に `Fail` とする。Internet 遮断中の外部 Endpoint 0 件は、この Gate の代替証拠にしない。

Platform Adapter Candidate は `Apple Multipeer + Android Nearby` と `Google Nearby Android + Swift` を
同じものとして扱わない。Static Record の Candidate route で、実際に比較した route を 1 つずつ明記する。

Package / Library Candidate の source locator は exact version、lock resolution、upstream Repository と source commit、
System Framework Candidate は SDK / API version、OS major、公開 Build locator とする。非公開の System Framework に
upstream source commit を要求せず、Package Candidate で commit または lock resolution を省略しない。

## Phase B physical evaluation rubric

| Gate | Pass threshold | Failure condition |
| --- | --- | --- |
| iOS and Android interoperability | iPhone Host → Android Guest と Android Host → iPhone Guest の両方向を同じ Bundle で完了する。 | 片方向、同じ OS、Simulator、別 Bundle の結果を混ぜる。 |
| Offline network | 全端末の Internet reachability が開始前後に失敗し、Public DNS と外部 Endpoint が 0 件である。 | STUN、TURN、Signaling、Relay、Analytics Endpoint への通信が必要である。 |
| Encryption and peer authentication | 標準 cipher、QR と peer fingerprint の一致、負試験 4 件、再構成後の平文一致 0 件を記録する。 | fingerprint 未照合、負試験 failure、独自暗号、平文または外部 Endpoint が 1 件以上である。 |
| Join experience | QR 読取後の Owner 操作は 3 以下、各 Network 100 Attempt、成功率 99％以上、median 3,000 ms 以下、p95 10,000 ms 以下、Ready 後 30 秒以内の Disconnect 0 件である。 | Attempt 不足、成功率または時間の閾値未達、Disconnect または権限許可済みの Permission Failure が 1 件以上である。 |
| Group lifecycle | iPhone Host と Android Host の各回で 3 台以上、Broadcast、Target、Leave、Host End 5 秒以内を完了する。 | 2 台だけ、Target 未確認、退出先への配送、cleanup 未確認である。 |
| Discovery recovery | Discovery cache を空にして iPhone Host 5 回、Android Host 5 回の QR direct hint Join を 10 回すべて完了する。 | Discovery、以前の接続、以前の Secret に依存するか 1 回でも失敗する。 |
| Background and reconnect | Permission、Background / Foreground、Network 切替、Hotspot 切断、再認証、dispose の全 Scenario が Pass である。 | 無言の復活、古い Identity / Secret の再利用、Resource 残留である。 |
| Expo and New Architecture | Expo SDK 57、React Native 0.86 New Architecture の両 Development Build で同じ Bundle を実行する。 | Expo Go、Web、旧 Architecture の結果を実機証拠にする。 |
| Supply chain | Candidate version、種別ごとの source locator、License、Native Artifact、取得元、Build artifact digest が Phase A と一致する。 | Phase A からの drift、floating version、未監査 Artifact である。 |
| Privacy and telemetry | Application-controlled telemetry が無効で、公開 Record が `L5P` allowlist だけを持ち、raw `L5` を期限内に破棄する。 | 収集が利用者設定依存、不明、公開 Record に端末または Network 識別子がある。 |

閾値の緩和は失敗を `Pass` に書き換えて行わない。Product 条件を変える必要がある場合は、実機結果を
`Fail` のまま保存し、別 ADR で本 Gate を Supersede してから再実施する。

## Evidence bundle binding

Evidence Bundle ID は 128 bit 以上の乱数を lowercase hexadecimal で表す。次の値は Bundle 全体で不変とする。

| Binding field | Required public value |
| --- | --- |
| Candidate | Phase A の Candidate 名と exact route である。 |
| Candidate source | Package は exact version、lock resolution、upstream source commit、System Framework は SDK / API version、OS major、公開 Build locator である。 |
| Repository source | 40 桁の Git commit である。 |
| iOS and Android build | 公開 Build ID と各 artifact SHA-256 である。 |
| Device class | `physical-iphone` / `physical-android` と OS major である。 |
| Analysis | packet reassembly / search script の version と SHA-256、Sensitive Field Manifest SHA-256、Positive-control Fixture SHA-256、Capture Tool version である。 |
| Review | 公開 PR URL と Security / Privacy reviewer attestation である。 |
| Execution bucket | `YYYY-MM` だけである。正確な日時は公開しない。 |

1 つでも Bundle ID または Binding field が異なる結果は別 Bundle とし、合算しない。

## Required join matrix

各 Attempt は新しい QR と Secret を発行し、以前の接続、Queue、Membership を破棄してから開始する。
開始点は Guest Owner の Preview と Consent が完了して `join()` を呼ぶ直前、終了点は双方が同じ認証済み
Membership で `connected` と Ready を表示した時点です。成功後 30 秒間を観測してから明示 Leave する。

| Network fixture | Direction | Planned joins | Internet disabled | Initial status |
| --- | --- | ---: | --- | --- |
| Same Wi-Fi | iPhone Host → Android Guest | 50 | Required | `Not run` |
| Same Wi-Fi | Android Host → iPhone Guest | 50 | Required | `Not run` |
| Personal Hotspot | iPhone Host → Android Guest | 50 | Required | `Not run` |
| Personal Hotspot | Android Host → iPhone Guest | 50 | Required | `Not run` |

Network fixture ごとに 100 Attempt、合計 200 Attempt を実行する。Personal Hotspot の提供端末は Lounge の
参加台数へ含めず、WAN path を遮断する。

## Network isolation evidence

各 Network fixture の `physical-iphone` と `physical-android` で、Join Matrix の開始直前と全試行終了直後に
Internet reachability が失敗することを確認する。同じ Capture Window の Public DNS query と、Public DNS、
STUN、TURN、Signaling、Relay、Analytics を含む外部 Endpoint はともに 0 件でなければならない。

| Atomic evidence | Pass threshold |
| --- | --- |
| Reachability before | 各 fixture、各 platform で失敗する。 |
| Reachability after | 各 fixture、各 platform で失敗する。 |
| Public DNS queries | 各 fixture で 0 件である。 |
| External endpoints | 各 fixture で 0 件である。 |

## Required join metrics

| Metric | Definition | Public record |
| --- | --- | --- |
| Attempts | Direction row ごとの `join()` 開始回数と、Network fixture ごとの 2 Direction の合計である。 | Integer |
| Successes | Direction row ごとに双方が同じ認証済み Membership で Ready になった回数と、その Network fixture 合計である。 | Integer |
| Join success rate | Network fixture ごとの `Successes / Attempts` である。Direction row では算出しない。 | Percentage |
| Median join duration | Network fixture ごとに両 Direction の Success duration を合わせた中央値である。 | Milliseconds |
| p95 join duration | Network fixture ごとに両 Direction の Success duration を合わせ、nearest-rank で求める 95 percentile である。 | Milliseconds |
| Disconnects | Network fixture ごとに、Ready 後 30 秒以内かつ明示 Leave 前に Transport が切断した合計回数である。 | Integer |
| Disconnect rate | Network fixture ごとの `Disconnects / Successes` である。合格値は 0％である。 | Percentage |
| Permission failures | Direction row ごとの権限許可済み Attempt が Permission Error で終端した回数と、その Network fixture 合計である。 | Integer |

Attempt ごとの正確な時刻、端末識別子、Network 識別子を持つ Log は作らない。方向ごと 50 件以下の
monotonic duration 配列と固定 Failure Counter だけを検証端末の Process Memory に置き、集計値を
Evidence Record へ転記した直後に破棄する。

## Lifecycle and permission scenarios

| Scenario | Required outcome |
| --- | --- |
| QR to Ready operations | Preview 確認と Ready を含め 3 操作以下である。 |
| Permission explanation | OS Dialog 前に Local Network / Nearby の目的と拒否後 Recovery を表示する。 |
| Permission denied | Application Payload を送らず型付き Permission Error で終端する。 |
| Permission restored | 新しい QR と Secret だけで Join し、古い Attempt を復活させない。 |
| Background then foreground | Group を送信不可にし、全 Peer の再認証と Ready 後だけ再開する。 |
| Network switch | 古い connection generation を捨て、新しい QR または契約済み再認証へ収束する。 |
| Hotspot disconnect | 全 Peer を Condition へ移し、古い Queue を配送しない。 |
| Target routing | 現 Membership の指定 1 Peer だけへ 1 回配送する。 |
| Guest leave | 退出 Peer へ追加配送せず、残留 Membership を一致させる。 |
| Dispose | Queue、Listener、Secret、Membership、Native Resource を残さない。 |

## Star relay and discovery recovery

Star Relay は iPhone Host と Android Host を入れ替え、各回で異なる OS を含む 3 台以上を Ready にする。
Host / Guest Broadcast、Target、Guest Leave、退出先への追加配送 0 件、Host End 5 秒以内を確認する。

Discovery Recovery は Candidate 固有 Discovery と cache を無効にし、Same Wi-Fi で iPhone Host 5 回、
Android Host 5 回の計 10 回を QR direct hint だけで完了する。以前の接続と Secret を使わない。

## Packet capture and negative security procedure

- 実在 Owner の Local Private Profile、Public Passport、Owner Answer、Pet Message は使わない。
- Production serializer と strict schema を通る非識別 Security Canary Envelope を Message kind ごとに作る。
- Production serializer が許可する `L2` / `L3` の全 Field を Sensitive Field Manifest に列挙する。各 Message kind の
  各可変長 Field へ別々の 128 bit 以上の schema-valid 高 entropy 合成値を置く。有限 Enum または Catalog ID は
  unique な隣接 ID Canary と Envelope digest に結び付ける。raw Owner Answer など Wire 禁止 Field は strict schema が
  拒否する負試験を Manifest に記録する。未分類または未試験 Field が 1 件でもあれば Fail とする。
- Message ID、Participant ID、Lounge ID だけでなく、Public Passport、Field Reference、Evidence ID など Manifest の
  全機密 Field を Field / Message-kind 単位で検索する。公開 Record には Sensitive Field Manifest、Canary set、
  serialized Envelope set の SHA-256 と内容なしの Coverage 判定だけを残す。
- Analyzer は TCP / WebSocket / DataChannel / Platform frame を stream へ再構成してから検索する。
- 各 Canary の完全値と 16 byte 以上の全断片を raw bytes、UTF-8、JSON escape、hex、Base64、percent encoding で検索する。
- Candidate が Application compression を使う場合、圧縮前後の既知表現も解析する。検索不能な独自形式は Fail とする。
- 使用する Capture interface ごとに、Version 管理した非識別 Positive-control Fixture を Analyzer へ通す。Fixture は
  完全値、分割値、各 Encoding、圧縮表現、Documentation 用外部 Endpoint を持ち、Analyzer が既知件数をすべて
  検出できなければ本番 Capture を評価しない。Fixture と Analyzer の SHA-256 を同じ Bundle へ結び付ける。
- 暗号化試験 Capture では Candidate flow の packet 数と byte 数がともに 0 より大きく、Transport の認証済み
  Canary Envelope の送信数と受信数が一致することを確認する。traffic 0、別 interface、counter 不一致は Fail とし、
  平文一致 0 件と外部 Endpoint 0 件を成功証拠に使わない。
- Negotiated protocol / cipher、peer key または certificate fingerprint、QR binding の一致を記録する。
- fingerprint mismatch、untrusted peer key、expired / replayed QR、plaintext fallback の 4 負試験をすべて拒否する。
- Public DNS、STUN、TURN、Signaling、Relay、Analytics を含む外部 Endpoint が 0 件であることを確認する。
- Analyzer version と script SHA-256、Capture Tool version、Capture SHA-256、Canary set digest を記録する。
- raw Capture は `L5`、公開 Record は `L5P` とし、保存、公開、削除は Privacy 正本に従う。

## Development build procedure

Candidate dependency は lifecycle script を無効にして Version 固定で追加し、取得元、License、Native Artifact を
先に監査する。Native code または config plugin を変更した後は両 Platform を再生成して Build する。

```bash
make install
bunx expo install --check
bunx expo run:ios --device
bunx expo run:android --device
bunx expo start --dev-client
```

Expo Go は Rules Provider の回帰確認にだけ使う。生成した `ios`、`android`、Build output、Provisioning Profile、
Certificate、Spike secret は commit しない。

## Acceptance algorithm

1. [Evidence Record](../evidence/nearby-transport-spike-record.md) の 4 Candidate で Phase A の全 Static gate を
   `Pass` または `Fail` にし、`Not run` と不明を 0 件にする。
2. Candidate Status が `Pass` の候補が 1 つ以上ある場合だけ、理由と exact route を記録して Physical Spike
   Candidate を 1 つ選ぶ。`Fail` Candidate は棄却理由を残し、Phase B の候補にしない。
3. 1 つの Evidence Bundle ID で Binding、Join、10 Rubric Gate、Lifecycle、Star、Discovery、Security、Capture、
   Expo、Supply Chain、Privacy の全 Record を埋める。
4. 選んだ Candidate の Join 数値閾値、Security の Coverage とゼロ件 Gate、Phase B の全 Status `Pass` を満たす。
   Phase A で棄却した Candidate の `Fail` を Phase B Failure と数えず、欠落または `Not run` を Fail-open にしない。
5. Spike code と Candidate dependency が Production Path にないことを source scan と Review で確認する。
6. Code、Security、Privacy、Simplify Review の Blocker、High、Medium を 0 件にする。
7. Evidence を参照し、採用、棄却、Platform 制約、再検討条件を後続の Accepted ADR に記録する。
8. それまでは Selection Status を `Undecided`、Preferred Baseline を `Not selected`、Issue 20 を Open に保つ。

## Primary sources reviewed

- Expo Development Builds: https://docs.expo.dev/develop/development-builds/introduction/
- React Native WebRTC DataChannel: https://react-native-webrtc.github.io/handbook/guides/basic-usage.html
- React Native WebRTC and Expo: https://react-native-webrtc.github.io/handbook/guides/extra-steps/expo.html
- Apple Multipeer Connectivity: https://developer.apple.com/documentation/multipeerconnectivity
- Apple Bonjour: https://developer.apple.com/documentation/network/bonjour
- Android Network Service Discovery: https://developer.android.com/develop/connectivity/wifi/use-nsd
- Google Nearby Connections Overview: https://developers.google.com/nearby/connections/overview
- Google Nearby Connections Strategies: https://developers.google.com/nearby/connections/strategies
- Google Nearby Connections for Swift: https://developers.google.com/nearby/connections/swift/get-started
- Apple Core Bluetooth: https://developer.apple.com/documentation/corebluetooth
- Android BLE: https://developer.android.com/develop/connectivity/bluetooth/ble/ble-overview

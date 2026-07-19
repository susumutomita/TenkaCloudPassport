# Nearby Transport 実機 Spike Evidence Record

- Record Version: `NEARBY-TRANSPORT-SPIKE-2`

本 Record は [Nearby Transport 実機 Spike Protocol](../design/nearby-transport-spike-protocol.md) の公開結果だけを
保持する。

`Evidence bundle binding record` を Candidate、Build、Capture、Analyzer、実行月、Review の唯一の Metadata 正本、
`Decision record` を選定状態の唯一の正本とする。以下の Physical 詳細表は Binding record の 1 Bundle を暗黙に
継承し、行ごとに Bundle ID を手入力しない。別 Bundle の結果を使う場合は Record 全体を分ける。

Static Candidate Status と Physical Rubric Status は手入力の独立判断ではない。Candidate Status は 7 Static Gate、
Physical Rubric Status は各行の `Source record` にある全 Atomic Status と数値閾値から導出する。参照先が 1 件でも
`Not run` または `Fail` なら Rubric は `Pass` にしない。

Static Gate の各 Cell は `Pass — 公開根拠`、`Fail — 棄却理由`、`Not run — 欠落証拠` のいずれかとし、
根拠のない `Pass` を書かない。
Physical 詳細表の Atomic Status は Protocol の該当 Pass threshold を満たす値があれば `Pass`、Failure condition が
1 件でもあれば `Fail`、値または検証が欠ければ `Not run` とする。

## Static screening record

Machine-readable 正本: [Static Screening Manifest](./nearby-transport-static-screening.json)。次の command が source、
provenance、7 Gate、Repository baseline を fail-closed で検証し、Candidate と Screening Status を導出する。

```bash
bun scripts/nearby-transport-static-screening.ts docs/evidence/nearby-transport-static-screening.json
```

| Candidate | Candidate route and version | Official source | Cross-platform route | Expo and New Architecture | Standard secure channel | License, maintenance, provenance | Application-controlled telemetry | Topology and discovery | Static status | Rationale |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mDNS + Local WebSocket / Secure Channel | DNS-SD is optional discovery; QR carries a direct host hint and SHA-256 leaf-certificate fingerprint; iOS Network.framework and Android NsdManager plus JSSE exchange the same bounded length-prefixed application frames over TLS 1.3 with no plaintext fallback | Pass — Repository versions and Expo platform SDK baseline are exact; the route uses only public Apple and Android system-framework locators. | Pass — Both platforms advertise or resolve DNS-SD and exchange the same bounded framed protocol over interoperable TLS sockets; QR bypasses discovery. | Pass — The route is a local Swift and Kotlin Expo module in a Development Build; Expo Modules support the New Architecture by default. | Pass — Apple Network.framework supplies the local TLS identity route; Android API 29+ supplies TLS 1.3 while AndroidKeyStore creates a Lounge-scoped EC signing key with self-sign and TLS digests, KeyStore exposes its leaf and deletion, KeyManagerFactory loads the material, X509KeyManager fixes the server alias, SSLContext installs the managers, and X509TrustManager rejects a mismatched SHA-256 of the peer leaf DER during the handshake. | Pass — No third-party transport package, native artifact, or downloader is added; Apple and Android public system APIs are compiled by the pinned Expo platform toolchain. | Not run — The route adds no third-party transport SDK, but no iOS or Android native build artifact exists yet for dependency, symbol, configuration, and endpoint verification. | Pass — One Host listener relays to at most five Guests; DNS-SD is optional and the QR direct host hint remains the recovery route when discovery is disabled. | `Not run` | This is the only route that keeps one cross-platform wire, standard TLS, and QR recovery without a third-party transport SDK, but application-controlled telemetry remains Not run until native-build artifact evidence exists. |
| WebRTC DataChannel + QR Signaling | react-native-webrtc 124.0.7 with QR-carried SDP and ICE host candidates, one Host RTCPeerConnection per Guest, and DataChannel application frames | Fail — The JavaScript package tag and source commit are exact, but both native Jitsi artifact declarations are ranges rather than exact lock resolutions. | Pass — Both platforms use the same WebRTC DataChannel wire route and QR can carry the out-of-band signaling description. | Fail — The official Expo note requires a Development Client and out-of-tree plugin but does not establish exact Expo SDK 57 and React Native 0.86 compatibility. | Fail — DTLS protects DataChannel traffic, but the reviewed React Native API route does not expose a peer certificate fingerprint that can be bound to the QR proof. | Fail — The package is maintained and MIT-licensed, but floating iOS and Android Jitsi native artifact resolutions violate reproducible provenance. | Fail — The transitive Jitsi native artifacts and their application-controlled collection configuration are not fixed or evidenced by the reviewed route. | Pass — A Host can maintain one DataChannel per Guest and QR signaling removes the need for a central signaling service or discovery service. | `Fail` | The cross-platform wire is viable, but floating native artifacts, unproven Expo compatibility, unavailable peer fingerprint binding, and unknown telemetry prevent selection. |
| Platform Adapter (Multipeer / Nearby) | Google Nearby Connections on Android and the google/nearby Swift package on iOS using P2P_STAR; Apple Multipeer Connectivity is not mixed into this route | Fail — Official setup routes exist for Android and Swift, but the reviewed setup sources do not fix a shared exact release, source commit, and both lock resolutions. | Pass — Google documents Nearby Connections and a Swift package route, so this candidate does not combine unrelated Apple Multipeer and Android protocols. | Fail — No exact Expo SDK 57 and React Native 0.86 local-module build route with fixed Android and Swift packages is evidenced. | Fail — Google states that connections are encrypted and symmetrically authenticated, but the reviewed API does not provide the peer key or certificate fingerprint required by the QR binding contract. | Fail — Both native package versions, lock resolutions, source commit, and native artifact provenance remain unresolved. | Fail — The SDK collects performance and device information, and the official control is an end-user Google Usage and diagnostics setting rather than an application API or build configuration. | Fail — P2P_STAR is available, but a QR direct host hint cannot bypass Nearby endpoint advertising and discovery under the reviewed API route. | `Fail` | Application-controlled telemetry, exact package provenance, peer fingerprint binding, and QR discovery recovery do not meet the static gate. |
| BLE Custom Protocol (comparison only) | A common custom GATT service over iOS Core Bluetooth and Android BLE with one Host peripheral and up to five Guest centrals; QR carries service identity but BLE discovery remains required | Pass — The route uses public iOS and Android system BLE APIs under the exact Expo platform SDK baseline. | Pass — Both platforms can implement the same application-defined GATT service and characteristic framing. | Pass — The comparison route can be isolated in a local Swift and Kotlin Expo module supported by the New Architecture. | Fail — The common GATT route does not provide a standard end-to-end secure channel with a peer certificate fingerprint; meeting the contract would require a custom security protocol. | Pass — No third-party transport package, native artifact, or downloader is added; both BLE APIs are maintained system frameworks. | Not run — No third-party transport SDK is planned, but no iOS or Android native build artifact exists for dependency, symbol, configuration, and endpoint verification. | Fail — BLE service discovery remains required after QR scanning, so the candidate cannot provide the required QR direct hint recovery when discovery is disabled. | `Not run` | Cross-platform GATT is possible, but a custom security protocol and mandatory discovery fail the route; telemetry remains Not run without native build artifacts. |

Primary source の API premise を読んだことは Physical Status の `Pass` ではない。Phase A は source と route の
選別だけであり、Development Build、相互接続、200 Join、Packet Capture は以下の Physical Record を実行するまで
`Not run` のままです。

## Evidence bundle binding record

| Binding field | Value |
| --- | --- |
| Evidence Bundle ID | `Not run` |
| Candidate and exact route | `Not run` |
| Candidate version or OS API version | `Not run` |
| Candidate source locator | `Not run` |
| Repository Git commit | `Not run` |
| iOS public Build ID | `Not run` |
| iOS artifact SHA-256 | `Not run` |
| iOS OS major | `Not run` |
| Android public Build ID | `Not run` |
| Android artifact SHA-256 | `Not run` |
| Android OS major | `Not run` |
| Analysis script version | `Not run` |
| Analysis script SHA-256 | `Not run` |
| Sensitive Field Manifest SHA-256 | `Not run` |
| Positive-control Fixture SHA-256 | `Not run` |
| Capture Tool version | `Not run` |
| Execution Month | `Not run` |
| Public Review PR | `Not run` |
| Security and Privacy attestation | `Not run` |

この表が以下の全 Physical Record を 1 つの Evidence Bundle ID へ結び付ける。異なる Bundle の数値、Build、
Capture、Review を合算しない。

Binding の iOS は `physical-iphone`、Android は `physical-android` の実機だけを表す。製品 model、UDID、
Android ID、Serial、IP、MAC、SSID、BSSID、Owner 名、正確な実行日時は記録しない。

## Join measurement record

| Network fixture | Direction | Planned joins | Attempts | Successes | Permission failures | Status |
| --- | --- | ---: | --- | --- | --- | --- |
| Same Wi-Fi | iPhone Host → Android Guest | 50 | `Not run` | `Not run` | `Not run` | `Not run` |
| Same Wi-Fi | Android Host → iPhone Guest | 50 | `Not run` | `Not run` | `Not run` | `Not run` |
| Personal Hotspot | iPhone Host → Android Guest | 50 | `Not run` | `Not run` | `Not run` | `Not run` |
| Personal Hotspot | Android Host → iPhone Guest | 50 | `Not run` | `Not run` | `Not run` | `Not run` |

## Network fixture summary record

| Network fixture | Planned attempts | Attempts | Successes | Success rate | Median ms | p95 ms | Disconnects | Disconnect rate | Permission failures | Status |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Same Wi-Fi | 100 | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` |
| Personal Hotspot | 100 | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` |

## Network isolation record

| Network fixture | Platform class | Reachability before | Reachability after | Public DNS queries | External endpoints | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Same Wi-Fi | `physical-iphone` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` |
| Same Wi-Fi | `physical-android` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` |
| Personal Hotspot | `physical-iphone` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` |
| Personal Hotspot | `physical-android` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` |

Attempt ごとの Log は作らない。方向ごと 50 件以下の monotonic duration 配列と固定 Failure Counter だけを
検証端末の Process Memory で扱い、方向別事実と Network fixture 集計へ転記した直後に破棄する。

## Physical rubric record

| Gate | Source record | Derived status |
| --- | --- | --- |
| iOS and Android interoperability | Evidence bundle binding、Join measurement である。 | `Not run` |
| Offline network | Network isolation、Packet capture である。 | `Not run` |
| Encryption and peer authentication | Security binding、Packet capture である。 | `Not run` |
| Join experience | Join measurement、Network fixture summary、Lifecycle and permission である。 | `Not run` |
| Group lifecycle | Star relay、Lifecycle and permission である。 | `Not run` |
| Discovery recovery | Discovery-disabled recovery である。 | `Not run` |
| Background and reconnect | Lifecycle and permission である。 | `Not run` |
| Expo and New Architecture | Evidence bundle binding、Expo and supply-chain である。 | `Not run` |
| Supply chain | Evidence bundle binding、Expo and supply-chain である。 | `Not run` |
| Privacy and telemetry | Static screening、Packet capture、Privacy 正本である。 | `Not run` |

## Lifecycle and permission record

| Scenario | Result | Status |
| --- | --- | --- |
| QR to Ready operations | `Not run` | `Not run` |
| Permission explanation | `Not run` | `Not run` |
| Permission denied | `Not run` | `Not run` |
| Permission restored | `Not run` | `Not run` |
| Background then foreground | `Not run` | `Not run` |
| Network switch | `Not run` | `Not run` |
| Hotspot disconnect | `Not run` | `Not run` |
| Target routing | `Not run` | `Not run` |
| Guest leave | `Not run` | `Not run` |
| Dispose | `Not run` | `Not run` |

## Star relay record

| Host platform | Participants | Broadcast | Target | Guest leave | Host end ≤ 5 seconds | Status |
| --- | --- | --- | --- | --- | --- | --- |
| iPhone | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` |
| Android | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` | `Not run` |

## Discovery-disabled recovery record

| Host platform | Planned attempts | Attempts | Successes | Status |
| --- | ---: | --- | --- | --- |
| iPhone | 5 | `Not run` | `Not run` | `Not run` |
| Android | 5 | `Not run` | `Not run` | `Not run` |

## Security binding record

| Security check | Value | Status |
| --- | --- | --- |
| Negotiated protocol and cipher | `Not run` | `Not run` |
| QR fingerprint equals peer key | `Not run` | `Not run` |
| Fingerprint mismatch rejected | `Not run` | `Not run` |
| Untrusted peer key rejected | `Not run` | `Not run` |
| Expired and replayed QR rejected | `Not run` | `Not run` |
| Plaintext fallback rejected | `Not run` | `Not run` |

## Packet capture record

| Field | Value |
| --- | --- |
| Capture status | `Not run` |
| Capture SHA-256 | `Not run` |
| Canary set SHA-256 | `Not run` |
| Serialized Envelope set SHA-256 | `Not run` |
| Analyzer positive-control status | `Not run` |
| Candidate flow packets | `Not run` |
| Candidate flow bytes | `Not run` |
| Canary Envelopes sent and received | `Not run` |
| Capture coverage status | `Not run` |
| Sensitive Field Manifest coverage | `Not run` |
| Full Canary matches | `Not run` |
| Canary fragment matches | `Not run` |
| Encoded representation matches | `Not run` |
| External endpoints | `Not run` |
| Raw L5 retention attestation | `Not run` |
| Ephemeral volume and sync disabled | `Not run` |
| Encryption key destroyed | `Not run` |
| Reviewer verdict | `Not run` |

raw Capture、Canary cleartext、通信層 Address、Packet Timing は記録しない。raw `L5` の保存と削除は
[保持ポリシー](../privacy/retention-policy.md)、この公開 `L5P` Record の Field は
[Privacy データ台帳](../privacy/data-inventory.md) に従う。

## Expo and supply-chain record

| Gate | Value | Status |
| --- | --- | --- |
| Expo Go boundary | `Not run` | `Not run` |
| iOS Development Build | `Not run` | `Not run` |
| Android Development Build | `Not run` | `Not run` |
| React Native New Architecture | `Not run` | `Not run` |
| Candidate source matches Phase A | `Not run` | `Not run` |
| License and maintainer status | `Not run` | `Not run` |
| Native Artifact provenance | `Not run` | `Not run` |
| Application-controlled SDK analytics | `Not run` | `Not run` |
| Spike code absent from Production Path | `Not run` | `Not run` |

## Decision record

- Final decision: `Not made`
- Static Screening Status: `Not run`
- Physical Spike Candidate: `Not selected`
- Physical Execution Status: `Not run`
- Selection Status: `Undecided`
- Preferred Baseline: `Not selected`
- Rejected candidates: Static screening record の `Fail` Candidate と棄却理由を参照する
- Platform constraints: `Static route only: mDNS + TLS requires iOS 16.4+ and Android 10 / API 29+; native artifact and physical compatibility not proven`
- Reconsideration triggers: `Static telemetry evidence remains unavailable; TLS 1.3 or leaf fingerprint unavailable; QR direct hint cannot connect; Android 10+ excludes required Pilot devices`
- Follow-on Accepted ADR: `Not created`
- Issue 20 close gate: `Blocked by physical evidence`

4 Candidate の Static 判定、Phase A を `Pass` した 1 Candidate の整合した Evidence Bundle、
全 Physical gate、独立 Review が完了するまで、`Selected`、`Accepted transport`、`Production ready`、
Issue 完了を主張しない。

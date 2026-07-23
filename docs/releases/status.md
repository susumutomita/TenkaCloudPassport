# Release Status and Device Matrix

- Snapshot date: 2026-07-18
- Evidence source snapshot: `eaa6382cd380c31400cd1e879625ccbcc628c0ba`
- Candidate commit: `Not fixed`（tag 作成時に 40 桁 SHA へ固定する）
- Candidate version: `0.1.0-alpha.1`
- Native user-facing version: `0.1.0`（Source-only Candidate に Native Binary は含めない）
- Public OSS Alpha: `Blocked`
- `oss-alpha-draft` Environment protection: `Not run`（Repository 設定の Required Reviewer 証拠なし）
- `v*` Tag immutability ruleset: `Not run`（active な更新 / 削除禁止と bypass なしの証拠なし）
- `OSS_ALPHA_RULESET_AUDIT_TOKEN`: `Not run`（単一 Repository scope、`Administration: write`、expiry、revoke owner の証拠なし）

`Implemented / Experimental / Planned` は default branch の Source 成熟度です。`Verified / Not run / Blocked` は
この Snapshot の Environment Evidence です。空欄や全体 Green から個別能力を推測しません。

## Feature Matrix

| Feature | Source maturity | Repository evidence | Physical evidence | Limitation |
| --- | --- | --- | --- | --- |
| Account-free Passport onboarding | `Implemented` | `Not run`: rerun on Candidate commit and attach immutable Actions URL / reviewer | `Not run`: iOS / Android first-use study | 初見 90 秒と実 Storage は Issue 30 待ち。 |
| Rules Provider Bridge / no-signal | `Implemented` | `Not run`: rerun on Candidate commit and attach immutable Actions URL / reviewer | `Not run`: physical offline E2E | Green tests are not Airplane Mode evidence. |
| QR Invite / Ready contract | `Implemented` | `Not run`: rerun on Candidate commit and attach immutable Actions URL / reviewer | `Not run`: real camera and multi-device scan | Camera permission and QR rotation remain physical gates. |
| Group Lounge coordinator | `Experimental` | `Not run`: rerun on Candidate commit and attach immutable Actions URL / reviewer | `Not run`: mixed-device 30-minute セッション | No real Nearby Adapter is connected. |
| Local diagnostics / full delete | `Experimental` | `Not run`: rerun on Candidate commit and attach immutable Actions URL / reviewer | `Not run`: OS log and physical storage inspection | Real Model / Transport cleanup is not connected. |
| Local LLM Provider | `Planned` | `Blocked`: Draft PR 48 is not on default branch | `Not run`: iPhone / Android arm64 GGUF | Do not claim Local LLM from Draft CI. |
| GGUF lifecycle / benchmark | `Planned` | `Blocked`: Draft PR 50 depends on PR 48 | `Not run`: 4B / 8B across both platforms | Model Weight is never distributed here. |
| Real Nearby Transport | `Planned` | `Blocked`: no accepted spike or production Adapter | `Not run`: iOS↔Android / same-OS / hotspot | In-process binding is not network evidence. |
| Signed Android distribution | `Planned` | `Blocked`: Draft PR 51 is stacked on PR 48 | `Not run`: signed APK install / update / rollback | Source-only Candidate includes no APK. |

## Device / OS Matrix

| Environment | Build / Provider | Status | Validation date | Evidence or recovery |
| --- | --- | --- | --- | --- |
| GitHub Actions `ubuntu-latest` | Web Export / Rules | `Not run` | 2026-07-18 | Rerun on Candidate commit; attach immutable Actions URL and reviewer before promotion. |
| Desktop Browser on macOS / Linux / Windows | Web / Rules | `Not run` | 2026-07-18 | Run Web quickstart per Browser and record Version before promotion. |
| iPhone + Expo Go | Expo Go / Rules | `Not run` | 2026-07-18 | Record Device family, iOS Version, Expo Go Version, and Flow evidence. |
| Android phone + Expo Go | Expo Go / Rules | `Not run` | 2026-07-18 | Record Device family, Android Version, Expo Go Version, and Flow evidence. |
| iPhone + local Development Build | Native / Rules or Local LLM | `Not run` | 2026-07-18 | Xcode, signing, Build ID, offline Flow, cleanup evidence required. |
| Android arm64 + local Development Build | Native / Rules or Local LLM | `Not run` | 2026-07-18 | SDK / JDK, ABI, Build ID, offline Flow, cleanup evidence required. |

## Model Matrix

| Model class | iPhone | Android arm64 | Repository policy |
| --- | --- | --- | --- |
| Rules Provider, no Model Weight | `Not run` physical | `Not run` physical | Source implementation exists; offline device E2E is separate. |
| 4B GGUF, compatible quantization | `Not run` | `Not run` | Weight, full path, full hash, Prompt, Answer are not committed. |
| 8B GGUF, compatible quantization | `Not run` | `Not run` | Memory, thermal, battery, cancel, unload, delete evidence required. |

## Transport Matrix

| Transport | iOS↔iOS | Android↔Android | iOS↔Android | Evidence boundary |
| --- | --- | --- | --- | --- |
| In-process single-runtime binding | `Not applicable` | `Not applicable` | `Not applicable` | Repository tests only; never a physical transport claim. |
| Same Wi-Fi Nearby candidate | `Not run` | `Not run` | `Not run` | Issue 20 comparison and Issue 22 Adapter required. |
| Personal Hotspot Nearby candidate | `Not run` | `Not run` | `Not run` | 100 joins, recovery, 3-device relay, packet capture required. |

## Evidence expiry

Native dependency、OS、Expo SDK、Model class、Transport、Build metadata のいずれかが変わった行は過去の
`Verified` を引き継ぎません。該当行を `Not run` に戻し、同じ Candidate Commit / Build で再検証します。

# OSS Alpha Release PM Review

## Review conclusion

- Issue: <https://github.com/susumutomita/TenkaCloudPassport/issues/29>。
- Role: Product Manager。
- Review date: 2026-07-18。
- Review basis: [OSS Alpha Release 仕様書](./2026-07-18-oss-alpha-release.md)、
  [OSS Alpha Release 設計](../design/oss-alpha-release.md)、
  [ADR-0024](../adr/0024-reproducible-source-release.md)、
  [Definition of Done](../architecture/quality-bar.md) である。
- Product specification: `ALLOW`。Source-only Candidate と Public Release を分ければ、利用者へ誤認を
  与えずに実装できる。
- Source-only Draft Candidate: この Review だけでは `Not verified` である。Candidate の byte 再現性、禁止物の
  不在、SBOM、License、checksum、品質 Gate を同一 Commit で実証する必要がある。
- Public OSS Alpha: `BLOCKED`。Release Scope を固定した後、その Scope の必須物理 Gate がすべて
  `Verified` になるまで公開しない。

`make before-commit`、GitHub Actions、文書の存在は必要条件であり、実機互換性、Offline E2E、
Accessibility、バックアップ Round-trip、Full Delete の代替証拠にはしない。この PM Review 自体も Release 承認ではない。

## Product outcome and release stages

OSS Alpha の主語は Maintainer ではなく、外部 Contributor と Local Champion です。最初の画面と文書で伝える
Product Promise は「デジタル名刺を交換すること」ではない。Owner が公開を許可した手掛かりだけを Pet が扱い、
人間同士の会話を始める Bridge を 1 つ提示して退くことです。

Release は次の Stage を混同しない。

| Stage | Outcome | Exit condition |
| --- | --- | --- |
| R0: Repository contract | 仕様、設計、ADR、Evidence Schema が Review 可能である。 | 文書間の Scope と状態語彙が一致する。 |
| R1: Source-only Draft Candidate | 固定 Commit から Source Archive、SPDX SBOM、License Notice、Manifest、checksum を再現できる。 | Candidate を独立した 2 Directory へ生成し、全 Payload Artifact が byte 一致する。禁止物がない。 |
| R2: Public Source Alpha | 外部 Contributor と Local Champion が、Supported と未検証を誤認せず再現できる。 | Scope Freeze 時に必須とした Checklist がすべて `Verified` であり、人間が公開を承認する。 |
| R3: Optional Android Artifact | Distribution 判断で許可された Android Artifact を検証済みの別 Artifact Kind として配布する。 | Issue 28 と Native / Model / Transport の物理 Gate、署名、更新、Rollback が揃う。 |

R1 の達成を R2 と呼ばない。R2 に不要な機能は `Experimental` または `Planned` として残せるが、
`Supported` と表示した能力の必須 Gate を公開直前に任意扱いへ変更してはならない。

## User stories

| Actor | Story | Observable success | Refusal condition |
| --- | --- | --- | --- |
| First-time external Contributor | Bun、Web、Expo Go、Native Development Build の違いを理解し、自分の環境で最小 Flow を再現したい。 | 選んだ経路の前提、Command、期待する最初の成功、使えない能力、Recovery を一続きで確認できる。 | Expo Go / Web で Local LLM、Camera、Nearby Transport が使えると読める場合は失敗である。 |
| Local Champion | Pilot で約束できる Device / OS / Model / Transport の組合せを事前に判断したい。 | 組合せごとの状態、検証日、Build / Commit、Evidence、Known Limitation を確認できる。 | 空欄、全体の Green 表示、Simulator、別 Commit の結果から実機対応を推測する場合は失敗である。 |
| Privacy-conscious Participant | Source や配布物に会話、Passport、識別子、秘密、Model Weight が含まれないと確認したい。 | 展開済み Artifact の Inventory と禁止物検査を確認できる。Participant Data を Release 工程で収集しない。 | File 名の denylist だけ、または Checkout だけを検査して実 Artifact を検査しない場合は失敗である。 |
| Release Operator | 同じ Commit と Lockfile から、同じ Candidate を安全に再生成したい。 | Version と Commit が固定され、2 回の生成物が byte 一致し、既存 Output や Draft を上書きしない。 | mutable branch、実行時刻、同じ Output の再利用、手編集した Artifact が混入する場合は失敗である。 |
| Security and license Reviewer | 信頼境界、依存 Package、License、残余リスクを Artifact 単位で追跡したい。 | SPDX 2.3、Project License、直接依存 Notice、全 Payload checksum、Security Review を同一 Commit へ結び付けられる。 | SBOM の生成成功だけで内容の完全性や License 読み取り失敗を無視する場合は失敗である。 |
| Accessibility Reviewer | 状態表と主要 Flow が色だけに依存せず、対象環境で操作可能か判断したい。 | 状態 Label、根拠 Link、Device / OS / Assistive Technology、検証日がある。 | 静的解析や文書 Review を VoiceOver / TalkBack の完走証拠へ読み替える場合は失敗である。 |
| New Contributor | Product Boundary を壊さず、最初の Contribution を完了したい。 | 3 件以上の実在する Good First Issue に背景、Scope、受け入れ条件、検証方法、Scope-out がある。 | 候補一覧だけ、または Cloud、Analytics、Model Weight 配布、Privacy 緩和を前提にする場合は失敗である。 |
| Maintainer handling a bad release | 間違った Candidate を上書きせず、安全に撤回して訂正版を案内したい。 | Draft の破棄、公開済み Version の扱い、新 Version、Known Limitation、利用者 Action が明記されている。 | 同じ Version の Archive や checksum を置き換える場合は失敗である。 |

## Evidence vocabulary

Feature と Gate の状態を分離する。

- `Implemented`: 対象 Commit の default branch に実装があり、Repository Gate と、その能力に必要な環境証拠が
  ある。Draft PR、設計書、単体 Test だけでは選べない。
- `Experimental`: 実装はあるが、対応範囲が限定される、または一部の必要環境が未検証である。制約と
  `Not run` の組合せを隣接表示する。
- `Planned`: default branch で利用できない。Issue、Draft PR、将来設計を実装済み表示へ先取りしない。
- `Verified`: 指定した Scope、Commit / Build、環境、検証日について、再実行可能な根拠がある。
- `Not run`: 実行証拠がない。失敗ではないが、必須 Gate の完了にも数えない。
- `Blocked`: 実行したが前提不足または失敗で合格判定できない。理由と Recovery Owner を記録する。

Matrix と Checklist の各 Evidence Record は、最低でも `status`、`scope`、Git Commit、公開 App Version / Build、
検証環境、検証日、Evidence Link、Known Limitation を持つ。実端末の個体識別子、Participant、Lounge、Passport、
会話内容、Model の Full Path / Full Hash は記録しない。Model は公開可能な Architecture、Parameter Class、
Quantization、Size Class で識別し、Weight 自体を Repository へ置かない。

## Acceptance scenarios and required evidence

`I-01`〜`I-13` は Issue 29 の受け入れ条件順、`S-01`〜`S-12` は仕様書の受け入れ基準順です。

| ID | Evidence-backed scenario | Required evidence | False pass rejected |
| --- | --- | --- | --- |
| `I-01` / `S-01` | Given 初見の読者が Repository を開く。When README の最初の Product 説明を読む。Then 「デジタル名刺ではない」「Pet」「公開を許可した手掛かり」「会話の糸または Bridge を 1 つ見つける」を、機能一覧より先に理解できる。 | `README.md` の冒頭と、[CONCEPT](../../CONCEPT.md)、[Product Contract](../product/product-contract.md) への Link Review。 | 見出しだけの文言一致、後半だけの説明、Pet を一般的な Chatbot と説明すること。 |
| `I-02` / `S-02` | Given Bun だけ、Expo Go / Web、Native Toolchain の 3 種類の読者がいる。When Quickstart を選ぶ。Then 前提、Command、期待する最初の成功、利用可能 Provider、使えない能力、Recovery が経路ごとに完結する。 | Clean Checkout の Command Transcript。Web と Expo Go は Rules Provider、Native は Development Build と [Native Build 手順](../development/native-builds.md)へ結び付ける。 | 1 つの Command 列に混在させること、Metro 起動だけを Flow 成功とすること、Native module を Expo Go で利用可能と表示すること。 |
| `I-03` / `S-03` | Given Contributor が Architecture Diagram を読む。When Arrow と Legend を追う。Then Domain、Agent Runtime、Rules / Local LLM、Storage、QR、Nearby Transport の依存方向と Adapter 境界を説明できる。 | README から辿れる Diagram Source、Arrow の意味、実 Source import の Review、Architecture Harness の同一 Commit 結果。 | Component 名だけを並べること、data flow と import direction を区別しないこと、未実装 Adapter を実線の Supported 経路にすること。 |
| `I-04` / `S-04` | Given Reviewer が README から正本を探す。When Product、Privacy、Security、Protocol、Decision、運営の Link を開く。Then [CONCEPT](../../CONCEPT.md)、[Product Contract](../product/product-contract.md)、[Threat Model](../security/threat-model.md)、[Data Inventory](../privacy/data-inventory.md)、[Protocol Spec](../architecture/peer-protocol.md)、[ADR](../adr/)、[Facilitator Kit](../facilitator/README.md)へ到達する。 | Link Checker または Clean Archive 上の Link Walk。各 Link が Release Archive 内の追跡 File を指す。 | File が存在するだけ、README から到達できないこと、絶対 Local Path、Release に含まれない Target。 |
| `I-05` / `S-05` | Given Feature Inventory が Scope Freeze される。When各機能を分類する。Then `Implemented` / `Experimental` / `Planned`、対象環境、検証日、Evidence、制約が同じ Row にある。 | default branch の Code / Test、対象環境の Evidence、Feature Matrix の Git Commit。 | Draft PR や Issue の存在、Green CI だけで `Implemented` にすること、状態をページ全体へ一括適用すること。 |
| `I-06` / `S-05` | Given Device、OS、App Build、Provider / Model、Transport の候補がある。When Support Matrix を確認する。Then検証した組合せだけが `Verified` で、未実施の組合せは明示的に `Not run`、前提不足は `Blocked` である。 | 組合せ単位の検証日、Commit / Build、再現手順、Evidence Link。実機は機種名と OS Version を記録するが個体 ID は記録しない。 | 1 台の結果の横展開、Simulator を実機とすること、列や Cell の空欄、古い Build の結果、Model File 名や Full Hash の記録。 |
| `I-07` / `S-08` | Given固定 Commit の追跡 Tree と生成済み Candidate がある。When Source Archive を展開し全添付を検査する。Then Model Weight、Token、秘密鍵、Certificate、Provisioning Profile、Participant Data、生成 Native Project、Build Output、`node_modules` がない。 | Git tree inventory、展開 Archive inventory、Secret / 禁止パス scan、Participant Data を投入していない Release Operator の Attestation、異常系 Test。 | Working Tree だけの検査、拡張子の一部だけの denylist、`.gitignore` への依存、秘密を Log へ出す検査、Test Fixture を実 Participant Data で作ること。 |
| `I-08` / `S-06` | Given R1 Candidate の全 Payload が生成される。When Reviewer が Manifest と checksum を照合する。Then Git ref、Version、Source Archive、SPDX 2.3 SBOM、Project License、直接依存 License Notice、SHA-256 が一意に対応する。 | `release-manifest.json`、Source Archive、SPDX JSON、`LICENSE`、`THIRD_PARTY_NOTICES.md`、`checksums.txt` の Schema / content / digest Test。checksum File 自身を self-hash しない境界も明記する。 | GitHub 自動 Archive だけ、SHA を Release Notes へ手貼り、SBOM の JSON parse 成功だけ、License 不明のまま成功、添付 File の checksum 漏れ。 |
| `S-07` | Given同じ Commit、Version、`bun.lock`、frozen install がある。When空の独立した 2 Output Directory へ Candidate を生成する。Then File 名一覧と全 byte が一致する。 | 2 回の生成 Log、全 Payload の byte comparison、Commit の時刻を使う Archive metadata Test、実行時刻非混入 Test。 | 同じ Directory の再利用、1 回目の Artifact を Copy、digest だけ比較、Archive 以外を比較しないこと。 |
| `I-09` / `S-12` | Given Release Candidate Commit が固定される。When Local Gate と GitHub Workflow を実行する。Then `make before-commit` と Candidate 再現性 Test が成功し、同じ Commit の GitHub Actions が Green である。 | Local command、exit code、Candidate Commit、GitHub Actions Run Link、Workflow SHA、Test Summary。 | 別 Commit、古い Run、Retry 前の Artifact、`continue-on-error`、report-only Job、Assistant の成功報告だけ。 |
| `I-10` / `S-09` | Given Release Scope と必須 Gate が Candidate 作成前に固定される。When Security、Privacy、Accessibility、Offline E2E、バックアップ Round-trip、Full Delete を判定する。Then各 Gate は `Verified` / `Not run` / `Blocked` と根拠を持ち、必須 Gate が 1 件でも `Not run` / `Blocked` なら R2 を止める。 | Security Review と攻撃 Corpus、Artifact Privacy scan、対象 Device / OS / Assistive Technology の完走、Airplane Mode E2E、同一 RC の Export→Delete→Import Round-trip、全削除→再起動の Storage inspection。 | Checklist の Checkbox だけ、単体 Test を全物理 Gate の代替にすること、未実施を Scope から公開直前に外すこと、`Not run` を注意書きだけで Publish すること。 |
| `I-11` / `S-10` | Given新規 Contributor が Good First Issue を選ぶ。When 3 件以上を開く。Then各 Issue に Product Boundary、In-scope、Out-of-scope、受け入れ条件、検証 Command、関連文書があり、独立して完了できる。 | GitHub 上の 3 件以上の Open Issue Link、`good first issue` Label、Contributor Guide、Issue Template、PR Template の Link Check。 | 文書内の候補だけ、重複 Issue、未分割の大型機能、Cloud Account / Analytics / Model Weight / Privacy 緩和を導入する課題。 |
| `I-12` / `S-11` | Given Candidate の Version が決まる。When Release Notes と Rollback を読む。Then package Version、Git ref / Tag、Changelog、Known Limitations、Matrix、訂正時の新 Version、利用者 Action が一致する。 | strict SemVer validation、Version 一致 Test、Changelog entry、Known Limitations、Draft / Published それぞれの Rollback rehearsal record。 | `latest` だけ、同じ Version の上書き、Draft 削除だけを公開済み Rollback と呼ぶこと、Matrix の `Not run` を Notes から落とすこと。 |
| `I-13` / `S-11` | Given Apple の有料登録をしていない Contributor / Tester がいる。When Release Notes の Distribution Matrix を読む。Then Web / Expo Go で検証できる範囲、Xcode Personal Team による本人の iOS 自己 Build、Public iOS 配布の Scale Gate を区別できる。 | [Issue 28](https://github.com/susumutomita/TenkaCloudPassport/issues/28) の Decision Table、Apple 公式資料 Link と確認日、Tier ごとの Capability Matrix。 | Personal Team を Public 配布と呼ぶこと、Certificate / Apple Account の共有、TestFlight / App Store を無料前提にすること、変動しうる Apple 制約を出典なしで固定すること。 |

## Quality Bar scenario

Release CLI は App Runtime ではないが、[Definition of Done](../architecture/quality-bar.md) の例外ではない。

Given Version、Git ref、Output Path、Lockfile、Package metadata、License、追跡 Path が外部入力です。When 正常、
空、境界、破損、競合、symlink、既存 Output、同名別 Version、複合 SPDX expression を処理する。Then 境界で検証し、
型付き Error で fail closed する。既存 Candidate は変更せず、秘密や入力本文を Log へ反射しない。全分岐を日本語 BDD
Test で覆う。Archive と checksum は File / Stream 単位で処理し、Source Tree 全体を Memory へ読み込まない。
Shell command を使う場合は argv 配列を渡し、Version、ref、パスを Shell interpolation しない。

Release Workflow は CLI と既存 Make target を呼ぶだけとし、禁止 Path、状態判定、Version 規則を YAML へ複製しない。
品質 Gate が Green でも自動 Public Publish は行わず、既存 Draft Release がある場合は上書きせず停止する。

## Dependency gates

GitHub Issue の open / closed は進行管理の Signal であり、Release Evidence ではない。Release Candidate と同じ
Commit / Build で、次の証拠を再確認する。

| Dependency | 2026-07-18 snapshot | Evidence needed before R2 |
| --- | --- | --- |
| [Group Lounge](https://github.com/susumutomita/TenkaCloudPassport/issues/24) | Open | 2〜6 台、iOS / Android 混在、再接続、Host Loss、期限切れ、破棄、Soak、Network / Storage inspection。Nearby を Supported にしない Release Scope でも、未検証を Matrix へ残す。 |
| [AI Input Safety](https://github.com/susumutomita/TenkaCloudPassport/issues/19) | Open | Threat Model、攻撃 Corpus、Fuzz、Evidence 外 Claim / Tool Call 拒否、Rules への 1 回だけの Fallback、Security Review。 |
| [JSON Backup](https://github.com/susumutomita/TenkaCloudPassport/issues/14) | Closed | 同一 RC の Preview、strict validation、atomic import、Lounge Data 不在、Export→Delete→Import Round-trip。Issue close だけでは再実行を省略しない。 |
| [Global UX](https://github.com/susumutomita/TenkaCloudPassport/issues/15) | Closed | JA / EN、200％ Text、44 pt、Reduce Motion、色以外の状態、VoiceOver / TalkBack による対象 Flow の実機完走。 |
| [Diagnostics / Full Delete](https://github.com/susumutomita/TenkaCloudPassport/issues/25) | Open | Sanitized diagnostics、Telemetry 不在、全削除後の再起動、Model / バックアップ Cache / Settings 不復元、OS Log inspection。 |
| [Zero-cost Distribution](https://github.com/susumutomita/TenkaCloudPassport/issues/28) | Open | Tier / Capability / Cost / Scale Gate、Apple 公式制約、Android Artifact の署名、checksum、更新、Rollback の決定。 |

Optional Android Artifact は Source-only R1 に混ぜない。[ADR-0024](../adr/0024-reproducible-source-release.md) と
[OSS Alpha Release 設計](../design/oss-alpha-release.md) が挙げる llama.rn Provider、Model Lifecycle、Transport ADR、
Nearby Transport、Distribution の Gate が揃った後、別 Artifact Kind として判断する。APK がないことは R1 の失敗では
ないが、APK を添付した時点で Source-only の Evidence を流用して合格にはできない。

## Scope-out and non-waiver rules

Current Source-only Candidate の Scope-out は次です。

- App Store、TestFlight、Public iOS Distribution、公開 Android APK、Hosted Web deployment。
- SLA、完成版宣言、Support 保証。
- Model Weight、Cloud Account / Backend、Participant Analytics。
- 実機 iOS / Android、Nearby Transport、VoiceOver / TalkBack、外部 Pilot の実施作業そのもの。
- Issue 17〜22 の Draft 実装を default branch の `Implemented` として表示すること。
- Green CI から Public GitHub Release までの自動昇格。

実施作業が Scope-out でも、公開判断の Evidence は免除されない。物理 Gate をこの変更で実行しない場合は
`Not run` と記録し、R1 Draft Candidate で止める。外部 Pilot、Public Distribution、Native Artifact を将来追加する
場合は、新しい Scope Freeze と Candidate 固有の Evidence を必要とする。

## False-completion risks

1. **Draft / Public の混同**: deterministic Archive ができただけで Issue 29 を完了し、公開する。
2. **Status laundering**: Draft PR、設計書、Unit Test、Simulator、別 Branch の結果を `Implemented` / `Supported` にする。
3. **Matrix の空欄**: 未検証 Cell を空にし、読者に非対応か未実施かを推測させる。
4. **Evidence drift**: Matrix、Checklist、Workflow、Artifact が異なる Commit / Build / Version を参照する。
5. **Archive blind spot**: Checkout を scan して、実際の tarball と添付 File を展開検査しない。
6. **Hidden nondeterminism**: 同じ Output を再利用する、実行時刻や File order を混入する、Archive だけ比較する。
7. **Incomplete SBOM / Notice**: direct dependency だけを SBOM に入れる、同名別 Version を潰す、License 不明を成功扱いする。
8. **Green-gate overclaim**: `make before-commit` や GitHub Actions を Offline E2E、VoiceOver / TalkBack、実 Transport、Full Delete の証拠にする。
9. **Link-only completion**: README に Link を追加しただけで、Archive 上の到達性、内容、正本との整合を確認しない。
10. **Good First Issue theater**: 3 件の候補名だけを文書へ書き、実在 Issue、Scope、受け入れ条件、検証方法を用意しない。
11. **Mutable rollback**: 公開済み Version の Asset を差し替え、過去の checksum と利用者の取得物を不一致にする。
12. **Free iOS overclaim**: Personal Team の自己 Build を、非開発者への無料 Public Distribution と表現する。
13. **Evidence privacy leak**: Matrix や実機 Log に Device ID、Participant、Lounge、Model Full Path / Full Hash、会話内容を残す。
14. **Scope shrink after failure**: 必須 Gate が失敗または `Not run` になった後、公開するためだけに任意へ変更する。

## Release decision rule

- R1 は、Candidate 固有の Repository Evidence がすべて `Verified` の場合だけ `ALLOW` する。
- R2 は、Scope Freeze で必須とした Repository / Physical Evidence がすべて `Verified` の場合だけ人間が
  `ALLOW` する。
- 1 件でも必須 Evidence が `Not run` / `Blocked`、Commit 不一致、Link 切れ、個人情報混入なら `BLOCK` する。
- Block 時は状態を隠さず Draft を保持し、Owner、Recovery、再検証条件を Known Limitations と Checklist に残す。
- 公開後の訂正は同じ Version を上書きせず、新 Version と Changelog、修正した Evidence を発行する。

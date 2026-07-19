# OSS Alpha Release QA Plan

## Scope

- Issue: <https://github.com/susumutomita/TenkaCloudPassport/issues/29>。
- Role: Feature QA。
- 対象: 再現可能な Source-only Release Candidate、Release Workflow、Contributor 向け文書契約である。
- 非対象: App Store / TestFlight、公開 Android APK、Hosted Web、Model Weight、Cloud Backend、Pilot 実施である。

本計画は、Repository 内で証明できる **Candidate Gate** と、人間が実機証跡を確認する
**Public Release Gate** を分離する。Candidate の全 Test と CI が Green でも、必須の物理項目に
`Not run` または `Blocked` が残る間は Draft Candidate に限定し、公開可能とは判定しない。

正本 Issue は [Issue 29](https://github.com/susumutomita/TenkaCloudPassport/issues/29) です。
詳細な契約は [仕様書](./2026-07-18-oss-alpha-release.md)、
[設計](../design/oss-alpha-release.md)、[ADR-0024](../adr/0024-reproducible-source-release.md)、
[Quality Bar](../architecture/quality-bar.md) に従います。

## Evidence policy

- Source Release の Test は、OS の一時 Directory に実 Git Repository を作り、`git init`、`git add`、
  `git commit`、`git archive`、実 File 読み書き、実 Process 終了 Code を使う。
- Git、File System、Lockfile、Package metadata、Archive、Hash の Mock / Stub API は使わない。
- CLI は shell 文字列ではなく argv 配列で起動し、stdout、stderr、終了 Code、生成 File を検査する。
- 正常系だけでなく、失敗後に既存 File が不変であること、部分 Candidate が残らないことも実 File I/O で確認する。
- Archive は展開または一覧化し、生成側とは別の読み取り処理で Entry、Byte、Mode、タイムスタンプ、SHA-256 を確認する。
- Test fixture に実在の秘密値や Participant Data を置かない。検出用の無効な marker だけを使う。
- Repository Test は物理能力の状態 Label と Evidence Link の契約だけを検査し、状態を `Verified` へ変更しない。

自動 Test は `scripts/source-release.test.ts` と文書・Workflow の実 File contract test に置く。各 Test は
日本語 BDD で記述し、専用の一時 Repository と Output Directory を使って相互に状態を共有しない。

## Git、Version、Output boundary

| ID | Given | When | Then |
| --- | --- | --- | --- |
| `GIT-01` | Commit 済みの実 Repository、strict SemVer、解決可能な ref がある。 | Candidate を生成する。 | Manifest の Commit は `git rev-parse <ref>^{commit}` と一致し、Archive はその Tree だけから作られる。 |
| `GIT-02` | 同じ Commit を指す full SHA と symbolic ref がある。 | 別 Output へ生成する。 | Ref 表記ではなく解決済み Commit が正本になり、成果物 Byte が一致する。 |
| `GIT-03` | Working Tree に変更済み追跡 File、未追跡 File、別の未追跡 Output がある。 | Commit ref から生成する。 | Dirty / untracked 内容は Candidate に混入せず、Commit Tree と同じ成果物になる。 |
| `GIT-04` | ref が空、不在、曖昧、過長、空白付き、`-` 始まり、`HEAD:../../outside`、shell metacharacter を含む。 | CLI へ渡す。 | Git を危険な Option や shell として解釈せず、型付き `INVALID_GIT_REF` で失敗する。 |
| `GIT-05` | `package.json` Version と CLI Version が一致する。 | 最小 Version、pre-release Version を生成する。 | 採用する SemVer profile に合う値だけを受理し、Manifest、File 名、Archive root が同じ Version になる。 |
| `GIT-06` | Version が空、`v` prefix、leading zero、build metadata の誤形式、改行、パス separator、過長値、または package Version と不一致である。 | CLI へ渡す。 | Output 作成前に fail closed となり、File 名や Git tag として使われない。 |
| `OUT-01` | Output が存在しない安全な Directory である。 | Candidate を生成する。 | 保持済み Parent descriptor と basename だけを使う OS の no-replace rename で sibling staging の検証済み inode を一度に Output 名へ確定し、同じ descriptor 基準で公開後 inode を検証する。 |
| `OUT-02` | Output が File、symlink、空でない Directory、または親 Path の途中に symlink を含む。 | Candidate を生成する。 | 既存 File を変更せず `UNSAFE_OUTPUT_DIRECTORY` で失敗する。 |
| `OUT-03` | 同じ未作成 Output を複数 Process が同時に確定する、または検査と確定の間に別 Process が Path を作る。 | Candidate を生成する。 | `RENAME_EXCL` / `RENAME_NOREPLACE` に成功した 1 Process だけが進み、敗者は既存 inode を置換しない。通常 rename へ fallback しない。 |
| `OUT-03A` | Parent identity 検査後に元の Parent を移動し、元 Path を自己整合した偽 Candidate のある別 Directory への symlink に差し替える。 | Candidate を確定して独立 verify する。 | no-replace rename と公開後 inode 検証は保持済み Parent descriptor に固定され、requested Parent / Output Path の再照合失敗で staging 名へ戻して成功を返さない。verifier も symlink ancestor を拒否する。 |
| `OUT-03B` | publication の platform module 読込中に staging basename を別 Directory へ置換する。 | Candidate を確定する。 | 公開後 descriptor の inode 不一致を検出し、descriptor-relative rollback で Output 名を空ける。置換 Directory とその File は削除しない。 |
| `OUT-03C` | verifier の初回列挙後に extra entry を追加する、先に hash 済みの File を後続 Archive hash 中に rename 置換する、または同一 inode を in-place 書換えする。 | Candidate を独立検証する。 | 完了直前の identity-bound exact entry set、全 basename の検証済み device / inode / size / ctimeNs / mtimeNs binding、Directory metadata のいずれかが不一致となり `INVALID_CHECKSUM` で失敗する。生成時も atomic publish 後の再検証を通るまで成功しない。 |
| `OUT-03D` | `mkdtemp` 後、staging identity を開いて確立する前に、同名 basename が別 Process の空 Directory へ置換される。 | Candidate を生成する。 | identity 未確立の basename を Path で削除せず `UNSAFE_OUTPUT_DIRECTORY` で停止する。置換 entry と退避された元 staging のどちらも削除しない。 |
| `OUT-03E` | atomic publish 後の初回 Output identity 照合後に、Output Directory を移動して同 Version の自己整合した別 Candidate を Output 名へ置く。 | Candidate を生成する。 | post-publish strict 検証は retained staging handle / expected inode を使い、検証前後の Output basename binding 不一致を拒否する。build result の Commit と別 Candidate の provenance を混同せず成功を返さない。 |
| `OUT-04` | Lockfile、License、Package metadata、Git command、または publication 前に失敗し、staging に未知 / 置換 File がある。 | Candidate を生成する。 | 個別 entry は削除せず、staging Directory 全体を保持済み Parent descriptor 内の一意な `.tenkacloud-passport-failed-*` 名へ no-replace rename して記録 inode を再確認する。隔離 Directory は cleanup 未完了として残り、requested Output は未作成のまま再実行できる。 |

SemVer profile、ref の最大長、Output の atomic publish 方法と対応 OS が実装契約で未確定の場合は、実装前に定数と
型付き Error を正本化する。Test 側だけで暗黙の許容範囲を決めない。

## Reproducibility and archive contract

| ID | Given | When | Then |
| --- | --- | --- | --- |
| `REP-01` | 同じ Git Commit と `bun.lock` がある。 | 独立した 2 Directory へ Candidate を 2 回生成する。 | Archive、SPDX、Notice、LICENSE、Manifest、checksum の全 File が byte 単位で一致する。 |
| `REP-02` | 同じ Repository を異なる絶対 Path に配置し、`TZ`、`LANG`、`LC_ALL`、umask を変える。 | 同じ Commit から生成する。 | Host Path、実行時刻、Locale、Output Path、Directory iteration 順に依存せず Byte が一致する。 |
| `REP-03` | Commit タイムスタンプと実行時刻が異なる。 | Archive を生成する。 | Entry タイムスタンプは正本で定めた Commit タイムスタンプに固定され、gzip header に実行時刻を含めない。 |
| `REP-04` | File 名、実行 bit、symlink、空 Directory 境界を持つ Tree がある。 | Archive を展開して検査する。 | Entry 順、root prefix、Mode、Link target が決定的で、絶対 Path、`..` traversal、所有者固有値を含まない。 |
| `REP-05` | 大小多数の追跡 File を持つ Repository がある。 | Candidate を child process で生成する。 | File 単位で処理して完走し、全 Archive を Memory へ同時読込する実装に退行しない。 |
| `REP-06` | 1 回目の Candidate の 1 Byte を変更する。 | 2 回目と比較し checksum を検証する。 | 再現性比較と checksum 検証の両方が非 0 で失敗する。 |

`REP-05` は 16 MiB の固定 File を descriptor-relative streaming hash する child process を使い、hash 前を基準にした
peak RSS 増分を 12 MiB 以下に固定する。時間は閾値にせず、Archive を全量 `Buffer` 化する退行を Memory 上限で拒否する。

## Release tree exclusions

追跡禁止 Path は黙って Archive から落とさず、Repository に存在した時点で Candidate 全体を拒否する。
未追跡 File は `git archive` の Tree に入らないことを別に確認する。

| ID | Fixture | Expected |
| --- | --- | --- |
| `TREE-01` | `.gguf`、model cache、`.p12`、`.mobileprovision`、keystore、PEM private key、`.env*`、Token marker | `FORBIDDEN_RELEASE_PATH` で fail closed になる。大文字小文字、二重拡張子、深い Directory でも回避できない。 |
| `TREE-02` | `node_modules`、`.expo`、`dist`、`coverage`、生成済み `ios` / `android` build output | Candidate を拒否し、Archive と SBOM の Payload に含めない。 |
| `TREE-03` | Participant export、Pilot Aggregate 原本、Passport / Answer / Bridge / Lounge dump を示す禁止 Path corpus | Candidate を拒否する。一般文書中の単語だけで誤検知しない。 |
| `TREE-04` | Repository 外や親 Directory を指す追跡 symlink | Extraction side effect を防ぐため拒否する。安全な相対 symlink を許す場合は root 内解決を検査する。 |
| `TREE-05` | `src/`、`docs/`、`assets/`、License、workflow、設定、fixture 用の非秘密画像 | Source-only allowlist として通り、元 File と Archive 内 Byte が一致する。 |
| `TREE-06` | 禁止 File が untracked、ignored、または Output Directory にだけ存在する。 | Commit Tree 由来の Candidate は不変で、禁止 Byte は Archive に存在しない。 |

Participant Data は File 名だけでは完全検出できない。パス allowlist / forbidden corpus の自動検査に加え、
Release Checklist で `git ls-tree` と Archive 一覧を人間が確認する Gate を残す。

## SPDX, License Notice, Manifest, and checksum

| ID | Given | When | Then |
| --- | --- | --- | --- |
| `META-01` | 実 `bun.lock` に root、direct、transitive、scoped package、同名別 Version がある。 | SPDX 2.3 JSON を生成する。 | Package は `name + version` 単位で一意な SPDX ID を持ち、同名別 Version を去重せず、Lockfile integrity と関係を決定順で保持する。 |
| `META-02` | Lockfile が unreadable、構文不正、Package record 欠落、integrity 不正、未知形状である。 | 解析する。 | 部分 SBOM を作らず、固定された型付き Error で失敗する。秘密値や入力全文を Error に反射しない。 |
| `META-03` | 同じ Commit を 2 回処理する。 | SPDX を比較する。 | `documentNamespace`、`creationInfo`、Package / Relationship 順が乱数や実行時刻に依存せず byte 一致する。 |
| `META-04` | 固定 Commit の Review 済み直接依存 Manifest に MIT、Apache-2.0、複合 SPDX expression がある。 | Notice を生成する。 | Name、top-level Lock key、Version、runtime / development 区分、License expression を改変せず決定順で記録する。 |
| `META-05` | Review 済み直接依存 Manifest が不存在、Package 集合 / Version / Lock key 不一致、License 欠落、または不正 JSON である。 | Notice を生成する。 | Worktree や `node_modules` へ Fallback せず Candidate を拒否する。既存 Notice を残さない。 |
| `META-06` | Project `LICENSE` がある。 | Candidate を生成する。 | Candidate の `LICENSE` は ref 内 Byte と一致し、Manifest と checksum の対象になる。 |
| `META-07` | 全 Payload File が生成済みである。 | `checksums.txt` を読む。 | Lowercase SHA-256 64 桁、File ごとに 1 行、重複なし、相対 basename、決定順、LF であり、再計算結果と一致する。 |
| `META-08` | checksum 行が欠落、重複、未知 File、絶対 Path、`..`、不正 digest、または成果物変更後の値である。 | Validator を実行する。 | 非 0 で失敗し、Draft Release 作成へ進まない。 |
| `META-09` | Manifest を読む。 | strict schema で検証する。 | Schema Version、Product Version、解決済み Commit、source-only Kind、Artifact 名、Size、SHA-256、Draft 判定を持ち、未知 Field と不整合を拒否する。 |
| `META-10` | SPDX Package、SPDXID、creator、npm purl を読む。 | strict validator を実行する。 | SPDX 2.3 identifier grammar、固定 creator、canonical npm Package 名 / Version / purl の相互一致を要求し、prefix だけ一致する値を拒否する。 |

Manifest と `checksums.txt` の自己参照は不可能なので、どの File が checksum 対象かを実装前に固定する。
最低限 Archive、SPDX、Notice、LICENSE、Manifest を外部 Validator が再計算できなければならず、
`checksums.txt` 自身を自己 hash の対象にはしない。

## Workflow security

Release Workflow は実 File を静的検査し、GitHub への Release 作成を Test から実行しない。

| ID | Given | When | Then |
| --- | --- | --- | --- |
| `WF-01` | Workflow の `uses:` を列挙する。 | Contract test を実行する。 | 全 Action が full commit SHA に pin され、floating tag と外部 SBOM / Release generator を使わない。 |
| `WF-02` | `pull_request`、fork PR、通常 `push` が発生する。 | Job 条件と permissions を評価する。 | Write Token、Draft Release 作成、secret-bearing Environment へ到達しない。`pull_request_target` を使わない。 |
| `WF-03` | Maintainer が `workflow_dispatch` する。 | Release Job を実行する。 | checkout-free publish Job だけが保護 Environment 承認後に最小 `contents: write` を受け、その他 Job は read-only である。Ruleset GET は保護 Environment の単一 Repository 専用 `Administration: write` 監査 Token だけを使い、空 Secret、通常 Token への fallback、`bypass_actors` 欠落 / 型不一致 / 非空、非空 exclude、更新 / 削除規則欠落を fail closed にする。 |
| `WF-04` | Checkout と install step を読む。 | Security contract test を実行する。 | Checkout は credential を後続 Process に残さず、safe-chain が frozen `bun.lock` install より先に動き、lifecycle script を無効化する。 |
| `WF-05` | Ref / Version に `${{ }}`、改行、quote、shell metacharacter を含む入力を与える。 | Workflow から CLI へ渡す。 | `run:` へ直接 interpolation せず env / argv 境界で validation され、任意 command を実行しない。 |
| `WF-06` | Candidate を独立 Directory へ 2 回生成する。 | Workflow が比較する。 | File set と全 Byte が一致した時だけ次へ進み、`make before-commit` 失敗や差分を `|| true` で無視しない。 |
| `WF-07` | 同じ Version の Draft / tag / Release が既にある。 | Workflow を再実行する。 | 自動上書き、Asset 差替え、公開化を行わず停止し、Operator の確認を要求する。 |
| `WF-08` | 全 Repository Gate が Green で物理 Gate が `Not run` である。 | Release command を評価する。 | Draft 作成だけを許可し、non-draft publish path が Workflow に存在しない。 |
| `WF-09` | Error が発生する。 | Job log と summary を読む。 | Token、absolute private path、Package metadata 全文、禁止 File 内容を出力せず、固定 Error code と対象区分だけを示す。 |

## Documentation contract

Document test は Repository の実 Markdown を読み、相対 Link と Fragment を実 File / Heading に解決する。

| ID | Contract |
| --- | --- |
| `DOC-01` | README 冒頭が「デジタル名刺ではない」「Pet は会話の糸を見つけ、人間へ場を返す」を説明する。 |
| `DOC-02` | Bun setup、Web、Expo Go、iOS / Android Native Development Build を別 Section にし、Native capability を Web / Expo Go へ誤表示しない。 |
| `DOC-03` | Architecture Diagram が Presentation / Application から Domain への一方向と、Storage、Rules / Local LLM、QR、Nearby Transport の Port / Adapter 境界を示す。 |
| `DOC-04` | `CONCEPT.md`、Product Contract、Threat Model、Data Inventory、Protocol Spec、ADR index、Facilitator Kit への相対 Link と Fragment が実在する。 |
| `DOC-05` | 機能表の状態は `Implemented` / `Experimental` / `Planned` だけを使い、対象 Git ref、環境、検証月、Evidence Link を持つ。Draft branch の機能を `main` の `Implemented` にしない。 |
| `DOC-06` | Device / OS / Model / Transport Matrix は空欄を許さず、`Verified` / `Not run` / `Blocked`、検証月、Evidence Link または Block 理由を持つ。色だけで状態を伝えない。 |
| `DOC-07` | Release Checklist が Security、Privacy、Accessibility、Offline E2E、バックアップ Round-trip、Full Delete を同じ 3 状態で示し、Repository Evidence と Physical Evidence を別列にする。 |
| `DOC-08` | Contributor Guide、Issue Template、PR Template が存在し、Account、Cloud LLM、Telemetry、Ranking、長期 ID を追加しない Good First Issue 候補を 3 件以上示す。 |
| `DOC-09` | Version、Changelog、Known Limitations、Rollback、Source-only、Apple 無料検証範囲、Public iOS は TestFlight / App Store 等の有料 Gate が必要になる境界を記載する。 |
| `DOC-10` | `package.json`、Release Manifest、Changelog、Release Notes の Version と Git ref が一致し、存在しない Artifact、未検証 Device、未 merge の機能を主張しない。 |

## Release gates

### Gate A: Repository Candidate

次をすべて満たした場合だけ Draft Candidate の生成を許可する。

- `scripts/source-release.test.ts` の正常・異常・境界・再現性 Test が Green である。
- Source Release 本体、専用 Writer、生成 / 検証 CLI の import 可能な全境界が Lines / Functions 100% である。
- Source Tree exclusion、SPDX、Notice、Manifest、checksum の実 File 検証が Green である。
- Workflow security と Documentation contract が Green である。
- `bun scripts/architecture-harness.ts --staged --fail-on=error` と `make before-commit` が Green である。
- 2 回生成した全 Candidate File の byte が一致する。
- Release Checklist と Matrix が未検証項目を `Not run` / `Blocked` として保持する。

### Gate B: Public OSS Alpha

Gate A に加え、Maintainer が対象 Commit、Version、checksum、SBOM、License、Known Limitations、Rollback、
依存 Issue の Evidence URL を確認する。必須 Physical Gate に `Not run` / `Blocked` が 1 件でも残る場合は
Public Release を許可しない。Workflow は Gate B を自動判定または自動公開しない。

## Physical and human gates

| Gate | Required evidence | Current state |
| --- | --- | --- |
| iOS / Android Native Build | 対象 Commit、OS、Device、署名境界、起動と終了の実機 Evidence | `Not run` |
| Local LLM / GGUF | Issue 17 / 18 の Offline 推論、memory、cancel、load / unload / delete Evidence | `Not run` |
| Nearby Transport | Issue 20 / 22 の iOS / Android 相互接続、Wi-Fi / Hotspot、Packet Capture Evidence | `Not run` |
| Group Lounge | Issue 24 の混在 3 台以上、2〜6 名 Scenario、30 分 Soak、Host Loss Evidence | `Not run` |
| Real Camera QR | 実 Camera permission、fresh Invite、rotation、旧 QR 拒否 Evidence | `Not run` |
| Physical Offline E2E | Internet 遮断下で Passport から Bridge / `no-signal`、Exit までの Evidence | `Not run` |
| Accessibility | 実機 VoiceOver / TalkBack の読上げ順と主要 Flow 完走 Evidence | `Not run` |
| Full Delete physical inspection | iOS / Android 再起動、OS Log、Storage、Model、Lounge Data の検査 Evidence | `Not run` |
| Facilitator / Pilot | 未経験者 Dry Run、Core Pilot、地域 Pilot の匿名 Evidence | `Not run` |

Web Export、Domain Test、Snapshot、static accessibility test、green coverage は上表の代替証跡にしない。
バックアップ Round-trip や Full Delete の Repository Integration Test を `Verified` にできる場合も、物理端末列は
`Not run` のまま別に保持する。

## Fail-closed QA decisions required

実装または公開前に、次を文書契約として確定する。

1. strict SemVer が pre-release と build metadata のどこまでを許可し、Git tag とどう対応するか。
2. Manifest と `checksums.txt` の対象 File 集合、および自己参照を作らない canonical order。
3. Participant Data の機械的な Path allowlist / forbidden corpus と、人間による Tree review の境界。
4. SPDX が Lockfile の全 Package を含み、Notice が direct dependency だけを含む責務差。
5. Public Release に必要な物理 Gate の固定一覧と、Issue / Evidence URL の更新規則。
6. Workflow の Draft 作成に使う保護 Environment、最小 write permission、既存 Draft 衝突時の停止手順。

上記が曖昧な間は、Test を緩めず、デフォルト値でも推測せず、Candidate または Public Release を停止する。

# Source Release Runbook

## 目的

固定 Commit と frozen dependency install から、Public 公開を伴わない Source-only Draft Candidate を作ります。

## 前提

- Git と `package.json#packageManager` が固定する Bun 1.3.11 を使う。`engines.bun` の互換範囲を
  Release toolchain の Version として使わない。
- 作業 Tree ではなく、Release Operator が固定した tag / 40 桁 Commit を checkout する。
- `RELEASE_OUTPUT` はまだ存在しない Path とする。symlink、File、空を含む既存 Directory、既存 Candidate は使わない。
- Model Weight、秘密値、Certificate、Provisioning、Participant Data を取得・複製しない。

## 生成

```bash
git checkout --detach <candidate-commit>
make install_ci
make before-commit
RELEASE_VERSION=0.1.0-alpha.1 RELEASE_REF=HEAD RELEASE_OUTPUT=release-output make release_candidate
```

期待 File は次の 6 件です。

```text
LICENSE
THIRD_PARTY_NOTICES.md
checksums.txt
release-manifest.json
tenkacloud-passport-0.1.0-alpha.1.spdx.json
tenkacloud-passport-0.1.0-alpha.1.tar.gz
```

## 独立検証

```bash
cd release-output
shasum -a 256 -c checksums.txt
tar -tzf tenkacloud-passport-0.1.0-alpha.1.tar.gz
```

Archive entry は `tenkacloud-passport-0.1.0-alpha.1/` prefix の追跡 File だけです。`node_modules`、`dist`、
`coverage`、`.expo`、`ios`、`android`、Model Weight、Key / Certificate / Provisioning を含めません。
固定 Commit の追跡 Path は `scripts/source-release-inventory.json` と完全一致しなければなりません。
許可済み root 配下の `.gitkeep` / `.keep` basename は空 Directory の追跡 placeholder として扱い、それ以外の未登録
extensionless File は拒否します。
Binary Asset は同じ inventory の SHA-256 と一致し、未登録 Binary、既知 Secret byte、File / Tree Size
上限超過を拒否します。

`release-manifest.json` は `releaseStatus: draft-candidate` を持つ strict schema です。未知 Field、固定された
4 Payload の集合、Version、Commit、タイムスタンプ、Size、SHA-256 の不整合があれば生成を停止します。

SPDX の `packages` は `bun.lock` の全 Package Record を別々に保持し、直接依存だけは固定 Commit の
`scripts/direct-dependency-licenses.json` に Review 済みの License 宣言を付けます。この Manifest の Package、
Version、top-level Lock key が `package.json` と `bun.lock` に一致しない場合は拒否します。推測できない
transitive License は `NOASSERTION` のままです。

再現性は別の未作成 Path へ同じ Command を実行し、File 名一覧と全 byte を比較します。同じ Directory の再利用や
1 回目の Copy は証拠にしません。

生成時は Output Parent と sibling staging Directory の descriptor を保持し、staging descriptor 配下へだけ書きます。
strict 検証後、保持済み Parent descriptor と basename に対して macOS は `renameatx_np(RENAME_EXCL)`、Linux は
`renameat2(RENAME_NOREPLACE)` を実行し、同じ Parent descriptor から開いた Output の inode まで検証します。
requested Parent / Output Path も公開後に同一性を再照合し、差し替えを検出した場合は descriptor-relative に staging 名へ
戻して成功を返しません。独立 verifier は symlink ancestor を拒否し、Candidate directory descriptor から各 File を
開いて検証するため、偽 Candidate への Path redirect を検証結果に使いません。各 File の検証済み device / inode / size /
ctimeNs / mtimeNs と開始時の Directory metadata を記録し、完了直前に identity-bound exact entry set と全 basename の
descriptor-relative snapshot を再照合します。検証中の extra entry 追加、先に hash 済みの File の rename 置換、同一 inode
への in-place 書換えも成功扱いしません。生成経路は atomic publish 後にも retained staging handle / expected inode を直接使う
strict 検証を繰り返し、その前後で Output basename が同じ handle を指すことを確認してから成功を返します。
未対応 OS / Filesystem は通常 rename へ fallback せず停止します。失敗 cleanup は個別 File を削除せず、staging
Directory 全体を保持済み Parent descriptor 内の一意な `.tenkacloud-passport-failed-*` 名へ no-replace rename し、
記録済み inode を再確認します。隔離 Directory は cleanup 未完了の証拠として残りますが requested Output にはならず、
他 Process の entry を誤削除しません。同じ requested Output は新しい staging で再実行できます。
staging identity の確立前に競合を検出した場合は、同名の別 Process entry を消さないため Path 指定の削除を行いません。
独立検証は strict validator で exact 6 File、checksum の 5 対象、Manifest の 4 Payload と実 byte を照合し、余分な File も
拒否します。開始時と完了直前の二度の exact entry set と、検証済み File snapshot の最終 basename binding が一致しなければ
失敗します。生成時は publication 後の Candidate にも retained handle へ束縛した同じ検証を行い、requested Path 上の
自己整合した別 Candidate を結果へ混同しません。
Archive と checksum 対象は Candidate directory descriptor から 64 KiB chunk で streaming hash し、Archive 全体を
Buffer 化しません。JSON / checksum 文書だけを個別の小さい上限内で読みます。

## 失敗と Recovery

| 失敗 | 状態 | Recovery |
| --- | --- | --- |
| Version / ref 不正 | `Blocked` | tag、Commit、`package.json` Version を再確認する。 |
| Lock / Review 済み License Manifest 不一致 | `Blocked` | `package.json`、top-level Lock key、Version、License を Review し、別 PR で Manifest を更新する。 |
| Inventory / Binary / Secret 不一致 | `Blocked` | Candidate を破棄し、追跡 Tree から対象 Data を除く。正当な Source / Asset 追加だけを別 PR で Review して inventory を更新する。 |
| Output 衝突 / symlink | `Blocked` | 上書きせず、別の未作成 Path を指定する。 |
| 途中失敗 | `Blocked` | `.tenkacloud-passport-failed-*` を配布せず保持する。内容と所有者を確認後に手動で片付け、同じ requested Output を再実行する。 |
| checksum / byte 不一致 | `Blocked` | Public 昇格を停止し、Commit、Lock、生成環境、Workflow を再調査する。 |
| 既存 Draft Release | `Blocked` | 自動更新せず、Maintainer が既存 Draft と添付を確認する。 |

## Draft Workflow

Release Workflow は default branch から Maintainer が `workflow_dispatch` し、Version、既存 Tag、40 桁
Candidate Commit を入力します。read-only Job は Tag と Commit の一致、frozen install、全 Gate、独立 2 Path の
byte、copy 後の exact File 集合と checksum、Release Notes を含む Bundle checksum を検証して Bundle を渡します。
`contents: write` を持つ Job は Repository を checkout せず、`oss-alpha-draft` Environment の承認後にだけ開始します。
最初に `OSS_ALPHA_TAG_RULESET_ID` が指す active Tag Ruleset の更新 / 削除禁止、空の exclude、bypass なしと、
Environment の Required Reviewer / protected branch 制約を GitHub API で確認します。Ruleset API が write access の
ない呼出元へ `bypass_actors` を省略し、通常の `GITHUB_TOKEN` は Ruleset の `Administration: write` を持てません。
そのため、保護 Environment の Secret `OSS_ALPHA_RULESET_AUDIT_TOKEN` に、単一 Repository だけを対象にした
`Administration: write` Token を設定します。この Token は checkout 前後の Repository code へ渡さず、Ruleset の
GET 1 回だけに使い、空 Secret、通常 Token への fallback、Property 欠落、型不一致を fail closed にします。その後、
通常の Job Token で Download 後の exact File 集合と checksum、Tag / SHA を再検証して、同名 Release がない場合だけ
GitHub Draft Release を作ります。監査 Token は所有者、期限、失効手順を Gate A 証拠に記録し、用途終了後に失効します。

`oss-alpha-draft` Environment の保護規則は Repository 外の設定です。Required Reviewer が設定されている
証拠、Tag Ruleset ID、監査 Token の scope / expiry / revoke owner を Gate A に記録するまで Workflow を実行しません。
publish 前に API で再確認するため、未作成 Environment を暗黙作成して通過できません。現在の設定確認は
`Not run` です。Public Publish は自動化せず、
Gate B の物理証拠を別 Reviewer が承認するまで Draft を維持します。

# ADR-0024: OSS Alpha は再現可能な Source-only Candidate から開始する

- Status: Accepted
- Date: 2026-07-18
- Deciders: TenkaCloud Passport Maintainers
- Technical Story: Issue 29

## Context

OSS Alpha は外部 Contributor が再現できる必要があるが、Local LLM、Nearby Transport、Native 配布には未完了の
実機 Gate がある。GitHub の自動 Source Archive だけでは SBOM、License Notice、禁止 Artifact、検証状態を
Release 単位で固定できない。

## Decision

最初の OSS Alpha Candidate は Source-only とする。Repository-native Bun CLI が、検証済み Git ref から次を
生成する。

- deterministic Source Archive
- SPDX 2.3 SBOM
- Project License と直接依存 License Notice
- Release Manifest と全添付 File の SHA-256 record

Release Tree は Model Weight、秘密鍵、Certificate、Provisioning Profile、Participant Data、生成 Native Project、
Build Output を拒否する。固定 Commit の Review 済み Path inventory と Binary Asset hash、全 Blob の既知
Secret scan、Size 上限を同時に使い、名前や拡張子だけで除外済みと判定しない。

Workflow は default branch の手動実行だけを許し、既存 Tag、40 桁 Candidate Commit、Version の一致を確認する。
read-only Job が Candidate を 2 回生成し、copy 後まで byte / checksum を検査する。Repository を checkout しない
write Job は Download 後に checksum を再検証し、Draft Release までに限定する。Public Release は Device Matrix
と Release Checklist の必須物理 Gate を人間が確認した後だけ行う。

成果物は Output Parent と sibling staging Directory を Directory descriptor で固定し、staging descriptor 配下へ
streaming / exclusive write する。全 File と checksum を strict 検証した後、保持済み Parent descriptor と安全な
basename だけを macOS `renameatx_np(RENAME_EXCL)` / Linux `renameat2(RENAME_NOREPLACE)` へ渡し、検証済み staging
inode を Output 名へ原子的に確定する。公開後の inode 検証も同じ Parent descriptor から開いた descriptor を使い、
検査後に Parent Path を symlink へ差し替えても別 Directory へ公開しない。公開後は requested Parent Path と Output
Path が保持済み descriptor と同一であることも再照合し、不一致なら descriptor-relative に staging 名へ戻して成功を
返さない。独立 verifier も symlink ancestor を拒否し、候補 File を Candidate directory descriptor から開いて読む。
検証開始時の Directory metadata と、各 basename から開いた検証済み File の device / inode / size / ctimeNs / mtimeNs を
記録し、完了直前に identity-bound な exact entry set を再列挙して全 basename を同じ File snapshot へ descriptor-relative
に再束縛する。Directory metadata の変化も拒否し、検証中の追加 File、hash 済み File の rename 置換、同一 inode への
in-place 書換えを成功扱いしない。生成経路は atomic publish 後にも retained staging handle と期待 inode に束縛した同じ
strict 検証を実行し、その前後で Output basename が同じ handle を指すことを照合する。requested Path に自己整合した別
Candidate を置いても成功扱いせず、成功を返す前の公開境界まで snapshot と provenance を再確認する。
未対応 OS / Filesystem は fail closed とする。失敗時は File を名前で削除せず、staging Directory 全体を保持済み
Parent descriptor 内の一意な `.tenkacloud-passport-failed-*` 名へ no-replace rename し、記録 inode を再確認する。
隔離 Directory は cleanup 未完了の証拠として残し、requested Output と区別する。他 Process の entry を削除しないことを
自動削除より優先し、同じ requested Output は新しい staging で再実行できる。transaction 確立前に staging identity を
取得できなかった場合も、その basename を Path から削除せず fail closed とする。
Workflow は Candidate の `main` ancestry、Required Reviewer 付き
Environment、更新 / 削除禁止 Tag Ruleset、publish 直前の Tag / SHA 再照合を fail-closed に要求する。
Tag Ruleset の bypass actor は、保護 Environment の Secret に置く単一 Repository 専用の
`Administration: write` 監査 Token を checkout-free publish Job の GET にだけ使って確認する。通常の
`GITHUB_TOKEN` はこの権限を持てないため代用せず、Secret 欠落または API 応答に `bypass_actors` が存在しない
場合も停止する。

## Consequences

### Positive

- Green CI と実機互換性を混同せず、Source の再現性だけを先に証明できる。
- Release に含めない情報を review 可能な機械契約にできる。
- 外部 SBOM Action を追加せず、既存の Bun / Git 信頼境界に収められる。

### Negative

- Native / Web Binary は初回 Candidate に含まれず、物理 Gate 後に別契約が必要になる。
- SPDX Generator と禁止 Path 一覧を Repository 側で保守する必要がある。
- 直接依存を変更する Pull Request は、固定 Commit から読む Review 済み
  `scripts/direct-dependency-licenses.json` も更新し、top-level Lock key と Version を一致させる必要がある。
- File の追加、削除、Binary Asset の変更では `scripts/source-release-inventory.json` も Review する必要がある。

## Alternatives Considered

1. GitHub 自動 Archive と手書き Notes: 再現性、SBOM、除外規則を機械検査できないため不採用。
2. 外部 Release / SBOM Action: 新しい Supply Chain と設定責務が増えるため、初回 Source-only Scope では不採用。

## Supersedes

なし。

# OSS Alpha Release Checklist

状態は `Verified`、`Not run`、`Blocked` のいずれかだけを使います。Repository Evidence と Physical Evidence を
別々に記録し、必須行に `Not run` / `Blocked` が 1 件でもあれば Public OSS Alpha を公開しません。

## Gate A: Source-only Draft Candidate

| Gate | Repository status | Required evidence |
| --- | --- | --- |
| Fixed Version / Commit | `Not run` | strict SemVer、40 桁 Commit、tag、`package.json` の一致。 |
| Frozen install | `Not run` | `make install_ci` の exit 0 と変更なしの Lockfile。 |
| Quality gate | `Not run` | 同じ Commit の `make before-commit` と GitHub Actions URL。 |
| Reproducible candidate | `Not run` | 独立した未作成 Path 2 つから生成した全 File の byte 一致。 |
| Source tree exclusion | `Not run` | Archive inventory と forbidden-パス Test。 |
| SPDX / License | `Not run` | SPDX 2.3 parse、全 Lock package、Project License、直接依存 Notice。 |
| SHA-256 / Manifest | `Not run` | 全 Payload の checksum 成功。`checksums.txt` は自己参照しない。 |
| Security review | `Not run` | Candidate Commit の入力、Command、Workflow permission、秘密情報 Review。 |
| Workflow control | `Not run` | default branch dispatch、`main` ancestry、Tag / Commit 再照合、concurrency、Required Reviewer 付き Environment、更新 / 削除禁止 Tag Ruleset、単一 Repository 専用 Ruleset 監査 Token の scope / expiry / revoke owner。 |
| Documentation contract | `Not run` | README / English、Matrix、Known Limitations、Rollback、relative Link。 |

Gate A が全部 `Verified` でも成果は Draft Candidate です。Public Release と Product セッションは許可しません。

## Gate B: Public OSS Alpha

| Gate | Repository evidence | Physical / human evidence | Current state |
| --- | --- | --- | --- |
| Privacy | Data Inventory、Retention、Artifact exclusion | OS Log / Storage に Passport、会話、鍵、安定 ID がない。 | `Not run` |
| Security | Threat Model、attack corpus、strict schema、review | 実 Transport packet capture と認証前 0-byte Passport。 | `Not run` |
| Accessibility | JA / EN、44 pt、200％ Text、Reduce Motion tests | iOS VoiceOver / Android TalkBack で主要 Flow 完走。 | `Not run` |
| Offline E2E | Rules integration tests | Airplane Mode で Passport → Bridge / no-signal → Exit。 | `Not run` |
| バックアップ round-trip | strict export / import / atomicity tests | 同一 Candidate で Export → Delete → Import。 | `Not run` |
| Full delete | tombstone / restart recovery tests | iOS / Android 再起動後の Storage / Model / Cache inspection。 | `Not run` |
| QR / Group | schema / coordinator / chaos tests | 実 Camera、2〜6 台、Host Loss、30 分、再接続。 | `Not run` |
| Facilitator readiness | versioned JA / EN Kit | 未経験者 Dry Run、説明 10 分以内、印刷、Recovery。 | `Not run` |

## Evidence Record

各 `Verified` は次の項目を埋めます。空欄を許可しません。

| Field | Rule |
| --- | --- |
| Scope | 検証した機能と、検証していない機能を分ける。 |
| Commit / Build | 40 桁 Commit、App Version、Build ID。 |
| Environment | Device family、OS Version、Provider / Model class、Transport。個体 ID は記録しない。 |
| Validation date | `YYYY-MM-DD`。 |
| Evidence | 再実行手順、内容非保持 Log、Review URL。 |
| Known limitation | なしの場合も `None observed in this scope` と記載する。 |
| Reviewer | 実施者と別の Reviewer。Participant 名は記録しない。 |

# TenkaCloud Passport Facilitator Kit

- Kit Version: 1.0。
- Status: Repository Contract Candidate / Physical Dry Run `Not run`。
- 対象: 初めて Local Champion と Facilitator を担当する人である。

この Kit は、2〜6 名の対面 Lounge を Product Contract と Privacy Contract の範囲で進行するための
版管理文書として提供する。Kit の存在は、Nearby Transport、Native Build、配布経路、特定端末での実動作を証明しない。
開催前に [1 Page Checklist](./one-page-checklist.ja.md) の対応状況を確認し、未検証経路は `Not run` とする。
Product セッションに必要な能力が 1 件でも `Not run` なら、Guide の Product 手順へ進まず
[日本語 Walkthrough](./walkthrough.ja.md)または[English Walkthrough](./walkthrough.en.md)だけを実施する。

## Kit Version 1.0 Support Matrix

| 能力 | 対象 | 状態 | 現在の Evidence / 判断 |
| --- | --- | --- | --- |
| Repository 文書と文書契約 Test | Kit Version 1.0 | `Not run` | Candidate commit の immutable Actions URL と別 Reviewer を記録していない。Tabletop Walkthrough だけに使える。 |
| Native Build / Distribution Channel | Build / Channel 未指定 | `Not run` | Evidence 無しである。対象 Build を参加者端末へ安全に用意できる証拠がなければ Product セッションを開催しない。 |
| iOS / Android の実 Camera QR | Build / OS / Device 未指定 | `Not run` | Evidence 無しである。実機 Evidence を取得するまで Event で依存しない。 |
| Nearby Transport Adapter | Build / Transport 未指定 | `Not run` | Evidence 無しである。Peer Protocol の定義を実通信の証拠にしない。 |
| Rules Provider | Build / Provider 未指定 | `Not run` | Source の存在は対象 Build での実行証跡ではない。Candidate Build の Offline 実行を別に検証する。 |
| Local Model | Build / Provider / Model 未指定 | `Not run` | Default branch に利用可能な Native Provider と検証済み Model はない。Weight を Kit へ含めない。 |
| 2〜6 台の Group Lounge | Build / OS / Device / Venue 未指定 | `Not run` | Evidence 無しである。複数実機 Evidence を取得するまで Product セッションを開催しない。 |
| Host Loss と端末別破棄完了表示 | Build / OS / Device 未指定 | `Not run` | Evidence 無しである。全残存端末の破棄完了表示を確認できるまで Host Loss 後に再開しない。 |
| A4 / Letter 1 Page と QR Poster の出力 | Printer / Browser / Assistive Technology 未指定 | `Not run` | Evidence 無しである。欠落、折返し、読上げ順、200％ Zoom を実出力で確認するまで印刷物へ依存しない。 |
| 未経験者による Kit Dry Run | Kit Version 1.0 | `Not run` | [Dry Run Record](./dry-run-record.md) が `Pass` になるまで Field Ready と表示しない。 |

この Matrix の `Not run` は失敗ではなく、実地証跡がない状態を示す。該当能力を外部 Issue で実証した場合は、
証跡 URL と Kit Version を同じ Pull Request で更新する。

`Verified` へ変更する Pull Request は、App Commit / Build ID、OS と Device 範囲、Transport / Provider、
Offline と会場条件、検証月、証跡 URL、Review 結果を同じ行または参照文書へ記載する。正確な時刻、会場名、
参加者、端末 ID、Passport、Bridge、会話内容は記載しない。Issue の Close だけを実機 Evidence にしない。

## Kit Version 1.0 Support Matrix English

This Kit is a versioned document set for a first-time Local Champion or Facilitator running an in-person Lounge
for two to six people within the Product and Privacy contracts. Its presence does not prove Nearby Transport,
a native build, distribution, or operation on a particular device. Check the matrix before an event and treat
every unverified path as `Not run`.
If any capability required for a Product Lounge is `Not run`, do not enter the Product steps in the Guide. Use only
the [English Walkthrough](./walkthrough.en.md) or [Japanese Walkthrough](./walkthrough.ja.md).

| Capability | Scope | Status | Current evidence and decision |
| --- | --- | --- | --- |
| Repository documents and document contract test | Kit Version 1.0 | `Not run` | No immutable Actions URL and separate reviewer are recorded for the candidate commit. Valid only for a tabletop walkthrough. |
| Native Build / Distribution Channel | Build / channel unspecified | `Not run` | No evidence. Do not run a Product Lounge without evidence that the intended build can be safely provided to participant devices. |
| Real iOS / Android camera QR | Build / OS / device unspecified | `Not run` | No evidence. Do not depend on this at an event until physical-device evidence exists. |
| Nearby Transport Adapter | Build / transport unspecified | `Not run` | No evidence. A peer protocol definition does not prove real transport. |
| Rules Provider | Build / provider unspecified | `Not run` | Source presence is not execution evidence for the candidate build. Verify its offline path separately. |
| Local Model | Build / provider / model unspecified | `Not run` | The default branch has no available native provider and verified model. Never include a model weight in this Kit. |
| Two-to-six-device Group Lounge | Build / OS / device / venue unspecified | `Not run` | No evidence. Do not run a Product Lounge until evidence from multiple real devices exists. |
| Host loss and per-device discard confirmation | Build / OS / device unspecified | `Not run` | No evidence. Do not restart after Host loss until every remaining device shows discard completion. |
| A4 / Letter one-page and QR Poster output | Printer / browser / assistive technology unspecified | `Not run` | No evidence. Do not depend on printed output until content loss, wrapping, reading order, and 200 percent zoom are verified. |
| Kit Dry Run by an inexperienced person | Kit Version 1.0 | `Not run` | Do not mark Field Ready until the [Dry Run Record](./dry-run-record.md) is `Pass`. |

`Not run` means that no field evidence exists; it does not mean failure. When an external issue proves a capability,
update its evidence URL and Kit Version in the same Pull Request.

A Pull Request changing a row to `Verified` must record the App Commit / Build ID, OS and device range,
transport / provider, offline and venue conditions, verification month, evidence URL, and review result in the row
or a linked document. Never record the exact time, venue name, participant, device ID, Passport, Bridge, or
conversation content. Closing an issue alone is not physical-device evidence.

## 現場で使う文書

| 文書 | 日本語 | English |
| --- | --- | --- |
| 安全な Document Walkthrough | [日本語 Walkthrough](./walkthrough.ja.md) | [English Walkthrough](./walkthrough.en.md) |
| Facilitator Guide | [日本語 Guide](./guide.ja.md) | [English Guide](./guide.en.md) |
| 1 Page Checklist | [日本語 Checklist](./one-page-checklist.ja.md) | [English Checklist](./one-page-checklist.en.md) |
| QR 掲示物 | [日本語 Poster](./qr-poster.ja.md) | [English Poster](./qr-poster.en.md) |
| Dry Run Record | [共通 Record](./dry-run-record.md) | [Shared Record](./dry-run-record.md) |

Research を実施する場合は、Kit の短い Product 説明だけで代替せず、既存の
[日本語 Research Consent Script](../research/consent-script.ja.md) または
[English Research Consent Script](../research/consent-script.en.md) と
[Pilot Observation Sheet](../research/observation-sheet.md) を使う。

## 変更方法

外部 Contributor は Fork または Branch から Pull Request を作り、JA / EN の対応文書を同時に更新できる。
変更理由、対象 Scenario、Dry Run の分類結果だけを Pull Request に記載し、氏名、連絡先、会場、正確な時刻、
Passport、Bridge、会話内容を Commit や Issue へ載せない。

変更後は次を実行する。

```bash
bun test scripts/facilitator-kit.test.ts
bun scripts/architecture-harness.ts --staged --fail-on=error
make before-commit
```

Product と Privacy の意味を変える場合は Kit だけを先に変更せず、対応する正本と ADR を先に更新する。

## 正本

- [Product Contract](../product/product-contract.md) である。
- [Privacy Data Inventory](../privacy/data-inventory.md) である。
- [Retention Policy](../privacy/retention-policy.md) である。
- [Pilot Protocol](../research/pilot-protocol.md) である。
- [運用設計](../design/facilitator-kit-and-local-champion.md) である。
- [ADR-0022](../adr/0022-decentralized-local-champion-operations.md) である。

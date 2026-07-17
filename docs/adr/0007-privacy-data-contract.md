# ADR-0007: Privacy データ契約と短命な Lounge 境界を固定する

- Status: Accepted
- Date: 2026-07-17
- Deciders: Susumu Tomita

## Context

TenkaCloud Passport はアカウントと中央サーバーを必要とせず、Owner が許可した少量の手掛かりを
使い捨ての Lounge で交換する。一方、「個人情報を扱わない」「Lounge は消える」という説明だけでは、
QR、近距離通信、端末内推論、GGUF、手動 JSON バックアップの保存先と削除条件を実装者が一意に
判断できない。安定識別子の混入、Lounge 履歴の再水和、バックアップへの暗黙昇格、外部サービスへの
送信を、schema、保存境界、期限、自動検査の契約として固定する必要がある。

## Decision

データを公開アプリ資産、端末内限定、公開投影、Lounge 限定、Owner 管理 Export の 5 区分へ
分ける。Local Private Profile は版管理済みカタログの非識別な手掛かりだけを端末内へ保持し、
Public Passport は Owner が QR 生成ごとに確認した最大 3 件だけを新しく投影する。QR と
Pet Message には安定 ID、端末 ID、広告 ID、位置情報、連絡先、URL、自由記述を含めない。
Issue 3 の不変条件にある Peer Message は同じ Pet Message を指し、実装の型名は本 ADR で固定しない。

Public Passport、Lounge セッション、Owner Answer、Pet Message、推論データ、Bridge、暗号材料は
メモリだけで扱う。Owner の退出、Host 終了、生成から 20 分満了のうち最も早い時点で削除し、
アプリと端末の再起動後に復元しない。Bridge の表示または `no-signal` の確定による
`retired` では追加の質問、推論、Pet Message を停止し、Owner が表示中の結果も退出、Host 終了、
20 分満了を越えて保持しない。

手動 JSON バックアップは strict allowlist により Local Private Profile、端末設定、モデル検証記録だけを
Export する。Lounge 由来データ、Public Passport、GGUF 本体、端末パス、識別子は含めない。
GitHub Token は要求、生成、保存、Export、送信の対象にしない。Analytics SDK と外部推論 API を持たず、
GGUF による推論を権限のない端末内 runtime に限定する。

QR、Pet Message、バックアップ、GGUF、モデル出力を信頼しない入力として検証する。Host は
参加 Pet ごとに 1 回限りの参加 capability を QR で発行し、参加許可前に使用済みへ遷移させる。
通信は使い捨て nonce、一時公開鍵、AEAD、message nonce、sequence、20 分以内の期限で盗聴、
改ざん、Replay に対処する。モデル出力は確認済みの手掛かりと strict schema に
照合し、検証できない場合は `no-signal` または Lounge 終了とする。

## Privacy invariants

次の ID を自動テスト可能な Privacy invariant の公開名として予約する。

| ID | 契約 | 将来の自動検出計画 |
| --- | --- | --- |
| `INVARIANT_PRIVACY_NO_IDENTIFIER_IN_EXCHANGE` | QR、Public Passport、Pet Message に安定 ID、端末 ID、広告 ID、位置情報、連絡先、URL、自由記述を含めない。 | QR と Pet Message の strict schema を読み取り、禁止 key と文字列型の自由記述 field がないことを repo check で検査する。serializer の snapshot test も必須にする。 |
| `INVARIANT_PRIVACY_LOUNGE_EPHEMERAL` | `L3` データを永続化せず、退出、Host 終了、20 分満了の最早条件と再起動で復元不能にする。 | 永続化 adapter の型依存を検査し、`L3` 型の import を error にする。fake clock による 3 終了条件、強制終了、再起動の BDD test を harness から実行する。 |
| `INVARIANT_PRIVACY_NO_LOUNGE_PROMOTION` | Owner Answer、Pet Message、推論データ、Bridge を Passport とバックアップへ暗黙に昇格させない。 | Public Passport とバックアップの strict schema を allowlist と照合し、Lounge 型への依存と未知 field の受理を error にする。 |
| `INVARIANT_PRIVACY_BACKUP_ALLOWLIST` | バックアップは Local Private Profile、端末設定、モデル検証記録だけを Export する。 | Export serializer の top-level key を固定し、Lounge fixture、端末パス、GGUF 本体を渡しても出力されない BDD test を実行する。 |
| `INVARIANT_PRIVACY_NO_GITHUB_TOKEN` | GitHub Token を要求、生成、保存、Export、送信しない。 | `packages/` と `src/` の UI、schema、storage key、環境変数、GitHub OAuth scope を高シグナルな denylist で検査する。 |
| `INVARIANT_PRIVACY_NO_TELEMETRY_OR_REMOTE_INFERENCE` | Analytics SDK と外部推論 API を持たない。 | dependency 名、import、初期化コードを denylist で検査し、推論 provider の network client 依存と外向き endpoint を repo check で error にする。 |
| `INVARIANT_PRIVACY_LOCAL_MODEL_INTEGRITY` | GGUF は形式、上限、digest allowlist を検証し、モデル出力を命令または事実として信頼しない。 | モデル loader に検証前の runtime 呼び出しがないことを依存検査し、不正形式、過大サイズ、digest 不一致、schema 外出力の BDD test を harness から実行する。 |

これらの ID、説明、検出対象を `docs/architecture/harness.md` へ追加し、
`scripts/architecture-harness.ts` の repo check と `scripts/architecture-harness.test.ts` を同時に実装する。
検出ロジックと `docs/architecture/harness.md` の変更は Issue 3 のスコープ外とし、後続 Issue で
文章正本、実装、fixture、正常、異常、境界のテストを 1 つの変更として追加する。実装前に禁止 key の
誤検出、動的 serializer の見落とし、dependency 名だけに依存する回避を評価し、高シグナルにできない
項目は error にせず review checklist へ分離する。

## Consequences

- Good: 永続データと Lounge 由来データの型、保存先、Export 経路が分離され、削除をテストできる。
- Good: Public Passport と QR は再生成される短命な投影になり、安定追跡 ID を必要としない。
- Good: Prompt Injection、Replay、モデル改ざん、バックアップ誤公開を失敗経路として実装できる。
- Bad: 自由記述と外部推論を使えないため、表現力とモデル選択肢が限定される。
- Bad: 端末時刻の大きなずれ、モデル検証失敗、認証失敗では Lounge を開始または継続できない。
- Tradeoff: 暗号化した Lounge 履歴を障害調査用に保存する案は、使い捨てと再起動後の非復元に
  反するため採用しない。必要な検出情報は内容を持たないメモリ内 Security Signal に限定する。

## References

- [Privacy データ台帳](../privacy/data-inventory.md)。
- [Privacy 保持ポリシー](../privacy/retention-policy.md)。
- [脅威モデル](../security/threat-model.md)。
- [プロダクト契約](../product/product-contract.md)。
- [用語集](../product/glossary.md)。
- Issue 3。

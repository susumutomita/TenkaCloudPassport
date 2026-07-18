# ADR-0020: 端末内診断と中断回復可能な全削除 transaction

- **Status**: Accepted
- **Date**: 2026-07-18
- **Deciders**: Susumu Tomita (@susumutomita)

## Context

Issue 25 は Telemetry を追加せずに現在状態を説明し、Owner が Profile、Model、Lounge、全 Local Data を
区別して削除できることを要求する。複数の保存先を順番に削除するだけでは、途中で Storage が失敗または
Process が終了すると一部だけが次回起動で復元される。削除前 Snapshot を rollback 用に永続化する案は、
削除対象の複製を新たに作り、Owner の削除意思に反して保持量を増やす。

## Decision

診断 Report は version、Provider / Transport / Permission 状態、件数・Byte 数、allowlist 済み Model
metadata、固定 Error Code / Phase だけを持つ strict schema とする。正確な時刻、内容、識別子、Path、
Network metadata を schema で表現できなくし、Preview 後の明示操作だけが既存 Share Port を呼ぶ。

全削除は write-ahead tombstone を先に永続化してから、各 Resource を冪等に削除する。tombstone を書いた
時点を論理的 commit とし、その後は Profile や Model を復元しない。途中失敗時は tombstone を残し、
現在 Process と次回起動の両方が同じ削除を再開する。全 Resource の不在を確認した後だけ tombstone を
消す。Model Context 使用中など事前に判定できる失敗は tombstone 前に拒否し、既存 Data を変更しない。
Profile write と Model Context は同じ Process 内の共有 lease に参加し、inspect から tombstone clear までを
排他区間にする。marker 書込 API の失敗後は marker を再読込し、副作用後 throw を未 commit と扱わない。
commit 後の中断では lease を保持して新規 write / Context を拒否し、回復完了後だけ解除する。
write と再読込が両方失敗して marker を確認できない場合は commit 済みと断定せず、現 Process の Data を
削除しない。後で marker が読めれば Profile Storage が write を拒否し、次回起動の回復が削除を再開する。
fresh process の Model lease registry は recovery-locked で開始し、marker 確認前の Context 取得を許さない。

個別の Passport Reset と Model Remove は各 Resource の Port を直接使い、全削除 transaction と混同
しない。Lounge はメモリだけの既存破棄経路を使う。現在まだ永続化していない Settings / Backup Cache /
Model は件数 0 と表示し、存在するように偽らない。後続実装は同じ Resource Port へ実保存先を接続する。

## Consequences

- **Good**: 中断後も削除意思が先に確定し、古い Profile や Model が再起動で復元されない。
- **Good**: 遅延 Profile write と遅延 Model Context が削除検証後へ割り込まず、成功後の再出現を防ぐ。
- **Good**: Diagnostic JSON の型が禁止情報を表現できず、Network 送信を必要としない。
- **Bad**: tombstone 後の物理削除が繰り返し失敗すると、Recovery が完了するまで保存機能を閉じる。
- **Tradeoff**: commit 後中断は内容を破棄した Diagnostic safe-state に留まり、同一 Process の明示再試行か
  次回起動の回復が成功するまで通常画面へ戻さない。
- **Tradeoff**: OS filesystem 全体の ACID transaction は要求せず、論理 commit と冪等回復で同じ安全性を
  実現する。実保存先が増えたときも rollback 用の秘密複製は作らない。

## References

- 関連コード: `src/app/local-data-control.ts`
- 関連設計: [端末内診断と全削除](../design/local-diagnostics-and-erasure.md)
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/25
- 関連 ADR: [ADR-0007](./0007-privacy-data-contract.md)

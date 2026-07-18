# ADR-0018: Host-authoritative Group Coordinator を Domain に分離する

- Status: Accepted
- Date: 2026-07-18

## Context

Issue 24 は 2〜6 名の Membership、全員 Ready、Late Join、切断猶予、Round の有限時間収束を
要求する。既存 `lounge-room.ts` は Rules Provider に合わせた 2 者間 Flow であり、Peer Protocol
receiver は認証、Schema、重複、順序、Resource Limit の境界です。どちらかへ Group Rule を
追加すると、既存 Flow または Transport 境界と Product State が結合する。

## Decision

Host だけが Membership revision と Round を確定する、Transport 非依存の純粋な Group
Coordinator を Domain に追加する。Coordinator は認証済み Peer Event だけを入力とし、Peer receiver
の Message 履歴や Socket を保持しない。Participant ID を Identity とし、Owner Alias は Membership
の一意性に使用しない。

全接続 Participant が同じ Round に Ready になった時点で参加者を Snapshot する。進行中の Join は
次 Round 待ちとする。一時切断は bounded な Grace Period で再接続を待ち、期限後は Guest を除外し、
Host の場合は Lounge を終了する。Local Agent の完了が Deadline を越えた場合は、同じ Round ID に
対して Rules の Fair Bridge 選定を 1 回だけ確定する。古い Round の完了 Event は State を変えない。

Connection は Host が管理する世代番号を 0 から単調に増やし、現在世代と一致する Disconnect だけを
適用する。使用済み Round ID は Lounge 内の bounded な集合に保持し、再利用を拒否する。退出者を
含む確定済み Bridge は `no-signal` へ無効化する。Tombstone、Connection 世代、Round 数の上限で
状態を巻き戻さず、安全側に Lounge を終了する。

Peer Protocol の Wire Membership は引き続き 2〜6 名とする。Host 内部の
`cleanupLocalHostMembership()` に限り、Host 1 名の local Membership Snapshot を receiver へ適用し、
最後の Guest の Passport と Peer state を破棄する。
次の Guest へ送る Wire Snapshot は、その Guest を加えた 2 名以上とする。

終了 State は理由だけを持ち、Membership、Passport、Bridge、Queue、切断 Tombstone をすべて捨てる。

## Alternatives

1. `lounge-room.ts` を 6 名化する案は既存 UI を再利用しやすいが、2 者間の 1 回限り Flow と複数 Round
   の Group Rule を同じ State Machine に混在させるため採用しない。
2. Peer receiver に Membership と Round を統合する案は Wire の防御と Product Rule を結合し、
   Transport 差し替え時の再利用性を下げるため採用しない。
3. 各 Guest が Membership を合意する分散方式は Host Loss 後も継続できるが、分断時の Leader 選出と
   Merge が必要であり、v1 の「Host が消えたら終了」と矛盾するため採用しない。

## Consequences

- **Good**: Duplicate、遅延、順序逆転、Drop、Reconnect を純 TypeScript で決定的に再現できる。
- **Good**: 既存 2 者間 Flow と Peer Protocol の責務を変更せず、実 Transport Adapter から再利用できる。
- **Good**: Host が発行する Snapshot だけが正本なので、各端末は revision によって収束できる。
- **Good**: Connection 世代と使用済み Round ID により、再接続後の古い Event を no-op にできる。
- **Bad**: Host を失った Lounge は継続できず、全 Participant が新しい Lounge へ入り直す必要がある。
- **Bad**: 実機、実時間、Network Capture の証跡は Transport 導入まで取得できない。
- **Tradeoff**: Host Migration が Product 要件になった場合は、Leader 選出と分断 Merge を別 ADR で
  設計し、本判断を Supersede する。

## References

- 関連コード: `src/domain/group-lounge-session.ts`
- 関連設計: [Group Lounge Reliability](../design/group-lounge-reliability.md)
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/24
- 関連 ADR: [ADR-0016](./0016-peer-protocol-receiver.md)

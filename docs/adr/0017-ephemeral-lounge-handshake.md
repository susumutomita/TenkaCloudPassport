# ADR-0017: 一時 Secret と Transport Fingerprint を結合する Lounge Handshake

- **Status**: Accepted
- **Date**: 2026-07-18
- **Deciders**: Susumu Tomita (@susumutomita)

## Context

QR は対面の Authorization Root だが、Screenshot の再配布、同時二重 Join、同一 LAN 上の
差し替えを QR の秘匿性だけでは防げない。Transport の具体方式は Issue 20 の実機比較前であり、
アプリ独自の暗号化を先に固定すると責務が重複する。一方、認証後だけ Public Passport を送る境界、
20 分以内の期限、Lounge-scoped ID、Replay 防止は Transport 選定前でも固定する必要がある。

## Decision

QR Invite v2 は 256 bit の 1 回限り Join Secret と SHA-256 Transport Fingerprint を持つ。Guest は
`@noble/hashes` 2.2.0 の HMAC-SHA-256 で、Lounge、Participant、期限、Capability、Discovery Hint、
Fingerprint の正規 Transcript を署名する。Host は Transport Adapter が別経路で検証した
Fingerprint を照合し、同じ監査済み実装の Proof 検証後だけ認証済み Transport Identity を返す。
Host は検証開始を同期的に予約し、同時二重利用を拒否する。

Host の壁時計と単調増加時計を最終期限判定の正本とし、どちらかが期限へ達した時点を拒否する。
Secret、Key、使用済み状態はメモリだけに置き、終了または Rotation で参照を破棄し、再起動後に
復元しない。Channel の暗号化、Certificate の作成、Fingerprint の取得は採用 Transport の標準機能に
委ねる。

## Consequences

- **Good**: QR 所持と実際の Secure Channel を結合し、改ざん、Replay、同時利用を Passport 共有前に
  拒否できる。
- **Bad**: QR は 1 Guest ごとに Rotation が必要であり、JavaScript Runtime は Key の物理ゼロ化を
  保証できない。Expo の Native Runtime に Web Crypto HMAC がないため、固定 Version の純 JavaScript
  暗号依存を 1 件追加する。
- **Tradeoff**: raw Secret 比較と独自暗号化 Channel は採用しない。Issue 20 が Fingerprint を提供できない
  Transport を選ぶ場合、平文 fallback を追加せず本 ADR を Supersede して再設計する。

## References

- 関連設計: [一時 Lounge Handshake](../design/secure-lounge-handshake.md)
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/21
- Transport 選定: https://github.com/susumutomita/TenkaCloudPassport/issues/20
- Transport 実装: https://github.com/susumutomita/TenkaCloudPassport/issues/22
- Privacy 判断: [ADR-0007](./0007-privacy-data-contract.md)

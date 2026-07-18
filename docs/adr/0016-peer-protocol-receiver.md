# ADR-0016: Strict Peer Envelope と認証済み Receiver を分離する

- Status: Accepted
- Date: 2026-07-18

## Context

Peer Protocol 1.1 は Public Passport、Owner Answer、終了結果の strict schema を持つが、Issue 23 が
要求する Message ID、時刻、Capability Negotiation、順序、Rate Limit、Late Join Snapshot を持たない。
また、Transport Authentication を Wire JSON の自己申告 field にすると、悪意ある Peer が成功を
偽装できる。

## Decision

Peer Protocol を 1.2 に更新し、10 種類の閉じた Payload、Message ID、sequence、送信 / 満了時刻を
strict schema で検証する。Wire parser と stateful receiver を分け、Transport Adapter 由来の認証結果を
別引数で受け取る。認証結果と Envelope の Lounge / Participant が一致した場合だけ
`AuthenticatedPeerEnvelope` を Application へ返す。

receiver は Peer ごとの去重、順序、期限、Capability、rolling rate / byte、総 message 数と、
Lounge 全体の総 message 数をメモリ内で管理する。最新 Membership と Public Passport だけを保持し、Late Join と
sequence gap の回復に使う。Membership revision または `leave` で除外された Participant の active
state と Public Passport は即時破棄する。Owner Answer、Signal、Bridge Proposal、Prompt、Model
Output の履歴は保持しない。
Local Host は送信する Membership を `updateLocalMembership()` で同じ receiver state へ反映し、
self-echo に依存せず Late Join Snapshot を生成する。

## Alternatives

1. Transport の順序保証だけに依存する案は Adapter 差と再接続で同じ結果にならないため採用しない。
2. Transport Authentication を Wire field とする案は送信者が認証結果を偽装できるため採用しない。
3. Protocol と Nearby Transport Adapter を同時実装する案は Issue 20 の ADR と実機選定を先取りし、
   純 TypeScript の互換性検証を特定 Library に結合するため採用しない。

## Consequences

- **Good**: Rules-only と Local LLM の能力差を Wire 上で安全に交渉できる。
- **Good**: Duplicate、out-of-order、gap、expired、oversize、flood を Transport 非依存で再現できる。
- **Good**: Late Joiner に現在 Snapshot だけを渡し、過去 Transcript と Answer を再送しない。
- **Bad**: 1.1 との Wire 互換性はなく、双方を 1.2 へ更新する必要がある。
- **Bad**: Receiver state は Lounge 終了時に必ず `dispose()` する運用責任を持つ。
- **Neutral**: 実 Transport の暗号、Connection Event、Reconnect、実機 Matrix は Issue 20・22・24 に残る。

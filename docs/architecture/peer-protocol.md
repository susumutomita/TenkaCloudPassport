# Peer Protocol Specification 1.2

本書は TenkaCloud Passport の認証済み Nearby Transport 上で交換する Peer Envelope の正本です。
設計理由は [Peer Protocol 1.2 の設計](../design/peer-protocol-v1-2.md)、保持と破棄は
[Privacy データ台帳](../privacy/data-inventory.md) と
[保持ポリシー](../privacy/retention-policy.md) を参照する。

## Wire Envelope

| field | 型と制約 |
| --- | --- |
| `protocolVersion` | `{ "major": 1, "minor": 2 }` の完全一致です。 |
| `loungeId` | `lng_` + 128 bit の小文字 hexadecimal です。 |
| `senderParticipantId` | `ptc_` + 128 bit の小文字 hexadecimal です。 |
| `messageId` | `mid_` + 128 bit の小文字 hexadecimal です。 |
| `sequence` | Peer ごとに `0` から始まる単調増加整数です。 |
| `sentAtEpochMs` | 非負の safe integer です。 |
| `expiresAtEpochMs` | `sentAtEpochMs` より後、60 秒以内、Lounge 期限以内の safe integer です。 |
| `payload` | 以下の kind の strict discriminated union です。 |

Transport Authentication は Wire field ではない。Transport Adapter が検証した Lounge ID と
Participant ID を receiver へ別引数で渡し、Wire の値と一致した場合だけ認証済み Envelope とする。

## Payload

| kind | field | 保持と意味 |
| --- | --- | --- |
| `hello` | `role: host | guest` | sequence 0 の Handshake 開始です。保持しない。 |
| `capability` | `supported[]`, `required[]` | sequence 1 の能力交渉です。Peer state だけに保持する。 |
| `ready` | `roundId` | `rnd_` + 128 bit 値です。履歴を保持しない。 |
| `public-passport` | `publicPassport` | strict Public Passport です。Participant ごとの最新値だけ保持する。 |
| `pet-signal` | `evidenceId`, `fieldReference`, `signalType` | 検証済み field 参照だけで、自由記述 Instruction を持たない。 |
| `bridge-proposal` | `participantIds[]`, `evidenceIds[]` | Claim は Lounge-scoped Evidence ID だけです。表示文や Score を持たない。 |
| `membership` | `revision`, `participantIds[]` | Host だけが送る完全 Snapshot です。revision は 0〜2,147,483,647 とし、空状態でも巻き戻さない。 |
| `leave` | `reason` | Owner、Network、Host End の閉じた理由です。 |
| `expire` | `reason: lounge-expired` | Host だけが送る終了通知です。各端末の TTL 強制を置き換えない。 |
| `error` | `code`, `phase` | 内容を持たない固定 code と phase だけです。 |

`pet-signal.fieldReference` は `{ kind: "clue", clueId }` または
`{ kind: "language", language }` だけです。Clue ID と Language は同梱カタログ値に限る。
`evidenceId` は `evi_` + 128 bit 値で、別 Lounge へ再利用しない。

## Wire Example

Rules-only 端末が能力を宣言する sequence 1 の例です。

```json
{
  "protocolVersion": { "major": 1, "minor": 2 },
  "loungeId": "lng_11111111111111111111111111111111",
  "senderParticipantId": "ptc_22222222222222222222222222222222",
  "messageId": "mid_33333333333333333333333333333333",
  "sequence": 1,
  "sentAtEpochMs": 1784332800000,
  "expiresAtEpochMs": 1784332860000,
  "payload": {
    "kind": "capability",
    "supported": ["rules-provider-v1"],
    "required": ["rules-provider-v1"]
  }
}
```

Bridge Proposal は表示文を運ばず、次のように Evidence ID だけを参照する。

```json
{
  "kind": "bridge-proposal",
  "participantIds": [
    "ptc_22222222222222222222222222222222",
    "ptc_44444444444444444444444444444444"
  ],
  "evidenceIds": ["evi_55555555555555555555555555555555"]
}
```

## Compatibility

- Major / Minor は完全一致で、1.1、未知 Major、未知 Minor を fail-closed で拒否する。
- Capability token の形式は拡張可能だが、Required Capability は双方の Supported の部分集合である。
- `rules-provider-v1` を双方の Required とするため、Rules-only と Local LLM が同じ Lounge に入れる。
- Unknown Optional Capability は利用しない。Unknown Required Capability は
  `UNSUPPORTED_REQUIRED_CAPABILITY` で該当 Peer を拒否する。

## Receive Algorithm

1. セッションが開いていることを確認する。
2. Transport 認証を確認する。未認証なら本文を parse しない。
3. code unit 下限で明らかな 4 KiB 超過を全体 UTF-8 encode 前に検出し、Lounge 総数へ計上する。
4. Peer ごとの総数と rolling 1 秒 rate / byte を計上し、4 KiB 以下の raw だけを深度検査と
   strict parse へ渡す。
5. Transport の Lounge / Participant と Wire を照合する。
6. TTL、未来許容差、Lounge 期限を検査する。
7. Message ID 重複、期限切れ、sequence 戻りを無視し、gap を受理結果へ明示する。
8. sequence 0 の `hello`、sequence 1 の `capability` を強制する。
9. Capability の双方の Required が相手の Supported に含まれることを確認する。
10. 受理 Message を返し、Membership / Public Passport の最新 Snapshot だけを更新する。Membership
    差分と `leave` では除外 Participant の active state と Public Passport を即時破棄する。
11. Local Host は送信する Membership を `updateLocalMembership()` で同じ Snapshot へ反映する。

## Size Budget

Envelope 全体は 4,096 UTF-8 byte 以下です。最大 6 名の Membership は約 300 byte、Capability は
約 500 byte、通常の Public Passport は 1 KiB 未満を目安とする。上限は目安ではなく parser が
JSON parse 前に強制する。1 Peer は rolling 1 秒 16 message / 8 KiB、Lounge 内 512 message までです。
Peer 上限は該当 Participant だけを拒否する。1 Lounge は認証済み入力 2,560 message までで、2,561 件目は
`MESSAGE_LIMIT_EXCEEDED` を返してセッションを閉じる。receiver は Local Participant を除く active
Remote Peer state を 5 名までに制限し、退出・除外で slot を解放する。未認証接続の state は作らない。

## Late Join

Late Joiner へ返すのは最新 Membership と Participant ごとの最新 Public Passport だけです。
過去の Ready、Signal、Bridge Proposal、Error、Owner Answer、Prompt、Model Output を再送しない。
sequence gap の回復も同じ Snapshot を使い、Transcript Replay は行わない。
Membership revision で除外された Participant と `leave` 済み Guest は Snapshot に含めない。
Local Host は送信する Membership を receiver へ明示反映し、Transport self-echo を前提にしない。
Peer 固有の Schema / rate / Capability 拒否状態は Host Membership の妥当性へ波及させない。`leave` または
Membership 差分で退出確定した一時 Participant ID だけは、同じ Lounge への再追加を拒否する。

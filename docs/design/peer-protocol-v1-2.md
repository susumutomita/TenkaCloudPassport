# Peer Protocol 1.2 の設計

Issue 23 の Peer Protocol は、Rules Provider と Local LLM の実装差、Transport の重複・遅延・欠落、
悪意ある Peer の入力があっても、認証済みの許可データだけを bounded に処理する境界です。Nearby
Transport の選定と実機 Adapter は Issue 20・22、複数端末の再接続と Chaos Test は Issue 24 の責務です。

## 目的と非目的

- Strict Versioned Schema で `hello`、`capability`、`ready`、`public-passport`、`pet-signal`、
  `bridge-proposal`、`membership`、`leave`、`expire`、`error` だけを交換する。
- Message ID、送信順、時刻、byte 数、rate、総 message 数を Lounge と Peer の範囲に閉じる。
- Rules-only 端末を共通の必須能力とし、Local LLM は任意能力として交渉する。
- Raw Prompt、Model Output、Chain of Thought、未同意 Answer、自由記述 Claim、長期 ID を Wire に載せない。
- Socket、WebRTC、mDNS、暗号 primitive、再接続、Host Migration は本 Issue では実装しない。

## 代替案

### Transport の順序保証だけを信用する案

実装量は少ない一方、再接続や Adapter 差で duplicate、out-of-order、期限切れが Domain へ漏れる。
Transport を差し替えても同じ挙動を保証できないため採用しない。

### 任意 JSON と自由記述 message kind を後方互換として受理する案

新機能は追加しやすいが、Raw Prompt、連絡先、任意 URL、巨大配列を Wire 型で表現できる。未知 field を
無視する方式は既存の strict schema 契約にも反するため採用しない。

### Strict Wire Schema と stateful receiver を分離する案

型と状態遷移の実装量は増えるが、parser は不正な値を再構築前に拒否する。receiver は認証、去重、
順序、期限、Capability、rate を一か所で強制できる。この案を採用する。

## 責務とデータフロー

1. Transport Adapter は暗号化済み Channel から raw UTF-8 JSON と、Wire 本文から独立した認証結果を渡す。
2. receiver は未認証接続を JSON parse 前に拒否し、認証済み入力の code unit 下限を先に検査する。
3. receiver は Lounge 全体の総数と Peer ごとの総数 / rolling byte / rate を数え、4 KiB 以下と
   確定した raw だけを `parsePeerEnvelopeJson` へ渡す。parser は深度 8 と Protocol 1.2 の strict
   object を検査する。
4. receiver は認証結果の Lounge / Participant と Envelope を照合し、時刻、Message ID、sequence、
   Handshake、Capability を検査する。
5. 受理結果だけを Application へ返す。Current Membership と最新 Public Passport 以外の本文は保持しない。
6. `leave` と Membership 差分で該当 active state / Public Passport を破棄し、Host の `expire` と
   `dispose()` で全 state を破棄する。
7. Local Host は送信する Membership を `updateLocalMembership()` でも反映し、Transport の
   self-echo がなくても Late Join Snapshot の正本を維持する。

Transport 認証結果を Wire field に含めない。Peer が `authenticated: true` と自己申告できる schema は、
認証の根拠にならないためです。receiver が返す `AuthenticatedPeerEnvelope` にだけ、Adapter 由来の
`transportAuthentication` を付加する。

## Capability Negotiation

Capability token は英小文字、数字、hyphen と `-v<正整数>` からなる 32 文字以下の値に限定する。
未知の任意 Capability は無視できるが、未知または未対応の Required Capability は Peer を拒否する。

- Rules-only: Supported / Required ともに `rules-provider-v1` である。
- Local LLM: Supported は `rules-provider-v1` と `local-llm-v1`、Required は
  `rules-provider-v1` である。
- Local LLM を Required にした端末へ Rules-only 端末は参加できない。能力を黙って偽装せず、型付き
  `UNSUPPORTED_REQUIRED_CAPABILITY` で終了する。

各 Peer は sequence `0` の `hello`、sequence `1` の `capability` の順で開始する。交渉完了前に
Passport、Ready、Signal を受信した場合は Passport Data を Application へ渡さない。

## 順序、期限、再送

- 同じ Message ID は最初の受理結果だけを有効にし、再送は `duplicate-message-id` として無視する。
- `sequence` が最後の受理値以下なら `out-of-order` として無視する。
- 前の値より 2 以上進んだ Message は受理するが `sequenceGap` を返す。Caller は過去 Transcript を
  再送せず、現在の Membership / Public Passport Snapshot を要求する。
- `expiresAtEpochMs <= nowEpochMs` は `expired` として無視し、次の Message で gap を検出できるよう
  最後の受理 sequence を進めない。
- Message TTL は 60 秒以内、将来時刻の許容差は 30 秒以内とする。送信時刻が期限より後の値、
  Lounge の期限を超える値、許容差を超える未来値は拒否する。

## Resource Limit

| 対象 | 上限 |
| --- | --- |
| Envelope | 4,096 UTF-8 byte |
| 1 Peer / rolling 1 秒 | 16 message |
| 1 Peer / rolling 1 秒 | 8 KiB |
| 1 Peer / Lounge | 512 message |
| 1 Lounge | 2,560 message |
| Membership | 2〜6 Participant |
| receiver の Remote Peer state | Local を除く 5 名 |
| Capability | Supported 8 件、Required 4 件 |
| Evidence ID | 4 件 / Bridge Proposal |

Wire Membership は 2〜6 名を維持する。Host receiver 内の cleanup だけは Host 1 名の local Snapshot を
`cleanupLocalHostMembership()` へ適用し、最後の Guest の Passport と Peer state を破棄する。この 1 名
Snapshot は Wire へ送信せず、次の Guest を加えた 2 名以上の Snapshot から配布を再開する。

未認証接続は Peer state を作らずに拒否する。Peer 単位の上限超過、認証不一致、不正 Schema、
Capability 不一致と Peer ごとの 512 件超過は該当 Participant だけを Lounge 内で拒否する。
Lounge 全体の認証済み入力は Handshake、重複、不正入力も含め 2,560 件までとし、2,561 件目は
`MESSAGE_LIMIT_EXCEEDED` を返してセッションを閉じる。別 Lounge の同じ端末を相関または拒否する
永続 state は持たない。

## Late Join と保持境界

receiver が保持する本文は最新の Host Membership Snapshot と Participant ごとの最新 Public Passport
だけです。Late Joiner へはこの Snapshot だけを返す。`pet-signal`、`bridge-proposal`、`ready`、
`error` の履歴、Owner Answer、Prompt、Model Output は保持も再送もしない。
新しい Membership revision で除外された Participant と `leave` を受理した Guest は Snapshot から
直ちに除外する。active slot は解放し、同じ一時 Participant ID の再送を拒否する tombstone だけを
Lounge セッション内に残す。tombstone の件数も Lounge 全体 2,560 message の上限で bounded です。

## エッジケース

- 未認証、認証済み Participant と Envelope sender の不一致、別 Lounge の Message を拒否する。
- Unknown Major / Minor、kind、field、必須 field 欠落、重複配列、過大 JSON、深い JSON を拒否する。
- Required が Supported に含まれない自己矛盾した Capability 宣言を拒否する。
- Message ID の重複、sequence の戻り、gap、期限境界、未来時刻、Lounge 期限超過を区別する。
- Membership は Host だけが更新し、除外 Participant の state を破棄する。Guest の `leave` は現在
  Snapshot から Guest を除外し、Host の `leave` / `expire` は全 state を破棄する。
- Guest の `leave` で Wire Membership が 2 名未満になった場合も最後の revision は保持し、古い
  Membership の replay を拒否する。Local Host は専用 cleanup API で Host 1 名の Snapshot を保持できる。
- Local Membership と Wire Membership の revision は同じ 0〜2,147,483,647 に限定する。一般 Peer の
  Schema / rate / Capability 拒否記録と、退出確定 ID の再追加禁止 tombstone は分離する。
- `dispose()` 後の受信は型付き `SESSION_CLOSED` とし、Snapshot は空にする。

Wire の field、受信アルゴリズム、例、Size Budget の正本は
[Peer Protocol Specification](../architecture/peer-protocol.md) とする。

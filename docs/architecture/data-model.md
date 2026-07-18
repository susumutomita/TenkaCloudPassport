# Data Model と Protocol Version

本書は TenkaCloud Passport の Domain 型、外部入力 schema、公開 Projection、Version Migration の
実装契約です。用語は [用語集](../product/glossary.md)、データの保存と共有は
[Privacy データ台帳](../privacy/data-inventory.md)、失敗時の安全側動作は
[脅威モデル](../security/threat-model.md) を正本とします。

## 境界と依存方向

`src/domain/` は純 TypeScript の型と純粋関数だけを持ち、React Native、Storage、Transport、
LLM package を import しない。乱数、時計、保存、送受信、モデル実行は Domain の外から値または
関数として渡す。`src/protocol/` は未知の外部値を検証済み Domain 型へ変換し、入力 object の参照を
内部へ持ち込まない。

Local Private Profile と Public Passport は別型です。Public Passport は Owner が QR 生成ごとに
再確認した Pet Name、今回 ON にした任意表示項目と Languages、最大 3 件の手掛かりだけを
`projectPublicPassport` で投影し、Local Private Profile の追加 field を spread、直列化、暗黙 copy しない。

## Schema 一覧

| Schema | 区分 | 必須 Version | 主な field | 外部共有 |
| --- | --- | --- | --- | --- |
| Local Private Profile | `L1` | `schemaVersion: 2` | Pet 表示情報、任意 Alias、カタログ版、候補、Languages である。 | 共有しない。 |
| Public Passport | `L2` | `schemaVersion: 2` | Pet Name と今回 ON にした表示情報、Languages、最大 3 件の手掛かりである。 | QR と認証済み Pet だけである。 |
| Lounge | `L3` | `schemaVersion: 1` | 使い捨て Lounge ID、Participant ID、期限、状態である。 | 認証済み Pet だけである。 |
| Owner Question | `L3` | `schemaVersion: 1` | 版管理済み質問 ID と表示 key である。 | 自分の Owner だけである。 |
| Match Evidence | `L3` | `schemaVersion: 1` | 確認済み手掛かりと同意済み回答の参照である。 | Agent Decision 内だけである。 |
| Bridge | `L3` | `schemaVersion: 1` | 表示 template key と Match Evidence である。 | 自分の Owner だけである。 |
| Agent Decision | `L3` | `schemaVersion: 1` | Bridge または `no-signal` の終端判断である。 | 必要な終了同期以外は共有しない。 |
| Local Model Manifest | `L1` | `schemaVersion: 1` | Imported GGUF の digest、Size、互換 Metadata、Risk、active 選択である。 | 共有しない。 |
| Local Benchmark Report | `L1` | `schemaVersion: 1` | Model digest、duration、Peak Process Memory、Thermal、Battery Delta である。 | 共有しない。 |
| Peer Envelope | `L3` | `protocolVersion: { major: 1, minor: 1 }` | Lounge ID、送信 Participant ID、sequence、nonce、許可済み payload である。 | 認証済み Pet だけである。 |
| バックアップ | `L4` | `backupSchemaVersion: 2` | Local Private Profile、端末設定、モデル検証記録である。 | Owner が選んだ保存先だけである。 |

Public Passport、Peer Envelope、バックアップに Local ID、更新日時、端末 ID、連絡先、位置情報、URL、
保存先パスを設けない。Peer Envelope の payload に Raw LLM Prompt、system prompt、Chain of Thought、
token buffer、任意の自由記述を設けない。strict schema はこの allowlist にない key を入力全体の失敗にする。
Local Benchmark Report に Passport、Prompt、Answer、Bridge、Model Output、Error 本文、File URI、端末 ID、
端末名を設けない。Model Manifest の private URI は端末内 runtime だけが読み、画面、バックアップ、Report、ログへ
投影しない。

## 上限

| 対象 | 上限 | 理由 |
| --- | --- | --- |
| Public Passport の手掛かり | 3 件である。 | Privacy データ台帳の公開最小化契約である。 |
| Local Private Profile の候補と除外トピック | 各 10 件である。 | 無制限配列を許可しない。 |
| Topics、Offer、Looking For、Goal | 順に 3 件、3 件、3 件、1 件である。 | Local 候補の分類別上限を固定する。 |
| Pet Name と Owner Alias | 各 24 UTF-16 code unit である。 | 連絡先や詳細 Profile ではない短い表示名へ限定する。 |
| Languages | 3 件である。 | 版管理済み Language カタログへ限定する。 |
| Lounge の Participant | 8 人である。 | 近距離の一時セッションへ用途を限定し、状態と送信量を bounded にする。 |
| Owner Question | 1 回である。 | 用語集と Privacy データ台帳の契約である。 |
| Match Evidence の手掛かり | 3 件である。 | Public Passport より根拠を増やさない。 |
| Version、ID、catalog 値以外の短い文字列 | 96 UTF-16 code unit である。 | 表示 key と app version を bounded にする。自由記述は許可しない。 |
| Peer Envelope の UTF-8 JSON | 4 KiB である。 | 過大な Pet Message を検証前に拒否する。 |
| バックアップの UTF-8 JSON | 64 KiB である。 | カタログ選択と設定だけの allowlist を超える入力を拒否する。 |
| Local Model Manifest の Model | 8 件である。 | 数 GiB File と検証記録の無制限蓄積を避ける。 |
| Model File Name | UTF-8 128 byte である。 | 画面表示と private path construction を bounded にする。 |
| Local Benchmark Report | Model ごとに直近 20 件である。 | 時系列 Telemetry の無制限蓄積を避ける。 |
| 外部 JSON のネスト深度 | 8 である。 | 深い再帰入力を Schema 検証前に拒否する。 |
| `sequence` | `0` 以上 `2,147,483,647` 以下である。 | 単調増加整数へ限定し、数値精度と無制限増加を避ける。 |

JSON byte 数は `TextEncoder` の UTF-8 byte 数で測る。上限と同じ値は受理し、1 byte でも超えれば
利用前に拒否する。ネスト深度は root を 1 とし、object または配列の子へ進むごとに 1 を加える。

## 使い捨て ID

Lounge ID と Participant ID はそれぞれ独立した 128 bit の乱数から生成する。Domain は
`RandomBytes` 関数を引数に取って純粋性とテスト可能性を保ち、実行境界は
`crypto.getRandomValues` を使う。同じセッションの 2 回の生成結果が衝突した場合、短い byte 列、
長い byte 列、すべて 0 の byte 列を受け取った場合は ID を発行しない。

ID は型ごとに異なる prefix を持つが、認証、人物同定、Lounge 横断の照合には使わない。新しい
Lounge は以前の ID を入力として受け取らず、毎回新しい乱数を要求する。Public Passport 自体には
ID を持たせないため、同じ内容を 2 回受信しても parser が横断追跡用 ID を生成することはない。

## Version と互換性

Peer Envelope は Major と Minor の両方を必須にする。現行実装は `1.1` だけを受理し、未知の
Major Version と未対応の Minor Version を拒否する。互換性を確認せず未知 field を無視する方式は
strict schema と両立しないため採用しない。

保存データの Migration は、旧 Version の strict schema を検証した後、新しい object を返す純粋関数に
する。失敗時は入力 object、既存の現行データ、保存先を変更しない。Migration の呼び出し側は成功結果を
得た後にだけ保存を置換する。Major Version を追加するときは新しい ADR、旧 Version parser、正常、
異常、境界、互換性のテストを同じ変更に含める。

## 検査

Domain の依存方向は次の command で検査する。

```bash
rg -n "from ['\"](?:react|react-native|expo|@react-native|.*storage|.*transport|.*llm)" src/domain
```

出力がないことを合格条件とする。実行時 schema は `bun test`、型は `bun run typecheck`、依存なしと
禁止 pattern は `bun scripts/architecture-harness.ts` で検査する。

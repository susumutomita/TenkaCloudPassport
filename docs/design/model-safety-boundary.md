# Local Model Safety Boundary の設計

本書は https://github.com/susumutomita/TenkaCloudPassport/issues/19 の Pure TypeScript 境界に関する
設計正本とします。実 `llama.rn` Adapter、GGUF load、端末資源制御は Issue 17・18 の責務です。

## 信頼境界とデータフロー

```text
unknown Input
  -> byte / depth / node / Unicode / strict field validation
  -> validated AgentModelInput
  -> canonical Evidence derivation
  -> [trusted system message, bounded untrusted JSON message, strict schema, tools=[]]
  -> Native completion port
  -> unknown Output
  -> strict output schema + input-derived Evidence validation
  -> fixed Domain renderer
  -> AgentModelDecision | typed failure -> Rules fallback once
```

Provider は Domain 所有の非列挙 brand を持つ凍結済み nominal capability とする。Safety factory が
Completion Port を閉じ込めてから Local capability constructor を呼び、Rules capability は Domain の基準
実装だけが生成する。Provider 実行境界は own brand、kind との一致、非列挙性、凍結状態を再検証する。
加えて Domain module-private `WeakSet` の identity membership を要求する。export 済み Provider から symbol を
列挙して同じ descriptor を作っても membership は複製できない。object spread や継承で `kind` / `provide` を
再構成した場合も、Local / Rules のどちらも capability として実行しない。WeakSet は object を保持し続けず、
Request / Output / Error の内容も格納しない。

Public Passport と Owner Answer は schema を通過しても自己申告であり、信頼済み Instruction ではありません。
GGUF Output も strict JSON に見えても信頼しません。Trusted Input はカタログ定義、Owner が公開に同意した
参照、Domain が再導出した Evidence 集合、Privacy Policy だけです。

## Input Contract

- JSON 相当の object だけを受け、top-level、Passport、Clue、Owner Answer の未知 Field を拒否する。
- serialized byte 数、object depth、node 数を固定上限にし、解析前後の仕事量を bounded にする。
- `JSON.stringify()` より先に accessor、cycle、byte、depth、node を走査し、object / array の
  `toJSON` と追加 own property を拒否して巨大 object を複製しない。
- Unicode の Cc、Cf、Default Ignorable を拒否する。攻撃文字列を Error Message へ含めない。
- Public Passport の既存 strict parser を再利用し、Clue、Language、件数、表示名長を再検証する。
- `deadlineAtWallClockMs` は有限値、`language` はカタログ値、Owner Answer は閉じた値だけにする。
- Pet Name、Pet Emoji、Owner Alias、Owner Answer 本文は Model Request へ投影しない。

通常の命令文でも、canonical Evidence に影響しない自由記述は Model Message から単純に除外する。
Unicode 制御文字や上限違反は Message を作らず型付き失敗にする。この 2 段階により「拒否または正規化」を
意味解析ではなく構造で満たす。

## Prompt と Output Contract

System Message は固定版の Instruction です。User Message は固定 delimiter で囲んだ JSON だけです。
JSON が選べるのは `kind`、canonical `evidenceId`、出力 `language` だけで、自由記述 Field はありません。
Request の `tools` は常に空配列とする。

Output JSON Schema は `no-signal` または `bridge + evidenceIds` だけを許可し、未知 Field を拒否する。
`evidenceIds.items.enum` は Request ごとの canonical ID 集合に固定し、候補 0 件なら bridge 分岐を作らない。
Schema 通過後も `validateAgentModelProviderOutput()` が、ID の重複、件数、Input 由来集合との一致を再検証する。
Reason、Opener、Confidence は GGUF Output から採用せず、検証済み Evidence から固定 Renderer が作る。
Native Completion が typed error を返しても本文は信頼せず、code だけを固定 message へ写す。
code も共通 Provider fallback 境界で Runtime の閉じた4値へ再検証し、Safety factory の呼出経路に
関係なく未知値は固定 `LOAD_ERROR` として扱う。

Tool Call、URL、連絡先、File Path、System Prompt、非共有 Field は Schema で表現できない。Model がそれらを
未知 Field または別 `kind` で返した場合は Output 全体を捨て、内容を反射しない固定 Error にする。

## Attack Matrix

| 入力 / 出力 | 予防 | 検出 | 回復 |
| --- | --- | --- | --- |
| 前の指示を無視、System Prompt 開示 | Passport 自由記述を Prompt へ投影しない | Corpus で Request 非包含を検査 | 正常なら Evidence-only 推論を継続 |
| Cc、Cf、Default Ignorable | Input Boundary で許可しない | 型付き固定 Error | Model を呼ばず Rules へ 1 回だけ切替 |
| 過大 Text、深い JSON、未知 Field | byte / depth / node / strict field 上限 | 同上 | 同上 |
| URL、連絡先、パス、Tool Call Output | strict schema に Field がない、tools 空 | Runtime Validator | Output を破棄し Rules へ 1 回だけ切替 |
| Schema 内の根拠外 Evidence ID | Input 由来集合と照合 | Runtime Validator | 同上 |
| Failure 後の遅延・再試行 | Encounter-scoped in-flight / settled ledger | 同一 Key の Outcome を再利用 | 攻撃 Input を再度 Model へ渡さない |

## Corpus と Fuzz

Corpus は instruction override、System Prompt、file、URL、contact、tool call、Unicode 制御、長大入力を
カテゴリ別に保持する。テストは Corpus 全件が Request に現れないか、Message 作成前に固定 Error で拒否される
ことを確認する。さらに seed 固定の生成器で 1,000 件以上の plain JSON 変種を作り、例外内容の反射、Crash、
unbounded Request、状態蓄積がないことを検査する。guard ごとの内容非反射な reason を検査し、強制 GC の
前後で heap 増加に上限を置く。純関数境界は global cache や retry queue を持たない。

## 残余リスクと実機 Gate

- 対応 GGUF parser と Native runtime の未知脆弱性、OOM、thermal throttling は Pure Test では証明できない。
- 正規 Evidence ID でも会話相手が望まない組合せを選ぶリスクは残るため、Owner の Bridge 表示前確認を維持する。
- 実 GGUF による Corpus 実行、iOS / Android の memory、cancel、log、offline 証跡は Issue 17・18 で取得する。
- 実機証跡がない段階で Issue 19 全体を close せず、本 PR は再利用可能な Safety Foundation として merge する。

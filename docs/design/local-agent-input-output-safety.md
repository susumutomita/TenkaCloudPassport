# Local Agent の入力・出力安全境界

## 目的

悪意ある Public Passport、Owner Answer、Peer Message、GGUF Output が、System Instruction の
上書き、秘密や端末 Path の反射、外部 Action、根拠のない Bridge、無制限な資源消費へ到達しない
境界を定義する。対象は Issue 19 であり、実機 Model の品質評価と GGUF File lifecycle は
Issue 17・18、Peer Wire Envelope は Issue 23 の責務とする。

## 信頼分類とデータフロー

```text
QR / Peer / Passport / Owner Answer（Untrusted）
  -> strict versioned schema・件数・文字・Unicode 検証
  -> Domain の決定的な Evidence 導出（Trusted）
  -> Evidence だけの bounded JSON（Untrusted Data Message）
  -> GGUF（Untrusted）
  -> strict JSON Schema
  -> Runtime Validator・Evidence 再照合（Trusted）
  -> 固定 Renderer または Rules Fallback
```

Model は Public Passport の `petName`、`ownerAlias`、自由記述、Owner Answer 本文、Raw Prompt、
端末 Path、URL、Contact を必要としない。Native Adapter は `AgentModelInput` を実行直前に再検証し、
Domain が導出した `allowedEvidence` だけを Model の User Message へ渡す。表示用文字列は Prompt へ
入れず、Unicode `Default_Ignorable_Code_Point` と `Cc` 制御文字を入力境界で拒否する。これには
双方向制御、Zero-width、Invisible Separator、Variation Selector を含む。正規の表示文字列は NFC へ
正規化する。

System Message は固定 Instruction だけを持ち、User Message は版付き JSON Data だけを持つ。
`tools`、Tool Definition、URL Open、File、Network、Contact、Telemetry の Port を Model へ渡さない。

## 出力契約

Model が表現できる値を次の 2 形に限定する。

- `{ "kind": "no-signal" }`。
- `{ "kind": "bridge", "evidenceIds": [...] }`。`evidenceIds` は入力の列挙値だけである。

JSON Schema は未知 Field、自由記述、Tool Call、URL、Contact、端末パスを表現できない。
Runtime Validator は Schema 適合後にも Evidence を入力から再導出し、未知、重複、空、過剰な
Evidence が 1 件でもあれば Output 全体を破棄する。Reason、Opener、Confidence は Model Output を
使わず、信頼側の固定 Renderer が Evidence から作る。Invalid Output と Native Error の本文は UI、
Log、Fallback Prompt に反射しない。

## 上限

Public Passport は既存 Versioned Schema の件数と長さ上限を再利用する。Local Agent 用 Prompt JSON は
Evidence の閉じた型だけから作り、UTF-8 4 KiB を上限とする。GGUF Output も JSON parse 前に
UTF-8 4 KiB、parse 後に深度 4 を上限とする。Model Context、生成 Token、Deadline、
Native Lane は Issue 17 の設定上限を維持する。境界は純粋・状態なしとし、入力や出力を module-level
Collection へ保持しない。

CI は固定 Corpus と 1,000 件以上の決定的 Fuzz Input を、Native Model を代替する Mock なしで
Pure Boundary、Schema、Runtime Validator へ直接適用する。全入力が bounded result または内容を
含まない型付き `SCHEMA_ERROR` に収束し、処理時間と返却 byte 数が上限内であることを確認する。
実機 GGUF Test は別 Gate の証跡として扱い、CI の Pure Test で代替しない。

## 代替案

### Public Passport 全体を Delimiter で囲って渡す案

System と User Message を分離しても、不要な Pet 名・Alias・命令文を Model Context へ入れるため、
Prompt Injection と秘密反射の面が残る。Model が必要とするのは Evidence 選択だけなので不採用とする。

### 危険語句の Blocklist だけで Sanitization する案

言語、表記、Unicode、分割 Token の変形を列挙しきれず、正当な表示名の誤検知も起こる。構造検証と
不要データの非投入を主制御とし、Unicode 制御文字の拒否だけを文字レベル制御として採用する。

### Model Output の短い Opener を Validator 後に表示する案

Schema に自由記述を戻すと、Evidence 外 Claim、URL、Contact、System Prompt の反射を意味検査へ
依存させる。Issue 16 の固定 Renderer 契約を維持し、Model は Evidence ID の選択だけを担う。

## 異常系と回復

- 未知 Field、未知 Version、未知 Clue、過大配列、深い JSON、`Default_Ignorable_Code_Point`、`Cc` は
  Model 初期化前に
  `SCHEMA_ERROR` とする。
- Tool Call 形式、Schema 外 Field、自由記述、入力外 Evidence、Invalid JSON は Output 全体を
  破棄する。攻撃文字列を Error Message へ含めない。
- 型付き Safety Failure は同じ Encounter で Rules へ 1 回だけ切り替える。Local Model を再試行せず、
  同じ攻撃文字列を別 Prompt へ入れない。
- Rules は版管理済み Clue と確認済み Evidence だけを使い、根拠が無ければ `no-signal` にする。
- Cancel、Expire、Exit は Issue 17 の Abort・Context Release・Native Lane 所有権へ収束する。

## 検証

- 固定 Corpus に「前の指示を無視」「System Prompt を出力」「File を読む」「URL を開く」、
  Tool Call、Contact、端末 Path、双方向制御、Zero-width、過大文字列を含める。
- Corpus の表示文字列が Prompt JSON に 1 byte も入らないことを確認する。
- 未知 Field、深い Object、Prototype 付き Object、過大入力を型付き失敗にする。
- Schema 適合に見える入力外 Evidence と Tool Call 形式を Runtime Validator が全体拒否する。
- 1,000 件以上の決定的 Fuzz Input で crash、hang、上限外返却がないことを確認する。さらに 20,000 回の
  追加実行後に強制 GC を行い、Heap 増加が 8 MiB 未満であることを確認する。
- Failure 後の Rules Fallback が 1 回だけで、Local Provider を再実行しない既存 Runner Test を
  Security Regression として結び付ける。
- Threat Model、残余リスク、Corpus の範囲を Security Review で確認する。

## 残余リスク

許可済み Evidence ID の選択自体を Model が偏らせる可能性、GGUF parser / runtime の未知脆弱性、
正規表示画面を Owner が撮影・共有する可能性は残る。Domain Validator、Rules Fallback、Owner の
表示前確認、実機 Model Gate を維持し、Pure Test の Green を Model の安全証明とは扱わない。

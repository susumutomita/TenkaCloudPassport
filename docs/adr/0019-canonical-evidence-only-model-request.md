# ADR-0019: Local Model Request を canonical Evidence 選択へ限定する

## Status

Accepted

## Context

https://github.com/susumutomita/TenkaCloudPassport/issues/19 は、悪意ある Public Passport、Owner
Answer、GGUF Output が System Instruction の上書き、外部 Action、秘密や Path の反射、架空 Bridge
を起こさないことを要求する。Issue 16 の Provider Contract は Output を Evidence ID に限定したが、
Issue 17 の Native Adapter がどの Input を Prompt へ渡してよいかは未確定だった。

禁止語 Filter や delimiter だけでは、別言語、Unicode、未知の命令表現を網羅できない。Pet Name、
Owner Alias、Owner Answer の自由記述は Bridge Evidence の選択に不要であり、Model へ渡す理由がない。

## Decision

Local Model へ渡す User Message は、Domain が `AgentModelInput` から再導出した canonical Evidence
候補の `kind` と `evidenceId`、出力言語だけで構成する。System Instruction と User Message は別要素とし、
Passport 全体や自由記述を同じ文字列へ連結しない。User Message は固定 delimiter 内の bounded JSON とする。

Native Completion Port へ渡す Request は次を必須とする。

- `messages` は trusted System Instruction と untrusted canonical JSON の 2 件だけである。
- `responseFormat` は `bridge + evidenceIds` または `no-signal` の strict JSON Schema である。
- `tools` は空配列であり、Tool Definition を追加できない。
- Input は byte、depth、node、field、Unicode 制御文字の上限を通過したものだけである。
- Output は既存 Runtime Validator が Input 由来 Evidence と照合し、表示文を Domain で再構築する。
- Native / Local Agent 実装は Completion Port だけを実装する。production `src/` における
  `kind: 'local-agent'` の直接実装は `INVARIANT_LOCAL_AGENT_SAFETY_BOUNDARY` で拒否する。生成済み
  Provider は Domain 所有の非列挙 brand を持つ凍結済み capability とする。Local capability は Safety
  factory だけが constructor を呼べ、Rules capability は Domain の基準実装だけが生成する。spread / 継承
  clone は brand を継承できず、kind に関係なく実行境界で拒否する。Runtime 真正性は descriptor に加えて
  Domain module-private `WeakSet` の identity membership を必須にし、列挙した symbol の複製では生成できない。
- Input の object / array は accessor、`toJSON`、追加 own property を持たない plain JSON 構造に限定する。
- Native Completion の typed error は code だけを採用し、本文を固定 message へ置き換える。
- 失敗は内容を含まない `AgentModelProviderError('SCHEMA_ERROR')` とし、既存 Runner が Rules へ 1 回だけ
  fallback する。

## Consequences

- Good: Prompt Injection を文字列の意味判定で防ぐ必要がなく、不要な自由記述を攻撃面から除去できる。
- Good: Tool Call、URL、連絡先、パス、自由記述 Claim を Input と Output の型で表現できない。
- Good: Native Package や GGUF なしで Corpus と Fuzz を CI 実行でき、Issue 17 Adapter も同じ境界を迂回できない。
- Good: TypeScript の構造的型付けだけに依存せず、Provider clone や member 分割を Runtime でも拒否できる。
- Bad: Model は Passport の語調や Pet Name を使った表現を生成できず、選択能力は Evidence 候補の選択に限られる。
- Tradeoff: 純境界は GGUF runtime 自体の parser 脆弱性や資源枯渇を証明しない。実 Model の証跡は Issue 17・18
  の実機 Gate に残す。

## References

- [Model Safety Boundary](../design/model-safety-boundary.md)
- [Agent Model Provider Runtime](../design/agent-model-provider-runtime.md)
- [Threat Model](../security/threat-model.md)

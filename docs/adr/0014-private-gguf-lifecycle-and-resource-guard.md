# ADR-0014: GGUF を transactional private lifecycle と保守的 Resource Guard で管理する

- **Status**: Accepted。
- **Date**: 2026-07-18。
- **Deciders**: Susumu Tomita (@susumutomita)。

## Context

ADR-0012 は `llama.rn` Context を Encounter 単位で隔離したが、GGUF Path は Development Build の環境変数から
受け取るだけだ。Owner が Files から選ぶ数 GiB の GGUF は、選択時の不要 Copy、空き容量不足、権限失効、
破損、同名衝突、過大な Model による OOM / Thermal shutdown を起こし得る。Digest 一致を安全性の証明として扱うと、
悪意あるが byte として一貫した Model を信頼してしまう。

## Decision

Document Picker は自動 cache copy を無効にし、Copy 前に Name / Size / 空き容量を表示する。Owner の明示確定後だけ
private models directory の incoming File へ Copy し、Size、chunked SHA-256、`loadLlamaModelInfo` の Architecture /
Context Metadata を検証してから、digest 名の最終 File と versioned Manifest を transaction として確定する。
SHA-256 は byte 同一性の識別子に限り、安全性または出所の表示には使わない。

Model Size に 20％の runtime reserve と Context reserve を加え、端末の effective memory に対する比率で
`supported | caution | blocked` を決める。Caution は明示確認後だけ activate し、Blocked または Thermal State が
serious / critical の Model は Context を初期化しない。

Benchmark は Model Digest、duration、Peak Process Memory、Thermal State、Battery Delta、成功種別だけを private
Manifest に保存する。Passport、Prompt、Answer、Bridge、Model Output、Error 本文、File URI、端末識別子を Schema
から除外し、バックアップと Git に含めない。必要な process / thermal / battery 情報は外部 SDK ではなく、識別子 API を
持たない local Expo module から取得する。

Unload / Delete は Runner の Abort だけで成功にせず、Native `stopCompletion()` / `release()` の teardown 完了を
待つ。Unload 後に active selection を外す。Delete は File を staged rename し、Manifest record と Report を atomic に
外した後で最終削除する。Manifest 更新失敗時は File を復元し、cleanup 失敗は次回 load の reconcile で再試行する。
実行中 Provider に影響する操作は Owner の確認後だけ行い、Lounge ID と Encounter key は維持する。

Activate 前は inactive Model も Size と SHA-256 を再検証する。Import の Manifest 書込が commit 前後どちらで失敗したか
判定できない場合は確定 File を削除せず cache を破棄し、次回 load が永続 Manifest を正本として保持または削除へ収束させる。

## Consequences

- **Good**: Owner は数 GiB の Copy を開始する前に Size と空き容量を確認できる。
- **Good**: Hash 計算が Model 全体を JavaScript memory へ展開せず、検証自体の OOM を避けられる。
- **Good**: Context 初期化前に GGUF parse と Resource Risk を fail closed で評価できる。
- **Good**: Benchmark の Schema が推論内容と端末識別子を構造的に受け取れない。
- **Bad**: Import は Copy、Hash、Metadata parse を順に行うため時間がかかり、進捗 UI が必要になる。
- **Bad**: 保守的な閾値は一部端末で実行可能な Model も caution / blocked にする。
- **Tradeoff**: 閾値の緩和は Compatibility Matrix と物理端末の peak memory / thermal 証跡を伴う新しい ADR で行う。

## References

- 関連設計: [GGUF Import・Resource Guard・Benchmark の設計](../design/gguf-model-lifecycle.md)。
- 関連 ADR: [ADR-0012](./0012-llama-provider-runtime-boundary.md)。
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/18 。
- 外部資料: https://docs.expo.dev/versions/latest/sdk/document-picker/ 。
- 外部資料: https://docs.expo.dev/versions/latest/sdk/filesystem/ 。
- 外部資料: https://docs.expo.dev/modules/get-started/ 。
- 外部資料: https://github.com/mybigday/llama.rn 。

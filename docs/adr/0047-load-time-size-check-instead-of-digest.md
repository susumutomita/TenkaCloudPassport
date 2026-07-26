# ADR-0047: 起動時の Local Model 検証をフル SHA-256 から Size 照合へ変更する

- **Status**: Accepted。
- **Date**: 2026-07-26。
- **Deciders**: Susumu Tomita (@susumutomita)。

## Context

Issue 152（オンデバイス LLM 会話 Agent を実機で通しで動かす）の実機検証で、公開 blocker となる性能不具合が
見つかった。Qwen2.5-1.5B-Instruct Q4_K_M（1.04 GiB）を取り込み・有効化済みの端末で App を起動すると、
Settings が「Local Model の端末内処理を実行中です」のビジー状態になり、「オンデバイス AI を有効化」等が
グレーアウトしたまま **9 分以上経過しても解除されない**（iOS Simulator、Metro dev ビルド）。この間、
model provider の configure も完了しないため、会話 Agent は Rules へフォールバックする。

原因はコードで確定した。`src/local-agent/model-lifecycle.ts` の `ensureLoaded()` が呼ぶ
`verifyActiveModelAtLoad()` は、`digestPrivateFile(fileStore, active.privateUri)` で **active Model
（最大 1.04 GiB）全体の SHA-256 をプロセス初回 `load()` のたびに再計算していた**。ハッシュは
`src/local-agent/sha256.ts` の純 TypeScript 実装であり、JIT の無い Hermes 上では 1 GiB 級の File で
数分〜十数分かかる。Model を有効化した owner 全員が、App を起動するたびにこのビジー壁に当たる設計だった。

調査の過程で、`ensureLoaded()` は `verifyActiveModelAtLoad()` を呼ぶ直前に、既に
`assertManifestFilesPresent()` で Manifest 上の全 Model（active を含む）について
`fileStore.modelFileInfo(model.privateUri)` の `exists` と `sizeBytes === model.sizeBytes` を検証しており、
一致しなければ `MANIFEST_READ_FAILED` として load 全体を拒否することを確認した
（`src/local-agent/model-lifecycle.test.ts` の「Manifest の JSON・read・reconcile・File 参照不整合を
型付きで拒否する」テスト、`missing` シナリオが既にこれを実証している）。つまり存在＋Size の fail-safe は
`verifyActiveModelAtLoad()` より前段で既に担保されており、`verifyActiveModelAtLoad()` 自身の digest 照合が
実質的に守っていたのは「Size は変わらないまま内容だけが破損した」という 1 種類のケースだけだった。

## Decision

`verifyActiveModelAtLoad()` から `digestPrivateFile` 呼び出しを削除し、Resource Risk の再評価
（`resourceSnapshot` → `evaluateModelResourceRisk`）だけを残す。存在＋Size の検証は重複実装せず、
`ensureLoaded()` が既に呼んでいる `assertManifestFilesPresent()` に一本化する。

- 起動時（`load()` 経由の `ensureLoaded()`）は、Model File の digest を計算しない。
- Manifest 上のいずれかの Model File が欠落・Size 不一致であれば、`assertManifestFilesPresent()` が
  従来どおり `MANIFEST_READ_FAILED` で load 全体を拒否する（active 限定の緩やかな fail-safe ではなく、
  Manifest 全体を信用しないという既存のより厳格な fail-safe のままにする）。
- `assertManifestFilesPresent()` を通過した後は、`verifyActiveModelAtLoad()` が現在の Device Resource
  Risk（`supported | caution | blocked`）だけを再評価し、`blocked` または `caution` なら active 選択を
  解除して Rules Provider へフォールバックする。この部分は本 ADR で変更しない。
- フル SHA-256 検証は以下の経路にだけ残す（変更しない）。
  - 取り込み時（`runImport` の `digestPrivateFile`）。
  - 有効化時（`assess()` → `assertModelIntegrity()`。`assessActivation` / `activate` からだけ呼ばれ、
    起動のたびに走る配線にはなっていないことをコードで確認済み）。

### 整合性の考え方

Model File は app-private storage にあり、取り込み時に SHA-256 検証済みである。起動のたびの再ハッシュが
追加で防げるのは「app-private 領域の File が外部要因で Size を変えずに破損した」ケースだけであり、
部分書き込みは staging（`.incoming.gguf`）と atomic manifest 置換で既に防いでいる。端末そのものが
攻撃者に掌握されているケースは起動時の再ハッシュでも防げない（攻撃者は Manifest の `sha256` フィールドも
同時に書き換えられる）。したがって、起動時フルハッシュは「失うもの（同一 Size の破損検出）」に対して
「代償（毎起動、数分〜十数分のビジー化）」が著しく大きい。

## 選択肢

1. **バックグラウンドで非ブロッキングにハッシュする（不採用）**: UI をブロックしなくなる点は改善するが、
   `mutationTail` による単一 mutation lane 直列化（`schedule()`）と、Import / Activate / Unload / Delete が
   同じ lane で待ち合わせる設計（`docs/design/gguf-model-lifecycle.md` 参照）に、非同期で走り続ける
   background hash という新しい並行性の軸を追加することになる。Hash 完了前に Owner が Unload / Delete /
   再 Activate を行った場合の keep-alive・cancel・競合の扱いを新たに設計する必要があり、複雑さの割に
   得られるものが小さい（`assertManifestFilesPresent()` が既に Size 不一致を fail-safe しているため、
   background hash が追加で守れる範囲は「Size 一致のまま内容だけ破損」という同じ狭いケースのみ）。
2. **native 実装へハッシュを移す（不採用）**: `llama.rn` や Expo Native Module 側に SHA-256 計算を
   委譲すれば Hermes の JIT 無しという制約を回避できる可能性はあるが、新しい native 依存の追加・
   iOS / Android 双方の実装・保守が必要になる。起動時のフルハッシュという要件自体を本 ADR で
   「不要」と判断したため、要件を残したまま高速化する選択肢は採用しない。
3. **`verifyActiveModelAtLoad()` の digest 照合を Size 照合へ置き換える（採用）**: 起動時に守りたい
   fail-safe（存在・Size）は `assertManifestFilesPresent()` に既にあり、`verifyActiveModelAtLoad()` は
   Resource Risk の再評価だけに責務を絞れる。ミリ秒オーダーの `modelFileInfo` 呼び出しで完結し、
   新しい並行性や依存を増やさない。取り込み時・有効化時のフル SHA-256 検証はそのまま残るため、
   「同じ内容で継続していることの確認」自体は import・activate の 2 点で担保され続ける。

## Consequences

- **Good**: Model を有効化した端末での App 起動が、フル SHA-256 計算（数分〜十数分）を経由しなくなる。
  Settings のビジー壁（本 Issue の観測事実）が解消し、会話 Agent の model provider configure も
  ブロックされなくなる。
- **Good**: 存在・Size の fail-safe は `assertManifestFilesPresent()` に一本化され、`verifyActiveModelAtLoad()`
  が同じ検証を重複実装しない分、コードとテストの見通しが良くなる。
- **Bad**: Model File が Size を変えないまま内容だけ破損した場合（例: 一部 byte が反転したがファイル長は
  同じ）、起動時にはこれを検出できなくなる。次に取り込み・有効化をするまで気付かれない。
- **Tradeoff**: この Bad は意図的に受け入れる trade-off である。トリガーとなる再検討条件は、(a) 実機で
  Size 不変の部分破損が実際に観測される、または (b) native 実装での高速ハッシュが低コストで使えるように
  なった場合とする。

## References

- 関連コード: `src/local-agent/model-lifecycle.ts`（`verifyActiveModelAtLoad`・`assertManifestFilesPresent`・`ensureLoaded`）、`src/local-agent/sha256.ts`
- 関連設計: [`docs/design/gguf-model-lifecycle.md`](../design/gguf-model-lifecycle.md)
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/152
- 関連 ADR: [ADR-0014](./0014-private-gguf-lifecycle-and-resource-guard.md)（private GGUF lifecycle・
  Resource Guard の元設計）、[ADR-0045](./0045-container-relative-model-resolution.md)（同じ Issue 152 の
  実機検証で見つかった別の公開 blocker）、[ADR-0043](./0043-grounded-quote-bridge-and-local-llm-reenablement.md)

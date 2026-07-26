# ADR-0045: Local Model の private URI を container-relative に解決し、絶対値を信用しない

- **Status**: Accepted。
- **Date**: 2026-07-26。
- **Deciders**: Susumu Tomita (@susumutomita)。

## Context

Issue 152（オンデバイス LLM 会話 Agent を実機で通しで動かす）の実機検証中に、公開 blocker となる不具合が
見つかった。Qwen2.5-1.5B-Instruct Q4_K_M（1.04 GiB）は DL 済みで `manifest.v1.json` も存在するのに、
Settings のオンデバイス AI が `MANIFEST_READ_FAILED` になり、会話 Agent で LLM が使えず、アプリ内「全データ
削除」も「端末内 Storage を利用できません」で失敗した。

実機の実 manifest を確認したところ、原因は 1 か所ではなく、同じ設計上の誤り（絶対 Path の永続化）が
2 経路で表面化していた。

1. `expo-model-file-store.native.ts` の `exactManagedFile` が、file 名を `pattern.test` で検証した後に
   `new File(modelDirectory(), candidate.name)` で「現在の」正しい Path を組み立てておきながら、
   `candidate.uri !== expected.uri`（保存済み絶対 URI と現在の絶対 URI の完全一致）を追加でチェックし、
   不一致なら例外にしていた。
2. `model.privateUri`（Manifest に保存された絶対 URI）が、`assertModelIntegrity` の file 情報取得や
   digest 再計算、`configured-agent-model-provider.ts` → `llama-agent-model-provider.ts` の
   `initLlama({ model: configuration.modelPath })` へ、そのまま渡っていた。

実機の manifest（`Documents/local-models/manifest.v1.json`）を確認すると、`privateUri` は
`file:///.../Containers/Data/Application/<container-uuid>/Documents/local-models/<sha256>.gguf`
という絶対 URI であり、iOS の app-private data container の UUID を含んでいた。iOS は再インストール・
Clean Build・App 更新のたびにこの UUID を差し替える。実際に観測した値は次のとおりである。

- manifest の `privateUri` が指す container: `FF11A9B9-4586-4CFB-9804-2DC152E52233`
- 実際に File が存在する container: `471BC8AB-7409-42B1-901F-6F48F2DF0BD3`（同じ `<sha256>.gguf` 名で存在）

Model File 自体は新 container の同じ相対 Path（`Documents/local-models/<sha256>.gguf`）へ OS によって
そのまま移動されているが、Manifest に保存した絶対 URI は古い container を指したままになる。前述の 1 は
この不一致を「private storage の外」と誤判定して例外にし、2 は stale な絶対 Path 文字列をそのまま
native load や digest 検証に渡して失敗させる。この設計は、Model を DL 済みの owner が App を更新した
時点で全員 LLM を失うことを意味する。

## Decision

### 境界チェックは file 名の allow-list pattern だけで行い、絶対 Path の一致は使わない

`exactManagedFile`（`readableManagedFile` / `modelFileInfo` / `stageModelDeletion` /
`matchingDeletionFiles` の入口）から `candidate.uri !== expected.uri` の絶対 URI 一致チェックを外す。
file 名は既存の `^[a-f0-9]{64}\.gguf$`（本体）・`^[a-f0-9]{64}\.deleting\.gguf$`（staged 削除）という
厳密な allow-list pattern で検証しており、パス traversal を許さない安全な境界として既に十分である。
絶対 URI の一致は「保存時の container == 現在の container」という壊れやすい前提を追加で強制していた
だけであり、この前提が実機で崩れることを確認した。

file 名の抽出・検証ロジックを `src/local-agent/container-relative-model-path.ts`（Expo / React を import
しない pure module）へ切り出し、`resolveManagedFileName(candidateUri, pattern)` として bun test で直接
検証できるようにする。`expo-model-file-store.native.ts` はこの pure function で file 名を取り出した後、
常に「現在の」`modelDirectory()` から `File` を組み立てる。

### `LocalModelFileStore` に `resolveManagedModelUri` を追加し、Manifest 読込時に self-heal する

`LocalModelFileStore` Port に `resolveManagedModelUri(sha256: string): Promise<string>`
（native 実装は `new File(modelDirectory(), \`${sha256}.gguf\`).uri`）を追加する。
`model-lifecycle.ts` の `readManifest` は Manifest を parse した直後、各 Model の `privateUri` をこの
関数で「現在の」managed Path へ再解決し、保存値と異なる Model があれば self-heal した Manifest を
返す。可能なら訂正済み Manifest を `atomicWriteManifest` で永続化するが、永続化が失敗しても in-memory の
self-heal 結果はそのまま返す（次回の書き込み成功時に再度 self-heal されるため、この 1 回の永続化失敗で
Model を読めなくする理由が無い）。

これにより、`assertModelIntegrity`・`initLlama` の `modelPath`・削除経路など、`model.privateUri` を
直接使う全ての下流が、常に現在の container の正しい絶対 Path を受け取る。file store 境界の緩和
（1 つ目の Decision）と Manifest 側の self-heal（2 つ目の Decision）は defense-in-depth として両方とも
入れる。self-heal が導入される前の Manifest でも file store 境界の緩和だけで Model File 自体は読めるが、
`model.privateUri` を直接使う native load 経路（`initLlama`）は self-heal がなければ救えない。

## 選択肢

1. **`ImportedLocalModel` から永続 `privateUri` を廃止し、常に `sha256` から導出する（不採用、今回は
   見送り）**: 根本的には最も深い修正であり、container UUID の陳腐化という不具合の類自体を無くせる。
   `resolveManagedModelUri(sha256)` は本 ADR で既に導入するため、導出の仕組み自体はもう存在する。
   それでも今回は採用しない。Issue 152 は公開 blocker（DL 済み Model を owner 全員が失う）であり、
   `ImportedLocalModel` の型・`local-model-manifest.ts` の Schema 検証・全 downstream 呼び出し箇所を
   同時に変える設計変更より、今の Schema を保ったまま安全に直せる打ち手を優先する。次に Manifest
   Schema を触る機会（例: `schemaVersion` 2 への移行）に合わせて再検討する（follow-up
   `01KYETYWAM6YHXVKXN06S4Z5K7` に記録）。
2. **絶対 URI 一致チェックを維持し、起動時に Manifest 全体を作り直す（不採用）**:「保存時の container ==
   現在の container」という壊れやすい前提を temporary な workaround で先送りするだけで、次に container が
   変わった時に同じ症状が再発する。根本原因（絶対値を信用する設計）を直さない。
3. **file 名 allow-list による境界緩和 + Manifest 読込時の self-heal（採用）**: 境界チェックは file 名
   pattern という既存の安全な仕組みのままにし、絶対値を持ち回す全ての箇所（file store・Manifest・
   native load）を「現在の container から都度再解決する」設計へ統一する。Schema 変更が要らず、
   既存の壊れた Manifest も次回 load で自動的に治る。選択肢 1 ほど根本的ではないが、blocker を
   最小の変更面積で解消できる。

## Consequences

- **Good**: App の再インストール・Clean Build・更新で app-private data container の UUID が変わっても、
  DL 済み Model を owner が失わない。
- **Good**: 境界チェックの安全性は file 名 allow-list pattern（パス traversal 不可）のままで変わらず、
  絶対値比較という追加の脆さだけを除去する。
- **Good**: 既存の壊れた Manifest（stale な `privateUri` を持つもの）も、次回 `readManifest` で
  自動的に self-heal され、owner が手動で Manifest を触る必要が無い。
- **Bad**: `LocalModelFileStore` Port にメソッドが 1 つ増えるため、Port を実装する全ての箇所（native
  実装・test double）を同時に更新する必要がある。
- **Tradeoff**: self-heal の永続化が失敗した場合、in-memory の訂正結果だけで当該セッションを継続する。
  次回起動時に同じ self-heal が再実行されるため実害は無いが、永続化失敗そのものを検出して owner へ
  明示表示する仕組みはこの ADR の範囲外とする。

## References

- 関連コード: `src/local-agent/expo-model-file-store.native.ts`、`src/local-agent/model-lifecycle.ts`、
  `src/local-agent/container-relative-model-path.ts`
- 関連設計: [`docs/design/gguf-model-lifecycle.md`](../design/gguf-model-lifecycle.md)
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/152
- 関連 ADR: [ADR-0014](./0014-private-gguf-lifecycle-and-resource-guard.md)（private GGUF lifecycle・
  Resource Guard の元設計）、[ADR-0036](./0036-on-device-conversation-agent.md)、
  [ADR-0043](./0043-grounded-quote-bridge-and-local-llm-reenablement.md)（会話 Agent でのローカル LLM
  再有効化、本 ADR が解消する blocker の背景）

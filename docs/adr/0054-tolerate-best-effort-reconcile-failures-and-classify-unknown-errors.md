# ADR-0054: 削除直後の孤立 File 掃除失敗を致命的に扱わず、未分類 Error は UNKNOWN と表示する

- **Status**: Accepted。
- **Date**: 2026-07-28。
- **Deciders**: Susumu Tomita (@susumutomita)。

## Context

owner が TestFlight v1.1.1 の実機で、Settings の「オンデバイス AI を無効化して削除する」を
押した直後に「Local Model の処理を完了できませんでした（MANIFEST_READ_FAILED）」という
Error が表示される blocker を報告した。実際には削除自体は成功しており、しばらく待ってから
Settings を開き直す、またはアプリを再起動すると Model は既に削除済みで「オンデバイス AI を
有効化」の状態に戻っていた。

### コードから確認済みの原因

`model-lifecycle.ts` の `deleteModel` は以下の順で進む。

1. Model File を `{sha256}.deleting.gguf` へ stage する（`stageDeletion`）。
2. Manifest から参照を外して書き込む（`writeManifest`）。**この時点で削除は論理的に
   確定する**（真実の情報源である Manifest 上、既に Model は存在しない）。
3. staged File を最終削除する（`fileStore.finalizeStagedModelDeletion`）。ここが
   一時的な File 競合等で失敗しても、既存の設計どおり握りつぶし、in-memory の
   `manifest` キャッシュを `null` にして `true`（成功）を返す（次回 load で
   再掃除を試みる前提）。

問題は次の一手にあった。`deleteModel` 呼び出し元の `performDelete`
（`use-local-model-management.ts`）は成功直後に必ず `refresh()` を呼び、これが
`lifecycle.load()` → `ensureLoaded()` を実行する。`manifest` が `null` のため
`ensureLoaded` は `reconcilePrivateStore` を経由して `fileStore.reconcilePrivateFiles(...)`
を呼ぶが、これは手順 3. で消せなかった同じ staged File を再度掃除しようとし、
同じ一時的な条件下でまた失敗しうる。この関数の失敗は改修前、
`reconcilePrivateStore` が無条件に `MANIFEST_READ_FAILED` へ変換していたため、
**既に正しく完了した削除の直後に、真因の無い Error が表示される**。しかも
`refresh()` は `setManifest(loaded)` の前に例外を投げるため、React state は
削除前の古い Manifest のまま残り、UI は「まだ削除されていないように」見える。
再起動時は同じ一時的な競合が解消済みのため reconcile が成功し、削除済みの正しい状態が
ようやく反映される。これが owner の観測（「後で確認すると消えている」）と正確に一致する。

もう 1 つ、`mapOnDeviceAiErrorCode`（`trusted-model-enablement-controller.ts`）は
`TrustedModelAcquisitionError`・`ModelLifecycleError` のどちらでもない未知の Error を
デフォルトで `'MANIFEST_READ_FAILED'` へ fail-closed に倒していた。これは「本当に Manifest
読み取りが壊れた」場合と「分類できない未知の失敗」を同じ文字列で表示してしまい、
真因の切り分けを妨げる。今回の主因は上記の実在する `MANIFEST_READ_FAILED`
（fallback ではなく `reconcilePrivateStore` が意図して投げる本物のコード）だったが、
この fallback の設計自体も紛らわしく、独立した問題として合わせて直す。

## Decision

1. **`reconcilePrivateFiles` は best-effort（掃除の失敗を致命的に扱わない）契約に
   変更する。** `reconcilePrivateStore`（`model-lifecycle.ts`）はこの呼び出しの失敗を
   握りつぶし、`ensureLoaded()` 全体を失敗させない。`reconcilePrivateFiles` は
   2 つの整合作業をまとめて行う: (a) Manifest がもう参照しない孤立 File の掃除、
   (b) 逆にまだ参照されている Model の staged File（crash 等で削除の undo が
   完了しないまま残った状態）を最終位置へ復元する処理。(a) の失敗は次回の load で
   再び対象になるため安全（ストレージを永久に無駄にする経路にはならない）。
   (b) の復元に失敗した場合は「参照されているはずの Model の File が無い」状態が
   残りうるが、これは直後の `assertManifestFilesPresent`（参照済み Model 全件の
   存在・Size を独立に検証する）が正しく検出し、その場合は具体的な
   `MANIFEST_READ_FAILED` を投げる。したがってこの呼び出しの失敗は「読み込んだ
   Manifest・参照済み Model が信用できない」ことを意味せず、load 全体を失敗させる
   理由にならない。`LocalModelFileStore.reconcilePrivateFiles` の Port doc comment
   にこの契約を明記した。native adapter（`expo-model-file-store.native.ts`）側でも、
   1 件の File の掃除・復元失敗が他の File の処理を巻き込んで止めないよう、
   per-entry try/catch を追加した。bun test 経由では検証できない native-only
   file のため、コードレビューとこのインシデントの再現調査で担保する。
2. **`mapOnDeviceAiErrorCode` の未分類 fallback を `'MANIFEST_READ_FAILED'` から
   `'UNKNOWN'` へ変更する。** 型付きの `TrustedModelAcquisitionError` /
   `ModelLifecycleError` はそのままのコードを表示し続け（実際にそのコードで失敗した
   ことが分かっている場合は、真因調査に有用なため隠さない）、それ以外の未分類 failure
   だけを `UNKNOWN` として表示する。既存の汎用文言（`messages.ts` の `modelError`）は
   受け取ったコードをそのまま埋め込む形のため、`UNKNOWN` も追加のメッセージ分岐無しで
   そのまま表示できる。

## Consequences

- **Good**: 削除・Unload 等の Model 操作が実際には成功しているのに、直後の孤立 File
  掃除の一時的な失敗だけで真因の無い Error が表示される owner 実機の blocker が
  解消する。React state も削除直後に正しく更新される（`refresh()` が例外で
  止まらなくなるため）。
- **Good**: 未分類の Error が `MANIFEST_READ_FAILED` を騙らなくなり、実際に
  Manifest 読み取りが壊れた場合の `MANIFEST_READ_FAILED` 表示との区別が付く。
- **Bad**: `reconcilePrivateFiles` の失敗を握りつぶすことで、掃除できなかった
  孤立 File がすぐには消えず、次回 load まで private storage に残り続ける
 （ディスク使用量への影響は 1 Model 分の staged File が最大でも数百 MB〜1 GiB 級と
  限定的で、次回 load で必ず再掃除を試みるため恒久的なリークにはならない）。
- **Tradeoff**: native adapter（`expo-model-file-store.native.ts`）の per-entry
  try/catch は bun test の coverage 対象外（native module 依存のため）。検出は
  コードレビューとこのインシデント調査（コード読解 + シミュレーター確認）に委ねる。
  実機での「1 件の孤立 File が本当に恒久的に削除できない」ケース（ディスク破損等）は
  スコープ外とし、`inspectManagedModelFiles`/`purgeManagedFiles`（全データ削除の
  fail-safe purge）が既存の受け皿になる。

## References

- 関連コード: `src/local-agent/model-lifecycle.ts` の `deleteModel` / `ensureLoaded` /
  `reconcilePrivateStore`、`src/local-agent/expo-model-file-store.native.ts` の
  `reconcilePrivateFiles`、`src/app/trusted-model-enablement-controller.ts` の
  `mapOnDeviceAiErrorCode`。
- 関連 Issue: owner フィードバック（TestFlight v1.1.1、Settings 削除直後の
  MANIFEST_READ_FAILED 誤表示）。
- 関連 follow-up: シミュレーター上で会話例生成のターン 3 以降が無限ハングする事象。
  `.claude/state/follow-ups.jsonl` に記録済み、本 ADR の主題とは別件で調査未着手。

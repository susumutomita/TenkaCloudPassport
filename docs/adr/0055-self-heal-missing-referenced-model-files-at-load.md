# ADR-0055: 参照済み Model の final File 欠落・Size 不一致を、load 時に fail-hard から self-heal へ変える

- **Status**: Accepted。
- **Date**: 2026-07-28。
- **Deciders**: Susumu Tomita (@susumutomita)。

## Context

owner が TestFlight v1.1.2 の実機で「Local Model をダウンロードしたら Manifest
error になる」という blocker を報告した。コードから確認できる原因は 1 つで、
新しい機構ではなく既存バグの残骸である。

v1.1.1 には削除処理中の `File.move` の uri 付け替えによる誤 throw があり
（PR #178 で修正済み）、この不具合が実機に残した状態は「Manifest はモデルを
参照したまま、実体は `${sha256}.deleting.gguf` に取り残し（または消失）」
だった。現行の `ensureLoaded`（`model-lifecycle.ts`）は次の順で進む。

1. `readManifest`: Manifest を parse し、`privateUri` を container-relative に
   self-heal する（ADR-0045）。
2. `reconcilePrivateStore`: 孤立 File の掃除と、staged File（`.deleting.gguf`）
   の復元を best-effort で試みる（ADR-0054）。staged File が既に無い、または
   復元自体が失敗した場合は何もできずに次へ進む。
3. `assertManifestFilesPresent`: 参照済み Model 全件について
   `fileStore.modelFileInfo(model.privateUri)` を呼び、`!exists` または
   `sizeBytes` 不一致なら即座に `MANIFEST_READ_FAILED` を投げて `load` 全体を
   失敗させていた（fail-hard）。

owner が踏んだ経路は 3. である。v1.1.1 の削除バグで staged File が復元されない
まま残った（または消失した）Model が Manifest に参照されたままになっており、
2. の復元が効かない（staged が無い、または復元が失敗している）ため、3. が
必ず `MANIFEST_READ_FAILED` を投げる。この Error は `ensureLoaded` の入口で
発生するため、`load`・`assessImportCandidate`・`importCandidate`・`activate`
など全ての操作の冒頭で再現する。つまり一度この状態に入ると、新しい Model を
DL・import しようとしても、その import 処理自体が最初の `ensureLoaded` 呼び
出しで同じ Error を返し、恒久的にブリックする。owner の「DL したら Manifest
error」という報告はまさにこれで、DL 自体は成功していても、DL 後の import
フローが `ensureLoaded` を経由するため同じ壁に当たる。

## Decision

### `assertManifestFilesPresent`（fail-hard）を self-heal 関数に置き換える

`reconcilePrivateStore` の直後に呼ぶ新しい関数は、参照済み Model ごとに
`modelFileInfo` の結果を次の 3 通りに分けて扱う。

1. **`modelFileInfo` が例外を投げる**（transient な FS error 等）: 「壊れて
   いる」という積極的な証拠が無いため、self-heal の対象にしない。保存済みの
   Model をそのまま維持し、判断を保留する。これは ADR-0045 の
   `selfHealManagedPrivateUris` が `resolveManagedModelUri` の失敗時に
   保存済みの `privateUri` へフォールバックし、以降の integrity 検証に
   委ねる設計と同じ理由付けである。「情報が取得できないこと」を「File が
   壊れていること」の証拠として扱うと、一時的な FS 障害だけで正常な
   Model を Manifest から永久に消してしまう別の bug を生む。
2. **`!info.exists`（final File が無い）**: 積極的な証拠がある。当該 Model を
   `models` から除去する。
3. **`info.sizeBytes !== model.sizeBytes`（Size 不一致、部分書き等）**: 同様に
   積極的な証拠があるため除去する。

除去された Model は `benchmarkReports` からも同じ `sha256` の Report を全て
除去する。`activeModelSha256` が除去対象を指していれば `null` にする。1 件
以上除去した場合、訂正済み Manifest の永続化を試みる（`atomicWriteManifest`）
が、失敗しても in-memory の訂正結果をそのまま返して `load` は成功させる
（ADR-0045 と同じ best-effort tolerance。次回の書き込み成功時に再度 self-heal
が実行されるため、この 1 回の永続化失敗で修復結果を捨てる理由が無い）。

fail-closed を維持するのは Manifest 自体が parse 不能な場合
（`parseLocalModelManifest` が拒否する JSON、`parseManifestText` の既存経路）
だけである。個々の参照済み Model の File 欠落・Size 不一致は、Manifest
自体は正しく読めている以上、その Model 1 件だけの問題として扱い、Manifest
全体・load 全体を道連れにしない。

### `ensureLoaded` の呼び出し順

`readManifest`（parse + privateUri self-heal） → `reconcilePrivateStore`
（staged File の best-effort 復元） → 新 self-heal 関数（final File 欠落・
Size 不一致の除去） → `verifyActiveModelAtLoad`（現在の Resource Risk 再評価）
の順を維持する。2. で staged File が復元できれば 3. の時点では File が
存在するため除去されず、参照は維持される。2. が効かなかった場合だけ 3. が
除去する。

## 選択肢

1. **fail-hard を維持し、Settings に「壊れた Model を検出しました。削除して
   ください」という手動リカバリ導線を追加する（不採用）**: owner が実機で
   既に踏んだとおり、fail-hard の間は Settings 自体の他の操作（新規 import
   含む）も `ensureLoaded` 経由で全滅するため、手動リカバリ導線を出す前段の
   画面自体が開けない。ADR-0045・ADR-0054 で既に確立した「load 時
   self-heal」の設計思想（app-private container UUID の陳腐化、staged File
   の取りこぼしを load 時に自動修復する）と一貫しない。
2. **`modelFileInfo` の例外も self-heal 対象にする（不採用、advisor 指摘）**:
   「fail-closed の対象は Manifest の parse 不能のみ」という単純な二分法には
   合うが、一時的な FS 障害と「File が実際に無い」を同じ扱いにすると、
   flaky な I/O だけで正常な 1 GiB 級 Model を Manifest から失う経路を新設
   することになる。この関数は `ensureLoaded` の毎回の入口で呼ばれるため、
   1 回の transient failure が致命的になる。ADR-0045 の前例（情報が取れない
   ときは保存値へフォールバックし、以降の integrity 検証に委ねる）と矛盾する
   ため見送る。
3. **参照済み Model の final File 欠落・Size 不一致だけを self-heal 対象にし、
   File 情報取得自体の失敗は保留する（採用）**: 「積極的な証拠がある場合だけ
   除去する」という一貫した基準を持ち、owner が実際に踏んだ v1.1.1 削除バグ
   残骸（final 消失・Size 不一致）を確実に解消しつつ、transient failure に
   よる誤除去のリスクを追加しない。

## Consequences

- **Good**: v1.1.1 の削除バグが実機に残した「参照はあるが実体が無い」状態が、
  次回の load で自動的に治る。Settings は「オンデバイス AI を有効化」の
  初期状態に戻り、新規 DL・import が制限なく行える。owner が手動で Manifest
  や private storage を触る必要が無い。
- **Good**: Manifest の parse 不能だけを fail-closed に残すことで、
  「本当に読み取り不能」な場合との区別が付く（`MANIFEST_READ_FAILED` は
  引き続きこのケースだけを意味する）。
- **Bad**: 除去された Model の import 履歴（`importedAt`・`metadata`・
  `risk`・関連 Report）は復元不能に失われる。owner は再度 DL・import が
  必要になるが、そもそも File 自体が失われている以上、再取得以外の選択肢は
  無い。
- **Tradeoff**: `modelFileInfo` が例外を投げる（transient failure）ケースは
  今回 self-heal の対象にしない。これにより、真に恒久的な障害（例: private
  storage 自体の破損）でも `modelFileInfo` が例外を投げ続ける限り fail-hard
  のままになりうるが、これは既存の `SOURCE_UNREADABLE`・`DELETE_FAILED` 系の
  fail-safe purge（`inspectManagedModelFiles`/`purgeManagedFiles`）が受け皿
  になる既存の設計判断（ADR-0054 の Tradeoff と同じ整理）であり、本 ADR の
  範囲外とする。

## References

- 関連コード: `src/local-agent/model-lifecycle.ts` の `ensureLoaded` /
  `assertManifestFilesPresent`（旧 fail-hard 関数） / `reconcilePrivateStore`。
- 関連 Issue: owner フィードバック（TestFlight v1.1.2、DL 後の Manifest
  error）。
- 関連 ADR: [ADR-0045](./0045-container-relative-model-resolution.md)
  （`selfHealManagedPrivateUris` の self-heal 前例と、情報が取れないときの
  フォールバック方針）、
  [ADR-0054](./0054-tolerate-best-effort-reconcile-failures-and-classify-unknown-errors.md)
  （`reconcilePrivateFiles` の best-effort 契約、v1.1.1 の削除バグそのものの
  修正）。

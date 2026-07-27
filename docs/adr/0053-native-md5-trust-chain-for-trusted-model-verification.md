# ADR-0053: 信頼済みダウンロードの取り込み検証をネイティブ MD5 + Size + GGUF 検査へ置き換える

- **Status**: Accepted。
- **Date**: 2026-07-27。
- **Deciders**: Susumu Tomita (@susumutomita)。

## Context

owner が TestFlight v1.1.0 の実機で、信頼済み Model（Qwen2.5-1.5B-Instruct Q4_K_M、1.04 GiB）の
ダウンロードが 100％ に達した後、完了扱いにならず固まって見える blocker を観測した。

### コードから確認済みの原因（3 箇所）

信頼済みダウンロードの経路には、純 TypeScript SHA-256（`src/local-agent/sha256.ts`、Hermes 上で
1 GiB 級 File に数分〜十数分かかる）による全量計算が **3 回** 存在していた（3 番目は
security-review subagent によるレビューで追加発見した。下記「取り込み直後の activate 時」）。

1. **取得（acquisition）時**: `src/local-agent/trusted-model-download.ts` の
   `acquireTrustedModel` が、ダウンロード完了直後に
   `downloadPort.sha256OfFile(result.uri)`（`expo-trusted-model-download.native.ts` の実装は
   `sha256HexFromSource` を呼ぶ）で `Paths.cache` 上のダウンロード結果を検証していた。この
   呼び出しは `enableOnDeviceAi` の `onDownloadComplete`（ADR-0046 で仕上げフェーズへの遷移点に
   した callback）より **前** に実行されるため、この間 UI は `'downloading'` 表示のまま
  （「ダウンロード中 100％」）で数分〜十数分固まる。これはまさに
   `trusted-model-enablement-controller.test.ts` に既存する
 「Issue 138（実機 blocker A、DL 完了後フリーズ）」と同一の症状クラスである。
2. **取り込み（import）時**: `src/local-agent/model-lifecycle.ts` の `runImport` が
   `digestPrivateFile`（`openSha256Source` 経由の純 TypeScript SHA-256）で private storage へ
   copy した File を再検証し、その結果を Model の identity（`${sha256}.gguf`）としても使う。
   この呼び出しは `'finalizing'` 表示（ADR-0046 で Cancel 非表示にした区間）の中で起きる。
3. **取り込み直後の activate 時**: `enableOnDeviceAi`（`trusted-model-enablement-controller.ts`）は
   import 完了後、間を置かず `performLocalModelActivation`（`assessActivation` → `activate`）を
   呼ぶ。`activate`・`assessActivation` はどちらも内部で `assess(sha256)` を呼び、`assess` は
   `assertModelIntegrity` を無条件に呼ぶ。`assertModelIntegrity` は元々
   （`trustedVerification` の有無を考慮せず）常に `digestPrivateFile` で純 TypeScript SHA-256
   全量計算していた。つまり上記 1・2 を高速化しても、import 完了の直後・同じユーザー操作
  （オンデバイス AI を有効化する）の中で、同じ File に対してもう一度フル hash が走り、
  「検証しています」と表示する区間（下記 Decision 5.）が実際には「数秒で完了」しない状態が
   残っていた。security-review subagent が「`assertModelIntegrity` の無条件フル SHA-256 が
   バックストップとして機能している」という指摘をした際に、この副作用が発覚した。

`trusted-model-catalog.ts` の `TrustedModelSource` は既に pinned `sha256`（Hugging Face の
`resolve/main/...` から一次情報で確認済み）を持つ。ダウンロードした File がこの pinned 値と
一致することさえ確認できれば、digest を再計算する目的（内容の同一性確認・identity 決定）は
どちらも満たせる。

## Decision

`expo-file-system/legacy` の `getInfoAsync(uri, { md5: true })`（ネイティブ計算、1 GiB 級 File
でも数秒）を使い、信頼済みダウンロードの検証を 3 箇所とも次の方式へ置き換える。

1. **`TrustedModelSource` に `md5` フィールドを追加する**（`trusted-model-catalog.ts`）。
   値は `8e5111fdbc5c150920d368ff802c4b5a`。由来: 呼び出し元が 2026-07-27 に catalog の
   `url`（公式配布 URL）から取得した File で、pinned `sha256`（`6a1a2eb6...`）と `sizeBytes`
  （`1,117,320,736`）の一致を確認した上で `md5 -q` により採取した。sha256 の信頼チェインに
   連結された参照値であり、独立した信頼の根拠ではない（sha256 自体は一次情報で確認済み）。
2. **取得時（`acquireTrustedModel`）**: `TrustedModelDownloadPort.sha256OfFile` を
   `md5OfFile` へ置き換え、`source.md5` との一致を検証する。native 実装
 （`expo-trusted-model-download.native.ts`）は `getInfoAsync` を使う。fail-closed の契約
 （不一致・計算失敗はダウンロード結果を消して `INTEGRITY_MISMATCH`/`DOWNLOAD_FAILED`）は
   変更しない。
3. **取り込み時（`model-lifecycle.ts` の `runImport`）**: `importCandidate` に第 3 引数
   `trustedVerification?: TrustedImportVerification`（`{ sha256, md5, onVerifying? }`）を
   追加する。渡された場合、`digestPrivateFile`（純 TypeScript SHA-256）の代わりに
   `LocalModelFileStore.md5OfFile(privateUri)`（native、`getInfoAsync` 経由）で
   `.incoming.gguf` の MD5 を `verification.md5` と照合し、一致すれば `verification.sha256`
 （catalog の pinned 値）を **デバイスで再計算せず** そのまま identity として使う。
   sizeBytes の厳密一致は既存の `copyAndVerifyIncoming`（copy 完了後の `incomingFileInfo()` 検証）。
   がそのまま担う。GGUF metadata 検査（`inspector.inspect`）も既存の `inspectIncomingModel` を
   変更せず使う。したがって「(a) ネイティブ MD5、(b) sizeBytes 厳密一致、(c) GGUF metadata 検査」
   の 3 点で取り込みを検証する。
4. **取り込み直後の activate 時（`model-lifecycle.ts` の `assess`／`assertModelIntegrity`、
   security-review 指摘を受けた追補）**: `LocalModelLifecycleDependencies` に
   `trustedModelMd5For?: (sha256: string) => string | null` を追加する。`assertModelIntegrity`
   は、Size 一致確認の後この lookup を呼び、対象 `sha256` に対して非 null な値が返れば
   `fileStore.md5OfFile(model.privateUri)` によるネイティブ MD5 照合だけを行い（不一致・計算
   失敗はどちらも fail-closed で `MODEL_INTEGRITY_FAILED`／`SOURCE_UNREADABLE`）、
   `digestPrivateFile` は呼ばない。lookup が `null` を返す場合（手動 GGUF import、または
   catalog に無い sha256）は既存どおり `digestPrivateFile` にフォールバックする。native 実装
  （`default-local-model-management.native.ts`）は `TRUSTED_MODEL_CATALOG` から
   `sha256 → md5` を引く関数を渡す。`LocalModelFileStore.md5OfIncomingFile()` は
   `md5OfFile(privateUri: string)` へ一般化し、import 時の `.incoming.gguf` と activate 時の
   確定済み managed File の両方から同じ Method 経由で呼べるようにした
  （native adapter は両方とも `readableManagedFile` で解決するため、ADR-0045 の container
   UUID 差し替えにも自己修復する）。
5. **手動 GGUF import（Document Picker 経由）は変更しない**。`trustedVerification` を渡さない
   ため、従来どおり `digestPrivateFile`（純 TypeScript SHA-256）で identity を導出する。catalog
   参照が無い任意の File を扱う経路であり、pinned な参照値を持たないため。activate 時も
   `trustedModelMd5For` の lookup が対象外の sha256 には `null` を返すため、上記 4. の速い経路には
   乗らず既存の全量計算のままになる。
6. **検証中の UI**: `onDeviceAiFlow` に `'verifying'` を追加する（`'finalizing'`＝copy 中、
   `'verifying'`＝ネイティブ MD5 照合中、いずれも Cancel 導線は出さない）。
   `messages.ts` に `onDeviceAiVerifyingStatus`（ja/en）を追加し、「検証しています」と
   明示する。

### 信頼チェインの考え方（訂正版、code-reviewer 指摘 high）

当初案では「md5 は sha256 が一次情報で確認済みであることを前提にした参照値であり、identity
（sha256）は catalog の pinned 値のまま変わらないため、攻撃者が md5 を偽装しても identity を
騙る動機がない」と主張していたが、これは誤りである。code-reviewer 指摘のとおり、デバイス上で
sha256 を再計算しなくなった結果、**pinned sha256 は `${sha256}.gguf` というファイル名ラベルに
過ぎず、オンデバイス LLM ランタイムへ実際にロードされるバイト列を検証するゲートは MD5
だけになった**。したがって「identity は sha256 のままだから安全」という結論は成立しない。
MD5 は preimage 攻撃には強いが chosen-prefix 衝突は実務的に可能であり、GGUF のテンソル領域には
衝突用のブロックを仕込む余地が十分にある。

実際に本 ADR が受け入れているリスクは次のとおりである。

- **守れているもの**: 転送中の偶発的な破損（部分書き込み・ビット反転・切断）。ネイティブ MD5 は
  これを高速かつ確実に検出する。これは元の chunked SHA-256 が守っていたものと同等である。
- **守れなくなったもの**: 配布元（Hugging Face の `resolve/main/...` URL）が指す実体そのものが
  意図的に差し替えられ、かつ差し替え後の File が catalog の pinned MD5 と衝突するよう
  chosen-prefix 攻撃で細工されていた場合、この設計は検出できない。旧設計（取り込み時に
  device 上で sha256 を再計算し、その値を identity として使う）であれば、この攻撃は sha256 の
  preimage 耐性（MD5 よりはるかに強い）に阻まれていた。
- **この脅威の実際の bar**: 通常の受動的なネットワーク攻撃者（MITM）は HTTPS により排除される。
  残るのは「Hugging Face 上の当該 File 自体が差し替えられる」という、配布元そのものの
  compromise（サプライチェイン攻撃）であり、これは owner が catalog の値を一次情報から
  手作業で確認する運用（`source`・`sha256`・`md5` それぞれの由来コメント）と同じ信頼境界に
  依存している。`url` が `resolve/main/...`（ブランチ相対、可変）であるため、owner が
  値を確認した時点（sha256: 2026-07-23、md5: 2026-07-27）以降にホスト側で File が
  差し替えられても、この設計はそれを検出できない。
- **`assertModelIntegrity` の全量 SHA-256 は「バックストップ」ではない**: security-review の
  初回レビュー時点では、Decision 4. 未実装のため `assertModelIntegrity` が import 直後の
  activate で無条件にフル SHA-256 を再計算しており、これが（性能を犠牲にした）追加の
  検証として働いていた。Decision 4. の実装により、信頼済み Model の activate はこのフル
  SHA-256 を呼ばなくなったため、この「バックストップ」は信頼済み経路には存在しない。
  上記のリスク評価（MD5 の chosen-prefix 衝突耐性の弱さ）はこの変更を織り込んだ上で成立する
  （手動 GGUF import の activate だけは既存どおりフル SHA-256 を維持する）。
- **軽減策（未実装、follow-up）**: `url` を `resolve/<commit>/...` のような immutable な
  revision へ固定すれば、URL が指す内容自体が変わらなくなり、上記の脅威をほぼ無償で塞げる
 （性能面の利点はそのまま）。本 ADR の scope ではこの変更をしない（immutable revision の
  実際の commit を一次情報で確認する追加作業が必要なため）。follow-up として記録した
（`.claude/state/follow-ups.jsonl`、下記 Consequences 参照）。

## 選択肢

1. **取得時・取り込み時のどちらか一方だけを高速化する（不採用）**: 取り込み時だけを
   直しても、取得時の `sha256OfFile` が数分〜十数分かかったままでは「DL 100％ 後に固まる」
   症状（Issue 138 と同一の再発）が残る。取得時だけを直しても、取り込み時の
   `digestPrivateFile` は copy 後の File を再検証するため、こちらも 1 GiB 級で長時間かかる
   ことに変わりはない。両方を直す必要がある。
2. **取得時の検証を丸ごと廃止し、取り込み時の 1 回だけ検証する（不採用）**: 取得直後の
   sizeBytes 一致チェックだけに縮小し、内容検証は copy 後の 1 回に一本化する案も検討した。
   copy 前に内容が壊れていることを検出できず、無駄な copy（1 GiB の I/O）を行ってから
   初めて失敗が分かる点で、取得時の検証にも独立した価値がある（fail fast）。ネイティブ MD5 は
   数秒で終わるため、2 回検証するコストは無視できるほど小さい。両方で検証する設計を採用した。
3. **ネイティブ MD5 + Size + GGUF 検査の 3 点照合を取得時・取り込み時の両方に適用する
   （採用）**:「1GiB を舐める純 TypeScript 計算」という遅い処理を、同じ File に対する
   ネイティブ計算（数秒）に置き換える。ただし code-reviewer 指摘（high）のとおり、これは
  「検証の意味を変えない」わけではなく、identity（sha256）を再計算しなくなった分だけ
   実際のバイト列検証は MD5 だけに縮小される、性能とのトレードオフである（上記「信頼チェインの
   考え方」参照）。
4. **`url` を immutable revision（`resolve/<commit>/...`）へ固定した上で MD5 化する
   （不採用、follow-up として記録）**: 配布元の意図的な差し替えという脅威そのものを塞げる、
   より優れた選択肢である。本 ADR の scope では採用しない。理由は実際の immutable commit を
   一次情報で確認する追加作業が必要で、本 PR（実機 blocker 3 件の修正）のスコープを超えるため。
   follow-up として記録し、別 PR で catalog の URL 固定と合わせて対応する。

## Consequences

- **Good**: 信頼済み Model のダウンロード完了後、検証（取得時の MD5 照合＋取り込み時の MD5
  照合＋取り込み直後の activate 時の MD5 照合）が数秒で終わる。「DL 100％ 後に完了しない」
  公開 blocker が解消する。当初 Decision 1〜3（取得時・取り込み時）だけを実装した時点では、
  `enableOnDeviceAi` が import 直後に呼ぶ activate がフル SHA-256 へ無条件フォールバック
  したままで、この blocker が同じ操作の中で再発する状態だった（Decision 4 で修正）。
- **Good**: identity（sha256）は catalog の pinned 値をそのまま使うため、デバイス上での
  SHA-256 全量計算は信頼済みダウンロードの経路（取得・取り込み・取り込み直後の activate の
  すべて）から無くなる。手動 GGUF import 経由で取り込まれた Model の activate（Decision 5.）
  や、再起動後の再 activate は対象外で、既存どおり `digestPrivateFile` を使う。
- **Good**: 手動 GGUF import（Document Picker 経由）は変更せず、既存の chunked SHA-256
  検証をそのまま維持する（catalog 参照が無い任意の File を扱うため、pinned 値による
  近道が使えない）。
- **Bad（code-reviewer 指摘 high、訂正済み）**: pinned sha256 は取り込み後は再計算されない
  ファイル名ラベルであり、実際にロードされるバイト列の検証ゲートは MD5 だけになった。MD5 の
  chosen-prefix 衝突耐性の弱さにより、配布元（Hugging Face の当該 URL）そのものが意図的に
  差し替えられ、かつ差し替え後の File が pinned MD5 と衝突するよう細工されていた場合、この
  設計は検出できない（旧設計の sha256 再計算はこの攻撃を preimage 耐性で防げていた）。この
  リスクは「転送中の偶発的破損は検出できる・配布元の意図的な差し替えは検出できない」という
  性能とのトレードオフとして意図的に受け入れる（上記「信頼チェインの考え方」参照）。
- **Bad / Follow-up**: 上記リスクを実質的に塞ぐ `url` の immutable revision 固定
 （`resolve/main/...` → `resolve/<commit>/...`）は本 ADR の scope に含めない。実際の
  immutable commit を一次情報で確認する作業が別途必要なため、follow-up として記録し別 PR で
  扱う。
- **Tradeoff**: catalog に `md5` を追加したことで、将来 catalog へ新しい Model を追加する際は
  `sha256` に加えて `md5` の採取（`md5 -q`）も owner の手作業に必要になる。既存の
  `source`（一次情報 URL）フィールドと同様、コメントに由来を明記する運用を踏襲する。
- **Bad / follow-up（`/simplify` altitude 指摘・code-reviewer 指摘、F-DG22OH）**:
  `trustedModelMd5For` は `assess()`/`activate()` が呼ばれるたびに
  `TRUSTED_MODEL_CATALOG` から `sha256 → md5` を都度引き直す（Decision 4.）。import
  時は `trustedVerification.md5`（`enableOnDeviceAi` 呼び出し時点の catalog 値）と
  比較するのに対し、activate 時は「その時点の」catalog 値と比較する、という 2 つの
  独立した経路になっている。将来 catalog の pinned `md5` を訂正・ローテーションした
  場合、過去に正しく import・検証済みの Model が activate 時に突然
  `MODEL_INTEGRITY_FAILED` になりうる。`ImportedLocalModel` への `trustedMd5`
  永続化（manifest schema 変更コスト大）ではなくこの DI lookup 方式を採用したのは
  advisor 相談の上での判断だが、catalog 更新時の互換性は未検証のため follow-up
  として記録した。
- **Bad / follow-up（`/simplify` efficiency 指摘、F-ZUOFZG）**: `enableOnDeviceAi`
  は import 完了直後に `assessActivation`・`activate` を連続呼び出しし、どちらも
  内部で `assess()`（＝ネイティブ MD5 照合）を呼ぶ（この 2 重呼び出し自体は
  ADR-0053 以前からの既存 lifecycle 契約で本 ADR が新規導入したものではない）。
  信頼済みダウンロード経由の import ではこれに import 時の 1 回を加え、最大 3 回
  同じ File のネイティブ MD5 を計算する。1 回あたり数秒でも 3 回連続では
  「検証しています」表示が謳う待ち時間の見積もりがやや不正確になりうる（この間
  UI は `'verifying'` のまま表示は維持されるため無音のハングではない）。根本の
  `assessActivation`/`activate` の重複 `assess()` 呼び出しは手動 GGUF import
  経路にも影響する pre-existing の設計であり、本 ADR の scope 外として follow-up
  に記録した。

## References

- 関連コード: `src/local-agent/trusted-model-catalog.ts`、
  `src/local-agent/trusted-model-download.ts`、
  `src/local-agent/expo-trusted-model-download.native.ts`、
  `src/local-agent/model-lifecycle.ts`（`TrustedImportVerification`・`verifyTrustedIncoming`・
  `LocalModelLifecycleDependencies.trustedModelMd5For`・`assertModelIntegrity`・
  `assertNativeMd5`）、
  `src/local-agent/native-md5.native.ts`（`/simplify` 指摘で一本化した
  `getInfoAsync(uri, { md5: true })` 呼び出しの共有 helper）、
  `src/local-agent/expo-model-file-store.native.ts`（`md5OfFile`）、
  `src/app/default-local-model-management.native.ts`（`trustedModelMd5For` の native 実配線）
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/152
- 関連 ADR: [ADR-0046](./0046-trusted-model-finalize-phase-survives-navigation.md)、
  [ADR-0047](./0047-load-time-size-check-instead-of-digest.md)（起動時検証を Size 照合へ
  変更した先例、同種の「重い純 TypeScript SHA-256 を廃止する」判断）、
  [ADR-0052](./0052-app-scoped-trusted-model-download-with-background-resume.md)
 （同じ Issue 152 系列、ダウンロードフェーズの中断・再開）
- 関連設計: [`docs/design/2026-07-23-on-device-conversation-agent.md`](../design/2026-07-23-on-device-conversation-agent.md)

# ADR-0046: 信頼済み Model 取得の仕上げフェーズを画面遷移から独立させる

- **Status**: Accepted
- **Date**: 2026-07-26
- **Deciders**: Susumu Tomita (@susumutomita)

## Context

owner の iOS Simulator（実機相当の Development Build）で、信頼済みモデル（Qwen2.5-1.5B-Instruct
Q4_K_M、1.04GiB）の取得が次の状態で止まった。

- `Documents/local-models/` に `.incoming.gguf`（DL 完了サイズと一致）だけが残り、
  `manifest.v1.json` が無い（import が `writeManifest` まで到達していない）。
- UI は「ダウンロード中: 1.04 GiB / 1.04 GiB (100％)」＋「ダウンロードを中止する」を
  表示したまま固まっていた。

`enableOnDeviceAi`（`src/app/trusted-model-enablement-controller.ts`）は
「ダウンロード（`acquireTrustedModel`）→ import（private storage へ copy + SHA-256
照合 + GGUF 検証 + manifest 書き込み、`model-lifecycle.ts` の `runImport`）→
activate」を 1 つの `AbortSignal` で連結していた。呼び出し側の
`use-local-model-management.ts` は、この signal の `AbortController` を
`trustedModelControllerRef` に保持し、(1) 明示 Cancel ボタン
（`cancelOnDeviceAiDownload`）、(2) component unmount 時の cleanup effect
（`trustedModelControllerRef.current?.abort()`）、(3) 全データ削除後の
`invalidateAfterExternalPurge` の 3 経路すべてから `.abort()` を呼べる状態にしていた。

UI 状態（`onDeviceAiFlow`）が `'downloading'`（Cancel 導線あり）から
`'finalizing'`（`messages.ts` の `onDeviceAiFinalizingStatus`、Cancel 導線なし）へ
切り替わるタイミングは、旧実装では `activate` 直前（`onBeforeActivation` callback）だった。
つまり import 本体（copy・SHA-256 照合・GGUF metadata 検証・manifest 書き込み、1 GiB 級の
File で実時間がかかる）は、ダウンロード完了後も丸ごと `'downloading'` 状態のまま進行した。
Cancel ボタンは表示され続け、signal も実際に abort 可能なままだった。

この期間中（unmount・Cancel・全データ削除のいずれか）に abort が 1 度でも呼ばれると、
`model-lifecycle.ts` の `assertImportNotCancelled` が `IMPORT_CANCELLED` を投げる。
`runImport` の catch 節は `.incoming.gguf` を削除しようと試みるが、manifest はまだ
書かれておらず import 自体は失敗として扱われる。実機で観測した「`.incoming.gguf` は
残るが manifest が無い」状態は、この import 中断の最中（`deleteIncomingQuietly` の
削除試行前後、または呼び出し元 Promise チェインが実行を続けられない状況）に起きたと
考えられる。

## Decision

`enableOnDeviceAi` の内部で、ダウンロードフェーズと仕上げフェーズを、
signal のスコープそのもので分離する。

1. **ダウンロードフェーズ**（`acquireTrustedModel`）: 従来どおり呼び出し元の
   `AbortSignal` を渡す。Cancel ボタン・unmount のどちらで abort しても、
   このフェーズの間は中止が有効に効く（変更なし）。
2. **仕上げフェーズ**（import の copy・SHA-256 照合・GGUF 検証・manifest 書き込み、
   および activate）: `acquireTrustedModel` が成功した直後、`importCandidate` を
   呼ぶ**前**に新しい `onDownloadComplete` callback を呼ぶ。この callback 以降、
   `enableOnDeviceAi` は呼び出し元の `AbortSignal` を一切 import/activate へ渡さない
  （`importLocalModelCandidate` へ `signal` を渡さず呼ぶ）。つまりこの時点から
   関数の内部実装として構造的に中断不能になる。

`use-local-model-management.ts` はこの `onDownloadComplete` を使って (a)
`trustedModelControllerRef.current` を（同一 controller であることを確認した上で `null`
にし）、(b) `onDeviceAiFlow` を `'finalizing'` にする。ref を早期に `null` にすることで、
Cancel ボタン・unmount cleanup・`invalidateAfterExternalPurge` のどの経路が `.abort()`
を呼んでも呼び出し先が無くなる（二重の安全策で、`enableOnDeviceAi` 自体が signal を
使わなくなっているため、万一 ref の nil 化より前に `.abort()` が呼ばれても動作に
影響しない）。

`SettingsScreen.tsx` の `OnDeviceAiSection` は `onDeviceAiFlow === 'finalizing'` の
とき既に Cancel 非表示・`onDeviceAiFinalizingStatus`（「ダウンロード完了。端末内で
仕上げの処理をしています（この処理は中止できません）」）を表示する分岐を持っていた
（Cancel の実効性を扱った以前の code-reviewer 指摘由来）。今回の bug はこの分岐の
「見た目」ではなく「切り替わるタイミング」だったため、UI 側のコード変更は不要で、
`messages.ts` に新しい i18n key も追加しない。

### 状態機械

```
idle -> consent-pending -> downloading（cancellable、生きた AbortController）
     -> finalizing（import 本体 + activate、signal 無し・構造的に中断不能）
     -> idle（結果: active / imported-not-active / caution 確認待ち / error）
```

## 選択肢

1. **`operationLaneRef.dispose()` や unmount effect 自体を、このフラグが立っている
   間はスキップする（不採用）**:「このフラグが立っている」判定を
   `use-local-model-management.ts` 側の React state に持たせる必要があり、
   unmount effect は依存配列 `[]` で 1 回しか定義されないため、最新の
   フラグを読むには ref 経由の間接参照が要る。ref の読み違い・タイミング競合の
   リスクが増える割に、「そもそも abort を意味あるものにしない」より弱い。
2. **`trustedModelControllerRef` を never-abort な `AbortController` に差し替える
   （不採用）**: ref の中身を保つ設計だと、どこかの経路がこの ref を経由せず
   直接 `controller.abort()` を呼んだ場合に守れない。関数境界（`enableOnDeviceAi`
   が signal を使わなくなる）で保証する方が、呼び出し元の実装ミスに対しても頑健。
3. **`enableOnDeviceAi` 内部で仕上げフェーズに入ったら signal を使わない（採用）**:
   関数自身の契約として「この時点から中断できない」ことを保証するため、
   呼び出し元の ref 管理が仮に何かの理由で漏れても安全側に倒れる。
   `trusted-model-enablement-controller.test.ts` の既存流儀（Mock を使わず
   実行時挙動を確認する Fake）でそのまま検証できる。

## Consequences

- **Good**: 仕上げフェーズ（1 GiB 級 File の copy・SHA-256 照合・GGUF
  検証・manifest 書き込み）は、画面遷移や Settings の unmount・全データ削除の
  どれが起きても中断されない。`.incoming.gguf` が孤立し manifest が書かれない
  という実機症状の再発を防ぐ。
- **Good**: Cancel ボタンが「実際には効かない」期間に表示され続ける問題（2 回目の
  code-reviewer 指摘が activate 単独では直したが import 本体は直っていなかった）も
  同時に解消する。ダウンロード完了の瞬間に Cancel が消え、仕上げ専用メッセージへ
  切り替わる。
- **Bad / Follow-up**: 本 ADR は「仕上げが中断されない」ことだけを保証し、
  それ以前の版で既に孤立した `.incoming.gguf` から再開する最適化（sha256 が
  一致すれば再ダウンロードせず検証・import から再開する）は含まない。孤立した
  `.incoming.gguf` は次回 `load()`（`reconcilePrivateFiles`）または次回 import の
  `deleteIncomingQuietly` が必ず削除するため、storage 破損・manifest 不整合の
  リスクは無いが、owner は 1.04 GiB の再ダウンロードを再度待つ必要がある。
  この最適化は follow-up F-GJDNGT（`.claude/state/follow-ups.jsonl`）として
  記録済みで、別 PR で扱う。
- **Tradeoff**: 手動 GGUF import（file picker 経由、`performImport`/`cancelImport`）の
  Cancel 導線は本 ADR の対象外で変更しない。あちらは import 全体を通じて
  Cancel が有効であることが既存の製品要件であり、「ダウンロード完了後は中断不能」
  という区分が無い。`local-model-management-controller.ts` の
  `ImportLocalModelCandidateInput.signal` を optional にした変更は、その手動
  import 経路の挙動（常に signal を渡す）を変えない。

## References

- 関連コード: `src/app/trusted-model-enablement-controller.ts`、
  `src/app/use-local-model-management.ts`、
  `src/app/local-model-management-controller.ts`、
  `src/local-agent/model-lifecycle.ts`（`runImport`・`assertImportNotCancelled`）
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/152
- 関連 ADR: [ADR-0043](./0043-grounded-quote-bridge-and-local-llm-reenablement.md)（LLM 再有効化）、
  [ADR-0045](./0045-container-relative-model-resolution.md)（同じ Issue 152 系列の別 blocker 修正）
- 関連設計: [`docs/design/gguf-model-lifecycle.md`](../design/gguf-model-lifecycle.md)

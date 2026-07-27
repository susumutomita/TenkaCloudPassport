# ADR-0052: 信頼済み Model ダウンロードをアプリスコープの進行にし、Background 遷移から再開する

- **Status**: Accepted。
- **Date**: 2026-07-27。
- **Deciders**: Susumu Tomita (@susumutomita)。

## Context

owner が TestFlight v1.1.0 の実機で、信頼済み Model（Qwen2.5-1.5B-Instruct Q4_K_M、1.04 GiB）の
ダウンロード中に次の 2 つの公開 blocker を観測した。

1. Settings から別画面へ行くとダウンロードが中断され、進捗が 0％ にリセットされる。
2. アプリを Background（他アプリを開く・Home に戻る等）に回すと転送が止まり、Settings へ
   戻ると 0％ に戻っている。

### コードから確認済みの欠陥

`src/app/use-local-model-management.ts` の unmount cleanup effect（依存配列 `[]`）は、これまで
`trustedModelControllerRef.current?.abort()` を無条件に呼んでいた。ADR-0046 は「仕上げフェーズ
（copy・SHA-256 照合・GGUF 検証・manifest 書き込み・activate）」だけを、この abort が効かない
構造（`enableOnDeviceAi` がダウンロード完了後は signal を一切使わない）にした。一方
**ダウンロードフェーズ自体**は「unmount で中断してよい」設計のまま残っていた。1 GB 級の
ダウンロードを伴う消費者向け機能として、この設計は誤りである。

`src/local-agent/expo-trusted-model-download.native.ts` は Issue 138（実機、100％ 到達後に
完了 Promise が解決せず固まる不具合）を受けて `sessionType: 'foreground'` へ変更済みだった
（`sessionType: 'background'` は iOS のバックグラウンド URLSession 完了が AppDelegate 経由で
届く設計のため、アプリ前面のままだと `downloadAsync()` の Promise が解決しなかった）。
foreground セッションは、アプリが `AppState` の `'active'` から離れる（Background・他アプリの
前面化・permission dialog や share sheet 等による一瞬の `'inactive'` 遷移も含む）と転送を
続けられない。

### 検証: symptom #1（画面遷移で 0％ に戻る）は unmount 起因ではない

`useLocalModelManagement` は `src/app/PassportApp.tsx` で 1 回だけ呼ばれ、`SettingsScreen` を
含む画面は `UtilityStageGate` が `stage`（React state、React Navigation ではない）に応じて
返す JSX を切り替えているだけである。`PassportApp` 自体は `stage` が変わっても unmount されない
ため、`useLocalModelManagement` の `[]` 依存 cleanup effect は通常の画面遷移では実行されない。
したがって「unmount cleanup が abort を呼ぶ」ことは symptom #1 の直接原因ではない
（この点は当初の推測を訂正する。ADR-0046 が「unmount」を脅威として扱っていたのは、Fast
Refresh・Development Build の JS reload 等ルート component 自体が再生成される稀なケースを
想定したものであり、通常の画面遷移では発火しない）。

symptom #1・#2 は同じ根本原因で説明できる。iOS は `'active'` から離れる遷移（他アプリを開く、
Home へ戻る、あるいは画面遷移中に一瞬発生しうる `'inactive'`）で foreground URLSession を
終了させうる。`downloadAsync()` の Promise が reject し、`acquireTrustedModel` がこれを
`DOWNLOAD_FAILED` として分類し、hook の `finally` が `onDeviceAiFlow` を `'idle'` に、
`onDeviceAiDownloadProgress` を `null` に戻す。これが「進捗が 0％ に戻る」という観測と一致する。

## Decision

### 1. Unmount では中断しない（アプリスコープの進行）

`use-local-model-management.ts` の unmount cleanup effect から
`trustedModelControllerRef.current?.abort()` を削除する。中断できる経路は次の 2 つだけに絞る。

- 明示的な「ダウンロードを中止する」ボタン（`cancelOnDeviceAiDownload`）。
- 全データ削除後の `invalidateAfterExternalPurge`（storage 自体が失われるため中断が必須）。

手動 GGUF import（`importControllerRef`）の unmount-abort は変更しない（ADR-0046 の対象外の
まま、既存の製品要件）。

### 2. foreground セッションを AppState 監視 + savable/fromSavable で再開する

Native 実装（`expo-trusted-model-download.native.ts`）を次のように変更する。

- `AppState` を監視し、`'active'` から離れる遷移を検知した時点で `task.pause()` を要求する
 （`'inactive'` も含めて反応することで、実際に転送が止まる前に pause を試みる猶予を最大化する）。
- `pause()` が転送停止に間に合い `downloadAsync()`/`resumeAsync()` が `null` で解決した場合、
  `task.savable()`（`DownloadPauseState`）を伴なう `'interrupted'` outcome を返す。
- `pause()` が転送停止に間に合わず reject になった場合（`savable()` は `'paused'` 状態でしか
  呼べないため取得できない）、`AppState.currentState` が `'active'` でなければ Background 起因の
  中断とみなし、`pauseState` 無しの `'interrupted'` を返す。
- `'active'` へ戻ったら、`pauseState` があれば `DownloadTask.fromSavable()` で `resumeAsync()`、
  無ければ `startDownload` から取り直す（＝再ダウンロード）。

`TrustedModelDownloadPort`（`src/local-agent/trusted-model-download.ts`）に `'interrupted'`
outcome と `resumeDownload` を追加し、`acquireTrustedModel` に
「`'interrupted'` を受け取っている間は `resumeDownload`（`pauseState` があれば）または
`startDownload`（無ければ）を呼び続ける」loop を実装する。この loop は platform 非依存の
純粋なオーケストレーションであり、Native の AppState 挙動を関知しない。「いつ interrupted に
なるか」だけを Native 側の責務として切り離すことで、再開の契約（進捗を引き継ぎながら
settle するまで諦めない）を手書き Fake で port レベルの実行テストとして固定できる
（`trusted-model-download.test.ts`）。

## 選択肢

1. **`sessionType: 'background'` へ戻す（不採用）**: Issue 138 で実機確認済みの通り、iOS の
   バックグラウンド URLSession は完了が AppDelegate のバックグラウンドイベント経由で届く
   設計のため、アプリ前面のままでは `downloadAsync()` の Promise が 100％ 到達後も解決しない。
   この設計へ戻すと Issue 138 の再発になる。
2. **HTTP Range による手動再開（バイト境界からの再開ループ、不採用ではなく将来の
   fallback 候補）**: Hugging Face の配布 URL は `accept-ranges: bytes` に対応済み
  （`trusted-model-catalog.ts` の comment 参照）であり、`fetch` + `Range` header + 既存
   書き込み位置からの追記で理論上は実装可能。ただし `expo-file-system` の
   `DownloadTask.savable()`/`fromSavable()` が同じ目的を native 実装として既に提供しており、
   自前の Range 実装は保守対象を増やすだけで得るものが小さい。savable な再開状態を得られない
   稀なケース（pause が転送停止に間に合わない）では本 ADR は「最初から再ダウンロード」に
   フォールバックしており、Range 再開の出番はここに限られる。この限定的なケースへの Range
   実装は follow-up とする（下記 Consequences 参照）。
3. **AppState 監視 + `pause`/`resumeAsync`/`savable`/`fromSavable`（採用）**: installed
   API（`node_modules/expo-file-system/build/NetworkTasks.d.ts`）で実際に提供されている
   pause/resume 契約をそのまま使う。新しい native 依存を増やさず、進捗の引き継ぎ
 （`bytesWritten` は再開後も継続する）も Native 側が保証する。

## Consequences

- **Good**: 信頼済み Model のダウンロードは、画面遷移・Settings の unmount では一切中断されない。
  Settings に戻れば現在の進捗（％）がそのまま表示される。
- **Good**: アプリを Background に回しても、`'active'` へ戻った時点で pause 済みの転送を
  再開する（savable な状態を得られた場合）。ユーザーが明示的に「ダウンロードを中止する」を
  押さない限り、最終的にダウンロードが完了する。
- **Bad / 既知の制限（code-reviewer 指摘 medium）**: `pause()` が転送停止（iOS によるセッション
  終了）に間に合わなかった場合、savable な再開状態を得られず、`'active'` 復帰後に最初から
  再ダウンロードする。この間 `bytesWritten` は 0 から巻き戻るため、UI 上は本 PR が直そうとした
  symptom #1・#2（「進捗が 0％ に戻る」）と外形的に区別できない。「直っていない」という誤検知を
  実機 QA で招きうる。このケースの頻度自体は実機でしか確認できない（下記「検証範囲」参照）。
  頻発するようであれば、選択肢 2（HTTP Range による部分再開）を fallback として実装する
  follow-up が必要になる。
- **Bad / 既知の制限（code-reviewer 指摘 medium）**: `PassportApp` が再生成される稀なケース
 （Development Build の Fast Refresh・JS reload。通常の画面遷移・アプリ操作では発生しない）が
  起きると、旧インスタンスの `trustedModelControllerRef` が指す進行中ダウンロードが宙に浮いた
  まま、新インスタンスが同じ宛先パス（`deriveFileName(source)` は URL から決定的に導出される
  ため `Paths.cache` 上のパスは常に同じ）に対して新しい Download を開始し、両者が同じ File を
  奪い合う可能性がある。size・MD5 の fail-closed 検証があるため中身が壊れた File を import へ
  進ませることはないが、この競合自体への対処は本 ADR に含めない（開発時のみのケースであり、
  本番の通常操作では発生しない）。
- **Bad / follow-up（`/simplify` altitude 指摘、F-PPCM59）**: `settleSession` は
  `start(task)` が例外を投げた瞬間 `!isForeground()` であれば、原因を問わず
  `{ kind: 'interrupted' }`（pauseState 無し）へ分類する。`attemptDownloadUntilSettled`
  の `while (outcome.kind === 'interrupted')` loop に上限が無いため、URL 失効・
  ディスク容量不足など本来恒久的な失敗が Background 中に発生すると、
  `DOWNLOAD_FAILED` として一切表面化せず、delete-and-restart サイクルを無音で
  繰り返しうる。実機での頻度・タイミング計測が必要なため本 ADR の scope 外とし、
  follow-up として記録した（`.claude/state/follow-ups.jsonl`、F-PPCM59）。
- **Bad**: アプリが長時間 Background に置かれ、iOS が JS runtime ごとプロセスを終了させた
  場合（メモリ逼迫等）、in-memory に保持している `pauseState`（`DownloadPauseState`）も失われ、
  次回起動時は最初からのダウンロードになる。`savable()` の結果をディスクへ永続化し、次回起動時に
  `fromSavable()` で復元する改善は本 ADR の scope 外とし、follow-up とする（通常の
  Home ボタン・他アプリ切り替えでは iOS はプロセスを即座に終了させず suspend するだけなので、
  この制限は「長時間 Background」という限定的なケースに閉じる）。
- **Tradeoff**: 全データ削除（`invalidateAfterExternalPurge`）は引き続きダウンロードを
  abort する。storage 自体が失われる操作であり、進行中のダウンロードを継続させる意味がないため。

## 検証範囲（sim / 実機）

- **シミュレーターで検証可能**: unmount cleanup が trusted DL を abort しないこと（source-text
  実行テスト）、`acquireTrustedModel` の `'interrupted'` → 再開 loop が進捗を引き継ぐこと
 （`trusted-model-download.test.ts`、手書き Fake による port レベルの実行テスト）。
- **実機でのみ確認可能**: iOS が実際に foreground URLSession をいつ終了させるか、
  `AppState` の `'inactive'`/`'background'` 遷移と `pause()` 呼び出しのタイミング競合、
  savable な再開状態を得られる実際の成功率。本 PR のマージ後、owner による実機
  TestFlight 再検証が必須。
- **owner への確認依頼（code-reviewer 指摘、low）**: symptom #1（Settings から他画面への
  遷移のみで、アプリを Background に回さない場合）と symptom #2（アプリを Background に回す
  場合）を実機で明確に切り分けて再現確認してほしい。本 ADR は、アプリ内の画面遷移中にも一瞬
  inactive 状態が発生しうるという前提で両者を同じ原因として説明しているが、この前提は
  コードからは確認できず（`AppState` の実際の遷移ログは実機でしか採れない）、実機でのみ
  検証可能である。もし画面遷移単体では `AppState` が変化しないことが判明した場合、symptom #1
  にはこの ADR とは別の原因が残っている可能性があり、追加調査が必要になる。

## References

- 関連コード: `src/app/use-local-model-management.ts`、
  `src/local-agent/expo-trusted-model-download.native.ts`、
  `src/local-agent/trusted-model-download.ts`
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/152
- 関連 ADR: [ADR-0046](./0046-trusted-model-finalize-phase-survives-navigation.md)
 （本 ADR がダウンロードフェーズの扱いを supersede する。仕上げフェーズを構造的に
  中断不能にした判断自体は変更しない）、
  [ADR-0053](./0053-native-md5-trust-chain-for-trusted-model-verification.md)
（取り込み検証のネイティブ MD5 化、同じ Issue 152 系列）
- 関連設計: [`docs/design/2026-07-23-on-device-conversation-agent.md`](../design/2026-07-23-on-device-conversation-agent.md)

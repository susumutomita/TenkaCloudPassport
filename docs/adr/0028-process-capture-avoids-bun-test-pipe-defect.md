# ADR-0028: 子プロセスの標準入出力を一時ファイル経由で読み書きする

- Status: Accepted
- Date: 2026-07-21
- Deciders: Susumu Tomita

## Context

`bun test scripts/` が 39 件・`bun test --coverage scripts/source-release.test.ts`
が複数件、再現性なく失敗する障害が発生した。GitHub Actions 上の main は緑のままで、
発生はローカル環境限定だった。

障害当日の朝までは同一のローカル環境（同じ Claude Code サンドボックスシェル）で
全緑だったため、直前に発生した環境変化（Xcode 26.6 のフルインストールで
`xcode-select` の参照先が CommandLineTools から Xcode.app に変わったこと）が
疑われた。しかし実際に手を動かして切り分けたところ、原因は Git や Xcode とは
無関係だった。

実際の根本原因を整理すると、次のとおりになる。

1. Xcode のフルインストールに伴い、ローカルで `expo prebuild` ないし
   `expo run:ios` 相当の操作が行われ、ネイティブ側の作業ツリー `ios/`
  （`.gitignore` 済み・Git 管理外）が新規に生成された。`ios/Pods/Headers/Public/**`
   配下には CocoaPods が生成する umbrella header の symlink が 8,500 件超存在する。
2. `bun test` はテストファイル探索のため cwd 配下を再帰的に walk する。この scan が
   `ios/` の symlink 群に到達すると、**同じ bun プロセス内で `Bun.spawn` /
   `Bun.spawnSync` の `stdout: 'pipe'` / `stderr: 'pipe'` が空文字列を返す、または
   `ReadableStream` の `reader.read()` が無期限に解決しない**という Bun 1.3.11 の
   実行時の欠陥を踏む。子プロセス自体は正しい exit code で完了しており、spawn
   された `git` / `bun` 側の問題ではない。
3. `ios/` は `.gitignore` 済みのため CI のチェックアウトには存在しない。CI が
   常に緑だったのは、この scan 経路そのものが CI では発生しないため。
4. 再現条件を isolate した結果、`node:child_process` 経由の spawn や、既に開いた
   fd を渡す方式でも同じ環境下で空文字列を返すことがあり、`Bun.spawn` の
   `stdout` / `stderr` / `stdin` を **`Bun.file(path)`（実ファイル）へ向けた場合だけ**
   安定して機能することを実測で確認した。`Bun.spawn` は該当 fd を自身で開いて子の
   fd へ直接 dup するため、この経路は OS パイプの読み取りを経由しない。

この一次情報（8,500 件超の symlink を持つローカル限定ディレクトリの有無で
100％ 再現・非再現が切り替わる）は、`scripts/*.test.ts` の一時ディレクトリへ
実際に `ios/` を symlink して行った独立の再現実験と、実リポジトリ内での
直接検証の両方で確認済み。

## Decision

`scripts/process-capture.ts`（および `process-capture-bounded.ts` /
`process-capture-sync.ts`）に、子プロセスの標準出力・標準エラー・標準入力を
一時ファイル経由で読み書きする共通ヘルパーを実装し、`scripts/` 配下で子プロセスを
spawn して出力を読み取っていた本番コード・テストコードの全箇所をこれに置き換えた。

- `runCapturedProcess` / `runCapturedProcessSync`: 子プロセスを実行し、完了後に
  一時ファイルから stdout / stderr を読み戻す。
- `runProcessStdoutIntoSink`: 標準出力を、完了後に一時ファイルから読み出す
  `Readable` として呼び出し元の sink（hash 計算しながらの書き込み等）へ渡す。
- `runBoundedProcess`: 出力サイズ・実行時間の上限を課しながら実行する。
  `android-release-identity.ts` の「暴走した外部コマンドを 256 KiB / 15 秒で
  強制終了する」という DoS 防御の要件は、ライブの `ReadableStream` を
  `reader.read()` で読む代わりに、一時ファイルのサイズを定期的に polling して
  上限超過を検出し、超過時に `kill(9)` する方式へ置き換えて維持した
 （実際に無限出力するテスト用シェルスクリプトで、旧来どおり早期に kill
  されることを確認済み）。

ファイルを 3 つに分けたのは、`make release_test_coverage`
（`bun test --coverage scripts/source-release.test.ts`）が単一ファイル実行での
カバレッジ 100％ を要求するため。`source-release.ts` の依存グラフに含まれない
`runBoundedProcess`（`android-release-identity.ts` 専用）と `runCapturedProcessSync`
（`architecture-harness.test.ts` 専用）を同じファイルに置くと、そのテスト実行では
決して通らないコードパスが残り、カバレッジゲートを壊す。

`bunfig.toml` の `[test]` 設定や `Makefile` の呼び出し引数で `ios/` を bun test の
探索対象から除外する対応（`--path-ignore-patterns` 等）は、実測では確実に問題を
解消することを確認したが、意図的に採用しなかった。テスト実行の設定を変えて
局所的な環境要因を隠すのではなく、本番コード・テストコードが実際に読み書きする
標準入出力の経路そのものを、この種の環境要因に対して頑健にする方を選んだ。

## Consequences

- Good: 子プロセスの標準入出力の読み取りが、`bun test` 自身の内部走査状況に
  左右されない、決定的な経路になった。ローカルでネイティブ側を 1 度でもビルドした
  環境で同じ問題が再発することはない。
- Good: `runBoundedProcess` の DoS 防御は、より単純な polling ベースの実装になった
 （`ReadableStream` の低レベル API から切り離され、可読性が上がった）。
- Bad: 子プロセスごとに一時ディレクトリの作成・削除が発生するため、`'pipe'` 直読みに
  比べて僅かにオーバーヘッドが増える（実測ではテスト全体で数百ミリ秒程度）。
- Bad: `exclusive-output-writer.ts` の出力書き込みは、旧来の「子プロセスの出力を
  直接 pipe で受けながら hash・書き込みする」完全なストリーミングから、「一時ファイルへ
  読み切ってから hash・書き込みする」方式に変わった。対象は release candidate の
  個別ファイル（既存の 5 MiB / 16 MiB 上限テストの範囲内）であり、実運用上の
  影響は無いと判断した。
- Tradeoff: `bun test` 自体・あるいは `Bun.spawn` の pipe 実装の欠陥は Bun 本体の
  問題であり、この ADR の対応はアプリケーション側での回避策である。将来 Bun が
  このクラスの不具合を修正したことを確認できた場合、`'pipe'` へ戻すかどうかは
  再検討してよい。そのときも、ローカルに `ios/` 相当の巨大な symlink 群がある
  状態での `bun test` 実行を再現条件として確認すること。

## References

- 関連コード: `scripts/process-capture.ts`, `scripts/process-capture-bounded.ts`,
  `scripts/process-capture-sync.ts`
- 関連コード: `scripts/source-release.ts`, `scripts/exclusive-output-writer.ts`,
  `scripts/android-release-identity.ts`
- 関連 Issue: Issue 90

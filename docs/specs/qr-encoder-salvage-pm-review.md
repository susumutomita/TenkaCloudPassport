# 純 TypeScript QR エンコーダサルベージ PM レビュー

- 対象: [Issue 66](https://github.com/susumutomita/TenkaCloudPassport/issues/66)。
- 正本: [仕様書](./2026-07-20-qr-encoder-salvage.md)・[設計](../design/2026-07-20-qr-encoder-salvage.md)。M1 の QR 表示設計は [QR 招待・共有確認・Ready フローの設計](../design/qr-invite-and-ready-flow.md) を正本とする。
- 本書の責務: Product Manager ロールとして、ユーザーストーリーの詳細化、受け入れ基準のテストシナリオ化、優先度と依存関係の整理、スコープ外の明確化を行う。仕様書・設計への指摘は第 5 章にまとめる。

## 1. ユーザーストーリーの詳細化

### 1.1 M3 のエンドユーザー文脈

M1 の QR 表示は `src/components/qr-matrix.ts` による装飾表現であり、意図的に非スキャン可能かつ Screenshot 時に Payload が判読できないことを保証する。読取は `QrScannerPort` の in-process adapter で単一端末に閉じている。M3 は Port の実装を実カメラへ差し替えるマイルストーンであり、本 Issue の encoder は M3 で Host 側の表示を標準準拠 QR へ切り替えるための素材（building block）に当たる。

Host のストーリーは次のとおり。

- Host として、Lounge を作成して Invite QR を画面に表示するとき、`TCPQ1:` envelope（Versioned Lounge Invite、上限 1,024 byte）が QR Code Model 2 として描画され、Guest の実機カメラで 1 回で読み取れる状態にしたい。
- 招待 Payload（Lounge ID・1 回限り Join Secret・期限・定員などの JSON）が wire format 上限の 1,024 byte ちょうどでも Version 26 以下で encode でき、表示が失敗しないことを求める。encode が失敗する場合は型付き Error を受け取り、UI が失敗状態を描画できることを求める。
- 誤り訂正レベル M により、会場の照明・角度・画面輝度のムラの下でも読み取りが実用的に成立することを求める。

Guest のストーリーは次のとおり。

- Guest として、Host の画面に表示された Invite QR を自分の端末の実カメラで読み取り、`decodeQrPayload` → 共有 Preview 確認 → Ready の流れで Lounge へ参加したい。
- QR が標準準拠でなければこのフローの入口が塞がるため、encoder のスキャン可能性は M3 の Guest 体験全体の前提条件になる。

開発者ペルソナのストーリーは次のとおり。

- renderer 実装者（M3）として、`encodeQr(value)` が返す boolean matrix だけを受け取り、quiet zone・拡大率・色・コントラストは renderer 側で決めたい。encoder が描画へ関与しないことで、M1 の装飾表現から実 QR への切替を renderer の差し替えだけで行える。
- セキュリティ・保守担当として、supply-chain hardening 方針（ADR-0001）の下で runtime 依存を増やしたくない。テスト専用の jsQR も lifecycle script なし・依存ゼロであり、`--ignore-scripts` と空の `trustedDependencies` を維持したままにする。
- QA として、自前実装の正当性を目視ではなく機械検証で担保したい。jsQR による round-trip テスト（encode → 画素化 → 実デコード → 入力一致）を常設し、回帰は既知ベクタで固定する。

### 1.2 この Issue が出荷する価値の範囲

本 Issue は M3 本体ではない。エンドユーザー価値は M3 の wiring 後に発現する。「機械検証済みの encoder が main に存在し、M3 の renderer から呼ぶだけになっている」ことを本 Issue の完了状態とする。

## 2. 受け入れ基準のテストシナリオ化

仕様書の各受け入れ基準を「入力 → 期待結果」の検証可能な形へ落とす。ID は実装時のテスト名と対応付けるための参照として使う。

### AC-1: 純関数での matrix 生成（Model 2・byte mode・誤り訂正 M・Version 1〜26）

| ID | 入力・操作 | 期待結果 | 検証手段 |
| --- | --- | --- | --- |
| S-1-1 | `encodeQr('HELLO WORLD')` | `version: 1`・`errorCorrection: 'M'`・一辺 21 module の matrix | `bun test`（既存テストが該当） |
| S-1-2 | `'a'.repeat(14)` / `'a'.repeat(15)` / `'a'.repeat(1024)` | Version 1 / 2 / 26（byte 数に必要な最小 Version 選定） | `bun test`（既存テストが該当） |
| S-1-3 | `src/qr/encoder.ts` の import 文を確認する | React Native・Expo・Node API の import が 0 件 | 静的確認（`/review` で担保） |

### AC-2: 既知ベクタによる回帰防止

| ID | 入力・操作 | 期待結果 | 検証手段 |
| --- | --- | --- | --- |
| S-2-1 | `encodeQr('HELLO WORLD')` | 固定 21 行の matrix と完全一致 | `bun test`（既存テストが該当） |

### AC-3: jsQR round-trip（encode → 画素化 → 実デコード → 入力一致）

画素化（quiet zone 4 module・拡大率・RGBA 化）はテスト内の純関数で行い、実装側へ漏らさない（設計の決定事項）。

| ID | 入力・操作 | 期待結果 | 検証手段 |
| --- | --- | --- | --- |
| S-3-1 | ASCII 入力（実運用形に近い `TCPQ1:` 招待風文字列を含む） | jsQR の decode 結果が入力と一致 | `bun test`（新設） |
| S-3-2 | 日本語 UTF-8 入力（例: `'招待 QR'`） | decode 結果の byte 列が入力の UTF-8 byte 列と一致 | `bun test`（新設。第 5 章の指摘 4 を参照） |
| S-3-3 | 1,024 byte ちょうどの入力 | Version 26 で encode され、decode 結果が入力と一致 | `bun test`（新設） |
| S-3-4 | 空文字列 | throw せず Version 1 の有効な QR になる（設計のエッジケース） | `bun test`（新設。round-trip 可否は jsQR の挙動を確認して決める） |
| S-3-5 | 同一入力での 2 回 encode | matrix が完全一致（決定論） | `bun test`（既存テストが該当） |

### AC-4: 型付き `QrEncodingError` による fail-closed

| ID | 入力・操作 | 期待結果 | 検証手段 |
| --- | --- | --- | --- |
| S-4-1 | `'a'.repeat(1025)` | `QrEncodingError` かつ `code: 'DATA_TOO_LARGE'` | `bun test`（既存テストが該当） |
| S-4-2 | 内部不整合（RS block 定義の欠落・mask 番号の範囲外） | `QrEncodingError` かつ `code: 'INVALID_DATA'` | `bun test`（新設。到達方法は第 5 章の指摘 1 を参照） |

### AC-5: カバレッジ 100％ と品質ゲート

| ID | 入力・操作 | 期待結果 | 検証手段 |
| --- | --- | --- | --- |
| S-5-1 | `bun test --coverage` | `bunfig.toml` の `coverageThreshold = 1` を満たす | CI / ローカル実行 |
| S-5-2 | `bun scripts/architecture-harness.ts --staged --fail-on=error` と `make before-commit` | すべて緑 | CI / ローカル実行 |

### AC-6: ADR-0024 の記録

| ID | 確認項目 | 期待結果 |
| --- | --- | --- |
| S-6-1 | 採用判断と代替案 | 設計の 3 案比較（外部ライブラリ / サルベージ / scratchpad 保管）と選定理由が残る |
| S-6-2 | jsQR devDependency | 純 JS・依存ゼロ・lifecycle script なしの根拠と、`trustedDependencies` を空のまま維持する判断が残る |
| S-6-3 | knip の dead-code 報告 | M3 まで消費者が存在しないことの採用意図が残る（報告のみで gate ではない根拠は ADR-0012） |

### AC-7: フォローアップ F-R1WMJW の resolve

| ID | 入力・操作 | 期待結果 |
| --- | --- | --- |
| S-7-1 | `/follow-up resolve F-R1WMJW <PR URL>` | `.claude/state/follow-ups.jsonl` の該当 entry が PR URL 付きで resolved になる |
| S-7-2 | working tree の確認 | サルベージ対象外の草稿残骸が PR に混入していない（第 4 章・第 5 章の指摘 7 を参照） |

### 非機能: パフォーマンス

| ID | 入力・操作 | 期待結果 | 検証手段 |
| --- | --- | --- | --- |
| S-8-1 | 1,024 byte 入力の encode（Version 26・8 マスク評価） | 100 ms 未満で完了 | 実装時に検証手段を確定する（第 5 章の指摘 6 を参照） |

## 3. 優先度と依存関係

### 3.1 優先度

| 優先度 | 作業 | 補足 |
| --- | --- | --- |
| P0 | `src/qr/encoder.ts` と既知ベクタ・境界・エラーの既存テストの取り込み | 草稿として working tree に存在済み。未コミットのためコミットが必要 |
| P0 | jsQR round-trip テストの新設（S-3-1〜S-3-4） | 草稿テストには存在しない。本 Issue の主要な新規作業 |
| P0 | jsQR の devDependency 追加（`--ignore-scripts` 下でのインストール） | `package.json` / lockfile の変更を伴う |
| P0 | ADR-0024 の作成 | 番号は第 5 章の指摘 5 を参照 |
| P1 | F-R1WMJW の resolve と草稿残骸の処分 | PR 作成後に PR URL 付きで記録する |

### 3.2 依存関係

- 本 Issue は M1 のどのコードにも依存せず、M1 からも参照されない。`src/qr/` は protocol 層と同格の純関数層であり、依存の向きは「（M3 予定の）renderer → encoder」の一方向に限る。
- M1 の `QrCodeView` / `qr-matrix.ts` には触れない。装飾表現は「Screenshot 時に Payload が判読できない」ことを保証する privacy 由来の設計であり、実 QR への切替はその保証の変更を意味するため、M3 の設計判断として別の ADR で行う。
- 上限 1,024 byte は `src/protocol/qr-payload.ts` の `QR_PAYLOAD_MAX_BYTES = 1024` と一致しており、wire format との整合はコードで確認できている。
- M3 の wiring（renderer 実装・`QrScannerPort` の実カメラ実装）は後続 Issue とする。本 Issue はそれらの前提を作るだけで、着手はしない。
- knip は消費者不在の encoder を dead-code として報告するが、報告のみで gate ではない（ADR-0012）。ADR-0024 に採用意図を残すことで対応する。
- PR の同梱物は次に限定する: `src/qr/encoder.ts`・`src/qr/encoder.test.ts`・ADR-0024・仕様書・設計・本レビュー・`package.json` / lockfile（jsQR）。

## 4. スコープ外の明確化と漏れた場合のリスク

| スコープ外項目 | 漏れる典型経路 | 漏れた場合のリスク | ガード |
| --- | --- | --- | --- |
| `QrCodeView` への wiring | 「実 QR を出せるようになったので繋いでしまう」という前倒し | M1 の Screenshot 非判読保証を ADR なしで破り、privacy 設計との整合を失う。quiet zone・コントラスト・アクセシビリティ未設計の中途半端な表示が入る | 受け入れ基準に「変更しない」を明記済み。`/review` で diff を確認する |
| カメラ読取・QR デコードの実装 | round-trip テストの延長で実機読取まで作り込む | Development Build 境界・Native 依存が混入し Issue が肥大する | `QrScannerPort` の実カメラ実装は M3 の後続 Issue とする |
| 草稿の x25519 / sha256 | 「同じ草稿にあるからついでに」という同梱 | HEAD 採用済みの `@noble/hashes` と重複する自前 crypto が入り、監査対象と保守面が増える | 仕様書で破棄を明記済み。PR 同梱物の限定（3.2 節）で機械的に排除する |
| SVG renderer（草稿 `QrCode.tsx`） | matrix の動作確認用に描画コードを残す | 描画責務が encoder 側へ混入し、M3 renderer の設計判断を先取りで固定する | 仕様書で破棄を明記済み |
| 草稿 ADR-0012 の取り込み | 草稿の ADR をそのまま docs/adr/ へ置く | 既存 ADR-0012 と番号衝突し、ADR の参照整合が壊れる | ADR-0024 として新規に書く |

スコープ外の発見を本 PR で修正することは、現在の PR が CI で詰まる原因になっている場合を除き禁止されている（AGENTS.md）。発見した時点で `/follow-up add` へ記録し、別 PR で処理する。

## 5. 仕様書・設計への指摘（矛盾・懸念）

1. 到達不能な防御分岐とカバレッジ 100％ の緊張。`encoder.ts` の `INVALID_DATA` の 2 経路（`rsBlocks` の RS block 定義不正・`maskBit` の mask 範囲外）は、公開 API `encodeQr` からは到達しない。設計は「到達しないことが正常」とする一方、仕様はカバレッジ 100％ を要求しており、両立方法が書かれていない。内部関数のテスト用 export、定義データの検証を初期化時へ寄せる再構成などの選択肢から、実装前に方針を決めて設計へ追記する必要がある。カバレッジ計測からの除外は quality-bar と衝突するため選ばない。
2. Error code の割当基準のあいまいさ。`rsBlocks` は Version 定義の欠落を `DATA_TOO_LARGE`（メッセージは「対応する QR Version がありません」）で投げるが、`chooseVersion` が Version を 1〜26 に制限するためこの経路は実質的に内部不整合であり、設計の分類では `INVALID_DATA` に相当する。「入力起因は `DATA_TOO_LARGE`・内部起因は `INVALID_DATA`」という割当基準を明文化し、コードを片方へ寄せることを推奨する。
3. 草稿テストと受け入れ基準の差分。現行 `src/qr/encoder.test.ts` には jsQR round-trip・空文字列・`INVALID_DATA` のテストが存在しない。「サルベージ = そのままコミット」ではなく、テスト新設が本 Issue の主要作業である点を PR 計画に織り込む必要がある。
4. jsQR の UTF-8 decode 仕様。jsQR は byte mode の内容を `data`（文字列）と `binaryData`（byte 配列）の両方で返し、`data` の文字列化は UTF-8 として解釈される保証がない。日本語入力の同一性検証（S-3-2）は `binaryData` を UTF-8 decode して比較する形を推奨する。テスト設計時に挙動を確認して固定すること。
5. ADR 番号の運用。docs/adr/ には 0023 が 2 本存在する（`0023-llama-provider-runtime-boundary.md` と `0023-nearby-transport-evidence-gate.md`）。ADR-0024 自体は空き番号だが、並行作業で再衝突するリスクがある。既存の番号重複の解消はスコープ外のため `/follow-up add` で記録することを推奨する。
6. 性能基準の検証方法が未定。「100 ms 未満」を CI の時間 assert にすると flaky になりやすい。ローカル計測結果を PR 本文へ記録する運用か、余裕のある上限での smoke 計測かを実装時に決め、検証手段を仕様書の検証欄へ残すのが望ましい。
7. working tree の草稿残骸。未追跡の草稿（`src/components/QrCode.tsx`・`src/protocol/x25519.*`・`src/protocol/sha256.*`・`src/screens/` 配下の草稿・`src/adapters/`・`src/ports/`・`docs/adr/0012-pure-typescript-qr-encoder.md`・`docs/design/qr-invite-ready-flow.md`）が残っており、PR へ紛れ込むとスコープ逸脱になる。F-R1WMJW の resolve 条件に残骸の処分を含めるか、処置を別途明記する必要がある。`rm` コマンド禁止の制約により、Git 管理外ファイルの処分は手動削除の依頼になる点も運用上の注意点になる。
8. 空文字列ケースの所在。設計は空文字列を「Version 1 の有効な QR」と定めるが、仕様書の受け入れ基準には現れない。本レビューではテストシナリオ S-3-4 として取り込んだ。仕様書の次版で受け入れ基準へ昇格させることを推奨する。

なお、上限 1,024 byte と `QR_PAYLOAD_MAX_BYTES` の一致、HELLO WORLD 既知ベクタの存在、決定論の担保は現物コードで確認済みであり、仕様書と実装の間にこれ以上の矛盾は見つからなかった。

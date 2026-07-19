# 純 TypeScript QR エンコーダのサルベージ QA 計画

## スコープ

- Issue: <https://github.com/susumutomita/TenkaCloudPassport/issues/66>。
- Role: QA Engineer。
- 対象: `src/qr/encoder.ts` と `src/qr/encoder.test.ts`。
- 正本: [仕様書](./2026-07-20-qr-encoder-salvage.md) / [設計](../design/2026-07-20-qr-encoder-salvage.md)。
- 検証環境: bun 1.3.11 / Apple Silicon macOS (Darwin 25.5.0)。実測値は本環境のもの。

## 1. テスト計画

### 1.1 境界値マトリックス（byte 数）

Version 選定は誤り訂正 M・byte mode の容量式（4 bit mode 指示子 + 文字数指示子 + 8n bit）に従う。理論境界を先に固定し、現行テストの充足状況を対応付ける。

| 入力 byte 数 | 期待結果 | 境界の意味 | 現行テスト |
| --- | --- | --- | --- |
| 0 | Version 1・21×21・空 payload | 空状態。設計が「Version 1 の有効な QR」と明記 | 済（round-trip で decode まで検証） |
| 1 | Version 1 | 最小の非空入力 | 未（HELLO WORLD 11 byte が近傍を代替。追加は任意） |
| 14 | Version 1 | Version 1 の容量上限（(128 - 12) / 8 = 14.5 → 14） | 済（version 値のみ） |
| 15 | Version 2 | Version 2 への切替下限 | 済（version 値のみ） |
| 106 / 107 | Version 6 / 7 | Version 7 で version 情報ブロック（BCH 18 bit・2 箇所）が初出現 | 未（追加推奨。後述 P2） |
| 180 / 181 | Version 9 / 10 | 文字数指示子が 8 bit から 16 bit へ切り替わる | 未（追加推奨。後述 P2） |
| 1024 | Version 26・121×121 | 上限ちょうど。`QR_PAYLOAD_MAX_BYTES` と一致 | 済（round-trip で decode まで検証） |
| 1025 | `QrEncodingError('DATA_TOO_LARGE')` | 上限超過の fail-closed | 済（型と code を検証） |

補足: Version 26・M の理論容量は 1,059 byte であり、1,024 byte 上限は QR 容量ではなく wire format（`src/protocol/qr-payload.ts` の `QR_PAYLOAD_MAX_BYTES`）に由来する人為的上限として設定されている。したがって 1,025 byte の DATA_TOO_LARGE は `encodeQr` 冒頭のガードで発生し、`chooseVersion` の容量枯渇 throw には到達しない（5 章参照）。

### 1.2 文字種マトリックス（UTF-8 経路）

| 文字種 | UTF-8 byte 数 / 文字 | 検証意図 | 現行テスト |
| --- | --- | --- | --- |
| ASCII | 1 | 基本経路。`data` 文字列と `binaryData` の両方を比較 | 済 |
| 日本語（BMP） | 3 | 多バイト経路。`binaryData` 比較で jsQR の文字列復号仕様に依存しない | 済 |
| 絵文字（サロゲートペア） | 4 | UTF-16 サロゲートペア → UTF-8 4 byte 経路 | 未（追加必須。後述 P1） |
| 孤立サロゲート | 3（U+FFFD へ正規化） | `TextEncoder` は不正な文字列を U+FFFD に置換するため、round-trip の入力一致は well-formed 文字列に限って成立する | 未（仕様の明文化を推奨。テスト追加は任意） |

### 1.3 決定論性

- 同一入力 → 同一 matrix は「招待 QR」の 2 回 encode 比較で検証済み。乱数・時刻・環境依存の入力はコード上存在しない（`TextEncoder`・GF(256) テーブル・ペナルティ評価はすべて決定的）。
- マスク同点時は `<` 比較により番号の小さいマスクが勝つ（設計どおりの決定論）。
- プロセスを跨いだ決定論は HELLO WORLD の既知ベクタ（21 行の固定 matrix）が回帰として固定する。

### 1.4 異常系

- `DATA_TOO_LARGE`: 1,025 byte で検証済み。
- `INVALID_DATA`（RS block 定義不正・mask 番号不正）: 公開 API `encodeQr` からは到達不能であることをコード解析で確認した（`chooseVersion` は 1〜26 に閉じ、mask は 0〜7 のループでのみ生成される）。設計が「到達しないことが正常であり、防御的分岐として残す」と明記しているため、未実行のままで受け入れる。ただしカバレッジ数値の解釈に注意が要る（4.5 節）。

## 2. round-trip 検証の妥当性評価

### 2.1 何を証明するか

jsQR による encode → 画素化 → 実デコード → 入力一致は、独立実装のデコーダが以下を全部読めたことを意味する。

- finder / alignment / timing パターンの配置が規格どおりであること。
- 形式情報（誤り訂正 M + マスク番号の BCH 15 bit）が正しく符号化・配置されていること。
- Version 26 では version 情報（BCH 18 bit・2 箇所）も読めていること。
- RS ブロックの分割・インターリーブ・誤り訂正符号が整合していること。
- byte mode セグメント（mode 指示子・文字数指示子・データ・終端・パディング）が規格どおりであること。

自前実装の「正当性を自ら証明する」手段として、既知ベクタ（構造の回帰固定）と round-trip（意味の機械検証）の組み合わせは妥当と判断する。特に `binaryData` を `TextEncoder` の byte 列と比較する現行実装は、jsQR 側の文字列復号ヒューリスティックに依存しない点で正しい選択と評価する。

### 2.2 画素化条件の前提

現行テストの画素化は quiet zone 4 module・4 px/module・純黒 (0,0,0,255) / 純白 (255,255,255,255)・回転や歪みなしの理想条件に固定されている。

- quiet zone 4 module は ISO/IEC 18004 の要求どおりで妥当。
- 4 px/module は jsQR の binarizer が安定動作するスケールであり妥当。1 px/module まで縮めた頑健性は本テストの目的（matrix の規格適合性の証明）の外であり、要求しない。
- 画素化はテスト内の純関数に閉じ、実装側へ漏れていない（設計の責務境界どおり）。

### 2.3 有効性の限界

round-trip が緑でも、次は証明されない。

- 実カメラでのスキャン可能性（照明・ピント・表示コントラスト・モアレ・距離）。特に Version 26 は 121×121 module であり、スマートフォン画面上の module が小さくなるため実機での確認が必須。
- jsQR 以外のデコーダ（iOS AVFoundation・ZXing 等）の許容差。jsQR が読める＝全デコーダが読める、ではない。
- 選ばれなかった 7 マスクの matrix の正当性。ペナルティ評価には使われるが、デコードで検証されるのは選択マスクのみ（残余リスクは 5 章の所見で緩和）。

したがって round-trip は「M3 の building block としての規格適合性ゲート」と位置付け、実カメラ読取の合否は M3 の実機テスト（対象端末・実 payload サイズ・明暗環境）で別途ゲートする。Repository の緑を実機ゲートの代替証跡にしない。

## 3. パフォーマンステスト観点

### 3.1 計算量

- 支配項はマスク評価。`bestMatrix` が 8 マスク分の `buildMatrix`（O(size^2)）を作ってペナルティを評価し、最後に選択マスクで 9 回目の build をする。ペナルティのうち最重は `finderLikePenalty` の O(size^2 × 11 × 2 パターン × 2 方向) で、Version 26（size = 121）では 1 encode あたり概算 500〜600 万回の比較になる。
- RS 符号化は Version 26 で 23 ブロック × 高々 47 byte × 28 次の剰余計算で数万オペレーションにとどまり、支配項ではない。`generatorPolynomial` がブロックごとに再計算される非効率はあるが、実測上無視できる（5 章の所見参照）。

### 3.2 実測の目安（本環境・warmup 後の平均）

| 入力 | Version / size | 実測 |
| --- | --- | --- |
| 0 byte | 1 / 21 | 約 0.4 ms |
| 11 byte (HELLO WORLD) | 1 / 21 | 約 0.2 ms |
| 100 byte | 6 / 41 | 約 0.8 ms |
| 512 byte | 18 / 89 | 約 3.9 ms |
| 1,024 byte | 26 / 121 | 約 7.2 ms |

### 3.3 閾値 100 ms の妥当性

- 最悪ケース（1,024 byte・Version 26・8 マスク評価）の実測の約 7 ms に対し 100 ms は約 14 倍のマージンがあり、開発機・CI 上の予算として妥当。
- ただし本番実行環境は React Native の Hermes（JIT なし）であり、ローエンド Android では 5〜20 倍の減速を見込む。最悪ケースで 100 ms に接近し得るため、100 ms は「開発機での上限予算」と解釈し、実機での体感確認は M3 の renderer 接続時に行う。純関数のため設計どおり memoize で吸収できる。
- 自動テストとしてゲート化する場合は、CI の負荷変動によるフレーク防止のため複数回実行の中央値で判定し、閾値は 100 ms を維持する（1 回計測の生値で assert しない）。現状は仕様の非機能要件（受け入れ基準外）であり、計測手順の記録をもって足りると判断する。

## 4. セキュリティテスト観点

### 4.1 入力起因の DoS

- 1,024 byte 超は `encodeQr` 冒頭のガードで型付き Error になり、Version 選定・RS 符号化・マスク評価のいずれにも進まない。計算量は Version 26 の固定上限（前章）で抑えられ、入力によって際限なく増えない。この点は妥当。
- ただしガードは `TextEncoder().encode(value)` の後にあり、巨大文字列（例: 数百 MB）を渡すと上限判定の前に入力長に比例した UTF-8 変換コストとメモリ確保が発生する。UTF-8 byte 数は UTF-16 code unit 数以上であるため、`value.length > QR_ENCODER_MAX_BYTES` の事前チェックは誤遮断なしに変換前へ置ける。現状の呼び出し元は自端末生成の payload に限られ深刻度は低いが、公開純関数として将来リモート由来文字列を受ける可能性があるため、改善を推奨する（P3）。

### 4.2 エラーメッセージへの入力値の混入

- 全 throw 箇所（`encodeQr` / `chooseVersion` / `rsBlocks` / `maskBit`）のメッセージを確認した。含まれる可変値は定数 `QR_ENCODER_MAX_BYTES` のみで、入力文字列・byte 列・長さのいずれもメッセージに混入しない。ログ経由の payload 漏えい経路はない。妥当。

### 4.3 jsQR を devDependency に限定する意味

- `package.json` で jsqr 1.4.0 が devDependencies にあることを確認した（dependencies には不在）。テストからのみ import されるため、アプリ bundle・実行時攻撃面に一切入らず、ADR-0001 の supply-chain hardening（runtime 依存ゼロ）を維持する。
- jsQR は純 JS・依存ゼロ・lifecycle script なしであり、`--ignore-scripts` 方針下のインストールと整合する。テスト専用依存の侵害は CI の判定を歪め得るが製品コードには到達しない、という被害半径の限定が本構成の意味である。

### 4.4 型・実行時の防御

- 入力は string 型のみで、`TextEncoder` が例外なく Uint8Array へ正規化する（不正サロゲートは U+FFFD 置換）。型レベルで不正入力の経路が狭い。
- `EncodedQr.matrix` は readonly 型だが実行時には freeze されない。呼び出し側の規律（型チェック）で守る現方針はプロジェクト水準に照らして許容する。

### 4.5 カバレッジ数値の解釈（記録）

`bun test --coverage` は `src/qr/encoder.ts` を line `100%` と報告する。しかしこれは、到達不能な防御的分岐（`INVALID_DATA` の 2 箇所・`rsBlocks` と `chooseVersion` の throw）が実行された証明ではないことを実験で確認した（単純な未到達 throw を bun は未カバー行として報告できる一方、本ファイルでは行マッピングの粒度により `100%` 表示になる）。「カバレッジ 100％」ゲートはこれらの分岐を検証しない。正しさの実質的な担保は既知ベクタと round-trip であり、この解釈を QA 記録として残す。

## 5. src/qr/encoder.ts コードレビュー所見

規格値のスポットチェック: alignment パターン座標（Version 2・13・20〜22・25・26）と RS ブロック定義（Version 1・13・26 の M）を ISO/IEC 18004 の公表値と突合し一致を確認した。形式情報・version 情報の BCH 生成多項式（`0x537` / `0x1f25`）とマスク定数 `0x5412`、8 種のマスク式、ペナルティ規則 N1〜N4 の係数（3 + 超過分 / 3 / 40 / 10 刻み）も規格と一致する。

| 番号 | 所見 | 重要度 | 対応 |
| --- | --- | --- | --- |
| R1 | `bchTypeInfo(mask)` は誤り訂正レベル指示子 2 bit を含まない値を受けるが、M のレベル指示子が `00` のため偶然正しい。誤り訂正レベルを可変にした瞬間に形式情報が壊れる暗黙結合であり、`(EC_BITS_M << 3) \| mask` の形へ明示するかコメントで固定理由を残すべき | 低 | M 固定の現仕様では正しい。将来拡張時の罠として記録 |
| R2 | マスク評価時（`test = true`）に形式情報・version 情報・暗モジュールを全て明（false）にしてペナルティを計算する。ISO/IEC 18004 は完成シンボルでの評価を想定するため、厳密実装とマスク選択が異なり得る。ただし広く使われる参照実装と同一挙動で、どのマスクを選んでもデコード可能性は損なわれず決定論も保たれる | 低 | 許容される逸脱として記録。挙動変更は既知ベクタの matrix を変えるため不用意に触らない |
| R3 | `rsBlocks` の未知 Version throw が `DATA_TOO_LARGE` を使う。呼び出し時点で Version は検証済みであり、この分岐は内部不整合ガードなので、設計の対応表（内部不整合 → `INVALID_DATA`）と不整合 | 低 | 到達不能のため実害なし。code の付け替えを別途検討 |
| R4 | `DATA_TOO_LARGE` ガードが `TextEncoder.encode` の後にあり、巨大入力で判定前に O(n) コストが発生する（4.1 節） | 中 | `value.length` の事前チェック追加を推奨（P3） |
| R5 | `generatorPolynomial` が RS ブロックごとに再計算される（Version 26 で 23 回）。`chooseVersion` も試行 Version ごとに `rsBlocks` を再構築する | 情報 | 実測 7 ms に対し無視できる。memoize は M3 で必要になってから |
| R6 | 選ばれなかった 7 マスクの matrix はペナルティ評価のみで、デコード検証されない。マスク式の誤りが選択の偏りとして潜伏し得る | 低 | 本レビューで 8 式を規格と突合済み。既知ベクタが HELLO WORLD のマスク選択を固定しており、残余リスクは許容 |
| R7 | 防御的分岐（`INVALID_DATA` 2 箇所ほか）は公開 API から到達不能で、テストでも実行されない（4.5 節） | 記録 | 設計の明記どおり受け入れ。カバレッジ数値の解釈を本計画に記録 |

アルゴリズム全体（BitBuffer の MSB first 詰め・終端 4 bit・パディング `0xEC` / `0x11` 交互・GF(256) 既約多項式 `0x11d`・ジグザグ配置での timing 列スキップ・remainder bit の 0 埋め）に規格逸脱は見つからなかった。既知ベクタと round-trip の両輪で回帰は固定されていると判断する。

## 6. 受け入れ基準との対応と判定

| 受け入れ基準 | QA 判定 |
| --- | --- |
| 純関数で matrix 生成・外部 API を import しない | 適合。import は jsQR（テストのみ）を除きゼロ |
| 既知ベクタテスト | 適合 |
| jsQR round-trip（ASCII・日本語・1,024 byte 境界） | 適合。ただし絵文字（サロゲートペア）経路が未検証（P1） |
| 型付き Error での fail-closed | 適合（`DATA_TOO_LARGE` は検証済み、`INVALID_DATA` は到達不能で設計どおり） |
| カバレッジ 100% | 数値上は適合。解釈上の注意を 4.5 節に記録 |

## 7. Developer への反映依頼（優先度順）

| 優先度 | 依頼 | 理由 |
| --- | --- | --- |
| P1（必須） | 絵文字（サロゲートペア）の round-trip テストを追加する。例: `'招待🎌'` を encode し `binaryData` を `TextEncoder` の byte 列と比較する | UTF-8 4 byte 経路が未検証。仕様のテストマトリックスの欠落 |
| P2（推奨） | Version 境界の round-trip を追加する。180 / 181 byte（文字数指示子 8 bit → 16 bit 切替）と 106 / 107 byte（version 情報ブロック初出現） | 現状 16 bit 長経路と version 情報は Version 26 でのみ検証されており、境界での回帰検出力を上げる |
| P3（推奨） | `encodeQr` に `value.length > QR_ENCODER_MAX_BYTES` の事前チェックを追加する（UTF-8 byte 数 ≧ UTF-16 code unit 数のため誤遮断なし） | 巨大入力で上限判定前に O(n) の変換コストが発生する DoS 面の縮小（R4） |
| P4（任意） | 孤立サロゲートが U+FFFD へ正規化される挙動をテストまたはコメントで明文化する | round-trip の入力一致が well-formed 文字列に限る前提の明示 |

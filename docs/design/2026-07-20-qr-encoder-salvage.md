# 純 TypeScript QR エンコーダのサルベージ 設計

仕様の正本は [仕様書](../specs/2026-07-20-qr-encoder-salvage.md)。M1 の QR 表示設計は
[QR 招待・共有確認・Ready フローの設計](./qr-invite-and-ready-flow.md) を正本とする。

## 代替案の比較

### 案 A: 外部ライブラリ（`qrcode` npm 等）を M3 で採用する

- 利点: 実績があり、自前実装の保守が不要。
- 欠点: runtime 依存が増え、supply-chain hardening 方針（ADR-0001）と緊張する。主要
  ライブラリは Node の Buffer や canvas を前提にしたコードパスを含み、React Native /
  Expo 環境での動作保証に追加コストがかかる。matrix だけ欲しい用途に対して過剰。

### 案 B: 草稿の純 TypeScript エンコーダをサルベージする（採用）

- 利点: runtime 依存ゼロの純関数で、React Native / Web / Bun のどこでも同じ結果を返す。
  1,024 byte 上限が QR wire format（`src/protocol/qr-payload.ts`）の上限と一致する。
  既知ベクタテストとカバレッジ 100% が既にある。
- 欠点: 自前実装の正当性を自ら証明する必要がある。jsQR による round-trip テスト
  （encode → 画素化 → 実デコード → 入力一致）を常設して担保する。

### 案 C: リポジトリへ入れず scratchpad 保管のままにする

- 利点: 未使用コードを main に持たない。
- 欠点: scratchpad はセッション限りで永続でなく、検証されないままコードが失われる。
  M3 着手時に再実装または再発掘のコストが発生する。

案 B を選ぶ。依存を増やさないこと、wire format と上限が一致すること、正当性を実デコードで
機械検証できることから、最も小さく正しい構成になる。

## データの流れ・責務の境界・依存の向き

```text
（M3 予定）QrCodeView renderer -> src/qr/encoder.ts（純関数・依存なし）
                                   ^
                       encoder.test.ts -> jsQR（devDependency・テスト専用）
```

- `src/qr/` は protocol 層と同格の純関数層とする。React Native・Expo・Node API を
  import しない。
- 入力は UTF-8 文字列、出力は `EncodedQr`（version・誤り訂正レベル・boolean matrix）。
  描画・色・quiet zone の付与は将来の renderer 側の責務とし、encoder は matrix 生成
  だけを持つ。
- jsQR はテストからのみ import する。画素化（quiet zone 4 module・拡大率・RGBA 化）は
  テスト内の純関数で行い、実装側へ漏らさない。
- M1 の `src/components/qr-matrix.ts`（意図的に非スキャン可能な装飾表現）は変更しない。
  実 QR への切替は M3 の設計判断として ADR で行う。

## エッジケース・異常系・空状態・境界値

- 空文字列: Version 1 の有効な QR になる（byte mode・長さ 0）。
- 1,024 byte ちょうど: Version 26 で encode できる（境界テストで固定）。
- 1,025 byte: `QrEncodingError('DATA_TOO_LARGE')` を throw する。
- 多バイト UTF-8（日本語）: byte 数で判定し、同一入力は同一 matrix を返す（決定論）。
- 内部不整合（Version 範囲・mask 番号）: `QrEncodingError('INVALID_DATA')` で
  fail-closed にする。到達しないことが正常であり、防御的分岐として残す。RS block 表の
  構造は tuple 型で表現し、定義不正は実行時でなくコンパイル時に検出する。
- マスク選定: ISO/IEC 18004 の 4 penalty 規則で 8 マスクを評価し最小を選ぶ。同点時は
  番号の小さいマスクを採用する（決定論）。

## 検証

- 既知ベクタ: HELLO WORLD → Version 1・誤り訂正 M の固定 matrix（回帰防止）。
- round-trip: ASCII・日本語 UTF-8・1,024 byte 境界の各入力で encode → 画素化 →
  jsQR 実デコード → 入力一致を検証する。
- knip: 実装側の消費者が M3 まで存在しないため dead-code 報告に載るが、報告のみで
  gate ではない（ADR-0012）。採用意図は ADR-0024 に記録する。

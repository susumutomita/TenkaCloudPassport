# 純 TypeScript QR エンコーダのサルベージ 仕様書

## 概要

リモート実装（PR #39 以降）に superseded された 2026-07-17 のローカル草稿から、スキャン可能な QR Code Model 2 を依存追加なしで生成する純 TypeScript エンコーダ `src/qr/encoder.ts` をサルベージし、M3（実カメラ読取）の building block として main へ取り込む。フォローアップ F-R1WMJW の解消。

## ユーザーストーリー

- Guest として、M3 で Host の Invite QR を実カメラで読み取って Lounge へ参加するために、標準準拠でスキャン可能な QR が生成されていてほしい。
- 開発者として、supply-chain hardening 方針（ADR-0001）の下で runtime 依存を増やさずに QR 生成能力を持ちたい。

## 受け入れ基準

- [ ] `src/qr/encoder.ts` が QR Code Model 2・byte mode・誤り訂正 M・Version 1〜26 の matrix を純関数で生成する。React Native / Expo / Node API を import しない。
- [ ] 既知ベクタテスト（HELLO WORLD の固定 matrix）が回帰を防ぐ。
- [ ] jsQR による round-trip テスト（encode → 画素化 → 実デコード → 入力一致）が ASCII・日本語 UTF-8・1,024 byte 境界を検証する。多バイト入力は `binaryData` の byte 列比較で判定する。
- [ ] 空文字列は Version 1 の有効な QR（21x21 matrix）になる。
- [ ] 1,024 byte 超と内部不整合は型付き `QrEncodingError`（`DATA_TOO_LARGE` / `INVALID_DATA`）で fail-closed になる。
- [ ] カバレッジ 100% を維持し、`make before-commit` の全ゲートが緑。
- [ ] ADR-0024 が採用判断・代替案・jsQR devDependency 追加を記録する。
- [ ] フォローアップ F-R1WMJW を PR URL 付きで resolve する。

## 非機能要件

- パフォーマンス: 1,024 byte 入力（Version 26・8 マスク評価）の encode が実用時間（100 ms 未満）で完了する。UI スレッドを持たない純関数のため、将来の呼び出し側で必要になれば memoize できる。
- セキュリティ: runtime 依存の追加はゼロ。テスト専用に jsQR（純 JS・依存ゼロ・lifecycle script なし）を devDependency として追加し、`--ignore-scripts` 下でインストールする。
- アクセシビリティ: 本モジュールは UI を持たないため対象外。描画時の配慮は M3 の renderer 側で扱う。

## 技術設計

- データモデル: `EncodedQr`（`version` / `errorCorrection: 'M'` / `matrix: readonly boolean[][]`）。入力は UTF-8 文字列、上限 1,024 byte（QR wire format の上限と一致）。
- API エンドポイント: なし（純関数 `encodeQr(value: string): EncodedQr`）。
- UI コンポーネント: なし。M1 の `QrCodeView` / `qr-matrix.ts` は変更しない（意図的に非スキャン可能な装飾表現のままとする）。

## スコープ外

- `QrCodeView` への wiring（M1 は Screenshot 時に Payload が判読できないことを保証する設計のため、実 QR 表示への切替は M3 の設計判断として別途行う）。
- カメラ読取・QR デコードの実装。
- 草稿の x25519 / sha256（HEAD は `@noble/hashes` を採用済みのため破棄）。
- SVG renderer（草稿 `QrCode.tsx` は破棄）。

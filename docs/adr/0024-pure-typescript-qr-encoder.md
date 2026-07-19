# ADR-0024: QR Code Model 2 を純 TypeScript で生成する

- **Status**: Accepted
- **Date**: 2026-07-20
- **Deciders**: Susumu Tomita (oyster880)

## Context

M3 では Host が表示した Lounge Invite QR を Guest が実カメラで読み取る。現在の
`src/components/qr-matrix.ts` は M1 の設計判断として意図的に非スキャン可能な装飾表現であり、
実際にスキャンできる QR を生成する能力がリポジトリに存在しない。2026-07-17 のローカル草稿には
標準準拠の QR Code Model 2 encoder が実装済みだったが、同じ Issue 8 のリモート実装（PR 39 以降）
に superseded され、未コミットのまま残っていた（フォローアップ F-R1WMJW）。supply-chain
hardening（ADR-0001）の下で runtime 依存を増やさずにこの能力を確保する判断が必要である。
なお本 ADR は草稿時点で ADR-0012 の番号を持っていたが、main の
[ADR-0012](./0012-duplication-ratchet-and-dead-code-report.md) と衝突したため 0024 として採番し直した。

## Decision

草稿から `src/qr/encoder.ts` をサルベージし、M3 の building block として main へ取り込む。
UTF-8 byte mode、必要最小 Version（1〜26）、Error Correction Level M、Reed-Solomon block、
8 種類の mask 評価を純関数で処理し、同じ入力は同じ boolean matrix を返す。QR Protocol の
上限に合わせて入力は 1,024 byte 以下に限定する。encoder は React、React Native、Expo、
Node API を import しない。M1 の `QrCodeView` / `qr-matrix.ts` には接続せず、実 QR 表示への
切替は M3 の設計判断として別 ADR で行う。

自前実装の正当性は、テスト専用 devDependency として追加する jsQR（純 JS・依存ゼロ・
lifecycle script なし）による round-trip テスト（encode → 画素化 → 実デコード → 入力一致）で
機械検証する。runtime 依存はゼロのまま変わらない。

比較した案は次のとおりである。

1. QR encode library（`qrcode` npm 等）を M3 で追加する案。標準対応を再利用できるが、runtime
   依存が増えて supply-chain 最小化に反し、Node の Buffer や canvas を前提にしたコードパスが
   React Native / Expo での動作保証に追加コストを生むため採用しない。
2. 外部 Web API または OS の online QR 生成機能を使う案。実装量は少ないが、offline 要件と
   Public Passport を端末外へ送らない Privacy 契約に反するため採用しない。
3. 草稿をリポジトリへ入れず scratchpad 保管のままにする案。未使用コードを main に持たないが、
   検証されないままコードが失われ、M3 着手時に再実装コストが発生するため採用しない。
4. 草稿の bounded な純 TypeScript encoder をサルベージし、jsQR round-trip で正当性を常時検証する
   案。標準アルゴリズムと block table の保守が必要だが、offline、決定性、runtime 依存ゼロ、
   UI 非依存を同時に満たすため採用する。

## Consequences

- **Good**: Public Passport と Invite を端末外へ送らずにスキャン可能な QR matrix を生成できる。
- **Good**: スキャン可能性が既知ベクタと jsQR 実デコードの両方でテストとして固定される。
- **Good**: SVG、Camera、将来の Transport を encoder から独立して交換できる。
- **Bad**: Reed-Solomon、mask、Version block table を自前で保守する必要がある。
- **Bad**: M3 で wiring されるまで実装側の消費者が存在せず、knip の dead-code 報告に載り続ける
  （報告のみで gate ではない。[ADR-0012](./0012-duplication-ratchet-and-dead-code-report.md)）。
- **Tradeoff**: 依存追加が将来許可され、license、lockfile、lifecycle、bundle、offline の審査を
  通過する実装が得られた場合は、新しい ADR で置換を再検討する。

## References

- 関連コード: [`src/qr/`](../../src/qr/)。
- 関連文書: [サルベージ仕様書](../specs/2026-07-20-qr-encoder-salvage.md)、
  [サルベージ設計](../design/2026-07-20-qr-encoder-salvage.md)、
  [QR 招待・共有確認・Ready フローの設計](../design/qr-invite-and-ready-flow.md)。
- 関連 ADR: [ADR-0001](./0001-supply-chain-hardening.md)、
  [ADR-0009](./0009-schema-versioning-and-strict-boundaries.md)。
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/66。

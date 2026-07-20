# ADR-0025: Ink / Summit ブランドへの統一と react-native-svg の採用

- **Status**: Accepted
- **Date**: 2026-07-20
- **Deciders**: Susumu Tomita (oyster880)

## Context

Passport は独自トーン（クリーム地・フォレストグリーン・オレンジ）で実装されてきたが、
TenkaCloud 本体・ポータルは Ink / Summit ブランド（墨モノクロ + サミットオレンジ + 山頂
マーク）で統一されており、同一プロダクト群として地続きの見た目になっていない。Owner が
claude.ai/design で作成した `TenkaCloud Passport Redesign.dc.html` がリデザインの正本として
承認された。色の正本は `src/ui/theme.ts` に集約済みで、直書き hex はリポジトリに存在しない。

## Decision

`src/ui/theme.ts` のトークンを Ink / Summit へ差し替え、全画面へ波及させる。対応表と
WCAG 2.1 AA を優先した調整（Ready 文字色・ダーク面補助文字の不透明度）は
[設計書](../design/2026-07-20-ink-summit-redesign.md) を正本とする。フォントはシステム
フォントを使い、Inter / Noto Sans JP / JetBrains Mono の同梱はしない。domain データ・
文言・挙動は変更しない。

ブランドの山頂マークの描画に `react-native-svg` を runtime 依存として採用する。理由:

1. Expo Go 同梱モジュールであり、Development Build を要求しない。
2. M3 で実 QR（[ADR-0024](./0024-pure-typescript-qr-encoder.md) の encoder が返す matrix）を
   描画する際に同じ依存を使うため、先行採用に相乗がある。
3. View の border による擬似描画ではブランドマークの stroke 表現を再現できない。

バージョンは `bunx expo install` で Expo SDK 57 互換版に固定し、lifecycle script は
`--ignore-scripts` と `trustedDependencies = []`（ADR-0001）で無効のまま導入する。

## Consequences

- **Good**: 以後の画面追加が theme 参照だけでブランドへ自動的に揃う。
- **Good**: M3 の実 QR 描画に必要な SVG 基盤が先に入る。
- **Bad**: runtime 依存が 1 つ増え、supply chain の監視対象になる。
- **Bad**: デザイン mock の一部の値（Ready 文字色等）は AA 優先で意匠から乖離する。
- **Tradeoff**: フォント同梱を見送ったため、書体は端末により Inter / Noto と完全一致
  しない。ブランド忠実度が問題になったら expo-font 同梱を新しい ADR で再検討する。

## References

- 関連コード: [`src/ui/theme.ts`](../../src/ui/theme.ts)、`src/components/BrandMark.tsx`。
- 関連文書: [仕様書](../specs/2026-07-20-ink-summit-redesign.md)、
  [設計書](../design/2026-07-20-ink-summit-redesign.md)。
- 関連 ADR: [ADR-0001](./0001-supply-chain-hardening.md)、
  [ADR-0024](./0024-pure-typescript-qr-encoder.md)。
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/70。

# Ink / Summit リデザイン 仕様書

## 概要

claude.ai/design プロジェクト「TenkaCloudPassport デザイン見直し」の
`TenkaCloud Passport Redesign.dc.html` を正本として、アプリの視覚を旧トーン
（クリーム #f4f1ea + フォレストグリーン #185c4b + オレンジ #d57835）から TenkaCloud 本体と
地続きの Ink / Summit ブランド（墨モノクロ #1d1d1f 系 + サミットオレンジ #ff6a32 +
山頂マーク）へ統一する。あわせて GitHub Pages の LP も同ブランドへ揃える。

## ユーザーストーリー

- イベント参加者として、TenkaCloud 本体・ポータルと同じ見た目の Passport を使うことで、
  同一プロダクト群であることを迷わず認識したい。
- メンテナとして、色・余白・意匠の正本を `src/ui/theme.ts` に集約し、以後の画面追加が
  自動的にブランドへ揃うようにしたい。

## 受け入れ基準

- [ ] `src/ui/theme.ts` のトークンを Ink / Summit へ差し替え、全画面に波及させる。
      新パレット: ink #1d1d1f / muted #6e6e73 / mutedLight #86868b / border #d2d2d7 /
      borderSubtle #e8e8ed / surface #f5f5f7 / background #ffffff / accent(summit) #ff6a32 /
      success #2f9e63 / info #3b82f6 / warning #c98a14。
- [ ] デザインが定義する 5 画面（Local Profile / Host Invite / Active Lounge /
      Owner Question / Outcome・Bridge）は意匠（ink 塗りの primary ボタン・radius 12、
      白カード + `#e8e8ed` 枠 + radius 14〜16、mono 大文字の eyebrow ラベル、状態ドット）
      まで合わせる。
- [ ] ブランドの山頂マーク（bar + peak）を共通コンポーネントとして実装し、5 画面の
      ヘッダーへ「TenkaCloud Passport」ロックアップとして表示する。
- [ ] フォントはシステムフォントで実現する（依存追加なし。mono ラベルは platform の
      monospace）。
- [ ] domain データ・文言・挙動は不変（絵文字カタログ・上限値・i18n 文言・状態遷移に
      変更なし）。既存テストの挙動アサーションを変えない（色の期待値のみ更新可）。
- [ ] コントラストは WCAG 2.1 AA を維持する。accent #ff6a32 は白背景の本文色に使わない
      （ドット・バッジ・ダーク面上のラベルに限定）。
- [ ] `site/index.html`（LP）を同ブランドへ更新する。査証スタンプ + MRZ のシグネチャは
      維持し、トークンと山頂マークを差し替える。外部リクエストゼロを維持する。
- [ ] カバレッジ 100% を維持し `make before-commit` の全ゲートが緑。

## 非機能要件

- パフォーマンス: スタイル変更のみで render コストを増やさない（画像アセット追加なし、
  グラデーションは 5 画面の限定要素のみ）。
- セキュリティ: runtime 依存の追加は原則なし。山頂マークの描画に `react-native-svg` を
  採用する場合は Expo SDK 57 互換版を `bunx expo install` で固定し、ADR に記録する
  （代替案は設計書で比較）。
- アクセシビリティ: 既存の accessibility 契約テスト（表示順序・accessibilityLabel・
  touch target・font scaling）をすべて維持する。

## 技術設計

- データモデル: 変更なし。
- API エンドポイント: なし。
- UI コンポーネント: `src/ui/theme.ts`（トークン正本）、`src/components/BrandMark`（新規・
  山頂マーク + ロックアップ）、既存 Screen / 共通コンポーネントのスタイル調整。

## スコープ外

- 絵文字カタログ・会話の材料カタログ・上限値などの domain データ変更（mock の 🐰🐻 は
  採用しない）。
- 文言変更（i18n の既存文言を維持する）。
- Inter / Noto Sans JP / JetBrains Mono のフォント同梱（必要になれば別 PR + ADR）。
- ダークモード対応。
- デザイン mock の iPhone フレーム・キャンバス演出（プレゼン用要素）。

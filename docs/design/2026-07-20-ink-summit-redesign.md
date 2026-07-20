# Ink / Summit リデザイン 設計

仕様の正本は [仕様書](../specs/2026-07-20-ink-summit-redesign.md)。ビジュアルの正本は
claude.ai/design「TenkaCloudPassport デザイン見直し」の `TenkaCloud Passport Redesign.dc.html`。

## 代替案の比較（適用方法）

### 案 A: 各 Screen の色を直接書き換える

- 利点: 画面ごとに最適化できる。
- 欠点: 色の正本が消えて drift する。30 画面超の一貫性をレビューで担保できない。

### 案 B: `src/ui/theme.ts` のトークン差し替え + 意味トークン追加（採用）

- 利点: 既存の全画面が theme を参照しているため、差し替えが自動で波及する。
  success / info / warning / borderSubtle / mutedLight を意味トークンとして追加し、
  デザインの状態ドット・淡い枠線を名前で表現できる。以後の画面追加も自動で揃う。
- 欠点: トークン粒度を超える意匠（ボタン形状・カード枠）は個別調整が残る（5 画面で実施）。

### 案 C: デザインシステムを別 package へ切り出す

- 利点: TenkaCloud 本体との共有可能性。
- 欠点: 単一アプリの現段階では過剰。AGENTS.md の「単一アプリの間は workspace を作らない」
  方針に反する。

案 B を選ぶ。

## トークン対応表（旧 → 新）

| トークン | 旧 | 新 | 備考 |
| --- | --- | --- | --- |
| background | #f4f1ea | #ffffff | 画面地は白 |
| surface | #fffdf8 | #f5f5f7 | 淡いパネル・選択面 |
| ink | #17201d | #1d1d1f | 本文・見出し |
| muted | #5d6863 | #6e6e73 | 補助テキスト |
| mutedLight | （新規） | #86868b | mono ラベル・キャプション。小さい本文には使わない |
| border | #c9d1cc | #d2d2d7 | 入力枠・区切り |
| borderSubtle | （新規） | #e8e8ed | カード枠・薄い区切り |
| primary | #185c4b | #1d1d1f | primary ボタンは ink 塗り |
| primaryPressed | #104537 | #000000 | 押下 |
| primarySoft | #dcebe4 | #f5f5f7 | 選択背景 |
| accent | #d57835 | #ff6a32 | Summit。ドット・バッジ・ダーク面上のみ |
| warning | #d57835 系 | #b07708 | 期限ドット。白地・淡地で 3:1 を確保（#c98a14 は 2.95:1 で不可） |
| success | （新規） | #2f9e63 | 状態ドット用 |
| successText | （新規） | #1f7a49 | 白地の Ready ラベル文字用（AA 確保） |
| info | （新規） | #3b82f6 | discovering ドット |
| warningText | （新規） | #8a6a12 | 白地・淡地の期限文言用 |
| danger | #9f3434 | #9f3434 | 変更なし |
| disabled | #aeb7b2 | #c7c7cc | |
| white | #ffffff | #ffffff | |

コントラスト検証（白地・WCAG 相対輝度式で再計算した実測値）: ink 16.83:1 / muted 5.07:1 /
successText 5.33:1 / warningText 5.06:1 / danger は AA（4.5:1）を満たす。mutedLight 3.62:1 と
accent 2.85:1 は本文に使わない（mono ラベル・キャプション・ダーク面上に限定）。状態ドットは
非テキスト UI として 3:1 を満たす必要があり、success 3.39:1 / info は白地で合格するが、
warning は当初値 #c98a14 が 2.95:1 で 3:1 を割るため #b07708（白地 3.8:1・淡地でも 3:1 以上）へ
変更する。テストは記載値でなく WCAG 式そのもので判定し、`src/ui/theme.test.ts` を新設して
固定する（旧 contrast テストは存在しないため更新ではなく新設）。

disabled 状態: 「surface 地 + disabled 文字で 3:1 を保つ」という当初記述は実測 1.55:1 で成立
しない。WCAG 2.1 は inactive（disabled）な UI コンポーネントを 1.4.3 / 1.4.11 の対象外とするため
違反ではないが、コントラストでの識別は主張しない。primary ボタンの disabled は ink 塗りを薄める
のではなく surface 地 + disabled 文字とし、押下不可であることは `accessibilityState` の disabled と
文脈（相手の Ready 待ち等）で伝える。

## 山頂マーク（BrandMark）の代替案

### 案 a: `react-native-svg` を採用する（採用）

- 利点: デザインの mark（bar + peak の stroke パス）を忠実に描ける。Expo Go 同梱
  モジュールであり Development Build 不要。M3 で実 QR（ADR-0024 の encoder 出力）を
  描画する際にも同じ依存を使うため、先行採用に相乗がある。
- 欠点: runtime 依存の追加。`bunx expo install react-native-svg -- --ignore-scripts` で
  SDK 57 互換版に固定し、supply chain 上の判断を ADR-0025 に記録する。

### 案 b: View の border 三角形で擬似描画する

- 利点: 依存ゼロ。
- 欠点: stroke の丸め・線幅を再現できず、ブランドの顔が劣化コピーになる。

### 案 c: テキストロックアップのみ（マークは後回し）

- 利点: 最小。
- 欠点: 「地続きの見た目」というデザインの目的に対しマーク不在は欠落が大きい。

案 a を選ぶ。導入に問題が出た場合は案 c へ退避し、フォローアップへ記録する。

## データの流れ・責務の境界・依存の向き

```text
Screen / components -> src/ui/theme.ts（色・余白の唯一の正本）
Screen -> src/components/BrandMark.tsx -> react-native-svg
site/index.html（LP）は同じ 16 進値を CSS custom properties として保持（runtime 共有はしない）
```

- 色の 16 進値を theme.ts 以外の実装へ直書きしない（LP は静的 HTML のため例外。値の
  一致はレビューで担保する）。
- BrandMark は `size` と `color` だけを受ける純表示コンポーネントとし、文言を持たない。
- domain / protocol / app 層には一切触れない。

## 5 画面の意匠調整（トークンを超える部分）

- primary ボタン: ink 塗り・radius 12・高さ 52。secondary: 白地 + border・radius 12。
- カード: 白地 + borderSubtle 枠 + radius 14〜16 + 弱い影。
- eyebrow ラベル: monospace・大文字・letter-spacing 広め・mutedLight。
- 状態表示: 7px ドット + mono ラベル（Ready=success、期限=warning、探索中=info）。
- Bridge カード（Outcome）: ink 地 + summit のラジアルグロー + 白文字（デザイン準拠）。

## エッジケース・異常系・空状態・境界値

- 色 hex を固定している既存テスト（accessibility 契約・contrast 検証）は、挙動
  アサーションを変えずに期待値のみ新トークンへ更新する。
- disabled / busy 状態: ink ボタンの disabled は surface 地 + disabled 文字とする。この組は
  実測 1.55:1 でコントラストによる識別は主張しない（WCAG 2.1 は disabled な UI コンポーネントを
  1.4.3 / 1.4.11 の対象外とする）。押下不可は `accessibilityState` の disabled と文脈で伝える。
  上の「disabled 状態」段落を正本とする。
- ダーク面（Bridge カード）上の補助文字は rgba(255,255,255,.5) 以上を使わない
  （デザイン値 .5 は 10px 級のため .68 へ引き上げて AA を守る。意匠より契約を優先）。
- font scaling: 既存の font-scaling テスト対象画面で、意匠調整後も折り返し破綻が
  ないことをソース契約テストの範囲で維持する。
- LP: 査証スタンプ（朱色）は Ink / Summit でも押印文化のシグネチャとして残すが、
  色は summit #ff6a32 系へ寄せ、緑（pine）系トークンを全廃する。

## テスト戦略

- theme.ts の新トークンと値は BDD テストで固定する（対応表がそのまま仕様）。
- BrandMark はソース契約テスト（SVG パス定数・props 境界）で固定する。
- 5 画面は既存のソーステキスト契約テスト（表示順序・accessibilityLabel）を緑に保った
  まま、スタイル定数の参照をトークン経由へ寄せる。

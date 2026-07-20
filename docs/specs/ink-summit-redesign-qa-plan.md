# Ink / Summit リデザイン QA 計画

## スコープ

- Issue: <https://github.com/susumutomita/TenkaCloudPassport/issues/70>。
- Role: QA Engineer。
- 対象: `src/ui/theme.ts` のトークン差し替え、`src/components/BrandMark.tsx`（新規）、5 画面の意匠調整、`site/index.html`（LP）のブランド更新。
- 正本: [仕様書](./2026-07-20-ink-summit-redesign.md) / [設計書](../design/2026-07-20-ink-summit-redesign.md) / [ADR-0025](../adr/0025-ink-summit-brand-and-svg.md)。
- 検証環境: bun 1.3.11 / Apple Silicon macOS (Darwin 25.5.0)。コントラスト値は本計画に記載の再計算スクリプトによる実測。
- QA 時点の前提: `src/ui/theme.ts` は旧パレットのまま（実装未着手）。`site/index.html` は作業中の未コミット変更として新パレットへ更新済み。本計画は実装完了時の受け入れ検証手順として書く。

## 1. テスト計画

### 1.1 トークン値の全数検証

`src/ui/theme.ts` の全トークンを BDD テストで固定する。設計書は「既存の contrast 検証テストは新値で更新する」と書くが、現状 theme の色値を固定するテストはリポジトリに存在しない（`src/` 全体を grep で確認済み）。したがって更新ではなく新規作成が必要である（P2 指摘、6 章）。

検証内容は次の 3 点。

1. 下表の全トークンが期待値と一致する（1 件ずつ `it` で固定する）。
2. `colors` のキー集合が下表と過不足なく一致する（キーの増減を検出する）。
3. `spacing` の既存値（6 / 10 / 16 / 24 / 32）が変わっていない（本 Issue のスコープは色のみ）。

| トークン | 期待値 | 用途制約（1.2 で検証） |
| --- | --- | --- |
| background | #ffffff | 画面地 |
| surface | #f5f5f7 | 淡いパネル・選択面 |
| ink | #1d1d1f | 本文・見出し・primary ボタン地 |
| muted | #6e6e73 | 補助テキスト |
| mutedLight | #86868b | mono ラベル・キャプション。小さい本文には使わない |
| border | #d2d2d7 | 入力枠・区切り |
| borderSubtle | #e8e8ed | カード枠・薄い区切り |
| primary | #1d1d1f | primary ボタンは ink 塗り |
| primaryPressed | #000000 | 押下 |
| primarySoft | #f5f5f7 | 選択背景 |
| accent | #ff6a32 | ドット・バッジ・ダーク面上のみ。白地の本文に使わない |
| success | #2f9e63 | 状態ドット用。白地の文字に使わない |
| successText | #1f7a49 | 白地の Ready ラベル文字用 |
| info | #3b82f6 | discovering ドット。小さい本文に使わない |
| warning | #c98a14 | 期限ドット（2 章の指摘参照） |
| warningText | #8a6a12 | 白地・淡地の期限文言用 |
| danger | #9f3434 | 変更なし |
| disabled | #c7c7cc | 変更あり（3 章の視認性確認参照） |
| white | #ffffff | 変更なし |

### 1.2 新規トークンの使用箇所検証

新規トークン（mutedLight / borderSubtle / success / successText / info / warning / warningText）が設計どおりの箇所で使われ、誤用がないことをソース契約テスト（`accessibility-test-kit.ts` の方式）で固定する。

- 状態ドット: Ready = `colors.success`、期限 = `colors.warning`、探索中 = `colors.info` を参照している。
- 白地・淡地の状態文言: `colors.successText` / `colors.warningText` を参照し、`colors.success` / `colors.warning` を Text の `color` に使っていない。
- eyebrow ラベル: `colors.mutedLight` + monospace。`colors.mutedLight` を通常本文の `color` に使っていない。
- カード枠: `colors.borderSubtle`。
- 誤用ガード: `color: colors.accent` を白地の Text に使っていない。許可はダーク面（Outcome の Bridge カード）上のラベルのみとし、許可箇所を明示した上で他画面での出現をテストで禁止する。
- 全 `.tsx` に 16 進値の直書きがない（`grep -rn "#[0-9a-fA-F]\{6\}" src --include="*.tsx"` が 0 件。現状も 0 件であることを確認済み）。

### 1.3 旧色 hex 消滅の grep 検証

実装完了後、以下の旧 hex がリポジトリの実装・サイトから消えていることを機械検証する。対象は `src/`、`site/`、`App.tsx`、`assets/`。`docs/`（仕様書・設計書・本計画・過去の設計レビュー文書）は履歴として旧値を記載するため対象外とする。

旧 app パレット（`src/ui/theme.ts` 由来）:

```text
#f4f1ea #fffdf8 #17201d #5d6863 #c9d1cc #185c4b #104537 #dcebe4 #d57835 #aeb7b2
```

旧 LP パレット（`site/index.html` 由来。app とは別系統の旧値を持つ）:

```text
#f5f1e8 #ece6d8 #4c5a54 #2e5e4e #e8ede9 rgba(46, 94, 78
```

検証コマンド例:

```bash
grep -rniE "f4f1ea|fffdf8|17201d|5d6863|c9d1cc|185c4b|104537|dcebe4|d57835|aeb7b2|f5f1e8|ece6d8|4c5a54|2e5e4e|e8ede9|46, 94, 78" \
  src site App.tsx assets
```

期待結果は 0 件。`#9f3434`（danger）は変更なしのため検証対象に含めない。`#17201d` は app 旧 ink と LP 旧 ink の両方に使われていた値であり、どちらの残存も検出できる。

### 1.4 LP と theme.ts の 16 進値一致検証

設計書は「LP は同じ 16 進値を CSS custom properties として保持し、値の一致はレビューで担保する」と定める。手順:

1. `grep -oE "#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)" site/index.html | sort -u` で LP の全色値を列挙する。
2. 各値を theme トークン表（1.1）と突き合わせ、共有概念のトークン（ink / summit / surface / borderSubtle / muted / mutedLight / successText / warningText / border）は 16 進値が完全一致することを確認する。
3. LP 固有色（査証スタンプ・MRZ 帯等）は設計書に根拠が書かれていることを確認する。

QA 時点の LP 作業版に対して手順を先行実施した結果、以下の乖離を検出済み（6 章の P2 指摘）。

- `#f5f6f8`: surface #f5f5f7 と 1 桁違いの近似値。トークンに存在しない。
- `#e9e9ec` / `#e7e8ec`: borderSubtle #e8e8ed の近似値。トークンに存在しない。
- `#8f2c1c` / `rgba(181, 58, 38, 0.12)`: 査証スタンプ系。仕様の「summit #ff6a32 系へ寄せる」との適合根拠が設計書に未記載。

あわせて LP の外部リクエストゼロ維持を確認する。`grep -nE "https?://" site/index.html` の一致がアンカーの `href`（GitHub リンク等）のみで、`<script src>` / `<link href>` / `<img src>` / `@import` / `url(` に外部ホストが存在しないこと。

### 1.5 既存契約テストの回帰実行

`bun test` 全件緑 + カバレッジ 100% を確認する。特に注視するのは次のテスト。

- `src/screens/qr-invite-accessibility.test.ts`: 表示順序・`react-native-svg` を含む禁止 import（3 章参照）。
- `src/screens/settings-accessibility.test.ts`: 言語選択の variant + 文言の二重表現。
- `src/screens/touch-target.test.ts`: 意匠調整後も `minHeight` / `height` が 44 pt 以上。
- `src/screens/font-scaling.test.ts`: `allowFontScaling` 無効化なし・`numberOfLines={1}` なし・Privacy 系 6 画面に 100 以上の固定 `height` なし。
- `owner-question-accessibility` / `passport-onboarding-accessibility` / `pilot-measurement-accessibility` / `active-lounge-*`: 文言・順序契約が色替えの副作用で壊れていないこと。

## 2. コントラスト検証（WCAG 2.1 AA の独立再計算）

### 2.1 方法

設計書の数値を鵜呑みにせず、WCAG 2.1 の相対輝度式で全組を再計算した。式は以下のとおり（sRGB 8bit 値 c8 に対して）。

```text
c = c8 / 255
c' = c / 12.92                （c <= 0.03928 のとき）
c' = ((c + 0.055) / 1.055)^2.4（それ以外）
L = 0.2126 R' + 0.7152 G' + 0.0722 B'
ratio = (L_hi + 0.05) / (L_lo + 0.05)
```

半透明白文字は下地への合成色（`c = a * 255 + (1 - a) * bg`）を先に求めてから比を取った。判定基準は通常文字 4.5:1（AA）、大きい文字・非テキスト UI 3.0:1（AA / 1.4.11）。

### 2.2 再計算結果（設計書記載組）

| 組 | 設計書 | 再計算 | 要求 | 判定 |
| --- | --- | --- | --- | --- |
| ink #1d1d1f / 白 | 16.9 | 16.83 | 4.5 | AA 合格 |
| muted #6e6e73 / 白 | 5.3 | 5.07 | 4.5 | AA 合格（設計書は過大） |
| successText #1f7a49 / 白 | 4.6 | 5.33 | 4.5 | AA 合格（設計書は過小） |
| warningText #8a6a12 / 白 | 5.6 | 5.06 | 4.5 | AA 合格（設計書は過大） |
| mutedLight #86868b / 白 | 3.5 | 3.62 | 3.0（大型・UI 限定） | 合格 |
| success #2f9e63 / 白 | 3.1 | 3.39 | 3.0（ドット限定） | 合格 |
| accent #ff6a32 / 白 | 2.9 | 2.85 | 参考 | 3.0 未満。本文使用禁止の裏付け |

設計書の 7 値のうち 6 値が再計算と一致しない（最大乖離は successText の 0.73）。いずれも AA の合否判定は変わらないため実装ブロッカーではないが、設計書のコントラスト表は再計算値へ修正すること（6 章 P2）。

### 2.3 設計書に記載のない組の再計算（新規判明を含む）

| 組 | 再計算 | 要求 | 判定 |
| --- | --- | --- | --- |
| warning #c98a14 / 白 | 2.95 | 3.0（非テキスト UI） | 不合格。要対処（6 章 P1） |
| info #3b82f6 / 白 | 3.68 | 3.0（ドット限定） | 合格。ただし 4.5 未満のため小さい本文には使えない |
| danger #9f3434 / 白 | 6.97 | 4.5 | AA 合格 |
| 白 / danger #9f3434 | 6.97 | 4.5 | AA 合格（danger 塗りボタンの白文字） |
| 白 / ink #1d1d1f（primary ボタン） | 16.83 | 4.5 | AA 合格 |
| 白 / primaryPressed #000000 | 21.00 | 4.5 | AA 合格 |
| muted / surface #f5f5f7 | 4.66 | 4.5 | AA 合格（淡地でも成立） |
| successText / surface | 4.90 | 4.5 | AA 合格 |
| warningText / surface | 4.65 | 4.5 | AA 合格（余裕 0.15。surface より濃い地に載せない） |
| mutedLight / surface | 3.33 | 3.0（大型・UI 限定） | 合格 |
| disabled #c7c7cc / 白 | 1.68 | 除外（WCAG 1.4.3 / 1.4.11 の inactive 除外） | 3 章で視認性を手動確認 |
| disabled #c7c7cc / surface | 1.55 | 同上 | 同上 |
| surface #f5f5f7 / 白（primarySoft 選択面） | 1.09 | 参考 | 色のみでは選択を識別できない（3 章） |
| border #d2d2d7 / 白 | 1.51 | 参考 | 枠線は装飾扱い。境界を担う場合は不足 |

### 2.4 ダーク面（ink 地・Bridge カード）の再計算

| 組 | 再計算 | 要求 | 判定 |
| --- | --- | --- | --- |
| 白 / ink #1d1d1f | 16.83 | 4.5 | AA 合格 |
| rgba(255,255,255,0.68) 合成 / ink | 8.39 | 4.5 | AA 合格（AAA 7.0 も超える） |
| rgba(255,255,255,0.5) 合成 / ink（mock 値） | 5.14 | 参考 | AA 4.5 を実は満たす（下記補足） |
| accent #ff6a32 / ink | 5.90 | 3.0（ラベル・大型） | 合格（4.5 も超えるため小さい文字にも使える） |

補足: 設計書は「デザイン値 .5 は 10px 級のため .68 へ引き上げて AA を守る」と書くが、再計算では 0.5 でも 5.14:1 で AA 4.5:1 を満たす。0.68 への引き上げは AA 遵守のためではなく 10px 級の可読性確保として妥当であり、判断自体は支持するが理由付けの記述は修正が必要（6 章 P3）。

### 2.5 再現手順

再計算はテストとしてリポジトリに残すことを推奨する（例: `src/ui/theme-contrast.test.ts` に相対輝度関数と各組の閾値アサーションを実装する。theme の値が変わると自動で落ち、以後のトークン変更に AA 検証が随伴する）。上表の値は 2.1 の式による決定的計算であり、任意の実装で再現できる。

## 3. 回帰観点（全画面波及で壊れうるもの）

### 3.1 disabled 状態の視認性

- 設計書の「#f5f5f7 地 + disabled 文字で 3:1 の UI コンポーネント境界を保つ」は再計算で不成立（disabled 文字 / surface 地 = 1.55、surface 地 / 白背景 = 1.09。どの組も 3:1 に達しない）。WCAG は inactive コンポーネントを 1.4.3 / 1.4.11 の対象から除外するため AA 違反ではないが、設計書の記述は誤りであり訂正が必要（6 章 P1）。
- 手動確認: SettingsScreen の `disabled={modelManagement.busy}` 状態、HostInviteScreen の Ready 済みボタン等で、disabled ボタンが「存在は視認できるが押せないと分かる」こと。視認性が不足する場合の代替は disabled 文字を mutedLight #86868b（surface 地で 3.33:1）へ変更する案を提示する。
- 旧パレット（disabled #aeb7b2 / 地 #f4f1ea）も低コントラストだったため相対的な劣化は小さいが、白地化で背景との分離が弱くなる方向の変更である。

### 3.2 選択状態 primarySoft の識別性

- 新 primarySoft #f5f5f7 と白カード地の比は 1.09:1 で、色だけでは選択状態を識別できない。旧パレットは緑系の色相差（#dcebe4）で識別できていたため、これは明確な回帰リスクである。
- WCAG 1.4.1（色だけに依存しない）の観点から、選択状態は色以外の手がかり（枠線の変化・チェック表示・文言）を必須とする。`settings-accessibility.test.ts` は「variant と文言の両方で示す」を既に固定しているが、文言は accessibilityLabel（読み上げ）であり視覚的手がかりではない。選択時に `border` の色または太さを変える（ink 枠等）実装を要求する（6 章 P1）。border #d2d2d7 / surface は 1.38:1 で枠としても弱いことに注意する。
- 対象: SettingsScreen の言語選択、ClueSelector、PetEmojiSelector、LanguageSelector の選択状態。

### 3.3 danger の白地コントラスト

- danger #9f3434 は変更なし。白地文字 6.97:1、danger 塗り + 白文字 6.97:1 でいずれも AA 合格。背景が cream #f4f1ea から純白へ変わるが比は改善方向であり回帰なし。確認のみ。

### 3.4 Expo Go / Web での react-native-svg 動作

- BrandMark を表示する 5 画面すべてを Expo Go（iOS 実機または simulator）と Web（`bun run web`）で目視確認する。react-native-svg は Expo Go 同梱だが、Web では react-native-web 側の SVG 実装経路を通るため両環境の確認が必要。
- 契約テストとの整合（重要）: `qr-invite-accessibility.test.ts` の `FORBIDDEN_NATIVE_TRANSPORT_IMPORTS` は HostInviteScreen / QrScanScreen / QrCodeView / domain 層のソーステキストに `react-native-svg` の文字列が現れることを禁止している。Host Invite は BrandMark を載せる 5 画面の 1 つなので、Screen 側は `../components/BrandMark` の import に限定し、`react-native-svg` の文字列をコメント含め書かないこと（6 章 P1）。BrandMark 自体の import 契約は BrandMark のソース契約テストで固定する。
- QrCodeView は現契約のまま（react-native-svg 禁止）とし、実 QR の SVG 化は M3 で契約ごと見直す。この Issue では触れない。

### 3.5 touch target と font scaling

- primary ボタン高さ 52 は `MIN_TOUCH_TARGET`（44）以上で適合。意匠調整で `ActionButton` / 各 Selector の `minHeight` を 44 未満に下げないこと（`touch-target.test.ts` が機械検証）。
- 意匠調整で Privacy 系 6 画面（PassportCreation / EncounterSetup / PassportSharePreview / OwnerQuestion / BackupExport / BackupImport）の Text コンテナへ 100 以上の固定 `height` を入れないこと（`font-scaling.test.ts` が機械検証）。Bridge カード（ink 地）へ固定高を使う場合は `minHeight` を使う。
- eyebrow の monospace・letter-spacing 拡大は 200% スケール時に折り返し破綻を起こしやすい。5 画面の目視確認に 200% text scale を含める。

### 3.6 その他の波及

- `App.tsx` の `StatusBar style="dark"` は白地で引き続き正しい（変更不要であることの確認）。
- 5 画面以外の全 Screen（30 画面規模）はトークン差し替えの自動波及を受ける。ScreenCard / AppScreen / NoticeCard / ActionButton の共通コンポーネント経由で全画面へ及ぶため、5 画面以外から最低 3 画面（BackupExport / LocalDiagnostics / DestroyedLounge 等の非主要画面）を抜き取りで目視確認する。

## 4. E2E 観点（bun run web スモーク）

手順（Step 1 = PassportCreationScreen。`src/app/PassportApp.tsx` が Step 1 と定義する初期画面）。

1. `make install` 済みの状態で `bun run web` を実行する（`expo start --web`）。
2. ブラウザで開き、Step 1（Passport 作成画面）が表示されることを確認する。
3. DevTools の computed style で次を確認する。
   - 画面地が `#ffffff`（旧 `#f4f1ea` でない）。
   - primary ボタンの地が `#1d1d1f`・radius 12・白文字。
   - カード枠が `#e8e8ed`。
   - eyebrow ラベルが monospace + `#86868b`。
4. ヘッダーに BrandMark（山頂マーク + 「TenkaCloud Passport」ロックアップ）が SVG として描画されていることを確認する（`<svg>` 要素の存在を DOM で確認する）。
5. ブラウザ console にエラー・警告（特に react-native-svg 由来）がないことを確認する。
6. 言語切替（Settings まで遷移可能なら）で JA / EN を切り替え、文言が旧来どおり表示されることを確認する（文言不変の受け入れ基準）。
7. `nr build:web` が成功し、`dist/` 出力に外部ホストへの参照が混入していないことを確認する。

## 5. セキュリティ観点（react-native-svg の supply chain チェックリスト)

ADR-0025 と ADR-0001（supply chain hardening）に基づく導入時チェック。

- [ ] 導入コマンドが `bunx expo install react-native-svg -- --ignore-scripts` であること（`npx` 不使用。`INVARIANT_NO_NPX`）。
- [ ] `package.json` の `trustedDependencies` が `[]` のままであること（lifecycle script は全依存で無効を維持する。現状 `[]` を確認済み）。
- [ ] `package.json` に記録されたバージョンが Expo SDK 57 の互換版であること（`nr expo:check` = `expo install --check` が差分ゼロ）。
- [ ] `bun.lock` の diff をレビューし、追加されるパッケージが react-native-svg とその既知の推移依存（css-select / css-tree 系統）に限られること。想定外のパッケージ追加・既存パッケージのバージョン変動がないこと。
- [ ] 追加された各パッケージの `package.json` に `postinstall` / `preinstall` / `install` script が定義されているかを確認し、定義されている場合も実行されていないこと（`--ignore-scripts` + `trustedDependencies: []` の二重防御）。
- [ ] `bun pm ls` で依存ツリーを確認し、react-native-svg が単一バージョンに解決されていること（重複解決がないこと）。
- [ ] import 境界: `react-native-svg` を import するのは `src/components/BrandMark.tsx`（および M3 以降の QR 描画）に限られ、domain / protocol / app 層に漏れていないこと（1.5 の契約テストで機械検証）。
- [ ] LP（`site/index.html`）に外部リクエストが増えていないこと（1.4 と同一の確認。SVG マークは inline で埋め込む）。
- [ ] ADR-0025 が採用理由・バージョン固定・script 無効化を記録していること（記録済みを確認）。

## 6. Developer 実装への指摘（優先度付き）

### P1（実装で必ず対処する）

1. warning ドットのコントラスト不足: warning #c98a14 / 白 = 2.95:1 で非テキスト UI の 3.0:1 を下回る（設計書に記載のない組。再計算で新規判明）。対処案のいずれかを取る。(a) ドット色を warningText #8a6a12（5.06:1）へ寄せるか #b07708（3.83:1）級へ暗くする。(b) ドットを常に mono ラベルと併記し、ドット単独で情報を伝えない構成を設計書へ明記して 1.4.11 の冗長表現として整理する。色変更の場合はトークン表・LP も追随させる。
2. primarySoft 選択状態の識別性: #f5f5f7 / 白 = 1.09:1 で色のみでは選択を識別できない（旧パレットからの明確な回帰）。選択時に枠線の色または太さの変化・チェック表示など色以外の視覚的手がかりを必須とする（WCAG 1.4.1）。対象は Settings 言語選択・ClueSelector・PetEmojiSelector・LanguageSelector。
3. 設計書の disabled 記述の訂正: 「#f5f5f7 地 + disabled 文字で 3:1 の UI コンポーネント境界を保つ」は再計算で不成立（最大でも 1.55:1）。WCAG の inactive 除外に依拠する旨へ書き換え、視認性は 3.1 の手動確認で担保する。視認性が不足する場合は disabled 文字を mutedLight #86868b へ変更する。
4. `react-native-svg` の文字列を HostInviteScreen / QrScanScreen / QrCodeView のソースに書かない: `qr-invite-accessibility.test.ts` の禁止 import 契約はソーステキスト検査であり、コメントや文字列でも失敗する。BrandMark の import（`../components/BrandMark`）経由に限定する。

### P2（同 PR 内で対処する）

5. theme 値を固定するテストの新規作成: 設計書の「既存の contrast 検証テストは新値で更新する」は不正確で、該当テストは存在しない。1.1 の全数検証テストと 2.5 のコントラスト閾値テストを新規に作成する。
6. 設計書コントラスト表の数値修正: 7 値中 6 値が再計算と不一致（muted 5.3 → 5.07、warningText 5.6 → 5.06、successText 4.6 → 5.33、ink 16.9 → 16.83、mutedLight 3.5 → 3.62、success 3.1 → 3.39、accent 2.9 → 2.85）。合否は変わらないが、テストの期待値の正本になる表なので再計算値へ揃える。
7. LP の近似値ドリフト解消: 作業版 LP に `#f5f6f8`・`#e9e9ec`・`#e7e8ec` というトークン外の近似値がある。surface #f5f5f7 / borderSubtle #e8e8ed へ統一するか、LP 固有色として設計書に根拠を明記する。
8. info の使用制限の明文化: info #3b82f6 / 白 = 3.68:1 は ドット用途は合格だが小さい本文の 4.5:1 に届かない。infoText 相当が必要になった場合は別トークンを起こす（現時点で本文用途がなければ制約コメントのみで可）。

### P3（記述の正確性。実装ブロッカーではない）

9. ダーク面補助文字の理由付け修正: rgba(255,255,255,0.5) / ink は 5.14:1 で AA 4.5:1 を満たすため、「AA を守るため .68 へ引き上げ」は不正確。0.68（8.39:1、AAA 超）の採用は 10px 級の可読性確保として支持するが、設計書の理由を可読性根拠へ書き換える。
10. 査証スタンプ色の適合確認: 作業版 LP の `#8f2c1c` / `rgba(181, 58, 38, 0.12)` が仕様の「summit #ff6a32 系へ寄せる」に適合する意図色かをレビューで確認し、設計書へ根拠を残す。

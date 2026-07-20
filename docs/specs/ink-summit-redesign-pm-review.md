# Ink / Summit リデザイン PM レビュー

- 対象: [Issue 70](https://github.com/susumutomita/TenkaCloudPassport/issues/70)。
- 正本: [仕様書](./2026-07-20-ink-summit-redesign.md)・[設計](../design/2026-07-20-ink-summit-redesign.md)・claude.ai/design「TenkaCloudPassport デザイン見直し」の `TenkaCloud Passport Redesign.dc.html`（ビジュアル正本）・[ADR-0025](../adr/0025-ink-summit-brand-and-svg.md)。
- 本書の責務: Product Manager ロールとして、受け入れ基準のテストシナリオ化、「ビジュアルのみ・domain 不変」の境界の明文化、優先度と依存関係の整理を行い、リスクを列挙する。仕様書・設計への指摘は第 5 章にまとめる。

## 1. 受け入れ基準のテストシナリオ化

仕様書の各受け入れ基準を「入力 → 期待結果」の検証可能な形へ落とす。ID は実装時のテスト名・レビュー観点との対応付けに使う。

### 1.1 トークン対応表の検証シナリオ（AC: theme.ts 差し替え）

設計のトークン対応表の各行を、`src/ui/theme.ts` の BDD テスト（新設）の期待値としてそのまま固定する。

| ID | 検証項目 | 期待結果 | 検証手段 |
| --- | --- | --- | --- |
| T-1 | `colors.background` | `#ffffff` | `bun test`（theme テスト新設） |
| T-2 | `colors.surface` | `#f5f5f7` | 同上 |
| T-3 | `colors.ink` | `#1d1d1f` | 同上 |
| T-4 | `colors.muted` | `#6e6e73` | 同上 |
| T-5 | `colors.mutedLight`（新規） | `#86868b` | 同上 |
| T-6 | `colors.border` | `#d2d2d7` | 同上 |
| T-7 | `colors.borderSubtle`（新規） | `#e8e8ed` | 同上 |
| T-8 | `colors.primary` | `#1d1d1f`（ink と同値） | 同上 |
| T-9 | `colors.primaryPressed` | `#000000` | 同上 |
| T-10 | `colors.primarySoft` | `#f5f5f7`（surface と同値。第 5 章の指摘 3 を参照） | 同上 |
| T-11 | `colors.accent` | `#ff6a32` | 同上 |
| T-12 | `colors.success` / `colors.successText`（新規） | `#2f9e63` / `#1f7a49` | 同上 |
| T-13 | `colors.info`（新規） | `#3b82f6` | 同上 |
| T-14 | `colors.warning` / `colors.warningText`（新規） | `#c98a14` / `#8a6a12` | 同上 |
| T-15 | `colors.danger` | `#9f3434`（変更なし） | 同上 |
| T-16 | `colors.disabled` | `#c7c7cc` | 同上 |
| T-17 | 旧 hex（`#f4f1ea` `#fffdf8` `#17201d` `#5d6863` `#c9d1cc` `#185c4b` `#104537` `#dcebe4` `#d57835` `#aeb7b2`）の残存 | `src/` 配下に 0 件（LP は対象外。1.5 で別途検証） | grep + `/review` |

### 1.2 コントラストの検証シナリオ（AC: WCAG 2.1 AA 維持）

比率は WCAG 2.1 の相対輝度式による実測値（本レビューで再計算）。テストの期待値は設計書の記載値ではなく計算式で固定する（第 5 章の指摘 1 を参照）。

| ID | 前景 / 背景 | 実測比 | 判定基準 |
| --- | --- | --- | --- |
| C-1 | ink / 白 | 16.83:1 | 本文 AA（4.5:1 以上） |
| C-2 | muted / 白 | 5.07:1 | 本文 AA |
| C-3 | successText / 白 | 5.33:1 | 本文 AA |
| C-4 | warningText / 白 | 5.06:1 | 本文 AA |
| C-5 | warningText / surface | 4.65:1 | 本文 AA（Host Invite の期限警告が surface 地のため必須） |
| C-6 | 白 / ink（primary ボタン・Bridge カード） | 16.83:1 | 本文 AA |
| C-7 | accent / ink（Bridge ラベル） | 5.90:1 | 本文 AA |
| C-8 | rgba(255,255,255,.68) / ink（ダーク面補助文字） | 8.31:1 相当 | 本文 AA。`.5` 未満の不透明度を使わない |
| C-9 | mutedLight / 白（3.62:1）・success / 白（3.39:1）・info / 白（3.68:1）・warning / 白（2.95:1）・accent / 白（2.85:1） | 左記 | 本文使用禁止の確認。ドット・大型 mono ラベル・ダーク面上に限定されていること |
| C-10 | disabled 文字 / surface 地（disabled ボタン） | 1.55:1 | WCAG の disabled 除外を明示的に適用するか、色を再選定する（第 5 章の指摘 2 を参照） |

### 1.3 BrandMark の検証シナリオ（AC: 山頂マーク共通コンポーネント）

デザイン正本の SVG 定数をソース契約テストで固定する。

| ID | 検証項目 | 期待結果 | 検証手段 |
| --- | --- | --- | --- |
| B-1 | viewBox とパス定数 | `viewBox="0 0 120 120"`・bar は `rect x=26 y=24 width=68 height=12 rx=6`・peak は `M26 90 L60 48 L94 90` を stroke-width 13・linecap/linejoin round で描く | `bun test`（ソース契約テスト新設） |
| B-2 | props 境界 | `size` と `color` のみを受け、文言を持たない | 同上 |
| B-3 | 装飾扱い | マーク自体はスクリーンリーダーへ追加文言を発しない（装飾要素として隠す） | 同上 + 既存 accessibility 契約テストが緑 |
| B-4 | ロックアップ | 「TenkaCloud Passport」表記。Passport 部分は mutedLight。フォントはシステムフォント（Inter 等の同梱なし） | ソース契約テスト + `/review` |
| B-5 | 配置 | 5 画面すべてのヘッダーに BrandMark + ロックアップが表示される | 各 Screen のソース契約テスト |

### 1.4 5 画面の意匠チェック項目（AC: 意匠まで合わせる）

仕様の画面名と実ファイルの対応を本書で確定する（第 5 章の指摘 7 を参照）。

| 仕様の画面名 | 実ファイル |
| --- | --- |
| Local Profile | `src/screens/PassportCreationScreen.tsx`（共通: `PetEmojiSelector` / `ClueSelector` / `ActionButton`） |
| Host Invite | `src/screens/HostInviteScreen.tsx` |
| Active Lounge | `src/screens/ActiveLoungeScreen.tsx` |
| Owner Question | `src/screens/OwnerQuestionScreen.tsx` |
| Outcome・Bridge | `src/screens/OutcomeScreen.tsx` |

5 画面共通のチェック項目。

| ID | 検証項目 | 期待結果 |
| --- | --- | --- |
| S-0-1 | ヘッダー | BrandMark + ロックアップ（B-5） |
| S-0-2 | eyebrow ラベル | monospace・大文字・letter-spacing 広め・mutedLight または muted |
| S-0-3 | primary ボタン | ink 塗り・radius 12・高さ 52・白文字 |
| S-0-4 | secondary ボタン | 白地 + border・radius 12 |
| S-0-5 | 画面地 | background（白） |
| S-0-6 | 既存契約テスト | `font-scaling` / `touch-target` / 各 `*-accessibility` テストが挙動アサーション変更なしで緑 |

画面別のチェック項目。

| ID | 画面 | 検証項目 | 期待結果 |
| --- | --- | --- | --- |
| S-1-1 | Local Profile | Pet Emoji 選択肢 | 実カタログ `PET_EMOJIS`（🐾 🐶 🐱 🦊 🐼 🐧 の 6 種）のまま。選択中 = ink 枠 + surface 地、非選択 = border 枠 + 白地、radius 12 |
| S-1-2 | Local Profile | 会話の材料の選択カード | 選択中 = ink 枠 + surface 地 + ink 塗りチェック、非選択 = border 枠 + 白地、radius 12 |
| S-1-3 | Local Profile | 入力枠・カウンタ | フォーカス時 ink 枠。カウンタ・補足は mono 小ラベル（mutedLight）。上限値表示は実 domain 値（Pet 名 24 字等）のまま |
| S-2-1 | Host Invite | QR カード | 白地 + borderSubtle 枠 + radius 16 + 弱い影。QR 下に mono キャプション |
| S-2-2 | Host Invite | 期限・Screenshot 警告 | surface 地 + radius 12 + warning ドット（7px）+ mono 見出し。文言は既存 i18n のまま |
| S-2-3 | Host Invite | 参加者リスト | Ready = success ドット + mono ラベル（successText 系）、未 Ready = disabled ドット + mutedLight。行区切りは borderSubtle |
| S-3-1 | Active Lounge | 2 枚のカード | 白地 + borderSubtle 枠 + radius 14 + 弱い影。eyebrow は mutedLight |
| S-3-2 | Active Lounge | discovering 表示 | info ドット（8px）+ mono ラベル。点滅等の motion は既存 `active-lounge-reduced-motion.test.ts` の契約に従う |
| S-3-3 | Active Lounge | 使い捨て説明 | surface 地 + radius 12。20 分満了の文言は既存 i18n（`LOUNGE_TTL_MS` 由来）のまま |
| S-4-1 | Owner Question | 期限 pill | 白地 + warning 系の枠 + warning ドット + warningText の mono 文言 |
| S-4-2 | Owner Question | 質問カード | 白地 + borderSubtle 枠 + radius 16 + 影。手掛かりラベルは大きめの ink 見出し |
| S-4-3 | Owner Question | 回答ボタン群 | 「答える」= primary（ink 塗り）、「分からない」「パス」= secondary 2 分割。既存 `owner-question-accessibility.test.ts` が緑 |
| S-5-1 | Outcome・Bridge | Bridge カード | ink 地 + summit のラジアルグロー + radius 18 + 白文字。Bridge ラベルは accent の mono + accent ドット（C-7） |
| S-5-2 | Outcome・Bridge | ダーク面の補助文字 | 不透明度 .68 以上の白（C-8）。区切り線は rgba(255,255,255,.14) |
| S-5-3 | Outcome・Bridge | 原文と生成文の区別 | 既存 `outcome-bridge-source-distinction.test.ts` / `outcome-screen-no-score.test.ts` が挙動アサーション変更なしで緑 |

### 1.5 LP の検証シナリオ（AC: site/index.html）

LP は working tree で先行着手済みのため、以下は「実装指示」ではなく「一致確認」の観点になる。

| ID | 検証項目 | 期待結果 | 検証手段 |
| --- | --- | --- | --- |
| L-1 | CSS custom properties | `--ink` `--muted` `--muted-light` `--border` `--border-subtle` `--surface` `--summit` `--success-text` `--warning-text` が theme.ts の確定値と 16 進で一致 | `/review`（runtime 共有なし。値の一致はレビューで担保） |
| L-2 | 緑系トークンの全廃 | `--pine` および旧配色 hex が 0 件 | grep |
| L-3 | 査証スタンプ | 二重丸枠 + 回転 + 押印アニメのシグネチャを維持し、色は `--summit` | 目視 + `/review` |
| L-4 | MRZ | `P<TENKACLOUD<<PASSPORT<<...` の MRZ 表現（本文・フッター）を維持 | grep |
| L-5 | 山頂マーク | favicon・ヘッダーの SVG パスが BrandMark と同一定数 | `/review` |
| L-6 | 外部リクエストゼロ | `http` の出現が SVG の xmlns 名前空間（data: URI 内）のみで、外部フォント・外部スクリプトへの参照が 0 件 | grep + `/review` |

### 1.6 ゲート（AC: カバレッジ 100％ と before-commit 緑）

- `bun scripts/architecture-harness.ts --staged --fail-on=error` → `make before-commit` → `/review` → `/security-review` → `/simplify` の順で全緑。
- カバレッジ 100％ を維持する（BrandMark と theme テストの新設分を含む）。

## 2. 「ビジュアルのみ・domain 不変」の境界

### 2.1 変えてよいもの

| 対象 | 変更内容 |
| --- | --- |
| `src/ui/theme.ts` | トークン値の差し替えと意味トークン（mutedLight / borderSubtle / success / successText / info / warning / warningText）の追加 |
| 5 画面 + 共通コンポーネント（`ActionButton` / `ScreenCard` / `AppScreen` / `PetEmojiSelector` / `ClueSelector` 等）の StyleSheet | 色・radius・余白・影・タイポサイズなどスタイル定数のみ |
| `src/components/BrandMark`（新規） | 純表示コンポーネントの追加と 5 画面ヘッダーへの配置 |
| `site/index.html` | CSS custom properties・スタンプ色・山頂マークの差し替え（構造・文言のシグネチャは維持） |
| テストの色期待値 | 旧 hex を期待するアサーションの新値への更新と、theme / BrandMark テストの新設 |
| `package.json` | `react-native-svg` の追加（ADR-0025 準拠。`bunx expo install -- --ignore-scripts` で SDK 57 互換版に固定） |

### 2.2 絶対に変えないもの

| 対象 | 現行値（正本） |
| --- | --- |
| 絵文字カタログ | `PET_EMOJIS = ['🐾', '🐶', '🐱', '🦊', '🐼', '🐧']`（`src/domain/passport.ts`）。mock にある 🐰 🐻 は採用しない |
| 会話の材料カタログ | `CLUE_CATALOG` 全 11 件・`CATALOG_VERSION '2026-07-17'`・`LANGUAGE_CATALOG`（ja / en）（`src/domain/clue-catalog.ts`） |
| 上限値 | `PET_NAME_MAX_LENGTH 24` / `OWNER_ALIAS_MAX_LENGTH 24` / `PROFILE_MAX_CLUES 10` / `PUBLIC_PASSPORT_MAX_CLUES 3` / `PROFILE_MAX_LANGUAGES 3` / `PUBLIC_PASSPORT_MAX_LANGUAGES 3` / `LOUNGE_TTL_MS 20 分` |
| i18n 文言 | `src/app/i18n/messages.ts` の全文言。見出し・本文・ボタンラベルは mock の文言へ置き換えない |
| 状態遷移・ロジック | `src/domain` / `src/protocol` / `src/app` / `src/local-agent` / `src/ports` / `src/adapters` は一切触れない |
| アクセシビリティ契約 | `allowFontScaling` を無効化しない・`numberOfLines={1}` を使わない・accessibilityLabel / touch target / reduced-motion / 表示順序の既存テストの挙動アサーション |
| danger トークン | `#9f3434`（変更なし） |

### 2.3 mock 由来で取り込み禁止のもの（早見表）

デザイン正本はプレゼン用 mock であり、以下は実装へ持ち込まない。

- 絵文字 🐰 🐻（実カタログ外）。
- Pet 名カウンタ「3 / 12」（実上限は 24）・会話の材料「3 / 7」（実上限は 10、カタログは 11 件）。
- クルーカードの「Topics / Offer」mono 表記（実カタログの category は activity / interest / skill / conversation-topic、passportField は topics / offers / lookingFor / goal）。
- サンプル Pet 名（こむぎ・そら）・「残り 12 分」「残り 18 秒」などの演出値。
- Inter / Noto Sans JP / JetBrains Mono の Web フォント読み込み（アプリはシステムフォント。LP も外部リクエストゼロ）。
- iPhone フレーム・タイプ見本・新旧パレット凡例・キャンバス背景（プレゼン用要素）。

## 3. 優先度・依存関係

### 3.1 実施順序

| 順序 | 作業 | 優先度 | 依存 |
| --- | --- | --- | --- |
| 1 | `src/ui/theme.ts` トークン差し替え + theme BDD テスト新設 | P0 | なし。全画面へ自動波及するため最初に確定させる |
| 2 | `react-native-svg` 導入 + BrandMark 実装・テスト | P0 | ADR-0025。5 画面のヘッダー実装の前提 |
| 3 | 5 画面の意匠調整（Local Profile → Host Invite → Active Lounge → Owner Question → Outcome・Bridge のユーザーフロー順） | P1 | 1 と 2 の完了。トークン未確定のまま着手すると手戻りになる |
| 4 | LP の一致確認（先行変更分と theme.ts 確定値の突合） | P2 | 1 の完了。runtime 共有がないため 16 進の一致をレビューで担保する |
| 5 | 品質ゲート一式（1.6） | P0 | 1〜4 の完了 |

5 画面以外の画面（Settings / Backup 系 / Diagnostics 等）はトークン波及のみで意匠調整のスコープ外とし、破綻がないことを R-1 の手順で確認する。

### 3.2 react-native-svg が導入できない場合の退避

- 失敗シグナル: `bunx expo install` で SDK 57 互換版が解決できない、Expo Go / Web で描画できない、lifecycle script や `trustedDependencies` の追加を要求される。
- 退避先: 設計の案 c（テキストロックアップのみ）へ切り替える。BrandMark の公開 props（`size` / `color`）は維持し、内部実装だけをテキスト描画へ差し替えて呼び出し側 5 画面の変更を防ぐ。
- 手続き: `/follow-up add` で「山頂マークの SVG 描画復帰」を記録し、PR 本文の Known follow-ups に掲載する。退避が恒久化する場合は Accepted 済みの ADR-0025 を新 ADR で supersede する（第 5 章の指摘 6 を参照）。
- 影響範囲: LP はインライン SVG で依存がないため退避の影響を受けない。M3 の実 QR 描画（ADR-0024）は依存追加の再判断が必要になる。

## 4. リスク

| ID | リスク | 対策 |
| --- | --- | --- |
| R-1 | 全画面波及による意図しない見た目の破綻。`colors` を参照する画面は 16 あり、5 画面以外は個別調整なしで新トークンが当たる。特に primarySoft が surface と同値になるため、「選択状態 = primarySoft 地」だけで区別していた箇所は選択が視認できなくなる | primarySoft 参照箇所の全数確認を実装タスクに含め、選択状態は ink 枠の併用へ寄せる。Expo Web で全画面のスクリーンショットを取得し QA で目視確認する |
| R-2 | コントラスト回帰。accent / warning / info / success の白地本文使用は AA を割る（C-9）。機械検証で全使用箇所を拾えない | 1.2 の実測値でテストを固定し、使用箇所の限定（ドット・バッジ・ダーク面）を `/review` の明示観点にする |
| R-3 | LP 先行変更との drift。LP は working tree で更新済みのため、theme.ts の確定値と食い違うと「LP だけ違う色」になる | L-1 の突合を PR レビューの必須項目にする |
| R-4 | supply chain。`react-native-svg` 追加時に lifecycle script が走る・バージョンが SDK 57 非互換になる | `--ignore-scripts` と空の `trustedDependencies` を維持し、`bunx expo install` で固定（ADR-0025）。失敗時は 3.2 の退避 |
| R-5 | motion 契約の回帰。discovering ドットの点滅などデザイン由来のアニメを足すと reduced-motion 契約に抵触し得る | `active-lounge-reduced-motion.test.ts` を挙動アサーション変更なしで緑に保つことを完了条件にする |

## 5. 仕様書・設計への矛盾・懸念

1. 設計書のコントラスト数値が実測とずれている。muted 5.3:1（実測 5.07:1）・successText 4.6:1（実測 5.33:1）・warningText 5.6:1（実測 5.06:1）・mutedLight 3.5:1（実測 3.62:1）・success 3.1:1（実測 3.39:1）・accent 2.9:1（実測 2.85:1）。AA 判定の結論は変わらないが、テスト期待値は設計書の記載値でなく計算式（1.2 の表）で固定すること。
2. 設計書の disabled 記述「#f5f5f7 地 + disabled 文字で 3:1 の UI コンポーネント境界を保つ」は成立しない。disabled `#c7c7cc` と surface `#f5f5f7` の実測比は 1.55:1。WCAG 2.1 は disabled 要素を 1.4.3 / 1.4.11 の適用除外としているため AA 違反ではないが、設計の記述どおりにはならない。除外を明示して受け入れるか、disabled 文字を `#86868b`（surface 上 3.33:1）級へ再選定するかを実装前に決めること。
3. primarySoft と surface が同値 `#f5f5f7` になる。旧テーマでは primarySoft（淡緑）が選択状態の視覚差を担っていたため、トークン差し替えだけでは選択状態が消える画面が出る。デザイン正本は選択状態を ink 枠で表しており、実装は「枠の併用」を必須とする（R-1）。
4. 設計書の「色 hex を固定している既存テスト（accessibility 契約・contrast 検証）は期待値のみ更新」は前提がずれている。現状の `*.test.ts` に hex 直書きも `colors` 参照も存在しない（grep 0 件）。よって「既存テストの更新」ではなく「theme / contrast テストの新設」が正しいタスク定義になる。仕様書の「色の期待値のみ更新可」も同様。
5. デザイン正本（mock）と domain の不一致が複数ある（絵文字 🐰 🐻、Pet 名上限 12、会話の材料上限 7、Topics / Offer 表記）。仕様書のスコープ外宣言（mock の 🐰 🐻 は採用しない）と整合しており矛盾ではないが、実装時の取り込み禁止リストとして 2.3 に明文化した。
6. ADR-0025 は既に Accepted で `react-native-svg` 採用を決定済みのため、退避（案 c）が恒久化した場合は ADR の supersede が必要になる。設計書の退避記述には ADR の扱いが書かれていないので、3.2 の手続きを正とする。
7. 仕様書の 5 画面名（Local Profile 等）と実ファイル名（`PassportCreationScreen.tsx` 等）の対応が仕様・設計のどちらにも明記されていない。本書 1.4 の対応表を正として実装・QA で共有する。
8. LP が working tree で先行更新済みであり、作業順序（トークン確定 → LP）と実態が逆転している。破綻ではないが、theme.ts 確定後に L-1 の突合を必ず実施すること（R-3）。

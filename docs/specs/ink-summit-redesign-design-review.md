# Ink / Summit リデザイン Design Review

## Scope

- Issue: <https://github.com/susumutomita/TenkaCloudPassport/issues/70>。
- Role: Designer。
- 対象: デザイン正本 `TenkaCloud Passport Redesign.dc.html`（claude.ai/design「TenkaCloudPassport デザイン見直し」）の 5 画面 mock を、現行 Screen 実装の構造へマッピングする意匠仕様。あわせて WCAG 2.1 AA の検証と、既存 accessibility 契約テストへの影響評価、BrandMark の仕様を固定する。
- 正本: 仕様は [仕様書](./2026-07-20-ink-summit-redesign.md)、実装設計は [設計](../design/2026-07-20-ink-summit-redesign.md)、依存判断は ADR-0025（`docs/adr/0025-ink-summit-brand-and-svg.md`）。
- 本書はコードを変更しない。dc.html の内容はデザインデータとしてのみ扱う。

## 0. 共通ボキャブラリ（全画面で共有する意匠原語）

mock 全体から抽出した、トークンを超えて繰り返される組み立てパターン。5 画面の個別マッピングはすべてこの原語で記述する。

| 原語 | mock の値 | 実装への正規化 |
| --- | --- | --- |
| eyebrow ラベル | monospace・10.5 px・weight 500・letter-spacing .14em・uppercase・#6e6e73 | `AppScreen` の `eyebrow` スタイル。`fontFamily: monoFontFamily`（theme に新設、後述）・fontSize 12・fontWeight '500'・letterSpacing 1.6・`textTransform: 'uppercase'`・color `muted` |
| 画面見出し | 23 px・weight 600・letter-spacing -.02em・line-height 1.22 | `AppScreen` の `title`。fontSize 28・fontWeight '600'・letterSpacing -0.6・lineHeight 34（mock は 402 px フレーム前提のため、現行の余白体系に合わせ 1 段引き上げる） |
| 説明文 | 12.5 px・#6e6e73・line-height 1.6 | `AppScreen` の `description`。fontSize 15・lineHeight 24・color `muted` |
| primary ボタン | ink #1d1d1f 塗り・radius 12・高さ 52・白文字 14.5 px weight 500 | `ActionButton` の `primary`。bg/border とも `primary`（新値 #1d1d1f）・borderRadius 12・minHeight 52・label 白 15 px '600' |
| secondary ボタン | 白地・border #d2d2d7・radius 12・高さ 48〜50・ink 文字 | `ActionButton` の `secondary`。bg `white`・border `border`・borderRadius 12・minHeight 50・label `ink` |
| danger ボタン | mock に登場しない | 現行 variant を維持し、白地 + `danger` 枠 + `danger` 文字へ寄せる（#9f3434 は白地 7.0:1 で AA） |
| disabled ボタン | mock に登場しない | bg `surface`（#f5f5f7）+ border `borderSubtle` + label `mutedLight`。設計書の「disabled（#c7c7cc）文字」案は surface 上 1.5:1 でほぼ不可視のため、視認可能な `mutedLight`（surface 上 3.3:1）へ引き上げる。WCAG 1.4.3 の inactive 免除対象であり数値義務はないが、操作不能の手掛かりとして読める濃度を選ぶ |
| カード | 白地・border 1 px #e8e8ed・radius 14〜16・影 `0 1px 2px rgba(16,17,20,.04)` | bg `white`・border `borderSubtle`・borderRadius 14〜16・iOS: shadowColor #101114 / shadowOpacity 0.04 / shadowRadius 2 / shadowOffset {0,1}、Android: elevation 1 |
| 淡地ノート | #f5f5f7・borderless・radius 12・padding 12〜14 | 現行 `primarySoft` 系 notice の置き換え。bg `surface`・borderWidth 0・borderRadius 12 |
| 状態ドット + mono ラベル | 7 px 円 + monospace 11 px ラベル | `width/height: 7`・`borderRadius: 3.5` の View + mono Text の横並び。色は状態対応表（後述）に従う |
| ink 地カード（Bridge） | #1d1d1f 地・radius 18・summit ラジアルグロー・白文字 | bg `ink`・borderRadius 18。グローは装飾コンポーネント（後述）で描く |

### 状態ドットの色対応表

ドット単色はコントラスト 3:1 を下回るものがあるため、ドットは必ず隣接テキストの冗長装飾とし、単独で意味を持たせない（WCAG 1.4.11 の判断は第 3 節）。

| 状態 | ドット | ラベル文字（白地・淡地） | mock の文字色との差分 |
| --- | --- | --- | --- |
| Ready | `success` #2f9e63 | `successText` #1f7a49 | mock は #2f9e63 の 11 px 文字（3.4:1、AA 不適合）。実装は `successText`（5.3:1）へ置換する |
| 未 Ready | `disabled` #c7c7cc | `muted` #6e6e73 | mock は #86868b（3.6:1）。11 px 級には `muted`（5.1:1）を使う |
| 期限 | `warning` #c98a14 | `warningText` #8a6a12 | mock と同一 |
| 探索中 | `info` #3b82f6 | `muted` #6e6e73 | mock と同一 |
| Bridge | `accent` #ff6a32 | ink 地上は `accent` のまま（5.9:1） | mock と同一 |

### mono フォントの供給方法

mock の JetBrains Mono は同梱しない（仕様のスコープ外）。`src/ui/theme.ts` に `monoFontFamily`（`Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' })` 相当）を新設し、Screen へ `Platform` を直接持ち込まない。`settings-accessibility.test.ts` が SettingsScreen での `Platform.OS` 出現を禁止しているため、分岐は theme 側に置くことが契約上も必須になる。既存 `JsonPreviewCard` の `fontFamily: 'monospace'`（iOS では無効値）もこのトークンへ寄せる。

### mock に登場するがパレット外の色

| mock の値 | 出現箇所 | 正規化 |
| --- | --- | --- |
| #424245 | Lounge カードの clue 行、キャンバスの figcaption | `ink` へ寄せる（中間調トークンを増やさない） |
| #fbfbfd | Owner Question の画面地 | `background` #ffffff へ統一する |
| #eadfae | Owner Question の期限 pill の枠 | `warningBorder` #eadfae としてトークン追加を推奨する。追加を見送る場合は `borderSubtle` で代替する |
| rgba(255,255,255,.14) | Bridge カードの区切り線 | `inverseDivider` トークンとして theme へ追加する |
| rgba(255,255,255,.5) | Bridge カードの補助文字 | `inverseMuted` として rgba(255,255,255,0.68) へ引き上げて追加する（第 3 節参照） |

rgba 系を含め、色値は `src/ui/theme.ts` 以外へ直書きしない（設計書の方針を徹底する）。

## 1. 画面別マッピング

### 共通ヘッダー（AppScreen、全画面に波及）

- mock: BrandMark 20 px と `TenkaCloud Passport` 14 px weight 600 のロックアップ（Passport の語は #86868b）、続けて mono eyebrow、見出し、説明文の順。
- 実装: `src/components/AppScreen.tsx` の `brandMark`（回転正方形 View）を `BrandMark`（第 4 節）へ差し替える。`brand` Text は末尾スペース込みの `TenkaCloud ` と入れ子 Text の `Passport`（`mutedLight`）を連結する（契約テストのピン留めなし、分割可）。`safeArea` の bg を `background`（新値 #ffffff）へ、`eyebrow` を mono 化して `muted` へ（現行 `primary` 色から変更）。`eyebrow` prop の文字列（「Step 1 / Local Profile」等）は mock と既に一致しており変更しない。

### 1-1. PassportCreationScreen（Step 1 / Local Profile）

| mock の要素 | 実装の変更点 |
| --- | --- |
| 通知バナー（保存結果等） | `styles.notice` を淡地ノート（`surface`・borderless・radius 12）へ。error variant（`errorNotice`）は白地 + `danger` 枠を維持 |
| 入力欄（Pet Name / Owner Alias） | `styles.input` を白地 + `border` #d2d2d7・radius 12 へ。mock のフォーカス表現（ink 枠 + `0 0 0 4px rgba(29,29,31,.06)` リング）は onFocus/onBlur の state 追加が必要なため任意。採る場合も色は theme 経由 |
| 文字数カウンタ・注意書き | `styles.limit` は `muted` を維持する。mock の #86868b（`mutedLight`）は 10.5 px 級で AA 不適合のため、13 px 本文には使わない |
| 「会話の材料」ヘッダ + カウンタ | `styles.counter` を `primary` 色から `ink` + `monoFontFamily` へ。値は `selectedIds.length / PROFILE_MAX_CLUES` のまま |
| ClueSelector の行 | `src/components/ClueSelector.tsx`。未選択: 白地 + `border`・radius 12。選択: `surface` 地 + `primary`（=ink）枠。この 2 状態は `primarySoft` → #f5f5f7、`primary` → #1d1d1f のトークン差し替えでほぼ自動で成立する。checkbox は radius 6〜7・checked 時 `primary` 塗り + 白チェックを維持。category ラベル（Topics / Offer 相当）は `mutedLight` + mono + uppercase 10 px へ。文言は catalog の `fieldLabels` のまま（mock の英語表記へ変えない） |
| PetEmojiSelector のタイル | 48×48・radius 12。未選択: 白地 + `border`。選択: `surface` 地 + `primary` 枠 1.5〜2 px。`option` スタイルの `height` プロパティ名は維持する（touch-target テストが抽出する。48 は 44 以上で適合） |
| 保存ボタン | `ActionButton` primary（共通ボキャブラリ） |

配置順序（petName → petEmoji → ownerAlias → clues → languages → save）は `passport-onboarding-accessibility.test.ts` がピン留めしており、変更しない。mock に Owner Alias と Language 節は描かれていないが、既存要素の削除はしない（ビジュアルのみ方針）。

### 1-2. HostInviteScreen（Step 4 / Host Invite）

| mock の要素 | 実装の変更点 |
| --- | --- |
| QR カード | `QrCodeView` を白カード（`borderSubtle` 枠 + radius 16 + 弱い影）で包む。`QrCodeView` 自体は View グリッドのまま（`react-native-svg` の文字列出現も禁止。`qr-invite-accessibility.test.ts` の FORBIDDEN リスト）。セル色は `ink` トークン差し替えで自動更新 |
| mock の「lounge-invite · in-process-v1」キャプション | 実装しない。新規文言の追加は文言不変の方針に反する |
| 期限 + Screenshot リスク notice | `styles.notice` を淡地ノートへ。`noticeTitle` は `warning` ドット + mono `warningText` ラベルの組へ。DOM 順は `t.remainingMinutesTitle(` → `t.screenshotRiskNotice` を維持（順序契約） |
| 参加者リスト | mock は「参加者 1 / 2」mono 見出し + 行ごとの名前・状態ドットの 2 カラム。実装は `t.participantRow(名前, 状態)` の単一文字列が契約（`'t.participantRow('` の出現と全角コロン禁止）のため、行 = 状態ドット View + `t.participantRow(...)` Text の横並びとする。ドット色は `participant.ready` で `success` / `disabled` を切り替え、文字は `ink` のまま。カード枠は外し、行間 `borderSubtle` の hairline 区切りへ（mock 準拠）。`participantsTitle` は mono + uppercase + `muted` |
| ボタン | Ready → primary、Guest スキャンへ → secondary、キャンセル → danger variant のまま（mock は secondary 見た目だが、破棄操作の意味論を優先して danger の白地 + 赤枠を維持する） |

順序契約（QR → 期限 → リスク → 参加者 → 主操作）は `qr-invite-accessibility.test.ts` が固定しており、restyle のみで順序を動かさない。

### 1-3. ActiveLoungeScreen（Step 4 / Lounge）

| mock の要素 | 実装の変更点 |
| --- | --- |
| 2 枚の Passport カード | `styles.passport` を白カード（`borderSubtle`・radius 14・弱い影）へ。mock の横並び（flex row・各 flex:1）は採用せず縦積みを維持する。200％ font scaling 時に半幅カードで clue 行が破綻するためで、意図的な mock からの乖離として記録する |
| カード見出し（この端末 / Encounter） | `passportTitle` を mono + `mutedLight` + uppercase 10 px へ（現行も uppercase であり方向は同じ） |
| clue 行 | `styles.clue` を fontSize 14〜15・fontWeight '500'・`ink` へ（mock #424245 は `ink` へ正規化） |
| discovering 行 | `interactionStatus` を `info` ドット + mono `muted` ラベルの組へ。mock の `tcPing` 点滅アニメーションは実装しない（Reduce Motion 配線を増やさないため。既存の PetEmojiGlyph 拍動が唯一のアニメーションであり続ける）。`styles.petEmojiGlyph` の名前は `active-lounge-reduced-motion.test.ts` がピン留めしているため変更しない |
| 使い捨て Lounge notice | 淡地ノートへ。`noticeTitle` は `ink` 13 px '600'、本文 `muted` |
| ボタン | 会話の糸を探す → primary、退出 → secondary、Host 終了 → danger、Settings → secondary |

### 1-4. OwnerQuestionScreen（Step 4 / Owner Question）

| mock の要素 | 実装の変更点 |
| --- | --- |
| 開示 3 行（共有範囲・削除時期・非保存） | `styles.disclosure` を淡地ノートへ。本文 `ink` 13/20 維持 |
| 期限 pill | `styles.countdown` を pill（白地 + `warningBorder` 枠 + radius 999 + `warning` ドット + mono `warningText` 文字）へ。契約テストは countdown の位置をピン留めしていないため、mock どおり質問カードの前へ移動してよい（開示 → 質問の順序契約のみ厳守）。移動しない場合も pill 意匠は適用する |
| 質問カード | `styles.question` の Text を白カード（`borderSubtle`・radius 16・影 `0 6px 22px rgba(16,17,20,.06)` 相当、Android elevation 2）で包み、fontSize 22・fontWeight '600' へ。mock の「確認したい手掛かり」キャプションと clue 名の分離表示は、`question.displayText` の分解（文言・domain 変更）を要するため実装しない。単一 Text のまま |
| メモ入力 | `styles.label` を `muted` 13 px '500' へ、input は白地 + `border`・radius 12 へ |
| 3 択ボタン | 答える → primary 全幅。分からない / パス → secondary。mock の 2 分割横並び（flex row・各 flex:1・高さ 48）は採用可（ラベル契約は `label={t.noButton}` 等の出現のみで、レイアウト非依存）。200％ text では折り返しで minHeight が伸びる前提で `height` 固定にしない |
| 確認カード（confirming-share） | 白カード（`borderSubtle`・radius 14）へ |

`disclosure → question.displayText` の順序、`answerOnce` / `submitted` の 5 箇所 disabled、TextInput 2 箇所などは `owner-question-accessibility.test.ts` がピン留めしており、意匠変更で触れない。

### 1-5. OutcomeScreen（Step 5 / Retired・Bridge）

| mock の要素 | 実装の変更点 |
| --- | --- |
| Bridge カード地 | `styles.result` を `primary`（旧緑）塗りから `ink` 塗り + radius 18 へ。`noSignal` variant も `ink` のままとなるため、両者の差は eyebrow の色と文言（`t.bridgeLabel` / `t.noSignalLabel`）で表現する |
| summit グロー | mock の `radial-gradient(420px 220px at 88% -30px, rgba(255,106,50,.14), transparent 70%)`。React Native に radial-gradient がないため、`react-native-svg` の `RadialGradient` を使う純表示コンポーネント（例: `src/components/SummitGlow.tsx`。絶対配置・右上・`accessible={false}`・タッチ透過）で重ねる。実装が難航する場合はフラット ink 地へ退避し `/follow-up` へ記録する（ブランドの成立には eyebrow の summit ドットで足りる） |
| Bridge eyebrow | `resultKind` を「8 px `accent` ドット + mono uppercase letterSpacing 広め」の組へ。文字色は Bridge 時 `accent`（ink 地上 5.9:1）、no-signal 時 `white` |
| 本文 message | `styles.message` を fontSize 21・fontWeight '600'・lineHeight 30・`white` へ |
| 区切り線 | `sourceLabels` の borderTop を `primarySoft` から `inverseDivider`（rgba(255,255,255,0.14)）へ |
| 原文キャプション・生成注記 | `sourceLabelsCaption` を mono + uppercase + `inverseMuted`（0.68）へ、`generatedNoteCaption` も `inverseMuted` へ。mock の .5 は採らない（第 3 節） |
| 原文値 | `sourceLabelsValue` は `white` 14〜16 px '500' を維持 |
| ボタン | Bridge を隠す / 再表示 → secondary、結果を閉じる → primary、退出 → secondary、Host 終了 → danger |

`sourceLabels` の宣言形・「caption → join → 生成注記」の順序は `outcome-bridge-source-distinction.test.ts` がピン留めしており、スタイルのみ変更する。

## 2. mock と実装で異なるが「変えない」もの

ビジュアルのみ方針（仕様の受け入れ基準「domain データ・文言・挙動は不変」）の確認。以下は mock がどう描いていても実装値を維持する。

| 項目 | mock の表示 | 実装の正 |
| --- | --- | --- |
| Pet Emoji カタログ | 🐾 🐶 🐱 🐰 🐻 🦊 の 6 種 | `PET_EMOJIS = ['🐾', '🐶', '🐱', '🦊', '🐼', '🐧']`（`src/domain/passport.ts`）。🐰 🐻 は採用せず、🐼 🐧 を維持する |
| Pet Name 上限 | 「3 / 12」 | `PET_NAME_MAX_LENGTH = 24` |
| 会話の材料の上限 | 「3 / 7」 | `PROFILE_MAX_CLUES = 10` |
| メモ上限 | なし | `OWNER_ANSWER_NOTE_MAX_LENGTH = 140` |
| 参加者数 | 「参加者 1 / 2」 | `ROOM_CAPACITY = 2`（一致しているが正は domain 定数） |
| 見出し・本文文言 | mock 独自のコピー（「アカウントなしで Pet を準備する。」等） | `src/app/i18n/messages.ts` の既存文言。mock のコピーへ書き換えない |
| mock 専用の新規文字列 | 「lounge-invite · in-process-v1」「確認したい手掛かり」「Account-free · Local-first」等 | 追加しない（新規 i18n key の追加は文言不変の方針に反する） |
| Ready / 未 Ready 等の状態文言 | 「Ready」「未 Ready」 | catalog の `participantReady` / `participantNotReady`（一致しているが正は catalog） |
| QR の中身 | mock は静的な装飾 SVG | M1 の `qr-matrix` 装飾グリッドを維持する。実 QR への切替は M3（`qr-encoder-salvage-design-review.md`）のスコープ |
| アニメーション | `tcPulse`（Pet 拍動）と `tcPing`（ドット点滅） | `tcPulse` 相当は既存 PetEmojiGlyph（Reduce Motion 対応済み）を維持。`tcPing` は実装しない |
| フォント | Inter / Noto Sans JP / JetBrains Mono | システムフォント + platform monospace（依存追加なし） |
| キャンバス演出 | iPhone フレーム・figcaption・STEP pill・新旧パレット legend | プレゼン用要素であり実装しない |
| 画面の要素構成 | mock に描かれない既存要素（Owner Alias・Language 節・Settings ボタン・error 表示等） | 削除しない |

## 3. アクセシビリティ（WCAG 2.1 AA）

### 3-1. コントラスト表の検証

設計書の表を相対輝度計算で再検証した。結論（AA 適否）はすべて設計書どおりだが、数値を以下のとおり訂正する。

| 組み合わせ | 比率（検証値） | 設計書の値 | 判定 |
| --- | --- | --- | --- |
| `ink` #1d1d1f / 白 | 16.8:1 | 16.9:1 | AA 適合（本文可） |
| `muted` #6e6e73 / 白 | 5.1:1 | 5.3:1 | AA 適合（本文可） |
| `muted` / `surface` #f5f5f7 | 4.7:1 | 記載なし | AA 適合。淡地ノートの本文に使える |
| `successText` #1f7a49 / 白 | 5.3:1 | 4.6:1 | AA 適合 |
| `warningText` #8a6a12 / 白 | 5.1:1 | 5.6:1 | AA 適合（`surface` 上も 4.6:1 で適合） |
| `danger` #9f3434 / 白 | 7.0:1 | 記載なし | AA 適合 |
| `mutedLight` #86868b / 白 | 3.6:1 | 3.5:1 | 本文不可。大型文字・uppercase mono キャプション・非必須装飾に限定 |
| `success` #2f9e63 / 白 | 3.4:1 | 3.1:1 | 文字不可。ドットのみ |
| `info` #3b82f6 / 白 | 3.7:1 | 記載なし | 文字不可。ドットのみ |
| `warning` #c98a14 / 白 | 2.9:1 | 記載なし | 3:1 未満。ドットのみ、かつ必ず隣接ラベルの冗長装飾とする（下記） |
| `accent` #ff6a32 / 白 | 2.9:1 | 2.9:1 | 白地の文字に使わない（仕様の受け入れ基準どおり） |
| `accent` / `ink` 地 | 5.9:1 | 記載なし | AA 適合。Bridge eyebrow に使える |
| 白 / `ink` 地 | 16.8:1 | 記載なし | AA 適合 |
| rgba(255,255,255,0.68) / `ink` 地 | 8.4:1 | 記載なし | AA 適合。`inverseMuted` の採用値 |
| rgba(255,255,255,0.5) / `ink` 地 | 5.1:1 | 不適合扱い | 数値上は AA 適合だが、9.5〜11 px 級の細字では余裕がないため設計書どおり 0.68 へ引き上げる判断を支持する |
| `disabled` #c7c7cc 文字 / `surface` | 1.5:1 | 3:1 と記載 | 設計書の「3:1 の UI コンポーネント境界を保つ」は成立しない。inactive 要素は WCAG 免除だが、第 0 節のとおり disabled 文字は `mutedLight` を推奨する |

非テキスト（1.4.11）の判断: `warning`（2.9:1）を含む状態ドットは、単独で状態を伝えない。すべてのドットは同内容の文字ラベル（`participantRow` の状態文字列、`remainingMinutesTitle`、discovering 文言等）と常に併置し、ドットは冗長装飾として扱う。これにより 3:1 未満のドットも 1.4.11 に抵触しない。ドットだけで状態を表す UI をこのリデザインで新設しない。

色以外の手掛かり（1.4.1）も既存構造で担保済み: Ready / 未 Ready は文言、選択状態は checkbox と `accessibilityState`、Bridge / no-signal は見出しと label 文言で区別される。色の置き換えはこの構造を変えない。

### 3-2. 既存 accessibility 契約テストへの影響評価

| テスト | 影響 | 守るべき点 |
| --- | --- | --- |
| `qr-invite-accessibility.test.ts` | 影響なしで通せる | 順序契約（QR → 期限 → リスク → 参加者 → 主操作）を restyle で崩さない。`t.participantRow(` の参照と全角コロン不使用を維持。FORBIDDEN リストに `react-native-svg` が含まれるため、HostInviteScreen / QrScanScreen / QrCodeView / domain 4 ファイルに `react-native-svg` の文字列を出現させない（コメント内も不可）。BrandMark は AppScreen 経由の間接 import になるため抵触しない |
| `settings-accessibility.test.ts` | 影響なしで通せる | SettingsScreen は本リデザインの意匠調整対象外（トークン波及のみ）。`Platform.OS` の出現禁止があるため、mono フォントの platform 分岐は theme 側に置く（第 0 節） |
| `touch-target.test.ts` | 影響なしで通せる | スタイル名とプロパティ名がソース抽出でピン留めされている。`ActionButton` の `button.minHeight`（52 へ。`height` に変えない）、`ClueSelector` の `option.minHeight`（64 維持）、`PetEmojiSelector` の `option.height`（48 は 44 以上で適合）、`LanguageSelector` の `option.minHeight`。いずれもスタイル名の rename 禁止 |
| `font-scaling.test.ts` | 影響なしで通せる | `allowFontScaling={false}` と `numberOfLines={1}` を追加しない。PassportCreation / OwnerQuestion 等 6 画面では Text コンテナに 100 以上の固定 `height` を置かない。ボタン・カード・pill はすべて `minHeight` で組む（mock の `height:52` をそのまま写経しない） |

上記 4 本に加え、対象 5 画面には次のピン留めがある。`passport-onboarding-accessibility.test.ts`（配置順序・TextInput 2 箇所・選択部品の label / role / state）、`owner-question-accessibility.test.ts`（開示 → 質問の順序・`disabled={submitted}` 5 箇所）、`outcome-bridge-source-distinction.test.ts`（sourceLabels の宣言形と表示順）、`active-lounge-reduced-motion.test.ts`（`styles.petEmojiGlyph` の名前と Reduce Motion 分岐）。いずれも意匠変更で構造・識別子を動かさなければ緑のまま通る。

なお設計書は「既存の contrast 検証テストは新値で更新する」と書くが、`src/` に contrast を検証する既存テストは存在しない（grep で hex 値を持つのは `theme.ts` のみ）。したがってこれは更新ではなく新設になる。`src/ui/theme.test.ts` を新規作成し、トークン値のピン留めと本節 3-1 の比率検証（輝度計算をテスト内で実装）を BDD で固定することを推奨する。

## 4. BrandMark の仕様

### 4-1. 図形定義（正本）

SVG viewBox は `0 0 120 120`。2 つの図形から成る。

- bar（天のかんむり）: `<Rect x={26} y={24} width={68} height={12} rx={6} fill={color} />`。
- peak（山頂）: `<Path d="M26 90 L60 48 L94 90" fill="none" stroke={color} strokeWidth={13} strokeLinecap="round" strokeLinejoin="round" />`。

dc.html ヘッダの Mark legend には ascend / cloudpeak の 2 バリアントも描かれているが、採用するのは summit（bar + peak）のみ。

### 4-2. コンポーネント契約

- 配置: `src/components/BrandMark.tsx`。`react-native-svg` の import はこのファイル（およびグロー用の純表示コンポーネント）に限定する。
- props: `size?: number`（デフォルト 20。width と height の両方に適用）、`color?: string`（デフォルト `colors.ink`）。この 2 つ以外を受けない。文言・状態を持たない純表示コンポーネント。
- accessibility: 装飾であり `accessible={false}` とし、隣接する「TenkaCloud Passport」Text が名前を担う（mock の `aria-hidden="true"` に対応）。
- 使用サイズ: AppScreen ヘッダのロックアップで 20。将来の大型表示（スプラッシュ等）は 30〜34 を目安とするが本 Issue のスコープ外。
- 色: 白地では `ink`、ink 地に置く場合は `white` を渡す。`accent` 単色のマーク使用は行わない（旧 brandMark の accent 正方形は廃止）。
- テスト: レンダリング基盤がないため、ソース契約テストで `viewBox="0 0 120 120"`・Rect の各属性・Path の `d` 文字列・props 境界（size / color のみ）をピン留めする。あわせて「`src/` で `react-native-svg` を import するのは許可ファイルのみ」をディレクトリ走査で固定するテストを推奨する（`qr-invite-accessibility.test.ts` の FORBIDDEN リストの一般化）。
- 依存: `bunx expo install react-native-svg -- --ignore-scripts` で SDK 57 互換版に固定する。判断の記録は ADR-0025（既存）。導入に問題が出た場合はテキストロックアップのみへ退避し `/follow-up` へ記録する（設計書の退避経路どおり）。

## 5. Developer への先回り判断（要約）

1. パレット外の mock 色は正規化する: #424245 → `ink`、#fbfbfd → `background`、#eadfae → `warningBorder`（新設または `borderSubtle`）。
2. Ready ラベル文字は mock の #2f9e63 を使わず `successText` #1f7a49。ドットのみ `success`。同様に 11 px 級の補助文字は `mutedLight` でなく `muted`。
3. mono フォントは theme の `monoFontFamily` トークン経由。Screen に `Platform` を書かない。
4. `react-native-svg` の文字列は BrandMark（+ グロー）以外の `src/` ファイルに出さない。QrCodeView は View グリッドのまま。
5. touch-target テストがスタイル名・プロパティ名を抽出する。`button.minHeight` / `option.minHeight` / `option.height` を維持し、ボタンは `height` 固定にしない。
6. Active Lounge の 2 カードは mock の横並びを採らず縦積み維持（200％ font scaling 対応。意図的な乖離）。
7. 新規文言・新規 i18n key を追加しない。mock 専用文字列（「lounge-invite · in-process-v1」等）は実装しない。
8. 状態ドットに点滅アニメーション（`tcPing`）を追加しない。アニメーションは既存 PetEmojiGlyph のみ。
9. contrast 検証は既存テストの更新ではなく `src/ui/theme.test.ts` の新設。
10. Bridge グローは `RadialGradient` の純表示コンポーネントで実装し、難航したらフラット ink 地 + `/follow-up`。
11. ink 地上の白系は `inverseMuted`（0.68）と `inverseDivider`（0.14）をトークン化し、rgba を Screen へ直書きしない。
12. disabled ボタンは `surface` 地 + `mutedLight` 文字（設計書の `disabled` 文字案から引き上げ。WCAG 免除領域だが視認性を優先）。

# Web 版 GitHub Pages 配布（`/app/`）設計

Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/88 （詳細設計の正本）。

## 問題

Tier A（`docs/design/distribution-tiers.md`）の Web 経路は、現状 `bun run web` を各自の Mac で
起動する前提しかなく、開発環境を持たない参加者がスマホから直接触れる配布経路がない。GitHub Pages
はすでに `site/`（LP・自己紹介ビューア）を配信しているため、同じ Pages 上の `/app/` サブパスへ
Expo Web Export を重ねて配信し、スマホの「ホーム画面に追加」でアプリのように起動できるようにする。

## 代替案

### 案 A: `dist/` をリポジトリへ commit し、`pages.yml` はそのまま配信するだけにする

- 利点: Workflow に build step を足さずに済む。
- 欠点: `dist/` は Metro のバンドル成果物であり、コミットすると Diff レビュー不能な巨大バイナリ /
  ハッシュ付きファイル名が増え続ける。Issue の明示要件（「dist はリポジトリに commit しない」）にも反する。
  不採用。

### 案 B: `pages.yml` に Expo Web Export の build step を足し、`site/` はルート・`dist/` は `app/`
サブディレクトリとして 1 つの Pages artifact に合成する（採用）

- 利点: `dist/` は build 時にのみ生成され、リポジトリには残らない。既存 `site/`（LP・`/c/` ビューア）
  の配信契約を変えずに、Expo アプリだけを新しいサブパスへ追加できる。`ci.yml` と同じ SHA 固定
  `setup-bun` を流用でき、Supply Chain 方針（`--ignore-scripts`）を継続できる。
- 欠点: Workflow の実行時間が伸びる（Bun install + Metro bundle）。`paths:` trigger にアプリ側の
  変更点を足す必要があり、追従漏れの余地がある。

### 案 C: Web 配信を独立した別 Hosting（Cloudflare Pages 等）へ切り出す

- 利点: Expo Web の build と LP の配信が完全に分離する。
- 欠点: 新しい Hosting アカウント・Secret・DNS 設定が要る。単一リポジトリ・単一 Pages 環境という
  現状の単純さを壊す。Tier A の「無料・アカウント不要」という配布契約とも整合しない（Owner 側に
  新しい外部アカウントを要求する）。不採用。

案 B を採用する。

## `baseUrl` の設計

`app.json` の `expo.experiments.baseUrl` を `"/TenkaCloudPassport/app"`（末尾スラッシュなし）に
設定する。`expo export --platform web` は `getBaseUrlFromExpoConfig` でこの値を読み、バンドルされる
JS/CSS のパスをすべてこのプレフィックス付きの絶対パスで書き出す（`node_modules/@expo/cli` の
`metroOptions.js` で確認済み）。これにより GitHub Pages の `/TenkaCloudPassport/app/` サブパス配信でも
アセットが 404 にならない。

既存の `src/app/default-agent-model-provider.test.ts` の「Expo Config は New Architecture と
再現可能な llama Plugin Option を固定する」テストは `app.json` を文字列として読み `toContain` で
検査するだけなので、`baseUrl` の追加とは独立に緑を維持する。同テストに `baseUrl` の
`toContain` 検査を追加し、TDD で先に red にしてから `app.json` を編集する。

## `manifest.webmanifest` / meta 注入 / PWA アイコンの設計

### 案 a: Expo の `public/` ディレクトリ機能だけで完結させる

- 利点: `expo export` が `public/` の内容をそのまま出力へコピーする（`copyPublicFolderAsync`）。
  `public/index.html` を置けば `%WEB_TITLE%` 等のプレースホルダ置換や script/css 注入はそのまま効き、
  デフォルト template を差し替えられる。
- 欠点: `<link rel="manifest">` や `apple-mobile-web-app-*` の meta、`apple-touch-icon` を注入するには
  `public/index.html` に **Expo デフォルト template と同じ構造**（`%LANG_ISO_CODE%` / `%WEB_TITLE%`
  プレースホルダ、script/css 挿入位置）を手で複製する必要があり、Expo 側の template 更新に
  追従できず drift する。PNG アイコンは `public/` に static file として置くだけなので、生成ロジックの
  置き場所が「静的アセット（`public/`）」と「生成コード（別スクリプト）」の 2 か所に分かれる。

### 案 b: build 後の `dist/index.html` を書き換える専用スクリプト
  `scripts/prepare-web-app-export.ts` を作り、`manifest.webmanifest` と PWA アイコン PNG も
  同じスクリプトが `dist/` 直下へ書き出す（採用）

- 利点: Expo のデフォルト HTML template を複製せず、`</head>` 直前への追記だけで完結する。
  `manifest.webmanifest` とアイコン生成もスクリプト内で完結するため、「PWA 配布に必要な物一式」の
  正本が 1 ファイルに閉じる。Idempotent にできるため、ローカルで複数回実行しても壊れない。
  Issue 本文が明示する既定の設計でもある。
- 欠点: `expo export` の出力後に別コマンドを挟む必要があり、Workflow のステップが 1 つ増える。

案 b を採用する。Issue 本文は「Expo の `public/` ディレクトリ同梱機能を使える場合はそちらを優先して
よい」と代替を許容しているが、PNG アイコンは静的なハンドメイド素材ではなく
`src/components/BrandMark.tsx`（Ink / Summit ブランドの山頂マーク、`docs/design/2026-07-20-ink-summit-redesign.md`
正本）と同じ幾何定数から**生成**するものであり、生成コードと出力先が分かれる案 a よりも、
1 スクリプトに正本を閉じる案 b の方が単純になる。

## PNG アイコン生成の設計

### 案 i: `@expo/image-utils` が推移的依存として持ち込む `pngjs` / `jimp-compact` を直接 import する

- 利点: 自前の PNG encoder を書かずに済む。
- 欠点: どちらも本 Repository の直接依存ではない。`@expo/image-utils` が将来これらを差し替えた場合、
  `bun install` は成功するのに本スクリプトが壊れる（`bun.lock` の変更で無警告に破綻する）。
  型定義もなく、Supply Chain 上「宣言されていない依存に暗黙に乗る」ことになり、本 Repository が
  一貫して重視する Supply Chain 管理（`--ignore-scripts`、SHA 固定、ADR 記録）の方針にも反する。不採用。

### 案 ii: 新しい画像ライブラリ（`sharp` 等）を devDependencies に追加する

- 利点: 高品質な SVG → PNG 変換ができる。
- 欠点: Native binary 依存が増え、`--ignore-scripts` の前提が崩れやすい。Icon 2 枚のためだけに
  新しい Supply Chain 面を増やすのは過剰。

### 案 iii: `node:zlib`（Bun 組み込み）だけを使い、Rect + 太線 2 本という単純な形状を
  自前でラスタライズして PNG を直接エンコードする（採用）

- 利点: 新しい依存を増やさない（`bun.lock` に変更なし）。形状が単純（角丸 Rect 1 個 + 丸端・丸継ぎの
  太線 2 本）なので、4x supersampling + box filter によるアンチエイリアスを含めても実装量は小さく、
  ピクセル単位で決定的にテストできる（BDD で「特定座標の色」を断言できる）。
- 欠点: 汎用 SVG レンダラではないため、将来 BrandMark の形状が複雑になった場合は書き直しが要る
  （現状の bar + peak 程度の形状である前提で許容する）。

案 iii を採用する。`scripts/brand-mark-icon.ts` が幾何定数（`src/components/BrandMark.tsx` の
`x=26 y=24 w=68 h=12 rx=6` の Rect と `M26 90 L60 48 L94 90` / `strokeWidth=13` の Path）を複製し、
`scripts/brand-mark-icon.test.ts` に BrandMark のソースを読んで同じ数値が現れることを断言する
drift 検出テストを足す（`src/app/default-agent-model-provider.test.ts` 等、既存のソース契約テストと
同じパターン）。

## データの流れ・責務の境界

```text
scripts/brand-mark-icon.ts     -- Ink 背景 + 白 BrandMark を RGBA へラスタライズし PNG へ encode する
scripts/prepare-web-app-export.ts
  -> dist/index.html を読み、</head> 直前へ manifest link / apple-mobile-web-app-* meta /
     apple-touch-icon link を追記する
  -> dist/manifest.webmanifest を書く
  -> scripts/brand-mark-icon.ts を呼び dist/icons/icon-192.png, dist/icons/icon-512.png を書く
.github/workflows/pages.yml
  -> setup-bun / setup-node / Setup safe-chain（ci.yml と同じ pin・手順で複製。
     このジョブは pages: write / id-token: write を持つため、初めて依存 install と
     build を行う本 PR で ci.yml と同じ Supply Chain scan を外さない）
  -> bun install --frozen-lockfile --ignore-scripts
  -> bun run build:web  (dist/ を生成)
  -> bun scripts/prepare-web-app-export.ts dist  (dist/ を PWA 対応に仕上げる)
  -> site/ をルート、dist/ を app/ サブディレクトリとして 1 つの artifact ディレクトリへ合成する
  -> actions/upload-pages-artifact / actions/deploy-pages
```

- `src/` の Domain / Provider / Screen には一切触れない。既存の localStorage 系 adapter・Rules
  Provider の挙動は変えない。
- `scripts/prepare-web-app-export.ts` は `dist/index.html` に既に注入済みマーカーコメントがあれば
  再注入をスキップする（ローカルで複数回実行しても壊れないための idempotency）。

## fail-closed な文言（README / LP）

- ブラウザ / 端末を変えるとカードは共有されない（localStorage は端末 + Browser 単位）。
- 初回表示（および JS バンドルの初回取得）はオンライン必須。Service Worker によるオフライン化は
  未実装（follow-up として記録し、本 Issue のスコープ外にする）。
- 「ホーム画面に追加」で得られるのは起動体験の簡略化（アプリのように起動できる）であり、
  App Store 配布や Tier B/C の Native Build と同じ能力を持つとは主張しない。

## エッジケース・異常系・境界値

- `dist/index.html` が存在しない（`build:web` 失敗直後に呼ばれた等）場合、
  `prepare-web-app-export.ts` は明示的な Error を投げて Workflow を fail させる（サイレントスキップしない）。
- 既に `<!-- tenkacloud-pwa-meta -->` マーカーが入っている `index.html` に対して再実行しても、
  meta / link を重複挿入しない。
- `distDir` に `icons/` が無ければ作成する。既存ファイルがあれば上書きする（生成物なので固定内容で
  決定的に上書きしてよい）。
- PNG 生成は 192 / 512 以外のサイズでも同じ関数で決定的に動くことをテストで確認する
  （将来サイズを増やす場合の回帰防止）。
- `app.json` の `baseUrl` を変更しても、既存の Expo Config 契約テスト（New Architecture・llama
  Plugin Option の固定）を壊さないことを確認する。

## テスト戦略

- `scripts/brand-mark-icon.test.ts`: 生成した PNG バイト列の signature / IHDR（width, height,
  bit depth, color type）を断言し、`node:zlib` の `inflateSync` で自前展開したピクセルから
  「背景は ink」「bar 領域は白」「peak 領域は白」「四隅は ink のまま」を断言する。BrandMark.tsx
  との drift 検出テストも足す。
- `scripts/prepare-web-app-export.test.ts`: 一時ディレクトリに最小の `index.html` を書き、
  実行後の `index.html` / `manifest.webmanifest` / `icons/*.png` の内容を断言する（実ファイル I/O、
  モックなし）。`index.html` が存在しない異常系、2 回実行した場合の idempotency も断言する。
- `src/app/default-agent-model-provider.test.ts` に `baseUrl` の `toContain` 検査を追加する。

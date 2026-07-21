# ADR-0029: 静的配信を GitHub Pages から Cloudflare Workers（Workers Builds）へ移行する

- Status: Accepted
- Date: 2026-07-22
- Deciders: Susumu Tomita

## Context

Issue 88（ADR は無し、`docs/design/2026-07-21-web-app-pages-distribution.md` が正本）で、
LP・自己紹介ページビューア（`site/`）と Web Export（`dist/`、`/app/` サブパス）を
GitHub Pages（`https://susumutomita.github.io/TenkaCloudPassport/`）で配信してきた。
owner はカスタムドメイン `tenkacloud.com` を保有する Cloudflare アカウントで、
配信をこのドメイン配下の `card.tenkacloud.com` へ一元化したいと判断した
（DNS・ドメイン管理の一元化、GitHub Pages の帯域制限の回避、設定ファイルによる
IaC 化）。Issue 94 の本文が詳細設計の正本であり、着手後に owner から「Cloudflare
ダッシュボードの Workers Builds（Git 連携）でプロジェクト `tenkacloudpassport`
を作成済み」という設計変更の追記が入った。これにより、当初案（GitHub Actions から
`wrangler pages deploy` を実行）は不要になり、push を起点に Cloudflare 側がビルド・
デプロイまで行う方式へ変わった。

## Decision

1. **配信基盤を Cloudflare Workers（Workers + 静的アセット構成）へ移行する。**
   Workers Builds が push ごとに次のビルドコマンドを実行し（owner がダッシュボード
   側で設定済み、リポジトリの管理外）、`npx wrangler deploy` でデプロイする。

   ```
   make install_ci && bun run build:web \
     && bun scripts/prepare-web-app-export.ts dist \
     && mkdir -p pages-dist/app \
     && cp -r site/. pages-dist/ \
     && cp -r dist/. pages-dist/app/
   ```

2. **`wrangler.toml`（リポジトリ直下、新規）でこのビルドが読む静的アセット配信を
   定義する。** `name = "tenkacloudpassport"`（owner がダッシュボードで作成した
   プロジェクト名と一致させる必要があり、npm package 名の
   `tenkacloud-passport` とは意図的に別物）、`[assets] directory = "pages-dist"`。
   アプリは `expo-router` / `react-navigation` を使わずクライアント側のパス
   ルーティングを持たないため、`not_found_handling` は既定の `"none"`（真の 404）を
   明示する。TOML 形式を選んだのは、Issue 94 本文が `wrangler.toml` を明示指定して
   いるためであり、`/wrangler` スキルの一般的推奨（新機能は JSON-only なため
   `wrangler.jsonc` を優先）より Issue の詳細設計を優先した。JSON 専用機能
   （Durable Objects の複数 migration など）を将来使う必要が生じた場合は、
   本 ADR を supersede して `wrangler.jsonc` へ移行する。
3. **GitHub Actions からの Cloudflare デプロイは作らない。** `CLOUDFLARE_API_TOKEN` /
   `CLOUDFLARE_ACCOUNT_ID` の GitHub Secrets は不要になった。ビルドチェーンの
   健全性は既存 CI（`make before-commit` の一部である Web Export ビルド）で
   引き続き担保する。
4. **`.github/workflows/pages.yml` を削除し、GitHub Pages 側を凍結する。** GitHub
   Pages は「最後に成功したデプロイの内容を配信し続ける」ため、デプロイ用
   workflow を削除しても既存の `github-pages` environment のコンテンツはそのまま
   残る。これにより、GitHub Pages の URL を埋め込んだ既発行の QR コード
   （自己紹介ページ URL のフラグメント）は、少なくとも当分の間は引き続き解決できる。
5. **コード側の URL を新ドメインへ移行する。**
   - `src/protocol/intro-card-url.ts` の `INTRO_CARD_VIEWER_URL` を
     `https://card.tenkacloud.com/c/` へ変更する（新規に生成する QR だけが対象。
     既に配布済みの QR は旧 URL のフラグメントを含んだままであり、上記の凍結方針が
     それを解決可能にし続ける）。
   - `app.json` の `expo.experiments.baseUrl` を `/TenkaCloudPassport/app` から
     `/app` へ変更する。Cloudflare Workers はドメイン直下配信のため、GitHub Pages
     時代のリポジトリ名プレフィックスが不要になる。
   - `scripts/prepare-web-app-export.ts` の `DEFAULT_START_URL`（PWA manifest の
     `start_url`）を同様に `/app/` へ変更する。
   - `site/index.html` / `site/en/index.html` の OGP（`og:url` / `og:image`）・
     hreflang・本文リンクと、README.md / README.en.md のリンクを
     `card.tenkacloud.com` へ更新する。「Web 版」のリンク文言から
     「（GitHub Pages）」の注記を外す（配信基盤が変わったため）。
   - `site/c/index.html`（自己紹介ページビューア）は変更不要である。
     `location.hash` だけを読み、自分自身の canonical URL に依存しない設計
     （ADR-0027）のままであることを、`scripts/intro-card-viewer.test.ts` の
     「ドメイン文字列をハードコードしない」契約テストで維持する。

## Consequences

- Good: ドメイン・DNS 管理が `tenkacloud.com` 配下へ一元化され、GitHub Pages の
  帯域制限（ソフトリミット月 100GB）を気にする必要がなくなる。
- Good: `wrangler.toml` により配信設定がコードとして repo にあり、レビュー・
  差分追跡ができる（IaC 化）。
- Good: Workers Builds が push を起点に自動ビルド・デプロイするため、GitHub
  Actions 側に Cloudflare の認証情報（API Token・Account ID）を持つ必要がない
  （攻撃対象領域が増えない）。
- Bad: ビルドコマンド・デプロイコマンドの実体が Cloudflare ダッシュボード側の
  設定であり、リポジトリの diff からは見えない。本 ADR とコメントで明示する
  ことで drift を防ぐが、ダッシュボード側の設定変更はこの PR のレビューでは
  検知できない。
- Bad: 初回の Workers Builds は `wrangler.toml` 不在で失敗している想定であり、
  本 PR のマージ後に成功することを owner のダッシュボード確認なしで
  `curl` の HTTP ステータスだけで検証する。ビルドログが見えないため、失敗時の
  原因切り分けは `wrangler.toml` とビルドコマンドの整合性の再点検に限られる。
- Tradeoff: 旧 URL（`susumutomita.github.io`）を即時 410/リダイレクトにせず
  凍結する案を採らず「そのまま残す」を選んだのは、更新用 workflow を維持する
  コストの方が、凍結環境が無期限に残るリスクより高いと判断したためである。
  GitHub Pages 自体を無効化する必要が生じた場合は、別途 ADR で扱う。
- Tradeoff: カスタムドメイン `card.tenkacloud.com` の Cloudflare Custom Domains
  紐付けは、この PR の範囲外（owner がダッシュボードまたは API で一度だけ実行）
  とした。紐付け前は `tenkacloudpassport.<subdomain>.workers.dev` が実体であり、
  本 PR のマージ直後の検証はどちらのホスト名で 200 が返るかに依存する。

## References

- 関連コード: `wrangler.toml`、`src/protocol/intro-card-url.ts`、`app.json`、
  `scripts/prepare-web-app-export.ts`、`site/index.html`、`site/en/index.html`。
- 関連 Issue: Issue 94（本 ADR の詳細設計の正本）、Issue 88（GitHub Pages 配信の
  導入）。
- 関連 PR: PR 95（Cloudflare ダッシュボードの Wrangler autoconfig が自動生成、
  設定の一部を参考にした上でクローズ）。
- 関連ドキュメント: [Web App Pages Distribution 設計書](../design/2026-07-21-web-app-pages-distribution.md)
  （配信先の移行以外の設計判断は引き続き有効）、
  [Privacy データ台帳](../privacy/data-inventory.md)。
- 関連 ADR: [ADR-0027](./0027-intro-card-url-viewer.md)（`INTRO_CARD_VIEWER_URL` の
  導入元。本 ADR は URL の値のみを更新し、フラグメント方式・データを預からない
  原則は変更しない）。

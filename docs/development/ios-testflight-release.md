# iOS TestFlight 自動リリース手順

本書は [Issue 108](https://github.com/susumutomita/TenkaCloudPassport/issues/108) で整えた、
バージョンタグ push を起点に GitHub Actions が EAS Build から EAS Submit までを非対話で実行し、
TestFlight まで自動で届ける経路を説明する。設計判断の背景は
[ADR-0031](../adr/0031-eas-testflight-automated-release.md) を参照する。

対象は個人 Apple Developer Program（有料）を保有する owner のみである。Personal Team（無料）
での Native Development Build の手順は [Native Development Build 手順](./native-builds.md) を
参照する。Android の署名済み配布は [Android Artifact Release Runbook](./android-artifact-release.md)
を正本とし、本書とは運用が異なる（Android は GitHub-hosted CI で秘密鍵を扱う経路を未承認のため
手動署名のままである。詳細は ADR-0031 の Consequences を参照する）。

## 全体像

1. owner が `vMAJOR.MINOR.PATCH` 形式のタグを push する。
2. [`.github/workflows/ios-release.yml`](../../.github/workflows/ios-release.yml) が起動し、
   `EXPO_TOKEN` で EAS に非対話ログインした状態で `bun run build:ios:testflight`
   （実体は `eas build --platform ios --profile production --non-interactive --auto-submit`）
   を実行する。
3. EAS のクラウドビルド環境が `expo prebuild` で `ios/` を生成した直後、`pod install` を
   実行する**前**に、EAS Custom Build（[`.eas/build/ios-device-build.yml`](../../.eas/build/ios-device-build.yml)）
   の専用ステップで `make setup-llama-native` を実行し、`llama.rn` の Native artifact
   （`rnllama.xcframework`）を取得してから CocoaPods 解決とビルドに進む。
4. ビルド成功後、`--auto-submit` により同じ Build が EAS Submit 経由で App Store Connect
   （TestFlight）へ自動提出される。
5. owner が TestFlight でテスター（自分 + 友人）へ配布する。

GitHub Actions のランナー自体は iOS ビルドを行わない。ランナーの役割は EAS へビルドを
起動する非対話コマンドを 1 つ実行するだけであり、`bun install` などプロジェクト依存関係の
解決はランナー側では行わない（`eas-cli` は `app.json` を静的に読むだけで、ビルド本体は
EAS 側の隔離環境で完結するため）。

## 初回セットアップ（一度きり、owner の手作業）

Sonnet が用意するのはリポジトリ側の設定ファイルまでであり、次の手順は owner が Apple /
Expo アカウントを使って一度だけ行う。

1. [expo.dev](https://expo.dev) で Expo アカウントを作成し、ローカルで
   `bunx eas-cli@21.0.2 login` を実行してログインする。`bunx eas-cli@21.0.2 whoami` で
   ログイン中のアカウントを確認する。
2. [expo.dev のアカウント設定](https://expo.dev/accounts/%5Baccount%5D/settings/access-tokens)
   から Access Token（Robot user 推奨）を発行し、GitHub リポジトリの
   **Settings > Secrets and variables > Actions** に `EXPO_TOKEN` として登録する。
   このトークンを `eas.json` や workflow ファイルへ直書きしない。
3. [App Store Connect](https://appstoreconnect.apple.com) でアプリ枠を作成する
   （Bundle ID `cloud.tenka.passport`、初回のみ）。作成後、General > App Information（または
   アプリのダッシュボード URL `https://appstoreconnect.apple.com/apps/<この数字>/`）に表示される
   数値の App ID を控える。[`eas.json`](../../eas.json) の
   `submit.production.ios.ascAppId` はプレースホルダ
   `"REPLACE_WITH_APP_STORE_CONNECT_APP_ID"` のままにしてあるので、実際の数値へ書き換えて
   commit・push する（`ascAppId` は App Store Connect 上の公開 ID であり、`appleId` や
   API キーのような秘密情報ではないため repository に含めてよい）。この置き換えをしないと
   `eas submit --non-interactive` が対象アプリを特定できず失敗する。
4. ローカルで初回だけ、**`--non-interactive` を付けずに** 次を対話実行し、Apple の署名用
   認証情報（Distribution Certificate / Provisioning Profile）を EAS のサーバ側に預ける。
   `bun run build:ios:testflight`（`package.json` 参照）は CI 専用に `--non-interactive` を
   固定しているため初回セットアップには使わない。

   ```bash
   bunx eas-cli@21.0.2 build --platform ios --profile production
   ```

   `eas build` が Apple ID ログインや証明書生成についてプロンプトを出すので、画面の指示に
   従って進める。一度この対話を完了させると、以降は EAS が管理する認証情報を使って
   `bun run build:ios:testflight`（`--non-interactive --auto-submit`）で非対話（CI）実行
   できるようになる。
5. `eas submit` 側の認証（App Store Connect への提出権限）は、CI で確実に非対話実行するため
   App Store Connect API Key 方式を使う。App Store Connect の Users and Access > Integrations
   で API Key（`.p8`）を発行し、ローカルで次を対話実行して EAS のアカウントに Key をアップロード
   する。

   ```bash
   bunx eas-cli@21.0.2 credentials --platform ios
   ```

   `Set up your project to use App Store Connect API` の案内に従い Key ID / Issuer ID /
   `.p8` ファイルを入力する。アップロード後は `.p8` ファイル自体をローカルにも CI にも残さない
   （EAS のサーバ側にだけ保存される）。
   [`eas.json`](../../eas.json) の `submit.production.ios` は `appleId` / `appleTeamId` /
   API キーのパスを書かず、非対話実行に必須の `ascAppId`（非秘密の数値 ID、上記手順 3 で
   置き換え済みのはず）だけを持つ。理由は
   [ADR-0031](../adr/0031-eas-testflight-automated-release.md) を参照する。owner がローカルの
   `bun run submit:ios` で既存 Build を手動再提出したい場合も同じ資格情報を再利用できる。
6. 以降はバージョンタグを push するだけで TestFlight に自動で上がる。TestFlight タブで
   テスター（自分 + 友人）を追加する。

## 以降の運用（タグ push だけ）

`app.json` の `expo.version`（マーケティングバージョン）を上げたいときだけ `app.json` を
更新してコミットする。`ios.buildNumber` は `eas.json` の `appVersionSource: "remote"` により
EAS サーバ側で管理されるため、リリースのたびに手で書き換える必要はない
（`autoIncrement: true` により production プロファイルのビルドごとに自動採番される）。

```bash
git tag v1.0.0
git push origin v1.0.0
```

タグ push 後、GitHub Actions の `ios-release` ワークフローの実行結果を確認する。

```bash
gh run list --workflow=ios-release.yml
gh run watch <run-id>
```

ビルド失敗時は EAS のダッシュボード（`https://expo.dev`）のビルドログで詳細を確認する。
再実行したいときはタグを打ち直さず `workflow_dispatch` で同じワークフローを再実行できる。
`workflow_dispatch` は指定した ref（未指定なら既定ブランチ）を checkout するため、
**必ず `--ref` で対象タグを明示する**。省略すると、タグ push 後に `main` が進んでいた場合に
意図しない commit を Build してしまう。

```bash
gh workflow run ios-release.yml --ref v1.0.0
```

## npm hook ではなく EAS Custom Build を使う理由

`scripts/setup-llama-native.sh` は `node_modules/llama.rn/install/download-native-artifacts.js`
を実行するため、`llama.rn` パッケージ自体が `node_modules` に解決済みであることが前提になる。
一方、`node_modules/llama.rn/llama-rn.podspec` は
`s.vendored_frameworks = "ios/rnllama.xcframework"` を宣言しており、CocoaPods はこの File が
`pod install` の実行時点で存在しないと参照を解決できない（存在しない glob は黙って空扱いになり、
Xcode の link 時に undefined symbol になる）。つまり Native artifact の取得は
「`npm install` 完了後・`pod install` 実行前」という window に入れる必要がある。

EAS Build の 2 つの npm hook はどちらもこの window に一致しない。

- `eas-build-pre-install` は `npm install` の**前**に実行されるため、`node_modules/llama.rn`
  自体がまだ存在せず `scripts/setup-llama-native.sh` が失敗する。
- `eas-build-post-install` は Android では `npm install` + `prebuild` の直後に実行されるが、
  **iOS では `pod install` 完了後に実行される**（[Expo 公式ドキュメント](https://docs.expo.dev/build-reference/npm-hooks/)：
  "For iOS, runs once after the following commands have all completed: `npm install`,
  `npx expo prebuild` (if needed), and `pod install`."）。つまり Native artifact を取得する前に
  `pod install` が完了してしまっており手遅れである。

そこで、EAS の [Custom Builds](https://docs.expo.dev/custom-builds/get-started/) 機能で
Build Step の順序を明示的に組み直し、`eas/prebuild` の直後・`pod install` の直前に
`make setup-llama-native` を実行する専用ステップを差し込む。

- development プロファイル（Simulator 用）: [`.eas/build/ios-simulator-build.yml`](../../.eas/build/ios-simulator-build.yml)
- preview / production プロファイル（署名済み実機 Build）: [`.eas/build/ios-device-build.yml`](../../.eas/build/ios-device-build.yml)

いずれも [`eas.json`](../../eas.json) の各プロファイルの `ios.config` から参照する。
Custom Build を使う場合、npm lifecycle hook（`eas-build-pre-install` / `eas-build-post-install`）
は自動実行されなくなる（Expo 公式ドキュメントも "lifecycle hooks are not automatically executed
in custom builds and must be manually extracted and called during the build steps" と明記
している）ため、`package.json` に `eas-build-post-install` は定義していない。

Custom Build は既定の Build Step 構成も自前で組み直す必要がある。
`.eas/build/ios-device-build.yml` には `eas/configure_ios_credentials` の直後に
`eas/configure_ios_version` を明示的に含めている。これを省略すると、`eas.json` の
`cli.appVersionSource: "remote"` / `production.autoIncrement: true`（EAS サーバ側の台帳で
`buildNumber` を管理し Git へ書き戻さない設計）が適用されず、`app.json` の
`ios.buildNumber`（常に `"1"`）に固定されてしまう。同じ `expo.version` のまま 2 回目以降の
Build を提出すると buildNumber 重複で Apple に reject されるため、この Step は必須である。

## Secrets 未設定時の挙動

`EXPO_TOKEN` が GitHub Secrets に未設定の場合、`ios-release` ワークフローは fail せず、
warning を出して以降のステップをすべて skip する。owner が上記の初回セットアップを終えて
`EXPO_TOKEN` を登録するまで、他の push でこのワークフローが赤くなることはない。

## 禁止事項

- `eas.json` に `appleId` / `appleTeamId` / API キーのパス等を直書きしない。`ascAppId`
  は App Store Connect 上で公開される数値 ID であり秘密情報ではないため対象外
  （上記手順 3 参照）。
- `EXPO_TOKEN` や Apple の認証情報を GitHub Actions の `run:` ログに出力しない。
- ワークフローに Apple の秘密情報（証明書、Provisioning Profile、API キー）を持ち込まない。
  署名は EAS が管理する認証情報だけで完結させる。

## 既知の制約と follow-up

EAS のクラウドビルド環境で `llama.rn` の Native artifact 取得（`make setup-llama-native`）が
失敗する場合の代替経路（Development Build のローカルビルドを TestFlight にアップロードする
経路）は follow-up として記録済みである。`/follow-up list` で確認できる。

## 外部資料

- EAS Build の設定リファレンス: https://docs.expo.dev/eas/json/ 。
- EAS Build を他の CI サービスから使う: https://docs.expo.dev/build/building-on-ci/ 。
- EAS Submit（iOS）: https://docs.expo.dev/submit/ios/ 。
- EAS Build の npm フック: https://docs.expo.dev/build-reference/npm-hooks/ 。
- EAS Custom Builds: https://docs.expo.dev/custom-builds/get-started/ 。

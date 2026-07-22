# ADR-0031: EAS + GitHub Actions によるタグ push から TestFlight までの全自動リリース

- **Status**: Accepted
- **Date**: 2026-07-22
- **Deciders**: Susumu Tomita (@susumutomita)

## Context

owner が個人 Apple Developer Program（有料）を有効化し、[Issue 108](https://github.com/susumutomita/TenkaCloudPassport/issues/108)
で「バージョンタグ push → GitHub Actions → EAS Build → EAS Submit → TestFlight」の完全自動
リリースを求めた。本リポジトリはすでに `expo-build-properties` と config plugin
（`llama.rn`）を使う Continuous Native Generation（CNG）構成であり、`ios/` / `android/` は
`.gitignore` 対象で Git に存在しない（[Native Development Build 手順](../development/native-builds.md)）。

候補は 2 つあった。

1. **Xcode Cloud**: Apple 公式の CI/CD。しかし Xcode Cloud は Git リポジトリに commit された
   `ios/` project を前提にビルドするため、CNG で毎回動的生成される `ios/` とは相性が悪い
   （commit するとハンドで編集した Native project と config plugin の出力が乖離するリスクが
   ある一方、CNG のまま Xcode Cloud にビルドさせる公式な統合経路がない）。owner はこの
   ミスマッチを理由に不採用と決定した。
2. **EAS Build + EAS Submit**（今回採用）: Expo 公式のクラウドビルドサービスで、CNG を
   前提にした `expo prebuild` をビルド側で自動実行する。GitHub Actions は「ビルドを起動する
   トリガー」だけを担い、実際の iOS ビルドと署名は EAS のクラウド環境と EAS が管理する
   Apple 認証情報で完結する。

Android は既存の [Android Artifact Release Runbook](../development/android-artifact-release.md)
で「GitHub-hosted CI で秘密鍵を扱う経路は、権限・Secret 管理・Artifact Attestation を
別 ADR で承認するまで採用しない」と明記されており、Keystore は Release Custodian が手動で
管理し続けている。iOS で GitHub Actions からの完全自動リリースを承認できるのは、Apple の
署名鍵・証明書そのものを GitHub Secrets に置くのではなく、EAS が自社のサーバ側で証明書 /
Provisioning Profile / App Store Connect API Key を管理し、GitHub Actions 側は EAS への
アクセストークン（`EXPO_TOKEN`）だけを扱う設計になっているためである。

## Decision

1. **EAS Build + EAS Submit を採用し、Xcode Cloud は不採用とする**（owner 決定、上記 Context
   の理由による）。
2. **`eas.json` の `cli.appVersionSource` は `"remote"` を選ぶ。** `"local"` の場合
   `autoIncrement` は EAS のエフェメラルなビルド VM 内の `app.json` にしか反映されず、Git へ
   書き戻されない。GitHub Actions からの完全自動リリースでは書き戻しコミットを起こさない
   方針のため、`"remote"`（EAS サーバ側の台帳で `buildNumber` を管理し、初回は
   `app.json` の `ios.buildNumber` から初期化される）を選ぶ。
3. **`llama.rn` の Native artifact 取得は npm hook（`eas-build-pre-install` /
   `eas-build-post-install`）ではなく EAS Custom Build のステップで行う。**
   `scripts/setup-llama-native.sh` は `node_modules/llama.rn/install/download-native-artifacts.js`
   に依存しており、依存関係インストール前に走る `eas-build-pre-install` フックではまだ
   `node_modules/llama.rn` が存在せず失敗する。一方、`node_modules/llama.rn/llama-rn.podspec`
   は `s.vendored_frameworks = "ios/rnllama.xcframework"` を宣言しており、CocoaPods は
   `pod install` の実行時点でこの File が存在しないと参照を解決できない。iOS の
   `eas-build-post-install` フックは Expo 公式ドキュメントによれば `pod install` 完了**後**に
   実行されるため、`node_modules/llama.rn` は解決済みでも CocoaPods の解決には**間に合わない**
   （当初 `eas-build-post-install` を採用する案でレビューしたが、この事実誤認をコードレビューで
   指摘された）。`npm install` 完了後・`pod install` 実行前という window に一致する npm hook は
   存在しないため、EAS の [Custom Builds](https://docs.expo.dev/custom-builds/get-started/)
   機能で Build Step の順序を明示的に組み直し、`eas/prebuild` の直後・`pod install` の直前に
   `make setup-llama-native` を実行する専用ステップを差し込む
   （`.eas/build/ios-simulator-build.yml` / `.eas/build/ios-device-build.yml`）。
   また、GitHub Actions ランナー側で Native artifact を取得しても EAS のクラウドビルドには
   渡らない（EAS はソースを別途アップロードし、クラウド側で独立して依存関係を解決するため）
   ことを確認した。取得はビルド本体が走る EAS 側で完結させる必要がある。
   Custom Build へ移行したことで既定の Step 構成（`eas/configure_ios_version` を含む）を
   自前で組み直す必要があると気づいたため、`ios-device-build.yml` には
   `eas/configure_ios_credentials` の直後に `eas/configure_ios_version` も明示的に含める
   （省略すると Decision 2 の `appVersionSource: "remote"` が適用されず、`app.json` の
   `ios.buildNumber`（常に `"1"`）に固定されてしまい、2 回目以降の Build が buildNumber
   重複で reject される。この省略は最初のコードレビューで指摘されて気づいた）。
4. **GitHub Actions ワークフロー（`ios-release.yml`）はビルドを非対話で起動するだけの薄い層
   にする。** プロジェクト依存関係のインストール（`bun install`）はランナー側では行わない。
   `eas-cli` は静的な `app.json` を読むだけで動作し、実際のビルドは EAS 側で完結するため。
   Secrets（`EXPO_TOKEN`）が未設定の場合は fail ではなく明示 skip し、owner が Secrets を
   投入する前の他の push で CI が赤くならないようにする。
5. **Apple の秘密情報（appleId / API キー / provisioning / Team ID）はワークフローにも
   `eas.json` にも直書きしない。** owner が初回だけローカルで `eas build` / `eas submit` を
   対話実行し、EAS のアカウントに認証情報を預ける。以降の CI 実行は `EXPO_TOKEN` だけで
   完結する。

## Consequences

- **Good**: owner はバージョンタグを push するだけで TestFlight まで自動で届くようになる。
  GitHub Actions のワークフロー自体は Apple の秘密情報を一切扱わないため、ワークフロー漏洩時の
  被害範囲が EAS アクセストークン（`EXPO_TOKEN`）の失効・再発行で収まる。
- **Good**: `appVersionSource: "remote"` により、リリースのたびに `app.json` を書き換えて
  コミットする追加の自動化（コミットする GitHub Actions への書き込み権限付与）が不要になる。
- **Bad**: 署名済み証明書・Provisioning Profile の実体は EAS のサーバ側にあり、リポジトリの
  外に存在する。EAS アカウントの侵害や契約終了時は改めて資格情報の再登録が必要になる。
- **Bad**: Android（Keystore は Release Custodian が手動管理）と iOS（EAS が認証情報を管理し
  GitHub Actions から完全自動）でリリース経路の信頼境界が非対称になる。これは意図的な選択
  だが、将来 Android も同様に自動化する場合は本 ADR とは別に、Keystore を GitHub Actions から
  扱うことの是非を独立して検討する必要がある。
- **Tradeoff**: `appVersionSource: "remote"` を選んだことで、`ios.buildNumber` の実際の値は
  `app.json` を見ただけでは分からなくなる（EAS のダッシュボードか `eas build:version:get` で
  確認する）。ローカルビルドと EAS ビルドで参照する採番方式が異なる点は
  [docs/development/ios-testflight-release.md](../development/ios-testflight-release.md) に
  明記した。

## References

- 関連コード: `eas.json`、`.eas/build/ios-simulator-build.yml`、
  `.eas/build/ios-device-build.yml`、`.github/workflows/ios-release.yml`、`package.json`
  （`build:ios:testflight` / `submit:ios`）、`scripts/setup-llama-native.sh`。
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/108 。
- 関連 ADR: [ADR-0008](./0008-expo-local-agent-foundation.md)、
  [ADR-0010](./0010-native-delivery-quality-gates.md)。
- 外部資料: https://docs.expo.dev/eas/json/ 、https://docs.expo.dev/build/building-on-ci/ 、
  https://docs.expo.dev/build-reference/npm-hooks/ 、
  https://docs.expo.dev/custom-builds/get-started/ 。

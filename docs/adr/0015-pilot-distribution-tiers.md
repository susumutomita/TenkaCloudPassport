# ADR-0015: Pilot 配布を能力別 Tier と Scale Gate で分離する

- **Status**: Accepted
- **Date**: 2026-07-18
- **Deciders**: susumutomita

## Context

Expo Go / Web は Rules Provider の Product Hypothesis を検証できるが、Custom Native Code を追加できず、
Local GGUF と Nearby Transport の実機証拠にはならない。一方、最初から TestFlight / App Store を必須にすると、
会話開始の仮説より前に有料 Apple 登録と非開発者向け配布運用が Critical Path になる。Xcode Personal Team は
無料の個人端末検証に使えるが、7 日の Provisioning と少数端末制約があり Public Distribution ではない。

## Decision

配布を Tier A `Product Hypothesis`、Tier B `Native Lab`、Tier C `Public Community Beta` に分ける。
Tier A は Web / Expo Go と Rules、Tier B は署名済み Android APK と各 Tester 自身の iOS Personal Team Build、
Tier C は TestFlight / Store を使う。Settings は Platform Composition Root から注入した Runtime capability を
表示し、Tier A で Local LLM / Nearby が動くように見せない。Native Binary は配布経路を自動推測せず、
Build-time の署名済み Release metadata がない限り Tier B / C を未判定にする。

12 名の Core Pilot は Tier B、Core Team 不在の 2 地域 Pilot は Tier C を事前選択する。Tier B の必要な
Device Matrix が未完了なら Core Pilot を Tier A の別条件へ縮小し、結果を混ぜない。非開発者への継続 iOS 配布が
必要になった時点を Apple Cost Gate とし、それ以前は有料 Program を完了条件にしない。

Android の直接配布 APK は同じ Package ID / App Signing Certificate、追跡設定で単調増加する `versionCode`、
`apksigner` 検証、SHA-256 record、Source Commit、Capability / Device Matrix を必須にする。Signing Key は Repository と
Facilitator へ渡さず、暗号化保管、分離バックアップ、Restore 演習、Fingerprint 台帳を必須にする。低い
`versionCode` への Downgrade ではなく、同じ Certificate と高い `versionCode` の修正版を Rollback 経路とする。

## Consequences

- **Good**: Rules による初期仮説を費用待ちにせず、Native 能力と配布能力を誇張せずに段階検証できる。
- **Bad**: Tier ごとに Matrix と説明を維持し、Core Pilot では Tester の Native Setup が必要になる。
- **Tradeoff**: 最初から Store だけを使う案と Expo Go だけを使う案を捨てる。Personal Team の公式制約、
  Pilot の参加者構成、Apple / Android の配布契約、Issue 17 / 20 の Device Matrix が変わった場合に再検討する。

## References

- 関連設計: [Pilot 配布 Tier と Scale Gate](../design/distribution-tiers.md)
- Android 運用: [Android Artifact Release Runbook](../development/android-artifact-release.md)
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/28
- 関連 ADR: [ADR-0010](./0010-native-delivery-quality-gates.md)
- Apple: https://developer.apple.com/help/account/basics/about-your-developer-account/
- Expo: https://docs.expo.dev/develop/development-builds/create-a-build/
- Android: https://developer.android.com/studio/publish/app-signing

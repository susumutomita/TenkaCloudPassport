# Pilot 配布 Tier と Scale Gate

本書は Issue 28 の、初期仮説検証を有料 Apple Developer Program の登録待ちにせず、
実行環境が持たない能力を持つように見せない配布契約を定める。Native Build の具体手順は
[Native Development Build 手順](../development/native-builds.md)、Android Artifact の完全性と
更新手順は [Android Artifact Release Runbook](../development/android-artifact-release.md) を正本とする。

## 実装状態と配布状態を分ける

機能が source tree に実装されていること、Native Build に含まれること、実機 Matrix が通っていること、
非開発者へ継続配布できることは別の状態です。UI と Release 文書は次の語を使い分けます。

- `available` は現在の実行環境で検証済みの経路を利用できる状態である。
- `requires setup` は Native code はあるが、GGUF、権限または実機設定が必要な状態である。
- `unavailable` は現在の Binary に能力がない状態である。
- `unverified` は実装だけがあり、必要な Device Matrix が未完了の状態である。

CI、Web Export、Expo Go の Green を Native 実機、配布、Offline Nearby の証拠に置き換えない。

## 配布 Tier

| Tier | 対象 | 配布経路 | 検証できること | 検証できないこと |
| --- | --- | --- | --- | --- |
| A: Product Hypothesis | 開発環境を持たない参加者を含む初期確認である。 | Web または Expo Go である。 | Rules Provider、単一端末 Encounter、Consent、Bridge / `no-signal`、人間の会話開始である。 | `llama.rn`、GGUF、Custom Native Code、Nearby Transport、Native Permission、実機性能である。 |
| B: Native Lab | Core Team と自分で Build または検証済み APK を導入できる少数 Tester である。 | Android は署名済み APK、iOS は各 Tester 自身の Xcode Personal Team Build である。 | Local LLM、Camera、Nearby、Native Permission、Offline、端末資源を各 Issue の Device Matrix が通った範囲で検証できる。 | 非開発者への継続 iOS 配布、App Store 品質、Matrix 未完了の機能である。 |
| C: Public Community Beta | Core Team 不在で参加する非開発者を含む Community である。 | iOS は TestFlight / App Store、Android は署名済み Release または Store である。 | Versioned Binary の継続更新、非開発者 Setup、広域 Pilot である。 | Store 審査前の能力、未検証端末、SLA である。 |

Tier は製品の優劣ではありません。同じ source でも配布経路と証拠が異なるため、Tier A を「簡易版」、
Tier B を「完成版」と呼びません。Rules Provider は完全な基準経路です。

## Capability Matrix

| 能力 | Web | Expo Go | 署名済み Android APK | iOS Personal Team | TestFlight | Store |
| --- | --- | --- | --- | --- | --- | --- |
| Rules Provider | 利用できる。 | 利用できる。 | 利用できる。 | 利用できる。 | Binary に含まれる場合に利用できる。 | Binary に含まれる場合に利用できる。 |
| Custom Native Code | 利用できない。 | Expo Go 固定の Native module 以外は利用できない。 | Build に含められる。 | Build に含められる。 | Archive に含められる。 | Release Binary に含められる。 |
| Local GGUF | 利用できない。 | 利用できない。 | Issue 17 / 18 の実機 Matrix が通った組合せだけである。 | Issue 17 / 18 の実機 Matrix が通った組合せだけである。 | 同じ Matrix と配布 Build の再検証が必要である。 | 同じ Matrix と配布 Build の再検証が必要である。 |
| Nearby Transport | 利用できない。 | 利用できない。 | Issue 20 / 22 の採用 Adapter と Device Matrix が通った範囲だけである。 | Issue 20 / 22 の採用 Adapter と Device Matrix が通った範囲だけである。 | 同じ Matrix と配布 Build の再検証が必要である。 | 同じ Matrix と配布 Build の再検証が必要である。 |
| iPhone への導入 | 対象外である。 | App Store の Expo Go を使う。 | 対象外である。 | Tester 自身が Xcode で Build する。 | Apple Developer Program と App Store Connect が必要である。 | Apple Developer Program と審査が必要である。 |
| 継続利用 | Hosting が続く範囲である。 | 対応 Expo SDK の範囲である。 | 同じ署名鍵と Package ID の更新が必要である。 | Provisioning 失効前に再 Build する。 | TestFlight の配布期限と審査条件に従う。 | Store の配布条件に従う。 |

本 Matrix の「利用できる」は経路の能力を示し、未完了 Issue の実装済み表示ではない。各機能の
Device Matrix がない場合は `unverified` と表示する。

## App 内の能力表示

Settings は現在の Runtime を次の 3 種類に分け、固定の Allowlist 文言だけを表示する。

| Runtime | 表示 Tier | 必須表示 |
| --- | --- | --- |
| Web | Tier A | Rules は利用可能、Local LLM と Nearby は利用不可である。 |
| Expo Go | Tier A | Rules は利用可能、Local LLM と Nearby は利用不可である。 |
| Native Build | 未判定 | Rules は利用可能、Local LLM は GGUF 設定と実機検証が必要、Nearby は未実装である。Tier B / C は Release metadata で確認する。 |

Provider の実行結果だけから Runtime を推測しない。Native Build でも Model 未設定なら Rules に
なるため、Platform Composition Root が Runtime capability を明示的に注入する。Native Binary だけから
直接配布 APK、Personal Team、TestFlight、Store を区別しない。Build-time の署名済み Release metadata が
導入されるまでは Tier を未判定と表示し、Tier B または C を自動表示しない。

## Pilot の事前選択

- 12 名の Core Pilot は Tier B を選ぶ。Core Team が同席し、Android の署名済み APK と、iOS Tester
  自身の Personal Team Build を少数端末へ準備できるためである。Local LLM / Nearby の Matrix が
  未完了なら、その機能を除いた Tier A セッションへ明示的に切り替え、測定条件を混ぜない。
- 2 地域の Distributed Pilot は Tier C を選ぶ。Core Team 不在の非開発者へ、7 日ごとの Xcode 再 Build や
  Apple Account 操作を要求することは再現可能な配布ではないためである。iOS 参加者を含まない限定 Pilot に
  変更する場合だけ、Android の Tier B を別条件として再承認する。

## Apple Cost Gate

| 条件 | 判断 |
| --- | --- |
| Rules で会話開始の仮説を検証する。 | Tier A を使い、有料登録を行わない。 |
| Core Team が少数の iPhone で Local LLM / Nearby を検証する。 | Tester 自身の Personal Team Build を使い、有料登録を必須にしない。 |
| Core Team 不在の非開発者へ iOS Binary を継続配布する。 | Tier C へ進み、Apple Developer Program を再評価する。 |
| TestFlight / App Store、EAS 上の iPhone Device Build が必要である。 | 有料 Program を必要条件として明示する。 |
| Personal Team の制約を避けるため Certificate や Apple Account を共有したくなる。 | Tier を上げるか Pilot を縮小し、Credential 共有を行わない。 |

Personal Team は App ID 10 件、端末 3 台、端末ごとの App 3 件までであり、App ID、Device 登録と
Provisioning Profile は 7 日で失効する。Tester は自分の Apple Account と Certificate を使い、Repository、
GitHub Secret、Facilitator、他の Tester と共有しない。

## 代替案

1. 最初から TestFlight / Store だけを使う案は非開発者へ配りやすいが、Product Hypothesis と Native Lab の
   前に費用、審査、配布運用を必須にするため採用しない。
2. Expo Go を全 Pilot の単一経路にする案は無料であるが、Custom Native Code が使えず Local LLM / Nearby の
   仮説を検証できないため採用しない。
3. Tier A / B / C を検証目的で分ける案は Matrix 管理が必要になるが、費用と能力を誤認させず、必要な時点だけ
   配布強度を上げられるため採用する。

## 外部資料

- Apple Developer account overview: https://developer.apple.com/help/account/basics/about-your-developer-account/ 。
- Expo Development Build: https://docs.expo.dev/develop/development-builds/introduction/ 。
- Expo Build の選択肢: https://docs.expo.dev/develop/development-builds/create-a-build/ 。
- Android App Signing: https://developer.android.com/studio/publish/app-signing 。
- Android `apksigner`: https://developer.android.com/tools/apksigner 。

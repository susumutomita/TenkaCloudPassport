# Android Artifact Release Runbook

本書は Tier B で配布する Android APK の署名、完全性確認、更新、停止、Rollback を定める。
APK は Issue 28 の配布判断であり、Model Weight、参加者データ、Certificate の秘密鍵を含めない。

## Release 前提

- Release 対象を annotated Git tag と完全な Commit SHA に固定する。
- `make before-commit`、Android Development Build、対象 Device Matrix を同じ Commit で通す。
- Package ID、`app.json` の `expo.version` / `android.versionCode` を確認し、`android.versionCode` を
  過去 Release より増やして Commit する。Plugin のデフォルト値や生成済み Native project だけを
  正本にしない。
- App Signing Key と Keystore Password は承認済み Release Custodian だけが管理し、Repository、GitHub Issue、
  PR、Facilitator、APK と同じ保存先へ置かない。
- GitHub Release へ置く前に、対応能力、未検証能力、検証日、対象 OS / Device を記録する。

過去 Release 台帳の `versionCode`（初回は `0`）を渡し、追跡設定が単調増加していることを Build 前に
検証する。

```bash
bun scripts/android-artifact-integrity.ts version app.json <previous-version-code>
```

## Signing Key custody

- Android Studio の秘密値入力 UI で Release 専用 Keystore を生成し、Debug Key や他 Product の Key を再利用しない。
- Primary Keystore は暗号化済み・アクセス制御済みの保管先に置き、Password は別の Password Manager で
  承認済み Release Custodian だけに許可する。Facilitator と Tester には渡さない。
- 別の管理境界に暗号化した Offline バックアップを 1 つ持つ。半年ごとと Custodian 変更時に隔離環境へ
  Restore し、使い捨て APK の署名と Certificate Fingerprint 一致を確認して検証 copy を破棄する。
- 公開台帳に Package ID、Certificate SHA-256、作成日、有効期限、現行 Key ID、最終 Restore 演習日を
  記録する。Keystore path、Alias、Password、バックアップ保管先は公開しない。
- 通常の Rotation は、旧 Key で安全に更新できる期間に Store の Key Rotation または新 Package への明示 Migration として
  計画する。Custodian 剥奪、バックアップ紛失、Key compromise では新規配布を即時停止し、同じ Key の修正版を
  信頼回復として扱わない。

## Build と署名

通常依存の lifecycle script を実行せず、Native project を再生成してから Android Studio の
`Generate Signed Bundle / APK` または Android SDK の `apksigner` で Release APK を署名する。

```bash
make install
bunx expo prebuild --clean --platform android --no-install
```

署名後に APK を変更しない。`zipalign` が必要な場合は署名前に実行する。署名検証は Android SDK
Build Tools の `apksigner` で行い、表示された Signer Certificate SHA-256 が Release 台帳の公開 Fingerprint と
一致することを別の Reviewer が確認する。

```bash
apksigner verify --verbose --print-certs path/to/tenkacloud-passport.apk
```

Keystore、Password、Private Key を command output、shell history、CI log へ出さない。GitHub-hosted CI で
秘密鍵を扱う経路は、権限、Secret 管理、Artifact Attestation を別 ADR で承認するまで採用しない。

## SHA-256 と公開内容

Repository の cross-platform verifier で APK の SHA-256 record を作成し、同じ verifier で再検証する。署名後の
APK を Release Operator だけが書き込める staging directory へ固定し、他 Process の書き込みを停止してから実行する。
Verifier は読取中のサイズ・時刻変化、symlink、過大 checksum record を拒否する。UNIX 系では
`O_NOFOLLOW` を追加し、その Flag がない Windows でも `lstat` → open 後の `fstat` → 読取完了後の再 `lstat` の
device / inode 同一性を検査する。経路が symlink になる、または open 前後で別 File に差し替わる場合は
Platform にかかわらず fail-closed とする。

```bash
bun scripts/android-artifact-integrity.ts write path/to/tenkacloud-passport.apk
bun scripts/android-artifact-integrity.ts verify path/to/tenkacloud-passport.apk path/to/tenkacloud-passport.apk.sha256
```

GitHub Release は次を同じ Tag へ添付する。

- 署名済み APK である。
- `<apk-file-name>.sha256` である。
- Source Tag と完全な Commit SHA である。
- Signer Certificate SHA-256 Fingerprint である。
- Capability Matrix、対象 Device / OS、検証日、既知の制約である。

利用者は APK を開く前に SHA-256 を検証する。SHA-256 は配布中の byte が変わっていないことだけを示し、
APK の作者を証明しない。作者と更新可能性は Android の署名検証と同じ Certificate で確認する。

## 更新

更新は同じ Package ID と App Signing Certificate を使い、`versionCode` を単調増加させる。新しい Tag、
APK、SHA-256、完全な Commit SHA、Capability Matrix、Device Matrix を毎回作り直す。古い APK の checksum を
新しい APK に流用せず、別 Certificate で署名した APK を同じ App の更新として配らない。

Key を紛失した場合、同じ Package ID の直接配布 APK を安全に更新できない。新しい Key と Package ID を
「復旧」として黙って配らず、配布を停止して Incident Review と移行判断を行う。

## Rollback と配布停止

Android の更新契約は低い `versionCode` への Downgrade を通常の Rollback に使えない。障害時は次の順で扱う。

1. GitHub Release を `Do not install` と明示し、新規配布を停止する。Privacy / Signing Incident では Asset も
   非公開にするが、既に取得された copy を回収できるとは表現しない。
2. 影響範囲、Certificate Fingerprint、該当 SHA-256、既存データへの影響を内容なしで公表する。
3. 直前の安全な Source を、互換性を確認した上で同じ Certificate と、より高い `versionCode` で再 Build する。
4. 新しい Tag、APK、checksum、Matrix として配布し、旧版からの上書き更新を確認する。
5. 上書き更新が安全でない場合は、手動 JSON バックアップの対象と平文リスクを説明してから Uninstall / Reinstall を
   案内する。Uninstall が Local Profile、Model、Settings を削除することを事前に明示する。

Key compromise では同じ Key による修正版を信頼回復として扱わない。直接配布を停止し、Platform の Key Rotation
または新しい Package への明示 Migration を Security Review で決める。

## 禁止事項

- Debug Key で署名した APK を Tier B Release と呼ばない。
- Keystore、Password、Private Key、Apple Certificate、Participant Data を Release Asset に含めない。
- SHA-256 だけを署名の代わりにしない。
- URL shortener、非公式 App Store、Certificate 共有、無理な Side-loading で Tier C を迂回しない。
- Device Matrix がない Native 機能を `available` と記載しない。

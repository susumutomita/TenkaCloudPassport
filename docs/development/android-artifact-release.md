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
- Android SDK の `apkanalyzer` runtime classpath と `apksigner.jar` を含む専用 Toolchain Root、Java Runtime Home、
  Git executable を canonical absolute Path に固定する。SDK / Java は symlink を含まない Directory tree 全体、Git は
  executable の lowercase SHA-256（区切りなし 64 桁）を承認記録にする。PATH 上の launcher、shell alias、未承認の
  自動更新後 Tool は Gate に使わない。SDK / Java 更新後は Path、Version、tree SHA-256 を再承認する。

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
bun scripts/android-release-identity.ts provenance \
  android/app/src/main/res/raw/tenka_release_provenance.json <annotated-source-tag> \
  /canonical/path/to/real-git <approved-git-sha256>
```

`provenance` は追跡済み Worktree が clean、指定 Tag が annotated tag、Tag の参照先が現在の `HEAD` の場合だけ、
schema version、Source Tag、完全な Commit SHA を raw resource へ atomic に書く。この File を生成した後に Build / Sign
し、別 Commit の File を流用しない。

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
APK を Repository worktree 外にある Release Operator だけが書き込める staging directory へ固定し、他 Process の
書き込みを停止してから実行する。APK、checksum、release manifest を untracked source として worktree 内へ置かない。
Verifier は読取中のサイズ・時刻変化、symlink、過大 checksum record を拒否する。UNIX 系では
`O_NOFOLLOW` を追加し、その Flag がない Windows でも `lstat` → open 後の `fstat` → 読取完了後の再 `lstat` の
device / inode 同一性を検査する。経路が symlink になる、または open 前後で別 File に差し替わる場合は
Platform にかかわらず fail-closed とする。
APK は 512 MiB を上限とする。Identity Gate は checksum と一致した APK を mode `0700` の private temporary
directory へ `0600` で排他的に copy し、hash と File identity を再確認して `0400` にする。`apkanalyzer` と
`apksigner` は元の変更可能な Path ではなく同じ snapshot だけを順番に読む。Tool 実行後は snapshot と元の
APK / checksum pair を再検証し、成功・失敗のどちらでも snapshot を削除する。

Source 設定は Worktree の `app.json` ではなく、検証済み Tag / HEAD Commit の `app.json` blob から読む。Git は
15 秒、Android SDK Tool は 1 command 60 秒、stdout / stderr は各 256 KiB、Git executable は 64 MiB、SDK / Java
tree は File / Directory 合計 16,384 entries、深さ 32、合計 4 GiB を上限とする。各 File は `lstat` の size を
残り byte budget と比較してから読み、Directory は bounded iterator で列挙する。Git は継承した `GIT_*` を捨て、
replace object を無効化し、
replace refs、assume-unchanged / skip-worktree entry を拒否する。Android Tool は launcher を実行せず、承認済み Java から
classpath JAR / `apksigner.jar` を直接実行する。Java / SDK tree は安定した File Handle から mode `0700` の private
temporary directory へ排他的に copy し、内容 fingerprint が承認値と一致した snapshot の File / Directory から
write bit を外す。全 Android command は同じ snapshot だけを実行し、完了後に fingerprint を再検証して、成功・失敗の
どちらでも削除する。環境は snapshot の `JAVA_HOME` と Java directory だけへ閉じる。Snapshot 作成には承認 tree と
同容量までの一時 Disk が必要である。

macOS の `/usr/bin/git` は Command Line Tools 内の実 Git を選ぶ system shim なので承認対象にしない。`xcrun --find git`
が返す canonical な実 executable を直接渡し、その File の SHA-256 を承認する。他 Platform でも shell alias や launcher
ではなく、実行する canonical executable 自体を渡す。

SDK Root は `cmdline-tools/<version>/lib/apkanalyzer-classpath.jar` とその参照 JAR、
`build-tools/<version>/lib/apksigner.jar` を同じ root 配下に持つ、Release 専用の最小構成にする。Java Home と合わせ、
自動更新を停止した後で承認 fingerprint を作る。

```bash
bun scripts/android-toolchain-integrity.ts fingerprint /canonical/android-toolchain-root
bun scripts/android-toolchain-integrity.ts fingerprint /canonical/java-home
```

```bash
bun scripts/android-artifact-integrity.ts write path/to/tenkacloud-passport.apk
bun scripts/android-artifact-integrity.ts verify path/to/tenkacloud-passport.apk path/to/tenkacloud-passport.apk.sha256
bun scripts/android-release-identity.ts write \
  path/to/tenkacloud-passport.apk \
  path/to/tenkacloud-passport.apk.sha256 \
  <annotated-source-tag> <public-certificate-sha256> \
  /canonical/android-toolchain-root <approved-toolchain-sha256> \
  /canonical/android-toolchain-root/cmdline-tools/<version>/lib/apkanalyzer-classpath.jar \
  /canonical/android-toolchain-root/build-tools/<version>/lib/apksigner.jar \
  /canonical/java-home <approved-java-runtime-sha256> \
  /canonical/path/to/real-git <approved-git-sha256>
bun scripts/android-release-identity.ts verify \
  path/to/tenkacloud-passport.apk \
  path/to/tenkacloud-passport.apk.sha256 \
  path/to/tenkacloud-passport.apk.release.json \
  <annotated-source-tag> <public-certificate-sha256> \
  /canonical/android-toolchain-root <approved-toolchain-sha256> \
  /canonical/android-toolchain-root/cmdline-tools/<version>/lib/apkanalyzer-classpath.jar \
  /canonical/android-toolchain-root/build-tools/<version>/lib/apksigner.jar \
  /canonical/java-home <approved-java-runtime-sha256> \
  /canonical/path/to/real-git <approved-git-sha256>
```

`write` と `verify` は、実 APK から抽出した Package ID / versionCode / provenance と単一 Signer Certificate を、
追跡済み `app.json`、現在の annotated Tag / HEAD、公開 Fingerprint、APK / checksum pair に完全一致させる。生成する
`<apk>.release.json` は APK identity に加えて Git / SDK / Java fingerprint を持つ strict manifest である。どれか
1 項目でも不一致、複数 Signer、SDK tool の失敗・timeout、
APK / checksum / release manifest の読取中差替があれば非 0 にする。署名 APK が無い現在の状態は `Not run` であり、
本 Gate の実装だけを配布証拠として扱わない。

`apkanalyzer` の引数は Android 公式の
[APK analyzer command-line syntax](https://developer.android.com/tools/apkanalyzer)、署名検証は
[apksigner](https://developer.android.com/tools/apksigner) の `verify --verbose --print-certs -Werr` に従う。
Android Open Source Project の
[`apksigner` launcher](https://android.googlesource.com/platform/tools/apksig/+/refs/heads/master/etc/apksigner) は
Java から `apksigner.jar` を実行し、
[`apkanalyzer` build](https://android.googlesource.com/platform/tools/base/+/studio-master-dev/apkparser/cli/build.gradle) は
runtime classpath と main class を持つため、launcher 1 File の fingerprint だけを承認証拠にしない。
実署名 APK、実 Android SDK install、実配布先でこの成功経路を通すまでは `Not run` とする。

GitHub Release は次を同じ Tag へ添付する。

- 署名済み APK である。
- `<apk-file-name>.sha256` である。
- Source Tag と完全な Commit SHA である。
- Signer Certificate SHA-256 Fingerprint である。
- `<apk-file-name>.release.json` である。
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

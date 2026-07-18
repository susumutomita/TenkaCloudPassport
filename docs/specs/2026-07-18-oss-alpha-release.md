# OSS Alpha Release 仕様書

## 概要

外部 Contributor と Local Champion が、TenkaCloud Passport の実装済み範囲、制約、未検証項目を
誇張なく理解し、同じ Git ref から Source Release を再現できる公開境界を定める。

正本 Issue は
[Issue 29](https://github.com/susumutomita/TenkaCloudPassport/issues/29) とする。

## ユーザーストーリー

- 外部 Contributor として、Web / Expo Go / Native Build の能力差を混同せずに環境を構築したい。
- Local Champion として、実機で検証済みの組合せと `Not run` の組合せを区別して Pilot を判断したい。
- Release Operator として、同じ Commit から同じ Source Archive、SBOM、License Notice、checksum を作りたい。
- Security Reviewer として、Model Weight、Token、Certificate、Provisioning、Participant Data が
  Release に含まれないことを機械検査したい。

## 受け入れ基準

- [ ] README 冒頭が「デジタル名刺ではなく Pet が会話の糸を見つける」製品境界を説明する。
- [ ] Bun、Web、Expo Go、Native Development Build の Quickstart を別々に示す。
- [ ] Domain、Agent Runtime、Rules / Local LLM、Storage、QR、Nearby Transport の依存方向を図示する。
- [ ] Product、Privacy、Security、Protocol、ADR、Facilitator Kit の正本を README から辿れる。
- [ ] 機能を `Implemented`、`Experimental`、`Planned` に分類し、検証環境と日付を記録する。
- [ ] Release Candidate は Git ref、Version、Archive、SPDX SBOM、License Notice、SHA-256 manifest を固定する。
- [ ] 同じ Git ref と依存 Lock から 2 回作った Release Candidate の byte が一致する。
- [ ] Release Tree に Model Weight、秘密鍵、Certificate、Provisioning Profile、Participant Data、生成済み
  Native Project、Build Output を含めない。
- [ ] Security、Privacy、Accessibility、Offline E2E、バックアップ Round-trip、Full Delete を Release Checklist で
  `Verified` / `Not run` / `Blocked` のいずれかに分類し、未実施を完了扱いしない。
- [ ] Contributor Guide、Issue Template、PR Template、Product Boundary を壊さない Good First Issue 候補を
  3 件以上用意する。
- [ ] Version、Changelog、Known Limitations、Rollback、Apple 無料検証範囲と Public iOS 配布制約を明記する。
- [ ] `make before-commit` と Release Candidate の再現性 Test が Green である。

## 非機能要件

- パフォーマンス: Release Candidate 作成は Source Tree を Memory へ全読込せず、Archive と checksum を
  Stream / File 単位で処理する。
- セキュリティ: 外部入力の Version / Git ref / Output Path を検証し、Shell interpolation を使わない。
- アクセシビリティ: 文書表は状態を色だけで示さず、英単語の状態 Label と根拠 Link を持つ。
- 再現性: 実行時刻を成果物へ混入させず、Git Commit タイムスタンプと Lockfile を正本にする。

## 技術設計

- データモデル: SPDX 2.3 JSON、Release Manifest、SHA-256 record、Feature / Device Matrix を使う。
- API Endpoint: Backend と外部 API は追加しない。Release Candidate は Repository 内 CLI が生成する。
- UI Component: App UI は変更しない。README と Release 文書だけを Contributor-facing UI とする。

## スコープ外

- App Store / TestFlight、公開 Android APK、Model Weight、Hosted Web deployment。
- 実機 iOS / Android、Nearby Transport、VoiceOver / TalkBack、外部 Pilot の実施済み宣言。
- Issue 17〜22 の Draft 実装を `main` の実装済み機能として先取りすること。
- GitHub Release の即時公開。すべての物理 Gate が揃うまでは Draft Candidate に限定する。

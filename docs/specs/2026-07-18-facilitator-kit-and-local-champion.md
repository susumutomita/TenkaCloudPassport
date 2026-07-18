# Facilitator Kit と Local Champion 運用仕様書

## 概要

Core Team が現地へ移動しなくても、初めての Local Champion が Product と Privacy の契約を変えずに
対面 Lounge を開催できる JA / EN の運用 Kit を Repository で提供する。

正本となる要求を
[Issue 27](https://github.com/susumutomita/TenkaCloudPassport/issues/27) に固定する。

## ユーザーストーリー

- 初めて Local Champion を担う Community Member として、短い Orientation と手元の Checklist だけで、
  参加者の判断を代行せずに 2〜6 名の Lounge を進行したい。
- 参加者として、Research への参加、Passport の共有、途中退出を自分で決め、断っても不利益を受けたくない。
- Core Team Member として、中央の人物台帳や現地渡航を前提にせず、公開された Kit の改訂履歴から運用を
  改善したい。

## 受け入れ基準

- [ ] JA / EN の Facilitator Guide と 1 Page Checklist がある。
- [ ] 60 秒の紹介、5 分 Setup、20 分セッション Script、30 / 60 / 90 分 Event Format がある。
- [ ] Internet 無し、Camera 拒否、参加者不足、満員、Host Loss、Model 無しの Recovery がある。
- [ ] 共有内容、20 分以内に消える範囲、バックアップへ入らない範囲を説明する Script がある。
- [ ] QR 掲示物があり、現在の Host が表示する短命 QR だけを使う。
- [ ] `no-signal`、Research 不参加、途中退出を失敗または低評価として扱わない。
- [ ] OSS、Cloud、CTF、教育 Community の公開情報だけを使う Champion 発見軸がある。
- [ ] 個人を採点、順位付けせず、関心、開催可能性、地域接続、継続意思を会話で確認する。
- [ ] 同期 Orientation は 30 分以内、Dry Run 前の説明は 10 分以内である。
- [ ] Champion は理由を言わずに辞退でき、招待のために保持された情報の削除を依頼できる。
- [ ] Kit は Repository 内の版管理文書で、外部 Contributor が Pull Request で改訂できる。
- [ ] 未経験者 1 名が Dry Run を完了し、迷い、判断不能、Privacy 説明漏れを記録して Kit を改訂する。

最後の条件は実在する第三者の物理 Gate であり、Repository Test で代替しない。証跡取得前の状態は
`Not run` と記録する。

## 非機能要件

- Privacy: 氏名、連絡先、端末 ID、Lounge ID、場所、正確な時刻、Passport、Bridge、会話内容を
  Kit の記録へ書かない。
- Security: QR は保存画像や事前印刷を再利用せず、現在の Host がアプリで表示する短命 Invite だけを使う。
- Accessibility: 読み上げ可能な文章を正本にし、QR だけで手順を伝えず、退出と観察参加の選択を口頭でも示す。
- Localization: JA を意味の正本とし、EN は同じ契約を狭めたり広げたりしない。
- Auditability: Kit の改訂は Git の差分と Pull Request Review で追跡するが、参加者や Champion の台帳を作らない。

## 技術設計

- データモデル: 新しい参加者、Champion、Event の永続 Schema は追加しない。
- API Endpoint: 追加しない。
- UI Component: 追加しない。QR 掲示物は現在の Host 画面を示す印刷可能な文書とする。
- 運用文書: Guide、Checklist、QR 掲示物、Champion Lifecycle、Dry Run Record を `docs/facilitator/` に置く。
- 検証: 実 file I/O Test で JA / EN の組、必須 Recovery、Privacy 境界、文書間導線を検査する。

詳細は [運用設計](../design/facilitator-kit-and-local-champion.md) を参照する。

## スコープ外

- 雇用、報酬、認定資格である。
- Core Team の渡航である。
- 中央 Ambassador Database、CRM、人物 Score、Leaderboard である。
- 有料広告と企業名を前提にした運用である。
- Nearby Transport、配布 Channel、Native Build の実装または実機証跡である。
- Meetup や Local Tournament の参加登録、連絡先収集である。

## 依存関係

- [Issue 2: Research / Blueprint](https://github.com/susumutomita/TenkaCloudPassport/issues/2) である。
- [Issue 15: Global UX](https://github.com/susumutomita/TenkaCloudPassport/issues/15) である。
- [Issue 24: Group Lounge](https://github.com/susumutomita/TenkaCloudPassport/issues/24) である。
- [Issue 26: Measurement](https://github.com/susumutomita/TenkaCloudPassport/issues/26) である。

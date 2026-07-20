# ADR-0026: 自己紹介カードピボット Step 1 の Privacy 契約を supersede する

- Status: Accepted
- Date: 2026-07-20
- Deciders: Susumu Tomita

## Context

`docs/specs/2026-07-20-digital-meishi-pivot.md`（Issue 79）が、プロダクトの軸を
「名刺の否定」から「無料で渡せる自己紹介」へ転換すると決めた。LT 登壇後に名刺交換したい
という原点の課題へ戻り、Step 1 は「相手はアプリ不要・標準カメラで vCard QR を読むだけで
連絡先登録できる」導線を実装する。

ADR-0007（Privacy データ契約）は `INVARIANT_PRIVACY_NO_IDENTIFIER_IN_EXCHANGE` として
「QR、Public Passport、Pet Message に安定 ID、端末 ID、広告 ID、位置情報、連絡先、URL、
自由記述を含めない」ことを固定した。`docs/privacy/data-inventory.md` も同様に、Local
Private Profile・Public Passport・QR・Pet Message・バックアップへの氏名・メール・電話・
連絡先・SNS URL・自由記述の混入を明示的に禁止している。自己紹介カードは氏名・連絡先・
SNS リンク・自己紹介文（自由記述）を端末内に保持し、vCard として QR に**直接**載せる
機能であり、この禁止と正面から衝突する。

## Decision

自己紹介カード（Intro Card）を、ADR-0007 のデータ最小化契約から明示的に除外する新しい
データ種別として定義する。既存の Lounge / Public Passport / Pet Message の匿名性契約
（`INVARIANT_PRIVACY_NO_IDENTIFIER_IN_EXCHANGE` を含む全 Privacy invariant）は Intro Card
以外の全データ経路について**変更しない**。

- Intro Card（`src/domain/intro-card.ts`）は氏名（必須）・肩書き・所属・自己紹介・
  リンク（最大 5 件）・メールアドレス・電話番号を保持できる。これは Owner が自分自身に
  ついて明示入力し、明示保存し、明示的に QR を提示する場合に限る（Owner が Lounge で
  相手の情報を受け取ったり、相手のために代理入力したりする経路は持たない）。
- 保存は端末内のみ（`src/app/intro-card-storage.ts`、`local-profile-storage.ts` と同じ
  4 ファイル構成の Storage Port）。サーバー送信・Analytics・外部推論 API への送信は
  行わない（ADR-0007 の当該契約を維持）。
- 共有は Owner が QR を画面に提示する 1 方向の操作だけである。相手はアプリなしで標準
  カメラから vCard を読み取り、連絡先追加を選ぶかどうかを相手自身が判断する。アプリ側は
  相手の情報を受信・保存・パースしない。相互交換は Step 1 のスコープ外であり、詳細は
  `docs/specs/2026-07-20-digital-meishi-pivot.md` の「スコープ外」節を参照する。
- QR は `TCPQ1:` envelope（`src/protocol/qr-payload.ts`）を使わない生の vCard 3.0
  文字列である。Lounge Invite / Public Passport の QR family（`TCPQ` prefix）とは
  独立した protocol module（`src/protocol/vcard.ts`）に閉じ、既存の `QR_FAMILY_PREFIX`
  チェックによる QR 判別ロジックにも影響を与えない。
- vCard は `QR_ENCODER_MAX_BYTES`（1,024 byte、`src/qr/encoder.ts`）以内に収める。
  超過は保存前に型付き `IntroCardError`（code: `CARD_TOO_LARGE`）で拒否し、項目別 byte
  内訳（値そのものは含めない）を message に含める。
- JSON バックアップ（`docs/privacy/data-inventory.md` の `L4`）への Intro Card 統合は本 Issue
  に含めない（follow-up）。既存の手動 JSON バックアップは Local Private Profile・端末
  設定・モデル検証記録の allowlist のまま変更しない。

## Consequences

- Good:「名刺交換」という原点の課題に対して、サーバーもアカウントも不要な最短導線を
  実装できる。既存の Lounge 系匿名性契約は一切緩めずに済む。
- Good: `TCPQ1:` envelope を使わないため、既存の QR 判別・Lounge Invite・Public
  Passport の protocol / schema コードへの変更が不要である。
- Bad: 自己紹介カードの氏名・連絡先は、これまで「個人情報を扱わない」と説明してきた
  範囲の明示的な例外になる。UI とドキュメントで「これは Owner が自分の意思で渡す情報で
  あり、相手の情報は受け取らない」ことを明確に伝える必要がある。
- Bad: JSON バックアップに Intro Card を含めないため、端末を失うと自己紹介カードは復元
  できない（Local Private Profile と異なる扱い）。Owner にはアプリ内で伝わるが、
  follow-up Issue で解消するまでの既知の制約とする。
- Tradeoff:「相手の名刺も受け取る」相互交換は Step 2 以降（ロードマップ）で扱う。
  Step 1 で受信経路を作らないことで、パースが必要な外部入力を増やさず攻撃面を広げない。

## References

- 関連コード: `src/domain/intro-card.ts`、`src/protocol/vcard.ts`、
  `src/app/intro-card-storage.ts`、`src/screens/IntroCardScreen.tsx`、
  `src/screens/IntroCardEditScreen.tsx`。
- 関連 Issue: Issue 79（自己紹介カードピボット Step 1）。
- 正本仕様: `docs/specs/2026-07-20-digital-meishi-pivot.md`。
- Supersede する ADR: [ADR-0007](./0007-privacy-data-contract.md)（Intro Card の範囲に
  限り `INVARIANT_PRIVACY_NO_IDENTIFIER_IN_EXCHANGE` を supersede する。Lounge /
  Public Passport / Pet Message への適用は維持する）。
- 関連ドキュメント: [Privacy データ台帳](../privacy/data-inventory.md)。

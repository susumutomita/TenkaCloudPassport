# ADR-0027: QR の中身を vCard 直埋めから自己紹介ページ URL へ変更する

- Status: Accepted
- Date: 2026-07-21
- Deciders: Susumu Tomita

## Context

Issue 79（ADR-0026）で実装した自己紹介カードは、QR に vCard 3.0 を直埋めし、相手は
標準カメラで読み取ると即座に連絡先追加が提案される設計にした。owner の実機フィード
バックは「読んだら即・連絡先追加は受け手に迷惑」というものだった。相手はまず自己紹介
を読みたいのであって、初対面で連絡先アプリに人物データを追加するかどうかの判断を
一瞬で迫られたくない。Issue 84（Pivot Step 1.1）は、この体験を「まず読む・連絡先追加
は任意」へ変更することを詳細設計として指示した。

## Decision

QR の中身を、vCard 3.0 の直埋めから、フラグメント（`#` 以降）に自己紹介カードを
base64url + JSON で埋め込んだ静的ビューア URL へ変更する。

- `src/protocol/intro-card-url.ts`（新規）が `encodeIntroCardUrl` /
  `decodeIntroCardUrlFragment` / `introCardUrlByteLength` を提供する。payload は
  `{ v: 1, n, t?, o?, s?, l?, e?, p? }`（短縮 key）。base64url は依存追加せず
  純 TypeScript の bit accumulator で実装する（`src/qr/encoder.ts` の依存ゼロ方針に
  合わせる）。URL 全体の UTF-8 byte 数を `QR_ENCODER_MAX_BYTES`（1,024 byte）以内に
  収め、超過は `IntroCardError('CARD_TOO_LARGE')` を項目別内訳付きで投げる（`vcard.ts` の
  `cardTooLargeError` と同じ流儀）。
- `site/c/index.html`（新規・完全静的）が `location.hash` をブラウザ内 JS だけで
  デコードして表示する。フラグメントはサーバーへ送信されないため、データを預から
  ない原則を維持する。表示は `textContent` のみ（`innerHTML` 不使用）、リンクは
  `https?://` のみ許可し `rel="noopener noreferrer"` を付与する。JSON 不正・version
  不一致は fail-closed のエラーメッセージにする。「連絡先に追加」ボタンは相手が
  明示的に押した場合だけ vCard 3.0 を組み立てて `.vcf` をダウンロードさせる（連絡先
  への追加は受け手の選択に委ねる）。
- `IntroCardScreen` の QR 生成元を `encodeVCard` から `encodeIntroCardUrl` へ切り替える。
  保存時検証（`PassportApp.tsx` の `saveIntroCard`）と編集画面の byte 使用量表示も、
  実際に QR 化する対象（URL）に合わせて `encodeIntroCardUrl` / `introCardUrlByteLength`
  へ揃える。vCard 基準のまま残すと、表示画面の `useMemo` が未検証の byte 超過で
  例外を投げる可能性があるための必須対応である。
- `src/protocol/vcard.ts` は削除しない。将来「オフライン会場向けに vCard 直埋めへ
  切り替える」トグルを実装する際の資産として残す（follow-up、`.claude/state/`
  参照）。メインフローから参照されなくなるため、`knip` の dead-code 報告は許容し、
  本 ADR にその理由を記す。

## Consequences

- Good: 相手の第一体験が「自己紹介を読む」になり、連絡先追加はページ内のボタンを
  押すという明示的な選択になる。owner の実機フィードバックに直接対応する。
- Good: フラグメントは仕様上サーバーへ送信されないため、ADR-0026 が確立したデータを
  預からない原則を、QR の実現方式を変えても維持できる。
- Good: `vcard.ts` を削除しないため、将来の切替式（オフライン会場向け）実装コストを
  抑えられる。
- Bad: base64url + JSON はプレーンテキストの vCard より約 3 割ほど byte 効率が悪い（JSON
  の quote/key と base64 の 4/3 展開のオーバーヘッド）。同じ項目量でも
  vCard 版より実質使える文字数がわずかに減る。ADR-0026 時点で全項目最大長のカードは
  既に vCard でも 1,024 byte を超えていたため新規の破綻ではないが、境界付近の
  カードでは新たに `CARD_TOO_LARGE` に触れる可能性がある。
- Bad: 相手が QR を読む瞬間にオンラインである必要がある（vCard 直埋めはオフラインで
  完結した）。オフラインが前提の会場では体験が劣化する。
- Tradeoff: この Bad をどちらも受け入れず両立させる「vCard 直埋めとの切替式」は
  Issue 84 のスコープ外とし、follow-up として記録した。
- Tradeoff: `https://susumutomita.github.io/TenkaCloudPassport/c`（末尾スラッシュ
  なし）が GitHub Pages 上で `site/c/index.html` に解決されるかは実機・実環境での
  確認が必要である。既存の `site/en/index.html` は `curl` で確認済みで、
  `/TenkaCloudPassport/en`（末尾スラッシュなし）は `/TenkaCloudPassport/en/` へ
  301 redirect される。fragment（`#` 以降）は仕様上 redirect を跨いでブラウザ側に
  保持されるため、`/c` も同様に redirect されるなら動作自体は壊れない見込みだが、
  本 PR 時点では `/c` は未デプロイのため実機・実環境での確認が必要である。
  解決されない場合の修正（末尾スラッシュ付与）は小さいが、owner の手動確認事項
  とする。

## References

- 関連コード: `src/protocol/intro-card-url.ts`、`src/screens/IntroCardScreen.tsx`、
  `src/app/PassportApp.tsx`、`site/c/index.html`。
- 関連 Issue: Issue 84（Pivot Step 1.1）、Issue 79（ADR-0026、自己紹介カードピボット
  Step 1）。
- Supersede する ADR: [ADR-0026](./0026-intro-card-pivot.md)（QR の実現方式に関する
  記述、「QR は生の vCard 3.0 文字列である」「`vcard.ts` に閉じる」の 2 点のみを
  supersede する。Intro Card を ADR-0007 のデータ最小化契約から除外するという決定
  自体、および Owner の明示操作 1 方向でだけ共有するという契約は変更せず維持する）。
- 関連ドキュメント: [Privacy データ台帳](../privacy/data-inventory.md)。

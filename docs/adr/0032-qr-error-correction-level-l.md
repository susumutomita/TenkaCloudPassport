# ADR-0032: 自己紹介カード QR の誤り訂正レベルを M から L へ切り替える

- **Status**: Accepted
- **Date**: 2026-07-22
- **Deciders**: Susumu Tomita (@susumutomita)

## Context

owner が自己紹介カードの会社 URL を 2 つ入れると「QR に収まらない」サイズオーバーになる
と報告した（[Issue 121](https://github.com/susumutomita/TenkaCloudPassport/issues/121)）。
自己紹介カード QR は `src/protocol/intro-card-url.ts` の `encodeIntroCardUrl` が
`site/c/index.html` 用の URL（base64url + JSON を fragment に埋め込む）を組み立て、
`src/qr/encoder.ts` の `encodeQr` で実際の QR matrix にする構成であり、`QR_ENCODER_MAX_BYTES`
（旧 1,024 byte）を超えると `CARD_TOO_LARGE` を throw する。日本語は UTF-8 で 1 文字 3 byte、
base64url 化で概ね ×4/3 に膨らむため、氏名・肩書・会社・日本語の自己紹介・複数の URL・
メールを全部日本語で埋めると 1,024 byte にすぐ到達する。

QR の誤り訂正レベルは L/M/Q/H の 4 段階（訂正能力 約 7% / 15% / 25% / 30%）があり、同じ
QR Version（モジュール数）でもレベルが低いほどデータ容量が増える。本実装
（`src/qr/encoder.ts`）はこれまで誤り訂正 M 固定で、QR Version 1〜26（本実装が対応する
上限で ISO/IEC 18004 の最大 40 のうち 26 まで）の Reed-Solomon ブロック構成表
（`RS_BLOCKS_M`）と、それに対応する format information（誤り訂正レベル指標＋mask を
BCH(15,5) で符号化した 15 bit）を持っていた。

## Decision

1. **`src/qr/encoder.ts` を誤り訂正 M から L へ丸ごと切り替える。** 引数化（呼び出し側で
   M/L を選べるようにする）は採らない。
   `grep -rn "from '../qr/encoder'|from './encoder'|qr/encoder" src` で洗い出した消費者は
   自己紹介カード（`intro-card-url.ts` / `vcard.ts` / 各 Screen）と Lounge Invite
   （`qr-payload.ts` 経由、実際に `encodeQr` を呼ぶのは Screen 層）だけであり、EC-M の
   訂正能力そのものに依存する利用（例: 意図的に低い訂正能力を要求するテスト）は無かった。
   誤り訂正 L は M より必ず同じ Version で容量が大きい（＝同じ payload はより小さい
   Version で収まる方向にしか動かない）ため、Lounge Invite 側の密度が悪化することもない。
   これにより「エンコーダを EC-L へ丸ごと切り替える」が最小サーフェスの変更になる。
2. **`RS_BLOCKS_L` を新設し、ISO/IEC 18004 Level L の Reed-Solomon ブロック構成
   （正準値）を Version 1〜26（旧 `RS_BLOCKS_M` と同じ Version 数）ぶん転記する。**
   転記値は独立した 2 系統で突合済み。(a) Version ごとの data byte 容量
   （`count * dataCodewords` の合計）が、QR 規格でよく参照される Byte mode 容量表
   （Version 1 の L=17 byte 〜 Version 26 の L=1,367 byte）と一致すること。(b) 本
   プロジェクトの devDependency ではない第三者 QR エンコーダ実装（`toqr`、EC level enum
   値が ISO の format info indicator と同じ 0=M/1=L/2=H/3=Q）を一時スクリプトで実行し、
   Version 1〜26 の全数で「収まる最大 byte 数」の境界値と、実際に生成される matrix が
   本実装の出力と bit 単位で一致することを確認した（"HELLO WORLD" Version 1 の EC-M
   出力が旧テストの既知 matrix と一致することも同スクリプトで確認し、比較手法自体の
   妥当性を検証している）。
3. **format information の生成を修正する。** 誤り訂正レベル指標（2 bit、ISO/IEC 18004
   では L=01・M=00・Q=11・H=10 の固定値）を mask（3 bit）の上位に組み込まずに
   `bchTypeInfo(mask)` を呼んでいたのが既存実装のバグだった。M の指標が `00`（10 進で
   0）のため mask 単体を渡しても偶然結果が一致していたが、L の指標は `01`（10 進で 1）
   のため、`ERROR_CORRECTION_LEVEL_INDICATOR_L = 0b01` を新設し
   `bchTypeInfo((ERROR_CORRECTION_LEVEL_INDICATOR_L << 3) | mask)` に修正した。
4. **`QR_ENCODER_MAX_BYTES` を 1,024 → 1,367 byte へ更新する。** 導出（密度＝最密 QR の
   Version を変えないための手順）:
   1. 旧構成（誤り訂正 M）で 1,024 byte の payload が選んでいた QR Version は 26
      （`encoder.test.ts` の既存アサートで固定されていた最密 Version）。
   2. Version 26・誤り訂正 L のデータ容量は `RS_BLOCKS_L[25]` から
      data codewords 合計 = 10 × 114 + 2 × 115 = 1,370 byte、capacity bit =
      1,370 × 8 = 10,960 bit。Byte mode のオーバーヘッド（mode 指示子 4 bit ＋
      文字数指示子 16 bit）を引くと `floor((10,960 - 4 - 16) / 8) = floor(1,367.5) = 1,367` byte。
   3. 1,367 byte は Version 25・L の容量（1,273 byte）を超えるため Version 26 を選び
      続け、1,368 byte からは（本実装が対応しない）Version 27 が必要になる。つまり
      1,367 byte が「Version 26 のまま収まる最大値」＝新しい上限として厳密に一致する。
   1,024 → 1,367 で約 33.5%（およそ 30%）の容量増となり、密度（最密 QR の Version 26 =
   121 module）は変わらない。
5. **deflate 等の圧縮は採らず follow-up に残す。** 圧縮すればさらに余裕を稼げるが、
   `site/c/index.html`（外部リクエストゼロの静的ビューア）に inflate 実装を持ち込む
   必要があり、今回の「owner が会社 URL を 2 つ入れた程度」の超過には過剰な変更になる。
   将来オントロジー等でさらに大きい payload を扱う必要が出た時の選択肢として
   `/follow-up add` で記録する。

## Consequences

- **Good**: 自己紹介カード QR の実用容量が約 33.5% 増え、Issue 121 の再現ケース
  （日本語 280 文字自己紹介＋肩書・会社名＋会社 URL 2 本＋メール、1,351 byte）が
  throw しなくなる。密度（QR Version 26 = 121 module）は変わらないため、読み取り
  やすさは劣化しない。
- **Bad**: 誤り訂正能力が M（約 15%）から L（約 7%）へ下がる。画面表示の QR を
  近距離のカメラで読む用途では実用上十分だが、印刷して汚損・破損リスクがある用途
  には向かない（今回のユースケースはスマートフォン画面表示が前提）。
- **Tradeoff**: 引数化して自己紹介カードだけ L にする案は採らなかった。理由は
  Decision #1 のとおり、他に EC-M の訂正能力へ依存する消費者がいないため、複雑さを
  増やすだけで得るものがないと判断したため。将来 Lounge Invite 等で高い訂正能力が
  必要になった場合は、この判断を再検討するトリガーになる。

### 開発時に発見した既知の制限事項（npm `jsqr` の Version 23 decode バグ）

round-trip 網羅テスト（Version 1〜26 を jsQR で decode）の実装中に、npm `jsqr`
（本 repo は devDependency ^1.4.0）が **Version 23 に限り decode に失敗する**既知の
バグを発見した。原因は `jsqr` が bundle する Version テーブル
（`node_modules/jsqr/dist/jsQR.js` の `versionNumber: 23` エントリ）の
`alignmentPatternCenters` が `[6, 30, 54, 74, 102]` になっている点で、ISO/IEC 18004 の
正しい値は `[6, 30, 54, 78, 102]`（4 番目の座標が 78。本実装の
`ALIGNMENT_PATTERN_POSITIONS[22]` および第三者実装 `toqr` の出力と一致）。この転記
ミスは alignment pattern の探索ではなく function pattern mask を誤らせ、codeword の
zigzag 抽出位置をずらす。誤り訂正 M / Q / H では訂正余地が大きく Reed-Solomon がこの
破損を吸収して decode に成功する（一時スクリプトで確認済み）が、最も訂正余地が薄い
L だけが訂正しきれず decode が null になる。本実装が生成する Version 23・EC-L の
matrix 自体は `toqr` の出力と bit 単位で一致することを確認しており、これは本実装では
なく `jsqr` 側の欠陥である。`node_modules/jsqr/dist/jsQR.js` の当該座標を手元で
`74` → `78` に書き換えると decode が成功し入力と一致することも確認済み。

`encoder.test.ts` の round-trip 網羅テストは Version 23 だけこの decode 失敗を
`expect(decoded).toBeNull()` として明示的に固定し、`jsqr` が将来修正されたときに
このテストが失敗して気づけるようにしてある。upstream への報告 / 修正版への追従は
`/follow-up add` で別途管理する。

## References

- 関連コード: `src/qr/encoder.ts`（`RS_BLOCKS_L` / `QR_ENCODER_MAX_BYTES` /
  `ERROR_CORRECTION_LEVEL_INDICATOR_L`）、`src/qr/encoder.test.ts`
- 関連 Issue: [Issue 121](https://github.com/susumutomita/TenkaCloudPassport/issues/121)
- 関連 ADR: [ADR-0027](./0027-intro-card-url-viewer.md)（QR 自己紹介ページ方式への
  Pivot、`vcard.ts` は削除せず残す方針の根拠）
- 外部資料: ISO/IEC 18004（QR Code の符号化仕様）、npm `jsqr` 1.4.x
  （`node_modules/jsqr/dist/jsQR.js` の Version テーブル）

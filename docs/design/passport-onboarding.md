# Passport 初回設定の設計

本書は Issue 7 のアカウント不要の初回設定、端末内保存、Lounge 参加直前の公開確認を定める。
用語は [用語集](../product/glossary.md)、保存と共有の境界は
[Privacy データ台帳](../privacy/data-inventory.md)、Schema の上限は
[Data Model](../architecture/data-model.md) を正本とする。

## 目的と対象範囲

Owner は氏名、メール、電話、住所、位置情報、会社、OAuth、本人確認、連絡先同期を要求されず、
Pet Name、Pet Emoji、任意の Owner Alias、版管理済みの手掛かり、Languages を入力して初回設定を
完了できる。Pet Name と Topics、Offer、Looking For、Goal のいずれか 1 件が有効な Local Private
Profile の最小条件です。詳細な Avatar Editor は設けない。

Pet Name と Owner Alias は表示用の短い文字列であり、氏名や連絡先を入れないよう各入力の直前に
案内する。会話の材料と Languages は自由記述にせず、アプリに同梱する版管理済みカタログから選ぶ。

## データと責務

`src/domain/passport.ts` は Pet Name、Pet Emoji、Owner Alias、手掛かり、Languages の検証と
Public Passport への allowlist Projection を担当する。`src/domain/clue-catalog.ts` は各手掛かりを
Topics、Offer、Looking For、Goal の表示分類へ対応させる。Domain は React Native、Storage、
Transport、LLM を import しない。

`src/app/` の Storage Port は Local Private Profile の読み書きだけを公開する。Web adapter は
`localStorage`、Native adapter は既存の `expo-file-system` を使う。adapter は Port と保存媒体を
注入でき、利用不可、読込失敗、不正保存データ、書込失敗を型付きエラーとして返す。UI は失敗を
握りつぶさず、状態ごとに固有の案内を表示する。

Draft は React state だけに置き、自動保存しない。Owner が「端末内に保存」を実行し、Domain
validation と Storage 書込の両方が成功した Local Private Profile だけを再起動後に復元する。
Public Passport、共有 Preview、QR Projection、Peer Payload、Lounge データは永続保存しない。

## 上限と有効条件

| 項目 | 上限と条件 |
| --- | --- |
| Pet Name | trim 後 1 文字以上 24 UTF-16 code unit 以下である。 |
| Pet Emoji | 同梱した 6 種類から 1 件である。 |
| Owner Alias | 空を許可し、trim 後 24 UTF-16 code unit 以下である。 |
| Topics | Local で 3 件以下である。 |
| Offer | Local で 3 件以下である。 |
| Looking For | Local で 3 件以下である。 |
| Goal | Local で 1 件以下である。 |
| Local の手掛かり合計 | 1 件以上 10 件以下である。 |
| Public の手掛かり合計 | 1 件以上 3 件以下である。 |
| Languages | 版管理済みカタログから 3 件以下である。 |

Public Passport は Pet Name と 1 件以上の手掛かりを必須にする。Pet Emoji、Owner Alias、各手掛かり、
各 Language は共有 Preview で項目単位に ON / OFF できる。Pet Name も操作対象にするが、OFF の間は
有効条件を満たさないため Lounge 参加を無効にし、Validation Error を表示する。

## 体験の流れ

1. 起動時に Storage から明示保存済みの Local Private Profile だけを読み込む。
2. 保存済み Profile がなければ、空状態を示して Pet Name、Emoji、任意 Alias、手掛かり、Languages を
   入力できる初回設定を表示する。
3. Owner が明示保存すると Domain validation 後に端末内へ書き、成功後だけ Lounge 準備へ進む。
4. 単一端末 Encounter では、実在する相手が公開した Pet Name と手掛かりを入力して確認する。
5. Lounge 参加直前に、今回の Public Passport 候補を全項目の ON / OFF とともに表示する。
6. Owner の最終操作で同じ選択から Public Passport を再投影し、QR Projection と Peer Payload に渡して
   Lounge を開始する。Preview の Projection 自体は保存せず、Lounge の保持期限を延長しない。
7. Lounge 終了後も Local Private Profile は残し、Lounge 由来データだけを破棄する。

## Preview と Payload の一致

app 層の単一 builder が Domain Projection を呼び、表示用 Preview、QR に入る Public Passport、
`public-passport` Peer Payload を同じ検証済み object から作る。Snapshot Test は三者の完全一致と、
Local 専用 field や OFF 項目が含まれないことを固定する。UI は別の serializer を持たない。

## Accessibility と UI 状態

Pet Name と Owner Alias の `TextInput` は `accessibilityLabel` と hint を付け、Native の編集可能な
入力 role を維持する。`accessibilityRole="text"` は Android で静的な `TextView` として扱われるため
指定しない。Emoji、手掛かり、Languages、共有 ON / OFF、保存、画面遷移の全操作へ明示的な
`accessibilityLabel`、`accessibilityRole`、状態を付ける。VoiceOver と TalkBack の操作順は画面上の
説明、入力、選択、Validation、主操作、補助操作の順とし、JSX の source order を一致させる。

空状態、Validation Error、保存失敗、Storage 利用不可、読込失敗、保存成功を同じ文言や色だけで
区別せず、固有の見出しと `alert` または `summary` role で表示する。文字数と件数の上限、機密情報を
入力しない案内は対象入力の近くへ表示する。

## 代替案

### Draft を入力ごとに自動保存する案

再起動時の入力損失は減るが、Owner の明示操作なしに Pet Name や Alias を永続化し、「明示保存した
Profile だけを復元する」契約に反するため採用しない。

### Local Private Profile を Domain 内で保存する案

作成と保存を 1 関数にまとめられるが、純粋 Domain が Web と Native の Storage に依存し、テストと
依存方向を壊すため採用しない。app 層の Port と adapter を選ぶ。

### すべてを自由記述にする案

短時間で具体的な材料を入力しやすいが、連絡先や位置情報などの機密情報が Public Passport へ混ざる
危険が高く、既存の Privacy 契約にも反する。Pet Name と任意 Alias だけを短い表示文字列として許可し、
会話の材料と Languages はカタログ選択に限定する。

### Local Profile 全体をそのまま共有する案

実装量は少ないが、今回 OFF にした項目と将来の Local 専用 field が漏れる。明示的な allowlist
Projection を維持し、Preview、QR、Peer Payload を同じ Projection から作る案を選ぶ。

## エッジケース

- Pet Name が空白だけ、25 文字以上、未許可 Emoji の場合は保存しない。
- Owner Alias が空なら field 自体を省略し、本名を要求しない。
- 手掛かりが 0 件、分類別上限超過、合計 11 件以上、重複、カタログ外なら保存しない。
- Public の手掛かりが 0 件、4 件以上、Local にない項目、今回 OFF の項目なら投影しない。
- Language の重複、カタログ外、4 件以上、Local にない項目なら拒否する。
- Storage が存在しない場合と、存在する Storage の読込または書込が失敗した場合を区別する。
- 保存データが不正 Schema、過大 JSON、未知 field の場合は復元せず、不正データとして表示する。
- 保存操作が失敗した場合はメモリ上の Draft を維持し、保存済みとして Lounge 準備へ進めない。
- 読込完了前の古い Promise が後から返っても、unmount 後の UI を更新しない。
- Preview で必須の Pet Name または全手掛かりを OFF にした場合は、固有の Validation Error を表示する。
- Preview を開いたままでも Public Passport を永続化せず、参加操作時に再投影する。
- 再起動では Draft、Preview、Public Passport、Lounge を復元せず、明示保存済み Local Profile だけを
  復元する。
- Storage adapter の実テストは file-backed な `localStorage` 相当と実ファイル I/O を使い、Mock や
  Stub を使わない。

## 人間検証

初見利用者 5 名中 4 名以上が 90 秒以内に設定を完了できるかは人間検証待ちです。機械テストは
有効条件、上限、保存境界、復元、Preview と Payload の一致、失敗 UI、Accessibility 属性を対象にする。

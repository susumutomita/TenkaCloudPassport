# Facilitator Kit Design Review

## Scope

- Issue: <https://github.com/susumutomita/TenkaCloudPassport/issues/27>。
- Role: Product Designer。
- Method: 30 分形式を入口から退出まで JA / EN で机上 Simulation し、Guide、Checklist、Poster、
  Dry Run Record の状態遷移を比較した。
- Final verdict: `ALLOW`。
- Physical device、print、assistive technology: `Not run`。

## Findings and integration

| Finding | Final state | Integrated contract |
| --- | --- | --- |
| Guide と Checklist の対応 Step が不明確である。 | Resolved | `P0`〜`P10` と `R1`〜`R10` を共有する。 |
| Product Consent と Research Consent が 1 つの質問になる。 | Resolved | Product Preview と別の Research Script へ分離する。 |
| 5 分 Setup が 20 分枠で重複する。 | Resolved | Setup は Invite 前の 1 回だけで、最初の Invite から 20 分を数える。 |
| QR Error と状態 Label が不足する。 | Resolved | 4 QR Recovery と 3 つの文字 Label を追加する。 |
| English の開催前 Gate が日本語 Matrix に依存する。 | Resolved | English Support Matrix と対訳 Dry Run 判断を追加する。 |
| All-Ready Gate が個人操作だけに見える。 | Resolved | 2 名以上かつ接続中全員が Ready になるまで `P7` を開始しない。 |
| 1 回限り Invite を複数人が Scan できるように読める。 | Resolved | Guest 1 名ごとに fresh Invite を表示し、成功後に Secret を Rotate する。 |

## Remaining evidence gates

- A4 / Letter での 1 Page 出力、折返し、内容欠落、読上げ順、200％ Zoom は `Not run` である。
- 実 Camera、Nearby Transport、2〜6 台、Host Loss の破棄表示は `Not run` である。
- 未経験者による 10 分以内の説明後 Dry Run は `Not run` である。

これらは文書 Review や Repository Test で代替せず、Support Matrix が `Verified` になるまで Field Ready としない。

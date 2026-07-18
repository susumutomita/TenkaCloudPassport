# Facilitator 1 Page Checklist（日本語）

- Kit Version: 1.0。
- Physical Dry Run: `Not run`。
- 詳細: [Facilitator Guide](./guide.ja.md) である。

## Field Spine

- [ ] `P0` Build / OS / Transport を [Support Matrix](./README.md#kit-version-10-support-matrix) で確認した。
  `Not run` の能力へ依存していない。
- [ ] `P1` Kit、端末、[QR 掲示物](./qr-poster.ja.md)、退出経路が準備済みである。
- [ ] `P2` Host を含む合計 2〜6 名が自分の端末を持ち、Group の Locale を確認した。1 名だけの場合は
  Walkthrough とし、7 名以上は別 Host / Lounge に分けた。
- [ ] `P3` 60 秒の Product 紹介を読み、`no-signal` と退出は失敗でないと伝えた。
- [ ] `P4` Research は別 Consent で判断した。不参加または未回答なら Counter OFF のままである。
- [ ] `P5` Product Privacy Script を読み、Owner が自分で Preview、共有、Camera を選んだ。
- [ ] `P6` Host 以外の Participant へ 1 名ずつ fresh Invite を表示し、成功後は旧 QR を取り下げて同じ Lounge の
  Secret を Rotate した。2 名以上が接続し、接続中 Participant 全員が自分で Ready を選ぶまで `P7` を開始していない。
- [ ] `P7` 代理操作、Answer の圧力、Bridge / `no-signal` の評価、内容や連絡先の記録をしていない。
- [ ] `P8` 結果を `NORMAL END` または `STOP THIS LOUNGE` として説明し、個人退出を待たせず完了した。
- [ ] `P9` 全端末で Lounge を終了した。旧 QR、写真、Secret、Checklist の記録を再利用しない。
- [ ] `P10` 連絡先を集めず、希望者へ公開 Meetup / Local Tournament 案内だけを示した。

## Privacy 3 境界

- [ ] 共有は Preview で ON にした Pet Name、任意 Pet Emoji、任意 Alias、Languages、最大 3 手掛かりだけと説明した。
- [ ] Lounge 由来データは、退出、Host 終了、20 分満了など最早の削除契機で消えると説明した。
- [ ] バックアップは Local Private Profile、端末設定、Model 検証記録だけで、Public Passport、QR、Lounge、
  Owner Answer、Pet Message、推論データ、Bridge、`no-signal`、GGUF 本体を含まないと説明した。

## Recovery Index

| ID | 状態 | 安全側の判断 |
| --- | --- | --- |
| `R1` | Internet 無し | Verified Offline Transport だけ続行し、未検証なら `NOT STARTED` である。 |
| `R2` | Camera 拒否 | Product 参加は `NOT STARTED` とし、拒否を失敗にせず、強制、Secret 手入力、代理撮影をしない。 |
| `R3` | 参加者不足 | `NOT STARTED` とし、2 名まで待つか Walkthrough にする。 |
| `R4` | 満員 | 7 人目を加えず、別 Host と新しい QR に分ける。 |
| `R5` | Host Loss | `STOP THIS LOUNGE` とし、全残存端末の破棄完了表示を確認した後だけ新 Lounge を作る。 |
| `R6` | Model 無し | Rules を正常経路にし、Rules も不可なら `NOT STARTED` である。 |
| `R7` | 不正 / 非 Passport QR | URL として開かず、対応 Build の現在 Invite がなければ開始しない。 |
| `R8` | 重複 / 使用済み QR | 旧 Invite / Handshake だけを破棄し、受理済み Membership を保持して Rotate する。 |
| `R9` | 期限切れ QR | `STOP THIS LOUNGE` とし、期限を延長せず新 Lounge だけを使う。 |
| `R10` | 別 Group / 非対応 QR | QR を転送または読み替えず、対象 Host の現在 Invite だけを使う。 |

未知状態または Privacy / Safety Incident は `STOP THIS LOUNGE` とし、新規セッションと Aggregate Export を
停止する。氏名、会場、正確な時刻、Passport、Bridge、会話、Incident 内容を書かない。

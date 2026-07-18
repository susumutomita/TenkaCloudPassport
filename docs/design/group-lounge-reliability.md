# Group Lounge Reliability の設計

本書は、Issue 24 の v1 Group Rule を Nearby Transport、React、Native Module に依存しない
Domain State Machine として定義します。Issue 20・22 の Adapter は実機の Connection Event を
認証済み Peer Protocol へ変換し、受理結果だけを本 Coordinator へ渡します。

## 目的と非目的

- 2〜6 名の Membership を Host-authoritative な revision 付き Snapshot へ収束させる。
- 全接続 Participant の Ready 後に Round を開始し、Late Join を次 Round まで待機させる。
- 1 Participant が Local Agent を完了できなくても 45 秒後に Rules へ fallback する。
- 切断、再接続、退出、Host Loss、Lounge 期限を有限時間で処理する。
- Round ごとの主要 Bridge を 1 Participant につき最大 1 件にする。
- 終了後に Membership、Passport、Bridge、Queue、Transcript を残さない。
- Nearby Library、暗号、Device Discovery、Host Migration、Background 実行は本変更で選定しない。
- 仮想時計 Test を実時間 Soak、実機 Matrix、Network Capture の代替証跡にしない。

## 責務の境界

| 層 | 入力 | 保証 | 保持する State |
| --- | --- | --- | --- |
| Transport Adapter | Socket / Nearby Connection | 標準暗号と接続 Identity | Library 固有の Connection |
| Peer Protocol 1.2 | raw JSON と認証結果 | Schema、認証、去重、順序、Rate / Byte Limit | 最新 Membership / Passport Snapshot |
| Group Coordinator | Host が受理した Domain Event | Membership、Ready、Round、Grace、Deadline | 現在の Participant と現在 Round だけ |
| Fair Bridge | Round の Public Passport | 決定的な 2〜6 名 Bridge、最大 1 件 | なし |

Coordinator は Guest が送った Membership Snapshot を受理しません。Host が Join、Leave、切断期限を
順に適用し、revision を増やした Snapshot を配布します。Guest は Peer Protocol の revision 規則で
新しい Snapshot だけを採用します。

## State と不変条件

| State | 保持する Data | 次の Event | 遷移先 |
| --- | --- | --- | --- |
| `forming` | 現在 Round ID、Participant、Ready、接続状態 | Join、Ready、Leave、Disconnect、Reconnect、tick | `forming` / `evaluating` / `destroyed` |
| `evaluating` | Round 参加者 Snapshot、45 秒 Deadline | 完了、Join、Leave、Disconnect、Reconnect、tick | `evaluating` / `settled` / `destroyed` |
| `settled` | Round ID、参加者別 Bridge または `no-signal` | 次 Round、Join、Leave、Disconnect、Reconnect、tick | `forming` / `settled` / `destroyed` |
| `destroyed` | 非機密な終了理由 | 任意の遅延 Event | `destroyed` |

- Participant ID を Membership Identity とする。同じ Owner Alias は別 Participant として許可する。
- Membership は Participant ID の辞書順で配布し、実際の Join / Leave だけで revision を増やす。
- Connection 世代は Join 時の 0 から再接続ごとに 1 増やす。現在世代と一致する Disconnect だけを
  適用し、古い世代の Event は同じ State を返す。
- 同じ Participant ID と同じ Passport の Duplicate Join は同じ State を返す。異なる Passport で
  Identity を再利用する要求は拒否する。
- Leave または Grace 期限で除外した Participant ID は bounded な Tombstone に入れ、遅延 Join で
  復活させない。再参加は新しい Handshake と Participant ID を必要とする。
- `forming` では 2 名以上の全接続 Participant が同じ Round に Ready の場合だけ `evaluating` へ進む。
- `evaluating` の Participant Snapshot は Late Join を含まない。Round 中に退出した Participant は
  Outcome 対象から除外し、残りが 1 名ならその Participant を `no-signal` へ収束させる。
- 明示完了と Deadline fallback は既存 `selectBridges()` を使う。Input Arrival 順ではなく
  Participant ID と Evidence の Tie-break で結果を確定する。
- `settled` へ最初に遷移した Event を採用する。同じ Event、古い Round、期限後の Local Agent 完了は
  同じ State を返し、Bridge を再表示しない。
- 使用済み Round ID は Lounge 内で保持し、過去の ID を次 Round に再利用しない。退出者を含む
  確定済み Bridge は `no-signal` へ無効化し、残留者の Outcome から退出者を除く。
- `destroyed` は終了理由だけを持つ。終了前の共通 field を Union の外へ出さない。

## 時刻と Resource Limit

- Lounge は既存契約と同じ 20 分で終了する。
- Local Agent の Round Deadline は既存 Pet Interaction と同じ 45 秒とする。
- Disconnect Grace は 5 秒とする。Host と Guest の両方に適用し、一時的な Network Switch を吸収する。
- 壁時計と単調増加時計の早い方を採用し、壁時計の巻き戻しで期限を延長しない。
- 定員は 6 名とする。退出 Tombstone は 64 件で打ち切り、それ以上の Identity churn を拒否する。
- 1 Lounge の Round は 64 回までとする。65 回目は古い Round ID を捨てずに Lounge を終了する。
- Peer の Oversize、Flood、Invalid Auth、Invalid Schema は Coordinator の手前で Peer Protocol が
  当該 Peer だけを拒否する。Lounge 全体の上限超過だけがセッションを閉じる。

## Event の競合規則

| 競合 | 採用する結果 |
| --- | --- |
| Duplicate Join | 同一 Passport なら no-op、異なる Passport なら Identity conflict |
| Join → Leave → 遅延 Join | Tombstone により no-op。新 Participant ID だけを許可 |
| Disconnect → Reconnect | 5 秒未満なら接続状態と Ready を復元 |
| Reconnect → 古い Disconnect | Connection 世代が古いため no-op |
| Disconnect → Grace 期限 → Reconnect | Guest は除外済み、Host は Lounge 終了済みなので復元しない |
| Ready と Late Join | `evaluating` への遷移が先なら Late Join は次 Round。Join が先なら Ready が必要 |
| Local Agent 完了と Deadline | 最初に `settled` へ遷移した結果を維持。Deadline と同時刻は fallback を優先 |
| Guest Loss と Round 完了 | Grace 期限を先に適用し、退出 Guest を Outcome へ含めない |
| Host Loss と Round 完了 | Grace 期限を先に適用し、Outcome を破棄して `destroyed` にする |
| Lounge 期限と任意 Event | Lounge 期限を先に適用し、終了理由を `expired` に固定 |

## Failure Matrix と運営 Recovery

| Failure | 自動収束 | UI / 運営 Recovery | 残さない Data |
| --- | --- | --- | --- |
| Guest の一時切断 | 5 秒待機後、Reconnect または Membership から除外 | 除外後は新しい QR で再参加 | 旧接続 Queue、旧 Ready |
| Host の一時切断 | 5 秒待機後、Reconnect または Lounge 終了 | Host が新しい Lounge を作り QR を再表示 | 全 Membership、Passport、Outcome、Key |
| Local Agent Timeout | 45 秒で Rules fallback | Rules へ切り替えた事実だけを表示 | Prompt、Model Output、遅延結果 |
| App Background | Adapter が Disconnect を通知し Grace を開始 | 復帰が間に合わなければ再参加 | Background 中の送信 Queue |
| Network Switch | Adapter が旧接続を破棄し、認証済み再接続を試行 | Grace 超過後は新しい QR で再参加 | 旧 Transport Identity / Queue |
| 悪意ある Peer | Peer Protocol が当該 Peer を拒否 | 他 Participant は継続。Host UI は非機密な Error code だけ表示 | 不正 Payload と Peer state |
| Lounge 期限 | 20 分で全端末を終了 | Host が必要なら新規 Lounge を作る | Key、Membership、Passport、Answer、Bridge、Queue |

Host Loss 後に Guest の一端末を新 Host へ昇格させません。古い Secret や Snapshot を使った再開も
行わず、Host が新しい Lounge ID、Join Secret、Participant ID を発行します。

Wire の Membership は Peer Protocol 1.2 の 2〜6 名を維持します。最後の Guest を除外した Host は、
Host 1 名の Snapshot を `cleanupLocalHostMembership()` へだけ適用し、receiver 内の Passport と Peer
state を破棄します。この 1 名 Snapshot は Wire へ送信しません。新 Guest の Join 後、2 名以上の
Snapshot を Host と Guest へ配布します。

## 検証範囲

純 TypeScript の Scenario Test は 2、3、4、5、6 名、Alias 重複、Join / Leave race、Late Join、
Packet 順序変化、Drop、Reconnect、Host / Guest Loss、期限、45 秒 fallback を仮想時計で検証します。
30 分相当の仮想時間を進める Test は Timer と bounded state の回帰検出であり、実時間 Soak では
ありません。

Issue 24 を Close するには、Issue 20・22 の実 Transport 上で iOS / Android 混在 3 台以上、
2〜6 台 Scenario、30 分以上の実時間 Soak、Network Capture、Storage Inspection を別途実施します。
端末、OS、Network、時刻、結果も記録します。

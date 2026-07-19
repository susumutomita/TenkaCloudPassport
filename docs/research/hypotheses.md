# 対面イベント調査 Top Five Hypotheses

- Research execution: `Not run`
- Ranking basis: Product / Privacy risk first, then journey reach and recovery cost
- Related issue: https://github.com/susumutomita/TenkaCloudPassport/issues/2

本書は [Interview Guide](./interview-guide.md) で調べ、[Service Blueprint](./service-blueprint.md) の Evidence で
反証する仮説を順位付けする。現在の根拠は Product Contract と実装された Flow だけであり、Field Evidence ではない。
支持例だけを集めず、反証 1 件を同じ粒度で残す。

## Ranked falsifiable hypotheses

| Priority | Falsifiable hypothesis | Current rationale, not field evidence | Disconfirmation condition | Status |
| --- | --- | --- | --- | --- |
| H1 | Product Consent と Research Consent を別の判断点にすれば、参加者は各共有範囲と拒否後の影響を説明できる。 | 同じ Setup 中に 2 つの Consent があり、混同は Privacy 境界を直接壊すため最優先である。 | Disconfirm when 1 名でも Research への同意が Product の Passport / Camera / Answer 共有も許可すると説明する。 | `Untested` |
| H2 | Guest ごとの fresh QR と All-Ready 表示があれば、初見の Group は使用済み QR を再利用せず 2〜6 名の開始条件を判断できる。 | Join は 1 回限り Secret と全員 Ready に依存し、誤操作が Group 全体を止めうる。 | Disconfirm when Participant または Organizer が同じ QR の回覧、Ready 前開始、7 人目追加を安全だと判断する。 | `Untested` |
| H3 | `no-signal` と回答拒否を正常終了として先に説明すれば、参加者と Organizer は retry、回答圧力、人物評価を選ばず退出できる。 | Bridge を成功、`no-signal` を失敗と読むと Product Contract と自発的会話を壊す。 | Disconfirm when 1 名でも `no-signal` 後の再推論、別候補表示、回答要求、参加者評価を必要とする。 | `Untested` |
| H4 | Host Loss、Network 不通、Screen Close に固定 Stop Label と Recovery があれば、Organizer は未検証経路を足さず有限時間で終了できる。 | 会場では原因特定より安全な終了が先であり、曖昧な回復は Data 残留と支援負荷を増やす。 | Disconfirm when Scenario で Organizer が旧 Lounge 復元、Secret 手入力、外部 Relay、期限延長を選ぶか終了不能になる。 | `Untested` |
| H5 | App が最大 1 Bridge の後に退き、連絡先や会話を記録しなければ、参加者は会話する・しない・退出を自分で決められる。 | Product は人を評価または管理せず、人間同士の会話開始だけを支える契約である。 | Disconfirm when Participant が追加推薦、相性 Score、Facilitator 仲介、連絡先収集を Product の必須結果として期待する。 | `Untested` |

## Evidence ledger rule

各仮説は 3 セッション以上かつ 2 つ以上の Role または Locale Stratum へ広がる Public Aggregate だけで更新する。
個別 Record、Locale 名、Role × Locale、正確な人数を公開しない。Privacy、Consent、退出の単独反証だけは
説明を公開せず、独立 Privacy Reviewer の停止判断で `Contradicted` にできる。

| Evidence class | Required record | Effect |
| --- | --- | --- |
| Supporting | 固定 Behavior Code から閾値を満たした Public Aggregate である。 | `Supported` 候補にするが `Validated` とは扱わない。 |
| Contradicting | 同じ固定 Code と安全 / 同意 / 退出への影響である。 | 1 件でも `Contradicted` にする。Privacy、Consent、退出なら最優先の停止判断へ上げ、それ以外は影響範囲で再順位付けする。 |
| Not observed | 観察機会がなかった Stage / Failure である。 | `Untested` を維持し、他 Stage から推測しない。 |
| Researcher interpretation | 閾値を満たした Public Aggregate と分離した説明である。 | 次 Interview の Probe には使えるが Evidence として数えない。 |

## Re-ranking rule

1. Privacy / Consent /退出を壊す反証は件数に関係なく最優先にする。
2. 次に複数 Stage、両 Role、複数 Locale へ広がる摩擦を優先する。
3. 会話成立だけを成功例として重くせず、`no-signal`、拒否、途中退出を同じ粒度で扱う。
4. 最低 Gate の 8 セッションを満たしても統計的一般化、人物分類、Locale 比較をしない。
5. 仮説の文を Evidence に合わせて変更した場合、旧文と変更理由を履歴へ残し、後知恵で最初から支持された
   ように書き換えない。

## Design-change boundary

No design-change Issue is justified before field evidence. 調査後に別 Issue 候補を作る場合は、対象 Hypothesis、
公開可能な支持 / 反証 Status、影響する Blueprint Stage、Privacy / Product Contract、反証可能な受け入れ条件を含める。
氏名、連絡先、会場、正確な日時、逐語引用、会話内容を Issue へ転記しない。調査実施と設計変更の実装を同じ
Pull Request に混ぜない。

## Completion boundary

H1〜H5 は実在する Participant 4 名以上、Event organizer 4 名以上、2 Locale Cohort 以上の同意済み Evidence を
反映するまで全て `Untested` です。Repository Test や Researcher walkthrough だけで支持済みへ変更しない。

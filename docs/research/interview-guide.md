# 対面イベント形成的調査 Interview Guide

- Research execution: `Not run`
- Protocol version: `FORMATIVE-EVENT-RESEARCH-1`
- Evidence owner: Product Researcher who did not implement the observed flow
- Related issue: https://github.com/susumutomita/TenkaCloudPassport/issues/2

本書は、参加者と Event 主催者が会場到着から退出までに何につまずくかを調べる半構造化 Interview と
非介入 Observation の手順です。実装済み機能の評価会、営業 Interview、人物の適性評価ではない。
現在は調査準備だけが完了しており、調査結果や検証済みの利用者事実を含まない。

調査後の統合先は [Service Blueprint](./service-blueprint.md)、反証判断は
[Top Five Hypotheses](./hypotheses.md) とする。Pilot 成果の測定は
[Pilot Protocol](./pilot-protocol.md) の別目的であり、本調査の Interview 証拠に置き換えない。

## Minimum evidence gate

同じ人を複数の枠へ重複計上しない。Locale は調査時に本人が選んだ Interview 言語の Cohort だけを使い、
国籍、居住地、民族性を記録または推測しない。

| Cohort | Minimum completed sessions |
| --- | ---: |
| Participant | 4 |
| Event organizer | 4 |
| Locale cohorts | 2 |

両 Role を合計した 8 セッション以上が必要であり、各 Locale Cohort に Participant と Event organizer の両方を
最低 1 セッション含める。版管理済みの Consent と Prompt がある `ja` / `en` を初期対応 Locale とする。
別言語は、独立 Reviewer が同じ意味と撤回境界を確認した版を追加するまで募集しない。即席通訳で Gate を満たさない。
中断または Consent 撤回されたセッションは人数へ数えず、撤回理由を尋ねない。

## Recruitment boundary

- 公開 Community Channel や Event 主催者の通常の案内経路で、調査目的、所要時間、任意参加を同じ文面で示す。
- 氏名、Handle、Email、電話番号、所属、写真、公開 Profile URL を Research Artifact へ複製しない。
- 調査参加、Product 利用、Event 参加、今後の招待を結び付けない。謝礼がある場合は参加可否や回答内容と
  無関係な固定条件を別 Process で扱い、この Repository に記録しない。
- 未成年者、代理同意が必要な人、録画を前提とする会場は本 Guide の Scope に含めない。

## Consent script

開始前に、本人が選んだ言語と一致する次の版管理済み Script を省略せず読む。

- [日本語 Consent Script](./formative-consent-script.ja.md)。
- [English Consent Script](./formative-consent-script.en.md)。

両 Script は収集 Field、完全な匿名性を保証しないこと、暗号化済み一時領域、7 日の削除期限、公開 Repository、
小 Cell 抑制、セッションを閉じる前までの撤回、統合後に個別削除できない境界を同じ意味で固定する。
理解を確認できない場合や別言語の承認済み Script がない場合は開始しない。

明示的な同意がない場合は Observation を始めない。Product を実際に操作する場合の Passport 公開、Camera、
Owner Question は Product UI で本人が別に選ぶ。Research への同意を Product 操作の同意として扱わない。

## セッション setup

- 1 セッションは最大 30 分とし、Interview 15 分、選択した Journey の Observation または Walkthrough 10 分、
  終了確認 5 分を目安にする。正確な開始・終了時刻は記録しない。
- Researcher は 1 名、協力者は 1 名とする。Facilitator が同席する必要がある場合も回答を補完させない。
- 実機 Capability が `Not run` の場合は画面操作を成功するよう演じず、版管理済み Guide の Walkthrough と
  失敗回復の理解だけを観察する。
- 協力者コードを発行しない。セッション間を結ぶ安定 ID、座席番号、端末番号を作らない。

## Common opening questions

回答を誘導せず、沈黙を埋めるために選択肢を読み上げない。回答しない場合はそのまま次へ進む。

1. Event に着いてから、人と話し始めるまでに普段どのようなことが起きるか。
2. 初対面の人との会話で、助けになるものと避けたいものは何か。
3. 自分の端末、Camera、短い Profile 情報を使う Flow に入る前、何が分かれば判断できるか。
4. 途中で止めたいとき、どの時点で、どのように止められると期待するか。
5. 会話が始まらない場合、どの説明なら失敗と感じずに退出できるか。

## Participant track

各 Stage で「何をしたと理解したか」「次に何が起きると予想したか」「何を共有したと理解したか」を尋ねる。
できなかった操作を Researcher が代行せず、自由記述ではなく固定 Behavior Code だけを残す。

| Journey stage | Neutral prompt | Observe without content |
| --- | --- | --- |
| Arrival | どこへ行き、誰の案内を探すか。 | 案内を見つけるまでの迷いの有無と Stop 判断である。 |
| Passport setup | 何を端末に残し、何を今回だけ共有すると理解したか。 | Preview、拒否、保存の区別である。入力内容は見ない。 |
| Lounge join | QR、Camera、Host、2〜6 名をどう理解したか。 | 自分で Consent / Ready を選べるかである。 |
| Pet exchange | 端末同士で何が起き、Facilitator が何を見られると理解したか。 | Offline / Local の理解と待機中の不安である。 |
| Owner Question | 答えない選択と退出が可能だと分かるか。 | 回答、拒否、退出のどれを選んだかだけである。内容は見ない。 |
| Bridge or `no-signal` | 表示を人物評価と受け取るか、会話への 1 つの糸口と受け取るか。 | 結果の理解と次行動である。 |
| Human conversation | App が退いた後に自分で話すか決められるか。 | 会話の発生有無だけである。内容や相手を記録しない。 |
| Exit | 何が消え、何が端末に残ると理解したか。 | End / Forget、途中退出、次 Group への再利用理解である。 |

## Event organizer track

1. 到着者が最初に尋ねることと、通常どの役割が対応するか。
2. 2〜6 名を作るときの混雑、言語、端末、Camera、参加拒否の扱い。
3. Facilitator が説明できる範囲と、Core Team の同期支援が必要になる Stop 条件。
4. Internet 不通、QR 読取失敗、Host Loss、Model なしで、Event 全体を止めず Group を安全に終える方法。
5. `no-signal`、回答拒否、途中退出を参加者の失敗にしない案内方法。
6. 個人情報や会話内容を集めずに、運営上の迷いだけを改善へ戻す方法。
7. 次回開催を判断するために本当に必要な証拠と、収集してはいけない情報。

## English prompt set

English Cohort では日本語を即席翻訳せず、次の固定 Prompt を使う。回答の内容は記録せず、固定 Code だけを残す。

### Common opening questions in English

1. What usually happens between arriving at an event and beginning a conversation with someone?
2. What helps in a first conversation, and what should be avoided?
3. What would you need to know before using your device, Camera, or a short Profile in this flow?
4. When and how would you expect to stop if you wanted to leave partway through?
5. If no conversation begins, what explanation would let you leave without treating that as failure?

### Participant prompts in English

| Journey stage | Neutral prompt |
| --- | --- |
| Arrival | Where would you go, and whose guidance would you look for? |
| Passport setup | What stays on your device, and what is shared only for this event? |
| Lounge join | How do you understand the QR, Camera, Host, and two-to-six-person limit? |
| Pet exchange | What happens between devices, and what can the Facilitator see? |
| Owner Question | Can you decline the question or leave? |
| Bridge or `no-signal` | Is this an evaluation of a person or one optional conversation lead? |
| Human conversation | Can you decide whether to talk after the App steps away? |
| Exit | What is deleted, and what remains on your device? |

### Event organizer prompts in English

1. What do arriving participants ask first, and which role normally helps them?
2. How do you handle congestion, language, devices, Camera refusal, and groups of two to six people?
3. What can a Facilitator explain, and when must the Core Team stop the flow?
4. How can a Group end safely after network loss, QR failure, Host Loss, or a missing Model?
5. How do you explain `no-signal`, a declined answer, or early exit without blaming a participant?
6. How can event friction improve without collecting identity or conversation content?
7. What evidence is necessary for another event, and what must never be collected?

### Failure prompts in English

- Network unavailable: Can the flow return to a Walkthrough without adding an unverified Transport?
- QR scan failure: Does the flow avoid guessing success after Camera refusal, invalid format, reuse, or expiry?
- Owner Question declined: Can decline or exit remain normal without asking again?
- `no-signal`: Can the person decide whether to talk or leave without retry or evaluation?
- Early exit: Can current Data be discarded without asking why, while distinguishing Guest exit from Host Loss?
- Screen closed: Can the flow end safely or require a fresh Join without guessing that old State is valid?

## Required failure probes

正常系の後だけでなく、次の状態を同じ粒度で扱う。実環境で安全に再現できない場合は Scenario Card を読み、
予想と Stop 判断を聞く。成功したように演じたり、実在しない画面を示したりしない。

- Network unavailable: 未検証 Transport を足さず Walkthrough へ戻れるか。
- QR scan failure: Camera 拒否、不正形式、使用済み、期限切れを推測で成功扱いしないか。
- Owner Question declined: 回答を促さず、`decline` または退出を正常に扱えるか。
- `no-signal`: 再試行や人物評価にせず、人間が話すか退出するかを本人へ戻せるか。
- Early exit: 理由を尋ねず本人の現在 Data を破棄し、Host Loss と個人退出を区別できるか。
- Screen closed: 復元を推測せず、期限と現在 State に応じて安全に終了または新規参加へ戻れるか。

## Temporary coded record allowlist

1 セッションにつき次の 7 Field だけを暗号化済み一時領域へ記録する。自由記述欄を作らず、空欄を推測で埋めない。
氏名、連絡先、正確な日時、会場、端末 / Lounge ID、回答や会話の内容、逐語引用、健康、障害、宗教、政治的見解、
性的指向などの Sensitive Data を記録しない。Sensitive Data を誤って書いた場合はその Record 全体を直ちに削除し、
本人の再同意なしに作り直さない。

| Field | Allowed value |
| --- | --- |
| Role cohort | `participant` / `event-organizer` |
| Locale cohort | `ja` / `en` / `approved-other` |
| Journey stage | 本書の 8 Stage のいずれかである。 |
| Outcome class | `continued` / `recovered` / `declined` / `exited` / `blocked` |
| Behavior code | `self-directed` / `neutral-repeat-needed` / `help-requested` / `privacy-confusion` / `recovery-chosen` / `stop-chosen` |
| Evidence direction | `supporting` / `contradicting` / `not-observed` |
| Hypothesis reference | `H1`〜`H5` / `none` である。 |

## Retention and synthesis

- Temporary Coded Record は Researcher だけが扱える暗号化済み一時領域へ置く。Aggregate 更新後に直ちに削除し、
  更新できない場合もセッション終了から 7 日以内に削除する。Repository、Issue、PR、Cloud Analytics へ置かない。
- セッションを閉じる確認前の撤回は Record 全体を直ちに削除する。閉じた後は個人へ結び付ける ID を残さないため、
  個別寄与を検索または削除できない。この境界を専用 Consent Script で先に説明する。
- Public Aggregate は 3 セッション以上で同じ Pattern があり、2 つ以上の Role または Locale Stratum へ広がる場合だけ
  記載する。Locale 名、Role × Locale の組合せ、正確な人数、個別 Record を公開しない。
- Privacy、Consent、退出へ反する 1 件は調査を停止して `Contradicted` にできるが、3 セッション閾値未満の説明は
  公開しない。独立 Privacy Reviewer が内容を複製せず停止判断だけを確認する。
- 支持例と反証例を同じ固定 Code で扱い、会話成立、`no-signal`、拒否、途中退出を選別しない。
- 8 セッション、2 Locale Gate を満たしても一般化を主張しない。これは設計判断を始める最低証拠である。

## Completion checklist

- [ ] Participant 4 セッション以上が完了した。
- [ ] Event organizer 4 セッション以上が完了した。
- [ ] 2 Locale Cohort 以上を含み、各 Locale に両 Role がある。
- [ ] 全 8 Journey Stage と 6 Failure Probe に Observation または明示的な未観察がある。
- [ ] Blueprint の各 Cell が `Observed` / `Contradicted` / `Not observed` の Evidence Status を持つ。
- [ ] H1〜H5 の支持と反証を更新した。
- [ ] 設計変更候補を本調査へ実装せず、別 Issue 候補に分離した。
- [ ] Temporary Coded Record が 7 日以内に削除され、Public Aggregate に小 Cell、正確な人数、個人情報、
  Sensitive Data、録音、逐語引用がないことを別 Reviewer が確認した。

この Check が埋まる前は Research execution を `Not run` から変更せず、Issue 2 を閉じない。

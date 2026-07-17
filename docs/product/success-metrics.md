# TenkaCloud Passport 成功指標

日本語節を本書の正本とする。English 節は同じ意味の翻訳であり、変更時は両方を同時に更新する。

## 日本語

### 主成功指標

主成功指標は「Bridge をきっかけに人間の会話が始まった自己申告率」です。Bridge 表示率は
成功指標ではありません。

計算式は、Bridge を表示された後に有効な回答をした参加者のうち、「Bridge をきっかけに
相手との口頭会話が始まった」と回答した参加者の割合とする。

`会話開始自己申告率 = 「はい」の回答数 / （「はい」の回答数 + 「いいえ」の回答数）`。

この指標が測るのは、人間同士の口頭会話の開始です。会話の長さ、連絡先交換、再会、
共同運営への参加は、Bridge の直接成果に含めない。

### 測定手順

1. Bridge を表示した参加者へ、相手と話す機会が過ぎた後に 1 回だけ質問する。
2. 質問文は「表示された Bridge をきっかけに、相手との口頭会話が始まりましたか」とする。
3. 回答は「はい」「いいえ」「回答しない」の 3 つとする。未回答と「回答しない」は不明として
   分母から除外し、回答したと推測しない。
4. 有効回答数と回答対象数を併記し、回答率を示す。自己選択による偏りを隠さない。
5. イベント種別ごとの集計は許容するが、個人の安定追跡 ID、プロフィール、人物スコアは作らない。
6. 端末内の匿名カウンターで測定できる設計を基準とし、中央アカウントや中央サーバーを
   測定の必須条件にしない。運営者への匿名集計共有は任意とする。

### 成功とみなさない指標

- Bridge 表示率は、Pet が何かを表示した頻度であり、人間の会話開始を示さない。
- アプリ滞在時間は、Pet が適切に退いたかという契約と逆方向になり得る。
- Lounge 数、質問数、クリック数は利用状況であり、成果ではない。
- 連絡先交換率、継続チャット率、プロフィール閲覧数は非目標を促進するため採用しない。
- `no-signal` 率の低さは成功ではない。低下を目標にすると弱い根拠から Bridge を作る誘因になる。

### ガードレール

主成功指標は、次の契約遵守指標と一緒に解釈する。

- 根拠確認率は、表示した Bridge が確認済みの手掛かりだけに基づく割合であり、100％ を必須とする。
- 主要 Bridge 上限違反数は、参加者へ複数の主要 Bridge を提示した件数であり、常に 0 を求める。
- `retired` 違反数は、Bridge または `no-signal` の確定後に Pet が追加応答や再判定をした
  件数であり、常に 0 を求める。
- Owner Question 上限違反数は、1 回の Lounge 参加で 2 問以上を行った件数であり、常に 0 を求める。
- 回答率は、有効回答数を回答対象数で割った値であり、主成功指標の偏りを判断するため併記する。
- `no-signal` 率は、参加者単位の結果が確定した Lounge 参加数に対する `no-signal` の件数である。
  安全側の判定が機能しているかを調べる診断値であり、良否を単独で判定しない。

必須ガードレールに 1 件でも違反があれば、主成功指標への影響にかかわらずプロダクト成功とは認めない。

### 失敗状態

- Bridge 表示率を主成功指標として最適化することは失敗である。
- 未回答を「会話が始まった」と推測することは失敗である。
- 人物別の比較、順位、スコアを作ることは失敗である。
- 測定のためにアカウント、中央サーバー、安定追跡 ID を必須にすることは失敗である。
- 地域イベント間の数値差を、参加者や地域の価値の差として解釈することは失敗である。

### TenkaCloud での利用

地域イベント、ローカル大会、共同運営の集まりごとに主成功指標と回答率を集計すると、どの場で
Bridge が人間の最初の一言を支えたかを振り返れる。集計はイベント設計の改善に使い、参加者、
チーム、地域の評価やランキングには使わない。共同運営への発展は長期的な観察対象になり得るが、
Bridge 直後の会話開始という主成功指標と混ぜない。

## English

### Primary success metric

The primary success metric is the self-reported rate at which a Bridge prompted a human conversation to
begin. Bridge display rate is not a success metric.

It is calculated among participants who gave a valid response after seeing a Bridge, as the proportion who
answered that the Bridge prompted a spoken conversation with the other person to begin.

`Self-reported conversation-start rate = Yes responses / (Yes responses + No responses)`.

This metric measures the start of spoken conversation between humans. Conversation length, contact
exchange, meeting again, and participation in co-operation are not counted as direct Bridge outcomes.

### Measurement procedure

1. After the opportunity to speak with the other person has passed, ask each participant who saw a Bridge
   the question once.
2. Use the question, “Did the displayed Bridge prompt a spoken conversation with the other person to begin?”
3. Offer three responses: “Yes,” “No,” and “Prefer not to answer.” Treat non-response and “Prefer not to answer”
   as unknown, exclude them from the denominator, and never infer an answer.
4. Report the valid response count and eligible count with the response rate. Do not hide self-selection bias.
5. Aggregation by event type is allowed, but no stable personal tracking ID, profile, or people score is created.
6. The baseline design must support measurement with anonymous on-device counters. Neither a central account
   nor a central server is required. Anonymous aggregate sharing with an operator is optional.

### Metrics that are not success

- Bridge display rate measures how often a Pet displayed something, not whether human conversation began.
- Time spent in the app may work against the contract that requires the Pet to step away.
- Lounge count, question count, and click count describe usage, not outcomes.
- Contact exchange rate, persistent chat rate, and profile views promote non-goals and are not adopted.
- A low `no-signal` rate is not success. Optimizing it downward would encourage Bridges from weak evidence.

### Guardrails

Interpret the primary success metric together with these contract-compliance measures.

- Evidence confirmation rate is the proportion of displayed Bridges based only on confirmed clues and must be
  one hundred percent.
- Primary Bridge limit violations count cases in which a participant received multiple primary Bridges and
  must always be 0.
- `retired` violations count cases in which a Pet responded or re-evaluated after either a Bridge or
  `no-signal` was finalized and must always be 0.
- Owner Question limit violations count Lounge participations with two or more questions and must always be 0.
- Response rate is valid responses divided by eligible participants and is reported to assess bias in the
  primary success metric.
- `no-signal` rate is `no-signal` outcomes divided by Lounge participations with a finalized participant-level
  outcome. It is a diagnostic for whether conservative decisions are operating, not a standalone judgment of
  good or bad performance.

Any required guardrail violation disqualifies product success, regardless of its effect on the primary metric.

### Failure states

- Optimizing Bridge display rate as the primary success metric is a failure.
- Inferring that a conversation began from a missing response is a failure.
- Creating person-level comparisons, rankings, or scores is a failure.
- Requiring an account, central server, or stable tracking ID for measurement is a failure.
- Interpreting differences between regional events as differences in participant or community value is a failure.

### Use in TenkaCloud

Aggregating the primary success metric and response rate for each regional event, local tournament, or
co-operation gathering supports reflection on where Bridges helped people say the first words. Aggregates are
used to improve event design, not to evaluate or rank participants, teams, or communities. Progression into
co-operation may be observed over the longer term, but it is kept separate from the primary metric of
conversation beginning immediately after a Bridge.

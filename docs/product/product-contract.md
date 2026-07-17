# TenkaCloud Passport プロダクト契約

日本語節を本書の正本とする。English 節は同じ意味の翻訳であり、変更時は両方を同時に更新する。
指定用語の定義は [用語集](./glossary.md) を唯一の正本とする。

## 日本語

### 契約の目的

本契約は、TenkaCloud Passport が作る価値と、価値を壊す挙動の境界を定める。後続の
プロダクト判断、設計、実装、評価は本契約を満たさなければならない。

### プロダクトの約束

TenkaCloud Passport は、人間の代わりに関係を作らない。Pet は使い捨ての Lounge で
来歴を確認できる少量の手掛かりだけを交換し、十分な根拠がある場合に限って、人間同士が
話し始める理由を主要 Bridge として参加者ごとに最大 1 つ提示する。提示後は退き、会話の
主体を人間へ返す。

### JTBD

地域イベント、ローカル大会、または共同運営の場で、初対面の相手や話すきっかけのない
相手と居合わせたとき、本人が公開を許可した確認可能な手掛かりから声をかける理由を
1 つだけ得て、アプリ内ではなく人間同士の口頭会話へ移りたい。

### 対象利用者

主な利用者は、イベントへ Pet と一緒に参加する Owner です。新しい相手と話す可能性を
望みながら、人物検索、評価、相性判定、連絡先交換を入口にしたくない参加者を対象とする。
イベント運営者は利用を支援できるが、Owner のアカウント、関係、会話を管理しない。

### 中核フロー

1. Owner は、公開を許可した少量の手掛かりを Passport として Pet に持たせる。
2. 現地で出会った Pet は、その出会いに限った使い捨ての Lounge へ参加する。
3. Pet は、来歴を確認できる手掛かりだけを交換する。確認済みとは、Passport で Owner が
   公開を許可した情報、または Owner Question への明示的な回答として出所を識別でき、
   Owner が当該 Lounge での利用を許可したことを指す。本人確認や客観的真実の保証を意味しない。
4. 不明な情報は推測しない。Bridge の判定に不可欠な不明点だけがある場合、Pet は
   1 回の Lounge 参加につき Owner Question を最大 1 問だけ行える。追加質問は行わない。
5. 十分な根拠があれば、各参加者へ主要 Bridge を最大 1 つ提示する。候補一覧、順位、
   相性点数は提示しない。
6. ある参加者について根拠が弱ければ、その Owner の Pet は参加者単位の結果として
   `no-signal` を返し、Bridge を作らない。`no-signal` は安全な正常結果であり、穴埋めすべき
   失敗ではない。別の参加者の結果は、その参加者について独立に判定する。
7. Bridge の表示直後、その Pet は `retired` になる。説明を追加せず、会話を継続せず、
   連絡先を交換しない。`no-signal` を返した Pet も自分の Lounge 参加を終了して `retired` になり、
   同じ参加内で再判定しない。すべての Pet が `retired` になった時点で Lounge を閉じる。

### 不変条件

1. アカウント不要である。利用開始、Lounge 参加、Bridge または `no-signal` の結果に、
   中央アカウントの作成やログインを要求してはならない。
2. 中央サーバーなしでも成立する。中核フローは現地の端末間で完結できなければならず、
   任意の集計や運用サービスの停止によって利用不能になってはならない。
3. 不明は不明として扱う。Pet は不足情報を推測、補完、外部人物検索してはならない。
   必要な場合に限り、Owner Question を 1 回の Lounge 参加につき最大 1 問だけ行える。
4. 参加者ごとの主要 Bridge は 1 つを上限とする。代替候補、ランキング、追加のおすすめを
   主要 Bridge と並べてはならない。
5. Bridge 後は Pet が退く。表示直後に `retired` へ遷移し、継続チャットや会話代行を
   提供してはならない。
6. 根拠が弱い場合、その参加者への結果は `no-signal` である。Bridge の表示率を上げる目的で
   判定を緩めてはならない。

### 成功の瞬間

成功は、Bridge を受け取った Owner が、それをきっかけに相手へ声をかけ、人間同士の
口頭会話が始まったと自己申告した瞬間です。正本となる測定方法は
[成功指標](./success-metrics.md) に定める。

### 失敗状態

- 来歴を確認できない情報、推測、人物検索結果を Bridge の根拠にすることは失敗である。
- 弱い根拠から Bridge を作り、`no-signal` を避けることは失敗である。
- 参加者へ複数の主要 Bridge、順位、相性点数を提示することは失敗である。
- Pet が Bridge 後も応答し、会話や連絡先交換を仲介し続けることは失敗である。
- アカウント、中央サーバー、安定追跡 ID を中核フローの必須条件にすることは失敗である。
- Bridge 表示を成果とみなし、人間の会話開始を確認しないことは失敗である。

### 非目標

次の機能と事業領域は、本契約の意図的な非目標です。

- デジタル名刺。
- 人物検索。
- 人物スコアリング。
- 相性点数。
- 継続チャット。
- 連絡先同期。
- 本人確認。
- 会話代行。
- SNS。
- 出会い系。

確認済みの手掛かりは本人確認を意味せず、Bridge は人物評価や相性判定を意味しない。

### TenkaCloud との関係

TenkaCloud の地域イベントとローカル大会は、異なる役割、技術、地域の参加者が同じ場所に
集まる機会を作る。TenkaCloud Passport は、その場で確認できる共通の手掛かりを最初の
一言へ変換し、参加者自身が共同運営へ進める入口を作る。イベント管理、参加者台帳、共同運営の
意思決定を置き換えず、中央サーバーへ関係を囲い込まない。

## English

### Purpose of this contract

This contract defines the boundary between the value TenkaCloud Passport creates and behaviors that
destroy that value. Subsequent product decisions, designs, implementations, and evaluations must satisfy it.

### Product promise

TenkaCloud Passport does not create relationships on behalf of humans. In a disposable Lounge, Pets
exchange only a small number of clues with identifiable provenance. Only when the evidence is sufficient,
each participant may receive at most one primary Bridge as a reason for the humans to start talking. The Pet
then steps away and returns agency to the humans.

### JTBD

When I encounter someone new or someone I have no reason to approach at a regional event, local
tournament, or co-operated activity, I want one reason to speak based on verifiable clues that the person
has allowed to be shared, so that I can move into a spoken human conversation instead of staying in an app.

### Target users

The primary user is an Owner who attends an event with a Pet. The product is for participants who are open
to meeting someone new but do not want people search, evaluation, compatibility judgments, or contact
exchange as the entry point. Event operators may support use, but they do not manage Owner accounts,
relationships, or conversations.

### Core flow

1. An Owner gives the Pet a Passport containing a small number of clues the Owner permits it to disclose.
2. Pets that meet on site join a disposable Lounge limited to that encounter.
3. Pets exchange only clues with identifiable provenance. Confirmed means that the source is identifiable as
   information the Owner permitted in the Passport or an explicit answer to an Owner Question, and that the
   Owner permitted its use in that Lounge. It does not mean identity verification or a guarantee of objective truth.
4. Unknown information is never guessed. If the only blocker to evaluating a Bridge is an essential unknown,
   a Pet may ask at most one Owner Question during one Lounge participation. It asks no follow-up question.
5. With sufficient evidence, each participant receives at most one primary Bridge. The product does not show
   candidate lists, rankings, or compatibility scores.
6. With weak evidence for a participant, that Owner's Pet returns `no-signal` as a participant-level outcome
   and produces no Bridge. `no-signal` is a safe normal outcome, not a failure that must be filled. Another
   participant's outcome is evaluated independently for that participant.
7. Immediately after displaying a Bridge, that Pet enters `retired` and provides no additional explanation,
   persistent conversation, or contact exchange. A Pet that returns `no-signal` also ends its own Lounge
   participation and enters `retired`, with no repeated evaluation during the same participation. The Lounge
   closes when every Pet has entered `retired`.

### Invariants

1. No account is required. Starting use, joining a Lounge, and receiving a Bridge or `no-signal` must never
   require creating or signing in to a central account.
2. The product works without a central server. The core flow must be able to complete between on-site devices,
   and an optional aggregation or operations service outage must not make it unavailable.
3. Unknown remains unknown. A Pet must not guess, fill in missing information, or perform external people
   search. Only when necessary, it may ask at most one Owner Question during one Lounge participation.
4. Each participant receives at most one primary Bridge. Alternatives, rankings, or additional recommendations
   must not be shown beside the primary Bridge.
5. The Pet steps away after a Bridge. It enters `retired` immediately after display and must not provide
   persistent chat or conversation proxying.
6. Weak evidence for a participant produces `no-signal` for that participant. The decision threshold must not
   be relaxed to increase Bridge displays.

### Moment of success

Success occurs when an Owner who received a Bridge self-reports that it prompted them to address the other
person and a spoken human conversation began. The normative measurement method is defined in
[success metrics](./success-metrics.md).

### Failure states

- Using clues without identifiable provenance, guesses, or people-search results as evidence for a Bridge is a failure.
- Producing a Bridge from weak evidence to avoid `no-signal` is a failure.
- Showing a participant multiple primary Bridges, rankings, or compatibility scores is a failure.
- Letting a Pet keep responding and mediate conversation or contact exchange after a Bridge is a failure.
- Requiring an account, central server, or stable tracking ID for the core flow is a failure.
- Treating Bridge display as the outcome without checking whether human conversation began is a failure.

### Non-goals

The following capabilities and business categories are deliberate non-goals of this contract.

- Digital business cards.
- People search.
- People scoring.
- Compatibility scores.
- Persistent chat.
- Contact synchronization.
- Identity verification.
- Conversation proxying.
- Social networking.
- Dating.

A provenance-confirmed clue does not mean identity verification, and a Bridge does not mean a person
evaluation or compatibility judgment.

### Relationship to TenkaCloud

TenkaCloud regional events and local tournaments bring participants from different roles, technologies, and
communities into the same place. TenkaCloud Passport turns a locally confirmed common clue into an opening
line from which the participants themselves can move into co-operation. It does not replace event management,
participant registries, or co-operation decisions, and it does not capture relationships on a central server.

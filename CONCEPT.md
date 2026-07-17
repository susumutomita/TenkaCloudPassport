# TenkaCloud Passport Concept

日本語節を本書の正本とする。English 節は同じ意味の翻訳であり、変更時は両方を同時に更新する。

## 日本語

### 一文で表すプロダクト

TenkaCloud Passport は、イベントへ同伴した Pet が使い捨ての Lounge で確認済みの
手掛かりを交換し、人間同士が話し始める理由である Bridge を参加者ごとに最大 1 つだけ
提示して退く、アカウント不要の会話触媒です。

### JTBD

地域イベント、ローカル大会、または共同運営の場で、初対面の相手や話すきっかけのない
相手と居合わせたとき、本人が公開を許可した確認可能な手掛かりから声をかける理由を
1 つだけ得て、アプリ内ではなく人間同士の口頭会話へ移りたい。

### 対象利用者

主な利用者は、TenkaCloud に関係する地域イベント、ローカル大会、共同運営の場へ参加し、
新しい相手と話す可能性は望むが、プロフィールの検索、採点、連絡先交換を前提にしたくない
人です。イベント運営者は体験の受益者になり得ますが、参加者の関係を管理する主体にはなりません。

### 成功の瞬間

成功の瞬間は、表示された Bridge をきっかけに Owner が相手へ声をかけ、人間同士の
口頭会話が実際に始まったと自己申告したときです。Bridge の表示、アプリ滞在、連絡先取得
だけでは成功としません。

### 失敗状態

- 確認できない情報を推測して Bridge を作ることは失敗である。
- 根拠が弱いのに `no-signal` を選ばず、無理に Bridge を表示することは失敗である。
- 参加者へ主要 Bridge を複数提示し、選択や比較を求めることは失敗である。
- Bridge の後も Pet が会話を続け、人間の会話を代行することは失敗である。
- アカウントまたは中央サーバーがなければ中核体験が成立しないことは失敗である。
- Bridge の表示数を増やすために、推測、追跡、スコアリングを導入することは失敗である。

### 不変条件

- アカウントは不要である。
- 中央サーバーなしでも中核体験が成立する。
- 不明は不明として扱い、推測しない。解消が必要な場合、Pet は 1 回の Lounge 参加につき
  Owner へ Owner Question を最大 1 問だけ行える。
- 参加者ごとの主要 Bridge は 1 つを上限とする。
- Bridge の表示後、Pet は `retired` になって退く。
- 根拠が弱い場合、その参加者への結果は `no-signal` である。

### 非目標

デジタル名刺、人物検索、人物スコアリング、相性点数、継続チャット、連絡先同期、本人確認、
会話代行、SNS、出会い系は非目標です。

### TenkaCloud との関係

TenkaCloud Passport は、地域イベントやローカル大会で役割や所属を越えた最初の一言を
生み、その後の共同運営へ人間自身が進む入口を作る。イベント管理や共同運営そのものを
中央集権化せず、現地の関係が始まる最小の接点だけを担う。

### 文書の正本

行動契約は [プロダクト契約](./docs/product/product-contract.md)、用語定義は
[用語集](./docs/product/glossary.md)、測定契約は
[成功指標](./docs/product/success-metrics.md) を正本とする。

## English

### Product in one sentence

TenkaCloud Passport is an account-free conversation catalyst in which Pets accompanying people to an
event exchange provenance-confirmed clues in a disposable Lounge, present at most one Bridge per
participant as a reason for the humans to start talking, and then step away.

### JTBD

When I encounter someone new or someone I have no reason to approach at a regional event, local
tournament, or co-operated activity, I want one reason to speak based on verifiable clues that the person
has allowed to be shared, so that I can move into a spoken human conversation instead of staying in an app.

### Target users

The primary users are people attending TenkaCloud-related regional events, local tournaments, or
co-operated activities who are open to meeting someone new but do not want profile search, scoring, or
contact exchange as prerequisites. Event operators may benefit from the experience, but they do not become
the authority that manages participant relationships.

### Moment of success

Success occurs when an Owner self-reports that the displayed Bridge prompted them to address the other
person and a spoken human conversation actually began. Displaying a Bridge, time spent in the app, or
obtaining contact details alone is not success.

### Failure states

- Producing a Bridge by guessing unconfirmed information is a failure.
- Forcing a Bridge instead of choosing `no-signal` when evidence is weak is a failure.
- Presenting multiple primary Bridges to a participant and asking them to compare or choose is a failure.
- Letting a Pet continue after a Bridge and act as a proxy for human conversation is a failure.
- Making an account or central server necessary for the core experience is a failure.
- Introducing guessing, tracking, or scoring to increase the number of displayed Bridges is a failure.

### Invariants

- No account is required.
- The core experience works without a central server.
- Unknown information remains unknown and is never guessed. If clarification is necessary, a Pet may ask
  its Owner at most one Owner Question during one Lounge participation.
- Each participant receives at most one primary Bridge.
- After displaying a Bridge, the Pet enters `retired` and steps away.
- Weak evidence for a participant produces `no-signal` for that participant.

### Non-goals

Digital business cards, people search, people scoring, compatibility scores, persistent chat, contact
synchronization, identity verification, conversation proxying, social networking, and dating are non-goals.

### Relationship to TenkaCloud

TenkaCloud Passport creates an opening line across roles and affiliations at regional events and local
tournaments, from which the humans themselves can move into co-operation. It does not centralize event
management or co-operation; it owns only the smallest point at which an in-person relationship can begin.

### Normative documents

The [product contract](./docs/product/product-contract.md) is normative for behavior, the
[glossary](./docs/product/glossary.md) for terminology, and the
[success metrics](./docs/product/success-metrics.md) for measurement.

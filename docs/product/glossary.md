# TenkaCloud Passport 用語集

日本語節を本書の正本とする。English 節は同じ意味の翻訳であり、変更時は両方を同時に更新する。
本書は指定用語の唯一の定義元です。他の文書と実装は定義を狭めたり広げたりしてはなりません。

## 日本語

### Passport

Owner がイベントのために公開を許可した、少量の手掛かりを Pet が持ち運べる形にした
データです。中央アカウント、連絡先台帳、完全なプロフィール、本人確認証明ではありません。

### Pet

Owner とイベントへ同伴し、Lounge で確認済みの手掛かりを交換するソフトウェア上の
伴走者です。十分な根拠がある場合は Owner へ主要 Bridge を最大 1 つ提示し、根拠が
弱い場合は自分の Owner へ `no-signal` を返し、その Lounge では `retired` になる。
人間の会話は代行しない。

### Owner

Pet をイベントへ同伴し、Passport で公開する手掛かりを決める人間の参加者です。
Owner Question へ回答するか、回答を当該 Lounge での手掛かりとして利用してよいかを自分で決め、
Bridge 後の会話の主体になる。

### Lounge

現地で出会った Pet が、その出会いに限って確認済みの手掛かりを交換し、参加者ごとに Bridge
または `no-signal` を決める使い捨ての通信空間です。中央サーバーを必須とせず、すべての Pet が
`retired` になったら閉じ、継続チャットや参加者台帳として再利用しない。

### Bridge

Lounge で交換された 1 つ以上の確認済みの手掛かりから導ける、人間同士が口頭会話を
始めるための具体的な理由です。
各参加者に提示できる主要 Bridge は最大 1 つであり、人物評価、順位、相性点数、連絡先ではありません。

### Owner Question

Bridge の判定に不可欠な情報だけが不明な場合に、Pet が自分の Owner へ行える単一の確認質問です。
1 回の Lounge 参加につき最大 1 問で、追加質問、他の参加者への質問、人物検索の代替にはしない。

### `no-signal`

ある参加者について確認済みの手掛かりが Bridge を提示できる強さに達しないとき、その Owner の
Pet が返す参加者単位の正常な結果です。無関係、不適合、低評価を意味せず、Pet は推測や
穴埋めをせずに自分の Lounge 参加を終了する。

### `retired`

Pet が現在の Lounge で役割を終えた終端状態です。Bridge の表示直後、または
`no-signal` の確定後に入り、その Lounge では追加説明、再判定、継続チャット、会話代行を行わない。

### 境界を守る補助語

確認済みの手掛かりとは、Passport で Owner が公開を許可した情報、または Owner Question への
明示的な回答として出所を識別でき、Owner が当該 Lounge での利用を許可した手掛かりです。
内容の客観的真実や本人性を保証する語ではありません。

参加者とは、現在の Lounge に Pet を同伴している Owner を指す。主要 Bridge の上限は、
この参加者単位で数える。

## English

### Passport

Data that packages a small number of clues an Owner permits to be disclosed for an event so that a Pet can
carry them. It is not a central account, contact registry, complete profile, or identity-verification credential.

### Pet

A software companion that accompanies an Owner to an event and exchanges confirmed clues in a Lounge.
With sufficient evidence, it presents its Owner with at most one primary Bridge. With weak evidence, it
returns `no-signal` to its own Owner. It then enters `retired` for that Lounge. It does not speak on behalf
of the humans.

### Owner

The human participant who brings a Pet to an event and decides which clues the Passport may disclose. The
Owner decides whether to answer an Owner Question, whether that answer may be used as a clue in that Lounge,
and becomes the agent of the conversation after a Bridge.

### Lounge

A disposable communication space in which Pets that meet on site exchange confirmed clues for that encounter
and determine a Bridge or `no-signal` for each participant. It does not require a central server, closes when
every Pet has entered `retired`, and is not reused as persistent chat or a participant registry.

### Bridge

A concrete reason, grounded in one or more confirmed clues exchanged in the Lounge, for humans to begin a
spoken conversation. Each participant may receive at most one primary Bridge. It is not a person evaluation,
ranking, compatibility score, or contact detail.

### Owner Question

The single clarification question a Pet may ask its own Owner when the only missing information is essential
to evaluating a Bridge. A Pet may ask at most one during one Lounge participation, with no follow-up question,
question to another participant, or substitution for people search.

### `no-signal`

The normal participant-level outcome returned by an Owner's Pet when confirmed clues for that participant are
not strong enough to support a Bridge. It does not mean irrelevance, incompatibility, or a low rating. The Pet
ends its own Lounge participation without guessing or filling gaps.

### `retired`

The terminal state in which a Pet has completed its role in the current Lounge. It enters this state
immediately after displaying a Bridge or after confirming `no-signal`, and performs no additional explanation,
re-evaluation, persistent chat, or conversation proxying in that Lounge.

### Supporting boundary terms

A confirmed clue is a clue whose source is identifiable as information the Owner permitted in the Passport
or an explicit answer to an Owner Question, and whose use in that Lounge the Owner permitted. The term does
not guarantee objective truth or identity.

A participant is an Owner accompanied by a Pet in the current Lounge. The primary Bridge limit is counted
per such participant.

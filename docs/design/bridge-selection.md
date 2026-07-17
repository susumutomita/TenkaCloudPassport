# 根拠付き Bridge 選定アルゴリズムの設計

本書は Issue 12 の設計を定める。Rules Provider が単一の共有手掛かりから 1 種類の Bridge
しか導けなかった判定を、2〜6 名の参加者へ一般化し、確認済みの共通点または相互補完から
「今すぐ話せる理由」を参加者ごとに最大 1 つだけ、根拠を Trace できる形で導く。用語は
[用語集](../product/glossary.md)、Owner Question を経由する 2 者間 bounded protocol は
[Pet の短時間・制限付き交流 State Machine の設計](./pet-interaction-protocol.md) と
[Owner Question の段階的開示・Consent Flow の設計](./owner-question-consent-flow.md) を
正本とする。本書はこれらを **拡張** する差分であり、`PetInteractionState` /
`reducePetInteraction` という既存の状態機械を重複実装しない。

## 目的と対象範囲

大量の弱い推薦ではなく、確認済みの共通点または相互補完から今すぐ話せる理由を 1 つ提示する。
根拠がなければ捏造せず `no-signal` を返す。対象は新規モジュール
`src/domain/bridge-selection.ts`（Evidence 計算 + Fairness を伴う Bridge 選定）であり、
2 者間の既存 Live 経路（`src/domain/rules-provider.ts` /
`src/domain/interaction-discovery-provider.ts`）はこの一般化されたロジックへ配線する。
3〜6 名の経路は本書のドメインテストで検証し、実際の Live 配線は M3（Issue 24）で行う。

## Bridge Contract

| 要素 | 説明 |
| --- | --- |
| 誰と話すか | `SelectedBridge.participantIds`（自分自身を含む Bridge の全員）。 |
| 確認済みの理由 | `SelectedBridge.reason`（使用した Evidence だけから構成した日本語文）。 |
| 最初の一言 | `SelectedBridge.opener`（先頭の Evidence から導いた 1 文）。 |
| 使用した Evidence ID | `SelectedBridge.evidenceIds`（下記の Evidence が持つ `evidenceId` の配列）。 |
| Confidence | `SelectedBridge.confidence`（`promising \| possible` の定性値。数値の人物 Score は持たない）。 |

`reason` と `opener` は `evidenceIds` に挙げた Evidence の内容（カタログの `label` /
`LanguageCode` の表示名）だけから組み立てる。参加者の自由記述（Owner Alias 等）は一切
参照しない。UI（`OutcomeScreen.tsx`）はこの `reason` に相当する `message` を表示するだけで、
数値の Score や順位を表示しない。

## Evidence の 3 種別

Evidence は版管理済みカタログ ID（`ClueId` / `LanguageCode`、いずれも
`src/domain/clue-catalog.ts`）だけを比較の鍵にする。表示ラベルや Owner Alias のような
自由記述・表記揺れが混入する余地はない。

| 種別 | 判定 | Evidence ID の形 |
| --- | --- | --- |
| `shared-topic`（Topic 共通） | 2 者が同じ `ClueId` を確認済み手掛かりとして持つ。既存の `findFirstSharedConfirmedClue`（`shared-clue-match.ts`）をそのまま再利用し、カタログ順で最初の 1 件だけを採用する。 | `topic:<clueId>:<loId>:<hiId>` |
| `offer-need-complement`（Offer/Need 相互補完） | 一方が `offers` で公開した `ClueId` と、もう一方が `lookingFor` で公開した `ClueId` が同じ `category`（activity / skill 等）を持つ。双方向（a が提供・b が探す、b が提供・a が探す）を独立に調べ、最大 2 件になる。 | `complement:<category>:<offerId>:<offerClueId>:<seekId>:<seekClueId>` |
| `shared-language`（共通 Language） | 2 者が同じ `LanguageCode` を公開している。カタログ順で最初の 1 件だけを採用する。 | `language:<languageCode>:<loId>:<hiId>` |

`<loId>` / `<hiId>` は 2 者の Participant ID を辞書順で正規化した組（`bridgePairKey` と
同じ規則）。同じ 2 者・同じ内容の Evidence は、入力の呼び出し順序に関わらず常に同じ
Evidence ID になる。

## Confidence（`promising | possible`）

数値の人物 Score は一切扱わない。Evidence の種別・件数だけから次の規則で導く。

- Evidence が 2 件以上 → `promising`。
- Evidence が 1 件だけの場合、双方が今すぐ動ける具体的な理由になる
  `offer-need-complement` だけを `promising` とし、`shared-topic` /
  `shared-language` 単独は `possible` とする。

Offer/Need 相互補完は「一方が提供でき、もう一方がまさにそれを探している」という
双方が動ける具体的な理由であるため、単独でも `promising` とする。Topic 共通や
共通 Language 単独は「話すきっかけにはなるが、会話が発展する保証はない」弱い根拠のため
`possible` に留める。

## Fairness Rule と Tie-break

- **各参加者は主要 Bridge に最大 1 回だけ登場する。** Pair 候補を Confidence（`promising`
  優先）→ Evidence 件数（多い方優先）→ 正規化した参加者 ID の辞書順、の順で決定的に
  ソートし、欲張り法（Greedy）で先頭から確定させる。どちらかの参加者が既に確定していれば
  その候補は Skip する。
- **2〜6 名では Pair を優先する。** 3 人 Bridge は、この欲張り法で Pair を組んだ後に
  ちょうど 1 名だけ残った場合にだけ検討する（詳細は次節）。
- **奇数人数では全員に意味がある場合だけ 3 人 Bridge を許す。** 残った 1 名が、既に確定した
  Pair のどちらか一方と Evidence で繋がっている場合だけ、その Pair を 3 人 Bridge へ
  昇格させる。繋がりがなければ、その 1 名は `no-signal` のままになる（Pair 自体はそのまま
  2 人 Bridge として残る）。
- **Input 順序を変えても、同じ Evidence 集合なら恣意的に特定参加者だけを優遇しない。**
  Tie-break の鍵は参加者の入力配列上の位置に一切依存せず、参加者 ID 文字列そのものと
  Evidence の内容だけで決まる。同じ参加者集合を異なる順序で渡しても、内部でのソート・
  欲張り割当て・最終的な参加者 ID 昇順ソートにより、返り値は常に同じになる。

### 3 人 Bridge のアルゴリズム（欲張り法 + 1 名統合）

1. 全参加者の unordered pair ごとに Evidence を計算し、Evidence が 1 件もない組・
   Owner Rejection で除外された組を候補から外す。
2. 残った候補を Confidence → Evidence 件数 → 正規化 ID の辞書順でソートする。
3. 先頭から順に、両者がまだ未確定なら Pair として確定させる（欲張り法）。
4. 全員が確定 or 候補が尽きた後、未確定の参加者がちょうど 1 名だけ残っていれば、
   確定済みの Pair を（元のソート順で）順に調べ、その 1 名と Evidence で繋がる
  （かつ Owner Rejection で除外されていない）最初の Pair を 3 人 Bridge へ昇格させる。
5. 繋がる Pair が見つからなければ、その 1 名は `no-signal` のままになる。

未確定の参加者が 2 名以上残る場合（Evidence 不足で Pair を組み切れなかった場合）は、
3 人 Bridge を探索せず、それぞれ `no-signal` にする。過剰な組合せ探索よりも安全側の
`no-signal` を優先するという設計判断であり、次節の代替案で理由を述べる。

### 3 人 Bridge の Evidence 去重

3 人 Bridge は X-Y、lonely-X、lonely-Y という 3 つの辺それぞれで独立に Evidence を計算し
結合する。3 人全員が同じ確認済み手掛かり・同じ Language を持つ場合、3 つの辺すべてが
同じ 1 つの事実を検出してしまう。去重せずに結合すると、同じ事実が Evidence 件数を
水増しして Confidence を実際より強く見せ、`reason` にも同じ文が複数回並んでしまう。

これを防ぐため、結合した Evidence は「事実の内容」を鍵に去重する。`shared-topic` は
`ClueId` だけ、`shared-language` は `LanguageCode` だけを鍵にする（どの辺で見つかったかは
無視する）。去重後に残す 1 件の Evidence ID は、元の 1 辺（2 名）だけを指す ID ではなく、
Bridge の全参加者を対象にした ID へ再構成する（例:
`topic:<clueId>:<参加者 ID を昇順で結合した文字列>`）。`offer-need-complement` は
Offerer・Seeker が常に特定の 2 名に固定されるため、辺をまたいで同じ事実が重複することは
構造上起こらず、Participant ID を鍵に含めても実質的な去重は起きない。

## Owner Rejection の除外集合

`selectBridges` は `excludedPairs?: ReadonlySet<string>`（`bridgePairKey(a, b)` で
正規化した文字列の集合）を受け取る。候補構築の最初の段階で、除外された組は Evidence の
強さに関わらず候補から外れる。3 人 Bridge への統合でも、統合しようとしている 1 名と
Pair の双方について除外判定を行うため、除外された 2 名が同じ Bridge へ間接的に
含まれることもない。

この Exclusion Set は「Owner が過去に相手を拒否した」という事実を表す入力であり、
どこに永続化するかは呼び出し側の責務とする。2 者間の現行 Live 経路（1 Lounge に
参加者は Owner と相手の 2 名だけ）では「拒否できる相手の候補」自体がまだ存在しないため、
UI 配線は行わず、M3 の複数参加者 Lounge・結果画面で使う Seam として本関数の引数に
留める（Known follow-ups 参照）。

## 2 者間 Live 経路との境界

`rules-provider.ts`（`RULES_PROVIDER.decide`）と `interaction-discovery-provider.ts`
（`RULES_INTERACTION_PROVIDER.discover`）は、この一般化された判定へ配線する。

- **Topic 共通を最優先**する（既存 Issue 4 以来の判定と後方互換を保つ）。
- Topic 共通が無い場合だけ **Offer/Need 相互補完** を調べ、見つかれば新しい
  `createComplementBridge`（`bridge.ts`）で Bridge を組み立てる。Owner Question を
  経由する経路（`interaction-discovery-provider.ts`）では、相互補完の 2 手掛かりの
  うち Owner 自身の側だけを候補にする（Owner Question は常に Owner 自身の情報について
  尋ねるため）。
- **共通 Language だけの Evidence は、2 者間 Live 経路の Bridge の根拠にしない。**
  `MatchEvidence.clues`（Wire 型、`match-evidence.ts`）は `ConfirmedClue` の配列であり、
  `LanguageCode` を運べない。この Wire 型を拡張するのは Issue 12 の本来の目的（選定
  アルゴリズムの一般化）に対して不釣り合いに大きい変更になるため、2 者間 Live 経路では
  Topic 共通・Offer/Need 相互補完だけを使い、共通 Language は `selectBridges` を直接使う
  3〜6 名の経路（M3）でだけ根拠にする。

`src/protocol/schema.ts` の `Bridge.messageKey` は、この変更に合わせて
`'shared-clue' | 'offer-need-complement'` の 2 値を受理するよう拡張した（`AgentDecision`
経由で将来 Local Agent の出力を検証する境界であり、2 者間 Live 経路の内部表現とは独立に
維持する）。`messageKey` と手掛かりの件数（2 件）だけを見ると、無関係な 2 件の手掛かり
（例: 両方とも topics）を「相互補完した」と偽って主張できてしまうため、`parseBridge` は
`firstOfferNeedMatch`（`bridge-selection.ts`）と同じ意味論を強制する。1 件目の手掛かりが
`offers`、2 件目が `lookingFor` で、両者の `category` が一致することを検証してから
`createComplementBridge` を呼ぶ。この検証に落ちる入力（例: 両方 `topics`、または
`category` が不一致）は `INVALID_VALUE` で拒否する。

## 代替案

### 3 人 Bridge を組合せ最適化（全探索）で決める案

奇数人数の残り 1 名を、既存 Pair への統合だけでなく、未確定の 3 名以上からも独立した
Triple を全探索で選ぶ案を検討した。5 名で Pair が 1 組しか成立せず 3 名が丸ごと残る
ような稀なケースまで正しく扱えるが、実装と 100％ カバレッジの両方のコストが
不釣り合いに大きい。「根拠が弱ければ `no-signal` を返し、捏造しない」という製品原則
（`docs/product/glossary.md` の `no-signal`）に照らすと、Evidence が薄い残り 3 名以上の
状況では安全側の `no-signal` を優先しても製品体験を損なわない。欲張り法 + 1 名統合という
単純な設計を採用し、この限界を本書に明記する。

### Confidence に第 3 段階（`unlikely` 等）を設ける案

`promising` / `possible` の 2 段階では表現力が不足するという意見も検討したが、
受け入れ条件が明示するのはこの 2 値だけであり、段階を増やすほど「弱い推薦を大量に出す」
という Issue 12 が禁じる振る舞いに近づく。Evidence が閾値未満（0 件）であれば
そもそも Bridge を作らず `no-signal` にするため、2 段階で十分と判断した。

### Evidence ID にカタログの表示ラベルを含める案

Evidence ID を人間可読にするため `clueById(id).label` を含める案も検討したが、
カタログの表示ラベルは将来のローカライズや文言修正で変わりうる。Evidence ID は
Trace 可能性のための安定した鍵であるべきなので、版管理された `ClueId` /
`LanguageCode` と Participant ID だけで構成し、表示ラベルは `reason` / `opener` の
生成時にだけ参照する。

## エッジケース

- Evidence が 1 件もない participant は必ず `no-signal` になる。捏造した共通点は作らない。
- 同じ `category` でも `ClueId` が異なれば Topic 共通の Evidence にはならない（カタログ
  ID 単位の一致判定）。表記揺れや Owner Alias の内容は一切比較に使わない。
- 空の `languages` を持つ参加者同士は Topic Evidence だけで判定され、共通 Language の
  Evidence は発生しない。
- 参加者 ID の重複、参加者数が 2 未満・6 超過はいずれも `BridgeSelectionError`
 （型付きエラー）になる。
- Bridge が確定した直後、その参加者は Lounge 本体の `retired` へ収束し
 （既存の `lounge.ts` / `pet-interaction.ts` の終端状態）、この選定アルゴリズムを含む
  どの経路からも再判定しない。
- Owner が拒否した組合せは、その 2 名が直接の Pair になることはもちろん、3 人 Bridge の
  一員として一緒に含まれることもない。

## 人間検証

複数参加者（3〜6 名）の Bridge Selection が実際の Battle/Challenge 会場の体感として
「妥当な相手を選んでいる」かどうかは、M3 の実配線後にまとめて人間検証する。機械テストは、
本書の Evidence 計算・Confidence 規則・Fairness の Tie-break・Order-independence・
Owner Rejection・境界値・決定性を対象にする。

## Known follow-ups

- M3（Issue 24）で 3〜6 名の Lounge へ `selectBridges` を実配線する。
- Owner Rejection の Exclusion Set を実際に永続化し、結果画面から「この相手とは今後
  Bridge を作らない」を選べる UI を追加する（本書の `excludedPairs` はこの Seam）。
- 共通 Language を 2 者間 Live 経路でも根拠にするかどうかは、`MatchEvidence` /
  `PeerEnvelope` の Wire 型を拡張する Issue で改めて判断する。
- 5 名で Pair が 1 組しか成立しない等、未確定の参加者が 2 名以上残る場合の 3 人 Bridge
  探索は行わない設計判断（前述の代替案）を、実際の利用状況を見て再検討するかどうか。

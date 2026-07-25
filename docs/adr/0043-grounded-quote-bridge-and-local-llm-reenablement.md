# ADR-0043: 会話エージェントに自己紹介の自由記述を渡し、検証可能な引用に限ってモデルの発見を表示する

- **Status**: Accepted
- **Date**: 2026-07-25
- **Deciders**: Susumu Tomita (@susumutomita)

## Context

会話エージェントの「共通点」は、実際にはカタログ checkbox（`IntroCard.themeIds`、最大 3 件）の共通集合そのものだった。owner の指摘どおり、ローカル LLM をダウンロードしても結果は変わらない。原因は 1 か所ではなく 3 層すべてにある。

1. 入力層: `introCardToConversationPassport` が `themeIds` だけを投影し、`selfIntro`（最大 300 文字）・`title`・`organization` を捨てていた。モデルが動いても読む材料が checkbox しか無い。
2. 契約層: `validateAgentModelProviderOutput` が、モデルの出力を `buildEncounterEvidence`（Rules が導出する Evidence）の部分集合に制限していた。表示文も固定テンプレートで、モデルにできるのは「Rules が既に見つけた共通点のどれを使うか選ぶ」ことだけだった。
3. 合成層: [ADR-0038](./0038-v1-disable-on-device-llm-for-consumers.md) が `createNativeAgentModelProvider` と `configureProvider` を Rules 固定にしていた。

1 と 2 は [Issue 104](https://github.com/susumutomita/TenkaCloudPassport/issues/104) の受入基準「Provider へ渡すのは匿名化したカタログ ID だけで、氏名・連絡先・URL・自己紹介自由文は渡さない」を忠実に実装した結果である。この線引きは Provider が将来クラウドになる可能性まで含めた保守的な設計だった。

## Decision

### 自己紹介の自由記述を、端末内モデルに限って入力に含める

`buildConversationAgentModelInput` が `introCardProfileText`（`title` / `organization` / `selfIntro` を連結した 1 人分のテキスト）を組み立て、両者分が揃ったときだけ `AgentModelInput` へ載せる。氏名・メール・電話・リンクは共通点の根拠に要らないため含めない。

Privacy 上の判断はこうである。モデルは端末内で動き、相手のカードは既にその端末のメモリにあって画面にも表示されている。ローカル LLM へ渡しても新しく外へ出るものは無い。守るべきなのは契約レベルの線引きではなく、プロンプトをディスク・ログ・クラッシュレポートへ残さないという実装上の性質であり、これは既存の Safety Boundary（`model-safety-boundary.ts`）がそのまま担う。Issue 104 の当該受入基準は、この ADR が「端末内モデルに限る」条件付きで supersede する。

### モデルには文章を書かせず、根拠になった箇所を引用させる

出力契約に `grounded-bridge`（`ownerQuote` / `peerQuote`）を追加する。モデルは自分の言葉を書けず、両者の自己紹介文から根拠になった箇所をそのまま抜き出すことだけができる。`verifyGroundedQuoteBridge`（`src/domain/grounded-quote-bridge.ts`）が、各引用が対応する入力文の部分文字列であることを照合し、外れたものは表示せず型付き失敗にして Rules へ倒す。

表示文は既存の `evidenceNarrative` と同じく固定テンプレートで、可変部は検証済みの断片だけである。モデルの生成文は画面にも Log にも現れない。

この形を選んだのは、幻覚を後段の検査で「なるべく」防ぐのではなく、構造的に不可能にするためである。表示される断片は必ず本人が書いた文そのものであり、モデルの仕事は「どの断片とどの断片が同じ話題か」という意味的な判断だけになる。「低山を歩く」と「アウトドアが好き」を結び付けるのがまさに checkbox 一致では届かない部分であり、そこだけをモデルに任せる。

引用には追加の制限を置く。1 件 40 文字以内（自己紹介文の丸ごと転記を防ぐ）、制御文字を含まない、メールアドレス・URL・7 桁以上の連続した数字を含まない（連絡先はカードの該当欄が持つべき情報で、共通点の根拠として別の場所へ再掲する理由が無い）。

### 会話エージェントに限ってローカル LLM を再有効化する

`createNativeAgentModelProvider` を ADR-0038 以前の形（Expo Go は Rules、Development Build は設定済み Local Model）へ戻し、`configureProvider` も manifest の active な Model を使う形へ戻す。`PassportApp.tsx` が会話エージェントへ渡す Provider を `localModels.provider` に戻す。

Pet Interaction（Lounge）は Rules 固定のまま残す。Lounge が共有するのは匿名の `PublicPassport` だけで自由記述が無く、モデルに読む材料が無いため、実行経路を増やす利益が無い。

ADR-0038 が記録した 2 件の実機不具合のうち、ダウンロードが 100 パーセントで固まる件は PR 140 で foreground session へ変更する修正が入っている（その翌コミットでまとめて無効化されたため実機確認は取れていない）。未完了ダウンロード時の native crash については、`manifest.models` へ載るのは sha256 と GGUF metadata の検証を通った Model だけであり、途中で終わった File はそこまで来ない。実行時の Load Error は `runProviderOnce` の Fallback-once が Rules へ倒す。

## 選択肢

1. **モデルに自由に文章を書かせ、出力 Validator で弾く（不採用）**: 長さ・文字種・連絡先混入は検査できるが、「その共通点が本当に両者の文に書いてあるか」は検査できない。目の前にいる実在の人物について嘘を出す事故を、仕組みとして防げない。
2. **キーワード一致を Rules に足す（不採用）**: 実機もモデルも要らず最も軽いが、表記が違えば拾えない。「登山」と「アウトドア」を結び付けられないなら、checkbox 一致の粒度を少し細かくしただけで、owner の指摘は解消しない。
3. **引用による根拠提示（採用）**: 1 の表現力（意味的な結び付け）と、既存契約の安全性（表示は検証済みの素材だけ）を両立する。

## Consequences

- **Good**: checkbox の一致が 1 件も無いペアでも、自己紹介文が重なっていれば共通点を提示できる。エージェントが実際に寄与する部分が生まれた。
- **Good**: 表示される断片が入力文の部分文字列であることを機械的に照合するため、幻覚が構造的に起きない。照合に失敗した出力は表示せず Rules へ倒れる。
- **Good**: Model を持たない端末・Expo Go・Web は従来どおり Rules で動き、挙動は変わらない。
- **Bad**: Settings のオンデバイス AI 有効化 UI は ADR-0038 で除去したままである。したがって現時点で端末内モデルを使えるのは、`EXPO_PUBLIC_LOCAL_MODEL_PATH` を設定した Development Build か、過去のビルドで Model を有効化済みの端末に限られる。消費者導線の復元は別の変更として扱う。
- **Bad**: ADR-0038 が記録した native crash の再現条件を実機で確認できていない。Fallback-once は JS 側の型付き失敗しか捕まえられず、native crash は防げない。
- **Tradeoff**: 引用は「両者の文に書いてある」ことしか保証しない。モデルが無関係な 2 文を結び付けた場合、表示される断片は本物でも、共通点としては的外れになりうる。的外れの度合いは表示前に検査できないため、`confidence` を `possible` に留め、Owner が明示同意した手掛かりや Offer/Need の相互補完より弱い根拠として扱う。

## References

- 関連コード: `src/domain/grounded-quote-bridge.ts`、`src/domain/agent-model-provider.ts`、`src/domain/conversation-agent-evidence.ts`、`src/local-agent/model-safety-boundary.ts`、`src/app/native-agent-model-provider-composition.ts`、`src/app/use-local-model-management.ts`
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/147 、 https://github.com/susumutomita/TenkaCloudPassport/issues/104
- 関連 ADR: [ADR-0036](./0036-on-device-conversation-agent.md)、[ADR-0038](./0038-v1-disable-on-device-llm-for-consumers.md)（本 ADR が Provider 固定の判断を supersede する）、[ADR-0041](./0041-conversation-agent-step-b-n-party.md)
- 関連設計: [`docs/design/agent-model-provider-contract.md`](../design/agent-model-provider-contract.md)、[`docs/design/model-safety-boundary.md`](../design/model-safety-boundary.md)

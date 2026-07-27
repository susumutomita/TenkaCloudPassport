# ADR-0049: Bridge の後に、明示ラベル付きの短い端末内 AI 会話例を任意生成する

- **Status**: Accepted
- **Date**: 2026-07-26
- **Deciders**: Susumu Tomita (@susumutomita)

## Context

[ADR-0043](./0043-grounded-quote-bridge-and-local-llm-reenablement.md) は、モデルが Bridge の
事実を創作しないよう、表示できる可変部分を自己紹介文の検証済み引用へ制限した。この契約で
「なぜ話せそうか」は説明できるが、利用者がその共通点を実際の最初の往復へ変えるところには
まだ距離がある。

Issue 155 は、Bridge と最初の質問が確定した後に、LINE のような短い会話例を端末内モデルで
任意生成することを求める。一方、会話例は引用ではなくモデル自身の文章である。ADR-0043 の
「モデルが書いた文章を表示しない」という安全境界を、そのまま維持したままでは実現できない。

必要なのは、Bridge の事実性を守る既存契約と、明示的に仮想例として扱う新しい表示面を混同せず、
後者だけに bounded generation と誤認防止の境界を設けることである。

## Decision

### 1. Bridge と会話例を別の信頼レベルとして扱う

Bridge の共通点・根拠・最初の質問は、ADR-0043 の既存契約を維持する。モデルが自由に書いた文を
Bridge の事実として昇格させない。

会話例は Bridge の下にある独立した optional Section とし、利用者がボタンを押したときだけ生成する。
Section が存在する全状態で、次の Disclosure を閉じられない形で先に表示する。

> AI が作った会話の例です。実際のやり取りではありません。

この決定は ADR-0043 の「Bridge 表示文は固定 Template と検証済み引用だけ」という判断を変更しない。
「モデル由来の自由文をどの画面にも表示しない」という広い記述だけを、明示ラベル付き会話例に限って
部分的に supersede する。

### 2. Local primary Provider だけに capability を登録する

会話例 Generator は `AgentModelProvider` の optional method にせず、Native Composition Root が
Local Provider identity と Generator を `WeakMap` で結び付ける。Rules Provider へ登録しようとした
場合は拒否する。

UI は Provider kind の文字列だけで判断せず、Generator capability が取得でき、Local Provider の
Primary 実行で 2 者 Bridge が確定した場合だけ Section を用意する。Rules、Expo Go、Web、Model 未導入、
Fallback、3 人以上の Rules Bridge では何も表示しない。

### 3. 名前を Prompt へ渡さず、Strict Schema を全件検証する

Prompt 入力型は Bridge reason / opener、任意の両者 Profile text、language だけを持つ。氏名、メール、
電話番号、リンクの Field を持たない。相手名は検証済み Turn の UI label にだけ使う。

出力は `turns` だけを持つ Object に固定する。2〜6 Turn、owner 開始、厳密な交互、1〜80 文字、単一行、
追加 Field なしとする。制御文字、Default Ignorable、メール、URL、電話番号らしい文字列を拒否する。
一部だけを救済せず、Object 全体が検証を通った後にだけ表示する。

### 4. Existing Native Context lifecycle を再利用する

会話例は既存 `createLlamaCompletionPort` を通り、Context の初期化、execution lease、Cancel、release、
quarantine、内容を持たない Benchmark を共有する。Request 単位で `n_predict = 512`、
`temperature = 0.7` を指定し、`n_ctx` と Model configuration は既存値を使う。

60 秒で Abort し、Cancel 後の遅延 Output は世代 Key で破棄する。次の生成は前回 Promise の settlement
後にだけ開始し、Native Context を重ねない。表示は token streaming ではなく、完全検証後に 300ms
間隔で Turn を順次見せる。

### 5. 非永続・非共有の v1 では専用 Report / Flag を追加しない

会話例は端末内で明示生成され、Owner の画面にだけ短時間表示される。保存、履歴、共有、Export、
Community、Cloud inference、Telemetry を持たない。常時 Disclosure、Cancel、Retry、Regenerate があり、
不正な構造や連絡先を fail-closed で捨てる。

この限定された v1 では専用 Report / Flag UI を追加しない。保存・共有・Cloud・公開 UGC・任意長生成・
Tool 実行・Sensitive topic のいずれかを追加するときは、この判断を同じ変更で再審査する。

## 選択肢

1. **会話例を固定 Template だけで組み立てる（不採用）**: 安全だが、モデルを入れた価値が薄く、
   文脈に応じた自然な往復にならない。
2. **Bridge 自体をモデルの自由文へ置き換える（不採用）**: 仮想例と事実の境界が消え、実在人物に
   ついての創作を共通点として表示しうる。
3. **Rules / Web でも疑似生成する（不採用）**: Availability の意味が曖昧になり、端末内 AI としての
   説明が事実でなくなる。
4. **完全検証後の独立した任意 Section（採用）**: Bridge の根拠契約を保ったまま、会話への移行を
   助けられる。生成文の残余リスクは Disclosure、bounded schema、非永続、非共有で限定する。
5. **v1 から Report / Moderation Backend を追加する（不採用）**: private・transient・on-device の
   出力を送信するための Backend を新設すると、問題より大きい Privacy 面と運用面を作る。

## Consequences

- **Good**: 共通点を読んだ後に「何と言えばよいか」を、追加操作 1 回で具体化できる。
- **Good**: Bridge は既存の検証済み結果として常に残り、生成失敗で主機能が壊れない。
- **Good**: Rules / Web / Model 未導入端末の挙動と公開範囲は変わらない。
- **Good**: Prompt、Output、表示結果を保存・送信せず、端末内 inference の境界を維持する。
- **Bad**: Strict Schema は文章の意味的妥当性を証明しない。入力に反しないが不自然な会話例は
  生成されうる。
- **Bad**: 端末性能と Model により生成時間・品質が変わる。60 秒 Timeout と Cancel を必要とする。
- **Tradeoff**: token 単位の streaming を行わないため最初の表示は遅くなるが、未検証の一部出力を
  画面へ漏らさない保証を優先する。
- **Operational**: App Store Review Notes と Privacy データ台帳は、モデル由来の自由文が存在しない
  という旧記述から、明示ラベル付き・端末内・非永続の会話例がある事実へ更新する。

## References

- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/155
- 詳細設計: [端末内 AI 会話例の設計](../design/2026-07-26-conversation-example.md)
- Privacy: [Privacy データ台帳](../privacy/data-inventory.md)
- 関連 ADR: [ADR-0036](./0036-on-device-conversation-agent.md)、
  [ADR-0041](./0041-conversation-agent-step-b-n-party.md)、
  [ADR-0043](./0043-grounded-quote-bridge-and-local-llm-reenablement.md)、
  [ADR-0046](./0046-trusted-model-finalize-phase-survives-navigation.md)

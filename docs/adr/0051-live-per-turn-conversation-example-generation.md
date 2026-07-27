# ADR-0051: 会話例をターン毎ライブ生成にし、Native Context を会話 1 回で 1 度だけ再利用する

- **Status**: Accepted
- **Date**: 2026-07-27

## Context

[ADR-0050](./0050-agent-to-agent-icebreaker-dialogue.md) までの実装は、AI 同士の会話例（4 ターン）を
単発 completion で一括生成し、検証後に 300ms 間隔で吹き出しを順次表示していた。owner フィードバック
「会話が進んでいくのが面白いのに生成はつまらん」のとおり、生成中は「端末内で AI 同士が会話しています…
11 秒」という退屈な待ち表示だけが出て、進行感という面白さの核が体験から失われていた。

さらに owner が実機（Development Build）で実際の生成を観測したところ、4 ターンのうち 3 ターン目が
1 ターン目と完全に同一の文を返し、会話が transcript の上に積み上がらず繰り返しループする不具合が
見つかった。単発 completion 時代には無かった、ターン毎生成に特有の新しいリスクである。

## Decision

1. **ターン毎生成**: 単発 completion（全ターン一括）をやめ、これまでの transcript（確定済みターン列）を
   untrusted data として与え、次の 1 ターンだけ（speaker は交互スケジュールから決定的に決まるため
   `text` のみ、80 文字以内・単一行）を返させる completion を 4 回（`CONVERSATION_EXAMPLE_DEFAULT_TURNS`）
   繰り返す。各ターンの nPredict は 512 から 128 へ縮小する（80 文字 1 行分で十分なため）。
2. **ターン単位 Content Guard + 反復拒否 Guard**: 各ターンは既存の共有 `text-content-guards`
   （80 文字・単一行・連絡先禁止）に加え、**trim 後の完全一致を話者を問わず transcript 全体に対して
   検査する Guard** をターン単位で fail-closed 適用する（`parseConversationExampleTurn` の
   `assertNotRepeatingTranscript`）。owner が実機で観測した「3 ターン目が 1 ターン目の完全反復」を
   構造的に検出し、そのターンで会話を終了する。プロンプト本文にも「transcript のどのターンとも
   同じ・ほぼ同じ発話を繰り返さない」「直前の相手の発話に必ず応答してから展開する」を明示する。
3. **確定済みターンを残す状態機械**: `generating` 状態が「確定済み turns + 生成中の次話者」を持ち、
   ターン確定ごとに publish する（吹き出しが 1 つずつ増える）。途中失敗・途中キャンセル・60 秒
   タイムアウト・ターン単位 Guard 違反のいずれでも、1 件以上確定済みなら `ended-early` 状態へ移り
   確定済みターンを残す（全捨てしない）。0 件のまま終わった場合だけ、従来どおり `failed`（キャンセルは
   `available`）にする。300ms の人工的な順次表示 Timer は、ターン毎生成の completion 待ち時間自体が
   進行感を作るため廃止する。
4. **Native Context を会話 1 回につき 1 度だけ再利用**: `llama-agent-model-provider.ts` に
   `beginConversationExampleSession` を追加し、Context・execution lease を 1 度だけ確保して
   `completeTurn` で全ターン再利用し、`close` で 1 度だけ解放する。Bridge 側の
   `executeLlamaProvider`（1 回の completion で init/release が完結する既存契約）はそのまま維持し、
   `completeContext` / `captureCompletion`（Cancel・chat template 痕跡除去・Benchmark 計測）を両経路で
   共有する。

## 選択肢

1. **単発 completion のまま演出だけ追加（不採用）**: 見かけ上のアニメーションでは owner の要求（実際に
   生成が進んでいく）に応えられない。
2. **ターン毎に Context を都度 init/release（不採用）**: モデルロードが 4 回走り、体感速度が大きく悪化する。
3. **ターン毎生成 + Context 1 度だけ再利用（採用）**: 生成の実時間そのものが進行感の演出になり、
   モデルロードは 1 回で済む。

## Consequences

- **Good**: 生成の実時間そのものが進行感になり、owner フィードバックの核（「進んでいく面白さ」）に応える。
- **Good**: 途中失敗・キャンセル・タイムアウトでも、それまでの会話が消えない。
- **Good**: 実機で観測された「完全反復ループ」を、話者を問わない transcript 全体との完全一致検査で
  構造的に検出し、無限に同じ文を繰り返す劣化を防ぐ。
- **Good**（レビュー指摘の修正）: 最終ターン確定から Native Context 解放（`session.close()`）完了までの
  間、存在しない次の話者の typing indicator を出さない（生成側が `onTurn` へ渡す `isFinalTurn` で判定）。
  Cancel だけでなく 60 秒 Timeout も同じ判定を共有する（片方だけに入れると、もう片方が同じ不具合を
  再発するため）。同じ待ち時間中に Cancel・Timeout が発火しても、会話は実際には最後まで確定済みで
  何も失っていないため、`ended-early`（「途中で終了した」文言）ではなく `shown` として扱う。一方、
  `generate()` の Promise が実際に失敗で reject した場合（例: `session.close()` 自体の失敗）は、
  全ターン確定済みでも `ended-early`/`failed` のままにする（Native 失敗が実際に起きたことを示すのは
  妥当なため）。
- **Good**（レビュー指摘の修正）: `beginConversationExampleSession` の Benchmark outcome
  （success / cancelled / failed）は、`context.release()` 自体の成否だけでなく、途中ターンの **Native
  completion 自体**の失敗・Cancel も反映する。`executeLlamaProvider` と同じ判定方法に揃え、Context
  解放自体は成功したが Native completion（推論そのもの）が失敗・Cancel だった場合に誤って `success`
  と記録しないようにした。あわせて `markCompletion`（first-write-wins）をターン毎ではなく全ターン
  成功が確定する `close()` 側でだけ呼ぶよう修正し、`completionDurationMs` が「1 ターン目の完了時刻」
  ではなく「会話全体の完了時刻」を指すようにした。なお、ターン単位 Content Guard 違反
  （`parseConversationExampleTurn` の反復拒否 Guard を含む）は Native completion 自体は成功している
  ため、この outcome には反映しない、と意図的にスコープ外にしている（`beginConversationExampleSession`
  のコード comment 参照）。この境界を広げるかは follow-up として別途検討する。
- **Tradeoff**: `LocalModelContextLeaseRegistry` の `model-context` lease を、会話全体（既存の 60 秒
  タイムアウト上限まで）保持し続ける。単発生成時代も同じ 60 秒上限で Native Context を保持していたため、
  排他期間の上限そのものは変わらない。Bridge 実行と会話例生成は UI 上直列（会話例生成は Bridge 確定後の
  明示操作でのみ開始する）であるため、実際の呼び出し経路で新しい競合が生まれるわけではないと判断した。
- **Tradeoff**: 1 会話あたりの往復回数が 1 回から最大 4 回に増える。1 リクエストあたりの nPredict は
  512 から 128 へ縮小したため、合計生成トークン数の規模はほぼ変わらない設計にした。
- **Tradeoff**: 完全一致だけを検出する Guard であり、意味的に近いが文字列としては異なる反復（言い換え）
  までは検出しない。プロンプト側の指示（反復禁止・直前ターンへの応答）で補うが、プロンプト遵守の保証は
  与えない残余リスクである。

## References

- 関連コード: `src/domain/conversation-example.ts`、`src/domain/conversation-example-prompt.ts`、
  `src/local-agent/conversation-example-generator.ts`、`src/local-agent/llama-agent-model-provider.ts`、
  `src/app/conversation-example-flow.ts`、`src/screens/ConversationExampleSection.tsx`
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/169
- 関連 ADR: [ADR-0049](./0049-labeled-on-device-conversation-examples.md)、
  [ADR-0050](./0050-agent-to-agent-icebreaker-dialogue.md)（対話の目的・話者契約は維持、生成方式・状態機械を本 ADR が supersede）
- 関連設計 doc: [2026-07-26-conversation-example.md](../design/2026-07-26-conversation-example.md)（案 b2）

# ADR-0044: ADR-0043 が再有効化の根拠として書いた 2 つの主張を訂正する

- **Status**: Accepted
- **Date**: 2026-07-25
- **Deciders**: Susumu Tomita (@susumutomita)

## Context

[ADR-0043](./0043-grounded-quote-bridge-and-local-llm-reenablement.md) は、会話エージェントで端末内 LLM を再有効化する判断を記録した。その Decision 節の末尾に、[ADR-0038](./0038-v1-disable-on-device-llm-for-consumers.md) が記録した 2 件の実機不具合が再発しない根拠として次の 1 文がある。

> ADR-0038 が記録した 2 件の実機不具合のうち、ダウンロードが 100 パーセントで固まる件は PR 140 で foreground session へ変更する修正が入っている（その翌コミットでまとめて無効化されたため実機確認は取れていない）。未完了ダウンロード時の native crash については、`manifest.models` へ載るのは sha256 と GGUF metadata の検証を通った Model だけであり、途中で終わった File はそこまで来ない。実行時の Load Error は `runProviderOnce` の Fallback-once が Rules へ倒す。

この 3 つの主張のうち 2 つは、書いた時点でコードもコミットも確認しておらず、推測をそのまま根拠として記述したものだった。ADR は判断の根拠を後の読者へ残す文書であり、検証していない推測が根拠として残ると、次に読む人が「確認済みの事実」として扱ってしまう。

## Decision

ADR-0043 は不変とし、本 ADR が当該 1 文の事実関係を訂正する。ADR-0043 の Decision そのもの（引用による共通点提示、会話エージェントに限った再有効化、Pet Interaction は Rules 固定のまま）は変更しない。

### 訂正 1: PR 140 の実機確認は取れている

「その翌コミットでまとめて無効化されたため実機確認は取れていない」は誤りである。

コミット `ccef907`（PR 140）の本文に `Confirmed on-device` と明記されている。同コミットは iOS の background URLSession では転送が 100 パーセントに達しても `downloadAsync()` の Promise がアプリ前面の間は解決しないという原因を特定し、foreground session へ変更している（`src/local-agent/expo-trusted-model-download.native.ts`）。

ADR-0043 の当該記述は、コミットのタイトルだけを読み、本文を読まずに「無効化されたのだから確認は取れていないはずだ」と推測して書いたものである。

### 訂正 2: manifest のゲートは実在するが、native crash の根拠にはならない

「`manifest.models` へ載るのは検証を通った Model だけであり、途中で終わった File はそこまで来ない」というゲート自体は実在する。本 ADR の作成時に確認した。

- `src/local-agent/trusted-model-download.ts` が、ダウンロード結果の `sizeBytes` をカタログにピン留めした値と照合し、続いて sha256 ダイジェストを `trusted-model-catalog.ts` の固定値と照合する。どちらか一致しなければ import へ進まない。
- `src/local-agent/model-lifecycle.ts` の import が、sha256 の重複確認と GGUF metadata の解析を通ってから `models` へ追加する。

ただし、これを「ADR-0038 が記録した native crash が再発しない根拠」としたのは誤りである。ADR-0038 は crash の発生条件（未完了のまま会話 Agent を開く）しか記録しておらず、crash 箇所も原因も特定していない。「未完了ファイルが llama.rn へ渡って落ちた」という因果は ADR-0043 の筆者が組み立てた仮説であり、裏付けが無い。

加えて、同じ ADR-0043 の Consequences 節が「Fallback-once は JS 側の型付き失敗しか捕まえられず、native crash は防げない」と書いている。したがって「実行時の Load Error は Fallback-once が Rules へ倒す」は、native crash に対する保証にはならない。

### 現時点で言えること

ADR-0038 が記録した 2 件について、v1.1.0 時点で言えるのは次の範囲である。

| 項目 | 状態 |
| --- | --- |
| ダウンロードが 100 パーセントで固まる | PR 140 で原因を特定して修正済み。同コミットで実機確認済み。v1.1.0 のビルドでの再確認は未実施 |
| 未完了状態で会話エージェントを開くと native crash する | 原因は未特定。manifest のゲートにより未検証 Model が Provider に渡らないことは確認したが、crash の原因がそこにあったという裏付けは無い。v1.1.0 のビルドでの再現有無は未確認 |

## Consequences

- **Good**: 再有効化の根拠として何が確認済みで何が仮説なのかが分離され、次に読む人が誤って「crash は解決済み」と判断しなくなる。
- **Bad**: native crash の原因が未特定のまま v1.1.0 を配信することになる。実機で再現した場合、JS 側の Fallback-once では捕まえられないため、実機ログから原因を特定する別の作業が要る。
- **Tradeoff**: ADR-0043 の Decision 自体は維持する。crash の原因が未特定であることは再有効化を止める理由にはならないと判断した。モデルを持たない端末の挙動は変わらず、ダウンロードは明示的な opt-in であり、再現した場合は Settings からモデルを削除すれば Rules へ戻せるためである。この判断が誤りだったと分かるトリガーは、実機でモデル有効化後に会話エージェントが native crash することである。

## References

- 関連コード: `src/local-agent/expo-trusted-model-download.native.ts`、`src/local-agent/trusted-model-download.ts`、`src/local-agent/trusted-model-catalog.ts`、`src/local-agent/model-lifecycle.ts`
- 関連コミット: `ccef907`（PR 140、foreground session への変更、`Confirmed on-device`）
- 関連 ADR: [ADR-0038](./0038-v1-disable-on-device-llm-for-consumers.md)、[ADR-0043](./0043-grounded-quote-bridge-and-local-llm-reenablement.md)（本 ADR が Decision 節の事実関係を訂正する。Decision そのものは維持する）
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/147

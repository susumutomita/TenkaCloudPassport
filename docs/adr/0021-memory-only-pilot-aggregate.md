# ADR-0021: 実地評価を Memory-only Event Aggregate に限定する

- **Status**: Accepted
- **Date**: 2026-07-18
- **Deciders**: Susumu Tomita (@susumutomita)

## Context

TenkaCloud Passport の成功は Pet の発話回数ではなく、Bridge をきっかけに人間の口頭会話が
始まったかで評価する。一方、Analytics SDK、安定 ID、正確な時刻、Passport や会話の内容を集めると、
評価そのものが Privacy Contract を壊す。識別子を省いた永続 Event Log も、細かい時系列と組合せから
参加者を推測でき、後から用途を拡張しやすい。Issue 26 では、調査への参加を Product 利用の条件にせず、
Self-report を答えない人も即時に退出できる必要がある。

## Decision

アプリは Process 内に固定 Counter だけを持つ Pilot Measurement Controller を置く。Start、Ready、
Bridge / `no-signal`、Rules / Local LLM / Fallback、任意の Self-report を Event ごとに加算し、
Event 本文、ID、Wall-clock 時刻を保存しない。Ready から Bridge までの差は単調増加時計からその場で
4 つの Bucket へ変換し、正確な差を Aggregate へ残さない。

Research Counter は Process 起動時に必ず無効で開始する。Facilitator が Research Consent を Product
Consent と別に確認した Session だけ Settings から明示的に有効化する。無効のままでも Product Flow は
変わらず利用でき、無効化は進行中 Measurement だけを破棄して Product / Lounge State を変更しない。

Aggregate は Outcome 確定が 5 件以上になった場合だけ strict JSON Preview を生成できる。この最低集計
単位は少人数からの推測を減らす抑制策であり、匿名性の保証とは表示しない。共有は既存の OS Share Port を
Owner / Facilitator が Preview 後に明示実行する 1 回だけであり、自動 Upload、送信 Endpoint、再試行 Queue、
最近の Export 履歴を設けない。Process 終了、アプリ再読込、全 Local Data 削除で Counter と未回答状態を失う。

Bridge 後の Self-report は Lounge の内容を破棄した後の別画面で 1 回だけ提示する。「会話が始まった」、
「まだ」、「回答しない」に加え、回答せずに終了する操作を常に表示する。未回答と「回答しない」は成功率の
分母へ入れない。Product の Passport 公開同意や Owner Answer と Research Consent は別の判断として扱う。

比較した案は次のとおりである。

1. Analytics SDK と中央集計は、安定追跡や自動送信の境界を増やすため採用しない。
2. ID を持たない端末内 Event Log は、正確な順序と時刻の保持、永続化、後利用を許すため採用しない。
3. Memory-only の固定 Counter は、個別 Event を復元できず、手動共有だけに閉じられるため採用する。

## Consequences

- **Good**: 中央 Server、Account、Analytics SDK なしで成功指標と契約 Guardrail を評価できる。
- **Good**: JSON Schema が内容、ID、時刻を表現できず、Process 終了で個別の測定状態が消える。
- **Bad**: アプリが終了すると未 Export の Aggregate は失われ、複数端末を自動で統合できない。
- **Bad**: 最低 5 件は小集団推測を完全には防がないため、Observation Sheet の共有範囲も制限が必要である。
- **Tradeoff**: Pilot が Memory-only Counter で答えられない仮説を持つ場合は、自動収集を足さず、
  新しい ADR と Research Consent の再設計を先に行う。

## References

- 関連コード: `src/app/pilot-measurement.ts`
- 関連設計: [実地評価設計](../design/privacy-preserving-pilot-measurement.md)
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/26
- 関連 ADR: [ADR-0007](./0007-privacy-data-contract.md)
- 関連 ADR: [ADR-0020](./0020-local-diagnostics-and-erasure-transaction.md)

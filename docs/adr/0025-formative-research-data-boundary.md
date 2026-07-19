# ADR-0025: 形成的調査データを一時 Record と公開 Aggregate に分離する

- **Status**: Accepted
- **Date**: 2026-07-19
- **Deciders**: Susumu Tomita (@susumutomita)

## Context

Issue 2 の形成的イベント調査は、Research Consent 後に 1 セッションの固定 Code を一時記録し、複数セッションの
Pattern だけを公開 Service Blueprint と仮説へ反映する。既存の `L3P` は Product Process 内の内容なし Counter、
`L4` は Owner が管理する Export、`L5` / `L5P` は実機 Security Test の Packet Capture と公開 Evidence であり、
Researcher が管理する人間調査 Record の Owner、保持、撤回、公開閾値を表せない。

Interview Guide だけに Field と TTL を置くと、Privacy データ台帳、保持ポリシー、脅威モデルから収集と公開の境界を
追跡できず、Guide、Consent、公開成果物が別々の正本になる。個別 Record を一切作らない案では、Journey Stage ごとの
支持、反証、未観察を再現可能な固定 Code で確認できない。

## Decision

形成的調査専用に `L6` Managed Formative Research Record と `L6P` Public Formative Research Aggregate を設ける。
許可 Field、保存先、共有先、TTL、削除契機、公開閾値は
[Privacy データ台帳](../privacy/data-inventory.md)、時系列は
[保持ポリシー](../privacy/retention-policy.md)、攻撃と対策は
[脅威モデル](../security/threat-model.md) を正本とする。Interview Guide と JA / EN Consent はこれらの投影であり、
独自に緩和しない。

`L6` は Product Consent と別の明示的 Research Consent 後にだけ作り、Role cohort、Locale cohort、Journey stage、
Outcome class、Behavior code、Evidence direction、Hypothesis reference の 7 Field に限定する。Researcher だけが
扱える暗号化済み一時領域に置き、閉じる確認前の撤回と禁止 Field の発見では即時、通常は Public Aggregate 更新直後、
遅くともセッション終了から 7 日以内に Record 全体を削除する。

`L6P` は同じ Pattern が 3 セッション以上、かつ 2 つ以上の Role または Locale Stratum に広がる場合だけ作る。
Journey stage、Outcome class、Behavior code、Evidence direction、Hypothesis reference と、これらの固定 Code だけから
作る 140 文字以内の sanitized pattern summary を許可する。Role cohort、Locale cohort、正確な人数、個別 Record、
参加者の回答や会話に由来する自由記述、逐語引用、Sensitive Data は含めない。Privacy、Consent、退出に反する 1 件は、
内容を公開せず独立 Privacy Reviewer の停止判断だけを残せる。

## Consequences

- **Good**: 人間調査の収集、撤回、削除、公開を Product Counter と Engineering Evidence から分離できる。
- **Good**: Guide、2 言語 Consent、Service Blueprint が同じ Privacy 正本へ機械的に追従できる。
- **Good**: Public Aggregate は再現に必要な固定 Code と短い sanitized summary を保持しつつ、小 Cell を公開しない。
- **Bad**: Researcher は暗号化済み一時領域、7 日以内の削除、独立 Privacy Review を運用しなければ調査を開始できない。
- **Tradeoff**: 個別 Record を完全に作らない案は採らず、反証可能性に必要な固定 7 Field だけを短命に保持する。
  Field、公開閾値、保持期間を変える場合は新しい ADR で Supersede する。

## References

- 調査手順: [Interview Guide](../research/interview-guide.md)
- 公開投影先: [Service Blueprint](../research/service-blueprint.md)
- 関連 Issue: https://github.com/susumutomita/TenkaCloudPassport/issues/2
- Process Aggregate: [ADR-0021](./0021-memory-only-pilot-aggregate.md)
- Engineering Evidence: [ADR-0023](./0023-nearby-transport-evidence-gate.md)

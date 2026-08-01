# ADR-0013: Minimal agent harness

- **Status**: Accepted
- **Date**: 2026-08-01
- **Deciders**: Susumu Tomita (`@susumutomita`)

## Context

Passport には、常時ロードされる長い instruction、固定 5 role の `/feature`、`Plan.md`、日本語 BDD、blanket No Mock、100% coverage、SessionStart / Stop / PreCompact / PostToolUse hook が重なっていた。特定 Claude model ID も常時 prompt に固定され、モデル世代が変わるたびに古い前提が残る構造だった。

これらの一部は mobile application の安全境界や完了条件ではなく、過去モデルを補助する実装手順である。残し続けると、Expo / native boundary と利用者フローの検証より ceremony の消化が優先される。

## Decision

agent harness を task、application boundary、guardrails、verifiable completion へ縮小する。

- `CLAUDE.md` は `AGENTS.md` を import し、Skill と subagent を任意ツールとして扱う。
- `AGENTS.md` は Expo Go / Development Build / native boundary、secret と personal data、安全、完了 gate を示す。
- hook は秘密情報と危険 command の実行前防御に限定する。
- `Plan.md`、固定 role、特定 Skill、TDD 順序、テスト言語、blanket No Mock、特定 model ID を必須条件から外す。
- domain test、provider integration、screen test、web export、device preview など、モデルが自分で成否を確認できる検証を優先する。
- steering は同じ失敗が繰り返され、既存 gate で防げない証拠がある場合だけ追加する。

本 ADR は ADR-0003 と ADR-0004 のうち、一律な作業手順と常設 hook に関する判断を supersede する。supply-chain、identity、secure storage、native boundary、required CI は維持する。

## Consequences

- **Good**: mobile user flow と runtime evidence へ集中でき、モデル世代を prompt へ固定しない。
- **Bad**: すべての変更が同じ作業ログと role play を通る一貫性は失われる。
- **Tradeoff**: 反復する失敗が見つかった場合は、再現例と eval を作り、最小の rule または Skill だけを戻す。

## References

- `CLAUDE.md`
- `AGENTS.md`
- `.claude/settings.json`
- `.claude/rules/test-authoring.md`
- `docs/architecture/steering.md`
- `docs/architecture/harness.md`
- `docs/architecture/quality-bar.md`

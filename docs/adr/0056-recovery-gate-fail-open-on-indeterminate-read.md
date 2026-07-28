# ADR-0056: 起動時 Recovery Gate は pending 判定不能を「確定 pending」ではなく「fail-open」で扱う

- **Status**: Accepted。
- **Date**: 2026-07-28。
- **Deciders**: Susumu Tomita (@susumutomita)。

## Context

owner が TestFlight v1.1.4 の実機で「使用中に『Native Context の解放を確認できません。App を終了して再起動してください。』というエラーが表示され（その時点では動作は正常に見えた）、指示どおり再起動すると On-device AI が使えなくなった」という blocker を報告した。

調査の結果、2 つの独立したバグが重なっていた。

1. `default-local-model-management.native.ts` が `LocalModelContextLeaseRegistry` の busy 理由を一律 `NATIVE_CONTEXT_UNAVAILABLE`（Native Context 破損確定・再起動必須の文言）へ丸めており、「起動確認待ち」「他操作との一時的な衝突」という、待てば自然に解消する busy まで致命的な文言で表示していた。
2. `local-data-control.ts` の `recoverPendingDeletion()`（起動時 1 回、tombstone の確認・回復を Profile load より先に完了する Gate）が、`deletionJournal.isPending()` の読み取りに失敗した場合、`committedDeletionLease`（このプロセス内で確定 pending を検出済みかどうかの目印）が無ければ `LocalDataControlError` を投げるだけで、`LocalModelContextLeaseRegistry` の `#useAcquisitionBlocked`（コンストラクタデフォルト `true`）を一切解除していなかった。この Block は `allowUsesAfterRecovery()` を呼ぶ 2 箇所（`!pending` 確定時、削除完了時）でしか解除されないため、起動確認が 1 度でも判定不能（一時的な読み取り失敗）に終わると、その回のプロセスでは On-device AI が永久に使えなくなる。再起動しても、同じ理由で再び判定不能になれば同じ結果を繰り返す。

2 が、owner の「再起動しても直らない」という報告に直接対応する最有力の根本原因と考えられる。

## Decision

### `recoverPendingDeletion()` の判定不能を fail-open にする

`deletionJournal.isPending()` が投げた例外を、`committedDeletionLease`（このプロセス内で確定 pending を検出済みか）で 2 つに分ける。

1. **`committedDeletionLease` が非 null（確定 pending 済み）**: 既に `markPending()` 成功後の状態か、`isPending()` が一度 `true` を返した後の状態であり、Model File が中途半端に削除された可能性がある。この場合だけ引き続き Block を維持し、`DELETE_INTERRUPTED` を投げて Diagnostics 画面の「中断した全削除を再試行」導線へ誘導する（変更なし）。
2. **`committedDeletionLease` が null（このプロセスでは一度も確定 pending を検出していない）**: 単に読み取れなかっただけであり、削除が実際に進行中だと確認したわけではない。`modelContexts.allowUsesAfterRecovery()` を呼んで Block を解除し、`STORAGE_FAILURE` を投げる。Diagnostics 画面は開くが、On-device AI 自体は使える状態に戻す。

さらに、1 回の transient な読み取り失敗が 2 の判定へ落ちる確率を下げるため、`readPendingWithRetry()` で `deletionJournal.isPending()` を timer 無しで即時 3 回まで再試行してから諦める。

### `LocalDataAccessBlockedError` に `reason` を持たせる

`LocalModelContextLeaseRegistry` の busy 理由（`'recovery' | 'model-context' | 'profile-write' | 'exclusive'`）と `DeletionCoordinatedLocalProfileStorageAdapter` の `'pending-deletion'` を `LocalDataAccessBlockedError.reason` として保持し、`default-local-model-management.native.ts` はこれを見て `NATIVE_CONTEXT_UNAVAILABLE` ではなく `MODEL_CONTEXT_BUSY`（他操作使用中）・`STARTUP_RECOVERY_PENDING`（起動確認待ち）という非致命的なコードへ変換する。「App を終了して再起動してください」という重い文言は、`agent-provider-session.ts` の `nativeLaneQuarantined`（Native Context の解放を実際に確認できなかった確定ケース）だけに限定する。

## 選択肢

1. **判定不能でも常に Block を維持する（不採用）**: owner が実際に踏んだ「再起動しても直らない」を修正できない。1 回の transient な I/O 障害が起動確認の唯一の実行機会（起動時 1 回＋手動 retry）を潰すと、ユーザーが Diagnostics 画面で気付いて retry しない限り恒久的にブリックする。
2. **`committedDeletionLease` を disk 上の journal 自体に永続化し、process 再起動を跨いで「確定 pending」を判定できるようにする（不採用、本 PR の scope 外）**: 理論上もっとも正確だが、実装コストが大きい。journal のスキーマ変更（「pending」だけでなく「pending だが commit 未確認」の別 marker を持つことになる）を要し、実機 blocker の緊急度に対して過大な設計変更になる。fail-open のリスクは Tradeoff で受け入れ、将来 journal のスキーマを拡張する際の再検討候補として残す。
3. **判定不能を「確定 pending が無ければ fail-open」で扱う（採用）**: 実際に確定した pending（`committedDeletionLease` あり）だけは引き続き fail-closed（Block 維持）にし、判定不能（確定情報が無い）だけを fail-open にする。owner の blocker を解消しつつ、実際に削除進行中だと分かっているケースの安全性は落とさない。

## Consequences

- **Good**: 起動確認が 1 度でも判定不能になっても、On-device AI がそのプロセスの残り全体で恒久的に使えなくなることはない。
- **Good**: 排他 lease の busy 理由に応じた非致命的な文言分岐により、ありふれた一時的な衝突（他操作が Model を使用中・起動確認待ち）を「Native Context が壊れた、再起動が必要」という過大な文言で見せなくなった。
- **Bad / Tradeoff**: `committedDeletionLease` は process local であり、再起動を跨がない。前回 process が確定 pending（`markPending()` 成功済み）を残したまま落ち、かつ今回 process の `readPendingWithRetry()` が 3 回とも読み取りに失敗する、という稀な複合失敗が起きた場合、fail-open により On-device AI の model-context 取得（`acquire()`）を許してしまう。`DeletionCoordinatedLocalProfileStorageAdapter.save()` の `isPending()` 再確認は Profile write 経路にしか効かず、model-context 取得はこの再確認を経由しない。この場合でも ADR-0055 の self-heal（参照が消えた・Size 不一致の Model File を load 時に検知し Manifest から除く）が 2 段目の fail-closed として働くため、壊れた Model File をそのまま実行することはない。この複合失敗の発生確率と影響が実運用で無視できないと分かった場合は、選択肢 2（journal スキーマの拡張）を再検討する。

## References

- 関連コード: `src/app/local-data-control.ts`（`recoverPendingDeletion`、`readPendingWithRetry`、`LocalDataAccessBlockedError`）、`src/app/default-local-model-management.native.ts`、`src/app/local-model-management-controller.ts`（`mutationLeaseBusyError`）、`src/app/i18n/messages.ts`（`modelError`）。
- 関連 Issue: owner フィードバック（TestFlight v1.1.4、Native Context エラー後に On-device AI が再起動しても使えなくなる blocker）。
- 関連 ADR: [ADR-0055](./0055-self-heal-missing-referenced-model-files-at-load.md)（本 ADR の Tradeoff が依拠する self-heal の 2 段目防御）、[ADR-0054](./0054-tolerate-best-effort-reconcile-failures-and-classify-unknown-errors.md)（情報が取れない失敗を積極的な証拠なしに fail-closed 扱いしない、という同種の設計判断）。

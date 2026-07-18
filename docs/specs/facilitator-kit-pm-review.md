# Facilitator Kit PM Review

## Scope and verdict

- Issue: <https://github.com/susumutomita/TenkaCloudPassport/issues/27>。
- Role: Product Manager。
- Final verdict: Repository scope `ALLOW` / Physical acceptance `Not run`。

## Acceptance mapping

| Acceptance area | Repository evidence | State |
| --- | --- | --- |
| JA / EN Guide、Checklist、QR Poster | `docs/facilitator/` の版管理文書である。 | Verified for document contract |
| 60 秒紹介、5 分 Setup、最大 20 分、30 / 60 / 90 分 | Guide と Checklist で同じ Field ID を使う。 | Verified for document contract |
| 6 必須 Recovery と 4 QR Recovery | `R1`〜`R10` と安全側の終了を持つ。 | Verified for document contract |
| Privacy の共有、削除、バックアップ境界 | JA / EN の verbatim Script と Checklist を持つ。 | Verified for document contract |
| Local Champion Lifecycle | 公開情報、非 Score、30 分 Orientation、辞退と削除要求を持つ。 | Verified for document contract |
| 未経験者 Dry Run | 個人を識別しない Record を持つ。 | `Not run` |

## Dry Run evidence contract

Record は次だけを保持する。

- Kit Commit、公開 App Build ID / Version、Build / OS / Transport である。
- Read-aloud Locale、Orientation 30 分以内、説明 10 分以内、紹介 60 秒以内、Setup 5 分以内の Bucket である。
- Event Format と上限内 / 超過、`R1`〜`R10` の安全側判断 / 判断不能 / `Not run` である。
- 迷い、Consent 混同、Privacy 説明漏れ、状態 Label 混同の件数である。

氏名、連絡先、会場、正確な日時、端末 ID、Lounge ID、Passport、Bridge、会話、Incident 内容は保持しない。
物理 Dry Run の `Pass` が得られるまで Issue の最終受け入れ条件を未達として扱う。

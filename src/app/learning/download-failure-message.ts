export function downloadFailureMessage(
  cancelled: boolean,
  saving: boolean,
  error: unknown
): string {
  if (cancelled)
    return 'ダウンロードを中断しました。保存済みの教材と進捗はそのままです。 / Download cancelled.';
  const detail = error instanceof Error ? error.message : '';
  if (saving)
    return `教材を保存できませんでした。端末の空き容量・保存領域を確認してください。保存済みの教材と進捗はそのままです。 / Save failed; check device storage. ${detail}`;
  return `教材の取得・検証に失敗しました。詳細を確認してください。保存済みの教材と進捗はそのままです。 / Download or validation failed. ${detail}`;
}

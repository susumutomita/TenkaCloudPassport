/**
 * 「満了 1 分前に内容を含まない通知を表示する」という受け入れ条件を、Room（waiting /
 * ready）と Lounge（discovering / retired）の両方から共通で使える 1 つの純粋関数へ集約する。
 * Bridge、相手の手掛かり、判定結果など Lounge 由来の内容には一切触れず、残り時間だけを
 * 根拠にした一般的な行動喚起だけを返す。
 */
export const EXPIRY_WARNING_THRESHOLD_MS = 60_000;

export interface ExpiryNotice {
  readonly level: 'normal' | 'warning';
  readonly message: string;
}

const WARNING_MESSAGE =
  'まもなく 20 分の期限です。操作を終えるか、退出して忘れる操作をしてください。';

export function expiryNotice(remainingMs: number): ExpiryNotice {
  if (remainingMs <= EXPIRY_WARNING_THRESHOLD_MS) {
    return { level: 'warning', message: WARNING_MESSAGE };
  }
  return { level: 'normal', message: '' };
}

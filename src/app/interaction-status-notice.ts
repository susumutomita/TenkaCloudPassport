import type { PetInteractionState } from '../domain/pet-interaction';

/**
 * Pet Interaction（`src/domain/pet-interaction.ts`）の bounded protocol は Chain of
 * Thought、Raw Prompt、Owner Question の内容そのものを画面へ出さない。UI が表示してよいのは
 * 「今どのフェーズにいるか」だけであり、この純粋関数がフェーズごとの固定文言を一元管理する
 * （`expiry-notice.ts` と同じ、内容を持たない状態表示専用の mapper）。
 */
export interface InteractionStatusNotice {
  readonly message: string;
}

const INTERACTION_STATUS_MESSAGES: Record<
  PetInteractionState['phase'],
  string
> = {
  waiting: '出会いを待っています。',
  discovering: '手掛かりを探しています。',
  clarifying: 'Owner に確認しています。',
  bridging: 'Bridge を準備しています。',
  'no-signal': '今回は no-signal です。',
  retired: 'この Lounge での役割を終えました。',
};

export function interactionStatusNotice(
  phase: PetInteractionState['phase']
): InteractionStatusNotice {
  return { message: INTERACTION_STATUS_MESSAGES[phase] };
}

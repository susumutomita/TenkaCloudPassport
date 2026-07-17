import type { PetInteractionState } from '../domain/pet-interaction';
import { DEFAULT_LOCALE, type Locale } from './i18n/locale';
import { MESSAGES } from './i18n/messages';

/**
 * Pet Interaction（`src/domain/pet-interaction.ts`）の bounded protocol は Chain of
 * Thought、Raw Prompt、Owner Question の内容そのものを画面へ出さない。UI が表示してよいのは
 * 「今どのフェーズにいるか」だけであり、この純粋関数がフェーズごとの固定文言を一元管理する
 * （`expiry-notice.ts` と同じ、内容を持たない状態表示専用の mapper）。
 */
export interface InteractionStatusNotice {
  readonly message: string;
}

export function interactionStatusNotice(
  phase: PetInteractionState['phase'],
  locale: Locale = DEFAULT_LOCALE
): InteractionStatusNotice {
  return { message: MESSAGES[locale].interactionStatusNotice[phase] };
}

import type { IntroCard } from '../domain/intro-card';
/** Preserve legacy stored topics, but never disclose data for the retired agent in new QR URLs. */
export function introCardForSharing(card: IntroCard): IntroCard {
  return { ...card, themeIds: [] };
}

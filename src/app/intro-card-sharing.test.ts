import { expect, it } from 'bun:test';
import { createIntroCard } from '../domain/intro-card';
import {
  decodeIntroCardUrlFragment,
  encodeIntroCardUrl,
} from '../protocol/intro-card-url';
import { introCardForSharing } from './intro-card-sharing';

it('omits retired topics from new QR URLs without mutating legacy cards or rejecting old URLs', () => {
  const card = createIntroCard({
    name: 'Synthetic Legacy Card',
    organization: 'Synthetic Org',
    themeIds: ['open-source', 'accessibility'],
  });
  const before = JSON.stringify(card);
  const oldURL = encodeIntroCardUrl(card);
  expect(
    decodeIntroCardUrlFragment(oldURL.split('#')[1] ?? '').themeIds
  ).toEqual(card.themeIds);
  const url = encodeIntroCardUrl(introCardForSharing(card));
  const decoded = decodeIntroCardUrlFragment(url.split('#')[1] ?? '');
  expect(decoded.themeIds ?? []).toEqual([]);
  expect(decoded.name).toBe(card.name);
  expect(decoded.organization).toBe(card.organization);
  expect(JSON.stringify(card)).toBe(before);
});

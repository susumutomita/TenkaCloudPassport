import type { Catalog, Lesson } from '../learning/model';
import { object, requireValid, validateCatalog } from '../learning/validation';
import { add, HAND_PRIME } from './upstream/field';
import { rsaEncrypt } from './upstream/rsa';
import { reconstruct, share } from './upstream/shamir';

export type Template = 'rsa' | 'shares' | 'field';
type PracticeLocale = 'ja' | 'en';
export interface PracticeDraft {
  readonly kind: Template;
  readonly first: number;
  readonly second: number;
}
/** Model output supplies bounded parameters, never answers, code, URLs or prose. */
export function validateDraft(value: unknown): PracticeDraft {
  const draft = object(value);
  const keys = Reflect.ownKeys(draft);
  requireValid(
    keys.length === 3 &&
      keys.every((key) => ['kind', 'first', 'second'].includes(String(key)))
  );
  const fields = Object.getOwnPropertyDescriptors(draft);
  const kind: unknown = fields['kind']?.value;
  const first: unknown = fields['first']?.value;
  const second: unknown = fields['second']?.value;
  requireValid(
    (kind === 'rsa' || kind === 'shares' || kind === 'field') &&
      typeof first === 'number' &&
      Number.isInteger(first) &&
      first >= 0 &&
      first <= 96 &&
      typeof second === 'number' &&
      Number.isInteger(second) &&
      second >= 0 &&
      second <= 96
  );
  return Object.freeze({ kind, first, second });
}

function task(draft: PracticeDraft, ja: boolean) {
  const { first: a, second: b } = draft;
  if (draft.kind === 'rsa') {
    const n = 33;
    const m = a % n;
    const result = rsaEncrypt(m, { n, e: 7 });
    return {
      prompt: ja
        ? `教科書用RSAです。m=${m}, n=33, e=7。暗号文 c=m^e mod n を求めてください。mod は割った余りです。例: 2^3 mod 5=3。実際の鍵やサービスには使いません。`
        : `Textbook RSA: m=${m}, n=33, e=7. Find c=m^e mod n (the remainder). Example: 2^3 mod 5=3. These tiny values are not real keys or services.`,
      result,
      explanation: `${m}^7 mod 33 = ${result}`,
    };
  }
  if (draft.kind === 'shares') {
    const points = share(BigInt(a), 2, 2, [BigInt(b)], HAND_PRIME);
    const result = Number(reconstruct(points, HAND_PRIME));
    const shown = points
      .map((point) => `(${point.index},${point.value})`)
      .join(', ');
    return {
      prompt: ja
        ? `秘密分散の2点: ${shown}。f(x)=s+kx mod 97 です。秘密 s を求めてください。s=(2y1-y2) mod 97。例: (1,5),(2,8) なら s=2。`
        : `Two secret-sharing points: ${shown}. f(x)=s+kx mod 97. Find s=(2y1-y2) mod 97. Example: (1,5),(2,8) gives s=2.`,
      result,
      explanation: `${shown}: (2y1-y2) mod 97 = ${result}`,
    };
  }
  const result = Number(add(BigInt(a), BigInt(b), HAND_PRIME));
  return {
    prompt: ja
      ? `有限体の加算: (${a}+${b}) mod 97 を求めてください。mod は97で割った余りです。例: (90+10) mod 97=3。`
      : `Finite-field addition: find (${a}+${b}) mod 97 (the remainder after division by97). Example: (90+10) mod 97=3.`,
    result,
    explanation: `(${a}+${b}) mod 97 = ${result}`,
  };
}

function lesson(draft: PracticeDraft, locale: PracticeLocale): Lesson {
  const computed = task(draft, locale === 'ja');
  const choices = [0, 17, 43, 71].map((offset) => ({
    id: String((computed.result + offset) % 97),
    text: String((computed.result + offset) % 97),
    explanation: computed.explanation,
  }));
  // Stable numeric ordering avoids revealing the right answer by position.
  choices.sort((left, right) => Number(left.id) - Number(right.id));
  return {
    id: `${draft.kind}-${draft.first}-${draft.second}`,
    title: `Crypto: ${draft.kind}`,
    category: 'TenkaCloud arithmetic practice',
    summary:
      locale === 'ja'
        ? '既存crypto-battleの演算を再利用した個人練習です。Battleの対戦・得点とは別です。'
        : 'Personal practice using original crypto-battle arithmetic; not Battle multiplayer or scoring.',
    authors: [{ name: 'TenkaCloudChallenge' }],
    sources: [
      {
        title: 'Pinned original crypto-battle arithmetic',
        url: 'https://github.com/susumutomita/TenkaCloudChallenge/tree/68b9fbe0d49f5f1d01e04cf8b52f284fd3153ee1/battles/crypto-battle/game/src',
      },
    ],
    steps: [
      {
        id: 'calculate',
        phase: 'practice',
        prompt: computed.prompt,
        choices,
        correctChoiceID: String(computed.result),
        explanation: computed.explanation,
      },
    ],
  };
}

export function practiceCatalog(
  inputs: readonly unknown[],
  locale: PracticeLocale,
  origin: 'bundled' | 'apple'
): Catalog {
  requireValid(inputs.length > 0 && inputs.length <= 3);
  const drafts = inputs.map(validateDraft);
  return validateCatalog({
    schemaVersion: 1,
    catalogID: `passport.crypto.${origin}.${locale}.${drafts.map((d) => `${d.kind}-${d.first}-${d.second}`).join('.')}`,
    version: '1.0.0',
    title:
      origin === 'apple'
        ? 'Apple Intelligence · template-checked practice'
        : 'TenkaCloud · bundled arithmetic practice',
    lessons: drafts.map((draft) => lesson(draft, locale)),
  });
}

export function bundledPractice(locale: PracticeLocale): Catalog {
  return practiceCatalog(
    [
      { kind: 'rsa', first: 9, second: 0 },
      { kind: 'shares', first: 42, second: 13 },
      { kind: 'field', first: 90, second: 10 },
    ],
    locale,
    'bundled'
  );
}

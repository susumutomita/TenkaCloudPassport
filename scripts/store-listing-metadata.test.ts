import { expect, it } from 'bun:test';
import { createHash } from 'node:crypto';

const config = await Bun.file(
  new URL('../store.config.json', import.meta.url)
).json();
const app = await Bun.file(new URL('../app.json', import.meta.url)).json();
it('targets the current native version and retains existing declarations and release settings', () => {
  expect(config.apple.version).toBe(app.expo.version);
  const { version: _version, info: _info, ...protectedSettings } = config.apple;
  expect(
    createHash('sha256').update(JSON.stringify(protectedSettings)).digest('hex')
  ).toBe('e4ea7afa57cafc78932c0978bef75d24f0fbda703c18d0ebe5654bf12e332c8f');
});
for (const locale of ['ja', 'en-US']) {
  it(`accurately describes current features within listing limits (${locale})`, () => {
    const info = config.apple.info[locale];
    expect(info.title.length).toBeLessThanOrEqual(30);
    expect(info.subtitle.length).toBeLessThanOrEqual(30);
    expect(info.description.length).toBeLessThanOrEqual(4000);
    expect(info.promoText.length).toBeLessThanOrEqual(170);
    expect(
      Buffer.byteLength(info.keywords.join(','), 'utf8')
    ).toBeLessThanOrEqual(100);
    expect(info.description).not.toContain('Apple Intelligence');
    expect(info.description).toContain(
      locale === 'ja' ? '会話 AI は廃止' : 'conversation AI has been retired'
    );
    expect(info.description).toContain(
      locale === 'ja' ? 'メモ本文は保存されません' : 'draft text is not saved'
    );
    expect(info.description).toContain(
      locale === 'ja'
        ? 'インターネット接続が必要'
        : 'requires an internet connection'
    );
    expect(info.description).toContain(
      locale === 'ja' ? '自己評価' : 'self-assessment'
    );
    expect(info.keywords).not.toContain('conversation');
    expect(info.keywords).not.toContain('共通点');
  });
}

it('accepts all fifteen byte-verified native screenshots from the reviewed release UI', async () => {
  const { validateReviewedAssets } = await import('./apply-store-listing');
  validateReviewedAssets(new URL('..', import.meta.url).pathname, config.apple);
  expect(Object.values(config.apple.info.ja.screenshots).flat()).toHaveLength(
    15
  );
});

it('rejects changed image bytes even when capture and visual review are marked complete', async () => {
  const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } =
    await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, dirname } = await import('node:path');
  const { validateReviewedAssets } = await import('./apply-store-listing');
  const root = new URL('..', import.meta.url).pathname;
  const folder = mkdtempSync(
    join(tmpdir(), 'passport-reviewed-image-corruption-')
  );
  try {
    const evidencePath =
      'docs/assets/app-store-screenshots/v1.3.0/capture-provenance.json';
    const imagePath = config.apple.info.ja.screenshots.APP_IPHONE_61[0];
    mkdirSync(dirname(join(folder, evidencePath)), { recursive: true });
    writeFileSync(
      join(folder, evidencePath),
      readFileSync(join(root, evidencePath))
    );
    mkdirSync(dirname(join(folder, imagePath)), { recursive: true });
    const image = readFileSync(join(root, imagePath));
    image[image.length - 1] = (image[image.length - 1] ?? 0) ^ 1;
    writeFileSync(join(folder, imagePath), image);
    expect(() => validateReviewedAssets(folder, config.apple)).toThrow(
      'Screenshot byte hash mismatch'
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

it('cannot mutate ASC when native capture has not been prepared', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import(
    'node:fs'
  );
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { applyReviewedListing } = await import('./apply-store-listing');
  const folder = mkdtempSync(join(tmpdir(), 'passport-store-preflight-'));
  let reads = 0;
  try {
    writeFileSync(join(folder, 'store.config.json'), JSON.stringify(config));
    const capture = join(folder, 'docs/assets/app-store-screenshots/v1.3.0');
    mkdirSync(capture, { recursive: true });
    writeFileSync(
      join(capture, 'capture-provenance.json'),
      JSON.stringify({
        uiSourceCommit: 'd42f0439639dfdb7b31d1560f83493a7cd4e73b8',
        nativeCaptureSucceeded: false,
        visuallyReviewed: false,
        assets: [],
      })
    );
    await expect(
      applyReviewedListing({
        app: {
          id: '6793516094',
          get context() {
            reads++;
            return null;
          },
        },
        versions: [],
        builds: [],
        releaseBuild: { status: 'FINISHED', submissions: [] },
        projectDir: folder,
        cliRoot: folder,
      })
    ).rejects.toThrow('Native capture verification is required');
    expect(reads).toBe(0);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

it('creates only approved locale records when a new version has no copied localization', async () => {
  const { writeLocaleText } = await import('./apply-store-listing');
  const writes: { locale: string; fields: Record<string, string> }[] = [];
  const created: string[] = [];
  await writeLocaleText(
    {
      id: 'new-version',
      attributes: {
        versionString: '1.3.0',
        appStoreState: 'PREPARE_FOR_SUBMISSION',
        releaseType: 'AFTER_APPROVAL',
      },
      async getLocalizationsAsync() {
        return [];
      },
      async createLocalizationAsync({ locale }) {
        created.push(locale);
        return {
          attributes: { locale },
          async updateAsync(fields: Record<string, string>) {
            writes.push({ locale, fields });
          },
          async getAppScreenshotSetsAsync() {
            return [];
          },
        };
      },
      async updateBuildAsync() {
        throw new Error(
          'Locale text updates must not change the selected build'
        );
      },
      async getBuildAsync() {
        return null;
      },
    },
    config.apple
  );
  expect(created).toEqual(['ja', 'en-US']);
  expect(writes).toHaveLength(2);
  for (const { locale, fields } of writes) {
    const local = config.apple.info[locale];
    expect(fields).toEqual({
      description: local.description,
      keywords: local.keywords.join(','),
      promotionalText: local.promoText,
      whatsNew: local.releaseNotes,
    });
  }
});

it('rejects canonical Apple screenshot order that differs from embedded SDK order', async () => {
  const { canonicalScreenshotOrder } = await import('./apply-store-listing');
  const shots = ['first', 'second'].map((id) => ({
    id,
    attributes: { fileName: `${id}.png`, fileSize: 1 },
  }));
  let requestedOrder: string[] | undefined;
  const set = {
    id: 'synthetic-set',
    context: { token: 'synthetic-token' },
    attributes: {
      screenshotDisplayType: 'APP_IPHONE_61',
      appScreenshots: shots,
    },
  };
  await expect(
    canonicalScreenshotOrder(
      set,
      ['first.png', 'second.png'],
      async (_url, _token, ids) => {
        requestedOrder = ids;
        return { data: [{ id: 'second' }, { id: 'first' }] };
      }
    )
  ).rejects.toThrow('Canonical screenshot order readback mismatch');
  expect(requestedOrder).toBeUndefined();
  expect(
    await canonicalScreenshotOrder(
      set,
      ['first.png', 'second.png'],
      async (_url, _token, ids) => {
        requestedOrder = ids;
        return { data: [{ id: 'first' }, { id: 'second' }] };
      },
      true
    )
  ).toEqual(shots);
  expect(requestedOrder).toEqual(['first', 'second']);
});
it('accepts empty HTTP204 PATCH then requires canonical GET, while read-only never patches', async () => {
  const { requestCanonicalScreenshots } = await import('./apply-store-listing');
  const calls: string[] = [];
  const client = {
    patch: async (_url: string, data: unknown) => {
      calls.push('patch');
      expect(data).toEqual({ data: [{ type: 'appScreenshots', id: 'first' }] });
      return { status: 204, data: '' };
    },
    get: async () => {
      calls.push('get');
      return { data: { data: [{ id: 'first' }] } };
    },
  };
  await requestCanonicalScreenshots(
    client,
    'https://example.invalid/relationship',
    'synthetic-token'
  );
  expect(calls).toEqual(['get']);
  calls.length = 0;
  expect(
    await requestCanonicalScreenshots(
      client,
      'https://example.invalid/relationship',
      'synthetic-token',
      ['first']
    )
  ).toEqual({ data: [{ id: 'first' }] });
  expect(calls).toEqual(['patch', 'get']);
});

it('rejects missing target version in read-only verification before any remote context access', async () => {
  const { verifySavedListing } = await import('./apply-store-listing');
  let contexts = 0;
  await expect(
    verifySavedListing({
      app: {
        id: '6793516094',
        get context() {
          contexts++;
          return null;
        },
      },
      versions: [],
      builds: [
        {
          id: 'synthetic-build',
          attributes: {
            version: '15',
            processingState: 'VALID',
            expired: false,
            preReleaseVersion: { attributes: { version: '1.3.0' } },
          },
        },
      ],
      releaseBuild: {
        status: 'FINISHED',
        submissions: [
          {
            id: '304c3108-725a-4696-8063-4e41ce86f973',
            status: 'FINISHED',
          },
        ],
      },
      projectDir: new URL('..', import.meta.url).pathname,
      cliRoot: '/does-not-exist',
    })
  ).rejects.toThrow('Saved target version is missing');
  expect(contexts).toBe(0);
});
it('rejects old nonempty and duplicate remote screenshot display sets', async () => {
  const { verifyScreenshotDisplayTypes } = await import(
    './apply-store-listing'
  );
  const shot = {
    id: 'old',
    attributes: { fileName: 'old-ai.png', fileSize: 1 },
  };
  const set = (type: string, shots = [] as (typeof shot)[]) => ({
    attributes: { screenshotDisplayType: type, appScreenshots: shots },
  });
  expect(() =>
    verifyScreenshotDisplayTypes(
      [set('APP_IPHONE_61'), set('OLD_DISPLAY', [shot])],
      ['APP_IPHONE_61']
    )
  ).toThrow('Unexpected nonempty screenshot display type');
  expect(() =>
    verifyScreenshotDisplayTypes(
      [set('APP_IPHONE_61'), set('APP_IPHONE_61')],
      ['APP_IPHONE_61']
    )
  ).toThrow('Duplicate screenshot display type');
  expect(() =>
    verifyScreenshotDisplayTypes(
      [set('APP_IPHONE_61'), set('OLD_DISPLAY')],
      ['APP_IPHONE_61']
    )
  ).not.toThrow();
});

it('review readiness emits presence/classification only, never private contact or Notes values', async () => {
  const { summarizeReviewDetails } = await import('./apply-store-listing');
  const privateValues = [
    'Synthetic private first',
    'Synthetic private last',
    'private@example.invalid',
    '+15550000000',
  ];
  const note =
    'Private note: includes an on-device conversation agent and FoundationModels.';
  const result = summarizeReviewDetails(
    {
      contactFirstName: privateValues[0],
      contactLastName: privateValues[1],
      contactEmail: privateValues[2],
      contactPhone: privateValues[3],
      notes: note,
      demoAccountRequired: false,
    },
    'Current notes'
  );
  const output = JSON.stringify(result);
  for (const value of [...privateValues, note])
    expect(output).not.toContain(value);
  expect(result.legacyAIClaimsPresent).toBe(true);
  expect(result.notesMatchPreparedCurrentDraft).toBe(false);
  expect(result.contact).toEqual({
    firstNamePresent: true,
    lastNamePresent: true,
    emailPresent: true,
    phonePresent: true,
  });
  expect(summarizeReviewDetails(null, 'Current notes')).toEqual({
    status: 'absent',
  });
  const current =
    'Learning catalogs. On-device conversation inference is removed. Legacy model cleanup.';
  expect(
    summarizeReviewDetails({ notes: current }, current).legacyAIClaimsPresent
  ).toBe(false);
  expect(
    summarizeReviewDetails({ notes: current }, current)
      .notesMatchPreparedCurrentDraft
  ).toBe(true);
});

it('reports absent privacy locales instead of silently omitting them', async () => {
  const { summarizePrivacyURLs } = await import('./apply-store-listing');
  expect(
    summarizePrivacyURLs(
      [
        {
          attributes: {
            locale: 'ja',
            privacyPolicyUrl: 'https://example.invalid/ja',
          },
        },
      ],
      { ja: { privacyPolicyUrl: 'https://example.invalid/ja' } }
    )
  ).toEqual([
    {
      locale: 'ja',
      localizationPresent: true,
      policyURLPresent: true,
      matchesConfiguredURL: true,
    },
    {
      locale: 'en-US',
      localizationPresent: false,
      policyURLPresent: false,
      matchesConfiguredURL: false,
    },
  ]);
});
it('distinguishes removed framework references from affirmative inference claims', async () => {
  const { summarizeReviewDetails } = await import('./apply-store-listing');
  const retired =
    'The FoundationModels integration was removed. The app no longer uses Apple Intelligence.';
  const result = summarizeReviewDetails({ notes: retired }, retired);
  expect(result.notesMatchPreparedCurrentDraft).toBe(true);
  expect(result.legacyAIReferencesPresent).toBe(true);
  expect(result.legacyAIClaimsPresent).toBe(false);
  expect(
    summarizeReviewDetails(
      { notes: 'The app uses FoundationModels to find common ground.' },
      retired
    ).legacyAIClaimsPresent
  ).toBe(true);
});
it('exposes unconfigured supported age answers without emitting unknown values', async () => {
  const { summarizeAgeDeclaration } = await import('./apply-store-listing');
  const result = summarizeAgeDeclaration(
    {
      gambling: false,
      socialMedia: true,
      socialMediaAgeRestricted: false,
      unknownField: 'private@example.invalid',
    },
    { gambling: false }
  );
  expect(result.configuredFieldsMatch).toBe(true);
  expect(result.unconfiguredSupportedFieldNames).toContain('socialMedia');
  expect(result.unconfiguredSupportedFieldNames).toContain(
    'socialMediaAgeRestricted'
  );
  expect(result.currentAnswers['socialMedia']).toBe(true);
  expect(result.currentAnswers['socialMediaAgeRestricted']).toBe(false);
  expect(result.missingSupportedRemoteFieldNames).toContain('messagingAndChat');
  expect(JSON.stringify(result)).not.toContain('private@example.invalid');
});

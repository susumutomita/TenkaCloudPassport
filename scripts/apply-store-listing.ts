/** Targeted listing updates; deliberately does not run all EAS Metadata tasks. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';

type Fields = {
  description: string;
  keywords: string;
  promotionalText: string;
  whatsNew: string;
};
type Shot = {
  id: string;
  attributes: {
    fileName: string;
    fileSize: number;
    assetDeliveryState?: { state: string };
  };
};
type ShotSet = {
  id: string;
  context: { token?: string | { getToken(): Promise<string> } };
  attributes: { screenshotDisplayType: string; appScreenshots: Shot[] };
};
type LocaleModel = {
  attributes: { locale: string } & Partial<Fields>;
  updateAsync(fields: Fields): Promise<unknown>;
  getAppScreenshotSetsAsync(): Promise<ShotSet[]>;
};
type BuildModel = {
  id: string;
  attributes: {
    version: string;
    processingState: string;
    expired: boolean;
    preReleaseVersion?: { attributes: { version: string } };
  };
};
type VersionModel = {
  id: string;
  attributes: {
    versionString: string;
    appStoreState: string;
    releaseType: string;
  };
  getLocalizationsAsync(): Promise<LocaleModel[]>;
  createLocalizationAsync(input: { locale: string }): Promise<LocaleModel>;
  updateBuildAsync(input: { buildId: string }): Promise<unknown>;
  getBuildAsync(): Promise<BuildModel | null>;
};
type StoreApp = { id: string; context: unknown };
type Listing = {
  version: string;
  info: Record<
    string,
    {
      description: string;
      keywords: string[];
      promoText: string;
      releaseNotes: string;
      screenshots?: Record<string, string[]>;
    }
  >;
};
type Asset = { path: string; sha256: string; width: number; height: number };
const UI_COMMIT = 'd42f0439639dfdb7b31d1560f83493a7cd4e73b8';
const dimensions: Record<string, readonly [number, number]> = {
  APP_IPHONE_61: [1206, 2622],
  APP_IPHONE_67: [1320, 2868],
  APP_IPAD_PRO_3GEN_129: [2064, 2752],
};

function validatePNGChunks(png: Buffer): void {
  if (![0, 2, 3].includes(png[25] ?? -1))
    throw new Error('Store screenshots must not have an alpha channel');
  for (let offset = 8; offset + 12 <= png.length; ) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    if (offset + length + 12 > png.length || type === 'tRNS')
      throw new Error('Screenshot transparency or invalid PNG chunk');
    offset += length + 12;
  }
}
function validatePNGAsset(
  projectDir: string,
  path: string,
  asset: Asset | undefined,
  expected: readonly [number, number]
): void {
  const folder = 'docs/assets/app-store-screenshots/v1.3.0/';
  if (
    !path.startsWith(folder) ||
    path.includes('..') ||
    !basename(path).startsWith('1.3.0-') ||
    !path.endsWith('.png')
  )
    throw new Error('Unexpected screenshot path');
  const png = readFileSync(resolve(projectDir, path));
  if (
    !asset ||
    png.length < 33 ||
    png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
  )
    throw new Error('Screenshot provenance or PNG header mismatch');
  if (
    png.readUInt32BE(16) !== expected[0] ||
    png.readUInt32BE(20) !== expected[1] ||
    asset.width !== expected[0] ||
    asset.height !== expected[1]
  )
    throw new Error('Native display dimensions mismatch');
  if (createHash('sha256').update(png).digest('hex') !== asset.sha256)
    throw new Error('Screenshot byte hash mismatch');
  validatePNGChunks(png);
}
export function validateReviewedAssets(
  projectDir: string,
  listing: Listing
): void {
  if (listing.version !== '1.3.0') throw new Error('Listing version mismatch');
  for (const local of Object.values(listing.info)) listingFields(local);
  const provenance = JSON.parse(
    readFileSync(
      join(
        projectDir,
        'docs/assets/app-store-screenshots/v1.3.0/capture-provenance.json'
      ),
      'utf8'
    )
  ) as {
    uiSourceCommit: string;
    nativeCaptureSucceeded: boolean;
    visuallyReviewed: boolean;
    assets: Asset[];
  };
  if (
    provenance.uiSourceCommit !== UI_COMMIT ||
    provenance.nativeCaptureSucceeded !== true ||
    provenance.visuallyReviewed !== true
  )
    throw new Error('Native capture verification is required');
  const sets = listing.info['ja']?.screenshots;
  if (
    !sets ||
    Object.keys(sets).sort().join(',') !==
      Object.keys(dimensions).sort().join(',')
  )
    throw new Error('Expected native display sets are required');
  for (const [type, paths] of Object.entries(sets)) {
    const expected = dimensions[type];
    if (!expected || paths.length !== 5 || new Set(paths).size !== 5)
      throw new Error('Five distinct current screenshots are required');
    for (const path of paths)
      validatePNGAsset(
        projectDir,
        path,
        provenance.assets.find((entry) => entry.path === path),
        expected
      );
  }
}
function verifiedAppleBuild(
  builds: BuildModel[],
  releaseBuild: {
    status: string;
    submissions: { id: string; status: string }[];
  }
): BuildModel {
  const build = builds.find(
    (candidate) =>
      candidate.attributes.version === '15' &&
      candidate.attributes.preReleaseVersion?.attributes.version === '1.3.0'
  );
  const submitted = releaseBuild.submissions.some(
    (submission) =>
      submission.id === '304c3108-725a-4696-8063-4e41ce86f973' &&
      submission.status === 'FINISHED'
  );
  if (
    releaseBuild.status !== 'FINISHED' ||
    !submitted ||
    !build ||
    build.attributes.processingState !== 'VALID' ||
    build.attributes.expired
  )
    throw new Error('Verified release build is required');
  return build;
}
async function editableVersion(
  app: StoreApp,
  versions: VersionModel[],
  cliRoot: string
): Promise<VersionModel> {
  const writable = [
    'PREPARE_FOR_SUBMISSION',
    'REJECTED',
    'METADATA_REJECTED',
    'DEVELOPER_REJECTED',
    'INVALID_BINARY',
  ];
  const version = versions.find(
    (candidate) => candidate.attributes.versionString === '1.3.0'
  );
  if (version) {
    if (!writable.includes(version.attributes.appStoreState))
      throw new Error('Target store version is not editable');
    return version;
  }
  if (
    !versions.some(
      (candidate) => candidate.attributes.appStoreState === 'READY_FOR_SALE'
    ) ||
    versions.some((candidate) =>
      writable.includes(candidate.attributes.appStoreState)
    )
  )
    throw new Error(
      'Another editable store version or missing live version requires resolution'
    );
  const live = versions.find(
    (candidate) => candidate.attributes.appStoreState === 'READY_FOR_SALE'
  );
  if (!live?.attributes.releaseType)
    throw new Error('Existing release policy must be known');
  const load = createRequire(join(cliRoot, 'package.json'));
  const { AppStoreVersion } = load('@expo/apple-utils');
  return await AppStoreVersion.createAsync(app.context, {
    id: app.id,
    versionString: '1.3.0',
    platform: 'IOS',
    releaseType: live.attributes.releaseType,
  });
}
function listingFields(local: Listing['info'][string]): Fields {
  if (Buffer.byteLength(local.keywords.join(','), 'utf8') > 100)
    throw new Error('Keywords exceed Apple UTF-8 byte limit');
  return {
    description: local.description,
    keywords: local.keywords.join(','),
    promotionalText: local.promoText,
    whatsNew: local.releaseNotes,
  };
}
export async function writeLocaleText(
  version: VersionModel,
  listing: Listing
): Promise<void> {
  const locales = await version.getLocalizationsAsync();
  for (const localeName of ['ja', 'en-US']) {
    const local = listing.info[localeName];
    const existing = locales.find(
      (locale) => locale.attributes.locale === localeName
    );
    if (!local) throw new Error('Expected approved localization is required');
    const remote =
      existing ??
      (await version.createLocalizationAsync({ locale: localeName }));
    await remote.updateAsync(listingFields(local));
  }
}
async function verifyFallbackLocalesBeforeWrite(
  versions: VersionModel[]
): Promise<void> {
  for (const version of versions.filter(
    (item) =>
      item.attributes.versionString === '1.3.0' ||
      item.attributes.appStoreState === 'READY_FOR_SALE'
  )) {
    for (const locale of await version.getLocalizationsAsync()) {
      if (locale.attributes.locale === 'ja') continue;
      const sets = await locale.getAppScreenshotSetsAsync();
      if (sets.some((set) => set.attributes.appScreenshots.length > 0))
        throw new Error(
          'Unreviewed localized screenshots must be resolved before any listing write'
        );
    }
  }
}
function verifyScreenshotSet(
  shots: Shot[],
  paths: string[],
  projectDir: string
): void {
  if (shots.length !== paths.length)
    throw new Error('Screenshot count readback mismatch');
  for (let index = 0; index < paths.length; index++) {
    const path = paths[index];
    const shot = shots[index];
    if (!path || !shot) throw new Error('Screenshot order readback mismatch');
    if (
      shot.attributes.fileName !== basename(path) ||
      shot.attributes.fileSize !==
        readFileSync(join(projectDir, path)).length ||
      shot.attributes.assetDeliveryState?.state !== 'COMPLETE'
    )
      throw new Error('Screenshot content/processing readback mismatch');
  }
}
type RelationshipClient = {
  patch(url: string, data: unknown, options: unknown): Promise<unknown>;
  get(
    url: string,
    options: unknown
  ): Promise<{ data: { data: { id: string }[] } }>;
};
export async function requestCanonicalScreenshots(
  client: RelationshipClient,
  url: string,
  token: string,
  orderedIds?: string[]
): Promise<{ data: { id: string }[] }> {
  const options = {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 30000,
  };
  // Apple's relationship PATCH can return HTTP 204 with an empty body.
  // Raw Axios accepts this, unlike the pinned SDK model response parser.
  if (orderedIds)
    await client.patch(
      url,
      {
        data: orderedIds.map((id) => ({ type: 'appScreenshots', id })),
      },
      options
    );
  return (await client.get(url, options)).data;
}
export async function canonicalScreenshotOrder(
  set: ShotSet,
  paths: string[],
  request: (
    url: string,
    token: string,
    orderedIds?: string[]
  ) => Promise<{ data: { id: string }[] }>,
  reorder = false
): Promise<Shot[]> {
  const shots = paths.map((path) => {
    const shot = set.attributes.appScreenshots.find(
      (item) => item.attributes.fileName === basename(path)
    );
    if (!shot) throw new Error('Expected screenshot is missing');
    return shot;
  });
  const token = set.context.token;
  const signed = typeof token === 'string' ? token : await token?.getToken();
  if (!signed) throw new Error('Existing Apple API authentication is required');
  const response = await request(
    `https://api.appstoreconnect.apple.com/v1/appScreenshotSets/${set.id}/relationships/appScreenshots`,
    signed,
    reorder ? shots.map((shot) => shot.id) : undefined
  );
  if (
    response.data.map((item) => item.id).join(',') !==
    shots.map((shot) => shot.id).join(',')
  )
    throw new Error('Canonical screenshot order readback mismatch');
  return shots;
}
export function verifyScreenshotDisplayTypes(
  sets: Pick<ShotSet, 'attributes'>[],
  expectedTypes: string[]
): void {
  const seen = new Set<string>();
  for (const set of sets) {
    const type = set.attributes.screenshotDisplayType;
    if (seen.has(type)) throw new Error('Duplicate screenshot display type');
    seen.add(type);
    if (
      !expectedTypes.includes(type) &&
      set.attributes.appScreenshots.length > 0
    )
      throw new Error('Unexpected nonempty screenshot display type');
  }
}
async function verifyLocale(
  remote: LocaleModel,
  local: Listing['info'][string],
  projectDir: string,
  cliRoot: string,
  reorder = false
): Promise<void> {
  for (const [key, expected] of Object.entries(listingFields(local))) {
    if (Reflect.get(remote.attributes, key) !== expected)
      throw new Error('Listing text readback mismatch');
  }
  const sets = await remote.getAppScreenshotSetsAsync();
  verifyScreenshotDisplayTypes(sets, Object.keys(local.screenshots ?? {}));
  if (!local.screenshots) {
    if (sets.some((set) => set.attributes.appScreenshots.length > 0))
      throw new Error(
        'Unexpected localized screenshots require explicit replacement'
      );
    return;
  }
  for (const [type, paths] of Object.entries(local.screenshots)) {
    const set = sets.find(
      (item) => item.attributes.screenshotDisplayType === type
    );
    if (!set) throw new Error('Expected screenshot set is missing');
    const load = createRequire(join(cliRoot, 'package.json'));
    const { getRequestClient } = load('@expo/apple-utils');
    const shots = await canonicalScreenshotOrder(
      set,
      paths,
      (url, token, orderedIds) =>
        requestCanonicalScreenshots(getRequestClient(), url, token, orderedIds),
      reorder
    );
    verifyScreenshotSet(shots, paths, projectDir);
  }
}
async function syncNativeScreenshots(
  app: StoreApp,
  version: VersionModel,
  listing: Listing,
  projectDir: string,
  cliRoot: string
): Promise<void> {
  const load = createRequire(join(cliRoot, 'package.json'));
  const { AppleConfigReader } = load('./build/metadata/apple/config/reader');
  const { ScreenshotsTask } = load('./build/metadata/apple/tasks/screenshots');
  const task = new ScreenshotsTask();
  const context = {
    app,
    projectDir,
    version,
    versionLocales: await version.getLocalizationsAsync(),
  };
  await task.prepareAsync({ context });
  await task.uploadAsync({
    context,
    config: new AppleConfigReader({
      info: { ja: { screenshots: listing.info['ja']?.screenshots } },
    }),
  });
}
type StoreListingInput = {
  app: StoreApp;
  versions: VersionModel[];
  builds: BuildModel[];
  releaseBuild: {
    status: string;
    submissions: { id: string; status: string }[];
  };
  projectDir: string;
  cliRoot: string;
};
export async function verifySavedListing(
  input: StoreListingInput
): Promise<void> {
  const { app, versions, builds, releaseBuild, projectDir, cliRoot } = input;
  if (app.id !== '6793516094') throw new Error('Target app identity mismatch');
  const listing = JSON.parse(
    readFileSync(join(projectDir, 'store.config.json'), 'utf8')
  ).apple as Listing;
  validateReviewedAssets(projectDir, listing);
  const appleBuild = verifiedAppleBuild(builds, releaseBuild);
  const version = versions.find(
    (item) => item.attributes.versionString === '1.3.0'
  );
  if (!version) throw new Error('Saved target version is missing');
  if ((await version.getBuildAsync())?.id !== appleBuild.id)
    throw new Error('Selected build readback mismatch');
  const locales = await version.getLocalizationsAsync();
  for (const name of ['ja', 'en-US']) {
    const remote = locales.find((item) => item.attributes.locale === name);
    const local = listing.info[name];
    if (!remote || !local)
      throw new Error('Approved localization readback missing');
    await verifyLocale(remote, local, projectDir, cliRoot, false);
  }
  await verifyFallbackLocalesBeforeWrite([version]);
  console.log(
    JSON.stringify({
      listingVerified: {
        version: '1.3.0',
        versionId: version.id,
        state: version.attributes.appStoreState,
        buildNumber: '15',
        buildId: appleBuild.id,
        locales: ['ja', 'en-US'],
        screenshotCount: 15,
        canonicalScreenshotOrder: true,
        readOnly: true,
        reviewSubmissionAttempted: false,
        publishAttempted: false,
      },
    })
  );
}
export async function applyReviewedListing(
  input: StoreListingInput
): Promise<void> {
  const { app, versions, builds, releaseBuild, projectDir, cliRoot } = input;
  const listing = (
    JSON.parse(readFileSync(join(projectDir, 'store.config.json'), 'utf8')) as {
      apple: Listing;
    }
  ).apple;
  if (app.id !== '6793516094') throw new Error('Target app identity mismatch');
  validateReviewedAssets(projectDir, listing);
  const appleBuild = verifiedAppleBuild(builds, releaseBuild);
  await verifyFallbackLocalesBeforeWrite(versions);
  const version = await editableVersion(app, versions, cliRoot);
  await writeLocaleText(version, listing);
  await syncNativeScreenshots(app, version, listing, projectDir, cliRoot);
  // Associate the existing binary; this neither uploads again nor submits App Review.
  if ((await version.getBuildAsync())?.id !== appleBuild.id)
    await version.updateBuildAsync({ buildId: appleBuild.id });
  if ((await version.getBuildAsync())?.id !== appleBuild.id)
    throw new Error('Selected build readback mismatch');
  for (const remote of await version.getLocalizationsAsync()) {
    const local = listing.info[remote.attributes.locale];
    if (local) await verifyLocale(remote, local, projectDir, cliRoot, true);
  }
  console.log(
    JSON.stringify({
      listingApplied: {
        version: '1.3.0',
        versionId: version.id,
        buildNumber: '15',
        buildId: appleBuild.id,
        locales: ['ja', 'en-US'],
        screenshotCount: 15,
        reviewSubmitted: false,
        published: false,
      },
    })
  );
}

/** Only presence/classification leaves memory; never emit review contact or Notes text. */
export function summarizeReviewDetails(
  attributes: Record<string, unknown> | null,
  preparedNotes: string
) {
  if (!attributes) return { status: 'absent' };
  const present = (key: string) =>
    typeof attributes[key] === 'string' &&
    String(attributes[key]).trim().length > 0;
  const notes =
    typeof attributes['notes'] === 'string' ? attributes['notes'] : '';
  return {
    status: 'available',
    contact: {
      firstNamePresent: present('contactFirstName'),
      lastNamePresent: present('contactLastName'),
      emailPresent: present('contactEmail'),
      phonePresent: present('contactPhone'),
    },
    demoAccountRequired:
      typeof attributes['demoAccountRequired'] === 'boolean'
        ? attributes['demoAccountRequired']
        : null,
    notesPresent: notes.trim().length > 0,
    notesMatchPreparedCurrentDraft: notes.trim() === preparedNotes.trim(),
    legacyAIReferencesPresent:
      /FoundationModels|Apple\s+Intelligence|conversation agent|会話エージェント/i.test(
        notes
      ),
    legacyAIClaimsPresent: notes
      .split(/[.!?]+/)
      .some(
        (sentence) =>
          /includes an on-device conversation agent|automatically uses[\s\S]{0,100}Apple\s+Intelligence|(?:uses|supports|includes|runs|integrates)[\s\S]{0,80}FoundationModels|finds common ground|共通点.{0,20}見つけ/i.test(
            sentence
          ) &&
          !/\b(?:removed|retired|disabled|no longer|does not|doesn't|not included|not supported)\b|撤去|廃止|利用しない/i.test(
            sentence
          )
      ),
    currentFeatureMarkers: {
      learning: /learning catalogs|学習|教材/i.test(notes),
      inferenceRetired:
        /inference is removed|AI has been retired|会話\s*AI.{0,12}廃止/i.test(
          notes
        ),
      legacyCleanup: /legacy model cleanup|旧モデル.{0,12}削除/i.test(notes),
    },
  };
}

export function summarizePrivacyURLs(
  locales: { attributes: { locale: string; privacyPolicyUrl?: string } }[],
  configured: Record<string, { privacyPolicyUrl?: string }>
) {
  return ['ja', 'en-US'].map((locale) => {
    const remote = locales.find((item) => item.attributes.locale === locale);
    return {
      locale,
      localizationPresent: Boolean(remote),
      policyURLPresent: Boolean(remote?.attributes.privacyPolicyUrl),
      matchesConfiguredURL:
        Boolean(remote?.attributes.privacyPolicyUrl) &&
        remote?.attributes.privacyPolicyUrl ===
          configured[locale]?.privacyPolicyUrl,
    };
  });
}
const AGE_DECLARATION_FIELDS = [
  'advertising',
  'ageAssurance',
  'ageRatingOverride',
  'ageRatingOverrideV2',
  'alcoholTobaccoOrDrugUseOrReferences',
  'contests',
  'gambling',
  'gamblingSimulated',
  'gunsOrOtherWeapons',
  'healthOrWellnessTopics',
  'horrorOrFearThemes',
  'kidsAgeBand',
  'koreaAgeRatingOverride',
  'lootBox',
  'matureOrSuggestiveThemes',
  'medicalOrTreatmentInformation',
  'messagingAndChat',
  'parentalControls',
  'profanityOrCrudeHumor',
  'sexualContentGraphicAndNudity',
  'sexualContentOrNudity',
  'socialMedia',
  'socialMediaAgeRestricted',
  'unrestrictedWebAccess',
  'userGeneratedContent',
  'violenceCartoonOrFantasy',
  'violenceRealistic',
  'violenceRealisticProlongedGraphicOrSadistic',
];
export function summarizeAgeDeclaration(
  attributes: Record<string, unknown>,
  configured: Record<string, unknown>
) {
  const configuredKeys = Object.keys(configured).filter(
    (key) => key !== 'developerAgeRatingInfoUrl'
  );
  return {
    status: 'available',
    configuredFieldsMatch: configuredKeys.every(
      (key) => attributes[key] === configured[key]
    ),
    differentConfiguredFieldNames: configuredKeys.filter(
      (key) => attributes[key] !== configured[key]
    ),
    unconfiguredSupportedFieldNames: AGE_DECLARATION_FIELDS.filter(
      (key) => !Object.hasOwn(configured, key)
    ),
    missingSupportedRemoteFieldNames: AGE_DECLARATION_FIELDS.filter(
      (key) => !Object.hasOwn(attributes, key)
    ),
    unrecognizedRemoteFieldNames: Object.keys(attributes).filter(
      (key) =>
        !AGE_DECLARATION_FIELDS.includes(key) &&
        key !== 'developerAgeRatingInfoUrl'
    ),
    developerAgeRatingURLPresent:
      typeof attributes['developerAgeRatingInfoUrl'] === 'string' &&
      attributes['developerAgeRatingInfoUrl'].length > 0,
    currentAnswers: Object.fromEntries(
      AGE_DECLARATION_FIELDS.map((key) => [
        key,
        typeof attributes[key] === 'boolean' ||
        attributes[key] === null ||
        /^(NONE|INFREQUENT_OR_MILD|FREQUENT_OR_INTENSE|FOUR_PLUS|SIX_PLUS|NINE_PLUS|TWELVE_PLUS|FIFTEEN_PLUS|SEVENTEEN_PLUS|EIGHTEEN_PLUS|TWENTY_ONE_PLUS|UNRATED|AGES_5_AND_UNDER|AGES_6_TO_8|AGES_9_TO_11)$/.test(
          String(attributes[key])
        )
          ? attributes[key]
          : 'unrecognized or unavailable',
      ])
    ),
  };
}

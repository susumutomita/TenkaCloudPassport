/** Read-only release/listing inspection using the pinned EAS Metadata authentication route. */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import {
  applyReviewedListing,
  verifySavedListing,
} from './apply-store-listing.ts';

const action = process.argv[2] ?? 'inspect';
if (!['inspect', 'apply'].includes(action))
  throw new Error('Unknown store action');

const root = process.env['EAS_CLI_ROOT'];
if (!root) throw new Error('EAS_CLI_ROOT is required');
const cliRoot = root;
const load = createRequire(join(root, 'package.json'));
if (load('./package.json').version !== '21.0.2')
  throw new Error('Unexpected EAS CLI version');
const MetadataPull = load('./build/commands/metadata/pull').default;
const { CredentialsContext } = load('./build/credentials/context');
const { getAppStoreAuthAsync } = load('./build/metadata/auth');
const { getProfilesAsync } = load('./build/utils/profiles');
const { EasJsonAccessor } = load('@expo/eas-json');

let stage = 'EAS context';
class InspectStore extends MetadataPull {
  async runAsync() {
    const context = await Reflect.get(this, 'getContextAsync').call(
      this,
      MetadataPull,
      {
        nonInteractive: true,
        withServerSideEnvironment: null,
      }
    );
    const { actor, graphqlClient } = context.loggedIn;
    const { exp, projectId, projectDir } = context.privateProjectConfig;
    if (
      projectId !== '82efa217-a2ac-4209-a975-ea7198a51cda' ||
      exp.ios?.bundleIdentifier !== 'cloud.tenka.passport'
    ) {
      throw new Error('Unexpected project identity');
    }
    const result = await graphqlClient
      .query(
        `query ReleaseListingInspection($id: ID!) {
      builds { byId(buildId: $id) {
        id status appVersion appBuildVersion gitCommitHash project { id }
        submissions { id status appStoreConnectBuildUpload { version buildNumber uploadState
          appStoreConnectBuild { buildNumber processingState uploadedDate }
        } }
      } }
    }`,
        { id: '9007af67-0640-49f4-a593-b45cecb24e2c' }
      )
      .toPromise();
    if (result.error || !result.data)
      throw new Error('Release status lookup failed');
    const build = result.data.builds.byId;
    if (
      build.project.id !== projectId ||
      build.appVersion !== '1.3.0' ||
      build.appBuildVersion !== '15' ||
      build.gitCommitHash !== 'd42f0439639dfdb7b31d1560f83493a7cd4e73b8'
    ) {
      throw new Error('Release build identity mismatch');
    }
    console.log(JSON.stringify({ releaseBuild: build }));
    const profiles = await getProfilesAsync({
      type: 'submit',
      easJsonAccessor: EasJsonAccessor.fromProjectPath(projectDir),
      platforms: ['ios'],
      profileName: 'production',
      projectDir,
    });
    if (profiles.length !== 1) throw new Error('Unexpected submit profile');
    const credentialsCtx = new CredentialsContext({
      projectInfo: { exp, projectId },
      projectDir,
      user: actor,
      graphqlClient,
      analytics: context.analytics,
      nonInteractive: true,
      freezeCredentials: true,
      vcsClient: context.vcsClient,
    });
    stage = 'existing ASC authentication';
    const { app } = await getAppStoreAuthAsync({
      projectDir,
      profile: profiles[0].profile,
      exp,
      credentialsCtx,
      nonInteractive: true,
      graphqlClient,
      projectId,
    });
    if (app.id !== '6793516094') throw new Error('Unexpected App Store app');
    stage = 'Apple processing read';
    const { Build } = load('@expo/apple-utils');
    const builds = await Build.getAsync(app.context, {
      query: {
        limit: 10,
        filter: { app: app.id, version: '14,15' },
        includes: ['preReleaseVersion'],
      },
    });
    console.log(
      JSON.stringify({
        appleBuilds: builds.map(
          (item: {
            id: string;
            attributes: {
              version: unknown;
              processingState: unknown;
              uploadedDate: unknown;
              expired: unknown;
              preReleaseVersion?: { attributes: { version: string } };
            };
          }) => ({
            id: item.id,
            appId: app.id,
            appVersion: item.attributes.preReleaseVersion?.attributes.version,
            buildNumber: item.attributes.version,
            processingState: item.attributes.processingState,
            uploadedDate: item.attributes.uploadedDate,
            expired: item.attributes.expired,
          })
        ),
      })
    );
    stage = 'ASC listing read';
    const versions = await app.getAppStoreVersionsAsync({
      query: { limit: 20, filter: { platform: 'IOS' } },
    });
    for (const version of versions) {
      console.log(
        JSON.stringify({
          storeVersion: {
            id: version.id,
            version: version.attributes.versionString,
            state: version.attributes.appStoreState,
            releaseType: version.attributes.releaseType,
          },
        })
      );
      const locales = await version.getLocalizationsAsync();
      for (const locale of locales) {
        const { description, keywords, promotionalText, whatsNew } =
          locale.attributes;
        const sets = await locale.getAppScreenshotSetsAsync();
        console.log(
          JSON.stringify({
            listing: {
              version: version.attributes.versionString,
              locale: locale.attributes.locale,
              description,
              keywords,
              promotionalText,
              whatsNew,
              screenshots: sets.map(
                (set: {
                  attributes: {
                    screenshotDisplayType: string;
                    appScreenshots: {
                      id: string;
                      attributes: {
                        fileName: unknown;
                        fileSize: unknown;
                        assetDeliveryState: unknown;
                      };
                    }[];
                  };
                }) => ({
                  displayType: set.attributes.screenshotDisplayType,
                  files: set.attributes.appScreenshots.map((shot) => ({
                    id: shot.id,
                    name: shot.attributes.fileName,
                    bytes: shot.attributes.fileSize,
                    state: shot.attributes.assetDeliveryState,
                  })),
                })
              ),
            },
          })
        );
      }
    }
    if (action === 'inspect') {
      stage = 'saved listing read-only verification';
      await verifySavedListing({
        app,
        versions,
        builds,
        releaseBuild: build,
        projectDir,
        cliRoot,
      });
    }
    if (action === 'apply') {
      stage = 'reviewed listing application';
      await applyReviewedListing({
        app,
        versions,
        builds,
        releaseBuild: build,
        projectDir,
        cliRoot,
      });
    }
  }
}
try {
  await Reflect.get(InspectStore, 'run').call(InspectStore, [], root);
} catch (error) {
  // Do not serialize request contexts or credential-bearing exceptions.
  const message = error instanceof Error ? error.message : '';
  const reason = /401|UNAUTHORIZED/i.test(message)
    ? 'unauthorized'
    : /403|FORBIDDEN/i.test(message)
      ? 'forbidden'
      : /key type|key object|crypto|unsupported|does not support/i.test(message)
        ? 'unsupported authentication runtime'
        : /authState|Failed to authenticate/i.test(message)
          ? 'authentication not established'
          : /Failed to load app/i.test(message)
            ? 'target app unavailable'
            : /network|fetch|ENOTFOUND|ECONN|socket/i.test(message)
              ? 'network failure'
              : /400|bad request|query|parameter/i.test(message)
                ? 'request parameter rejected'
                : 'unclassified failure';
  console.error(
    action === 'inspect'
      ? 'Store inspection failed; no listing mutation was attempted.'
      : 'Store listing application failed; inspect current remote state before retry.',
    {
      stage,
      reason,
      error: error instanceof Error ? error.name : 'UnknownError',
    }
  );
  process.exitCode = 1;
}

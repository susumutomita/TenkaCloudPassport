import { expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

it('actually compiles native config with SecureStore backup exclusions and no unused FaceID prompt', async () => {
  const root = join(import.meta.dir, '..');
  const node = Bun.which('node');
  if (!node) throw new Error('Node is required by Expo config');
  const child = Bun.spawn(
    [
      node,
      join(root, 'node_modules/expo/bin/cli'),
      'config',
      '--type',
      'introspect',
      '--json',
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        EXPO_NO_TELEMETRY: '1',
        EXPO_NO_DOTENV: '1',
        EXPO_OFFLINE: '1',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    }
  );
  const [stdout, _stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code).toBe(0);
  const config = JSON.parse(stdout) as {
    _internal: {
      modResults: {
        android: {
          manifest: {
            manifest: { application: { $: Record<string, string> }[] };
          };
        };
        ios: { infoPlist: Record<string, unknown> };
      };
    };
  };
  const application =
    config._internal.modResults.android.manifest.manifest.application[0];
  if (!application) throw new Error('Missing compiled application');
  expect(application.$['android:fullBackupContent']).toBe(
    '@xml/secure_store_backup_rules'
  );
  expect(application.$['android:dataExtractionRules']).toBe(
    '@xml/secure_store_data_extraction_rules'
  );
  expect(
    Object.hasOwn(
      config._internal.modResults.ios.infoPlist,
      'NSFaceIDUsageDescription'
    )
  ).toBe(false);
  for (const file of [
    'secure_store_backup_rules.xml',
    'secure_store_data_extraction_rules.xml',
  ]) {
    const xml = await readFile(
      join(
        root,
        'node_modules/expo-secure-store/android/src/main/res/xml',
        file
      ),
      'utf8'
    );
    expect(xml).toContain('<exclude domain="sharedpref" path="SecureStore"/>');
  }
});

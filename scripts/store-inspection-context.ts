import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function isConfigurationRecord(
  value: unknown
): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  if (!isConfigurationRecord(value))
    throw new Error('Invalid Store inspection configuration');
  return value;
}

function child(value: Record<string, unknown>, key: string) {
  return record(Reflect.get(value, key));
}

function readConfig(directory: string, name: string) {
  try {
    return record(JSON.parse(readFileSync(join(directory, name), 'utf8')));
  } catch {
    throw new Error('Invalid Store inspection configuration');
  }
}

/** Source evidence is never read relative to the separate metadata project. */
export function storeInspectionSourceDirectory(
  sourceProjectDir: string,
  inspectionProjectDir: string,
  resolvedProjectDir: unknown
): string {
  if (resolvedProjectDir !== inspectionProjectDir)
    throw new Error('Unexpected Store inspection context directory');
  return sourceProjectDir;
}

/** Keep the historical metadata CLI separate from the current build project. */
export function validateStoreInspectionContext(
  sourceProjectDir: string,
  inspectionProjectDir: string
): void {
  if (
    resolve(inspectionProjectDir) !==
    resolve(sourceProjectDir, 'scripts/store-inspection-project')
  )
    throw new Error(
      'Run Store inspection from its historical metadata project'
    );
  const manifest = readConfig(inspectionProjectDir, 'package.json');
  if (
    Reflect.get(manifest, 'private') !== true ||
    Reflect.get(manifest, 'type') !== 'module' ||
    Reflect.get(manifest, 'name') !== 'passport-historical-store-inspection' ||
    Reflect.get(manifest, 'version') !== '0.0.0' ||
    Object.keys(manifest).sort().join(',') !== 'name,private,type,version'
  )
    throw new Error(
      'Store inspection project must remain private and dependency/script-free'
    );
  const sourceEas = readConfig(sourceProjectDir, 'eas.json');
  const metadataEas = readConfig(inspectionProjectDir, 'eas.json');
  if (
    Reflect.get(child(sourceEas, 'cli'), 'version') !== '>= 25.3.0' ||
    Reflect.get(child(metadataEas, 'cli'), 'version') !== '21.0.2' ||
    Object.hasOwn(metadataEas, 'build')
  )
    throw new Error(
      'Store inspection and production CLI contracts must remain separate'
    );
  const sourceApp = child(readConfig(sourceProjectDir, 'app.json'), 'expo');
  const metadataApp = child(
    readConfig(inspectionProjectDir, 'app.json'),
    'expo'
  );
  for (const app of [sourceApp, metadataApp]) {
    if (
      Reflect.get(child(child(app, 'extra'), 'eas'), 'projectId') !==
        '82efa217-a2ac-4209-a975-ea7198a51cda' ||
      Reflect.get(child(app, 'ios'), 'bundleIdentifier') !==
        'cloud.tenka.passport' ||
      Reflect.get(app, 'slug') !== 'tenkacloud-passport'
    )
      throw new Error('Unexpected Store inspection project identity');
  }
  if (
    Reflect.get(metadataApp, 'version') !== '1.3.0' ||
    Object.hasOwn(metadataApp, 'plugins')
  )
    throw new Error(
      'Store inspection context must retain the historical metadata target'
    );
  for (const config of [sourceEas, metadataEas]) {
    const ios = child(child(child(config, 'submit'), 'production'), 'ios');
    if (
      Reflect.get(ios, 'ascAppId') !== '6793516094' ||
      Object.keys(ios).join(',') !== 'ascAppId'
    )
      throw new Error('Unexpected Store inspection submit identity');
  }
}

import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));

function read(relativePath: string): Promise<string> {
  return readFile(path.join(repositoryRoot, relativePath), 'utf8');
}

/**
 * `ios-release` ワークフローは EAS Build と Submit を回すだけで、GitHub Release を
 * 作らなかった。タグを打っても Releases ページに何も出ず、配信の記録が TestFlight
 * 側にしか残らない状態だったため Release 作成を足した。ここではその契約を固定する。
 */
describe('ios-release ワークフローの GitHub Release 作成契約', () => {
  it('Build と Submit が成功した後にだけ Release を作る', async () => {
    const workflow = await read('.github/workflows/ios-release.yml');
    const submitIndex = workflow.indexOf(
      'name: Trigger EAS Build and submit to TestFlight'
    );
    const releaseIndex = workflow.indexOf(
      'name: Create GitHub Release for the tag'
    );

    expect(submitIndex).toBeGreaterThan(-1);
    expect(releaseIndex).toBeGreaterThan(submitIndex);
  });

  it('タグ以外の ref で回したときは Release を作らない', async () => {
    const workflow = await read('.github/workflows/ios-release.yml');

    expect(workflow).toContain("github.ref_type == 'tag'");
  });

  it('EXPO_TOKEN が無いときは Release も作らない（配信していない Release を残さない）', async () => {
    const workflow = await read('.github/workflows/ios-release.yml');
    const releaseStep = workflow.slice(
      workflow.indexOf('name: Create GitHub Release for the tag')
    );
    const condition = releaseStep.slice(0, releaseStep.indexOf('env:'));

    expect(condition).toContain(
      "steps.check-secrets.outputs.expo_token_present == 'true'"
    );
  });

  it('既存 Release を上書きしない', async () => {
    const workflow = await read('.github/workflows/ios-release.yml');

    expect(workflow).toContain('gh release view "$RELEASE_TAG"');
    expect(workflow).toContain('already exists');
  });

  it('Release Notes を CHANGELOG から取り、節が無ければ fail する', async () => {
    const workflow = await read('.github/workflows/ios-release.yml');

    expect(workflow).toContain('CHANGELOG.md > release-notes.md');
    expect(workflow).toContain('--notes-file release-notes.md');
    expect(workflow).toContain('has no section for');
  });

  it('タグが実在することを確かめてから Release を作る', async () => {
    const workflow = await read('.github/workflows/ios-release.yml');

    expect(workflow).toContain('--verify-tag');
  });

  it('contents: write は Release を作る job にだけ与え、workflow 既定は read のままにする', async () => {
    const workflow = await read('.github/workflows/ios-release.yml');
    // コメント行の散文は設定ではないため除いてから、実際の YAML だけを検査する。
    const settings = workflow
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');
    const jobsIndex = settings.indexOf('jobs:');

    expect(settings.slice(0, jobsIndex)).toContain(
      'permissions:\n  contents: read'
    );
    expect(settings.slice(0, jobsIndex)).not.toContain('contents: write');
    expect(settings.slice(jobsIndex)).toContain('    permissions:\n');
    expect(settings.slice(jobsIndex)).toContain('      contents: write');
  });

  it('CHANGELOG は app.json の現行バージョンの節を持つ（タグ時に Release Notes を作れる）', async () => {
    const appMetadata = JSON.parse(await read('app.json'));
    const version = Reflect.get(
      Reflect.get(appMetadata, 'expo'),
      'version'
    ) as string;
    const changelog = await read('CHANGELOG.md');

    expect(changelog).toContain(`## [${version}]`);
  });
});

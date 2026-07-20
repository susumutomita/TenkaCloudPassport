import { describe, expect, it } from 'bun:test';
import { stat } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.join(import.meta.dir, '..');

function record(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function field(
  value: Record<string, unknown> | undefined,
  key: string
): unknown {
  return value === undefined ? undefined : Reflect.get(value, key);
}

function workflowSteps(
  job: Record<string, unknown> | undefined
): readonly Record<string, unknown>[] {
  const values = field(job, 'steps');
  return Array.isArray(values)
    ? values.map(record).filter((step) => step !== undefined)
    : [];
}

function workflowSetupViolations(
  document: Record<string, unknown> | undefined,
  validateJob: Record<string, unknown> | undefined,
  validateSteps: readonly Record<string, unknown>[]
): readonly string[] {
  const violations: string[] = [];
  const checkout = validateSteps.find((step) =>
    String(field(step, 'uses') ?? '').startsWith('actions/checkout@')
  );
  const setupBun = validateSteps.find((step) =>
    String(field(step, 'uses') ?? '').startsWith('oven-sh/setup-bun@')
  );
  const checkoutIndex =
    checkout === undefined ? -1 : validateSteps.indexOf(checkout);
  if (
    checkoutIndex <= 0 ||
    !String(field(validateSteps[0], 'run') ?? '').includes('^[0-9a-f]{40}$')
  ) {
    violations.push('dispatch syntax must be validated before checkout');
  }
  if (field(record(field(document, 'permissions')), 'contents') !== 'read') {
    violations.push('workflow default permissions must be contents read');
  }
  if (field(record(field(checkout, 'with')), 'persist-credentials') !== false) {
    violations.push('checkout credentials must not persist');
  }
  if (
    field(record(field(checkout, 'with')), 'ref') !==
    `\${{ inputs.candidate_commit }}`
  ) {
    violations.push('checkout must use the fixed candidate commit input');
  }
  if (field(record(field(checkout, 'with')), 'fetch-depth') !== 0) {
    violations.push('checkout must fetch the existing release tag');
  }
  if (
    field(record(field(setupBun, 'with')), 'bun-version-file') !==
    'package.json'
  ) {
    violations.push('Bun version must come from package.json');
  }
  if (field(validateJob, 'if') !== "github.ref == 'refs/heads/main'") {
    violations.push('validation must use the default-branch workflow');
  }
  return violations;
}

function workflowControlViolations(
  document: Record<string, unknown> | undefined,
  validateJob: Record<string, unknown> | undefined,
  publishJob: Record<string, unknown> | undefined
): readonly string[] {
  const violations: string[] = [];
  const trigger = record(field(document, 'on'));
  const triggerNames = Object.keys(trigger ?? {});
  const dispatch = record(field(trigger, 'workflow_dispatch'));
  const inputs = record(field(dispatch, 'inputs'));
  if (
    triggerNames.length !== 1 ||
    triggerNames[0] !== 'workflow_dispatch' ||
    !['version', 'candidate_commit', 'release_tag'].every(
      (name) => field(record(field(inputs, name)), 'required') === true
    )
  ) {
    violations.push('workflow must use required manual release inputs only');
  }
  const concurrency = record(field(document, 'concurrency'));
  if (
    field(concurrency, 'group') !==
      `source-release-\${{ inputs.release_tag }}` ||
    field(concurrency, 'cancel-in-progress') !== false
  ) {
    violations.push('workflow must serialize each release tag');
  }
  if (
    field(publishJob, 'if') !== "github.ref == 'refs/heads/main'" ||
    field(publishJob, 'environment') !== 'oss-alpha-draft'
  ) {
    violations.push('publish must stay behind the main workflow environment');
  }
  const allSteps = [
    ...workflowSteps(validateJob),
    ...workflowSteps(publishJob),
  ];
  if (
    allSteps.some((step) => {
      const action = field(step, 'uses');
      return (
        typeof action === 'string' && !/^[^@\s]+@[0-9a-f]{40}$/.test(action)
      );
    })
  ) {
    violations.push('all actions must use full commit SHAs');
  }
  return violations;
}

function workflowRunText(job: Record<string, unknown> | undefined): string {
  return workflowSteps(job)
    .map((step) => String(field(step, 'run') ?? ''))
    .join('\n');
}

function hasStrictHandoff(
  validateText: string,
  publishText: string,
  publishRunText: string
): boolean {
  return (
    (validateText.match(/make release_verify/g) ?? []).length >= 3 &&
    validateText.includes('shasum -a 256 -c bundle-checksums.txt') &&
    publishText.includes('shasum -a 256 -c bundle-checksums.txt') &&
    !publishRunText.includes('shasum -a 256 -c bundle-checksums.txt ||') &&
    publishRunText.includes('actual_files') &&
    publishRunText.includes('actual_checksum_targets') &&
    !publishRunText.includes('candidate/*')
  );
}

function hasProtectedReleaseControls(
  publishText: string,
  publishRunText: string
): boolean {
  return (
    publishText.includes('OSS_ALPHA_TAG_RULESET_ID') &&
    publishText.includes('secrets.OSS_ALPHA_RULESET_AUDIT_TOKEN') &&
    publishRunText.includes('required_reviewers') &&
    publishRunText.includes('.prevent_self_review == true') &&
    publishRunText.includes('test -n "$RULESET_AUDIT_TOKEN"') &&
    publishRunText.includes(
      'test "$RULESET_AUDIT_TOKEN" != "$GITHUB_API_TOKEN"'
    ) &&
    publishRunText.includes(
      'GH_TOKEN="$RULESET_AUDIT_TOKEN" gh api "repos/$GH_REPO/rulesets/$TAG_RULESET_ID"'
    ) &&
    publishRunText.includes('has("bypass_actors")') &&
    publishRunText.includes('.bypass_actors | type == "array"') &&
    publishRunText.includes('.bypass_actors | length == 0') &&
    publishRunText.includes(
      '.conditions.ref_name.include == ["refs/tags/v*"]'
    ) &&
    publishRunText.includes('.conditions.ref_name.exclude == []') &&
    publishRunText.includes('index("update")') &&
    publishRunText.includes('index("deletion")')
  );
}

function workflowTrustViolations(
  validateText: string,
  validateRunText: string,
  publishText: string,
  publishRunText: string
): readonly string[] {
  const violations: string[] = [];
  if (
    !validateText.includes('git rev-list -n 1') ||
    !validateRunText.includes(
      'git merge-base --is-ancestor "$RELEASE_REF_INPUT" "$GITHUB_SHA"'
    )
  ) {
    violations.push(
      'validation must bind a main ancestor tag to the candidate'
    );
  }
  if (!hasProtectedReleaseControls(publishText, publishRunText)) {
    violations.push('publish must fail closed on environment and tag controls');
  }
  if (
    !publishRunText.includes('Accept: application/vnd.github.sha') ||
    !publishRunText.includes('test "$remote_tag_commit" = "$RELEASE_REF_INPUT"')
  ) {
    violations.push('publish must revalidate tag and candidate identity');
  }
  return violations;
}

function workflowJobViolations(
  validateJob: Record<string, unknown> | undefined,
  publishJob: Record<string, unknown> | undefined
): readonly string[] {
  if (validateJob === undefined || publishJob === undefined) {
    return ['validation and publish jobs must both exist'];
  }
  const violations: string[] = [];
  const needs = field(publishJob, 'needs');
  if (needs !== 'validate-source-candidate') {
    violations.push('publish must depend on validation');
  }
  if (field(record(field(publishJob, 'permissions')), 'contents') !== 'write') {
    violations.push('only publish receives contents write');
  }
  const validateText = JSON.stringify(validateJob);
  const publishText = JSON.stringify(publishJob);
  const validateRunText = workflowRunText(validateJob);
  const publishRunText = workflowRunText(publishJob);
  if (!validateText.includes('actions/upload-artifact@')) {
    violations.push('validation must upload the reviewed bundle');
  }
  if (!publishText.includes('actions/download-artifact@')) {
    violations.push('publish must download the reviewed bundle');
  }
  if (/actions\/checkout@|setup-bun@|make before-commit/.test(publishText)) {
    violations.push('write job must not execute repository code');
  }
  if (
    workflowSteps(publishJob).some((step) =>
      String(field(step, 'run') ?? '').includes('make ')
    )
  ) {
    violations.push('write job must not execute Make targets');
  }
  const releaseStep = workflowSteps(publishJob).find((step) =>
    String(field(step, 'run') ?? '').includes('gh release create')
  );
  if (
    field(record(field(releaseStep, 'env')), 'GH_REPO') !==
    `\${{ github.repository }}`
  ) {
    violations.push('checkout-free publish must declare GH_REPO');
  }
  if (!hasStrictHandoff(validateText, publishText, publishRunText)) {
    violations.push('strict output and checksums must survive handoff');
  }
  violations.push(
    ...workflowTrustViolations(
      validateText,
      validateRunText,
      publishText,
      publishRunText
    )
  );
  return violations;
}

function sourceWorkflowViolations(source: string): readonly string[] {
  const document = record(Bun.YAML.parse(source));
  const jobs = record(field(document, 'jobs'));
  const validateJob = record(field(jobs, 'validate-source-candidate'));
  const publishJob = record(field(jobs, 'publish-draft'));
  return [
    ...workflowSetupViolations(
      document,
      validateJob,
      workflowSteps(validateJob)
    ),
    ...workflowControlViolations(document, validateJob, publishJob),
    ...workflowJobViolations(validateJob, publishJob),
  ];
}

async function read(relativePath: string): Promise<string> {
  return Bun.file(path.join(repositoryRoot, relativePath)).text();
}

function markdownRowsAfter(
  source: string,
  heading: string
): readonly string[][] {
  const headingIndex = source.indexOf(heading);
  if (headingIndex < 0) return [];
  const afterHeading = source.slice(headingIndex + heading.length);
  const nextHeading = afterHeading.search(/\n##? /);
  const section =
    nextHeading < 0 ? afterHeading : afterHeading.slice(0, nextHeading);
  return section
    .split('\n')
    .filter((line) => /^\|.+\|$/.test(line))
    .slice(2)
    .map((line) =>
      line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim())
    );
}

function relativeMarkdownLinks(source: string): readonly string[] {
  return [...source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map(([, target]) => target)
    .filter(
      (target): target is string =>
        target !== undefined &&
        !target.startsWith('http://') &&
        !target.startsWith('https://') &&
        !target.startsWith('#')
    )
    .map((target) => target.split('#')[0] ?? target);
}

async function expectLinksToExist(
  documentPath: string,
  source: string
): Promise<void> {
  for (const target of relativeMarkdownLinks(source)) {
    const resolved = path.resolve(
      repositoryRoot,
      path.dirname(documentPath),
      target
    );
    expect(resolved.startsWith(`${repositoryRoot}${path.sep}`)).toBe(true);
    expect(
      await stat(resolved).then(
        () => true,
        () => false
      )
    ).toBe(true);
  }
}

describe('Issue 29: OSS Alpha の初回導線契約', () => {
  it('日本語と英語の冒頭で Product 境界と Public Release 停止を自己完結して説明する', async () => {
    const [japanese, english] = await Promise.all([
      read('README.md'),
      read('README.en.md'),
    ]);
    // Issue 80: 「何ができるか」「2 分で試す」の 2 節を冒頭へ追加した分、Product
    // 境界（旧「デジタル名刺ではありません」→ 自己紹介カード軸の説明）から
    // Release 状態表までの距離が伸びた。英語版は同じ内容でも文字数が多いため、
    // 日本語側だけが収まる 1,500 文字では英語側の "Public OSS Alpha" / "Blocked"
    // が窓の外に出る。「冒頭で自己完結する」という契約の意図は変えず、窓を
    // 2 節分だけ広げる。
    const windowSize = 2_800;

    expect(japanese.slice(0, windowSize)).toContain(
      '名刺がなくても自己紹介を渡せる'
    );
    expect(japanese.slice(0, windowSize)).toContain('Public OSS Alpha');
    expect(japanese.slice(0, windowSize)).toContain('Blocked');
    expect(english.slice(0, windowSize)).toContain(
      'an introduction without a business'
    );
    expect(english.slice(0, windowSize)).toContain('Public OSS Alpha');
    expect(english.slice(0, windowSize)).toContain('Blocked');
    expect(english).not.toMatch(/[ぁ-んァ-ン一-龠]/);
    for (const source of [japanese, english]) {
      const normalized = source.toLowerCase();
      expect(normalized).toContain('repository gate');
      expect(normalized).toContain('web');
      expect(normalized).toContain('expo go');
      expect(normalized).toContain('native development build');
      expect(normalized).toContain('shasum -a 256 -c checksums.txt');
    }
  });

  it('README の Repository 内 Link は Source Archive 内に実在する', async () => {
    const [japanese, english] = await Promise.all([
      read('README.md'),
      read('README.en.md'),
    ]);

    await expectLinksToExist('README.md', japanese);
    await expectLinksToExist('README.en.md', english);
  });
});

describe('Issue 29: Architecture と状態 Matrix の非誇張契約', () => {
  it('図と同等 Text が Domain、Agent、Rules、Local LLM、Storage、QR、Nearby の依存を説明する', async () => {
    const architecture = await read('docs/architecture/overview.md');

    expect(architecture).toContain('```mermaid');
    for (const term of [
      'Domain',
      'Application orchestration',
      'Rules Provider',
      'Local LLM',
      'Storage',
      'QR',
      'Nearby Transport',
      '図を使わない同等説明',
    ]) {
      expect(architecture).toContain(term);
    }
  });

  it('Feature / Device / Model / Transport の全 Row が閉じた状態と根拠を持つ', async () => {
    const status = await read('docs/releases/status.md');
    const featureRows = markdownRowsAfter(status, '## Feature Matrix');
    const deviceRows = markdownRowsAfter(status, '## Device / OS Matrix');
    const modelRows = markdownRowsAfter(status, '## Model Matrix');
    const transportRows = markdownRowsAfter(status, '## Transport Matrix');

    expect(featureRows.length).toBeGreaterThanOrEqual(10);
    expect(deviceRows.length).toBeGreaterThanOrEqual(6);
    expect(modelRows.length).toBeGreaterThanOrEqual(3);
    expect(transportRows.length).toBeGreaterThanOrEqual(3);
    for (const row of [
      ...featureRows,
      ...deviceRows,
      ...modelRows,
      ...transportRows,
    ]) {
      expect(row.every((cell) => cell.length > 0)).toBe(true);
    }
    for (const [, maturity] of featureRows) {
      expect(['`Implemented`', '`Experimental`', '`Planned`']).toContain(
        maturity ?? ''
      );
    }
    expect(status).toContain('Draft PR 48 is not on default branch');
    expect(status).toContain('`Not run`: iPhone / Android arm64 GGUF');
    expect(status).toContain('Public OSS Alpha: `Blocked`');
    expect(status).toContain('Candidate commit: `Not fixed`');
    expect(status).not.toContain('| `Verified` 2026-07-18:');
  });
});

describe('Issue 29: Release Gate と Version の一致契約', () => {
  it('Checklist は Repository と物理証拠を分け、Not run が残る Public 公開を止める', async () => {
    const checklist = await read('docs/releases/checklist.md');

    for (const gate of [
      'Privacy',
      'Security',
      'Accessibility',
      'Offline E2E',
      'バックアップ round-trip',
      'Full delete',
    ]) {
      expect(checklist).toContain(`| ${gate} |`);
    }
    expect(checklist).toContain('Public OSS Alpha を公開しません');
    expect(checklist).toContain('`Not run`');
    expect(checklist).toContain('Repository evidence');
    expect(checklist).toContain('Physical / human evidence');
  });

  it('Source Candidate と Platform App Version を各正本へ一致させる', async () => {
    const packageMetadata = await Bun.file(
      path.join(repositoryRoot, 'package.json')
    ).json();
    const appMetadata = await Bun.file(
      path.join(repositoryRoot, 'app.json')
    ).json();
    const version = Reflect.get(packageMetadata, 'version');
    expect(version).toBe('0.1.0-alpha.1');
    expect(Reflect.get(Reflect.get(appMetadata, 'expo'), 'version')).toBe(
      '0.1.0'
    );

    for (const relativePath of [
      'CHANGELOG.md',
      'README.md',
      'README.en.md',
      'docs/releases/0.1.0-alpha.1.md',
      'docs/development/source-release.md',
    ]) {
      expect(await read(relativePath)).toContain('0.1.0-alpha.1');
    }
  });

  it('Workflow は2回生成を比較し、新しい Draft だけを作る', async () => {
    const workflow = await read('.github/workflows/source-release.yml');

    expect(workflow).toContain('source-release-first');
    expect(workflow).toContain('source-release-second');
    expect(workflow).toContain('diff --recursive --brief');
    expect(workflow).toContain('--draft');
    expect(workflow).toContain('--verify-tag');
    expect(workflow).toContain('refusing to overwrite');
    expect(workflow).toContain('^v[0-9A-Za-z.+-]+$');
    expect(workflow).not.toContain('continue-on-error');
    expect(workflow).not.toContain('--latest');
    expect(sourceWorkflowViolations(workflow)).toEqual([]);
    expect(
      sourceWorkflowViolations(
        workflow.replace('contents: read', 'contents: write')
      )
    ).toContain('workflow default permissions must be contents read');
    expect(
      sourceWorkflowViolations(
        workflow.replace(
          'persist-credentials: false',
          'persist-credentials: true'
        )
      )
    ).toContain('checkout credentials must not persist');
    expect(
      sourceWorkflowViolations(
        workflow.replace(
          'needs: validate-source-candidate',
          'needs: missing-validation'
        )
      )
    ).toContain('publish must depend on validation');
    expect(
      sourceWorkflowViolations(
        workflow.replaceAll(
          `GH_REPO: \${{ github.repository }}`,
          'GH_REPOSITORY: missing'
        )
      )
    ).toContain('checkout-free publish must declare GH_REPO');
    expect(
      sourceWorkflowViolations(workflow.replace('workflow_dispatch:', 'push:'))
    ).toContain('workflow must use required manual release inputs only');
    expect(
      sourceWorkflowViolations(
        workflow.replace(
          'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5',
          'actions/checkout@main'
        )
      )
    ).toContain('all actions must use full commit SHAs');
    expect(
      sourceWorkflowViolations(
        workflow.replace(
          'git merge-base --is-ancestor "$RELEASE_REF_INPUT" "$GITHUB_SHA"',
          'echo ancestry-not-validated'
        )
      )
    ).toContain('validation must bind a main ancestor tag to the candidate');
    expect(
      sourceWorkflowViolations(
        workflow.replace(
          'test "$remote_tag_commit" = "$RELEASE_REF_INPUT"',
          'echo tag-not-revalidated'
        )
      )
    ).toContain('publish must revalidate tag and candidate identity');
    for (const weakenedControl of [
      workflow.replace(
        `          RULESET_AUDIT_TOKEN: \${{ secrets.OSS_ALPHA_RULESET_AUDIT_TOKEN }}\n`,
        ''
      ),
      workflow.replace(
        'GH_TOKEN="$RULESET_AUDIT_TOKEN" gh api "repos/$GH_REPO/rulesets/$TAG_RULESET_ID"',
        'GH_TOKEN="$GITHUB_API_TOKEN" gh api "repos/$GH_REPO/rulesets/$TAG_RULESET_ID"'
      ),
      workflow.replace('            has("bypass_actors") and\n', ''),
      workflow.replace(
        '            (.bypass_actors | length == 0) and',
        '            (.bypass_actors | length > 0) and'
      ),
      workflow.replace(
        '            (.conditions.ref_name.exclude == []) and',
        '            (.conditions.ref_name.exclude == ["refs/tags/v0*"]) and'
      ),
    ]) {
      expect(sourceWorkflowViolations(weakenedControl)).toContain(
        'publish must fail closed on environment and tag controls'
      );
    }
    expect(
      sourceWorkflowViolations(
        workflow.replace(
          'cd release-bundle\n            shasum -a 256 -c bundle-checksums.txt',
          'cd release-bundle\n            shasum -a 256 -c bundle-checksums.txt || true'
        )
      )
    ).toContain('strict output and checksums must survive handoff');
    expect(
      sourceWorkflowViolations(
        workflow.replace(
          '            release-bundle/candidate/LICENSE \\\n',
          '            release-bundle/candidate/* \\\n'
        )
      )
    ).toContain('strict output and checksums must survive handoff');
  });

  it('Release toolchain は packageManager の Bun Version に固定する', async () => {
    const [readme, english, workflow, packageSource, makefile] =
      await Promise.all([
        read('README.md'),
        read('README.en.md'),
        read('.github/workflows/source-release.yml'),
        read('package.json'),
        read('Makefile'),
      ]);

    expect(packageSource).toContain('"packageManager": "bun@1.3.11"');
    expect(readme).toContain('Bun 1.3.11');
    expect(english).toContain('Bun 1.3.11');
    expect(workflow).toContain('bun-version-file: package.json');
    expect(makefile).toContain('release_test_coverage:');
    expect(makefile).toMatch(/before-commit:.*\brelease_test_coverage\b/);
  });
});

describe('Issue 29: Contributor Scope の準備契約', () => {
  it('Contributor Guide、Template、独立した候補3件を Product Boundary 内に用意する', async () => {
    const [guide, candidates, template] = await Promise.all([
      read('CONTRIBUTING.md'),
      read('docs/contributing/good-first-issues.md'),
      read('.github/ISSUE_TEMPLATE/good-first-issue.yml'),
    ]);

    expect(guide).toContain('Product Boundary');
    expect(guide).toContain(
      '文書内の候補だけを Public Release の受け入れ証拠にはしません'
    );
    expect(candidates.match(/^## \d+\./gm)).toHaveLength(3);
    expect(candidates).toContain('実在する Open Issue');
    expect(template).toContain('good first issue');
    expect(template).toContain('Out of scope');
  });
});

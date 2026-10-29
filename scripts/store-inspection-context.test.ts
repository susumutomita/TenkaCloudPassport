import { afterEach, expect, it } from 'bun:test';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  storeInspectionSourceDirectory,
  validateStoreInspectionContext,
} from './store-inspection-context';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  // macOS exposes /var through /private/var. Node's cwd is canonical while
  // Bun's tmpdir may retain the alias; compare the same real directory.
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), 'passport-store-context-'))
  );
  roots.push(root);
  const inspection = join(root, 'scripts/store-inspection-project');
  mkdirSync(inspection, { recursive: true });
  const repository = resolve(import.meta.dir, '..');
  for (const file of ['app.json', 'eas.json'])
    writeFileSync(join(root, file), readFileSync(join(repository, file)));
  for (const file of ['app.json', 'eas.json', 'package.json'])
    writeFileSync(
      join(inspection, file),
      readFileSync(join(repository, 'scripts/store-inspection-project', file))
    );
  return { root, inspection };
}
function change(
  directory: string,
  file: string,
  mutate: (value: Record<string, unknown>) => void
) {
  const value = JSON.parse(readFileSync(join(directory, file), 'utf8'));
  mutate(value);
  writeFileSync(join(directory, file), JSON.stringify(value));
}

function mockCli(root: string, wrongContext: boolean, version: string) {
  const cli = join(root, 'fake-eas-cli');
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ version }),
    'build/commands/metadata/pull.js': `
      if(process.env.EXPO_NO_DOTENV!=='1') throw new Error('Dotenv must be disabled before metadata imports');
      module.exports.default=class {
        static async run(){await new this().runAsync()}
        async getContextAsync(){
          const projectDir=${wrongContext ? 'require("node:path").resolve(process.cwd(),"../..")' : 'process.cwd()'};
          console.log(JSON.stringify({testContext:{projectDir,dotenv:process.env.EXPO_NO_DOTENV}}));
          return {
            loggedIn:{actor:{id:'synthetic-actor'},graphqlClient:{query(document){
              if(!document.trim().startsWith('query')) throw new Error('Mutation attempted');
              return {toPromise:async()=>({data:{builds:{byId:{
                project:{id:'82efa217-a2ac-4209-a975-ea7198a51cda'},appVersion:'1.3.0',appBuildVersion:'15',
                gitCommitHash:'d42f0439639dfdb7b31d1560f83493a7cd4e73b8',status:'FINISHED',submissions:[]
              }}}})};
            }}},
            privateProjectConfig:{projectDir,projectId:'82efa217-a2ac-4209-a975-ea7198a51cda',
              exp:{ios:{bundleIdentifier:'cloud.tenka.passport'}}},analytics:{},vcsClient:{}
          };
        }
      };
    `,
    'build/utils/profiles.js': `module.exports.getProfilesAsync=async(input)=>{
      const config=JSON.parse(require('node:fs').readFileSync(require('node:path').join(input.projectDir,'eas.json'),'utf8'));
      if(config.cli.version!=='21.0.2'||input.easJsonAccessor!==input.projectDir)throw new Error('Wrong profile context');
      console.log(JSON.stringify({testProfile:input.projectDir}));
      return [{profile:config.submit.production.ios}];
    };`,
    'build/credentials/context.js': `module.exports.CredentialsContext=class{
      constructor(input){if(input.freezeCredentials!==true)throw new Error('Credential creation must remain frozen');
      console.log(JSON.stringify({testCredentials:{projectDir:input.projectDir,frozen:input.freezeCredentials}}));}
    };`,
    'build/metadata/auth.js': `module.exports.getAppStoreAuthAsync=async(input)=>{
      console.log(JSON.stringify({testAuth:input.projectDir}));
      return {app:{id:'6793516094',context:{},getAppInfoAsync:async()=>[],getAppStoreVersionsAsync:async()=>[]}};
    };`,
    'node_modules/@expo/eas-json/index.js':
      'module.exports.EasJsonAccessor={fromProjectPath:directory=>directory};',
    'node_modules/@expo/apple-utils/index.js':
      'module.exports.Build={getAsync:async()=>[]};',
  };
  for (const [name, contents] of Object.entries(files)) {
    const target = join(cli, name);
    mkdirSync(resolve(target, '..'), { recursive: true });
    writeFileSync(target, contents);
  }
  return cli;
}

it.each(['inspection', 'wrong-context', 'wrong-cli'] as const)(
  'routes the actual adapter through a metadata-only context with trapped remote operations: %s',
  async (mode) => {
    const { root, inspection } = fixture();
    const repository = resolve(import.meta.dir, '..');
    for (const name of [
      'inspect-store-listing.ts',
      'apply-store-listing.ts',
      'store-inspection-context.ts',
    ])
      writeFileSync(
        join(root, 'scripts', name),
        readFileSync(join(repository, 'scripts', name))
      );
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ private: true, type: 'module' })
    );
    writeFileSync(
      join(root, 'store.config.json'),
      JSON.stringify({ apple: { version: 'invalid-fixture', info: {} } })
    );
    mkdirSync(join(root, 'docs/release'), { recursive: true });
    writeFileSync(
      join(root, 'docs/release/app-store-submission-1.3.0.md'),
      '## 審査用 Notes 案\nSynthetic approved notes\n## End\n'
    );
    const cli = mockCli(
      root,
      mode === 'wrong-context',
      mode === 'wrong-cli' ? '25.3.0' : '21.0.2'
    );
    const node = Bun.which('node');
    if (!node)
      throw new Error('Node is required for the Store adapter runtime');
    const process = Bun.spawn(
      [
        node,
        '--experimental-strip-types',
        '../inspect-store-listing.ts',
        'inspect',
      ],
      {
        cwd: inspection,
        env: {
          PATH: '/usr/bin:/bin',
          EAS_CLI_ROOT: cli,
          EXPO_NO_DOTENV: '0',
          CI: '1',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      }
    );
    const [stdout, stderr, exit] = await Promise.all([
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
      process.exited,
    ]);
    expect(exit).toBe(1);
    if (mode === 'wrong-cli') {
      expect(stderr).toContain('Unexpected EAS CLI version');
      expect(stdout).not.toContain('testContext');
    } else if (mode === 'wrong-context') {
      expect(stderr).toContain("stage: 'EAS context'");
      expect(stdout).not.toContain('testProfile');
    } else {
      const rows = stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      expect(rows).toContainEqual({
        testContext: { projectDir: inspection, dotenv: '1' },
      });
      expect(rows).toContainEqual({ testProfile: inspection });
      expect(rows).toContainEqual({
        testCredentials: { projectDir: inspection, frozen: true },
      });
      expect(rows).toContainEqual({ testAuth: inspection });
      expect(
        rows.some(
          (row) => row.reviewReadinessReadOnly?.submissionAttempted === false
        )
      ).toBe(true);
      expect(stderr).toContain("stage: 'saved listing read-only verification'");
      expect(stderr).toContain('no listing mutation was attempted');
    }
  }
);

it('accepts the separate historical context without changing current production or historical evidence', () => {
  const { root, inspection } = fixture();
  const files = [
    join(root, 'eas.json'),
    join(root, 'app.json'),
    join(inspection, 'eas.json'),
    join(inspection, 'app.json'),
  ];
  const before = files.map((file) => readFileSync(file));
  validateStoreInspectionContext(root, inspection);
  expect(files.map((file) => readFileSync(file))).toEqual(before);
});

it('rejects a source-root or foreign working directory before context resolution', () => {
  const { root, inspection } = fixture();
  expect(() => validateStoreInspectionContext(root, root)).toThrow(
    'historical metadata project'
  );
  expect(() =>
    validateStoreInspectionContext(root, join(inspection, 'foreign'))
  ).toThrow('historical metadata project');
});

it('anchors evidence reads to the source root only after verifying the resolved metadata directory', () => {
  const { root, inspection } = fixture();
  expect(storeInspectionSourceDirectory(root, inspection, inspection)).toBe(
    root
  );
  expect(() => storeInspectionSourceDirectory(root, inspection, root)).toThrow(
    'Unexpected Store inspection context directory'
  );
  expect(() => storeInspectionSourceDirectory(root, inspection, null)).toThrow(
    'Unexpected Store inspection context directory'
  );
});

it.each(['null', '[]', '42', '{invalid'])(
  'rejects malformed configuration without exposing its contents: %s',
  (contents) => {
    const { root, inspection } = fixture();
    writeFileSync(join(inspection, 'eas.json'), contents);
    expect(() => validateStoreInspectionContext(root, inspection)).toThrow(
      'Invalid Store inspection configuration'
    );
  }
);

it.each([
  'source-cli',
  'metadata-cli',
  'build-profile',
  'package-scripts',
  'package-dependencies',
  'package-public',
])(
  'rejects mixing build or executable package settings into metadata context: %s',
  (fault) => {
    const { root, inspection } = fixture();
    if (fault === 'source-cli')
      change(root, 'eas.json', (value) => {
        value['cli'] = { version: '21.0.2' };
      });
    if (fault === 'metadata-cli')
      change(inspection, 'eas.json', (value) => {
        value['cli'] = { version: '>= 25.3.0' };
      });
    if (fault === 'build-profile')
      change(inspection, 'eas.json', (value) => {
        value['build'] = { production: {} };
      });
    if (fault === 'package-scripts')
      change(inspection, 'package.json', (value) => {
        value['scripts'] = { prepare: 'unexpected' };
      });
    if (fault === 'package-dependencies')
      change(inspection, 'package.json', (value) => {
        value['dependencies'] = { expo: '*' };
      });
    if (fault === 'package-public')
      change(inspection, 'package.json', (value) => {
        value['private'] = false;
      });
    expect(() => validateStoreInspectionContext(root, inspection)).toThrow();
  }
);

it.each([
  'root-project',
  'metadata-project',
  'bundle',
  'slug',
  'target-version',
  'plugins',
  'source-submit',
  'metadata-submit',
  'credential-field',
])(
  'rejects changing the existing identity, target or authority: %s',
  (fault) => {
    const { root, inspection } = fixture();
    const file =
      fault.endsWith('submit') || fault === 'credential-field'
        ? 'eas.json'
        : 'app.json';
    const directory =
      fault.startsWith('root') || fault === 'source-submit' ? root : inspection;
    change(directory, file, (value) => {
      if (fault.endsWith('project'))
        value['expo'] = {
          extra: { eas: { projectId: 'foreign' } },
          ios: { bundleIdentifier: 'cloud.tenka.passport' },
          slug: 'tenkacloud-passport',
        };
      if (fault === 'bundle')
        value['expo'] = {
          extra: { eas: { projectId: '82efa217-a2ac-4209-a975-ea7198a51cda' } },
          ios: { bundleIdentifier: 'foreign' },
          slug: 'tenkacloud-passport',
        };
      if (fault === 'slug')
        value['expo'] = {
          extra: { eas: { projectId: '82efa217-a2ac-4209-a975-ea7198a51cda' } },
          ios: { bundleIdentifier: 'cloud.tenka.passport' },
          slug: 'foreign',
        };
      if (fault === 'target-version' || fault === 'plugins') {
        const expo = JSON.parse(
          readFileSync(join(inspection, 'app.json'), 'utf8')
        ).expo;
        if (fault === 'target-version') expo.version = '1.4.0';
        else expo.plugins = ['unexpected'];
        value['expo'] = expo;
      }
      if (fault.endsWith('submit'))
        value['submit'] = { production: { ios: { ascAppId: 'foreign' } } };
      if (fault === 'credential-field')
        value['submit'] = {
          production: {
            ios: { ascAppId: '6793516094', ascApiKeyPath: 'unexpected' },
          },
        };
    });
    expect(() => validateStoreInspectionContext(root, inspection)).toThrow();
  }
);

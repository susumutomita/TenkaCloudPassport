import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  WebBackupSharePort,
  type WebShareEnvironment,
} from './web-backup-share';

const NATIVE_SHARE_ACCEPTED = 'native-share-accepted';
const NATIVE_SHARE_ATTEMPTS = 'native-share-attempts';
const NATIVE_SHARE_CONTENT = 'native-share-content';
const NATIVE_SHARE_RELEASE = 'native-share-release';
const NATIVE_SHARE_TITLE = 'native-share-title';

function waitForRelease(root: string, timeoutMs: number): Promise<void> {
  const releasePath = path.join(root, NATIVE_SHARE_RELEASE);
  if (existsSync(releasePath)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let polling: ReturnType<typeof setInterval> | null = null;
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (polling) clearInterval(polling);
      if (error) reject(error);
      else resolve();
    };
    polling = setInterval(() => {
      if (existsSync(releasePath)) finish();
    }, 1);
    timeout = setTimeout(
      () => finish(new Error('native share の解放を確認できませんでした。')),
      timeoutMs
    );
    if (existsSync(releasePath)) finish();
  });
}

class FileBackedWebShareEnvironment implements WebShareEnvironment {
  constructor(
    private readonly root: string,
    readonly supportsNativeShare: boolean,
    private readonly waitForNativeShareRelease: boolean,
    private readonly releaseTimeoutMs: number
  ) {}

  async shareText(input: {
    readonly title: string;
    readonly text: string;
  }): Promise<'shared' | 'dismissed'> {
    appendFileSync(path.join(this.root, NATIVE_SHARE_ATTEMPTS), 'attempt\n');
    writeFileSync(
      path.join(this.root, NATIVE_SHARE_TITLE),
      input.title,
      'utf8'
    );
    writeFileSync(
      path.join(this.root, NATIVE_SHARE_CONTENT),
      input.text,
      'utf8'
    );
    if (this.waitForNativeShareRelease) {
      await waitForRelease(this.root, this.releaseTimeoutMs);
    }
    return existsSync(path.join(this.root, NATIVE_SHARE_ACCEPTED))
      ? 'shared'
      : 'dismissed';
  }

  downloadFile(fileName: string, content: string): void {
    writeFileSync(path.join(this.root, fileName), content, 'utf8');
  }
}

/** Browser の download fallback を使い捨て実ディレクトリへの write として実行する。 */
export function fileDownloadSharePort(root: string): WebBackupSharePort {
  return new WebBackupSharePort(
    new FileBackedWebShareEnvironment(root, false, false, 1_000)
  );
}

/**
 * Native Share 境界を実ファイルへ記録する Web adapter を返す。accept / release も
 * 実ファイル marker で制御し、Controller テストが in-memory stub に依存しないようにする。
 */
export function fileBackedNativeSharePort(
  root: string,
  options: {
    readonly releaseTimeoutMs?: number;
    readonly waitForRelease?: boolean;
  } = {}
): WebBackupSharePort {
  return new WebBackupSharePort(
    new FileBackedWebShareEnvironment(
      root,
      true,
      Boolean(options.waitForRelease),
      options.releaseTimeoutMs ?? 1_000
    )
  );
}

export function acceptNativeShare(root: string): void {
  writeFileSync(path.join(root, NATIVE_SHARE_ACCEPTED), '', 'utf8');
}

export function releaseNativeShare(root: string): void {
  writeFileSync(path.join(root, NATIVE_SHARE_RELEASE), '', 'utf8');
}

export function nativeShareAttemptCount(root: string): number {
  const target = path.join(root, NATIVE_SHARE_ATTEMPTS);
  if (!existsSync(target)) return 0;
  return readFileSync(target, 'utf8')
    .split('\n')
    .filter((line) => line === 'attempt').length;
}

export function nativeShareContent(root: string): string | null {
  const target = path.join(root, NATIVE_SHARE_CONTENT);
  return existsSync(target) ? readFileSync(target, 'utf8') : null;
}

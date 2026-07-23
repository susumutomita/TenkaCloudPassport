import { afterEach } from 'bun:test';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { LocalPrivateProfile } from '../domain/passport';
import type { ProfileDocument } from './expo-file-system-local-profile-storage';
import type { LocalProfileStoragePort } from './local-profile-storage';
import type { WebKeyValueStorage } from './web-local-profile-storage';

/**
 * この repo は No Mock 方針のため、Storage adapter のテストは実ファイル I/O を使う。
 * 複数の Storage 系テスト（adapter 自体のテストと、Issue 9 の Privacy Regression Test）が
 * 同じ「実ディレクトリを使い捨てる」ヘルパーと Real I/O 実装を必要とするため、ここへ集約し
 * 重複実装を避ける（`src/screens/accessibility-test-kit.ts` と同じ集約方針）。
 */
export function temporaryDirectory(): string {
  return mkdtempSync(path.join(tmpdir(), 'passport-storage-'));
}

function clearDirectory(directory: string): void {
  for (const entry of readdirSync(directory)) {
    const target = path.join(directory, entry);
    if (lstatSync(target).isDirectory()) {
      clearDirectory(target);
      rmdirSync(target);
    } else {
      unlinkSync(target);
    }
  }
}

export function removeTemporaryDirectory(directory: string): void {
  if (!existsSync(directory)) return;
  clearDirectory(directory);
  rmdirSync(directory);
}

/**
 * 複数のテストファイル（Issue 9 の Privacy Regression Test、`web-backup-share.test.ts`、
 * `pilot-measurement.test.ts` 等）が、同じ「使い捨てディレクトリを作り、各テスト後に
 * 必ず削除する」という `afterEach` 登録パターンを重複実装していたため、ここへ集約する。
 * 呼び出し側は `create()` で新しいディレクトリを作るだけでよい。
 */
export function trackTemporaryDirectories(): { create(): string } {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      removeTemporaryDirectory(root);
    }
  });
  return {
    create(): string {
      const directory = temporaryDirectory();
      roots.push(directory);
      return directory;
    },
  };
}

/** Web の `localStorage` 相当を、実ディレクトリ配下の 1 ファイル 1 キーへマップする実装。 */
export class FileBackedWebStorage implements WebKeyValueStorage {
  constructor(private readonly root: string) {}

  private filePath(key: string): string {
    return path.join(this.root, encodeURIComponent(key));
  }

  getItem(key: string): string | null {
    const target = this.filePath(key);
    return existsSync(target) ? readFileSync(target, 'utf8') : null;
  }

  setItem(key: string, value: string): void {
    writeFileSync(this.filePath(key), value, 'utf8');
  }

  removeItem(key: string): void {
    const target = this.filePath(key);
    if (existsSync(target)) unlinkSync(target);
  }

  /** このディレクトリに実際に書き込まれたキー（ファイル名）を列挙する。 */
  listKeys(): readonly string[] {
    return readdirSync(this.root)
      .map((entry) => decodeURIComponent(entry))
      .sort();
  }
}

/** Native（Expo File System）相当を、実ファイル 1 つへマップする実装。 */
export class BunProfileDocument implements ProfileDocument {
  constructor(private readonly filePath: string) {}

  get exists(): boolean {
    return existsSync(this.filePath);
  }

  get size(): number | null {
    return this.exists ? statSync(this.filePath).size : null;
  }

  text(): Promise<string> {
    return readFile(this.filePath, 'utf8');
  }

  write(content: string): Promise<void> {
    return writeFile(this.filePath, content, 'utf8');
  }

  delete(): Promise<void> {
    return this.exists ? unlink(this.filePath) : Promise.resolve();
  }
}

/**
 * Issue 14: Import の Atomic Commit（write-then-verify）が、書き込み失敗時に既存の
 * Profile を一切変更しないことを検証するための実装。読み込み（`exists` / `text()`）は
 * `BunProfileDocument` へ委譲した本物の実ファイル I/O だが、`write()` だけは実ファイルへ
 * 一切触れずに確実に reject する。ディスク容量不足・権限エラーなど、実際の書き込みが
 * 失敗する環境を安定して再現できないため、この形で「書き込みだけが失敗する」状況を作る。
 * `local-profile-storage.ts` の `UnavailableLocalProfileStorageAdapter`（本番でも使われ得る、
 * Storage 自体が使えない状況を表す本物の実装）と同じ考え方であり、モックで振る舞いを
 * 偽装するのではなく Port の契約を満たす別の本物の実装を注入する。
 */
export class WriteFailingProfileDocument implements ProfileDocument {
  private readonly delegate: BunProfileDocument;

  constructor(
    filePath: string,
    private readonly failure: Error
  ) {
    this.delegate = new BunProfileDocument(filePath);
  }

  get exists(): boolean {
    return this.delegate.exists;
  }

  get size(): number | null {
    return this.delegate.size;
  }

  text(): Promise<string> {
    return this.delegate.text();
  }

  write(_content: string): Promise<void> {
    return Promise.reject(this.failure);
  }

  delete(): Promise<void> {
    return this.delegate.delete();
  }
}

/**
 * `WriteFailingProfileDocument` の対になる実装。読み込み（`exists` の同期アクセス・
 * `text()`）だけを確実に失敗させ、`write()` / `delete()` は実ファイルへの本物の
 * I/O（`BunProfileDocument` へ委譲）のまま残す。権限エラー・破損ファイル等、
 * 「読込だけが失敗する」状況を安定して再現するための実装で、モックで振る舞いを
 * 偽装するのではなく Port の契約を満たす別の本物の実装を注入する。
 */
export class ReadFailingProfileDocument implements ProfileDocument {
  private readonly delegate: BunProfileDocument;

  constructor(
    filePath: string,
    private readonly failure: Error
  ) {
    this.delegate = new BunProfileDocument(filePath);
  }

  get exists(): boolean {
    throw this.failure;
  }

  get size(): null {
    return null;
  }

  text(): Promise<string> {
    return Promise.reject(this.failure);
  }

  write(content: string): Promise<void> {
    return this.delegate.write(content);
  }

  delete(): Promise<void> {
    return this.delegate.delete();
  }
}

/**
 * Web 相当の同じ意図を持つ実装。`getItem` は `FileBackedWebStorage` （実ファイル I/O）へ
 * 委譲し、`setItem` だけが実ファイルへ一切触れずに確実に throw する。
 */
export class WriteFailingWebStorage implements WebKeyValueStorage {
  private readonly delegate: FileBackedWebStorage;

  constructor(
    root: string,
    private readonly failure: Error
  ) {
    this.delegate = new FileBackedWebStorage(root);
  }

  getItem(key: string): string | null {
    return this.delegate.getItem(key);
  }

  setItem(_key: string, _value: string): void {
    throw this.failure;
  }

  removeItem(key: string): void {
    this.delegate.removeItem(key);
  }
}

export class DeleteFailingWebStorage implements WebKeyValueStorage {
  private readonly delegate: FileBackedWebStorage;

  constructor(
    root: string,
    private readonly failure: Error,
    private readonly operation: 'get' | 'remove' | 'set' = 'remove'
  ) {
    this.delegate = new FileBackedWebStorage(root);
  }

  getItem(key: string): string | null {
    if (this.operation === 'get') throw this.failure;
    return this.delegate.getItem(key);
  }

  setItem(key: string, value: string): void {
    if (this.operation === 'set') throw this.failure;
    this.delegate.setItem(key, value);
  }

  removeItem(key: string): void {
    if (this.operation === 'remove') throw this.failure;
    this.delegate.removeItem(key);
  }
}

/**
 * `local-profile-storage.test.ts` が、write-then-verify（`save()` 自体は成功したが
 * 読み戻した内容が一致しない場合の挙動）を検証するための実装。`save()` を実ファイルへ
 * 委譲する（Real I/O）一方、`load()` は常に `mismatchedProfile` を返す。この不一致は、
 * 実際の Storage adapter（Web の `localStorage.setItem` は単一 key の原子的操作、
 * Native の実ファイル書き込みは直後の読み戻しが同一内容になる）では通常発生しないため、
 * Port 契約レベルでだけ再現できる。
 */
export class VerifyMismatchStorage implements LocalProfileStoragePort {
  constructor(
    private readonly delegate: LocalProfileStoragePort,
    private readonly mismatchedProfile: LocalPrivateProfile
  ) {}

  async save(profile: LocalPrivateProfile): Promise<void> {
    await this.delegate.save(profile);
  }

  load(): Promise<LocalPrivateProfile | null> {
    return Promise.resolve(this.mismatchedProfile);
  }

  inspect() {
    return this.delegate.inspect();
  }

  remove(): Promise<void> {
    return this.delegate.remove();
  }
}

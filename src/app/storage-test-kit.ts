import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ProfileDocument } from './expo-file-system-local-profile-storage';
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

  text(): Promise<string> {
    return readFile(this.filePath, 'utf8');
  }

  write(content: string): Promise<void> {
    return writeFile(this.filePath, content, 'utf8');
  }
}

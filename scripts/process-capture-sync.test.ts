import { describe, expect, it } from 'bun:test';
import { runCapturedProcessSync } from './process-capture-sync';

describe('runCapturedProcessSync', () => {
  it('標準出力と標準エラーを同期的に一時ファイル経由で読み戻す', () => {
    const result = runCapturedProcessSync([
      'bun',
      '-e',
      "console.log('sync-stdout'); console.error('sync-stderr');",
    ]);
    expect(result.exitCode).toBe(0);
    expect(new TextDecoder().decode(result.stdout)).toContain('sync-stdout');
    expect(result.stderr).toContain('sync-stderr');
  });

  it('0 以外の終了コードもそのまま返す', () => {
    const result = runCapturedProcessSync(['bun', '-e', 'process.exit(2);']);
    expect(result.exitCode).toBe(2);
  });
});

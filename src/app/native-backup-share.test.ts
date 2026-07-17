import { describe, expect, it } from 'bun:test';
import {
  NativeBackupSharePort,
  type NativeShareEnvironment,
} from './native-backup-share';

function environment(dismissed: boolean): NativeShareEnvironment {
  return {
    shareText: () => Promise.resolve({ dismissed }),
  };
}

describe('NativeBackupSharePort', () => {
  it('Share.share が共有成立を返した場合は shared を返す', async () => {
    const port = new NativeBackupSharePort(environment(false));

    const outcome = await port.share({
      fileName: 'backup.json',
      json: '{"backupSchemaVersion":2}',
    });

    expect(outcome).toEqual({ kind: 'shared' });
  });

  it('Share.share が Share Sheet の dismiss を返した場合は dismissed を返す', async () => {
    const port = new NativeBackupSharePort(environment(true));

    const outcome = await port.share({
      fileName: 'backup.json',
      json: '{"backupSchemaVersion":2}',
    });

    expect(outcome).toEqual({ kind: 'dismissed' });
  });

  it('fileName と json を title / message へそのまま渡す', async () => {
    const received: {
      value: { readonly title: string; readonly message: string } | null;
    } = { value: null };
    const port = new NativeBackupSharePort({
      shareText: (input) => {
        received.value = input;
        return Promise.resolve({ dismissed: false });
      },
    });

    await port.share({ fileName: 'backup.json', json: '{"a":1}' });

    expect(received.value).toEqual({
      title: 'backup.json',
      message: '{"a":1}',
    });
  });
});

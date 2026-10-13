import { expect, it } from 'bun:test';
import { createHash } from 'node:crypto';

const config = await Bun.file(
  new URL('../store.config.json', import.meta.url)
).json();
const app = await Bun.file(new URL('../app.json', import.meta.url)).json();
it('targets the current native version and retains existing declarations and release settings', () => {
  expect(config.apple.version).toBe(app.expo.version);
  const { version: _version, info: _info, ...protectedSettings } = config.apple;
  expect(
    createHash('sha256').update(JSON.stringify(protectedSettings)).digest('hex')
  ).toBe('e4ea7afa57cafc78932c0978bef75d24f0fbda703c18d0ebe5654bf12e332c8f');
});
for (const locale of ['ja', 'en-US']) {
  it(`accurately describes current features within listing limits (${locale})`, () => {
    const info = config.apple.info[locale];
    expect(info.title.length).toBeLessThanOrEqual(30);
    expect(info.subtitle.length).toBeLessThanOrEqual(30);
    expect(info.description.length).toBeLessThanOrEqual(4000);
    expect(info.promoText.length).toBeLessThanOrEqual(170);
    expect(info.keywords.join(',').length).toBeLessThanOrEqual(100);
    expect(info.description).not.toContain('Apple Intelligence');
    expect(info.description).toContain(
      locale === 'ja' ? '会話 AI は廃止' : 'conversation AI has been retired'
    );
    expect(info.description).toContain(
      locale === 'ja' ? 'メモ本文は保存されません' : 'draft text is not saved'
    );
    expect(info.description).toContain(
      locale === 'ja'
        ? 'インターネット接続が必要'
        : 'requires an internet connection'
    );
    expect(info.description).toContain(
      locale === 'ja' ? '自己評価' : 'self-assessment'
    );
    expect(info.keywords).not.toContain('conversation');
    expect(info.keywords).not.toContain('共通点');
  });
}

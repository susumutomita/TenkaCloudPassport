import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const source = await Bun.file(
  join(import.meta.dir, '..', 'site/c/index.html')
).text();
function viewerScript(): string {
  const script = source.split('<script>')[1]?.split('</script>')[0];
  if (!script) throw new Error('Viewer script missing');
  return script;
}
const script = viewerScript();
const payload = Buffer.from(
  JSON.stringify({
    v: 1,
    n: 'Synthetic Card',
    o: 'Example Organization',
    e: 'card@example.invalid',
    p: '+1 555 0100',
  })
).toString('base64url');

function openViewer(hash: string, historyFails = false) {
  const elements = new Map<
    string,
    {
      hidden: boolean;
      textContent: string;
      onclick: (() => void) | null;
      appendChild: (child: unknown) => void;
    }
  >();
  const element = (id: string) => {
    if (!elements.has(id)) {
      elements.set(id, {
        hidden: true,
        textContent: '',
        onclick: null,
        appendChild: () => undefined,
      });
    }
    const found = elements.get(id);
    if (!found) throw new Error('Element missing');
    return found;
  };
  const location = { hash, pathname: '/c/', search: '?lang=ja' };
  const events = new Map<string, (event: { persisted?: boolean }) => void>();
  const replacements: unknown[][] = [];
  const document = {
    title: '自己紹介 | TenkaCloud Passport',
    getElementById: element,
    createElement: () => ({ textContent: '', appendChild: () => undefined }),
  };
  runInNewContext(script, {
    document,
    location,
    history: {
      replaceState: (...args: unknown[]) => {
        expect(element('card').hidden).toBe(true);
        if (historyFails) throw new Error('History unavailable');
        replacements.push(args);
        location.hash = '';
      },
    },
    window: {
      addEventListener: (
        name: string,
        handler: (event: { persisted?: boolean }) => void
      ) => {
        events.set(name, handler);
      },
    },
    TextDecoder,
    URL,
    Uint8Array,
  });
  return { element, document, location, replacements, events };
}

describe('Intro Card transient history (Issue 197)', () => {
  it('clears URL and history state before rendering, keeps fixed title and explicit save', () => {
    const viewer = openViewer(`#${payload}`);
    expect(viewer.replacements).toEqual([[null, '', '/c/?lang=ja']]);
    expect(viewer.location.hash).toBe('');
    expect(viewer.element('card').hidden).toBe(false);
    expect(viewer.element('card-name').textContent).toBe('Synthetic Card');
    expect(viewer.document.title).toBe('自己紹介 | TenkaCloud Passport');
    expect(viewer.element('connect-button').onclick).toBeFunction();
    const reload = openViewer(viewer.location.hash);
    expect(reload.element('card').hidden).toBe(true);
    expect(reload.element('no-hash').hidden).toBe(false);
    expect(reload.element('connect-button').onclick).toBeNull();
  });

  for (const hash of [
    '',
    '#',
    '#invalid!',
    `#${Buffer.from('{"v":1,"n":"X","unknown":true}').toString('base64url')}`,
  ]) {
    it(`removes empty or invalid input (${hash.length} characters) without rendering`, () => {
      const viewer = openViewer(hash);
      expect(viewer.location.hash).toBe('');
      expect(viewer.element('card').hidden).toBe(true);
      expect(
        viewer.element(hash.length > 1 ? 'decode-error' : 'no-hash').hidden
      ).toBe(false);
      expect(viewer.document.title).toBe('自己紹介 | TenkaCloud Passport');
    });
  }

  for (const hash of [`#${payload}`, '#invalid!', '']) {
    it(`fails visibly without rendering when history throws (${hash.length} characters)`, () => {
      const viewer = openViewer(hash, true);
      expect(viewer.element('history-error').hidden).toBe(false);
      expect(viewer.element('card').hidden).toBe(true);
      expect(viewer.element('card-name').textContent).toBe('');
      expect(viewer.element('connect-button').onclick).toBeNull();
      expect(viewer.document.title).toBe('自己紹介 | TenkaCloud Passport');
    });
  }

  it('clears cached DOM and save closure on leaving; cached restoration needs a fresh QR', () => {
    const viewer = openViewer(`#${payload}`);
    viewer.events.get('pagehide')?.({});
    expect(viewer.element('card-name').textContent).toBe('');
    expect(viewer.element('connect-button').onclick).toBeNull();
    viewer.events.get('pageshow')?.({ persisted: true });
    expect(viewer.element('card').hidden).toBe(true);
    expect(viewer.element('no-hash').hidden).toBe(false);
  });

  it('handles new fragments and back/forward entries without retaining a previous card', () => {
    const viewer = openViewer('');
    viewer.location.hash = `#${payload}`;
    viewer.events.get('popstate')?.({});
    viewer.events.get('hashchange')?.({});
    expect(viewer.location.hash).toBe('');
    expect(viewer.element('card').hidden).toBe(false);
    viewer.events.get('popstate')?.({});
    expect(viewer.element('card').hidden).toBe(true);
    expect(viewer.element('card-name').textContent).toBe('');
    expect(viewer.element('connect-button').onclick).toBeNull();
    viewer.location.hash = '#invalid!';
    viewer.events.get('popstate')?.({});
    viewer.events.get('hashchange')?.({});
    expect(viewer.location.hash).toBe('');
    expect(viewer.element('decode-error').hidden).toBe(false);
  });
});

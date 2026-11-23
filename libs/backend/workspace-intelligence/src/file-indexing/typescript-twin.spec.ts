import {
  hasTypeScriptSourceTwin,
  hasTypeScriptSourceTwinIn,
  isJavaScriptPath,
  typeScriptTwinCandidates,
} from './typescript-twin';

describe('TypeScript source twins', () => {
  it.each([
    ['a/b.js', 'a/b.ts'],
    ['a/b.jsx', 'a/b.tsx'],
    ['a/b.mjs', 'a/b.mts'],
    ['a/b.cjs', 'a/b.cts'],
  ])('detects %s beside %s', async (javascript, typescript) => {
    const present = new Set([typescript]);
    expect(isJavaScriptPath(javascript)).toBe(true);
    expect(hasTypeScriptSourceTwinIn(javascript, present)).toBe(true);
    await expect(
      hasTypeScriptSourceTwin(javascript, async (path) => present.has(path)),
    ).resolves.toBe(true);
  });

  it.each([
    ['a lone implementation', []],
    ['a declaration only', ['a/b.d.ts']],
    ['a matching stem in another directory', ['c/b.ts']],
  ])(
    'keeps JavaScript given %s',
    async (_description, paths) => {
      const present = new Set(paths);
      expect(hasTypeScriptSourceTwinIn('a/b.js', present)).toBe(false);
      await expect(
        hasTypeScriptSourceTwin('a/b.js', async (path) => present.has(path)),
      ).resolves.toBe(false);
    },
  );

  it('returns no candidates for TypeScript', () => {
    expect(isJavaScriptPath('a/b.ts')).toBe(false);
    expect(typeScriptTwinCandidates('a/b.ts')).toEqual([]);
  });

  it('keeps JavaScript when a same-stem TypeScript file is a declaration', async () => {
    const present = new Set(['a/b.d.ts', 'a/b.d.mts', 'a/b.d.cts']);
    expect(hasTypeScriptSourceTwinIn('a/b.d.js', present)).toBe(false);
    await expect(
      hasTypeScriptSourceTwin('a/b.d.js', async (path) => present.has(path)),
    ).resolves.toBe(false);
  });

  it('preserves Windows separators for probing and normalizes discovered keys', async () => {
    const javascript = String.raw`a\b.js`;
    expect(typeScriptTwinCandidates(javascript)).toEqual([
      String.raw`a\b.ts`,
      String.raw`a\b.tsx`,
      String.raw`a\b.mts`,
      String.raw`a\b.cts`,
    ]);
    expect(
      hasTypeScriptSourceTwinIn(javascript, (path) => path === 'a/b.ts'),
    ).toBe(true);
    await expect(
      hasTypeScriptSourceTwin(
        javascript,
        async (path) => path === String.raw`a\b.tsx`,
      ),
    ).resolves.toBe(true);
  });

  it('compares stems with the host case rule', () => {
    expect(hasTypeScriptSourceTwinIn('a/B.js', new Set(['a/b.ts']))).toBe(
      process.platform === 'win32',
    );
  });

  it('treats errors as absent and continues to later candidates', async () => {
    const exists = async (path: string) => {
      if (path.endsWith('.ts')) throw new Error('probe failed');
      return path === 'a/b.mts';
    };
    await expect(hasTypeScriptSourceTwin('a/c.js', exists)).resolves.toBe(false);
    await expect(hasTypeScriptSourceTwin('a/b.js', exists)).resolves.toBe(true);
  });
});

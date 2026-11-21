import { buildAcpSpawnEnv } from './acp-spawn-env';

describe('buildAcpSpawnEnv', () => {
  const base = { PATH: '/bin', Home: '/h', KEEP: 'k' };

  it('returns a copy of baseEnv without a spec', () => {
    const env = buildAcpSpawnEnv(base, undefined);
    expect(env).toEqual(base);
    expect(env).not.toBe(base);
  });

  it('merges set over baseEnv, or replaces it', () => {
    expect(buildAcpSpawnEnv(base, { mode: 'merge', set: { KEEP: 'new', X: '1' } })).toEqual({
      PATH: '/bin',
      Home: '/h',
      KEEP: 'new',
      X: '1',
    });
    expect(buildAcpSpawnEnv(base, { mode: 'replace', set: { X: '1' } })).toEqual({ X: '1' });
  });

  it('replaces an inherited key of another case on Windows instead of duplicating it', () => {
    const spec = { mode: 'merge' as const, set: { Path: '/new', HOME: '/x' } };
    expect(buildAcpSpawnEnv(base, spec, 'win32')).toEqual({ Path: '/new', HOME: '/x', KEEP: 'k' });
    expect(buildAcpSpawnEnv(base, spec, 'linux')).toEqual({ ...base, Path: '/new', HOME: '/x' });
  });

  it('removes names case-insensitively on Windows only', () => {
    const spec = { mode: 'merge' as const, set: {}, remove: ['HOME'] };
    expect(buildAcpSpawnEnv(base, spec, 'win32')).toEqual({ PATH: '/bin', KEEP: 'k' });
    expect(buildAcpSpawnEnv(base, spec, 'linux')).toEqual(base);
  });
});

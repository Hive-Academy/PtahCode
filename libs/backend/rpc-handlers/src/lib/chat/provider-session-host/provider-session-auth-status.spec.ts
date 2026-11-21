import { createProviderSessionAuthStatusProbe } from './provider-session-auth-status';

describe('provider-session auth status probe', () => {
  const logger = () => ({ warn: jest.fn() });

  it('returns one row per admitted profile from detect and the token check', async () => {
    const probe = createProviderSessionAuthStatusProbe({
      logger: logger(),
      profiles: [
        {
          profile: 'grok',
          signInHint: 'run `grok login`',
          lane: {
            detect: async () => ({ installed: true, version: '1.2.0' }),
            ensureTokensFresh: async () => false,
          },
        },
        {
          profile: 'antigravity',
          signInHint: 'run `agy` and sign in',
          lane: { detect: async () => ({ installed: true }) },
        },
      ],
    });
    await expect(probe.probe()).resolves.toEqual({
      grok: {
        installed: true,
        authenticated: false,
        version: '1.2.0',
        signInHint: 'run `grok login`',
      },
      antigravity: {
        installed: true,
        authenticated: true,
        signInHint: 'run `agy` and sign in',
      },
    });
  });

  it('reports a missing CLI without reading its sign-in', async () => {
    const ensureTokensFresh = jest.fn(async () => true);
    const probe = createProviderSessionAuthStatusProbe({
      logger: logger(),
      profiles: [
        {
          profile: 'opencode',
          signInHint: 'run `opencode auth login`',
          lane: { detect: async () => ({ installed: false }), ensureTokensFresh },
        },
      ],
    });
    await expect(probe.probe()).resolves.toEqual({
      opencode: {
        installed: false,
        authenticated: false,
        signInHint: 'run `opencode auth login`',
      },
    });
    expect(ensureTokensFresh).not.toHaveBeenCalled();
  });

  it('degrades a failing lane to a not-installed row and logs it', async () => {
    const log = logger();
    const probe = createProviderSessionAuthStatusProbe({
      logger: log,
      profiles: [
        {
          profile: 'grok',
          signInHint: 'run `grok login`',
          lane: {
            detect: async () => {
              throw new Error('spawn failed');
            },
          },
        },
      ],
    });
    await expect(probe.probe()).resolves.toEqual({
      grok: { installed: false, authenticated: false, signInHint: 'run `grok login`' },
    });
    expect(log.warn).toHaveBeenCalledWith(expect.any(String), {
      profile: 'grok',
      error: 'spawn failed',
    });
  });

  it('returns no rows when the host admits no profile', async () => {
    const probe = createProviderSessionAuthStatusProbe({ logger: logger(), profiles: [] });
    await expect(probe.probe()).resolves.toEqual({});
  });
});

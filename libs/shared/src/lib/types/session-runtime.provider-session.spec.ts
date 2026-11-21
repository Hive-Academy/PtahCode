import {
  SessionId,
  sessionRuntimeIdentityMismatch,
  type SessionRuntimeIdentity,
} from '../../index';
import {
  SessionRuntimeIdentitySchema,
  parseSessionRuntimeIdentity,
} from '../../schemas';

const base = {
  version: 1 as const,
  sessionId: SessionId.from('12345678-1234-4234-8234-123456789abc'),
  workspaceId: 'workspace-1',
};

const antigravity: SessionRuntimeIdentity = {
  ...base,
  providerId: 'antigravity-cli',
  runtime: 'provider-session',
  providerSession: { profile: 'antigravity' },
};

const withHome: SessionRuntimeIdentity = {
  ...base,
  providerId: 'grok-cli',
  runtime: 'provider-session',
  providerSession: { profile: 'grok', normalizedHome: 'c:\\users\\dev' },
};

const codex: SessionRuntimeIdentity = {
  ...base,
  providerId: 'antigravity-cli',
  runtime: 'codex-app-server',
  codex: { normalizedHome: 'c:\\users\\dev' },
};

describe('SessionRuntimeIdentitySchema provider-session variant', () => {
  it.each([antigravity, withHome])(
    'round-trips $providerSession.profile identities',
    (identity) => {
      const parsed = SessionRuntimeIdentitySchema.parse(
        JSON.parse(JSON.stringify(identity)),
      );
      expect(parsed).toEqual(identity);
      expect(parseSessionRuntimeIdentity(identity)).toEqual({
        ok: true,
        value: identity,
      });
    },
  );

  it.each([
    ['missing providerSession', { ...antigravity, providerSession: undefined }],
    ['unknown profile', { ...antigravity, providerSession: { profile: 'other' } }],
    [
      'non-normalized home',
      {
        ...antigravity,
        providerSession: { profile: 'grok', normalizedHome: 'C:/Users/dev' },
      },
    ],
    [
      'empty home',
      { ...antigravity, providerSession: { profile: 'grok', normalizedHome: '' } },
    ],
    [
      'extra nested key',
      {
        ...antigravity,
        providerSession: { profile: 'antigravity', token: 'secret' },
      },
    ],
    ['extra top-level key', { ...antigravity, env: { KEY: 'secret' } }],
    ['a Codex home', { ...antigravity, codex: { normalizedHome: 'c:\\x' } }],
    [
      'Claude with a provider session',
      {
        ...base,
        providerId: 'anthropic',
        runtime: 'claude-sdk',
        providerSession: { profile: 'antigravity' },
      },
    ],
    [
      'Codex with a provider session',
      { ...codex, providerSession: { profile: 'antigravity' } },
    ],
  ])('rejects %s without returning input', (_label, value) => {
    expect(SessionRuntimeIdentitySchema.safeParse(value).success).toBe(false);
    expect(parseSessionRuntimeIdentity(value)).toEqual({
      ok: false,
      code: 'rejected',
    });
  });
});

describe('sessionRuntimeIdentityMismatch with provider sessions', () => {
  it('accepts a matching binding', () => {
    expect(
      sessionRuntimeIdentityMismatch(antigravity, { ...antigravity }),
    ).toBeNull();
  });

  it('reports profile when only the profile differs', () => {
    expect(
      sessionRuntimeIdentityMismatch(antigravity, {
        ...antigravity,
        providerSession: { profile: 'grok' },
      }),
    ).toBe('profile');
  });

  it('reports profile before normalizedHome', () => {
    expect(
      sessionRuntimeIdentityMismatch(
        { ...withHome, providerId: 'antigravity-cli' },
        {
          ...antigravity,
          providerSession: { profile: 'antigravity', normalizedHome: 'c:\\b' },
        },
      ),
    ).toBe('profile');
  });

  it('reports normalizedHome when one side has a home', () => {
    expect(
      sessionRuntimeIdentityMismatch(withHome, {
        ...withHome,
        providerSession: { profile: 'grok' },
      }),
    ).toBe('normalizedHome');
  });

  it('reports runtime before profile in either direction', () => {
    expect(sessionRuntimeIdentityMismatch(antigravity, codex)).toBe('runtime');
    expect(sessionRuntimeIdentityMismatch(codex, antigravity)).toBe('runtime');
  });

  it('reports providerId and workspaceId first', () => {
    expect(
      sessionRuntimeIdentityMismatch(antigravity, {
        ...antigravity,
        providerId: 'grok-cli',
        providerSession: { profile: 'grok' },
      }),
    ).toBe('providerId');
    expect(
      sessionRuntimeIdentityMismatch(antigravity, {
        ...antigravity,
        workspaceId: 'other',
        providerSession: { profile: 'grok' },
      }),
    ).toBe('workspaceId');
  });
});

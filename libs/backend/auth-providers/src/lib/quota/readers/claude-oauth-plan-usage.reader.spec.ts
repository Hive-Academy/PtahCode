import 'reflect-metadata';
import { join } from 'node:path';
import { createMockLogger } from '@ptah-extension/shared/testing';
import type { Logger } from '@ptah-extension/vscode-core';
import type { ClaudeAccountNamedRoute } from '@ptah-extension/auth-providers-tokens';
import { accountOwnerKey, claudeAccountOwnerKey, quotaOwnerRefFromKey } from '../provider-owner.resolver';
import { CLAUDE_OAUTH_PROFILE_URL, CLAUDE_OAUTH_USAGE_URL, createClaudeOauthPlanUsageReader } from './claude-oauth-plan-usage.reader';
import type { ClaudeUsageDirectory, PlanOwnerTarget } from './plan-usage-reader.types';

const NOW = Date.UTC(2026, 9, 4, 12);
const target: PlanOwnerTarget = {
  providerId: 'anthropic',
  ownerRef: quotaOwnerRefFromKey(accountOwnerKey('anthropic', 'person@example.test\0Example')),
};
const credentials = JSON.stringify({ claudeAiOauth: { accessToken: 'fixture-token', expiresAt: NOW + 60_000 } });
const config = JSON.stringify({ oauthAccount: { emailAddress: 'person@example.test', organizationName: 'Example' } });
// A named directory binds its token to the owner with the same account id in both files.
const boundCredentials = JSON.stringify({ claudeAiOauth: { accessToken: 'fixture-token', expiresAt: NOW + 60_000, accountUuid: 'acct-1' } });
const boundConfig = JSON.stringify({ oauthAccount: { emailAddress: 'person@example.test', organizationName: 'Example', accountUuid: 'acct-1' } });
const claudeUsageDir: ClaudeUsageDirectory = {
  kind: 'stored-profile-usage', profileId: 'fixture', canonicalConfigDir: '/fixture-stored-profile',
};
const full = {
  five_hour: { utilization: 42, resets_at: '2026-10-04T15:00:00Z' },
  seven_day: { utilization: 7, resets_at: '2026-10-09T00:00:00Z' },
  seven_day_opus: { utilization: 100, resets_at: '2026-10-09T00:00:00Z' },
  seven_day_sonnet: { utilization: 12, resets_at: null },
  limits: [{ kind: 'weekly_scoped', percent: 17, scope: { model: { display_name: 'Fable' } } }],
};
const loggers: ReturnType<typeof createMockLogger>[] = [];

function harness(credentialFile = credentials, body: unknown = full, accountFile = config, env: Readonly<Record<string, string | undefined>> = {}) {
  const fetcher = jest.fn(async () => new Response(JSON.stringify(body))) as typeof fetch;
  const read = jest.fn(async (path: string) => path.endsWith('.credentials.json') ? credentialFile : accountFile);
  const logger = createMockLogger();
  loggers.push(logger);
  const reader = createClaudeOauthPlanUsageReader(logger as Partial<Logger> as Logger, () => NOW, fetcher, read, () => '/fixture-home', () => env);
  return { reader, fetcher, read, logger };
}

describe('Claude OAuth plan usage', () => {
  afterEach(() => {
    for (const logger of loggers)
      expect(JSON.stringify([logger.warn.mock.calls, logger.debug.mock.calls, logger.error.mock.calls]))
        .not.toMatch(/fixture-token|person@example\.test|Example/);
    loggers.length = 0;
  });
  it('maps full and scoped windows with the live reader keys', async () => {
    const { reader, fetcher } = harness();
    const result = await reader({ target, refresh: true });
    expect(result.status).toBe('available');
    expect(result.windows.map(w => w.key)).toEqual(['five_hour', 'weekly', 'weekly_model:opus', 'weekly_model:sonnet', 'weekly_model:fable']);
    expect(result.windows[0]).toMatchObject({ used: { kind: 'percent', percent: 42 }, resetsAt: Date.UTC(2026, 9, 4, 15), resetSource: 'provider-api' });
    expect(fetcher).toHaveBeenCalledWith('https://api.anthropic.com/api/oauth/usage', expect.objectContaining({ redirect: 'error', headers: expect.objectContaining({ 'anthropic-beta': 'oauth-2025-04-20', Accept: 'application/json' }) }));
  });
  it('matches the live account key from local account metadata', () => {
    expect(claudeAccountOwnerKey({ email: 'person@example.test', organization: 'Example' })).toBe(target.ownerRef.key);
  });
  it('drops malformed windows and keeps valid ones', async () => {
    const { reader } = harness(credentials, { five_hour: { utilization: 'bad' }, seven_day: full.seven_day });
    const result = await reader({ target, refresh: true });
    expect(result.windows.map(w => w.key)).toEqual(['weekly']);
    expect(result.windowSetEstablished).toBe(false);
  });
  it.each([
    { limits: 'invalid' },
    { limits: [{ kind: 'weekly_scoped', percent: 20 }] },
    { limits: [{ kind: 'weekly_scoped', scope: { model: { id: 'fixture-model' } } }] },
  ])('keeps valid windows but does not establish an incomplete limit set', async extra => {
    const { reader } = harness(credentials, { seven_day: full.seven_day, ...extra });
    const result = await reader({ target, refresh: true });
    expect(result.windows.map(w => w.key)).toEqual(['weekly']);
    expect(result.windowSetEstablished).toBe(false);
  });
  it('rejects a credential account that conflicts with metadata before HTTP', async () => {
    const credentialFile = JSON.stringify({ claudeAiOauth: { accessToken: 'fixture-token', expiresAt: NOW + 60_000, accountUuid: 'account-other' } });
    const accountFile = JSON.stringify({ oauthAccount: { emailAddress: 'person@example.test', organizationName: 'Example', accountUuid: 'account-owner' } });
    const h = harness(credentialFile, full, accountFile);
    const result = await h.reader({ target, refresh: true });
    expect(result).toMatchObject({ statusReason: 'account-unverified', windows: [], sourceInvalid: true });
    expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('accepts matching ids under either spelling and ids that metadata does not carry', async () => {
    const credentialFile = JSON.stringify({ claudeAiOauth: { accessToken: 'fixture-token', expiresAt: NOW + 60_000, account_uuid: 'account-owner' } });
    const accountFile = JSON.stringify({ oauthAccount: { emailAddress: 'person@example.test', organizationName: 'Example', accountUuid: 'account-owner' } });
    const result = await harness(credentialFile, { ...full, organization_uuid: 'org-unknown-to-metadata' }, accountFile).reader({ target, refresh: true });
    expect(result.status).toBe('available');
    expect(result.sourceInvalid).toBeFalsy();
  });
  it('rejects a conflicting id under the other spelling', async () => {
    const accountFile = JSON.stringify({ oauthAccount: { emailAddress: 'person@example.test', organizationName: 'Example', organizationUuid: 'org-owner' } });
    const result = await harness(credentials, { ...full, organization_uuid: 'org-other' }, accountFile).reader({ target, refresh: true });
    expect(result).toMatchObject({ statusReason: 'account-unverified', windows: [], sourceInvalid: true });
  });
  it('rejects a response organization that conflicts with metadata', async () => {
    const accountFile = JSON.stringify({ oauthAccount: { emailAddress: 'person@example.test', organizationName: 'Example', organizationUuid: 'org-owner' } });
    const result = await harness(credentials, { ...full, organizationUuid: 'org-other' }, accountFile).reader({ target, refresh: true });
    expect(result).toMatchObject({ statusReason: 'account-unverified', windows: [], sourceInvalid: true });
  });
  it('does not call HTTP for absent, expired, or mismatched credentials', async () => {
    for (const [credentialFile, accountFile] of [
      ['{}', config],
      [JSON.stringify({ claudeAiOauth: { accessToken: 'fixture-token', expiresAt: NOW - 1 } }), config],
      [credentials, JSON.stringify({ oauthAccount: { emailAddress: 'other@example.test' } })],
    ]) {
      const { reader, fetcher } = harness(credentialFile, full, accountFile);
      expect((await reader({ target, refresh: true })).windows).toEqual([]);
      expect(fetcher).not.toHaveBeenCalled();
    }
  });
  it('does not call HTTP when the credentials file is absent', async () => {
    const h = harness();
    h.read.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    expect((await h.reader({ target, refresh: true })).status).toBe('no-usage-source');
    expect(h.fetcher).not.toHaveBeenCalled();
    expect(h.logger.warn).not.toHaveBeenCalled();
    expect(h.logger.debug).toHaveBeenCalled();
  });
  it('returns unavailable for 401 and invalid JSON', async () => {
    const h = harness();
    (h.fetcher as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401 });
    expect((await h.reader({ target, refresh: true })).statusReason).toBe('usage-auth-rejected');
    (h.fetcher as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new SyntaxError(); } });
    expect((await h.reader({ target, refresh: true })).statusReason).toBe('cli-parse-failed');
  });
  it('bounds a stalled request', async () => {
    jest.useFakeTimers();
    const h = harness();
    (h.fetcher as jest.Mock).mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const result = h.reader({ target, refresh: true });
    await jest.advanceTimersByTimeAsync(5_000);
    expect((await result).statusReason).toBe('cli-timeout');
    jest.useRealTimers();
  });
  it('uses the configured directory for both files and home paths otherwise', async () => {
    const configured = harness(credentials, full, config, { CLAUDE_CONFIG_DIR: '/fixture-config' });
    await configured.reader({ target, refresh: true });
    expect(configured.read.mock.calls.map(call => call[0])).toEqual([join('/fixture-config', '.credentials.json'), join('/fixture-config', '.claude.json')]);
    const home = harness();
    await home.reader({ target, refresh: true });
    expect(home.read.mock.calls.map(call => call[0])).toEqual([join('/fixture-home', '.claude', '.credentials.json'), join('/fixture-home', '.claude.json')]);
  });
  it('accepts over-limit utilization and fails closed on seconds expiry', async () => {
    const over = harness(credentials, { five_hour: { utilization: 104 } });
    expect((await over.reader({ target, refresh: true })).windows[0].used).toMatchObject({ percent: 100 });
    const seconds = harness(JSON.stringify({ claudeAiOauth: { accessToken: 'fixture-token', expiresAt: 1.7e9 } }));
    expect((await seconds.reader({ target, refresh: true })).statusReason).toBe('no-oauth');
    expect(seconds.fetcher).not.toHaveBeenCalled();
  });
  it('rejects missing account metadata and already-aborted requests before HTTP', async () => {
    const missing = harness(credentials, full, '{');
    expect((await missing.reader({ target, refresh: true })).statusReason).toBe('account-unverified');
    const aborted = harness();
    const controller = new AbortController(); controller.abort();
    expect((await aborted.reader({ target, refresh: true, signal: controller.signal })).statusReason).toBe('cli-timeout');
    expect(aborted.fetcher).not.toHaveBeenCalled();
  });
  it.each([403, 429, 500])('handles HTTP %s without consuming private body data', async status => {
    const h = harness();
    (h.fetcher as jest.Mock).mockResolvedValueOnce(new Response('private', { status }));
    expect((await h.reader({ target, refresh: true })).statusReason).toBe(status === 403 ? 'usage-auth-rejected' : 'cli-unavailable');
  });
  it('keeps the auth reason when response body cancellation rejects', async () => {
    const h = harness();
    (h.fetcher as jest.Mock).mockResolvedValueOnce({ ok: false, status: 403, body: { cancel: async () => { throw new Error('cancel failed'); } } });
    expect((await h.reader({ target, refresh: true })).statusReason).toBe('usage-auth-rejected');
  });
  it('bounds Retry-After and accepts seconds and HTTP dates', async () => {
    const h = harness();
    for (const value of ['120', new Date(NOW + 90_000).toUTCString(), '999999']) {
      (h.fetcher as jest.Mock).mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers({ 'Retry-After': value }) });
      const result = await h.reader({ target, refresh: true });
      expect(result.retryAfterMs).toBe(value === '999999' ? 300_000 : value === '120' ? 120_000 : 90_000);
    }
  });
  it.each([{}, null, []])('rejects empty or invalid response shape', async body => {
    expect((await harness(credentials, body).reader({ target, refresh: true })).statusReason).toBe('cli-parse-failed');
  });
  const namedRoute = {
    kind: 'named', provider: 'claude', profileId: 'fixture', canonicalConfigDir: '/fixture-config',
    routeFingerprint: 'fixture', routeRevision: 1, authEpoch: 1, runId: 'fixture',
  } as ClaudeAccountNamedRoute;
  it('handles network failure and skips non-account owners', async () => {
    const h = harness();
    (h.fetcher as jest.Mock).mockRejectedValueOnce(new Error('network'));
    expect((await h.reader({ target, refresh: true })).statusReason).toBe('cli-unavailable');
    h.read.mockClear();
    await h.reader({ target: { ...target, ownerRef: { ...target.ownerRef, identityKind: 'unknown' } }, refresh: true });
    expect(h.read).not.toHaveBeenCalled();
    expect(JSON.stringify((h.logger.warn as jest.Mock).mock.calls)).not.toMatch(/fixture-token|person@example.test|Example/);
  });
  it('reads a named route only from its canonical config directory', async () => {
    const h = harness(boundCredentials, full, boundConfig, { CLAUDE_CONFIG_DIR: '/other' });
    const result = await h.reader({ target: { ...target, claudeRoute: namedRoute }, refresh: true });
    expect(result.status).toBe('available');
    const paths = h.read.mock.calls.map(call => call[0]);
    expect(paths).toEqual([join('/fixture-config', '.credentials.json'), join('/fixture-config', '.claude.json')]);
    expect(paths.join('|')).not.toMatch(/fixture-home|other/);
    expect(h.fetcher).toHaveBeenCalledTimes(1);
  });
  it('refuses a named route whose account metadata names another owner before HTTP', async () => {
    const otherAccount = JSON.stringify({ oauthAccount: { emailAddress: 'someone@example.test', organizationName: 'Elsewhere' } });
    const h = harness(credentials, full, otherAccount);
    const result = await h.reader({ target: { ...target, claudeRoute: namedRoute }, refresh: true });
    expect(result.statusReason).toBe('account-unverified');
    expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('reads a stored profile from its own directory with an unrelated config environment', async () => {
    const h = harness(boundCredentials, full, boundConfig, { CLAUDE_CONFIG_DIR: '/other' });
    const result = await h.reader({ target: { ...target, claudeUsageDir }, refresh: true });

    expect(result.status).toBe('available');
    expect(h.read.mock.calls).toEqual([
      [join(claudeUsageDir.canonicalConfigDir, '.credentials.json'), 'utf8'],
      [join(claudeUsageDir.canonicalConfigDir, '.claude.json'), 'utf8'],
    ]);
    expect(h.fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects a stored profile with an owner mismatch before fetching usage', async () => {
    const otherAccount = JSON.stringify({ oauthAccount: { emailAddress: 'other@example.invalid', organizationName: 'Elsewhere' } });
    const h = harness(credentials, full, otherAccount, { CLAUDE_CONFIG_DIR: '/other' });
    const result = await h.reader({ target: { ...target, claudeUsageDir }, refresh: true });

    expect(result.statusReason).toBe('account-unverified');
    expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('rejects an empty stored profile directory before reading files', async () => {
    const h = harness(credentials, full, config, { CLAUDE_CONFIG_DIR: '/other' });
    const result = await h.reader({
      target: { ...target, claudeUsageDir: { ...claudeUsageDir, canonicalConfigDir: '' } },
      refresh: true,
    });

    expect(result.statusReason).toBe('account-unverified');
    expect(h.read).not.toHaveBeenCalled();
    expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('uses the named route first when a stored profile directory is also present', async () => {
    const h = harness(boundCredentials, full, boundConfig, { CLAUDE_CONFIG_DIR: '/other' });
    const result = await h.reader({ target: { ...target, claudeUsageDir, claudeRoute: namedRoute }, refresh: true });

    expect(result.status).toBe('available');
    expect(h.read.mock.calls.map(([path]) => path)).toEqual([
      join(namedRoute.canonicalConfigDir, '.credentials.json'), join(namedRoute.canonicalConfigDir, '.claude.json'),
    ]);
  });
  // The bundled CLI build saves a fresh sign-in without an account id.
  const profileOf = (email: string, organization: string, uuid = 'acct-1') =>
    ({ account: { uuid, email }, organization: { uuid: 'org-1', name: organization } });
  function proofHarness(credentialFile: string, accountFile: string, profile: Response) {
    const h = harness(credentialFile, full, accountFile);
    const fetcher = h.fetcher as jest.Mock;
    fetcher.mockImplementation(async (url: string) => url === CLAUDE_OAUTH_PROFILE_URL ? profile : new Response(JSON.stringify(full)));
    return h;
  }
  const urls = (h: { fetcher: typeof fetch }) => (h.fetcher as jest.Mock).mock.calls.map(([url]) => url);
  it.each([
    ['the credential has no account id', credentials, boundConfig],
    ['the metadata has no account id', boundCredentials, config],
  ])('proves the token owner with its profile when %s', async (_label, credentialFile, accountFile) => {
    const h = proofHarness(credentialFile, accountFile, new Response(JSON.stringify(profileOf('person@example.test', 'Example'))));
    const result = await h.reader({ target: { ...target, claudeUsageDir }, refresh: true });
    expect(result.status).toBe('available');
    expect(urls(h)).toEqual([CLAUDE_OAUTH_PROFILE_URL, CLAUDE_OAUTH_USAGE_URL]);
  });
  it('skips the profile proof when both files carry the same account id', async () => {
    const h = proofHarness(boundCredentials, boundConfig, new Response('{}'));
    expect((await h.reader({ target: { ...target, claudeUsageDir }, refresh: true })).status).toBe('available');
    expect(urls(h)).toEqual([CLAUDE_OAUTH_USAGE_URL]);
  });
  it.each([
    ['names another owner', new Response(JSON.stringify(profileOf('other@example.invalid', 'Elsewhere'))), 'account-unverified'],
    ['contradicts the metadata account id', new Response(JSON.stringify(profileOf('person@example.test', 'Example', 'acct-2'))), 'account-unverified'],
    ['is malformed', new Response(JSON.stringify({ account: {} })), 'account-unverified'],
    ['is rejected', new Response('', { status: 401 }), 'usage-auth-rejected'],
  ])('never reads usage when the token profile %s', async (_label, profile, reason) => {
    const h = proofHarness(credentials, boundConfig, profile);
    expect((await h.reader({ target: { ...target, claudeUsageDir }, refresh: true })).statusReason).toBe(reason);
    expect(urls(h)).toEqual([CLAUDE_OAUTH_PROFILE_URL]);
  });
  it.each([
    ['the account ids differ', JSON.stringify({ claudeAiOauth: { accessToken: 'fixture-token', expiresAt: NOW + 60_000, accountUuid: 'acct-2' } }), boundConfig],
    ['the credential contradicts its own id spellings', JSON.stringify({ claudeAiOauth: { accessToken: 'fixture-token', expiresAt: NOW + 60_000, accountUuid: 'acct-1', account_uuid: 'acct-2' } }), boundConfig],
  ])('refuses a stored profile before HTTP when %s', async (_label, credentialFile, accountFile) => {
    const h = harness(credentialFile, full, accountFile);
    expect((await h.reader({ target: { ...target, claudeUsageDir }, refresh: true })).statusReason).toBe('account-unverified');
    expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('refuses a named response that contradicts the credential, and keeps the ambient rule', async () => {
    const contradicting = { ...full, account_uuid: 'acct-2' };
    const named = proofHarness(boundCredentials, config, new Response(JSON.stringify(profileOf('person@example.test', 'Example'))));
    (named.fetcher as jest.Mock).mockImplementation(async (url: string) => new Response(JSON.stringify(
      url === CLAUDE_OAUTH_PROFILE_URL ? profileOf('person@example.test', 'Example') : contradicting)));
    expect((await named.reader({ target: { ...target, claudeUsageDir }, refresh: true })).statusReason).toBe('account-unverified');
    // Ambient metadata without an id is unchanged: only the metadata ids are compared.
    const ambient = harness(boundCredentials, contradicting, config);
    expect((await ambient.reader({ target, refresh: true })).status).toBe('available');
  });
  it('refuses a usage response that names another account than the proved profile', async () => {
    // Neither local file carries an id, so only the profile can contradict the response.
    const h = proofHarness(credentials, config, new Response('{}'));
    (h.fetcher as jest.Mock).mockImplementation(async (url: string) => new Response(JSON.stringify(
      url === CLAUDE_OAUTH_PROFILE_URL ? profileOf('person@example.test', 'Example') : { ...full, account_uuid: 'acct-2' })));
    expect((await h.reader({ target: { ...target, claudeUsageDir }, refresh: true })).statusReason).toBe('account-unverified');
    expect(urls(h)).toEqual([CLAUDE_OAUTH_PROFILE_URL, CLAUDE_OAUTH_USAGE_URL]);
  });
});

import { readAntigravityOAuthQuota } from './antigravity-oauth-plan-usage.reader';

const token = async () => JSON.stringify({ client_id: 'id', client_secret: 'secret', refresh_token: 'refresh' });
const access = { access_token: 'access', expires_in: 3600 };
const summary = { buckets: [{ bucketId: 'weekly', window: 'weekly', remainingFraction: 0.5,
  resetTime: '2030-01-08T00:00:00Z' }, { bucketId: 'short', window: '5h', remainingFraction: 0.25 }] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('Antigravity OAuth quota', () => {
  it('reports a missing token without HTTP', async () => {
    const fetcher = jest.fn();
    const result = await readAntigravityOAuthQuota(undefined, Date.now, fetcher,
      async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); }, {});
    expect(result).toMatchObject({ statusReason: 'no-oauth', sourceFailures: [{ cause: 'missing-token-file' }] });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    [400, { error: 'invalid_grant' }, 'invalid-grant', 'usage-auth-rejected'],
    [403, {}, 'http-rejection', 'usage-auth-rejected'],
    [429, {}, 'http-rejection', 'usage-auth-rejected'],
    [200, { invalid: true }, 'schema-mismatch', 'cli-parse-failed'],
  ])('preserves refresh failure %s %s', async (status, body, cause, statusReason) => {
    const fetcher = jest.fn(async () => json(body, status));
    const result = await readAntigravityOAuthQuota(undefined, Date.now, fetcher, token, {});
    expect(result).toMatchObject({ statusReason, sourceFailures: [{ cause }] });
    if (status !== 200) expect(result.sourceFailures?.[0]?.httpStatus).toBe(status);
  });
  it.each([401, 403, 503])('preserves quota HTTP status %i', async (status) => {
    const fetcher: typeof fetch = jest.fn(async (url) => String(url).endsWith('/token') ? json(access) : json({}, status));
    const result = await readAntigravityOAuthQuota(undefined, Date.now, fetcher, token, {});
    expect(result.sourceFailures).toEqual([{ source: 'provider-api', reason: 'usage-auth-rejected',
      cause: 'http-rejection', httpStatus: status }]);
  });
  it('maps a valid OAuth response into complete windows and reuses the token', async () => {
    const fetcher = jest.fn(async (url) => String(url).endsWith('/token') ? json(access) : json(summary));
    const result = await readAntigravityOAuthQuota(undefined, () => 1, fetcher, token, {});
    expect(result).toMatchObject({ status: 'available', windowSetEstablished: true,
      windows: [{ kind: 'weekly', used: { kind: 'percent', percent: 50 }, resetsAt: Date.parse('2030-01-08T00:00:00Z') },
        { kind: 'five_hour', used: { percent: 75 } }] });
    await readAntigravityOAuthQuota(undefined, () => 2, fetcher, token, {});
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/token'))).toHaveLength(1);
  });
  it('refreshes once after a revoked access token', async () => {
    let quota = 0;
    const fetcher = jest.fn(async (url) => String(url).endsWith('/token') ? json(access)
      : ++quota === 1 ? json({}, 401) : json(summary));
    expect((await readAntigravityOAuthQuota(undefined, Date.now, fetcher, token, {})).status).toBe('available');
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/token'))).toHaveLength(2);
  });
  it.each(['not json', '{}'])('rejects malformed token data', async (raw) => {
    const fetcher = jest.fn();
    expect((await readAntigravityOAuthQuota(undefined, Date.now, fetcher, async () => raw, {}))
      .sourceFailures?.[0]?.cause).toBe('schema-mismatch');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('settles a hanging HTTP request and aborts it before twelve seconds', async () => {
    jest.useFakeTimers();
    try {
      let child: AbortSignal | null | undefined;
      const fetcher: typeof fetch = jest.fn((_url, init) => { child = init?.signal; return new Promise(() => undefined); });
      const work = readAntigravityOAuthQuota(undefined, Date.now, fetcher, token, {});
      await jest.advanceTimersByTimeAsync(10_000);
      expect((await work).sourceFailures?.[0]?.cause).toBe('timeout');
      expect(child?.aborted).toBe(true);
      expect(jest.getTimerCount()).toBe(0);
    } finally { jest.useRealTimers(); }
  });
});

describe('restored OAuth coverage', () => {
  it('returns before reading an already aborted request', async () => {
    const controller = new AbortController();
    controller.abort();
    const readAuth = jest.fn(token);
    expect(
      (
        await readAntigravityOAuthQuota(
          controller.signal,
          () => 1,
          jest.fn(),
          readAuth,
          {},
        )
      )?.status,
    ).toBe('service-unavailable');
    expect(readAuth).not.toHaveBeenCalled();
  });
  it('keeps invalid_grant unavailable and caps JSON bodies', async () => {
    const revoked = jest.fn(
      async () =>
        new Response(JSON.stringify({ error: 'invalid_grant' }), {
          status: 400,
        }),
    );
    expect(
      (
        await readAntigravityOAuthQuota(
          undefined,
          () => 1,
          revoked as typeof fetch,
          token,
          {},
        )
      )?.status,
    ).toBe('service-unavailable');
    const oversized = jest.fn(async () => new Response(' '.repeat(300_000)));
    expect(
      (
        await readAntigravityOAuthQuota(
          undefined,
          () => 1,
          oversized as typeof fetch,
          token,
          {},
        )
      )?.status,
    ).toBe('service-unavailable');
  });
  it('refreshes in memory and maps summary buckets', async () => {
    const fetcher = jest.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.endsWith('/token')
              ? access
              : {
                  buckets: [
                    {
                      bucketId: 'gemini-pro',
                      window: '5h',
                      remainingFraction: 0.3,
                      resetTime: '2030-01-01T00:00:00Z',
                    },
                  ],
                },
          ),
        ),
    );
    const result = await readAntigravityOAuthQuota(
      undefined,
      () => 1,
      fetcher as typeof fetch,
      token,
      {},
    );
    expect(result?.windows[0]).toMatchObject({
      kind: 'five_hour',
      used: { percent: 70 },
      resetsAt: Date.parse('2030-01-01T00:00:00Z'),
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(fetcher.mock.calls).toHaveLength(2);
  });
  it('continues to a second endpoint after a quota 403 without refreshing the token', async () => {
    let tokenReads = 0;
    const fetcher = jest.fn(async (url: string) => {
      if (url.endsWith('/token')) {
        tokenReads += 1;
        return new Response(JSON.stringify(access));
      }
      if (url.includes('daily-cloudcode-pa'))
        return new Response('', { status: 403 });
      return new Response(
        JSON.stringify({
          buckets: [{ bucketId: 'go', remainingFraction: 0.5 }],
        }),
      );
    });
    const result = await readAntigravityOAuthQuota(
      undefined,
      () => 1,
      fetcher as typeof fetch,
      token,
      {},
    );
    expect(result?.status).toBe('available');
    expect(tokenReads).toBe(1);
    expect(
      fetcher.mock.calls.some(
        ([url]) =>
          url.includes('cloudcode-pa') && !url.includes('daily-cloudcode-pa'),
      ),
    ).toBe(true);
  });
});

describe('OAuth payload variants', () => {
  it('caps an oversized quota response after a successful token refresh', async () => {
    const fetcher = jest.fn(async (url) => String(url).endsWith('/token') ? json(access) : new Response(' '.repeat(300_000)));
    expect(await readAntigravityOAuthQuota(undefined, () => 1, fetcher, token, {}))
      .toMatchObject({ status: 'service-unavailable', windows: [], sourceFailures: [{ cause: 'request-failed' }] });
    expect(fetcher.mock.calls).toHaveLength(2);
  });
  it('maps grouped summary buckets and skips disabled buckets', async () => {
    const fetcher = jest.fn(async (url) => String(url).endsWith('/token') ? json(access) : json({ groups: [{ buckets: [
      { bucketId: 'weekly', window: 'weekly', remainingFraction: 0.25 },
      { bucketId: 'disabled', disabled: true, remainingFraction: 1 },
    ] }] }));
    const result = await readAntigravityOAuthQuota(undefined, () => 1, fetcher, token, {});
    expect(result.status).toBe('available');
    expect(result.windows).toHaveLength(1);
    expect(result.windows[0]).toMatchObject({ kind: 'weekly', used: { percent: 75 } });
  });
  it('falls back to fetchAvailableModels and maps supported model families', async () => {
    const fetcher = jest.fn(async (url) => String(url).endsWith('/token') ? json(access)
      : String(url).includes('retrieveUserQuotaSummary') ? json({}) : json({ models: {
        'gemini-pro': { quotaInfo: { remainingFraction: 0.3, resetTime: '2030-01-01T00:00:00Z' } },
        'claude-sonnet': { weeklyQuotaInfo: { remainingFraction: 0.5 } },
        'gpt-5': { quotaInfo: { remainingFraction: 0.75 } },
        unknown: { quotaInfo: { remainingFraction: 1 } },
      } }));
    const result = await readAntigravityOAuthQuota(undefined, () => 1, fetcher, token, {});
    expect(result.status).toBe('available');
    expect(result.windows).toHaveLength(3);
    expect(result.windows).toEqual([
      expect.objectContaining({ kind: 'other', used: { kind: 'percent', percent: 70 }, resetsAt: Date.parse('2030-01-01T00:00:00Z') }),
      expect.objectContaining({ kind: 'weekly', used: { kind: 'percent', percent: 50 } }),
      expect.objectContaining({ kind: 'other', used: { kind: 'percent', percent: 25 } }),
    ]);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('fetchAvailableModels'))).toBe(true);
  });
});

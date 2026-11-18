import { createMockLogger } from '@ptah-extension/shared/testing';
import { createGrokAccountPlanUsageReader } from './grok-account-plan-usage.reader';
import type { PlanOwnerTarget } from './plan-usage-reader.types';

const target = {
  providerId: 'grok',
  ownerRef: { key: 'grok', identityKind: 'cli-store' },
} as PlanOwnerTarget;
const request = { target, refresh: true };
const auth = async (path: string) =>
  path.endsWith('auth.json')
    ? JSON.stringify({
        'https://accounts.x.ai/sign-in': {
          key: 'secret',
          email: 'private@example.test',
        },
      })
    : '';

describe('Grok account plan reader', () => {
  it.each([
    { balance: 0, windowCount: 1, exhausted: false },
    { balance: 5, windowCount: 0, exhausted: false },
    { balance: 'invalid', windowCount: 0, exhausted: false },
    { balance: undefined, windowCount: 1, exhausted: false },
  ])(
    'handles prepaid balance $balance with a 100% period',
    async ({ balance, windowCount, exhausted }) => {
      const fetcher = jest.fn(
        async () =>
          new Response(
            JSON.stringify({
              config: {
                creditUsagePercent: 100,
                currentPeriod: {
                  type: 'USAGE_PERIOD_TYPE_WEEKLY',
                  end: '2030-01-01T00:00:00Z',
                },
                ...(balance !== undefined && {
                  prepaidBalance: { val: balance },
                }),
              },
            }),
          ),
      );
      const result = await createGrokAccountPlanUsageReader(
        () => 1,
        fetcher,
        auth as never,
        {},
      )(request);
      expect(result.status).toBe('available');
      expect(result.windowSetEstablished).toBe(balance !== 'invalid');
      expect(result.windows).toHaveLength(windowCount);
      if (windowCount)
        expect(result.windows[0].used).toMatchObject({
          kind: 'percent',
          percent: 100,
        });
      expect(result.windows[0]?.exhaustion?.source).toBe(
        exhausted ? 'provider-api' : undefined,
      );
      if (balance === 0) {
        expect(result.credits).toEqual({
          balance: '0',
          hasCredits: false,
          unlimited: false,
        });
      } else if (balance === 5) {
        expect(result.credits).toEqual({
          balance: '5',
          hasCredits: true,
          unlimited: false,
        });
      } else if (balance === 'invalid') {
        expect(result.statusReason).toBe('prepaid-balance-unavailable');
        expect(result.credits).toBeUndefined();
      } else {
        expect(result.statusReason).toBeUndefined();
        expect(result.credits).toBeUndefined();
      }
    },
  );
  it.each([
    {
      percent: 75,
      prepaidBalance: { val: 0 },
      count: 1,
      reason: undefined,
      credit: '0',
    },
    {
      percent: 110,
      prepaidBalance: { val: 0 },
      count: 1,
      reason: undefined,
      credit: '0',
    },
    {
      percent: 100,
      prepaidBalance: null,
      count: 1,
      reason: undefined,
      credit: undefined,
    },
    {
      percent: 100,
      prepaidBalance: { val: '12' },
      count: 0,
      reason: undefined,
      credit: '12',
    },
    {
      percent: 100,
      prepaidBalance: { val: -1 },
      count: 0,
      reason: 'prepaid-balance-unavailable',
      credit: undefined,
    },
  ])(
    'parses balance $prepaidBalance at $percent percent',
    async ({ percent, prepaidBalance, count, reason, credit }) => {
      const fetcher = jest.fn(
        async () =>
          new Response(
            JSON.stringify({
              config: {
                creditUsagePercent: percent,
                prepaidBalance,
                currentPeriod: {
                  type: 'USAGE_PERIOD_TYPE_WEEKLY',
                  end: '2030-01-01T00:00:00Z',
                },
              },
            }),
          ),
      );
      const result = await createGrokAccountPlanUsageReader(
        () => 1,
        fetcher,
        auth as never,
        {},
      )(request);
      expect(result.windows).toHaveLength(count);
      expect(result.windows[0]?.exhaustion).toBeUndefined();
      expect(result.statusReason).toBe(reason);
      expect(result.credits?.balance).toBe(credit);
    },
  );
  it('does not read CLI auth for a credential owner', async () => {
    const readAuth = jest.fn(auth);
    const result = await createGrokAccountPlanUsageReader(
      () => 1,
      jest.fn(),
      readAuth as never,
      {},
    )({
      ...request,
      target: {
        ...target,
        ownerRef: { ...target.ownerRef, identityKind: 'credential' },
      },
    });
    expect(result.status).toBe('no-usage-source');
    expect(readAuth).not.toHaveBeenCalled();
  });
  it('skips a verified account owner whose identity cannot be bound to CLI auth', async () => {
    const readAuth = jest.fn(auth);
    const fetcher = jest.fn();
    const result = await createGrokAccountPlanUsageReader(
      () => 1,
      fetcher,
      readAuth as never,
      {},
    )({
      ...request,
      target: {
        ...target,
        ownerRef: { ...target.ownerRef, identityKind: 'account' },
      },
    });
    expect(result.status).toBe('no-usage-source');
    expect(readAuth).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('maps HTTP 401 to authentication needed', async () => {
    const result = await createGrokAccountPlanUsageReader(
      () => 1,
      jest.fn(async () => new Response('', { status: 401 })),
      auth as never,
      {},
    )(request);
    expect(result.status).toBe('unsupported-auth');
  });
  it('maps account billing without exposing the credential or email', async () => {
    const fetcher = jest.fn(
      async () =>
        new Response(
          JSON.stringify({
            config: {
              creditUsagePercent: 27,
              currentPeriod: {
                type: 'USAGE_PERIOD_TYPE_WEEKLY',
                end: '2030-01-01T00:00:00Z',
              },
            },
          }),
        ),
    );
    const result = await createGrokAccountPlanUsageReader(
      () => 1,
      fetcher,
      auth as never,
      {},
    )(request);
    expect(result.windows[0]).toMatchObject({
      kind: 'weekly',
      used: { percent: 27 },
      resetsAt: Date.parse('2030-01-01T00:00:00Z'),
    });
    expect(JSON.stringify(result)).not.toContain('private@example.test');
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('stamps the request before the response is parsed', async () => {
    const now = jest.fn().mockReturnValueOnce(10).mockReturnValueOnce(20);
    const result = await createGrokAccountPlanUsageReader(
      now,
      jest.fn(
        async () =>
          new Response(
            JSON.stringify({ config: { prepaidBalance: { val: 5 } } }),
          ),
      ),
      auth as never,
      {},
    )(request);
    expect(result).toMatchObject({ requestedAt: 10, fetchedAt: 20 });
  });
  it('returns no plan for API-key mode and 403', async () => {
    const fetcher = jest.fn();
    expect(
      (
        await createGrokAccountPlanUsageReader(
          () => 1,
          fetcher,
          auth as never,
          { XAI_API_KEY: 'key' },
        )(request)
      ).status,
    ).toBe('no-usage-source');
    expect(fetcher).not.toHaveBeenCalled();
    expect(
      (
        await createGrokAccountPlanUsageReader(
          () => 1,
          jest.fn(async () => new Response('', { status: 403 })),
          auth as never,
          {},
        )(request)
      ).status,
    ).toBe('no-usage-source');
  });
  it('names the API-key reason for XAI_API_KEY and for auth_mode api_key', async () => {
    const viaEnv = await createGrokAccountPlanUsageReader(
      () => 1,
      jest.fn(),
      auth as never,
      { XAI_API_KEY: 'key' },
    )(request);
    expect(viaEnv.statusReason).toBe('api-key-no-subscription-quota');
    const viaAuth = await createGrokAccountPlanUsageReader(
      () => 1,
      jest.fn(),
      (async () =>
        JSON.stringify({
          'https://accounts.x.ai/sign-in': { auth_mode: 'api_key', key: 'k' },
        })) as never,
      {},
    )(request);
    expect(viaAuth.status).toBe('no-usage-source');
    expect(viaAuth.statusReason).toBe('api-key-no-subscription-quota');
  });
  it('rejects malformed billing and times out', async () => {
    expect(
      (
        await createGrokAccountPlanUsageReader(
          () => 1,
          jest.fn(async () => new Response('{')),
          auth as never,
          {},
        )(request)
      ).status,
    ).toBe('service-unavailable');
    jest.useFakeTimers();
    try {
      const fetcher = jest.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_, reject) =>
            init?.signal?.addEventListener('abort', () =>
              reject(new Error('aborted')),
            ),
          ),
      );
      const logger = createMockLogger();
      const pending = createGrokAccountPlanUsageReader(
        () => 1,
        fetcher as typeof fetch,
        auth as never,
        {},
        logger,
      )(request);
      await jest.advanceTimersByTimeAsync(5_000);
      expect(await pending).toMatchObject({
        status: 'service-unavailable',
        statusReason: 'cli-timeout',
      });
      expect(logger.debug).toHaveBeenCalledWith(
        '[GrokPlanUsage] direct reader rejected',
        { status: 'service-unavailable', reason: 'cli-timeout' },
      );
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('Grok direct reader rejection diagnostics', () => {
  it.each([
    [401, 'balance-auth-rejected'],
    [403, 'balance-auth-rejected'],
    [402, 'balance-unavailable'],
    [500, 'cli-unavailable'],
  ] as const)('HTTP %s returns and logs %s safely', async (status, reason) => {
    const logger = createMockLogger();
    const fetcher = jest.fn(
      async () => new Response('private response body', { status }),
    );
    const result = await createGrokAccountPlanUsageReader(
      () => 1,
      fetcher,
      auth as never,
      {},
      logger,
    )(request);
    expect(result.statusReason).toBe(reason);
    expect(result.windows).toEqual([]);
    expect(logger.debug).toHaveBeenCalledWith(
      '[GrokPlanUsage] direct reader rejected',
      { status: result.status, reason },
    );
    expect(JSON.stringify(logger.debug.mock.calls)).not.toMatch(
      /secret|private|@|Bearer/,
    );
  });

  it.each([
    {
      env: { XAI_API_KEY: 'private-key' },
      reason: 'api-key-no-subscription-quota',
    },
    {
      env: { GROK_MODELS_BASE_URL: 'https://custom.test' },
      reason: 'custom-auth-config',
    },
    { env: { GROK_AUTH: '{}' }, reason: 'cli-not-signed-in' },
    { env: { GROK_AUTH: '{' }, reason: 'cli-parse-failed' },
  ])('gates $reason before HTTP', async ({ env, reason }) => {
    const logger = createMockLogger();
    const fetcher = jest.fn();
    const result = await createGrokAccountPlanUsageReader(
      () => 1,
      fetcher,
      auth as never,
      env,
      logger,
    )(request);
    expect(result.statusReason).toBe(
      reason === 'custom-auth-config' ? undefined : reason,
    );
    expect(result.windows).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      '[GrokPlanUsage] direct reader rejected',
      { status: result.status, reason },
    );
  });

  it('rejects non-default owners before reading credentials', async () => {
    const read = jest.fn();
    const logger = createMockLogger();
    const result = await createGrokAccountPlanUsageReader(
      () => 1,
      jest.fn(),
      read,
      {},
      logger,
    )({
      ...request,
      target: {
        ...target,
        ownerRef: { ...target.ownerRef, identityKind: 'account' },
      },
    });
    expect(result.statusReason).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalled();
  });

  it.each(['{', '{"config":{"creditUsagePercent":"invalid"}}'])(
    'rejects billing schema %s',
    async (body) => {
      const logger = createMockLogger();
      const result = await createGrokAccountPlanUsageReader(
        () => 1,
        jest.fn(async () => new Response(body)),
        auth as never,
        {},
        logger,
      )(request);
      expect(result.statusReason).toBe('cli-parse-failed');
      expect(logger.debug).toHaveBeenCalled();
    },
  );

  it.each(['{}', '{"other":true}'])(
    'preserves available HTTP 200 without config: %s',
    async (body) => {
      const result = await createGrokAccountPlanUsageReader(
        () => 1,
        jest.fn(async () => new Response(body)),
        auth as never,
        {},
      )(request);
      expect(result).toMatchObject({
        status: 'available',
        windows: [],
        windowSetEstablished: true,
      });
      expect(result.statusReason).toBeUndefined();
    },
  );

  it('keeps the diagnosed login billing shape complete', async () => {
    const body = {
      config: {
        creditUsagePercent: 30,
        currentPeriod: {
          type: 'USAGE_PERIOD_TYPE_MONTHLY',
          start: '2026-11-01T00:00:00Z',
          end: '2026-12-01T00:00:00Z',
        },
        prepaidBalance: { val: 5 },
        productUsage: {},
        isUnifiedBillingUser: true,
        topUpMethod: 'synthetic',
        billingPeriodStart: '2026-11-01T00:00:00Z',
        billingPeriodEnd: '2026-12-01T00:00:00Z',
      },
    };
    const logger = createMockLogger();
    const result = await createGrokAccountPlanUsageReader(
      () => 10,
      jest.fn(async () => new Response(JSON.stringify(body))),
      auth as never,
      {},
      logger,
    )(request);
    expect(result.windowSetEstablished).toBe(true);
    expect(result.windows).toHaveLength(1);
    expect(result.windows[0]).toMatchObject({
      kind: 'monthly',
      used: { percent: 30 },
      resetsAt: Date.parse('2026-12-01T00:00:00Z'),
    });
    expect(result.credits?.hasCredits).toBe(true);
    expect(logger.debug).not.toHaveBeenCalled();
  });
});

it.each(['config.toml', 'managed_config.toml', 'requirements.toml'])(
  'rejects custom auth in %s before HTTP',
  async (file) => {
    const logger = createMockLogger();
    const fetcher = jest.fn();
    const read = async (path: string) =>
      path.endsWith(file)
        ? '[endpoints]\nurl = "https://custom.test"'
        : auth(path);
    const result = await createGrokAccountPlanUsageReader(
      () => 1,
      fetcher,
      read as never,
      {},
      logger,
    )(request);
    expect(result.statusReason).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      '[GrokPlanUsage] direct reader rejected',
      { status: 'no-usage-source', reason: 'custom-auth-config' },
    );
  },
);

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
  ])('handles prepaid balance $balance with a 100% period', async ({ balance, windowCount, exhausted }) => {
    const fetcher = jest.fn(async () => new Response(JSON.stringify({
      config: {
        creditUsagePercent: 100,
        currentPeriod: { type: 'USAGE_PERIOD_TYPE_WEEKLY', end: '2030-01-01T00:00:00Z' },
        ...(balance !== undefined && { prepaidBalance: { val: balance } }),
      },
    })));
    const result = await createGrokAccountPlanUsageReader(() => 1, fetcher, auth as never, {})(request);
    expect(result.status).toBe('available');
    expect(result.windowSetEstablished).toBe(balance !== 'invalid');
    expect(result.windows).toHaveLength(windowCount);
    if (windowCount) expect(result.windows[0].used).toMatchObject({ kind: 'percent', percent: 100 });
    expect(result.windows[0]?.exhaustion?.source).toBe(exhausted ? 'provider-api' : undefined);
    if (balance === 0) {
      expect(result.credits).toEqual({ balance: '0', hasCredits: false, unlimited: false });
    } else if (balance === 5) {
      expect(result.credits).toEqual({ balance: '5', hasCredits: true, unlimited: false });
    } else if (balance === 'invalid') {
      expect(result.statusReason).toBe('prepaid-balance-unavailable');
      expect(result.credits).toBeUndefined();
    } else {
      expect(result.statusReason).toBeUndefined();
      expect(result.credits).toBeUndefined();
    }
  });
  it.each([
    { percent: 75, prepaidBalance: { val: 0 }, count: 1, reason: undefined, credit: '0' },
    { percent: 110, prepaidBalance: { val: 0 }, count: 1, reason: undefined, credit: '0' },
    { percent: 100, prepaidBalance: null, count: 1, reason: undefined, credit: undefined },
    { percent: 100, prepaidBalance: { val: '12' }, count: 0, reason: undefined, credit: '12' },
    { percent: 100, prepaidBalance: { val: -1 }, count: 0, reason: 'prepaid-balance-unavailable', credit: undefined },
  ])('parses balance $prepaidBalance at $percent percent', async ({ percent, prepaidBalance, count, reason, credit }) => {
    const fetcher = jest.fn(async () => new Response(JSON.stringify({ config: {
      creditUsagePercent: percent, prepaidBalance,
      currentPeriod: { type: 'USAGE_PERIOD_TYPE_WEEKLY', end: '2030-01-01T00:00:00Z' },
    } })));
    const result = await createGrokAccountPlanUsageReader(() => 1, fetcher, auth as never, {})(request);
    expect(result.windows).toHaveLength(count);
    expect(result.windows[0]?.exhaustion).toBeUndefined();
    expect(result.statusReason).toBe(reason);
    expect(result.credits?.balance).toBe(credit);
  });
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
      jest.fn(async () => new Response(JSON.stringify({ config: { prepaidBalance: { val: 5 } } }))),
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
      const pending = createGrokAccountPlanUsageReader(
        () => 1,
        fetcher as typeof fetch,
        auth as never,
        {},
      )(request);
      await jest.advanceTimersByTimeAsync(5_000);
      expect((await pending).status).toBe('service-unavailable');
    } finally {
      jest.useRealTimers();
    }
  });
});

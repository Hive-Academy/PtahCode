import {
  OpenCodeLiveRoutes,
  protocolFromGatewayApi,
  protocolFromNpm,
} from './opencode-live-routes';

const model = (id: string, api: string) => ({
  id,
  name: `Name ${id}`,
  limit: { context: 128000 },
  capabilities: { tools: { supported: true } },
  api: { [api]: {} },
});

describe('OpenCode live routes', () => {
  afterEach(() => jest.useRealTimers());

  it('refreshes list after five minutes and retains a fresh last good map on failure', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    let fail = false;
    const getJson = jest.fn(async () => {
      if (fail) throw new Error('offline');
      return { data: [model('good-id', 'messages')] };
    });
    const routes = new OpenCodeLiveRoutes(getJson);
    expect((await routes.list('opencode-zen'))?.has('good-id')).toBe(true);
    jest.advanceTimersByTime(4 * 60 * 1000);
    await routes.list('opencode-zen');
    expect(getJson).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(2 * 60 * 1000);
    fail = true;
    expect((await routes.list('opencode-zen'))?.has('good-id')).toBe(true);
    expect(getJson).toHaveBeenCalledTimes(2);
  });

  it('returns null when no good map exists or the good map has expired', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const failing = new OpenCodeLiveRoutes(async () => {
      throw new Error('offline');
    });
    expect(await failing.list('opencode-zen')).toBeNull();
    let fail = false;
    const routes = new OpenCodeLiveRoutes(async () => {
      if (fail) throw new Error('offline');
      return { data: [model('good-id', 'messages')] };
    });
    await routes.list('opencode-go');
    jest.advanceTimersByTime(6 * 60 * 60 * 1000 + 1);
    fail = true;
    expect(await routes.list('opencode-go')).toBeNull();
  });

  it('refreshes an unknown ID after five minutes, while known IDs and recent misses stay cached', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    let published = false;
    const getJson = jest.fn(async () => ({
      data: published
        ? [model('known-id', 'messages'), model('new-id', 'responses')]
        : [model('known-id', 'messages')],
    }));
    const routes = new OpenCodeLiveRoutes(getJson);
    await routes.list('opencode-zen');
    jest.advanceTimersByTime(60 * 1000);
    expect(await routes.resolve('opencode-zen', 'new-id')).toBeUndefined();
    expect(getJson).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(5 * 60 * 1000);
    published = true;
    expect(await routes.resolve('opencode-zen', 'new-id')).toBe('responses');
    expect(getJson).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(5 * 60 * 60 * 1000);
    expect(await routes.resolve('opencode-zen', 'known-id')).toBe('messages');
    expect(getJson).toHaveBeenCalledTimes(2);
  });

  it('shares one refresh among twenty concurrent unknown IDs', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    let release:
      ((value: { data: ReturnType<typeof model>[] }) => void) | undefined;
    const getJson = jest
      .fn()
      .mockResolvedValueOnce({ data: [model('known-id', 'messages')] })
      .mockImplementationOnce(
        () =>
          new Promise<{ data: ReturnType<typeof model>[] }>((resolve) => {
            release = resolve;
          }),
      );
    const routes = new OpenCodeLiveRoutes(getJson);
    await routes.list('opencode-go');
    jest.advanceTimersByTime(6 * 60 * 1000);
    const results = Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        routes.resolve('opencode-go', `unknown-${i}`),
      ),
    );
    expect(getJson).toHaveBeenCalledTimes(2);
    release?.({ data: [model('unknown-0', 'responses')] });
    expect((await results)[0]).toBe('responses');
    expect(getJson).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['opencode-zen', 'https://opencode.ai/zen/v1/models'],
    ['opencode-go', 'https://opencode.ai/zen/go/v1/models'],
  ] as const)('uses the %s provider base URL', async (providerId, url) => {
    const getJson = jest.fn(async () => ({
      data: [model('new-id', 'messages')],
    }));
    await new OpenCodeLiveRoutes(getJson).list(providerId);
    expect(getJson).toHaveBeenCalledWith(url);
  });

  it('reports refresh failures through an optional debug logger', async () => {
    const logger = { debug: jest.fn() };
    const routes = new OpenCodeLiveRoutes(
      async () => {
        throw new Error('offline');
      },
      { logger },
    );
    await routes.list('opencode-zen');
    expect(logger.debug).toHaveBeenCalledWith(
      'OpenCode live model refresh failed',
      {
        providerId: 'opencode-zen',
        message: 'offline',
      },
    );
  });
  it('maps only the gateway protocols Ptah translates', () => {
    expect(protocolFromGatewayApi({ messages: {} })).toBe('messages');
    expect(protocolFromGatewayApi({ responses: {} })).toBe('responses');
    expect(protocolFromGatewayApi({ 'chat-completions': {} })).toBe(
      'chat/completions',
    );
    expect(protocolFromGatewayApi({ 'generate-content': {} })).toBeUndefined();
    expect(
      protocolFromGatewayApi({ messages: {}, responses: {} }),
    ).toBeUndefined();
  });

  it('pins the known catalog npm packages and rejects an unmapped one', () => {
    expect(protocolFromNpm('@ai-sdk/anthropic')).toBe('messages');
    expect(protocolFromNpm('@ai-sdk/openai')).toBe('responses');
    expect(protocolFromNpm('@ai-sdk/openai-compatible')).toBe(
      'chat/completions',
    );
    expect(protocolFromNpm('@ai-sdk/google')).toBeUndefined();
  });

  it('treats Object.prototype keys from the gateway as unmapped', () => {
    // A plain `table[key]` returns an inherited member for these keys —
    // truthy, and then used as the model's protocol. The lookups must see
    // own properties only, the same guard `getOpenCodeModelProtocol` uses.
    expect(protocolFromNpm('constructor')).toBeUndefined();
    expect(protocolFromNpm('toString')).toBeUndefined();
    expect(protocolFromNpm('__proto__')).toBeUndefined();
    expect(protocolFromGatewayApi({ constructor: {} })).toBeUndefined();
    expect(protocolFromGatewayApi({ toString: {} })).toBeUndefined();
    // A JSON body can carry `__proto__` as an own key; it must not resolve to
    // `Object.prototype` through the inherited lookup.
    expect(
      protocolFromGatewayApi(
        JSON.parse('{"__proto__":{}}') as Record<string, unknown>,
      ),
    ).toBeUndefined();
    // Keys the tables actually define keep their mapping.
    expect(protocolFromGatewayApi({ messages: {} })).toBe('messages');
    expect(protocolFromNpm('@ai-sdk/anthropic')).toBe('messages');
  });

  it('skips invalid entries and keeps the valid ones', async () => {
    // One malformed row used to reject the whole payload, so a single bad
    // entry hid every valid model behind a failed refresh.
    const logger = { debug: jest.fn() };
    const routes = new OpenCodeLiveRoutes(
      async () => ({
        data: [
          model('good-id', 'messages'),
          { id: 'bad-context', limit: { context: null } },
          'not-an-object',
        ],
      }),
      { logger },
    );
    const catalog = await routes.list('opencode-zen');
    expect(catalog?.has('good-id')).toBe(true);
    expect(catalog?.has('bad-context')).toBe(false);
    expect(logger.debug).toHaveBeenCalledWith(
      'OpenCode live model refresh skipped invalid catalog entries',
      { providerId: 'opencode-zen', kept: 1, skipped: 2 },
    );
  });

  it('treats a payload whose entries are all invalid as a failed refresh', async () => {
    const routes = new OpenCodeLiveRoutes(async () => ({
      data: [{ id: 'bad-context', limit: { context: null } }],
    }));
    expect(await routes.list('opencode-zen')).toBeNull();
  });

  it('keeps static priority and resolves a new ID after one refresh', async () => {
    const getJson = jest.fn(async () => ({
      data: [
        model('claude-fable-5-1', 'responses'),
        model('new-id', 'messages'),
      ],
    }));
    const routes = new OpenCodeLiveRoutes(getJson);
    expect(await routes.resolve('opencode-zen', 'claude-fable-5-1')).toBe(
      'messages',
    );
    expect(getJson).not.toHaveBeenCalled();
    expect(await routes.resolve('opencode-zen', 'new-id')).toBe('messages');
    expect(getJson).toHaveBeenCalledTimes(1);
    expect(await routes.resolve('opencode-zen', 'another-id')).toBeUndefined();
    expect(getJson).toHaveBeenCalledTimes(1);
  });

  it('shares the in-flight refresh and retains an old map on failure', async () => {
    let fail = false;
    const getJson = jest.fn(async () => {
      if (fail) throw new Error('offline');
      return { data: [model('new-id', 'responses')] };
    });
    const routes = new OpenCodeLiveRoutes(getJson);
    await Promise.all([
      routes.resolve('opencode-go', 'new-id'),
      routes.resolve('opencode-go', 'new-id'),
    ]);
    expect(getJson).toHaveBeenCalledTimes(1);
    fail = true;
    await routes.refresh('opencode-go');
    expect(await routes.resolve('opencode-go', 'new-id')).toBe('responses');
    expect(await routes.resolve('opencode-go', 'unknown')).toBeUndefined();
    expect(getJson).toHaveBeenCalledTimes(2);
  });

  it('exposes routed live metadata while leaving unsupported IDs unrouted', async () => {
    const routes = new OpenCodeLiveRoutes(async () => ({
      data: [
        model('new-id', 'responses'),
        model('google-id', 'generate-content'),
      ],
    }));
    const catalog = await routes.list('opencode-go');
    expect(catalog?.get('new-id')).toMatchObject({
      name: 'Name new-id',
      contextLength: 128000,
      supportsToolUse: true,
      protocol: 'responses',
    });
    expect(catalog?.get('google-id')?.protocol).toBeUndefined();
  });
});

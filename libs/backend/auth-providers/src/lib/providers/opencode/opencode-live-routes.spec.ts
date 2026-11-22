import { AxiosError } from 'axios';
import type { ProviderModelInfo } from '@ptah-extension/shared';
import {
  OpenCodeLiveRoutes,
  protocolFromGatewayApi,
  protocolFromNpm,
  type OpenCodeCatalogStore,
} from './opencode-live-routes';
import { ModelListError } from '../../model-list-error';

const model = (
  id: string,
  api: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  name: `Name ${id}`,
  limit: { context: 128000 },
  capabilities: { tools: { supported: true } },
  api: { [api]: {} },
  ...extra,
});

function memoryStore(
  initial: Partial<Record<string, ProviderModelInfo[]>> = {},
): OpenCodeCatalogStore & { saved: Map<string, ProviderModelInfo[]> } {
  const saved = new Map<string, ProviderModelInfo[]>(
    Object.entries(initial).filter(
      (entry): entry is [string, ProviderModelInfo[]] => !!entry[1],
    ),
  );
  return {
    saved,
    read: jest.fn((id: string) => {
      const models = saved.get(id);
      return models ? { models, savedAt: 1 } : null;
    }),
    write: jest.fn((id: string, models: ProviderModelInfo[]) => {
      saved.set(id, models);
    }),
  };
}

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error: unknown) {
    if (error instanceof ModelListError) return error.reason;
    throw error;
  }
  throw new Error('expected a ModelListError');
}

const persistedRow = (
  id: string,
  upstreamProtocol?: ProviderModelInfo['upstreamProtocol'],
): ProviderModelInfo => ({
  id,
  name: id,
  description: '',
  contextLength: 0,
  supportsToolUse: true,
  ...(upstreamProtocol && { upstreamProtocol }),
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
    expect((await routes.list('opencode-zen')).map((m) => m.id)).toEqual([
      'good-id',
    ]);
    jest.advanceTimersByTime(4 * 60 * 1000);
    await routes.list('opencode-zen');
    expect(getJson).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(2 * 60 * 1000);
    fail = true;
    expect((await routes.list('opencode-zen')).map((m) => m.id)).toEqual([
      'good-id',
    ]);
    expect(getJson).toHaveBeenCalledTimes(2);
  });

  it('throws the classified reason when no good map exists or it has expired', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const failing = new OpenCodeLiveRoutes(async () => {
      throw Object.assign(new Error('getaddrinfo ENOTFOUND'), {
        code: 'ENOTFOUND',
      });
    });
    expect(await reasonOf(failing.list('opencode-zen'))).toBe('network');
    let fail = false;
    const routes = new OpenCodeLiveRoutes(async () => {
      if (fail)
        throw new AxiosError('timeout of 4000ms exceeded', 'ECONNABORTED');
      return { data: [model('good-id', 'messages')] };
    });
    await routes.list('opencode-go');
    jest.advanceTimersByTime(6 * 60 * 60 * 1000 + 1);
    fail = true;
    expect(await reasonOf(routes.list('opencode-go'))).toBe('timeout');
  });

  it.each([
    ['an envelope that fails the schema', { models: [] }],
    ['an empty data array', { data: [] }],
    [
      'rows that are all invalid',
      { data: [{ id: 'x', limit: { context: null } }] },
    ],
    [
      'only non-chat rows',
      {
        data: [
          model('embed', 'messages', { type: 'embedding' }),
          model('image', 'messages', { type: 'image' }),
        ],
      },
    ],
    [
      'only unroutable rows',
      {
        data: [
          model('google', 'generate-content'),
          model('multi', 'x', { api: { messages: {}, responses: {} } }),
        ],
      },
    ],
  ])('fails %s as bad-response', async (_label, payload) => {
    const routes = new OpenCodeLiveRoutes(async () => payload);
    expect(await reasonOf(routes.list('opencode-zen'))).toBe('bad-response');
  });

  it('fails a body over the 2 MiB cap as bad-response', async () => {
    const routes = new OpenCodeLiveRoutes(async () => {
      throw new AxiosError(
        'maxContentLength size of 2097152 exceeded',
        'ERR_BAD_RESPONSE',
      );
    });
    expect(await reasonOf(routes.list('opencode-zen'))).toBe('bad-response');
  });

  it('fails an HTTP 5xx as http-error', async () => {
    const routes = new OpenCodeLiveRoutes(async () => {
      throw new AxiosError(
        'Request failed',
        'ERR_BAD_RESPONSE',
        undefined,
        undefined,
        {
          status: 503,
          statusText: 'Service Unavailable',
          headers: {},
          config: {} as never,
          data: '',
        },
      );
    });
    expect(await reasonOf(routes.list('opencode-zen'))).toBe('http-error');
  });

  it('keeps only chat rows (missing type kept) with a resolvable protocol', async () => {
    const routes = new OpenCodeLiveRoutes(async () => ({
      data: [
        model('chat', 'messages', { type: 'chat' }),
        model('untyped', 'responses'),
        model('embed', 'messages', { type: 'embedding' }),
        model('google', 'generate-content'),
      ],
    }));
    expect((await routes.list('opencode-zen')).map((m) => m.id)).toEqual([
      'chat',
      'untyped',
    ]);
  });

  it('prefers recommended_api over the api keys and routes multi-api rows', async () => {
    const routes = new OpenCodeLiveRoutes(async () => ({
      data: [
        model('recommended', 'messages', { recommended_api: 'responses' }),
        {
          ...model('multi', 'messages'),
          api: { messages: {}, 'chat-completions': {} },
          recommended_api: 'chat-completions',
        },
        // An unmapped recommendation falls back to the single-api rule.
        model('fallback', 'messages', { recommended_api: 'interactions' }),
        // Prototype keys are not protocols.
        model('proto', 'generate-content', { recommended_api: 'constructor' }),
      ],
    }));
    const rows = await routes.list('opencode-go');
    expect(
      Object.fromEntries(rows.map((m) => [m.id, m.upstreamProtocol])),
    ).toEqual({
      recommended: 'responses',
      multi: 'chat/completions',
      fallback: 'messages',
    });
  });

  it('maps rows to picker models with provider capacity and tool flags', async () => {
    const routes = new OpenCodeLiveRoutes(async () => ({
      data: [
        model('tools', 'messages'),
        { id: 'bare', api: { responses: {} } },
        model('no-tools', 'messages', {
          capabilities: { tools: { supported: false } },
          limit: { context: 0 },
        }),
      ],
    }));
    const rows = await routes.list('opencode-zen');
    expect(rows).toEqual([
      {
        id: 'tools',
        name: 'Name tools',
        description: 'Name tools via OpenCode Zen',
        contextLength: 128000,
        contextLengthSource: 'provider',
        supportsToolUse: true,
        upstreamProtocol: 'messages',
      },
      {
        id: 'bare',
        name: 'bare',
        description: 'bare via OpenCode Zen',
        contextLength: 0,
        supportsToolUse: false,
        toolUseUnknown: true,
        upstreamProtocol: 'responses',
      },
      {
        id: 'no-tools',
        name: 'Name no-tools',
        description: 'Name no-tools via OpenCode Zen',
        contextLength: 0,
        supportsToolUse: false,
        upstreamProtocol: 'messages',
      },
    ]);
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
    expect(await routes.resolve('opencode-zen', 'new-id')).toEqual({
      outcome: 'not-listed',
    });
    expect(getJson).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(5 * 60 * 1000);
    published = true;
    expect(await routes.resolve('opencode-zen', 'new-id')).toEqual({
      outcome: 'routed',
      protocol: 'responses',
    });
    expect(getJson).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(5 * 60 * 60 * 1000);
    expect(await routes.resolve('opencode-zen', 'known-id')).toEqual({
      outcome: 'routed',
      protocol: 'messages',
    });
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
    expect((await results)[0]).toEqual({
      outcome: 'routed',
      protocol: 'responses',
    });
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
    await expect(routes.list('opencode-zen')).rejects.toBeInstanceOf(
      ModelListError,
    );
    expect(logger.debug).toHaveBeenCalledWith(
      'OpenCode live model refresh failed',
      {
        providerId: 'opencode-zen',
        failureReason: 'unexpected',
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
    expect(protocolFromNpm('constructor')).toBeUndefined();
    expect(protocolFromNpm('toString')).toBeUndefined();
    expect(protocolFromNpm('__proto__')).toBeUndefined();
    expect(protocolFromGatewayApi({ constructor: {} })).toBeUndefined();
    expect(protocolFromGatewayApi({ toString: {} })).toBeUndefined();
    expect(
      protocolFromGatewayApi(
        JSON.parse('{"__proto__":{}}') as Record<string, unknown>,
      ),
    ).toBeUndefined();
    expect(protocolFromGatewayApi({ messages: {} })).toBe('messages');
    expect(protocolFromNpm('@ai-sdk/anthropic')).toBe('messages');
  });

  it('skips invalid entries and keeps the valid ones', async () => {
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
    expect(catalog.map((m) => m.id)).toEqual(['good-id']);
    expect(logger.debug).toHaveBeenCalledWith(
      'OpenCode live model refresh skipped catalog entries',
      { providerId: 'opencode-zen', kept: 1, skipped: 2 },
    );
  });

  it('routes every id from the live payload, with no static rung', async () => {
    const getJson = jest.fn(async () => ({
      data: [
        model('claude-fable-5-1', 'responses'),
        model('new-id', 'messages'),
      ],
    }));
    const routes = new OpenCodeLiveRoutes(getJson);
    // The id the deleted static route table pinned to `messages` now takes
    // the protocol the gateway reports.
    expect(await routes.resolve('opencode-zen', 'claude-fable-5-1')).toEqual({
      outcome: 'routed',
      protocol: 'responses',
    });
    expect(getJson).toHaveBeenCalledTimes(1);
    expect(await routes.resolve('opencode-zen', 'new-id')).toEqual({
      outcome: 'routed',
      protocol: 'messages',
    });
    expect(await routes.resolve('opencode-zen', 'another-id')).toEqual({
      outcome: 'not-listed',
    });
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
    expect(await routes.resolve('opencode-go', 'new-id')).toEqual({
      outcome: 'routed',
      protocol: 'responses',
    });
    expect(await routes.resolve('opencode-go', 'unknown')).toEqual({
      outcome: 'not-listed',
    });
    expect(getJson).toHaveBeenCalledTimes(2);
  });

  describe('force', () => {
    it('skips the failure backoff', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
      let fail = true;
      const getJson = jest.fn(async () => {
        if (fail) throw new Error('offline');
        return { data: [model('good-id', 'messages')] };
      });
      const routes = new OpenCodeLiveRoutes(getJson);
      await expect(routes.list('opencode-zen')).rejects.toBeInstanceOf(
        ModelListError,
      );
      fail = false;
      jest.advanceTimersByTime(60 * 1000);
      await expect(routes.list('opencode-zen')).rejects.toBeInstanceOf(
        ModelListError,
      );
      expect(getJson).toHaveBeenCalledTimes(1);
      expect(
        (await routes.list('opencode-zen', { force: true })).map((m) => m.id),
      ).toEqual(['good-id']);
      expect(getJson).toHaveBeenCalledTimes(2);
    });

    it('joins an in-flight refresh instead of starting another', async () => {
      let release: ((value: unknown) => void) | undefined;
      const getJson = jest.fn(
        () =>
          new Promise<unknown>((resolve) => {
            release = resolve;
          }),
      );
      const routes = new OpenCodeLiveRoutes(getJson);
      const first = routes.list('opencode-zen');
      const forced = routes.list('opencode-zen', { force: true });
      expect(getJson).toHaveBeenCalledTimes(1);
      release?.({ data: [model('good-id', 'messages')] });
      expect((await first).map((m) => m.id)).toEqual(['good-id']);
      expect((await forced).map((m) => m.id)).toEqual(['good-id']);
      expect(getJson).toHaveBeenCalledTimes(1);
    });
  });

  describe('persisted catalog', () => {
    it('writes every successful refresh through the store', async () => {
      const store = memoryStore();
      const routes = new OpenCodeLiveRoutes(async () => ({
        data: [model('a', 'messages'), model('b', 'responses')],
      }));
      routes.usePersistedCatalog(store);
      await routes.resolve('opencode-go', 'a');
      expect(store.write).toHaveBeenCalledTimes(1);
      expect(
        store.saved.get('opencode-go')?.map((m) => [m.id, m.upstreamProtocol]),
      ).toEqual([
        ['a', 'messages'],
        ['b', 'responses'],
      ]);
    });

    it('does not write on a failed refresh', async () => {
      const store = memoryStore();
      const routes = new OpenCodeLiveRoutes(async () => {
        throw new Error('offline');
      });
      routes.usePersistedCatalog(store);
      await routes.refresh('opencode-go');
      expect(store.write).not.toHaveBeenCalled();
    });

    it('cold cache, gateway down: routes on the persisted protocol', async () => {
      const store = memoryStore({
        'opencode-zen': [persistedRow('saved-id', 'chat/completions')],
      });
      const routes = new OpenCodeLiveRoutes(async () => {
        throw new Error('offline');
      });
      routes.usePersistedCatalog(store);
      expect(await routes.resolve('opencode-zen', 'saved-id')).toEqual({
        outcome: 'routed',
        protocol: 'chat/completions',
      });
      expect(await routes.resolve('opencode-zen', 'gone-id')).toEqual({
        outcome: 'not-listed',
      });
    });

    it('cold cache, gateway down, no persisted row: catalog-unavailable', async () => {
      const routes = new OpenCodeLiveRoutes(async () => {
        throw new Error('offline');
      });
      expect(await routes.resolve('opencode-zen', 'any-id')).toEqual({
        outcome: 'catalog-unavailable',
      });
      routes.usePersistedCatalog(memoryStore());
      expect(await routes.resolve('opencode-zen', 'any-id')).toEqual({
        outcome: 'catalog-unavailable',
      });
    });

    it('a persisted row without a protocol cannot route', async () => {
      const routes = new OpenCodeLiveRoutes(async () => {
        throw new Error('offline');
      });
      routes.usePersistedCatalog(
        memoryStore({ 'opencode-zen': [persistedRow('saved-id')] }),
      );
      expect(await routes.resolve('opencode-zen', 'saved-id')).toEqual({
        outcome: 'catalog-unavailable',
      });
    });

    it('store throws: treated as no persisted catalog and no write (A4)', async () => {
      const logger = { debug: jest.fn() };
      let fail = false;
      const routes = new OpenCodeLiveRoutes(
        async () => {
          if (fail) throw new Error('offline');
          return { data: [model('a', 'messages')] };
        },
        { logger },
      );
      routes.usePersistedCatalog({
        read: () => {
          throw new Error('service not resolvable');
        },
        write: () => {
          throw new Error('service not resolvable');
        },
      });
      // The write failure does not fail the refresh.
      expect((await routes.list('opencode-zen')).map((m) => m.id)).toEqual([
        'a',
      ]);
      expect(logger.debug).toHaveBeenCalledWith(
        'OpenCode persisted catalog write failed',
        { providerId: 'opencode-zen', message: 'service not resolvable' },
      );
      fail = true;
      expect(await routes.resolve('opencode-go', 'a')).toEqual({
        outcome: 'catalog-unavailable',
      });
      expect(await routes.modelIds('opencode-go')).toBeNull();
      expect(logger.debug).toHaveBeenCalledWith(
        'OpenCode persisted catalog read failed',
        { providerId: 'opencode-go', message: 'service not resolvable' },
      );
    });
  });

  describe('modelIds', () => {
    it('returns live ids in payload order', async () => {
      const routes = new OpenCodeLiveRoutes(async () => ({
        data: [
          model('c', 'messages'),
          model('a', 'messages'),
          model('b', 'responses'),
        ],
      }));
      expect(await routes.modelIds('opencode-go')).toEqual(['c', 'a', 'b']);
    });

    it('falls back to persisted ids when the gateway is down', async () => {
      const routes = new OpenCodeLiveRoutes(async () => {
        throw new Error('offline');
      });
      routes.usePersistedCatalog(
        memoryStore({
          'opencode-go': [persistedRow('p2', 'messages'), persistedRow('p1')],
        }),
      );
      expect(await routes.modelIds('opencode-go')).toEqual(['p2', 'p1']);
    });

    it('returns null with neither a live nor a persisted catalog', async () => {
      const routes = new OpenCodeLiveRoutes(async () => {
        throw new Error('offline');
      });
      routes.usePersistedCatalog(memoryStore());
      expect(await routes.modelIds('opencode-go')).toBeNull();
    });

    it('awaits one refresh on a cold cache and respects the backoff', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const getJson = jest.fn(async () => {
        throw new Error('offline');
      });
      const routes = new OpenCodeLiveRoutes(getJson);
      await routes.modelIds('opencode-zen');
      await routes.modelIds('opencode-zen');
      expect(getJson).toHaveBeenCalledTimes(1);
    });
  });
});

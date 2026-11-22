/**
 * ProviderModelsService: which saved or cached list may answer for the
 * account that is asking (PR #1478 CodeRabbit round 1).
 *
 * - The synchronous catalog reads follow the credential of the latest list
 *   request and return nothing after a credential failure.
 * - `clearCache(providerId)` (a key or connection change) drops the saved
 *   record too.
 * - A fetcher's sign-in reader runs before a cached list is served.
 * - A saved catalog that is not used publishes no context windows.
 * - Saved capabilities are validated; Anthropic cursors must advance.
 * - The pricing prefetch keeps its windows on a payload with no valid row.
 */
import 'reflect-metadata';
import axios, { AxiosError, type AxiosResponse } from 'axios';
import { createMockConfigManager } from '@ptah-extension/vscode-core/testing';
import { createMockLogger } from '@ptah-extension/shared/testing';
import type { ConfigManager, Logger } from '@ptah-extension/vscode-core';
import type { WorkspaceScopeResolver } from '@ptah-extension/settings-core';
import {
  getDiscoveredContextWindow,
  type ProviderModelInfo,
} from '@ptah-extension/shared';
import { ActiveProviderResolver } from './auth/active-provider-resolver';
import {
  ProviderModelsService,
  credentialFingerprint,
} from './provider-models.service';
import { ModelListError } from './model-list-error';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 22, 12, 0, 0);

const model = (
  id: string,
  extra: Partial<ProviderModelInfo> = {},
): ProviderModelInfo => ({
  id,
  name: id,
  description: '',
  contextLength: 0,
  supportsToolUse: true,
  ...extra,
});

function record(
  models: readonly unknown[],
  apiKey: string | null,
): Record<string, unknown> {
  return {
    schema: 2,
    origin: 'live',
    models,
    timestamp: NOW - DAY_MS,
    ...(apiKey ? { credential: credentialFingerprint(apiKey) } : {}),
  };
}

function makeService(values: Record<string, unknown> = {}) {
  const logger = createMockLogger();
  const config = createMockConfigManager({ values });
  const service = new ProviderModelsService(
    logger as unknown as Logger,
    config as unknown as ConfigManager,
    {},
    new ActiveProviderResolver({
      read: () => undefined,
      isStored: () => false,
    } as unknown as WorkspaceScopeResolver),
  );
  return { service, config, logger };
}

const ENDPOINT = 'z-ai';
const ENDPOINT_KEY = `provider.${ENDPOINT}.modelCatalog`;
const FETCHER = 'lm-studio';
const FETCHER_KEY = `provider.${FETCHER}.modelCatalog`;

describe('ProviderModelsService credential scope', () => {
  let get: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    get = jest.spyOn(axios, 'get');
  });
  afterEach(() => jest.restoreAllMocks());

  describe('synchronous catalog reads', () => {
    it('serve the saved list before any request this boot', () => {
      const { service } = makeService({
        [ENDPOINT_KEY]: record([model('saved-a')], 'key-a'),
      });
      expect(service.getCachedModelIds(ENDPOINT)).toEqual(['saved-a']);
    });

    it('ignore a list saved under another key once a request used a new key', async () => {
      get.mockRejectedValue(
        Object.assign(new Error('raw'), { code: 'ECONNREFUSED' }),
      );
      const { service } = makeService({
        [ENDPOINT_KEY]: record([model('saved-a')], 'key-a'),
      });
      await service.fetchModels(ENDPOINT, 'key-b');
      expect(service.getCachedModelIds(ENDPOINT)).toBeNull();
      expect(service.getLiveDerivedTiers(ENDPOINT)).toEqual({});
    });

    it('return nothing after a credential failure, even for the same key', async () => {
      get.mockResolvedValueOnce({ data: { data: [{ id: 'live-a' }] } });
      const { service } = makeService();
      await service.fetchModels(ENDPOINT, 'key-a');
      expect(service.getCachedModelIds(ENDPOINT)).toEqual(['live-a']);

      get.mockRejectedValueOnce(
        new AxiosError(
          'Request failed',
          'ERR_BAD_REQUEST',
          undefined,
          undefined,
          {
            status: 401,
            statusText: 'x',
            headers: {},
            config: {},
            data: '',
          } as unknown as AxiosResponse,
        ),
      );
      jest.spyOn(Date, 'now').mockReturnValue(NOW + 6 * 60 * 1000);
      const rejected = await service.fetchModels(ENDPOINT, 'key-a');
      expect(rejected).toMatchObject({
        source: 'unavailable',
        failureReason: 'auth-rejected',
      });
      expect(service.getCachedModelIds(ENDPOINT)).toBeNull();
    });
  });

  it('clearCache(providerId) drops the saved record as well as the memory entry', async () => {
    const { service, config } = makeService({
      [ENDPOINT_KEY]: record([model('saved-a')], 'key-a'),
    });
    service.clearCache(ENDPOINT);
    await Promise.resolve();
    await Promise.resolve();
    expect(config.set).toHaveBeenCalledWith(ENDPOINT_KEY, undefined);
  });

  describe('fetcher sign-in reader', () => {
    it('signed out: no cached list, no fetch, not-signed-in', async () => {
      const { service } = makeService();
      let signedIn: boolean | undefined = true;
      const fetcher = jest.fn(async () => [model('live-a')]);
      service.registerDynamicFetcher(FETCHER, fetcher, {
        signedIn: async () => signedIn,
      });
      expect((await service.fetchModels(FETCHER, null)).source).toBe('live');

      signedIn = false;
      expect(await service.fetchModels(FETCHER, null)).toMatchObject({
        models: [],
        source: 'unavailable',
        failureReason: 'not-signed-in',
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(service.getCachedModelIds(FETCHER)).toBeNull();
    });

    it('a stale signed-out answer does not drop a list a newer request cached', async () => {
      const { service } = makeService();
      let releaseStale!: (value: boolean) => void;
      const answers: Array<Promise<boolean>> = [
        new Promise<boolean>((resolve) => (releaseStale = resolve)),
        Promise.resolve(true),
      ];
      service.registerDynamicFetcher(FETCHER, async () => [model('live-a')], {
        signedIn: () => answers.shift() ?? Promise.resolve(true),
      });

      // Same clock value for both requests: only a write sequence can tell
      // the newer cache entry apart.
      const stale = service.fetchModels(FETCHER, null);
      expect((await service.fetchModels(FETCHER, null)).source).toBe('live');
      expect(service.getCachedModelIds(FETCHER)).toEqual(['live-a']);

      releaseStale(false);
      expect((await stale).failureReason).toBe('not-signed-in');
      expect(service.getCachedModelIds(FETCHER)).toEqual(['live-a']);
    });

    it('an unreadable or unknown state lets the chain continue', async () => {
      const { service } = makeService();
      service.registerDynamicFetcher(FETCHER, async () => [model('live-a')], {
        signedIn: async () => {
          throw new Error('status child failed');
        },
      });
      expect((await service.fetchModels(FETCHER, null)).source).toBe('live');
    });
  });

  it('a saved catalog rejected for another key publishes no context windows', async () => {
    get.mockRejectedValue(
      Object.assign(new Error('raw'), { code: 'ETIMEDOUT' }),
    );
    const { service } = makeService({
      [ENDPOINT_KEY]: record(
        [
          model('cw-other-key', {
            contextLength: 123_456,
            contextLengthSource: 'provider',
          }),
        ],
        'key-a',
      ),
    });
    const result = await service.fetchModels(ENDPOINT, 'key-b');
    expect(result.source).toBe('unavailable');
    expect(getDiscoveredContextWindow('cw-other-key', ENDPOINT)).toBe(0);
  });

  it('drops saved capabilities that are not an array of known names', async () => {
    const { service } = makeService({
      [FETCHER_KEY]: record(
        [
          { ...model('bad'), capabilities: 'effort' },
          { ...model('unknown-name'), capabilities: ['effort', 'warp'] },
          { ...model('good'), capabilities: ['effort', 'thinking'] },
        ],
        null,
      ),
    });
    service.registerDynamicFetcher(FETCHER, async () => {
      throw new ModelListError('network');
    });
    const result = await service.fetchModels(FETCHER, null);
    expect(result.source).toBe('persisted');
    const byId = new Map(result.models.map((m) => [m.id, m]));
    expect(byId.get('bad')?.capabilities).toBeUndefined();
    expect(byId.get('unknown-name')?.capabilities).toBeUndefined();
    expect(byId.get('good')?.capabilities).toEqual(['effort', 'thinking']);
  });

  it.each([
    ['an empty cursor', ''],
    ['a repeated cursor', 'a'],
  ])('Anthropic pagination rejects %s', async (_label, nextCursor) => {
    get
      .mockResolvedValueOnce({
        data: { data: [{ id: 'a' }], has_more: true, last_id: 'a' },
      })
      .mockResolvedValue({
        data: { data: [{ id: 'b' }], has_more: true, last_id: nextCursor },
      });
    const { service } = makeService();
    const result = await service.fetchModels('anthropic-api', 'key');
    expect(result).toMatchObject({
      source: 'unavailable',
      failureReason: 'bad-response',
    });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('pricing prefetch retries a payload with no valid row and keeps the windows', async () => {
    jest.useFakeTimers();
    try {
      get
        .mockResolvedValueOnce({ data: { data: [null] } })
        .mockResolvedValueOnce({
          data: {
            data: [
              {
                id: 'vendor/prefetch-model',
                context_length: 64_000,
                pricing: { prompt: '0.000001', completion: '0.000002' },
              },
            ],
          },
        });
      const { service } = makeService();
      const pending = service.prefetchPricing();
      await jest.advanceTimersByTimeAsync(3000);
      await jest.advanceTimersByTimeAsync(5000);
      await pending;
      expect(get).toHaveBeenCalledTimes(2);
      expect(
        getDiscoveredContextWindow('vendor/prefetch-model', 'openrouter'),
      ).toBe(64_000);
    } finally {
      jest.useRealTimers();
    }
  });
});

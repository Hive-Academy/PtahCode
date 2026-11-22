/**
 * ProviderModelsService model-list chain — one case per failure-table row of
 * TASK_2026_2306 (implementation-plan.md "Failure and rollback").
 *
 * Chain: memory cache -> the provider's one live route -> (unless the reason
 * is a credential reason) the versioned persisted live catalog ->
 * `unavailable` with a closed failure reason. No repo-literal list anywhere.
 */
import 'reflect-metadata';
import axios, { AxiosError, type AxiosResponse } from 'axios';
import { createMockConfigManager } from '@ptah-extension/vscode-core/testing';
import { createMockLogger } from '@ptah-extension/shared/testing';
import type { ConfigManager, Logger } from '@ptah-extension/vscode-core';
import type { WorkspaceScopeResolver } from '@ptah-extension/settings-core';
import type { ProviderModelInfo } from '@ptah-extension/shared';
import { SdkError } from '@ptah-extension/agent-sdk';
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

/**
 * A versioned record as `persistCatalog` writes it. `apiKey` is the key the
 * list was fetched with (`'key'`, the endpoint rows' key, by default); `null`
 * writes no credential, as for a fetcher provider.
 */
function record(
  models: readonly unknown[],
  timestamp: number = NOW - DAY_MS,
  apiKey: string | null = 'key',
): Record<string, unknown> {
  return {
    schema: 2,
    origin: 'live',
    models,
    timestamp,
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

function httpError(status: number): AxiosError {
  return new AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      status,
      statusText: 'x',
      headers: {},
      config: {},
      data: 'vendor body',
    } as unknown as AxiosResponse,
  );
}

const withCode = (code: string): Error =>
  Object.assign(new Error(`raw ${code}`), { code });

/** Endpoint provider (Bearer) used for the endpoint-route rows. */
const ENDPOINT = 'z-ai';
const ENDPOINT_KEY = `provider.${ENDPOINT}.modelCatalog`;
/** Fetcher provider used for the fetcher-route rows. */
const FETCHER = 'lm-studio';
const FETCHER_KEY = `provider.${FETCHER}.modelCatalog`;

describe('ProviderModelsService model-list chain', () => {
  let get: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    get = jest.spyOn(axios, 'get');
  });
  afterEach(() => jest.restoreAllMocks());

  it('live success: live list, memory cache and full versioned record', async () => {
    get.mockResolvedValue({
      data: {
        data: [
          { id: 'tools', supported_parameters: ['tools'] },
          { id: 'no-tools', supported_parameters: [] },
          { id: 'unknown' },
        ],
      },
    });
    const { service, config } = makeService();
    const result = await service.fetchModels(ENDPOINT, 'key', true);
    expect(result).toMatchObject({ source: 'live', totalCount: 3 });
    expect(result.failureReason).toBeUndefined();
    // toolUseOnly keeps unknown tool support, drops only a known "no".
    expect(result.models.map((m) => m.id)).toEqual(['tools', 'unknown']);
    // The persisted record and the memory cache hold the unfiltered list.
    await Promise.resolve();
    expect(config.set).toHaveBeenCalledWith(ENDPOINT_KEY, {
      schema: 2,
      origin: 'live',
      models: expect.arrayContaining([
        expect.objectContaining({ id: 'no-tools' }),
      ]),
      timestamp: NOW,
      // A fingerprint of the key, never the key itself.
      credential: credentialFingerprint('key'),
    });
    expect(JSON.stringify(config.set.mock.calls)).not.toContain('"key"');
    expect(
      (config.set.mock.calls[0][1] as { models: unknown[] }).models,
    ).toHaveLength(3);
    const again = await service.fetchModels(ENDPOINT, 'key');
    expect(again.models.map((m) => m.id)).toEqual([
      'tools',
      'no-tools',
      'unknown',
    ]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['network', withCode('ENOTFOUND')],
    ['timeout', new AxiosError('timeout of 10000ms exceeded', 'ECONNABORTED')],
    ['http-error', httpError(503)],
  ] as const)(
    'offline with a recent v2 record: persisted list with reason %s',
    async (reason, error) => {
      get.mockRejectedValue(error);
      const savedAt = NOW - 3 * DAY_MS;
      const { service } = makeService({
        [ENDPOINT_KEY]: record([model('saved')], savedAt),
      });
      expect(await service.fetchModels(ENDPOINT, 'key')).toEqual({
        models: [model('saved')],
        totalCount: 1,
        source: 'persisted',
        savedAt,
        failureReason: reason,
        isStatic: false,
      });
    },
  );

  it('a record exactly 30 days old is kept', async () => {
    get.mockRejectedValue(withCode('ECONNREFUSED'));
    const { service } = makeService({
      [ENDPOINT_KEY]: record([model('saved')], NOW - 30 * DAY_MS),
    });
    expect((await service.fetchModels(ENDPOINT, 'key')).source).toBe(
      'persisted',
    );
  });

  it('a record 30 days and 1 ms old is ignored: unavailable', async () => {
    get.mockRejectedValue(withCode('ECONNREFUSED'));
    const { service } = makeService({
      [ENDPOINT_KEY]: record([model('saved')], NOW - 30 * DAY_MS - 1),
    });
    expect(await service.fetchModels(ENDPOINT, 'key')).toMatchObject({
      models: [],
      source: 'unavailable',
      failureReason: 'network',
    });
    expect(service.getCachedModelIds(ENDPOINT)).toBeNull();
  });

  // One endpoint provider per case: the "ignored" debug line is logged once
  // per provider per process.
  it.each([
    [
      'no schema (static rows of an older release)',
      'z-ai',
      { models: [model('old')], timestamp: NOW },
    ],
    [
      'schema 1',
      'requesty',
      { schema: 1, origin: 'live', models: [model('old')], timestamp: NOW },
    ],
    [
      'origin other than live',
      'sakana',
      { schema: 2, origin: 'static', models: [model('old')], timestamp: NOW },
    ],
  ])(
    'a pre-version record (%s) is ignored: unavailable, not used for tiers',
    async (_label, providerId, stored) => {
      get.mockRejectedValue(withCode('ENOTFOUND'));
      const { service, config, logger } = makeService({
        [`provider.${providerId}.modelCatalog`]: stored,
      });
      expect(await service.fetchModels(providerId, 'key')).toMatchObject({
        source: 'unavailable',
        failureReason: 'network',
      });
      expect(service.getCachedModelIds(providerId)).toBeNull();
      // Logged once per provider, and never rewritten on read.
      const ignored = logger.debug.mock.calls.filter(
        ([message]) =>
          message ===
          '[ProviderModelsService] Ignoring a catalog saved before live-only lists',
      );
      expect(ignored).toHaveLength(1);
      expect(config.set).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'models is not an array',
      { schema: 2, origin: 'live', models: 'x', timestamp: NOW },
    ],
    [
      'every row invalid',
      record([{ nope: true }, 'garbage', { id: 1, name: 'x' }]),
    ],
    ['not an object', 'garbage'],
  ])('a malformed record (%s) is ignored: unavailable', async (_l, stored) => {
    get.mockRejectedValue(withCode('ENOTFOUND'));
    const { service } = makeService({ [ENDPOINT_KEY]: stored });
    expect((await service.fetchModels(ENDPOINT, 'key')).source).toBe(
      'unavailable',
    );
  });

  it('re-validates persisted rows: protocol literal and toolUseUnknown === true only', () => {
    const { service } = makeService({
      [ENDPOINT_KEY]: record([
        { ...model('a'), upstreamProtocol: 'responses', toolUseUnknown: true },
        {
          ...model('b'),
          upstreamProtocol: 'generate-content',
          toolUseUnknown: 'yes',
        },
      ]),
    });
    const [a, b] = service.getPersistedCatalog(ENDPOINT)?.models ?? [];
    expect(a).toMatchObject({
      upstreamProtocol: 'responses',
      toolUseUnknown: true,
    });
    expect(b).not.toHaveProperty('upstreamProtocol');
    expect(b).not.toHaveProperty('toolUseUnknown');
  });

  it('first run, offline, no record: unavailable with the reason', async () => {
    get.mockRejectedValue(withCode('EAI_AGAIN'));
    const { service } = makeService();
    expect(await service.fetchModels(ENDPOINT, 'key')).toEqual({
      models: [],
      totalCount: 0,
      source: 'unavailable',
      failureReason: 'network',
      isStatic: false,
    });
  });

  it('key missing: no-key, no request, persisted list not used', async () => {
    const { service } = makeService({
      [ENDPOINT_KEY]: record([model('saved')]),
    });
    expect(await service.fetchModels(ENDPOINT, null)).toMatchObject({
      models: [],
      source: 'unavailable',
      failureReason: 'no-key',
    });
    expect(get).not.toHaveBeenCalled();
  });

  it.each([401, 403])(
    'key rejected (%d): auth-rejected, persisted list not used',
    async (status) => {
      get.mockRejectedValue(httpError(status));
      const { service } = makeService({
        [ENDPOINT_KEY]: record([model('saved')]),
      });
      expect(await service.fetchModels(ENDPOINT, 'bad-key')).toMatchObject({
        models: [],
        source: 'unavailable',
        failureReason: 'auth-rejected',
      });
    },
  );

  it('signed out: not-signed-in, persisted list not used', async () => {
    const { service } = makeService({
      [FETCHER_KEY]: record([model('saved')], NOW - DAY_MS, null),
    });
    service.registerDynamicFetcher(FETCHER, async () => {
      throw new ModelListError('not-signed-in');
    });
    expect(await service.fetchModels(FETCHER, null)).toMatchObject({
      models: [],
      source: 'unavailable',
      failureReason: 'not-signed-in',
    });
  });

  it.each([
    ['an envelope without data', { error: 'nope' }],
    ['a non-object body', '<html>'],
    ['rows that are all invalid', { data: [{ id: 7 }, null, 'x'] }],
  ])('malformed payload (%s): bad-response', async (_label, body) => {
    get.mockResolvedValue({ data: body });
    const { service } = makeService();
    expect(await service.fetchModels(ENDPOINT, 'key')).toMatchObject({
      source: 'unavailable',
      failureReason: 'bad-response',
    });
  });

  it('oversize body: bad-response, persisted list used', async () => {
    get.mockRejectedValue(
      new AxiosError('maxContentLength size exceeded', 'ERR_BAD_RESPONSE'),
    );
    const { service } = makeService({
      [ENDPOINT_KEY]: record([model('saved')]),
    });
    expect(await service.fetchModels(ENDPOINT, 'key')).toMatchObject({
      source: 'persisted',
      failureReason: 'bad-response',
    });
  });

  it('OpenCode: only non-chat or unroutable rows is bad-response', async () => {
    get.mockResolvedValue({
      data: {
        data: [
          { id: 'embed', type: 'embedding', api: { messages: {} } },
          { id: 'google', type: 'chat', api: { 'generate-content': {} } },
        ],
      },
    });
    const { service } = makeService();
    expect(await service.fetchModels('opencode-zen', null)).toMatchObject({
      models: [],
      source: 'unavailable',
      failureReason: 'bad-response',
    });
  });

  it('fetcher returns []: empty, then the persisted list when one exists', async () => {
    const none = makeService();
    none.service.registerDynamicFetcher(FETCHER, async () => []);
    expect(await none.service.fetchModels(FETCHER, null)).toMatchObject({
      source: 'unavailable',
      failureReason: 'empty',
    });

    const saved = makeService({
      [FETCHER_KEY]: record([model('saved')], NOW - DAY_MS, null),
    });
    saved.service.registerDynamicFetcher(FETCHER, async () => []);
    expect(await saved.service.fetchModels(FETCHER, null)).toMatchObject({
      source: 'persisted',
      failureReason: 'empty',
      models: [model('saved')],
    });
  });

  it('fetcher throws an unclassified error: unexpected, raw text only at debug', async () => {
    const { service, logger } = makeService();
    service.registerDynamicFetcher(FETCHER, async () => {
      throw new Error('secret-ish vendor text');
    });
    const result = await service.fetchModels(FETCHER, null);
    expect(result).toMatchObject({
      source: 'unavailable',
      failureReason: 'unexpected',
    });
    expect(JSON.stringify(result)).not.toContain('secret-ish');
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('secret-ish');
    expect(logger.debug).toHaveBeenCalledWith(
      '[ProviderModelsService] Live model list failed',
      {
        providerId: FETCHER,
        failureReason: 'unexpected',
        error: 'secret-ish vendor text',
      },
    );
  });

  it('a provider with no live route: no-live-source', async () => {
    const { service } = makeService();
    expect(await service.fetchModels('claude-cli', null)).toMatchObject({
      models: [],
      source: 'unavailable',
      failureReason: 'no-live-source',
    });
  });

  it('an unknown provider still throws', async () => {
    const { service } = makeService();
    await expect(
      service.fetchModels('no-such-provider', 'key'),
    ).rejects.toBeInstanceOf(SdkError);
  });

  it('a deleted key never reads the list cached under it: no-key', async () => {
    get.mockResolvedValue({ data: { data: [{ id: 'live-a' }] } });
    const { service } = makeService();
    expect((await service.fetchModels(ENDPOINT, 'key')).source).toBe('live');
    expect(await service.fetchModels(ENDPOINT, null)).toMatchObject({
      models: [],
      source: 'unavailable',
      failureReason: 'no-key',
    });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('two keys on one provider never share a cached list', async () => {
    get
      .mockResolvedValueOnce({ data: { data: [{ id: 'account-a' }] } })
      .mockResolvedValueOnce({ data: { data: [{ id: 'account-b' }] } });
    const { service } = makeService();
    const a = await service.fetchModels(ENDPOINT, 'key-a');
    const b = await service.fetchModels(ENDPOINT, 'key-b');
    expect(a.models.map((m) => m.id)).toEqual(['account-a']);
    expect(b.models.map((m) => m.id)).toEqual(['account-b']);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('a list saved under another key is not shown: unavailable', async () => {
    get.mockRejectedValue(withCode('ENOTFOUND'));
    const { service } = makeService({
      [ENDPOINT_KEY]: record([model('saved')], NOW - DAY_MS, 'key-a'),
    });
    expect(await service.fetchModels(ENDPOINT, 'key-b')).toMatchObject({
      models: [],
      source: 'unavailable',
      failureReason: 'network',
    });
    expect((await service.fetchModels(ENDPOINT, 'key-a')).source).toBe(
      'persisted',
    );
  });

  it('Retry re-runs the chain: persisted answers are not memory-cached', async () => {
    get
      .mockRejectedValueOnce(withCode('ECONNRESET'))
      .mockResolvedValueOnce({ data: { data: [{ id: 'fresh' }] } });
    const { service } = makeService({
      [ENDPOINT_KEY]: record([model('saved')]),
    });
    expect((await service.fetchModels(ENDPOINT, 'key')).source).toBe(
      'persisted',
    );
    const retried = await service.fetchModels(ENDPOINT, 'key');
    expect(retried.source).toBe('live');
    expect(retried.models.map((m) => m.id)).toEqual(['fresh']);
    expect(get).toHaveBeenCalledTimes(2);
  });

  describe('Anthropic-scheme pagination', () => {
    it('follows has_more with after_id', async () => {
      get
        .mockResolvedValueOnce({
          data: { data: [{ id: 'a' }], has_more: true, last_id: 'a' },
        })
        .mockResolvedValueOnce({
          data: { data: [{ id: 'b' }], has_more: false },
        });
      const { service } = makeService();
      const result = await service.fetchModels('anthropic-api', 'key');
      expect(result.models.map((m) => m.id)).toEqual(['a', 'b']);
      expect(get.mock.calls[1][0]).toBe(
        'https://api.anthropic.com/v1/models?limit=1000&after_id=a',
      );
    });

    it('has_more without last_id is bad-response, never a partial list', async () => {
      get.mockResolvedValue({ data: { data: [{ id: 'a' }], has_more: true } });
      const { service } = makeService();
      expect(await service.fetchModels('anthropic-api', 'key')).toMatchObject({
        models: [],
        source: 'unavailable',
        failureReason: 'bad-response',
      });
    });
  });
});

import 'reflect-metadata';
import { createMockConfigManager } from '@ptah-extension/vscode-core/testing';
import { createMockLogger } from '@ptah-extension/shared/testing';
import type { ConfigManager, Logger } from '@ptah-extension/vscode-core';
import type { WorkspaceScopeResolver } from '@ptah-extension/settings-core';
import { ActiveProviderResolver } from './auth/active-provider-resolver';
import { ProviderModelsService } from './provider-models.service';
import { ModelListError } from './model-list-error';
import {
  openCodeLiveRoutes,
  type OpenCodeLiveModel,
} from './providers/opencode/opencode-live-routes';

function makeService(values: Record<string, unknown> = {}) {
  const config = createMockConfigManager({ values });
  const service = new ProviderModelsService(
    createMockLogger() as unknown as Logger,
    config as unknown as ConfigManager,
    {},
    new ActiveProviderResolver({
      read: () => undefined,
      isStored: () => false,
    } as unknown as WorkspaceScopeResolver),
  );
  return { service, config };
}

const row = (
  id: string,
  extra: Partial<OpenCodeLiveModel> = {},
): OpenCodeLiveModel => ({
  id,
  name: id,
  description: `${id} via OpenCode`,
  contextLength: 0,
  supportsToolUse: true,
  upstreamProtocol: 'messages',
  ...extra,
});

describe('ProviderModelsService OpenCode catalog', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(['opencode-zen', 'opencode-go'] as const)(
    '%s lists exactly the live gateway rows, forcing past the failure backoff',
    async (id) => {
      const live = [
        row('live-a', { upstreamProtocol: 'responses' }),
        row('live-b', { supportsToolUse: false, toolUseUnknown: true }),
        row('live-c', { supportsToolUse: false }),
      ];
      jest.spyOn(openCodeLiveRoutes, 'list').mockResolvedValue(live);
      const { service, config } = makeService();
      const dynamic = jest.fn(async () => [row('fetcher-row')]);
      service.registerDynamicFetcher(id, dynamic);

      const result = await service.fetchModels(id, 'configured-key');
      expect(result).toMatchObject({
        source: 'live',
        totalCount: 3,
        isStatic: false,
      });
      expect(result.failureReason).toBeUndefined();
      expect(result.models).toEqual(live);
      expect(openCodeLiveRoutes.list).toHaveBeenCalledWith(id, {
        force: true,
      });
      expect(dynamic).not.toHaveBeenCalled();
      // The routes write their refreshes through the attached store.
      expect(config.set).not.toHaveBeenCalled();

      // toolUseOnly keeps unknown tool support, drops only a known "no".
      const tools = await service.fetchModels(id, null, true);
      expect(tools.models.map((m) => m.id)).toEqual(['live-a', 'live-b']);
      expect(tools.totalCount).toBe(3);
    },
  );

  it('gateway down with a saved live catalog: persisted list with the reason', async () => {
    const savedAt = Date.now() - 60_000;
    jest
      .spyOn(openCodeLiveRoutes, 'list')
      .mockRejectedValue(new ModelListError('network'));
    const { service } = makeService({
      'provider.opencode-go.modelCatalog': {
        schema: 2,
        origin: 'live',
        models: [row('saved', { upstreamProtocol: 'chat/completions' })],
        timestamp: savedAt,
      },
    });
    const result = await service.fetchModels('opencode-go', null);
    expect(result).toMatchObject({
      source: 'persisted',
      failureReason: 'network',
      savedAt,
      totalCount: 1,
    });
    expect(result.models[0]).toMatchObject({
      id: 'saved',
      upstreamProtocol: 'chat/completions',
    });
  });

  it('gateway down with no saved catalog: unavailable', async () => {
    jest
      .spyOn(openCodeLiveRoutes, 'list')
      .mockRejectedValue(new ModelListError('bad-response'));
    const { service } = makeService();
    expect(await service.fetchModels('opencode-zen', null)).toEqual({
      models: [],
      totalCount: 0,
      source: 'unavailable',
      failureReason: 'bad-response',
      isStatic: false,
    });
  });

  it('exposes the versioned persisted catalog to the routes store', () => {
    const { service, config } = makeService();
    service.savePersistedCatalog('opencode-zen', [row('stored')]);
    expect(config.set).toHaveBeenCalledWith(
      'provider.opencode-zen.modelCatalog',
      expect.objectContaining({
        schema: 2,
        origin: 'live',
        models: [row('stored')],
        timestamp: expect.any(Number),
      }),
    );
    const record = config.set.mock.calls[0][1];
    const reloaded = makeService({
      'provider.opencode-zen.modelCatalog': record,
    });
    expect(reloaded.service.getPersistedCatalog('opencode-zen')).toEqual({
      models: [row('stored')],
      savedAt: (record as { timestamp: number }).timestamp,
    });
  });
});

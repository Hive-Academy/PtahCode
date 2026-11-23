/**
 * providerSessionModelOptions — composer entries for a provider-session
 * provider, read from the typed model list (`live` / `persisted` /
 * `unavailable`).
 *
 * Source-under-test:
 *   `libs/backend/rpc-handlers/src/lib/handlers/config-provider-session-models.ts`
 */
import 'reflect-metadata';
import { ModelListError } from '@ptah-extension/auth-providers';
import type { ProviderModelInfo } from '@ptah-extension/shared';

import {
  providerSessionModelOptions,
  type ProviderCatalogReader,
} from './config-provider-session-models';

const PROVIDER_ID = 'antigravity-cli';

const catalog: ProviderModelInfo[] = [
  {
    id: 'model-a',
    name: 'Model A',
    description: '',
    contextLength: 0,
    supportsToolUse: true,
  },
  {
    id: 'model-b',
    name: '',
    description: '',
    contextLength: 0,
    supportsToolUse: true,
  },
];

function reader(
  result: Awaited<ReturnType<ProviderCatalogReader>>,
): jest.Mock<ReturnType<ProviderCatalogReader>, [string]> {
  return jest.fn(async (_providerId: string) => result);
}

function picked(models: Array<{ id: string; isSelected: boolean }>): string[] {
  return models.filter((model) => model.isSelected).map((model) => model.id);
}

describe('providerSessionModelOptions', () => {
  it('lists default then the live catalog and selects the saved model', async () => {
    const onFailure = jest.fn();
    const models = await providerSessionModelOptions(
      PROVIDER_ID,
      'model-b',
      reader({ models: catalog, source: 'live' }),
      onFailure,
    );

    expect(models.map((model) => [model.id, model.name])).toEqual([
      ['default', 'Default (chosen by Antigravity)'],
      ['model-a', 'Model A'],
      ['model-b', 'model-b'],
    ]);
    expect(picked(models)).toEqual(['model-b']);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('lists a persisted catalog like a live one, without reporting a failure', async () => {
    const onFailure = jest.fn();
    const models = await providerSessionModelOptions(
      PROVIDER_ID,
      'model-a',
      reader({
        models: catalog,
        source: 'persisted',
        failureReason: 'timeout',
      }),
      onFailure,
    );

    expect(models.map((model) => model.id)).toEqual([
      'default',
      'model-a',
      'model-b',
    ]);
    expect(picked(models)).toEqual(['model-a']);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('does not invent a saved id the live catalog no longer lists', async () => {
    const models = await providerSessionModelOptions(
      PROVIDER_ID,
      'retired-model',
      reader({ models: catalog, source: 'live' }),
      jest.fn(),
    );

    expect(models.map((model) => model.id)).not.toContain('retired-model');
    expect(picked(models)).toEqual(['default']);
  });

  it('treats an unavailable list as a catalog failure: default plus the saved model', async () => {
    const onFailure = jest.fn();
    const models = await providerSessionModelOptions(
      PROVIDER_ID,
      'model-b',
      reader({ models: [], source: 'unavailable', failureReason: 'network' }),
      onFailure,
    );

    expect(models.map((model) => [model.id, model.isSelected])).toEqual([
      ['default', false],
      ['model-b', true],
    ]);
    expect(onFailure).toHaveBeenCalledTimes(1);
    const [error] = onFailure.mock.calls[0] as [ModelListError];
    expect(error).toBeInstanceOf(ModelListError);
    expect(error.reason).toBe('network');
  });

  it('reports an unavailable list without a reason as unexpected', async () => {
    const onFailure = jest.fn();
    await providerSessionModelOptions(
      PROVIDER_ID,
      '',
      reader({ models: [], source: 'unavailable' }),
      onFailure,
    );

    expect(onFailure).toHaveBeenCalledWith(new ModelListError('unexpected'));
  });

  it('selects default when the list is unavailable and nothing is saved', async () => {
    const models = await providerSessionModelOptions(
      PROVIDER_ID,
      '  ',
      reader({ models: [], source: 'unavailable', failureReason: 'empty' }),
      jest.fn(),
    );

    expect(models.map((model) => model.id)).toEqual(['default']);
    expect(picked(models)).toEqual(['default']);
  });

  it('passes a thrown read error to onCatalogFailure and keeps the saved model', async () => {
    const onFailure = jest.fn();
    const thrown = new Error('read failed');
    const models = await providerSessionModelOptions(
      PROVIDER_ID,
      'model-a',
      jest.fn(async () => {
        throw thrown;
      }),
      onFailure,
    );

    expect(onFailure).toHaveBeenCalledWith(thrown);
    expect(models.map((model) => model.id)).toEqual(['default', 'model-a']);
    expect(picked(models)).toEqual(['model-a']);
  });
});

/**
 * The memory curator and the provider-session refusal: a provider-session
 * provider stalls the pass as `provider-unsupported` before any query, so
 * the internal query runner (and `SdkQueryRunner` behind it) is never
 * reached. The registry lookup is mocked: no entry carries
 * `providerSession` until an admitting phase adds one.
 */
jest.mock('@ptah-extension/shared', () => {
  const actual = jest.requireActual('@ptah-extension/shared');
  return {
    ...actual,
    getProviderSessionProfile: (id: string) =>
      id === 'antigravity-cli' ? 'antigravity' : undefined,
    isProviderSessionProviderId: (id: string) => id === 'antigravity-cli',
  };
});

import 'reflect-metadata';
import type { Logger } from '@ptah-extension/vscode-core';
import type { IWorkspaceProvider } from '@ptah-extension/platform-core';
import { SdkInternalQueryCuratorLlm } from './sdk-internal-query.curator-llm';
import { providerSessionNativeRuntimeRequiredMessage } from '@ptah-extension/shared';
import { AuthRequiredError } from '../errors';
import type { IProviderAuthResolver } from '../auth/provider-auth-resolver.port';
import type { InternalQueryService } from '../internal-query';

const PROVIDER = 'antigravity-cli';
const TRANSCRIPT = 'some real transcript content for extraction';

function logger(): Logger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as Logger;
}

function workspace(config: Record<string, unknown>): IWorkspaceProvider {
  return {
    getWorkspaceRoot: jest.fn(() => undefined),
    getConfiguration: jest.fn(
      <T>(_section: string, key: string, fallback?: T): T | undefined =>
        key in config ? (config[key] as T) : fallback,
    ),
  } as unknown as IWorkspaceProvider;
}

function refusal(): AuthRequiredError {
  return new AuthRequiredError(
    providerSessionNativeRuntimeRequiredMessage(PROVIDER),
    { providerId: PROVIDER },
  );
}

function internalQuery(throwOnExecute?: Error): InternalQueryService {
  return {
    execute: jest.fn(async () => {
      if (throwOnExecute) throw throwOnExecute;
      throw new Error('the runner must not be reached');
    }),
  } as unknown as InternalQueryService;
}

describe('SdkInternalQueryCuratorLlm with a provider-session provider', () => {
  it('pinned provider: stalls before the query runner is reached', async () => {
    const query = internalQuery();
    const log = logger();
    const adapter = new SdkInternalQueryCuratorLlm(
      log,
      query,
      workspace({ 'memory.curatorProvider': PROVIDER }),
      {
        resolve: jest.fn(async () => {
          throw refusal();
        }),
      } as unknown as IProviderAuthResolver,
    );

    const result = await adapter.extract(TRANSCRIPT);

    expect(result).toEqual({
      status: 'stalled',
      reason: 'provider-unsupported',
      providerId: PROVIDER,
    });
    expect(query.execute).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      '[memory-curator] curator provider not supported for background curation; pass skipped',
      {
        providerId: PROVIDER,
        error: providerSessionNativeRuntimeRequiredMessage(PROVIDER),
      },
    );
  });

  it('inherited workspace provider: stalls before the query runner is reached', async () => {
    const query = internalQuery();
    const adapter = new SdkInternalQueryCuratorLlm(
      logger(),
      query,
      workspace({}),
      null,
      null,
      {
        resolveForPath: jest.fn(async () => {
          throw refusal();
        }),
        resolveSetup: jest.fn(),
      },
    );

    expect(await adapter.extract(TRANSCRIPT)).toEqual({
      status: 'stalled',
      reason: 'provider-unsupported',
      providerId: PROVIDER,
    });
    expect(query.execute).not.toHaveBeenCalled();
  });

  it('a runner-level refusal is reported the same way', async () => {
    const query = internalQuery(refusal());
    const adapter = new SdkInternalQueryCuratorLlm(
      logger(),
      query,
      workspace({ 'memory.curatorProvider': PROVIDER }),
    );
    expect(await adapter.extract(TRANSCRIPT)).toEqual({
      status: 'stalled',
      reason: 'provider-unsupported',
      providerId: PROVIDER,
    });
  });

  it('another AuthRequiredError for the same provider is not the refusal', async () => {
    const signedOut = new AuthRequiredError('signed out', {
      providerId: PROVIDER,
    });
    const adapter = new SdkInternalQueryCuratorLlm(
      logger(),
      internalQuery(),
      workspace({ 'memory.curatorProvider': PROVIDER }),
      {
        resolve: jest.fn(async () => {
          throw signedOut;
        }),
      } as unknown as IProviderAuthResolver,
    );
    // An ordinary auth failure stays today's query failure, not a stall.
    await expect(adapter.extract(TRANSCRIPT)).rejects.toMatchObject({
      name: 'CuratorLlmQueryError',
      cause: signedOut,
    });
  });
});

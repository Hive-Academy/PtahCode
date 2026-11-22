/**
 * Non-chat guards for provider-session providers (plan S-2 and R2-2): every
 * Claude-SDK path refuses a provider-session id with the deliberate
 * refusal, and global auth configuration never starts another provider's
 * flow (Copilot OAuth) for it.
 *
 * `antigravity-cli` is the live registry's provider-session entry, named
 * "Antigravity" in every user-facing message.
 */
import 'reflect-metadata';
import { resolve } from 'node:path';
import {
  AuthRequiredError,
  isCodexNativeRuntimeRefusal,
  isNativeRuntimeRefusal,
  isProviderSessionNativeRuntimeRefusal,
} from '@ptah-extension/agent-sdk';
import {
  providerSessionNativeRuntimeRequiredMessage,
  type AnthropicProvider,
  type AuthEnv,
} from '@ptah-extension/shared';
import type {
  ConfigManager,
  IAuthSecretsService,
  Logger,
  SentryService,
} from '@ptah-extension/vscode-core';
import type { WorkspaceScopeResolver } from '@ptah-extension/settings-core';
import type { InternalQueryService } from '@ptah-extension/agent-sdk';
import { providerSessionNativeRuntimeRequired } from './provider-session-runtime-refusal';
import {
  codexNativeRuntimeRequired,
  isNativeRuntimeAuthIntent,
} from './codex-native-runtime-refusal';
import { ProviderAuthResolver } from './provider-auth-resolver';
import { CuratorProxyManager } from './curator-proxy-manager';
import { ProviderProxyPool } from './provider-proxy-pool';
import { WorkspaceLlmResolver } from './workspace-llm-resolver';
import {
  DraftVerificationService,
  classifyDraftProbeFailure,
} from './draft-verification.service';
import { ProviderQuotaStore } from './provider-quota.store';
import { AuthManager } from './auth-manager';
import { ActiveProviderResolver } from './active-provider-resolver';
import { OAuthProxyStrategy } from './strategies/oauth-proxy.strategy';
import type {
  AuthConfigureContext,
  AuthConfigureResult,
  IAuthStrategy,
} from './auth-strategy.types';
import type { WorkspaceProviderProfileResolver } from './workspace-provider-profile-resolver';
import type { ProviderModelsService } from '../provider-models.service';
import type { ITranslationProxy } from '../translation';
import type { CuratorProxyManager as CuratorProxyManagerType } from './curator-proxy-manager';

const PROVIDER = 'antigravity-cli';
const REFUSAL =
  "Antigravity runs only as a chat or agent runtime; it cannot serve Ptah's internal model calls.";

function logger(): Logger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;
}

function proxy(): jest.Mocked<ITranslationProxy> {
  return {
    start: jest.fn(),
    stop: jest.fn(),
    isRunning: jest.fn(() => false),
    getUrl: jest.fn(() => null),
  } as unknown as jest.Mocked<ITranslationProxy>;
}

function expectRefusal(error: unknown): void {
  expect(error).toBeInstanceOf(AuthRequiredError);
  expect(error).toMatchObject({ message: REFUSAL, providerId: PROVIDER });
  expect(isProviderSessionNativeRuntimeRefusal(error)).toBe(true);
}

describe('providerSessionNativeRuntimeRequired', () => {
  it('builds the deliberate refusal that the agent-sdk recognises', () => {
    const error = providerSessionNativeRuntimeRequired(PROVIDER);
    expectRefusal(error);
    expect(error.recoveryHint).toContain('Antigravity');
    expect(isNativeRuntimeRefusal(error)).toBe(true);
    expect(isCodexNativeRuntimeRefusal(error)).toBe(false);
  });

  it('keeps the Codex refusal distinct', () => {
    const codex = codexNativeRuntimeRequired();
    expect(isProviderSessionNativeRuntimeRefusal(codex)).toBe(false);
    expect(isNativeRuntimeRefusal(codex)).toBe(true);
  });

  it('does not treat another AuthRequiredError as the refusal', () => {
    expect(
      isProviderSessionNativeRuntimeRefusal(
        new AuthRequiredError('signed out', { providerId: PROVIDER }),
      ),
    ).toBe(false);
    expect(
      isProviderSessionNativeRuntimeRefusal(
        new AuthRequiredError(
          providerSessionNativeRuntimeRequiredMessage('github-copilot'),
          { providerId: 'github-copilot' },
        ),
      ),
    ).toBe(false);
  });
});

describe('isNativeRuntimeAuthIntent', () => {
  it('is true for a provider-session id with or without a context', () => {
    expect(isNativeRuntimeAuthIntent(PROVIDER)).toBe(true);
    expect(
      isNativeRuntimeAuthIntent(PROVIDER, {
        reason: 'startup',
        hostNativeCodex: false,
        providerId: PROVIDER,
      }),
    ).toBe(true);
  });

  it('keeps the Codex rule unchanged', () => {
    const codex = {
      reason: 'startup' as const,
      hostNativeCodex: true,
      providerId: 'openai-codex',
    };
    expect(isNativeRuntimeAuthIntent('openai-codex', codex)).toBe(true);
    expect(
      isNativeRuntimeAuthIntent('openai-codex', {
        ...codex,
        reason: 'legacy-session-start',
      }),
    ).toBe(false);
    expect(isNativeRuntimeAuthIntent('openrouter')).toBe(false);
  });
});

function providerAuthResolver(activeProviderId: string): {
  resolver: ProviderAuthResolver;
  ensureProxy: jest.Mock;
} {
  const ensureProxy = jest.fn();
  const resolver = new ProviderAuthResolver(
    logger(),
    { get: jest.fn() } as unknown as ConfigManager,
    {
      getCredential: jest.fn(),
      getProviderKey: jest.fn(),
    } as unknown as IAuthSecretsService,
    {
      resolveActiveProviderId: () => activeProviderId,
    } as unknown as ProviderModelsService,
    { ensureProxy } as unknown as CuratorProxyManagerType,
    {} as never,
    {} as never,
    new ProviderQuotaStore(),
    {} as never,
  );
  return { resolver, ensureProxy };
}

describe('ProviderAuthResolver refuses provider-session ids', () => {
  it('resolve() refuses a pinned provider-session id', async () => {
    const { resolver, ensureProxy } = providerAuthResolver('openrouter');
    const error = await resolver.resolve(PROVIDER).catch((e: unknown) => e);
    expectRefusal(error);
    expect(ensureProxy).not.toHaveBeenCalled();
  });

  it('resolve() refuses an inherited provider-session active provider', async () => {
    const { resolver } = providerAuthResolver(PROVIDER);
    expectRefusal(await resolver.resolve('').catch((e: unknown) => e));
  });

  it('buildDraftOverride() refuses a provider-session draft', async () => {
    const { resolver, ensureProxy } = providerAuthResolver('openrouter');
    const error = await resolver
      .buildDraftOverride({ providerId: PROVIDER, authMode: 'oauth' } as never)
      .catch((e: unknown) => e);
    expectRefusal(error);
    expect(ensureProxy).not.toHaveBeenCalled();
  });
});

describe('CuratorProxyManager refuses provider-session ids', () => {
  it('never starts a curator proxy', async () => {
    const proxies = [proxy(), proxy(), proxy(), proxy()];
    const manager = new CuratorProxyManager(
      logger(),
      proxies[0],
      proxies[1],
      proxies[2],
      proxies[3],
    );
    expectRefusal(await manager.ensureProxy(PROVIDER).catch((e: unknown) => e));
    for (const p of proxies) expect(p.start).not.toHaveBeenCalled();
  });
});

describe('ProviderProxyPool refuses provider-session ids', () => {
  it('never acquires a pooled proxy', async () => {
    const getProviderKey = jest.fn();
    const pool = new ProviderProxyPool(
      logger(),
      { get: jest.fn() } as unknown as ConfigManager,
      { getProviderKey } as unknown as IAuthSecretsService,
      {} as never,
      {} as never,
      {} as never,
    );
    const error = await pool
      .acquire(resolve('/ws'), PROVIDER, {
        id: PROVIDER,
        requiresProxy: true,
      } as AnthropicProvider)
      .catch((e: unknown) => e);
    expectRefusal(error);
    expect(getProviderKey).not.toHaveBeenCalled();
  });
});

describe('WorkspaceLlmResolver rethrows the provider-session refusal', () => {
  it('does not let a one-shot ride the process-wide auth', async () => {
    const llm = new WorkspaceLlmResolver(
      logger(),
      { readForPath: jest.fn(() => undefined) } as unknown as WorkspaceScopeResolver,
      {
        resolveActiveAuthForPath: () => ({
          authMethod: 'thirdParty',
          providerId: PROVIDER,
        }),
      } as unknown as ActiveProviderResolver,
      {
        buildProfileForPath: jest.fn(async () => {
          throw providerSessionNativeRuntimeRequired(PROVIDER);
        }),
      } as unknown as WorkspaceProviderProfileResolver,
      { getCachedModelIds: () => null } as unknown as ProviderModelsService,
      new ProviderQuotaStore(),
    );
    expectRefusal(await llm.resolveForPath(resolve('/ws')).catch((e: unknown) => e));
  });
});

describe('DraftVerificationService reports the provider-session refusal', () => {
  it('classifies it as a credential pre-flight failure', () => {
    expect(
      classifyDraftProbeFailure({
        thrown: providerSessionNativeRuntimeRequired(PROVIDER),
        verdict: { kind: 'undetermined' },
        resultStatus: null,
        assistantError: undefined,
        cancelled: false,
        timedOut: false,
        model: null,
      } as never),
    ).toBe('credential-rejected');
  });

  it('answers with the refusal text and never starts the probe', async () => {
    const { resolver } = providerAuthResolver('openrouter');
    const execute = jest.fn();
    const service = new DraftVerificationService(
      logger(),
      {} as ProviderModelsService,
      resolver,
      { execute } as unknown as InternalQueryService,
      {} as IAuthSecretsService,
    );
    const result = await service.verify({
      probeId: 'probe-provider-session',
      providerId: PROVIDER,
      authMode: 'oauth',
    });
    expect(result).toMatchObject({
      outcome: 'failed',
      reason: 'credential-rejected',
      detail: REFUSAL,
    });
    expect(execute).not.toHaveBeenCalled();
  });
});

function oauthStrategy() {
  const copilotAuth = {
    isAuthenticated: jest.fn(async () => true),
    getAuthState: jest.fn(),
    login: jest.fn(),
  };
  const copilotProxy = { ...proxy(), start: jest.fn() };
  const codexAuth = {
    stopWatchingAuthFile: jest.fn(),
    clearCache: jest.fn(),
  };
  const kimiCodeAuth = {
    startWatching: jest.fn(),
    stopWatching: jest.fn(),
    ensureFresh: jest.fn(),
    getStatus: jest.fn(),
    clearCache: jest.fn(),
  };
  const strategy = new OAuthProxyStrategy(
    logger(),
    copilotAuth as never,
    copilotProxy as never,
    codexAuth as never,
    {} as ProviderModelsService,
    { captureException: jest.fn() } as unknown as SentryService,
    kimiCodeAuth as never,
    proxy(),
  );
  return { strategy, copilotAuth, copilotProxy, kimiCodeAuth };
}

describe('OAuthProxyStrategy with a provider-session id', () => {
  it('returns an unconfigured, native-owned result before the Copilot branch', async () => {
    const { strategy, copilotAuth, copilotProxy, kimiCodeAuth } =
      oauthStrategy();
    const authEnv: AuthEnv = {};
    const result = await strategy.configure({ providerId: PROVIDER, authEnv });
    expect(result).toEqual({
      configured: false,
      details: ['Antigravity authentication is owned by its native runtime.'],
    });
    expect(copilotAuth.isAuthenticated).not.toHaveBeenCalled();
    expect(copilotProxy.start).not.toHaveBeenCalled();
    expect(kimiCodeAuth.startWatching).not.toHaveBeenCalled();
    expect(authEnv).toEqual({});
  });
});

function strategyMock(name: string): jest.Mocked<IAuthStrategy> {
  return {
    name,
    configure: jest.fn<Promise<AuthConfigureResult>, [AuthConfigureContext]>(
      async () => ({ configured: true, details: [] }),
    ),
    teardown: jest.fn<Promise<void>, []>(async () => undefined),
  };
}

describe('AuthManager with a provider-session active provider', () => {
  function manager(providerId: { value: string }) {
    const strategies = {
      apiKey: strategyMock('ApiKeyStrategy'),
      oauthProxy: strategyMock('OAuthProxyStrategy'),
      localNative: strategyMock('LocalNativeStrategy'),
      localProxy: strategyMock('LocalProxyStrategy'),
      cli: strategyMock('CliStrategy'),
    };
    const settings: Record<string, unknown> = {
      authMethod: 'thirdParty',
    };
    const read = jest.fn((key: string) =>
      key === 'anthropicProviderId' ? providerId.value : settings[key],
    );
    const scope = {
      read,
      isStored: (key: string) => read(key) !== undefined,
    } as unknown as WorkspaceScopeResolver;
    const unit = new AuthManager(
      logger(),
      { clearAllTierEnvVars: jest.fn() } as unknown as ProviderModelsService,
      {},
      strategies.apiKey,
      strategies.oauthProxy,
      strategies.localNative,
      strategies.localProxy,
      strategies.cli,
      new ActiveProviderResolver(scope),
      { getCredential: jest.fn(async () => undefined) },
      {
        read: jest.fn(async () => ({
          state: 'signed-out' as const,
          checkedAt: '2026-11-21T00:00:00.000Z',
        })),
      },
    );
    return { unit, strategies };
  }

  it('configureAuthentication does not start a Copilot flow', async () => {
    const { unit, strategies } = manager({ value: PROVIDER });

    const result = await unit.configureAuthentication('thirdParty', {
      reason: 'startup',
      hostNativeCodex: false,
      providerId: PROVIDER,
    });

    expect(result).toEqual({
      configured: false,
      details: ['Antigravity authentication is owned by its native runtime.'],
    });
    for (const strategy of Object.values(strategies)) {
      expect(strategy.configure).not.toHaveBeenCalled();
    }
    expect(unit.getConfiguredAuth()).toBeNull();
  });

  it('tears down the previous strategy on a switch and starts none', async () => {
    const providerId = { value: 'github-copilot' };
    const { unit, strategies } = manager(providerId);
    await unit.configureAuthentication('thirdParty');
    expect(strategies.oauthProxy.configure).toHaveBeenCalledTimes(1);

    providerId.value = PROVIDER;
    const result = await unit.configureAuthentication('thirdParty', {
      reason: 'provider-selection',
      hostNativeCodex: false,
      providerId: PROVIDER,
    });

    expect(result.configured).toBe(false);
    expect(strategies.oauthProxy.teardown).toHaveBeenCalledTimes(1);
    expect(strategies.oauthProxy.configure).toHaveBeenCalledTimes(1);
    expect(strategies.apiKey.configure).not.toHaveBeenCalled();
  });
});

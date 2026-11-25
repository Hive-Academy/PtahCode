import 'reflect-metadata';

import * as path from 'path';
import * as os from 'os';
import type {
  ConfigManager,
  IAuthSecretsService,
  Logger,
} from '@ptah-extension/vscode-core';
import {
  createMockAuthSecretsService,
  createMockConfigManager,
} from '@ptah-extension/vscode-core/testing';
import {
  WorkspaceScopeResolver,
  type IGlobalBatchSettingsStore,
  type ISettingsStore,
} from '@ptah-extension/settings-core';
import { AuthRequiredError } from '@ptah-extension/agent-sdk';
import type {
  AuthEnv,
  ProviderAmbientClaudeStatus,
  ProviderProfile,
} from '@ptah-extension/shared';
import { ActiveProviderResolver } from './active-provider-resolver';
import { WorkspaceLlmResolver } from './workspace-llm-resolver';
import { WorkspaceProviderProfileResolver } from './workspace-provider-profile-resolver';
import { ProviderModelsService } from '../provider-models.service';
import { ModelResolver } from './model-resolver';
import type { AuthManager } from './auth-manager';
import type { ProviderProxyPool } from './provider-proxy-pool';
import { CodexHomeResolver } from '../providers/codex/codex-home-resolver';
import type { ICopilotAuthService } from '../providers/copilot';
import type { IKimiCodeAuthService } from '../providers/kimi-code';
import type { IOpenRouterAuthService } from '../providers/openrouter';
import type { ProviderQuotaStore } from './provider-quota.store';

const WS_A = path.join(os.tmpdir(), 'ptah-llm-ws-a');
const WS_B = path.join(os.tmpdir(), 'ptah-llm-ws-b');

function makeStore(data: Record<string, unknown>): ISettingsStore {
  return {
    readGlobal: <T>(key: string) => data[key] as T | undefined,
    writeGlobal: async (key: string, value: unknown) => {
      data[key] = value;
    },
    watchGlobal: () => ({ dispose: () => undefined }),
  } as unknown as ISettingsStore;
}

function profileFor(providerId: string, model: string): ProviderProfile {
  return {
    providerId,
    model,
    authEnv: {
      ANTHROPIC_AUTH_TOKEN: `${providerId}-key`,
      ANTHROPIC_DEFAULT_OPUS_MODEL: `${providerId}-opus`,
      ANTHROPIC_DEFAULT_SONNET_MODEL: `${providerId}-sonnet`,
    },
    baseUrl: `https://${providerId}.example/anthropic`,
  };
}

async function harness(options: {
  global: Record<string, unknown>;
  /** Workspace overrides for WS_A. */
  workspaceA?: Record<string, unknown>;
  /** The ACTIVE workspace — must never influence the result. */
  activePath?: string;
  catalogs?: Record<string, string[]>;
  cooldowns?: Record<string, number>;
  profile?: (path: string, model: string) => ProviderProfile | undefined;
}) {
  const store = makeStore({ ...options.global });
  const scope = new WorkspaceScopeResolver(store, {
    getActivePath: () => options.activePath,
    onDidChange: () => ({ dispose: () => undefined }),
  });
  for (const [key, value] of Object.entries(options.workspaceA ?? {})) {
    await scope.writeForPath(key, WS_A, value);
  }
  const buildProfileForPath = jest.fn(async (p: string, model: string) => {
    if (options.profile) return options.profile(p, model);
    const { providerId } = new ActiveProviderResolver(
      scope,
    ).resolveActiveAuthForPath(p);
    return profileFor(providerId, model);
  });
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  } as unknown as Logger;
  const resolver = new WorkspaceLlmResolver(
    logger,
    scope,
    new ActiveProviderResolver(scope),
    { buildProfileForPath } as unknown as WorkspaceProviderProfileResolver,
    {
      getCachedModelIds: (id: string) => options.catalogs?.[id] ?? null,
    } as unknown as ProviderModelsService,
    {
      retryAfterMs: (id: string) => options.cooldowns?.[id] ?? 0,
    } as unknown as ProviderQuotaStore,
  );
  return { resolver, buildProfileForPath, logger };
}

const GLOBAL = {
  authMethod: 'thirdParty',
  anthropicProviderId: 'openrouter',
  'provider.thirdParty.openrouter.selectedModel': 'or-model',
  'provider.thirdParty.z-ai.selectedModel': 'global-glm',
};

describe('WorkspaceLlmResolver', () => {
  it('resolves the workspace override provider with the model saved for it there, whatever workspace is active', async () => {
    const { resolver, buildProfileForPath } = await harness({
      global: GLOBAL,
      workspaceA: {
        authMethod: 'thirdParty',
        anthropicProviderId: 'z-ai',
        'provider.thirdParty.z-ai.selectedModel': 'glm-5.3',
      },
      activePath: WS_B,
    });

    const snapshot = await resolver.resolveForPath(WS_A);

    expect(buildProfileForPath).toHaveBeenCalledWith(WS_A, 'glm-5.3');
    expect(snapshot.providerId).toBe('z-ai');
    expect(snapshot.model).toBe('glm-5.3');
    expect(snapshot.auth?.env.ANTHROPIC_AUTH_TOKEN).toBe('z-ai-key');
    expect(snapshot.auth?.baseUrl).toBe('https://z-ai.example/anthropic');
  });

  it('a workspace with NO override resolves the global provider and model explicitly — not the active workspace', async () => {
    // The active workspace (A) overrides to z-ai; B has no override.
    const { resolver } = await harness({
      global: GLOBAL,
      workspaceA: {
        authMethod: 'thirdParty',
        anthropicProviderId: 'z-ai',
      },
      activePath: WS_A,
    });

    const snapshot = await resolver.resolveForPath(WS_B);

    expect(snapshot.providerId).toBe('openrouter');
    expect(snapshot.model).toBe('or-model');
    expect(snapshot.auth?.env.ANTHROPIC_AUTH_TOKEN).toBe('openrouter-key');
  });

  it('a rootless caller resolves the global provider and model', async () => {
    const { resolver, buildProfileForPath } = await harness({
      global: GLOBAL,
      activePath: WS_A,
      workspaceA: { anthropicProviderId: 'z-ai' },
    });

    const snapshot = await resolver.resolveForPath(undefined);

    expect(buildProfileForPath).toHaveBeenCalledWith('', 'or-model');
    expect(snapshot.providerId).toBe('openrouter');
  });

  it('replaces a stale model the provider no longer lists with its tier mapping', async () => {
    const { resolver, logger } = await harness({
      global: {
        ...GLOBAL,
        'provider.thirdParty.openrouter.selectedModel': 'retired-model',
      },
      catalogs: { openrouter: ['openrouter-sonnet', 'other'] },
    });

    const snapshot = await resolver.resolveForPath(WS_B);

    // opus is not listed; sonnet is.
    expect(snapshot.model).toBe('openrouter-sonnet');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('keeps the saved model when the provider lists none of its tiers either', async () => {
    const { resolver, logger } = await harness({
      global: {
        ...GLOBAL,
        'provider.thirdParty.openrouter.selectedModel': 'retired-model',
      },
      catalogs: { openrouter: ['unrelated-a', 'unrelated-b'] },
    });

    const snapshot = await resolver.resolveForPath(WS_B);

    expect(snapshot.model).toBe('retired-model');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('keeps the model when the provider has no cached list', async () => {
    const { resolver } = await harness({ global: GLOBAL });

    expect((await resolver.resolveForPath(WS_B)).model).toBe('or-model');
  });

  it('keeps a requested model the provider offers, and ignores one it does not', async () => {
    const { resolver } = await harness({
      global: GLOBAL,
      catalogs: { openrouter: ['or-model', 'or-other'] },
    });

    expect(
      (await resolver.resolveForPath(WS_B, { requestedModel: 'or-other' }))
        .model,
    ).toBe('or-other');
    expect(
      (await resolver.resolveForPath(WS_B, { requestedModel: 'glm-5.3' }))
        .model,
    ).toBe('or-model');
  });

  it('reports a provider cooling down from a 429 so callers can stop', async () => {
    const { resolver } = await harness({
      global: GLOBAL,
      cooldowns: { openrouter: 30_000 },
    });

    expect((await resolver.resolveForPath(WS_B)).cooldownMs).toBe(30_000);
    const ok = await harness({ global: GLOBAL });
    expect((await ok.resolver.resolveForPath(WS_B)).cooldownMs).toBeUndefined();
  });

  it('reads the cooldown for the provider the snapshot targets', async () => {
    // The path resolves openrouter, but the snapshot is built for z-ai.
    const { resolver } = await harness({
      global: GLOBAL,
      profile: (_p, model) => profileFor('z-ai', model),
      cooldowns: { 'z-ai': 12_000 },
    });

    const snapshot = await resolver.resolveForPath(WS_B);

    expect(snapshot.providerId).toBe('z-ai');
    expect(snapshot.cooldownMs).toBe(12_000);

    const other = await harness({
      global: GLOBAL,
      profile: (_p, model) => profileFor('z-ai', model),
      cooldowns: { openrouter: 12_000 },
    });
    expect(
      (await other.resolver.resolveForPath(WS_B)).cooldownMs,
    ).toBeUndefined();
  });

  it('with no isolated snapshot, returns the path model without auth', async () => {
    const { resolver } = await harness({
      global: GLOBAL,
      profile: () => undefined,
    });

    const snapshot = await resolver.resolveForPath(WS_B);

    expect(snapshot.model).toBe('or-model');
    expect(snapshot.auth).toBeUndefined();
  });

  it('fails explicitly for a Codex workspace instead of riding the process-wide auth', async () => {
    const codexError = new AuthRequiredError(
      'Codex chat requires a host with the native Codex runtime.',
      { providerId: 'openai-codex' },
    );
    const { resolver } = await harness({
      global: GLOBAL,
      profile: () => {
        throw codexError;
      },
    });

    await expect(resolver.resolveForPath(WS_B)).rejects.toBe(codexError);
  });

  it('still degrades to the process-wide auth when a non-Codex snapshot build throws', async () => {
    const { resolver } = await harness({
      global: GLOBAL,
      profile: () => {
        throw new Error('snapshot failed');
      },
    });

    const snapshot = await resolver.resolveForPath(WS_B);

    expect(snapshot.providerId).toBe('openrouter');
    expect(snapshot.auth).toBeUndefined();
  });
});

describe('WorkspaceLlmResolver.resolveSetup', () => {
  const savedEnvKey = process.env['ANTHROPIC_API_KEY'];

  beforeEach(() => {
    delete process.env['ANTHROPIC_API_KEY'];
  });

  afterEach(() => {
    if (savedEnvKey === undefined) {
      delete process.env['ANTHROPIC_API_KEY'];
    } else {
      process.env['ANTHROPIC_API_KEY'] = savedEnvKey;
    }
  });

  function makeBatchStore(
    seed: Record<string, unknown>,
  ): IGlobalBatchSettingsStore {
    const data: Record<string, unknown> = { ...seed };
    return {
      readGlobal: <T>(key: string) => data[key] as T | undefined,
      readGlobalMany: (keys: readonly string[]) =>
        Object.fromEntries(keys.map((k) => [k, data[k]])),
      hasGlobal: (key: string) => key in data && data[key] !== undefined,
      writeGlobal: async (key: string, value: unknown) => {
        if (value === undefined) delete data[key];
        else data[key] = value;
      },
      writeGlobalBatch: async (entries) => {
        for (const [k, v] of Object.entries(entries)) {
          if (v === undefined) delete data[k];
          else data[k] = v;
        }
        return Object.freeze({ ...entries });
      },
      readSecret: async () => undefined,
      writeSecret: async () => undefined,
      deleteSecret: async () => undefined,
      watchGlobal: () => ({ dispose: () => undefined }),
      watchSecret: () => ({ dispose: () => undefined }),
      flushSync: () => undefined,
    };
  }

  async function setupHarness(opts: {
    global?: Record<string, unknown>;
    workspaceA?: Record<string, unknown>;
    activePath?: string;
    configValues?: Record<string, unknown>;
    providerKeys?: Record<string, string>;
    apiKey?: string;
    ambientState?: ProviderAmbientClaudeStatus['state'];
    acquireImpl?: jest.Mock;
    copilotAuth?: Partial<ICopilotAuthService>;
    openRouterAuth?: Partial<IOpenRouterAuthService>;
    kimiCodeAuth?: Partial<IKimiCodeAuthService>;
    cooldowns?: Record<string, number>;
  }) {
    const store = makeBatchStore({ ...(opts.global ?? {}) });
    const scope = new WorkspaceScopeResolver(
      store,
      {
        getActivePath: () => opts.activePath ?? WS_B,
        onDidChange: () => ({ dispose: () => undefined }),
      },
      'app.electron',
    );
    for (const [key, value] of Object.entries(opts.workspaceA ?? {})) {
      await scope.writeForPath(key, WS_A, value);
    }

    const logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as Logger;
    const config = createMockConfigManager({
      values: opts.configValues ?? {},
    }) as unknown as ConfigManager;
    const authSecrets = createMockAuthSecretsService({
      providerKeys: opts.providerKeys,
      credentials: opts.apiKey === undefined ? {} : { apiKey: opts.apiKey },
    }) as unknown as IAuthSecretsService;
    const ambientRead = jest.fn(async (): Promise<ProviderAmbientClaudeStatus> =>
      opts.ambientState === 'connected' || opts.ambientState === 'signed-out'
        ? { state: opts.ambientState, checkedAt: '2026-10-29T00:00:00.000Z' }
        : { state: 'unknown', reason: 'timeout', checkedAt: null },
    );

    const globalAuthEnv: AuthEnv = {};
    const activeProviderResolver = new ActiveProviderResolver(scope);
    const providerModels = new ProviderModelsService(
      logger,
      config,
      globalAuthEnv,
      activeProviderResolver,
    );
    const modelResolver = new ModelResolver(logger, globalAuthEnv);
    const acquire =
      opts.acquireImpl ??
      jest.fn(async () => ({
        baseUrl: 'http://127.0.0.1:51234',
        authToken: 'isolated-proxy-token',
      }));
    const profileResolver = new WorkspaceProviderProfileResolver(
      logger,
      config,
      authSecrets,
      providerModels,
      modelResolver,
      activeProviderResolver,
      { getConfiguredAuth: () => null } as unknown as AuthManager,
      { acquire } as unknown as ProviderProxyPool,
      new CodexHomeResolver('synthetic-codex-home'),
      { read: ambientRead },
      opts.copilotAuth as ICopilotAuthService | undefined,
      opts.openRouterAuth as IOpenRouterAuthService | undefined,
      opts.kimiCodeAuth as IKimiCodeAuthService | undefined,
    );
    const resolver = new WorkspaceLlmResolver(
      logger,
      scope,
      activeProviderResolver,
      profileResolver,
      providerModels,
      {
        retryAfterMs: (id: string) => opts.cooldowns?.[id] ?? 0,
      } as unknown as ProviderQuotaStore,
    );

    return { resolver, scope, acquire, logger };
  }

  const catalog = (ids: string[]) => ({
    schema: 2,
    origin: 'live',
    models: ids.map((id) => ({
      id,
      name: id,
      description: '',
      contextLength: 200_000,
      supportsToolUse: true,
    })),
    timestamp: Date.now(),
  });

  describe('env-only ANTHROPIC_API_KEY end-to-end', () => {
    it('succeeds for Set apiKey and Unset default workspace with env-only ANTHROPIC_API_KEY', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-env-only';

      const setH = await setupHarness({
        global: {
          'setup.provider': 'apiKey',
          'setup.model': 'claude-sonnet-4-6',
        },
        ambientState: 'signed-out',
      });
      const setRes = await setH.resolver.resolveSetup(WS_A);
      expect(setRes.kind).toBe('set');
      if (setRes.kind === 'set') {
        expect(setRes.storedPair).toEqual({
          provider: 'apiKey',
          model: 'claude-sonnet-4-6',
        });
        expect(setRes.snapshot.providerId).toBe('anthropic');
        expect(setRes.snapshot.model).toBe('claude-sonnet-4-6');
        expect(setRes.snapshot.auth.env.ANTHROPIC_API_KEY).toBe(
          'sk-ant-env-only',
        );
        expect(setRes.snapshot.auth.env.ANTHROPIC_AUTH_TOKEN).toBe('');
        expect(setRes.snapshot.auth.env.ANTHROPIC_BASE_URL).toBe('');
      }

      const unsetH = await setupHarness({
        global: {
          'provider.apiKey.selectedModel': 'claude-opus-4-6',
        },
        ambientState: 'signed-out',
      });
      const unsetRes = await unsetH.resolver.resolveSetup(WS_A);
      expect(unsetRes.kind).toBe('unset');
      if (unsetRes.kind === 'unset') {
        expect(unsetRes.snapshot.providerId).toBe('anthropic');
        expect(unsetRes.snapshot.model).toBe('claude-opus-4-6');
        expect(unsetRes.snapshot.auth.env.ANTHROPIC_API_KEY).toBe(
          'sk-ant-env-only',
        );
      }
    });
  });

  describe('claudeCli / apiKey / anthropic disambiguation', () => {
    it('claudeCli requires connected Claude CLI and does not fall back to a stored API key', async () => {
      const h = await setupHarness({
        global: {
          'setup.provider': 'claudeCli',
          'setup.model': 'claude-sonnet-4-6',
        },
        apiKey: 'sk-ant-stored',
        ambientState: 'signed-out',
      });

      await expect(h.resolver.resolveSetup(WS_A)).resolves.toEqual({
        kind: 'invalid',
        source: 'setup',
        provider: 'claudeCli',
        model: 'claude-sonnet-4-6',
        cause: 'not-signed-in',
      });
    });

    it('apiKey requires API key and does not fall back to connected Claude CLI', async () => {
      const h = await setupHarness({
        global: {
          'setup.provider': 'apiKey',
          'setup.model': 'claude-sonnet-4-6',
        },
        ambientState: 'connected',
      });

      await expect(h.resolver.resolveSetup(WS_A)).resolves.toEqual({
        kind: 'invalid',
        source: 'setup',
        provider: 'apiKey',
        model: 'claude-sonnet-4-6',
        cause: 'not-signed-in',
      });
    });

    it('anthropic prefers workspace active direct method when valid, else accepts the other valid direct method', async () => {
      // Workspace active is apiKey and both are valid -> picks apiKey.
      const preferApi = await setupHarness({
        global: {
          'setup.provider': 'anthropic',
          'setup.model': 'claude-sonnet-4-6',
        },
        workspaceA: { authMethod: 'apiKey' },
        apiKey: 'sk-ant-stored',
        ambientState: 'connected',
      });
      const apiRes = await preferApi.resolver.resolveSetup(WS_A);
      expect(apiRes.kind).toBe('set');
      if (apiRes.kind === 'set') {
        expect(apiRes.snapshot.auth.env.ANTHROPIC_API_KEY).toBe(
          'sk-ant-stored',
        );
      }

      // Workspace active is apiKey without key, but claudeCli is connected -> falls back to claudeCli.
      const fallbackCli = await setupHarness({
        global: {
          'setup.provider': 'anthropic',
          'setup.model': 'claude-sonnet-4-6',
        },
        workspaceA: { authMethod: 'apiKey' },
        ambientState: 'connected',
      });
      const cliRes = await fallbackCli.resolver.resolveSetup(WS_A);
      expect(cliRes.kind).toBe('set');
      if (cliRes.kind === 'set') {
        expect(cliRes.snapshot.providerId).toBe('anthropic');
        expect(cliRes.snapshot.auth.env.ANTHROPIC_API_KEY).toBe('');
      }

      // Neither direct method has valid credentials -> not-signed-in.
      const neither = await setupHarness({
        global: {
          'setup.provider': 'anthropic',
          'setup.model': 'claude-sonnet-4-6',
        },
        ambientState: 'signed-out',
      });
      await expect(neither.resolver.resolveSetup(WS_A)).resolves.toEqual({
        kind: 'invalid',
        source: 'setup',
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        cause: 'not-signed-in',
      });
    });
  });

  describe('proxy missing-credential vs startup-failure', () => {
    it('returns invalid/not-signed-in without acquiring proxy when proxy credentials are missing', async () => {
      const h = await setupHarness({
        global: {
          'setup.provider': 'openrouter',
          'setup.model': 'anthropic/claude-sonnet-4.5',
        },
      });

      await expect(h.resolver.resolveSetup(WS_A)).resolves.toEqual({
        kind: 'invalid',
        source: 'setup',
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-4.5',
        cause: 'not-signed-in',
      });
      expect(h.acquire).not.toHaveBeenCalled();
    });

    it('returns unavailable/provider-unavailable when proxy credentials exist but acquire fails', async () => {
      const h = await setupHarness({
        global: {
          'setup.provider': 'openrouter',
          'setup.model': 'anthropic/claude-sonnet-4.5',
        },
        providerKeys: { openrouter: 'sk-or-valid' },
        acquireImpl: jest.fn(async () => undefined),
      });

      await expect(h.resolver.resolveSetup(WS_A)).resolves.toEqual({
        kind: 'unavailable',
        source: 'setup',
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-4.5',
        cause: 'provider-unavailable',
      });
      expect(h.acquire).toHaveBeenCalledTimes(1);
    });
  });

  describe('Unset (source: "workspace") resolution', () => {
    it('ignores conflicting chat-picker model.selected and tab override, resolving concrete workspace pair', async () => {
      const h = await setupHarness({
        global: {
          authMethod: 'thirdParty',
          anthropicProviderId: 'openrouter',
          'provider.thirdParty.openrouter.selectedModel': 'or/global-model',
          // Conflicting chat picker and tab override keys must be ignored.
          'model.selected': 'picker-conflict-model',
          'chat.overrideModel': 'tab-override-conflict-model',
        },
        workspaceA: {
          authMethod: 'thirdParty',
          anthropicProviderId: 'z-ai',
          'provider.thirdParty.z-ai.selectedModel': 'glm-5.3',
        },
        providerKeys: { 'z-ai': 'zai-key', openrouter: 'or-key' },
      });

      const res = await h.resolver.resolveSetup(WS_A);
      expect(res.kind).toBe('unset');
      if (res.kind === 'unset') {
        expect(res.snapshot.providerId).toBe('z-ai');
        expect(res.snapshot.model).toBe('glm-5.3');
        expect(res.snapshot.auth.env.ANTHROPIC_AUTH_TOKEN).toBe('zai-key');
      }
    });

    it.each([
      ['default', 'glm-5.3'],
      ['', 'glm-5.3'],
      ['opus', 'glm-5.3'],
      ['sonnet', 'glm-5.2'],
    ])('resolves unset workspace model %j to %s', async (alias, model) => {
      const h = await setupHarness({
        workspaceA: {
          authMethod: 'thirdParty',
          anthropicProviderId: 'z-ai',
          'provider.thirdParty.z-ai.selectedModel': alias,
        },
        providerKeys: { 'z-ai': 'zai-key' },
      });
      await expect(h.resolver.resolveSetup(WS_A)).resolves.toMatchObject({
        kind: 'unset',
        snapshot: { providerId: 'z-ai', model },
      });
    });

    it('returns invalid/model-missing with source="workspace" when unset workspace has no concrete tier', async () => {
      // `requesty` has no defaultTiers and no cached catalog.
      const h = await setupHarness({
        workspaceA: {
          authMethod: 'thirdParty',
          anthropicProviderId: 'requesty',
          'provider.thirdParty.requesty.selectedModel': 'default',
        },
        providerKeys: { requesty: 'rq-key' },
      });

      await expect(h.resolver.resolveSetup(WS_A)).resolves.toEqual({
        kind: 'invalid',
        source: 'workspace',
        provider: 'requesty',
        model: 'default',
        cause: 'model-missing',
      });
    });

    it('returns invalid/provider-unsupported with source="workspace" for Codex and provider sessions', async () => {
      for (const unsupported of ['openai-codex', 'antigravity-cli']) {
        const h = await setupHarness({
          workspaceA: {
            authMethod: 'thirdParty',
            anthropicProviderId: unsupported,
          },
        });
        await expect(h.resolver.resolveSetup(WS_A)).resolves.toEqual({
          kind: 'invalid',
          source: 'workspace',
          provider: unsupported,
          model: null,
          cause: 'provider-unsupported',
        });
      }
    });

    it('returns invalid/model-stale with source="workspace" when workspace model is absent from cached catalog', async () => {
      const h = await setupHarness({
        workspaceA: {
          authMethod: 'thirdParty',
          anthropicProviderId: 'openrouter',
          'provider.thirdParty.openrouter.selectedModel': 'retired/model',
        },
        configValues: {
          'provider.openrouter.modelCatalog': catalog([
            'anthropic/claude-sonnet-4.5',
          ]),
        },
        providerKeys: { openrouter: 'sk-or-key' },
      });

      await expect(h.resolver.resolveSetup(WS_A)).resolves.toEqual({
        kind: 'invalid',
        source: 'workspace',
        provider: 'openrouter',
        model: 'retired/model',
        cause: 'model-stale',
      });
    });
  });

  describe('Set (source: "setup") R13 cases and strict isolation', () => {
    it('uses Setup pair when it differs from workspace and ignores workspace/app-scoped setup keys', async () => {
      const h = await setupHarness({
        global: {
          'setup.provider': 'z-ai',
          'setup.model': 'glm-5.2',
          authMethod: 'thirdParty',
          anthropicProviderId: 'openrouter',
          'provider.thirdParty.openrouter.selectedModel': 'or/model',
        },
        workspaceA: {
          authMethod: 'thirdParty',
          anthropicProviderId: 'openrouter',
          'setup.provider': 'openrouter',
          'setup.model': 'or/model',
        },
        providerKeys: { 'z-ai': 'zai-key', openrouter: 'or-key' },
      });

      const res = await h.resolver.resolveSetup(WS_A);
      expect(res.kind).toBe('set');
      if (res.kind === 'set') {
        expect(res.snapshot.providerId).toBe('z-ai');
        expect(res.snapshot.model).toBe('glm-5.2');
        expect(res.snapshot.auth.env.ANTHROPIC_AUTH_TOKEN).toBe('zai-key');
      }
    });

    it('never falls back to workspace on partial pairs (provider-missing and model-missing)', async () => {
      const missingProvider = await setupHarness({
        global: {
          'setup.provider': '',
          'setup.model': 'glm-5.2',
          authMethod: 'thirdParty',
          anthropicProviderId: 'z-ai',
          'provider.thirdParty.z-ai.selectedModel': 'glm-5.2',
        },
        providerKeys: { 'z-ai': 'zai-key' },
      });
      await expect(missingProvider.resolver.resolveSetup(WS_A)).resolves.toEqual(
        {
          kind: 'invalid',
          source: 'setup',
          provider: null,
          model: 'glm-5.2',
          cause: 'provider-missing',
        },
      );

      const missingModel = await setupHarness({
        global: {
          'setup.provider': 'z-ai',
          'setup.model': '',
          authMethod: 'thirdParty',
          anthropicProviderId: 'z-ai',
          'provider.thirdParty.z-ai.selectedModel': 'glm-5.2',
        },
        providerKeys: { 'z-ai': 'zai-key' },
      });
      await expect(missingModel.resolver.resolveSetup(WS_A)).resolves.toEqual({
        kind: 'invalid',
        source: 'setup',
        provider: 'z-ai',
        model: null,
        cause: 'model-missing',
      });
    });

    it('returns invalid/provider-unknown and invalid/provider-unsupported with source="setup"', async () => {
      const unknown = await setupHarness({
        global: {
          'setup.provider': 'removed-vendor',
          'setup.model': 'some-model',
        },
      });
      await expect(unknown.resolver.resolveSetup(WS_A)).resolves.toEqual({
        kind: 'invalid',
        source: 'setup',
        provider: 'removed-vendor',
        model: 'some-model',
        cause: 'provider-unknown',
      });

      for (const unsupported of ['openai-codex', 'antigravity-cli']) {
        const h = await setupHarness({
          global: {
            'setup.provider': unsupported,
            'setup.model': 'gpt-5.4',
          },
        });
        await expect(h.resolver.resolveSetup(WS_A)).resolves.toEqual({
          kind: 'invalid',
          source: 'setup',
          provider: unsupported,
          model: 'gpt-5.4',
          cause: 'provider-unsupported',
        });
      }
    });

    it.each(['default', 'opus', 'sonnet', 'haiku', 'SONNET'])(
      'rejects Set alias %s as invalid/model-stale before dispatch',
      async (alias) => {
        const h = await setupHarness({
          global: {
            'setup.provider': 'z-ai',
            'setup.model': alias,
          },
          providerKeys: { 'z-ai': 'zai-key' },
        });
        await expect(h.resolver.resolveSetup(WS_A)).resolves.toEqual({
          kind: 'invalid',
          source: 'setup',
          provider: 'z-ai',
          model: alias,
          cause: 'model-stale',
        });
      },
    );

    it('rejects Set model missing from non-null cached catalog and accepts concrete model with null catalog', async () => {
      const stale = await setupHarness({
        global: {
          'setup.provider': 'openrouter',
          'setup.model': 'retired/model',
        },
        configValues: {
          'provider.openrouter.modelCatalog': catalog([
            'anthropic/claude-sonnet-4.5',
          ]),
        },
        providerKeys: { openrouter: 'sk-or-key' },
      });
      await expect(stale.resolver.resolveSetup(WS_A)).resolves.toEqual({
        kind: 'invalid',
        source: 'setup',
        provider: 'openrouter',
        model: 'retired/model',
        cause: 'model-stale',
      });
      expect(stale.acquire).not.toHaveBeenCalled();

      // Null cached catalog accepts concrete ID once auth passes.
      const uncached = await setupHarness({
        global: {
          'setup.provider': 'openrouter',
          'setup.model': 'anthropic/claude-sonnet-4.5',
        },
        providerKeys: { openrouter: 'sk-or-key' },
      });
      const res = await uncached.resolver.resolveSetup(WS_A);
      expect(res.kind).toBe('set');
      if (res.kind === 'set') {
        expect(res.snapshot.providerId).toBe('openrouter');
        expect(res.snapshot.model).toBe('anthropic/claude-sonnet-4.5');
      }
    });

    it('rejects a Set model that would be silently rewritten at dispatch boundary', async () => {
      // Z.AI has null cached catalog, but its sonnet tier maps to `glm-5.2`, so
      // `claude-sonnet-4-5` would be rewritten by `ModelResolver.resolve` at SDK dispatch.
      const h = await setupHarness({
        global: {
          'setup.provider': 'z-ai',
          'setup.model': 'claude-sonnet-4-5',
        },
        providerKeys: { 'z-ai': 'zai-key' },
      });
      await expect(h.resolver.resolveSetup(WS_A)).resolves.toEqual({
        kind: 'invalid',
        source: 'setup',
        provider: 'z-ai',
        model: 'claude-sonnet-4-5',
        cause: 'model-stale',
      });
    });

    it('validateSetupPair validates candidate pairs without mutating stored settings', async () => {
      const h = await setupHarness({
        global: {
          'setup.provider': 'z-ai',
          'setup.model': 'glm-5.2',
        },
        providerKeys: { 'z-ai': 'zai-key' },
      });

      await expect(
        h.resolver.validateSetupPair(WS_A, {
          provider: 'openrouter',
          model: 'anthropic/claude-sonnet-4.5',
        }),
      ).resolves.toEqual({
        kind: 'invalid',
        source: 'setup',
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-4.5',
        cause: 'not-signed-in',
      });

      // Stored pair remains unchanged.
      expect(h.scope.readSetupPair()).toEqual({
        provider: 'z-ai',
        model: 'glm-5.2',
      });
    });
  });
});

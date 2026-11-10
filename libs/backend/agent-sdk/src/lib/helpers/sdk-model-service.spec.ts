/**
 * SdkModelService — model list composition tests.
 *
 * Covers the two ways the active provider used to bleed into a model picker:
 *  1. third-party auth surfacing Anthropic-only ids its proxy cannot serve
 *     (`claude-fable-5[1m]` / `opus[1m]`),
 *  2. the native Claude login being fetched under the ACTIVE provider's env.
 */

import 'reflect-metadata';
import type { Logger } from '@ptah-extension/vscode-core';
import {
  CODEX_PROXY_TOKEN_PLACEHOLDER,
  type AuthEnv,
  type ProviderProfile,
} from '@ptah-extension/shared';
import { SdkModelService } from './sdk-model-service';
import type {
  ModelInfo,
  SpawnOptions,
  SpawnedProcess,
} from '../types/sdk-types/claude-sdk.types';
import type { SdkModuleLoader } from './sdk-module-loader';
import type { OffThreadProcessSpawner } from './off-thread-process-spawner';
import type { IModelResolver, IAuthEnvProvider } from '../auth-env.port';
import type { IStateStorage } from '@ptah-extension/platform-core';

type AuthMethod = 'claudeCli' | 'apiKey' | 'thirdParty';

/** The subset of the SDK query options these specs assert on. */
interface CapturedQueryOptions {
  env: Record<string, string | undefined>;
  stderr?: (data: string) => void;
  strictMcpConfig?: boolean;
  mcpServers?: Record<string, unknown>;
  skills?: string[] | 'all';
  spawnClaudeCodeProcess?: (options: SpawnOptions) => SpawnedProcess;
}

interface Harness {
  service: SdkModelService;
  getQueryFunction: jest.Mock;
  /** Env the SDK bridge was actually spawned with, per call. */
  spawnEnvs: Array<Record<string, string | undefined>>;
  /** Full options the SDK bridge was launched with, per call. */
  queryOptions: CapturedQueryOptions[];
  /** The auth env object the service reads — mutated in place, as in production. */
  authEnv: AuthEnv;
  /** Swap the active auth method the way an auth strategy would. */
  setAuthMethod: (method: AuthMethod) => void;
  /** Swap the active provider the way a workspace switch would. */
  setProviderId: (providerId: string) => void;
  /** Make `resolveActiveAuth()` throw, the way a failing settings store does. */
  setAuthResolverError: (error: Error | undefined) => void;
  /** Records every call the service routes through `OffThreadProcessSpawner`. */
  offThreadSpawns: SpawnOptions[];
  /** The backing map of the in-memory `IStateStorage` this harness supplies. */
  state: Map<string, unknown>;
  logInfo: jest.Mock;
  logDebug: jest.Mock;
  logWarn: jest.Mock;
  logError: jest.Mock;
}

function makeHarness(opts: {
  authMethod: AuthMethod;
  authEnv?: AuthEnv;
  sdkModels: ModelInfo[];
  tiers?: Record<string, string>;
  /** Pre-seeded persisted state, shared across two harnesses to model a reboot. */
  state?: Map<string, unknown>;
}): Harness {
  const logger = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;

  const spawnEnvs: Array<Record<string, string | undefined>> = [];
  const queryOptions: CapturedQueryOptions[] = [];

  const getQueryFunction = jest
    .fn()
    .mockResolvedValue((args: { options: CapturedQueryOptions }) => {
      spawnEnvs.push(args.options.env);
      queryOptions.push(args.options);
      return {
        supportedModels: async () => opts.sdkModels,
        close: () => undefined,
      };
    });
  const moduleLoader = {
    getCliJsPath: jest.fn().mockResolvedValue('/fake/cli.js'),
    getQueryFunction,
  } as unknown as SdkModuleLoader;

  const tiers = opts.tiers ?? {};
  const modelResolver: IModelResolver = {
    resolve: (model: string, envOverride?: AuthEnv) => {
      const tierKey = model === 'opus' ? 'ANTHROPIC_DEFAULT_OPUS_MODEL'
        : model === 'sonnet' ? 'ANTHROPIC_DEFAULT_SONNET_MODEL'
        : model === 'haiku' ? 'ANTHROPIC_DEFAULT_HAIKU_MODEL' : undefined;
      return (tierKey && envOverride?.[tierKey]) || tiers[model] || model;
    },
  } as unknown as IModelResolver;

  let authMethod = opts.authMethod;
  let providerId = 'anthropic';
  let authResolverError: Error | undefined;
  const authProvider = {
    resolveActiveAuth: () => {
      if (authResolverError) throw authResolverError;
      return { authMethod, providerId };
    },
  } as unknown as IAuthEnvProvider;

  const offThreadSpawns: SpawnOptions[] = [];
  const processSpawner = {
    spawn: (spawnOptions: SpawnOptions) => {
      offThreadSpawns.push(spawnOptions);
      return {} as SpawnedProcess;
    },
  } as unknown as OffThreadProcessSpawner;

  const authEnv: AuthEnv = opts.authEnv ?? {};

  // An in-memory IStateStorage. Sharing the map between two harnesses is what
  // makes a "second boot" testable without a real backend.
  const state = opts.state ?? new Map<string, unknown>();
  const stateStorage: IStateStorage = {
    get: <T>(key: string, defaultValue?: T): T | undefined =>
      state.has(key) ? (state.get(key) as T) : defaultValue,
    update: async (key: string, value: unknown): Promise<void> => {
      if (value === undefined) state.delete(key);
      else state.set(key, JSON.parse(JSON.stringify(value)) as unknown);
    },
    keys: () => [...state.keys()],
  };

  return {
    service: new SdkModelService(
      logger,
      moduleLoader,
      authEnv,
      modelResolver,
      authProvider,
      processSpawner,
      stateStorage,
    ),
    getQueryFunction,
    spawnEnvs,
    queryOptions,
    authEnv,
    setAuthMethod: (method: AuthMethod) => {
      authMethod = method;
    },
    setProviderId: (id: string) => {
      providerId = id;
    },
    setAuthResolverError: (error: Error | undefined) => {
      authResolverError = error;
    },
    offThreadSpawns,
    state,
    logInfo: logger.info as jest.Mock,
    logDebug: logger.debug as jest.Mock,
    logWarn: logger.warn as jest.Mock,
    logError: logger.error as jest.Mock,
  };
}

/** The list the SDK reports through a third-party translation proxy. */
const SDK_LIST_VIA_PROXY: ModelInfo[] = [
  { value: 'default', displayName: 'Default (recommended)', description: '' },
  { value: 'opus', displayName: 'gpt-5.6-luna', description: '' },
  { value: 'claude-fable-5[1m]', displayName: 'Fable', description: '' },
  { value: 'sonnet', displayName: 'gpt-5.6-terra', description: '' },
  { value: 'haiku', displayName: 'gpt-5.5', description: '' },
  { value: 'opus[1m]', displayName: 'Opus (1M context)', description: '' },
];

describe('SdkModelService', () => {
  describe('workspace profile catalog', () => {
    const profile = (authEnv: AuthEnv, providerId = 'proxy'): ProviderProfile => ({
      providerId,
      authEnv,
      model: 'opus',
    });

    it('uses the isolated env and tier mapping without populating ambient caches', async () => {
      const h = makeHarness({
        authMethod: 'thirdParty',
        authEnv: { ANTHROPIC_BASE_URL: 'http://ambient.invalid', ANTHROPIC_AUTH_TOKEN: 'ambient-token', ANTHROPIC_DEFAULT_OPUS_MODEL: 'ambient-model' },
        sdkModels: [{ value: 'opus', displayName: 'Opus', description: '' }],
      });
      const models = await h.service.getModelsForProviderProfile(profile({
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:4455',
        ANTHROPIC_AUTH_TOKEN: 'profile-token',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'profile-model',
      }));
      expect(h.spawnEnvs[0]['ANTHROPIC_AUTH_TOKEN']).toBe('profile-token');
      expect(h.spawnEnvs[0]['ANTHROPIC_BASE_URL']).toBe('http://127.0.0.1:4455');
      expect(models.map((model) => model.value)).toEqual(['profile-model']);
      expect(h.service.hasCachedModels()).toBe(false);
      expect(h.state.size).toBe(0);
    });

    it('never logs a profile credential echoed by stderr and a thrown error', async () => {
      const sentinel = 'sentinel-secret-credential';
      const h = makeHarness({ authMethod: 'thirdParty', sdkModels: [] });
      h.getQueryFunction.mockResolvedValue((args: { options: CapturedQueryOptions }) => {
        args.options.stderr?.(`[ERROR] ${sentinel}`);
        return {
          supportedModels: async () => { throw new Error(`Failed with ${sentinel}`); },
          close: () => undefined,
        };
      });
      await expect(h.service.getModelsForProviderProfile(profile({
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:4455',
        ANTHROPIC_AUTH_TOKEN: sentinel,
      }))).resolves.toEqual([]);
      for (const log of [h.logInfo, h.logDebug, h.logWarn, h.logError]) {
        expect(log.mock.calls.map((call: unknown[]) => call.map((value) => value instanceof Error ? value.message : JSON.stringify(value)).join(' ')).join(' ')).not.toContain(sentinel);
      }
      expect(h.logError).toHaveBeenCalledWith(expect.any(String), expect.any(Error));
    });

    it('never logs credentials echoed in successful SDK model metadata or tier mapping', async () => {
      const sentinel = 'sentinel-successful-catalog-credential';
      const h = makeHarness({
        authMethod: 'thirdParty',
        sdkModels: [
          { value: 'opus', displayName: `Opus ${sentinel}`, description: '' },
          { value: `claude-${sentinel}`, displayName: `Dropped ${sentinel}`, description: '' },
        ],
      });
      const models = await h.service.getModelsForProviderProfile(profile({
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:4455',
        ANTHROPIC_AUTH_TOKEN: sentinel,
        ANTHROPIC_DEFAULT_OPUS_MODEL: `mapped-${sentinel}`,
      }));
      expect(models.map((model) => model.value)).toEqual([`mapped-${sentinel}`]);
      for (const log of [h.logDebug, h.logInfo, h.logWarn, h.logError]) {
        expect(JSON.stringify(log.mock.calls)).not.toContain(sentinel);
      }
    });

    it('never logs credentials echoed in a successful direct API catalog', async () => {
      const sentinel = 'sentinel-direct-api-credential';
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
        data: [{ id: `claude-${sentinel}`, display_name: `Display ${sentinel}` }],
      }), { status: 200 }));
      try {
        const h = makeHarness({ authMethod: 'apiKey', sdkModels: [] });
        const models = await h.service.getModelsForProviderProfile(profile({
          ANTHROPIC_API_KEY: sentinel,
        }, 'anthropic'));
        expect(models.map((model) => model.value)).toEqual([`claude-${sentinel}`]);
        for (const log of [h.logDebug, h.logInfo, h.logWarn, h.logError]) {
          expect(JSON.stringify(log.mock.calls)).not.toContain(sentinel);
        }
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('deduplicates concurrent probes and caches by profile identity until invalidation', async () => {
      const h = makeHarness({ authMethod: 'thirdParty', sdkModels: [{ value: 'opus', displayName: 'Opus', description: '' }] });
      const first = profile({ ANTHROPIC_BASE_URL: 'http://127.0.0.1:4455', ANTHROPIC_AUTH_TOKEN: 'first', ANTHROPIC_DEFAULT_OPUS_MODEL: 'one' });
      const second = profile({ ...first.authEnv, ANTHROPIC_AUTH_TOKEN: 'second' });
      await Promise.all([h.service.getModelsForProviderProfile(first), h.service.getModelsForProviderProfile(first)]);
      expect(h.getQueryFunction).toHaveBeenCalledTimes(1);
      await h.service.getModelsForProviderProfile(first);
      expect(h.getQueryFunction).toHaveBeenCalledTimes(1);
      await h.service.getModelsForProviderProfile(second);
      expect(h.getQueryFunction).toHaveBeenCalledTimes(2);
      h.service.invalidateForAuthChange();
      await h.service.getModelsForProviderProfile(first);
      expect(h.getQueryFunction).toHaveBeenCalledTimes(3);
    });
  });

  it('skips a stale Codex proxy model probe before loading the SDK query', async () => {
    const h = makeHarness({
      authMethod: 'thirdParty',
      authEnv: {
        ANTHROPIC_AUTH_TOKEN: CODEX_PROXY_TOKEN_PLACEHOLDER,
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:58306',
      },
      sdkModels: SDK_LIST_VIA_PROXY,
    });

    await expect(h.service.getSupportedModels()).resolves.toEqual([]);
    expect(h.getQueryFunction).not.toHaveBeenCalled();
    expect(h.spawnEnvs).toHaveLength(0);
    expect(h.queryOptions).toHaveLength(0);
  });

  describe('third-party tier mapping', () => {
    it('drops Anthropic-only ids the provider proxy cannot serve', async () => {
      const h = makeHarness({
        authMethod: 'thirdParty',
        authEnv: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:58306' },
        sdkModels: SDK_LIST_VIA_PROXY,
        tiers: {
          opus: 'gpt-5.6-luna',
          sonnet: 'gpt-5.6-terra',
          haiku: 'gpt-5.5',
        },
      });

      const models = await h.service.getSupportedModels();

      expect(models.map((m) => m.value)).toEqual([
        'default',
        'gpt-5.6-luna',
        'gpt-5.6-terra',
        'gpt-5.5',
      ]);
      expect(models.map((m) => m.displayName)).not.toContain('Fable');
      expect(models.map((m) => m.displayName)).not.toContain(
        'Opus (1M context)',
      );
    });

    it('still collapses tiers that resolve to the same provider model', async () => {
      const h = makeHarness({
        authMethod: 'thirdParty',
        authEnv: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:58306' },
        sdkModels: SDK_LIST_VIA_PROXY,
        tiers: {
          opus: 'gpt-5.4',
          sonnet: 'gpt-5.3-codex',
          haiku: 'gpt-5.4',
        },
      });

      const models = await h.service.getSupportedModels();

      expect(models.map((m) => m.value)).toEqual([
        'default',
        'gpt-5.4',
        'gpt-5.3-codex',
      ]);
    });
  });

  describe('claudeCli auth', () => {
    it('returns the SDK list untouched — Anthropic ids are valid there', async () => {
      const h = makeHarness({
        authMethod: 'claudeCli',
        sdkModels: [
          {
            value: 'opus[1m]',
            displayName: 'Opus (1M context)',
            description: '',
          },
          {
            value: 'claude-fable-5[1m]',
            displayName: 'Fable',
            description: '',
          },
        ],
      });

      const models = await h.service.getSupportedModels();

      expect(models.map((m) => m.value)).toEqual([
        'opus[1m]',
        'claude-fable-5[1m]',
      ]);
    });
  });

  describe('getNativeClaudeModels', () => {
    const PROXY_URL = 'http://127.0.0.1:58306';

    it('spawns the SDK bridge with the proxy env unset even when process.env carries it', async () => {
      const previous = process.env['ANTHROPIC_BASE_URL'];
      process.env['ANTHROPIC_BASE_URL'] = PROXY_URL;
      try {
        const h = makeHarness({
          authMethod: 'thirdParty',
          authEnv: {
            ANTHROPIC_BASE_URL: PROXY_URL,
            ANTHROPIC_AUTH_TOKEN: 'proxy-token',
            ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.6-luna',
          },
          sdkModels: [
            {
              value: 'opus[1m]',
              displayName: 'Opus (1M context)',
              description: '',
            },
            {
              value: 'claude-fable-5[1m]',
              displayName: 'Fable',
              description: '',
            },
          ],
        });

        const models = await h.service.getNativeClaudeModels();

        expect(models.map((m) => m.displayName)).toEqual([
          'Opus (1M context)',
          'Fable',
        ]);
        expect(h.spawnEnvs).toHaveLength(1);
        expect(h.spawnEnvs[0]['ANTHROPIC_BASE_URL']).toBeUndefined();
        expect(h.spawnEnvs[0]['ANTHROPIC_AUTH_TOKEN']).toBeUndefined();
        expect(h.spawnEnvs[0]['ANTHROPIC_DEFAULT_OPUS_MODEL']).toBeUndefined();
      } finally {
        if (previous === undefined) delete process.env['ANTHROPIC_BASE_URL'];
        else process.env['ANTHROPIC_BASE_URL'] = previous;
      }
    });

    it('never applies third-party tier mapping to the native list', async () => {
      const h = makeHarness({
        authMethod: 'thirdParty',
        authEnv: { ANTHROPIC_BASE_URL: PROXY_URL },
        sdkModels: [
          { value: 'opus', displayName: 'Claude Opus 4.8', description: '' },
          {
            value: 'sonnet',
            displayName: 'Claude Sonnet 4.6',
            description: '',
          },
        ],
        tiers: { opus: 'gpt-5.6-luna', sonnet: 'gpt-5.6-terra' },
      });

      const models = await h.service.getNativeClaudeModels();

      expect(models.map((m) => m.value)).toEqual(['opus', 'sonnet']);
    });

    it('caches the native list across calls', async () => {
      const h = makeHarness({
        authMethod: 'thirdParty',
        authEnv: { ANTHROPIC_BASE_URL: PROXY_URL },
        sdkModels: [
          {
            value: 'opus[1m]',
            displayName: 'Opus (1M context)',
            description: '',
          },
        ],
      });

      await h.service.getNativeClaudeModels();
      await h.service.getNativeClaudeModels();

      expect(h.spawnEnvs).toHaveLength(1);
    });

    it('delegates to the shared cache when the native login is already active', async () => {
      const h = makeHarness({
        authMethod: 'claudeCli',
        sdkModels: [
          {
            value: 'opus[1m]',
            displayName: 'Opus (1M context)',
            description: '',
          },
        ],
      });

      await h.service.getSupportedModels();
      const models = await h.service.getNativeClaudeModels();

      expect(models.map((m) => m.value)).toEqual(['opus[1m]']);
      expect(h.spawnEnvs).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // TASK_2026_353 — one spawn per auth identity, and never on the caller's
  // thread. `config:models-list` took 7095 ms on its first call and was asked
  // six more times per boot (tmp/logs/log.log:753, 868, 1195, ...), with the
  // blocking spawn showing as 1803 ms / 1992 ms of `[event-loop] lag`.
  // -------------------------------------------------------------------------
  describe('catalog caching', () => {
    const ONE_MODEL: ModelInfo[] = [
      { value: 'opus[1m]', displayName: 'Opus (1M context)', description: '' },
    ];

    /**
     * An API-key harness that reaches the SDK bridge and caches what it finds.
     *
     * Two constraints, both from `fetchSupportedModelsInternal`: a local base
     * URL makes `fetchApiModels` skip `/v1/models` (no network from a unit
     * spec), and the model id must start with `claude-` or the result is
     * classified as the degraded API-key fallback and deliberately not cached.
     */
    function apiKeyHarnessOpts(apiKey: string) {
      return {
        authMethod: 'apiKey' as const,
        authEnv: {
          ANTHROPIC_API_KEY: apiKey,
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:58306',
        },
        sdkModels: [
          {
            value: 'claude-sonnet-4-5',
            displayName: 'Sonnet 4.5',
            description: '',
          },
        ],
      };
    }

    it('does not spawn the SDK bridge again for a second call', async () => {
      const h = makeHarness({ authMethod: 'claudeCli', sdkModels: ONE_MODEL });

      const first = await h.service.getSupportedModels();
      const second = await h.service.getSupportedModels();

      expect(h.spawnEnvs).toHaveLength(1);
      expect(second.map((m) => m.value)).toEqual(first.map((m) => m.value));
    });

    it('coalesces concurrent callers onto one spawn', async () => {
      const h = makeHarness({ authMethod: 'claudeCli', sdkModels: ONE_MODEL });

      await Promise.all([
        h.service.getSupportedModels(),
        h.service.getSupportedModels(),
        h.service.getSupportedModels(),
      ]);

      expect(h.spawnEnvs).toHaveLength(1);
    });

    it('re-fetches when the active auth method changes', async () => {
      const h = makeHarness({ authMethod: 'claudeCli', sdkModels: ONE_MODEL });

      await h.service.getSupportedModels();
      h.setAuthMethod('thirdParty');
      h.authEnv.ANTHROPIC_BASE_URL = 'http://127.0.0.1:58306';
      await h.service.getSupportedModels();

      expect(h.spawnEnvs).toHaveLength(2);
    });

    it('re-fetches when the credential changes under the same auth method', async () => {
      const h = makeHarness(apiKeyHarnessOpts('sk-first'));

      await h.service.getSupportedModels();
      h.authEnv.ANTHROPIC_API_KEY = 'sk-second';
      await h.service.getSupportedModels();

      expect(h.spawnEnvs).toHaveLength(2);
    });

    it('re-fetches when a tier remap changes under the same provider', async () => {
      const h = makeHarness({
        authMethod: 'thirdParty',
        authEnv: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:58306',
          ANTHROPIC_DEFAULT_OPUS_MODEL: 'gpt-5.6-luna',
        },
        sdkModels: [
          { value: 'opus', displayName: 'gpt-5.6-luna', description: '' },
        ],
        tiers: { opus: 'gpt-5.6-luna' },
      });

      await h.service.getSupportedModels();
      h.authEnv.ANTHROPIC_DEFAULT_OPUS_MODEL = 'gpt-5.7-luna';
      await h.service.getSupportedModels();

      expect(h.spawnEnvs).toHaveLength(2);
    });

    it('re-fetches when only the active provider changes', async () => {
      // Two providers can present byte-identical AuthEnvs and still map tiers
      // differently, because `ModelResolver` falls back to the ACTIVE
      // provider's registry `defaultTiers`. An env-only key would let one
      // answer for the other.
      const h = makeHarness({ authMethod: 'claudeCli', sdkModels: ONE_MODEL });

      await h.service.getSupportedModels();
      h.setProviderId('claude-cli');
      await h.service.getSupportedModels();

      expect(h.spawnEnvs).toHaveLength(2);
    });

    // Judge round 1, TASK_2026_353. `reconfigureAuthIfChanged` used to call the
    // blanket `clearCache()`, so alternating between two workspaces paid a full
    // multi-second SDK-bridge spawn on every switch back.
    it('serves a provider revisited after a switch away — A → B → A is two fetches', async () => {
      const h = makeHarness({
        authMethod: 'thirdParty',
        authEnv: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:1111' },
        sdkModels: [
          { value: 'sonnet', displayName: 'Provider A', description: '' },
        ],
        tiers: { sonnet: 'model-a' },
      });

      // Workspace A.
      await h.service.getSupportedModels();

      // Switch to workspace B: a different provider on a different proxy port,
      // exactly what `reconfigureAuthIfChanged` reacts to.
      h.setProviderId('openrouter');
      h.authEnv.ANTHROPIC_BASE_URL = 'http://127.0.0.1:2222';
      h.service.invalidateForAuthChange();
      await h.service.getSupportedModels();

      // Back to workspace A. Its catalog was never evicted.
      h.setProviderId('anthropic');
      h.authEnv.ANTHROPIC_BASE_URL = 'http://127.0.0.1:1111';
      h.service.invalidateForAuthChange();
      const back = await h.service.getSupportedModels();

      expect(h.spawnEnvs).toHaveLength(2);
      expect(back.map((m) => m.value)).toEqual(['model-a']);
    });

    it('re-fetches after clearCache()', async () => {
      const h = makeHarness({ authMethod: 'claudeCli', sdkModels: ONE_MODEL });

      await h.service.getSupportedModels();
      h.service.clearCache();
      await h.service.getSupportedModels();

      expect(h.spawnEnvs).toHaveLength(2);
    });

    it('reports hasCachedModels() per auth identity, not globally', async () => {
      const h = makeHarness(apiKeyHarnessOpts('sk-first'));

      expect(h.service.hasCachedModels()).toBe(false);
      await h.service.getSupportedModels();
      expect(h.service.hasCachedModels()).toBe(true);

      h.authEnv.ANTHROPIC_API_KEY = 'sk-second';
      expect(h.service.hasCachedModels()).toBe(false);
    });
  });

  describe('off-thread bridge spawn', () => {
    it('hands the SDK a spawnClaudeCodeProcess backed by OffThreadProcessSpawner', async () => {
      const h = makeHarness({
        authMethod: 'claudeCli',
        sdkModels: [
          { value: 'sonnet', displayName: 'Sonnet', description: '' },
        ],
      });

      await h.service.getSupportedModels();

      const spawner = h.queryOptions[0]?.spawnClaudeCodeProcess;
      expect(typeof spawner).toBe('function');

      const spawnOptions = {
        command: 'claude',
        args: ['--print'],
        cwd: '/home/testuser',
        env: {},
        signal: new AbortController().signal,
      } as unknown as SpawnOptions;
      spawner?.(spawnOptions);

      expect(h.offThreadSpawns).toEqual([spawnOptions]);
    });
  });

  describe('capability isolation (TASK_2026_560, C5)', () => {
    it('probes with strict MCP config, no MCP servers and no skills', async () => {
      const h = makeHarness({
        authMethod: 'claudeCli',
        sdkModels: [
          { value: 'sonnet', displayName: 'Sonnet', description: '' },
        ],
      });

      await h.service.getSupportedModels();

      expect(h.queryOptions).toHaveLength(1);
      expect(h.queryOptions[0]).toMatchObject({
        strictMcpConfig: true,
        mcpServers: {},
        skills: [],
      });
    });
  });
});

// ===========================================================================
// Cross-boot catalog persistence — TASK_2026_383 Batch 11.1.
//
// The in-memory map only covers repeats within one boot, so the FIRST
// `config:models-list` of every launch paid a full SDK-bridge spawn (1175 ms
// median). These specs pin the memo, its fingerprint keying, and its refusal
// to trust a corrupt entry.
// ===========================================================================
describe('SdkModelService — persisted catalog', () => {
  const MODELS: ModelInfo[] = [
    { value: 'opus', displayName: 'Opus', description: '' },
    { value: 'sonnet', displayName: 'Sonnet', description: '' },
  ];

  it('answers the first call of a second boot without spawning the SDK bridge', async () => {
    const state = new Map<string, unknown>();

    const first = makeHarness({
      authMethod: 'claudeCli',
      sdkModels: MODELS,
      state,
    });
    await first.service.getSupportedModels();
    expect(first.spawnEnvs).toHaveLength(1);

    // A fresh service over the same storage is the next launch.
    const second = makeHarness({
      authMethod: 'claudeCli',
      sdkModels: MODELS,
      state,
    });
    const models = await second.service.getSupportedModels();

    expect(second.spawnEnvs).toHaveLength(0);
    expect(models.map((m) => m.value)).toEqual(['opus', 'sonnet']);
  });

  it('restores resolvedModel from a saved catalog', async () => {
    const state = new Map<string, unknown>();
    const rows = [{ ...MODELS[0], resolvedModel: 'claude-opus-5' }];
    await makeHarness({
      authMethod: 'claudeCli',
      sdkModels: rows,
      state,
    }).service.getSupportedModels();
    const second = makeHarness({
      authMethod: 'claudeCli',
      sdkModels: rows,
      state,
    });
    expect((await second.service.getSupportedModels())[0].resolvedModel).toBe(
      'claude-opus-5',
    );
    expect(second.spawnEnvs).toHaveLength(0);
  });

  it('keeps an ephemeral loopback catalog in memory without saving it', async () => {
    const h = makeHarness({
      authMethod: 'claudeCli',
      authEnv: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:49152' },
      sdkModels: MODELS,
    });
    expect(await h.service.getSupportedModels()).toEqual(MODELS);
    expect(await h.service.getSupportedModels()).toEqual(MODELS);
    expect(h.spawnEnvs).toHaveLength(1);
    expect(h.state.has('ptah.sdk.modelCatalog')).toBe(false);
  });

  it.each(['http://127.0.0.1:11434', 'http://localhost:11434'])(
    'persists and restores the fixed Ollama endpoint %s',
    async (baseUrl) => {
      const state = new Map<string, unknown>();
      const authEnv = { ANTHROPIC_BASE_URL: baseUrl };
      await makeHarness({
        authMethod: 'claudeCli',
        authEnv,
        sdkModels: MODELS,
        state,
      }).service.getSupportedModels();
      const second = makeHarness({
        authMethod: 'claudeCli',
        authEnv,
        sdkModels: MODELS,
        state,
      });
      expect(await second.service.getSupportedModels()).toEqual(MODELS);
      expect(second.spawnEnvs).toHaveLength(0);
    },
  );

  it('removes old dead keys on the next good persist and keeps good keys', async () => {
    const state = new Map<string, unknown>();
    state.set('ptah.sdk.modelCatalog', {
      'method=claudeCli|provider=old|ANTHROPIC_BASE_URL=http://127.0.0.1:49152':
        MODELS,
      'method=claudeCli|provider=ollama|ANTHROPIC_BASE_URL=http://127.0.0.1:11434':
        MODELS,
    });
    await makeHarness({
      authMethod: 'claudeCli',
      sdkModels: MODELS,
      state,
    }).service.getSupportedModels();
    const keys = Object.keys(
      state.get('ptah.sdk.modelCatalog') as Record<string, unknown>,
    );
    expect(keys).toHaveLength(2);
    expect(keys.some((key) => key.includes(':49152'))).toBe(false);
    expect(keys.some((key) => key.includes(':11434'))).toBe(true);
  });

  it('persists and restores a non-loopback provider endpoint', async () => {
    const state = new Map<string, unknown>();
    const authEnv = { ANTHROPIC_BASE_URL: 'https://api.example.com' };
    await makeHarness({
      authMethod: 'claudeCli',
      authEnv,
      sdkModels: MODELS,
      state,
    }).service.getSupportedModels();
    const second = makeHarness({
      authMethod: 'claudeCli',
      authEnv,
      sdkModels: MODELS,
      state,
    });
    expect(await second.service.getSupportedModels()).toEqual(MODELS);
    expect(second.spawnEnvs).toHaveLength(0);
  });

  it('does not let one auth identity answer for another', async () => {
    const state = new Map<string, unknown>();

    const first = makeHarness({
      authMethod: 'claudeCli',
      sdkModels: MODELS,
      state,
    });
    await first.service.getSupportedModels();

    // Different credential => different fingerprint => a miss by construction.
    const second = makeHarness({
      authMethod: 'apiKey',
      authEnv: { ANTHROPIC_API_KEY: 'sk-different' },
      sdkModels: MODELS,
      state,
    });
    second.setProviderId('other-provider');
    await second.service.getSupportedModels().catch(() => undefined);

    expect(
      second.spawnEnvs.length + second.offThreadSpawns.length,
    ).toBeGreaterThan(0);
  });

  it('ignores a corrupt persisted entry instead of repairing it', async () => {
    const state = new Map<string, unknown>();
    const seeded = makeHarness({
      authMethod: 'claudeCli',
      sdkModels: MODELS,
      state,
    });
    await seeded.service.getSupportedModels();

    // Corrupt every entry in place, keeping the store's own shape intact.
    const store = state.get('ptah.sdk.modelCatalog') as Record<string, unknown>;
    for (const key of Object.keys(store)) store[key] = [{ value: 42 }];

    const next = makeHarness({
      authMethod: 'claudeCli',
      sdkModels: MODELS,
      state,
    });
    const models = await next.service.getSupportedModels();

    // Fetched, not served from the corrupt entry.
    expect(next.spawnEnvs).toHaveLength(1);
    expect(models.map((m) => m.value)).toEqual(['opus', 'sonnet']);
  });

  it('drops the persisted copy on clearCache()', async () => {
    const state = new Map<string, unknown>();
    const h = makeHarness({
      authMethod: 'claudeCli',
      sdkModels: MODELS,
      state,
    });
    await h.service.getSupportedModels();
    expect(state.has('ptah.sdk.modelCatalog')).toBe(true);

    h.service.clearCache();

    expect(state.has('ptah.sdk.modelCatalog')).toBe(false);
  });

  it('keeps the persisted copy across an auth change', async () => {
    const state = new Map<string, unknown>();
    const h = makeHarness({
      authMethod: 'claudeCli',
      sdkModels: MODELS,
      state,
    });
    await h.service.getSupportedModels();

    // Per-identity keying already isolates the catalogs; wiping them on every
    // provider switch is the A -> B -> A defect TASK_2026_353 removed.
    h.service.invalidateForAuthChange();

    expect(state.has('ptah.sdk.modelCatalog')).toBe(true);
  });
});

describe('SdkModelService — background catalog revalidation', () => {
  const saved: ModelInfo[] = [
    { value: 'opus', displayName: 'Opus', description: '' },
  ];
  const fresh: ModelInfo[] = [
    { value: 'fable', displayName: 'Fable', description: '' },
  ];

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  async function boot(models: ModelInfo[] = saved) {
    const state = new Map<string, unknown>();
    await makeHarness({
      authMethod: 'claudeCli',
      sdkModels: saved,
      state,
    }).service.getSupportedModels();
    const h = makeHarness({
      authMethod: 'claudeCli',
      sdkModels: models,
      state,
    });
    return h;
  }

  it('returns persisted rows immediately and schedules one probe', async () => {
    const h = await boot(fresh);
    expect(await h.service.getSupportedModels()).toEqual(saved);
    expect(await h.service.getSupportedModels()).toEqual(saved);
    expect(h.spawnEnvs).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(h.spawnEnvs).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(h.spawnEnvs).toHaveLength(1);
  });

  it('schedules the probe when hasCachedModels() restores the rows', async () => {
    const h = await boot(fresh);
    expect(h.service.hasCachedModels()).toBe(true);
    expect(await h.service.getSupportedModels()).toEqual(saved);
    expect(h.spawnEnvs).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(h.spawnEnvs).toHaveLength(1);
    expect(await h.service.getSupportedModels()).toEqual(fresh);
  });

  it('replaces the memory and persisted catalog when rows change', async () => {
    const h = await boot(fresh);
    await h.service.getSupportedModels();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(await h.service.getSupportedModels()).toEqual(fresh);
    expect(JSON.stringify(h.state.get('ptah.sdk.modelCatalog'))).toContain(
      'fable',
    );
  });

  it('does not rewrite an equal catalog', async () => {
    const h = await boot();
    const before = h.state.get('ptah.sdk.modelCatalog');
    await h.service.getSupportedModels();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(h.state.get('ptah.sdk.modelCatalog')).toBe(before);
  });

  it('treats live-only SDK fields as unchanged without a write', async () => {
    const live = [{ ...saved[0], futureSdkField: 'extra' }];
    const h = await boot(live);
    const write = jest.spyOn(h.state, 'set');
    await h.service.getSupportedModels();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(write).not.toHaveBeenCalled();
    expect(h.logDebug).toHaveBeenCalledWith(
      '[SdkModelService] Revalidated model catalog unchanged',
    );
    expect(h.logInfo).not.toHaveBeenCalledWith(
      '[SdkModelService] Revalidated model catalog changed',
      expect.anything(),
    );
  });

  it.each([
    { live: [{ ...saved[0], resolvedModel: 'claude-opus-5' }] },
    { live: [{ ...saved[0], displayName: 'Opus Updated' }] },
  ])('replaces and persists a changed persisted field', async ({ live }) => {
    const h = await boot(live);
    const write = jest.spyOn(h.state, 'set');
    await h.service.getSupportedModels();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(await h.service.getSupportedModels()).toEqual(live);
    expect(write).toHaveBeenCalledTimes(1);
    expect(h.logInfo).toHaveBeenCalledWith(
      '[SdkModelService] Revalidated model catalog changed',
      expect.anything(),
    );
  });

  it('retains saved rows after an empty or failed probe', async () => {
    for (const models of [[], saved]) {
      const h = await boot(models);
      await h.service.getSupportedModels();
      if (models.length)
        h.getQueryFunction.mockRejectedValueOnce(new Error('offline'));
      await jest.advanceTimersByTimeAsync(10_000);
      expect(await h.service.getSupportedModels()).toEqual(saved);
    }
  });

  it('cancels a queued probe when cleared', async () => {
    const h = await boot(fresh);
    await h.service.getSupportedModels();
    h.service.clearCache();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(h.spawnEnvs).toHaveLength(0);
  });

  it('skips a probe when auth changes before it runs', async () => {
    const h = await boot(fresh);
    await h.service.getSupportedModels();
    h.setProviderId('other-provider');
    await jest.advanceTimersByTimeAsync(10_000);
    expect(h.spawnEnvs).toHaveLength(0);
    expect(JSON.stringify(h.state.get('ptah.sdk.modelCatalog'))).not.toContain(
      'fable',
    );
  });

  it('logs a revalidation failure instead of rejecting when the auth resolver throws', async () => {
    // The timer call site drops the returned promise
    // (`void this.revalidateCatalog(key)`), so a throw from the
    // auth-fingerprint guard OUTSIDE the try would be an unhandled rejection.
    // Inside the try it is just a failed refresh: one warn line, and the
    // saved rows stay where the restore left them.
    const h = await boot(fresh);
    await h.service.getSupportedModels();
    h.setAuthResolverError(new Error('settings store unreadable'));
    await jest.advanceTimersByTimeAsync(10_000);
    expect(h.logWarn).toHaveBeenCalledWith(
      '[SdkModelService] Model catalog revalidation failed',
      expect.objectContaining({ error: 'settings store unreadable' }),
    );
    h.setAuthResolverError(undefined);
    expect(await h.service.getSupportedModels()).toEqual(saved);
  });

  it('keeps the saved catalog when the probe degrades to API-key tier slots', async () => {
    // The revalidation runs `fetchSupportedModelsInternal(key, false)`, whose
    // persist guard exists so a degraded API-key fallback (the SDK tier
    // slots, whose values do not start with `claude-`) is never cached. With
    // `persist === false` that guard is bypassed, and a non-empty result would
    // replace a good restored catalog in memory AND in the persisted store.
    // The degraded result must be discarded on that path: an empty result is
    // ignored by `revalidateCatalog`.
    const state = new Map<string, unknown>();
    const restored: ModelInfo[] = [
      {
        value: 'claude-sonnet-4-5',
        displayName: 'Sonnet 4.5',
        description: '',
      },
    ];
    // Boot with a good API-key catalog: no credentials in the env, so
    // `/v1/models` yields nothing and the SDK list (claude- ids) is kept.
    await makeHarness({
      authMethod: 'apiKey',
      sdkModels: restored,
      state,
    }).service.getSupportedModels();

    // Second boot: the same identity now sees the SDK degrade to bare tier
    // slots. The restored catalog must survive the revalidation probe.
    const h = makeHarness({
      authMethod: 'apiKey',
      sdkModels: [
        { value: 'opus', displayName: 'Opus', description: '' },
        { value: 'sonnet', displayName: 'Sonnet', description: '' },
      ],
      state,
    });
    expect(await h.service.getSupportedModels()).toEqual(restored);

    await jest.advanceTimersByTimeAsync(10_000);

    expect(await h.service.getSupportedModels()).toEqual(restored);
    expect(JSON.stringify(h.state.get('ptah.sdk.modelCatalog'))).toContain(
      'claude-sonnet-4-5',
    );
    expect(JSON.stringify(h.state.get('ptah.sdk.modelCatalog'))).not.toContain(
      '"value":"opus"',
    );
    expect(h.logInfo).not.toHaveBeenCalledWith(
      '[SdkModelService] Revalidated model catalog changed',
      expect.anything(),
    );
    expect(h.logWarn).toHaveBeenCalledWith(
      '[SdkModelService] Discarding the degraded API-key fallback on the revalidation path',
      { authMethod: 'apiKey' },
    );
  });
});

/**
 * PtahCliRegistry.resolveEffectiveTiers — scope-isolation spec.
 *
 * Verifies that resolveEffectiveTiers() reads from the `cliAgent` scope via
 * ProviderModelsService, not the `mainAgent` scope.  This is the CLI-layer
 * proof that the scope-split bug cannot regress: even if the main agent has
 * different tiers configured, the CLI registry picks up the CLI-specific
 * values.
 *
 * resolveEffectiveTiers() is private so we access it via an `as any` cast.
 * The test does not call the public API (getAdapter / spawnAgent) to avoid
 * pulling in the full DI chain (SdkModuleLoader, SdkMessageTransformer, etc.)
 * that are irrelevant to this unit.
 *
 * Source-under-test:
 *   libs/backend/agent-sdk/src/lib/ptah-cli/ptah-cli-registry.ts
 *   (resolveEffectiveTiers private method, lines ~953-1000)
 */

import 'reflect-metadata';

import { createMockLogger } from '@ptah-extension/shared/testing';
import type { Logger } from '@ptah-extension/vscode-core';
import type { AnthropicProvider } from '@ptah-extension/agent-sdk';
import {
  OLLAMA_AUTH_TOKEN_PLACEHOLDER,
  type ProviderModelsService,
} from '@ptah-extension/auth-providers';
import {
  KIMI_CODE_PROVIDER_ENTRY,
  getPtahCliLaneProvider,
  type AuthEnv,
  type PtahCliConfig,
} from '@ptah-extension/shared';
import { PtahCliRegistry } from './ptah-cli-registry';
import { createFakeSdkProcessSpawner } from './testing/fake-sdk-process-spawner';

// ---------------------------------------------------------------------------
// Narrow mock — only the methods resolveEffectiveTiers() touches
// ---------------------------------------------------------------------------

type MockProviderModels = jest.Mocked<
  Pick<ProviderModelsService, 'getModelTiers' | 'resolveEffectiveTiers'>
>;

/**
 * Stand-in for `ProviderModelsService.resolveEffectiveTiers` with no live
 * catalogue on hand: the caller's tier, else the registry preference.
 */
function specTierPreferences(
  providerId: string,
  user: Partial<Record<'sonnet' | 'opus' | 'haiku', string | null | undefined>>,
): Partial<Record<'sonnet' | 'opus' | 'haiku', string>> {
  const preferred = getPtahCliLaneProvider(providerId)?.defaultTiers;
  const pick = (tier: 'sonnet' | 'opus' | 'haiku'): string | undefined =>
    user[tier] || preferred?.[tier];
  return { sonnet: pick('sonnet'), opus: pick('opus'), haiku: pick('haiku') };
}

function createMockProviderModels(): MockProviderModels {
  return {
    resolveEffectiveTiers: jest.fn(specTierPreferences),
    getModelTiers: jest.fn().mockReturnValue({
      sonnet: null,
      opus: null,
      haiku: null,
    }),
  };
}

// ---------------------------------------------------------------------------
// Minimal registry factory
// ---------------------------------------------------------------------------

function makeRegistry(providerModels: MockProviderModels): PtahCliRegistry {
  const logger = createMockLogger();

  // PtahCliRegistry has many constructor parameters but resolveEffectiveTiers()
  // only uses `this.logger` (for debug log) and `this.providerModels`.
  // We pass nulls for the rest since no public method that touches them is called.
  return new PtahCliRegistry(
    logger as unknown as Logger,
    null as never, // authSecrets
    null as never, // moduleLoader
    null as never, // messageTransformer
    null as never, // permissionHandler
    null as never, // subagentHookHandler
    null as never, // compactionHookHandler
    null as never, // compactionConfigProvider
    providerModels as unknown as ProviderModelsService,
    null as never, // configPersistence
    null as never, // spawnOptionsService
    null as never, // modelResolver
    null as never, // configManager
    createFakeSdkProcessSpawner(), // processSpawner
  );
}

// ---------------------------------------------------------------------------
// The shipped kimi-code registry entry (static-only, x-api-key, declares
// per-model capabilities)
// ---------------------------------------------------------------------------

const KIMI_CODE: AnthropicProvider = KIMI_CODE_PROVIDER_ENTRY;

// A minimal config — agentTiers undefined so the cascade falls through to
// the providerModels service call.
const BASE_AGENT_CONFIG: PtahCliConfig = {
  id: 'pc-test-001',
  name: 'Test CLI Agent',
  providerId: 'kimi-code',
  enabled: true,
  tierMappings: undefined,
  updatedAt: 0,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

type ResolvedTiers =
  | {
      sonnet?: string | null;
      opus?: string | null;
      haiku?: string | null;
    }
  | undefined;

type RegistryInternals = {
  resolveEffectiveTiers: (config: PtahCliConfig) => ResolvedTiers;
};

describe('PtahCliRegistry.resolveEffectiveTiers', () => {
  it('calls getModelTiers with cliAgent scope (not mainAgent)', () => {
    const providerModels = createMockProviderModels();
    const registry = makeRegistry(providerModels);

    (registry as unknown as RegistryInternals).resolveEffectiveTiers(
      BASE_AGENT_CONFIG,
    );

    expect(providerModels.getModelTiers).toHaveBeenCalledWith(
      'kimi-code',
      'cliAgent',
    );
    // Crucially, it must NOT have been called with 'mainAgent' — that would be
    // the pre-fix behaviour that caused the scope leak.
    expect(providerModels.getModelTiers).not.toHaveBeenCalledWith(
      'kimi-code',
      'mainAgent',
    );
  });

  it('returns cliAgent tiers when cliAgent scope has values, ignoring mainAgent values', () => {
    const providerModels = createMockProviderModels();
    // Simulate: cliAgent scope has a haiku model configured.
    // If the registry were incorrectly reading mainAgent, it would get null here.
    providerModels.getModelTiers.mockImplementation(
      (_providerId: string, scope: string) => {
        if (scope === 'cliAgent') {
          return { sonnet: 'cli-sonnet', opus: null, haiku: 'cli-haiku' };
        }
        // mainAgent — should NOT be reached
        return { sonnet: 'main-sonnet', opus: null, haiku: 'main-haiku' };
      },
    );

    const registry = makeRegistry(providerModels);
    const resolved = (
      registry as unknown as RegistryInternals
    ).resolveEffectiveTiers(BASE_AGENT_CONFIG);

    // Must reflect cliAgent values, not mainAgent values.
    expect(resolved?.sonnet).toBe('cli-sonnet');
    expect(resolved?.haiku).toBe('cli-haiku');
  });

  it('agentConfig.tierMappings takes priority over cliAgent scope values', () => {
    const providerModels = createMockProviderModels();
    providerModels.getModelTiers.mockReturnValue({
      sonnet: 'cli-sonnet',
      opus: null,
      haiku: 'cli-haiku',
    });

    const configWithTiers: PtahCliConfig = {
      ...BASE_AGENT_CONFIG,
      tierMappings: {
        sonnet: 'agent-specific-sonnet',
        haiku: 'agent-specific-haiku',
      },
    };

    const registry = makeRegistry(providerModels);
    const resolved = (
      registry as unknown as RegistryInternals
    ).resolveEffectiveTiers(configWithTiers);

    // Per-agent config must win over the cliAgent scope from providerModels.
    expect(resolved?.sonnet).toBe('agent-specific-sonnet');
    expect(resolved?.haiku).toBe('agent-specific-haiku');
  });

  it('falls back to provider defaultTiers when both agentTiers and cliAgent scope are empty', () => {
    const providerModels = createMockProviderModels();
    // cliAgent returns nothing for all tiers.
    providerModels.getModelTiers.mockReturnValue({
      sonnet: null,
      opus: null,
      haiku: null,
    });

    const registry = makeRegistry(providerModels);
    const resolved = (
      registry as unknown as RegistryInternals
    ).resolveEffectiveTiers(BASE_AGENT_CONFIG);

    // Should fall through to KIMI_CODE.defaultTiers, via the service.
    expect(providerModels.resolveEffectiveTiers).toHaveBeenCalledWith('kimi-code', {
      sonnet: null,
      opus: null,
      haiku: null,
    });
    expect(resolved?.sonnet).toBe('k3');
    expect(resolved?.haiku).toBe('kimi-for-coding');
  });

  it.each([
    ['its own key', { kind: 'instance-key', key: 'agent-key' }, 'agent-key'],
    [
      'no key (local placeholder)',
      { kind: 'instance-key', key: OLLAMA_AUTH_TOKEN_PLACEHOLDER },
      null,
    ],
    ['no key (Kimi Code connection)', { kind: 'kimi-connection' }, null],
  ])(
    'scopes the catalogue to the run credential: %s',
    (_label, credential, apiKey) => {
      const providerModels = createMockProviderModels();
      const registry = makeRegistry(providerModels);
      (
        registry as unknown as {
          resolveEffectiveTiers: (
            config: PtahCliConfig,
            credential: unknown,
          ) => ResolvedTiers;
        }
      ).resolveEffectiveTiers(BASE_AGENT_CONFIG, credential);

      expect(providerModels.resolveEffectiveTiers).toHaveBeenCalledWith(
        'kimi-code',
        { sonnet: null, opus: null, haiku: null },
        { apiKey },
      );
    },
  );
});

type AuthEnvInternals = {
  buildAuthEnv: (
    config: PtahCliConfig,
    provider: AnthropicProvider,
    apiKey: string,
  ) => AuthEnv;
};

describe('PtahCliRegistry.buildAuthEnv — kimi-code', () => {
  it('sets ANTHROPIC_API_KEY only and declares the tier capabilities', () => {
    const registry = makeRegistry(createMockProviderModels());
    const env = (registry as unknown as AuthEnvInternals).buildAuthEnv(
      BASE_AGENT_CONFIG,
      KIMI_CODE,
      'kimi-agent-key',
    );
    const capabilities =
      'thinking,interleaved_thinking,effort,xhigh_effort,max_effort';

    expect(env.ANTHROPIC_BASE_URL).toBe('https://api.kimi.ai/coding/');
    expect(env.ANTHROPIC_API_KEY).toBe('kimi-agent-key');
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL).toBe('k3.1-pro');
    expect(env.ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES).toBe(
      capabilities,
    );
    expect(env.ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES).toBe(
      capabilities,
    );
    expect(env.ANTHROPIC_DEFAULT_HAIKU_MODEL_SUPPORTED_CAPABILITIES).toBe(
      capabilities,
    );
  });
});

type ProxyAuthEnvInternals = {
  buildProxyAuthEnv: (
    config: PtahCliConfig,
    provider: AnthropicProvider,
    credential: { kind: 'instance-key'; key: string },
  ) => Promise<{ authEnv: AuthEnv; stopProxy: () => Promise<void> }>;
};

describe('PtahCliRegistry.buildProxyAuthEnv — kimi-code (OAuth with key fallback)', () => {
  it('keeps the direct key path: no proxy, the agent key as x-api-key, no warning', async () => {
    const logger = createMockLogger();
    const registry = new PtahCliRegistry(
      logger as unknown as Logger,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      createMockProviderModels() as unknown as ProviderModelsService,
      null as never,
      null as never,
      null as never,
      null as never,
      createFakeSdkProcessSpawner(),
    );
    // The shipped entry is an OAuth proxy provider with a key fallback.
    expect(KIMI_CODE.requiresProxy).toBe(true);
    expect(KIMI_CODE.apiKeyFallback).toBe(true);

    const { authEnv, stopProxy } = await (
      registry as unknown as ProxyAuthEnvInternals
    ).buildProxyAuthEnv(BASE_AGENT_CONFIG, KIMI_CODE, {
      kind: 'instance-key',
      key: 'fake-kimi-agent-key',
    });

    expect(authEnv.ANTHROPIC_BASE_URL).toBe('https://api.kimi.ai/coding/');
    expect(authEnv.ANTHROPIC_API_KEY).toBe('fake-kimi-agent-key');
    expect(authEnv.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalled();
    await expect(stopProxy()).resolves.toBeUndefined();
  });
});

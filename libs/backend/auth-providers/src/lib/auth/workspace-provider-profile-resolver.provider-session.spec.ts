/**
 * WorkspaceProviderProfileResolver — the provider-session runtime branch.
 *
 * No registry entry carries `providerSession` until an admitting phase adds
 * one, so the registry lookups are mocked to make `antigravity-cli` a
 * provider-session provider with the `antigravity` profile.
 */
jest.mock('@ptah-extension/shared', () => {
  const actual = jest.requireActual('@ptah-extension/shared');
  const profiles: Record<string, string> = {
    'antigravity-cli': 'antigravity',
    'grok-cli': 'grok',
  };
  return {
    ...actual,
    getProviderSessionProfile: (id: string) => profiles[id],
    isProviderSessionProviderId: (id: string) => id in profiles,
  };
});

import 'reflect-metadata';
import { resolve } from 'node:path';
import { AuthRequiredError } from '@ptah-extension/agent-sdk';
import { normalizeCodexWorkspaceKey } from '@ptah-extension/codex-runtime';
import {
  SessionId,
  type RuntimeHostCapabilities,
  type SessionRuntimeIdentity,
} from '@ptah-extension/shared';
import type {
  ConfigManager,
  IAuthSecretsService,
  Logger,
} from '@ptah-extension/vscode-core';
import { WorkspaceProviderProfileResolver } from './workspace-provider-profile-resolver';
import type { ActiveAuth, ActiveProviderResolver } from './active-provider-resolver';
import type { AuthManager } from './auth-manager';
import type { ModelResolver } from './model-resolver';
import type { ProviderProxyPool } from './provider-proxy-pool';
import type { ProviderModelsService } from '../provider-models.service';
import type { CodexHomeResolver } from '../providers/codex/codex-home-resolver';

const WORKSPACE = resolve('/projects/provider-session-ws');
const SESSION = SessionId.from('12345678-1234-4234-8234-123456789abc');
function key(path: string): string {
  return normalizeCodexWorkspaceKey(path, process.platform);
}

const ADMITTED: RuntimeHostCapabilities = {
  nativeCodex: true,
  providerSessions: ['antigravity', 'grok'],
};

function harness(
  activeProviderId: string,
  catalog: readonly string[] | null = null,
) {
  const active: ActiveAuth = {
    authMethod: 'thirdParty',
    providerId: activeProviderId,
  } as ActiveAuth;
  const acquire = jest.fn();
  const activeProviderResolver = {
    resolveActiveAuthForPath: jest.fn(() => active),
    resolveActiveAuthWithDefault: jest.fn(async () => active),
  } as unknown as ActiveProviderResolver;
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;
  const resolver = new WorkspaceProviderProfileResolver(
    logger,
    { get: jest.fn() } as unknown as ConfigManager,
    {
      getCredential: jest.fn(),
      getProviderKey: jest.fn(),
    } as unknown as IAuthSecretsService,
    {
      getCachedModelIds: jest.fn(() => catalog),
    } as unknown as ProviderModelsService,
    {} as ModelResolver,
    activeProviderResolver,
    { getConfiguredAuth: () => null } as unknown as AuthManager,
    { acquire } as unknown as ProviderProxyPool,
    { path: resolve('/codex-home') } as CodexHomeResolver,
    { read: jest.fn() },
  );
  return { resolver, acquire };
}

function storedIdentity(
  overrides: Partial<Extract<SessionRuntimeIdentity, { runtime: 'provider-session' }>> = {},
): SessionRuntimeIdentity {
  return {
    version: 1,
    sessionId: SESSION,
    providerId: 'antigravity-cli',
    workspaceId: key(WORKSPACE),
    runtime: 'provider-session',
    providerSession: { profile: 'antigravity' },
    ...overrides,
  };
}

describe('WorkspaceProviderProfileResolver provider-session branch', () => {
  it('starts a provider session when the active provider has a profile', async () => {
    const { resolver, acquire } = harness('antigravity-cli');

    const resolved = await resolver.resolveExecutionProfile({
      workspacePath: WORKSPACE,
      requestedModel: 'gemini-3-pro',
      consumer: 'chat',
      hostCapabilities: ADMITTED,
    });

    expect(resolved).toEqual({
      runtime: 'provider-session',
      seed: {
        providerId: 'antigravity-cli',
        profile: 'antigravity',
        consumer: 'chat',
        workspacePath: WORKSPACE,
        workspaceId: key(WORKSPACE),
        model: 'gemini-3-pro',
      },
    });
    expect(acquire).not.toHaveBeenCalled();
  });

  it.each(['default', '', 'opus', 'Sonnet', 'haiku', 'opusplan', 'claude-sonnet-4-5', 'opus[1m]'])(
    'maps Claude alias, id or default %p to the provider default',
    async (requestedModel) => {
      const { resolver } = harness('antigravity-cli');
      const resolved = await resolver.resolveExecutionProfile({
        workspacePath: WORKSPACE,
        requestedModel,
        consumer: 'chat',
        hostCapabilities: ADMITTED,
      });
      expect(resolved.runtime).toBe('provider-session');
      if (resolved.runtime !== 'provider-session') return;
      expect(resolved.seed).not.toHaveProperty('model');
    },
  );

  it.each([
    ['no providerSessions', { nativeCodex: true }],
    ['another profile only', { nativeCodex: true, providerSessions: ['grok'] }],
  ] as const)(
    'refuses a host with %s',
    async (_label, hostCapabilities: RuntimeHostCapabilities) => {
      const { resolver } = harness('antigravity-cli');
      const attempt = resolver.resolveExecutionProfile({
        workspacePath: WORKSPACE,
        requestedModel: 'default',
        consumer: 'chat',
        hostCapabilities,
      });
      await expect(attempt).rejects.toBeInstanceOf(AuthRequiredError);
      await expect(attempt).rejects.toMatchObject({
        providerId: 'antigravity-cli',
        message: 'This session requires a host with antigravity-cli support.',
      });
    },
  );

  it.each(['gateway', 'lane'] as const)(
    'refuses consumer %s with AuthRequiredError (A9)',
    async (consumer) => {
      const { resolver } = harness('antigravity-cli');
      const attempt = resolver.resolveExecutionProfile({
        workspacePath: WORKSPACE,
        requestedModel: 'default',
        consumer,
        hostCapabilities: ADMITTED,
      });
      await expect(attempt).rejects.toBeInstanceOf(AuthRequiredError);
      await expect(attempt).rejects.toMatchObject({
        providerId: 'antigravity-cli',
      });
    },
  );

  it('resumes a stored binding with the same profile and workspace', async () => {
    const { resolver } = harness('openrouter');
    const existingIdentity = storedIdentity();

    const resolved = await resolver.resolveExecutionProfile({
      workspacePath: WORKSPACE,
      requestedModel: 'default',
      existingIdentity,
      consumer: 'chat',
      hostCapabilities: ADMITTED,
    });

    expect(resolved).toEqual({
      runtime: 'provider-session',
      seed: {
        providerId: 'antigravity-cli',
        profile: 'antigravity',
        consumer: 'chat',
        workspacePath: WORKSPACE,
        workspaceId: key(WORKSPACE),
        existingIdentity,
      },
    });
  });

  it('refuses a resume whose stored profile no longer matches the provider', async () => {
    const { resolver } = harness('openrouter');
    const attempt = resolver.resolveExecutionProfile({
      workspacePath: WORKSPACE,
      requestedModel: 'default',
      existingIdentity: storedIdentity({
        providerSession: { profile: 'grok' },
      }),
      consumer: 'chat',
      hostCapabilities: ADMITTED,
    });
    await expect(attempt).rejects.toThrow(
      new AuthRequiredError(
        'Cannot resume antigravity-cli session: profile changed.',
      ),
    );
    // Not a sign-in problem: no providerId for the UI to route to a banner.
    await expect(attempt).rejects.toMatchObject({ providerId: null });
  });

  it('refuses a resume from another workspace', async () => {
    const { resolver } = harness('openrouter');
    const attempt = resolver.resolveExecutionProfile({
      workspacePath: WORKSPACE,
      requestedModel: 'default',
      existingIdentity: storedIdentity({
        workspaceId: resolve('/projects/other-ws'),
      }),
      consumer: 'chat',
      hostCapabilities: ADMITTED,
    });
    await expect(attempt).rejects.toThrow(
      'Cannot resume antigravity-cli session: workspaceId changed.',
    );
  });

  it('refuses a resume whose provider is no longer a provider session', async () => {
    const { resolver } = harness('openrouter');
    const attempt = resolver.resolveExecutionProfile({
      workspacePath: WORKSPACE,
      requestedModel: 'default',
      existingIdentity: storedIdentity({ providerId: 'retired-cli' }),
      consumer: 'chat',
      hostCapabilities: ADMITTED,
    });
    await expect(attempt).rejects.toThrow(
      'Cannot resume retired-cli session: profile changed.',
    );
  });

  it.each(['relative/ws', '', '\\rooted-no-drive'])(
    'refuses workspace %p without a providerId',
    async (workspacePath) => {
      if (workspacePath.startsWith('\\') && process.platform !== 'win32') {
        return; // drive-less rooted paths exist only on win32
      }
      const { resolver } = harness('antigravity-cli');
      const attempt = resolver.resolveExecutionProfile({
        workspacePath,
        requestedModel: 'default',
        consumer: 'chat',
        hostCapabilities: ADMITTED,
      });
      await expect(attempt).rejects.toThrow(
        'Cannot use antigravity-cli session: workspaceId is invalid.',
      );
      await expect(attempt).rejects.toMatchObject({
        name: 'AuthRequiredError',
        providerId: null,
        recoveryHint: null,
      });
    },
  );

  it('resumes when the folder is spelled with another case on win32', async () => {
    if (process.platform !== 'win32') return;
    const { resolver } = harness('openrouter');
    const resolved = await resolver.resolveExecutionProfile({
      workspacePath: WORKSPACE.toUpperCase(),
      requestedModel: 'default',
      existingIdentity: storedIdentity({ workspaceId: WORKSPACE.toLowerCase() }),
      consumer: 'chat',
      hostCapabilities: ADMITTED,
    });
    expect(resolved.runtime).toBe('provider-session');
  });

  it.each([
    ['explicit, catalog offers it', 'gemini-3-pro', false, ['gemini-3-pro'], 'gemini-3-pro'],
    ['explicit, catalog lacks it', 'gemini-9', false, ['gemini-3-pro'], undefined],
    ['explicit, no catalog yet', 'gemini-3-pro', false, null, 'gemini-3-pro'],
    ['stored, catalog offers it', 'gemini-3-pro', true, ['gemini-3-pro'], 'gemini-3-pro'],
    ['stored, catalog lacks it', 'gpt-6-luna', true, ['gemini-3-pro'], undefined],
    ['stored, no catalog yet', 'gpt-6-luna', true, null, undefined],
  ] as const)(
    'model: %s',
    async (_label, requestedModel, requestedModelIsStored, catalog, expected) => {
      const { resolver } = harness('antigravity-cli', catalog);
      const resolved = await resolver.resolveExecutionProfile({
        workspacePath: WORKSPACE,
        requestedModel,
        requestedModelIsStored,
        consumer: 'chat',
        hostCapabilities: ADMITTED,
      });
      if (resolved.runtime !== 'provider-session') throw new Error('runtime');
      expect(resolved.seed.model).toBe(expected);
    },
  );

  it('keeps a stored Claude session on its own runtime, then refuses the SDK profile', async () => {
    const { resolver, acquire } = harness('antigravity-cli');
    const attempt = resolver.resolveExecutionProfile({
      workspacePath: WORKSPACE,
      requestedModel: 'default',
      existingIdentity: {
        version: 1,
        sessionId: SESSION,
        providerId: 'antigravity-cli',
        workspaceId: WORKSPACE,
        runtime: 'claude-sdk',
      },
      consumer: 'chat',
      hostCapabilities: ADMITTED,
    });
    await expect(attempt).rejects.toMatchObject({
      name: 'AuthRequiredError',
      providerId: 'antigravity-cli',
      message:
        "antigravity-cli runs only as a chat or agent runtime; it cannot serve Ptah's internal model calls.",
    });
    expect(acquire).not.toHaveBeenCalled();
  });

  it('refuses a Claude SDK snapshot for a provider-session provider (strategy rejection)', async () => {
    const { resolver, acquire } = harness('grok-cli');
    await expect(
      resolver.buildProfileForPath(WORKSPACE, 'default'),
    ).rejects.toMatchObject({
      name: 'AuthRequiredError',
      providerId: 'grok-cli',
    });
    expect(acquire).not.toHaveBeenCalled();
  });

  it('leaves Codex starts on the Codex branch', async () => {
    const { resolver } = harness('openai-codex');
    const resolved = await resolver.resolveExecutionProfile({
      workspacePath: WORKSPACE,
      requestedModel: 'default',
      consumer: 'chat',
      hostCapabilities: ADMITTED,
    });
    expect(resolved.runtime).toBe('codex-app-server');
  });
});

import 'reflect-metadata';
import { container, type DependencyContainer } from 'tsyringe';
import { TOKENS } from '@ptah-extension/vscode-core';
import { PLATFORM_TOKENS } from '@ptah-extension/platform-core';
import { AUTH_PROVIDERS_TOKENS } from '@ptah-extension/auth-providers';
import { SDK_TOKENS } from '@ptah-extension/agent-sdk';
import {
  CHAT_TOKENS,
  ProviderSessionPool,
  SESSION_DELETE_TOKENS,
  type ProviderSessionAuthStatusProbe,
  type ProviderSessionDeleteRelease,
} from '@ptah-extension/rpc-handlers';
import { createAcpProviderSessionRuntime } from '@ptah-extension/acp-runtime';
import { laneAcpCommandPreparer } from '@ptah-extension/cli-agent-runtime';
import { SessionId } from '@ptah-extension/shared';
import { createMockLogger } from '@ptah-extension/shared/testing';
import {
  ELECTRON_PROVIDER_SESSION_PROFILES,
  bindElectronProviderSessionChat,
  createProviderSessionContextDeps,
  createProviderSessionControlSettings,
} from './provider-session-composition';
import { ELECTRON_PROVIDER_SESSION_BOUND_TOKENS } from './expected-resolvable';
import { hasElectronProviderSessionBindings } from './provider-session-binding-registry';

jest.mock('@ptah-extension/acp-runtime', () => ({
  ...jest.requireActual<typeof import('@ptah-extension/acp-runtime')>(
    '@ptah-extension/acp-runtime',
  ),
  createAcpProviderSessionRuntime: jest.fn(() => ({ open: jest.fn() })),
}));

const SESSION = SessionId.from('11111111-1111-4111-8111-111111111111');

interface Harness {
  readonly scope: DependencyContainer;
  readonly adapter: { detect: jest.Mock; listModels: jest.Mock };
}

function harness(): Harness {
  const scope = container.createChildContainer();
  const adapter = {
    detect: jest.fn(async () => ({ installed: true, version: '1.2.3' })),
    listModels: jest.fn(async () => []),
  };
  scope.registerInstance(TOKENS.LOGGER, createMockLogger());
  scope.registerInstance(SDK_TOKENS.SDK_PROCESS_SPAWNER, { spawn: jest.fn() });
  scope.registerInstance(TOKENS.CLI_DETECTION_SERVICE, {
    getDetection: jest.fn(async () => ({ installed: true, path: '/bin/agy' })),
    getAdapter: jest.fn(() => adapter),
  });
  scope.registerInstance(SDK_TOKENS.SDK_SESSION_METADATA_STORE, {
    get: jest.fn(async () => null),
    updateProviderSessionExecution: jest.fn(),
  });
  scope.registerInstance(
    AUTH_PROVIDERS_TOKENS.SDK_WORKSPACE_PROVIDER_PROFILE_RESOLVER,
    { resolveExecutionProfile: jest.fn() },
  );
  scope.registerInstance(PLATFORM_TOKENS.WORKSPACE_PROVIDER, {});
  scope.registerInstance(PLATFORM_TOKENS.PLATFORM_INFO, {
    extensionPath: '/app',
    globalStoragePath: '/storage',
  });
  scope.registerInstance(TOKENS.WEBVIEW_MANAGER, {
    broadcastMessage: jest.fn(),
  });
  scope.registerInstance(SDK_TOKENS.HOST_ATTENTION_COORDINATOR, {
    resolve: jest.fn(),
  });
  return { scope, adapter };
}

function input() {
  return {
    scopeResolver: { readForPath: jest.fn(() => undefined) },
    settingsStore: {
      readGlobal: jest.fn(),
      writeGlobal: jest.fn(async () => undefined),
    } as never,
    pidLedger: { record: jest.fn(), remove: jest.fn() },
  };
}

const lookup = { lookup: jest.fn(() => undefined) };

describe('Electron provider-session composition', () => {
  afterEach(() => jest.restoreAllMocks());

  it('builds the runtime for the admitted profiles and registers nothing until register', async () => {
    const h = harness();
    const binding = bindElectronProviderSessionChat(h.scope, { lookup } as never, input());

    expect(binding.profiles).toEqual(['antigravity']);
    expect(ELECTRON_PROVIDER_SESSION_PROFILES).toEqual(['antigravity']);
    const [deps] = jest.mocked(createAcpProviderSessionRuntime).mock.calls.at(-1) ?? [];
    expect(deps?.profiles.map((profile) => profile.vendor)).toEqual(['antigravity']);
    for (const token of ELECTRON_PROVIDER_SESSION_BOUND_TOKENS)
      expect(h.scope.isRegistered(token)).toBe(false);
    expect(hasElectronProviderSessionBindings()).toBe(false);

    binding.register();
    for (const token of ELECTRON_PROVIDER_SESSION_BOUND_TOKENS)
      expect(h.scope.isRegistered(token)).toBe(true);
    expect(hasElectronProviderSessionBindings()).toBe(true);
    expect(() => binding.register()).toThrow('already registered');
    // Labelled like Codex (`codex-app-server`), never as the Ptah CLI.
    expect(
      h.scope.resolve<{ info: { id: string } }>(SDK_TOKENS.PROVIDER_SESSION_CHAT_PORTS)
        .info.id,
    ).toBe('provider-session');

    await binding.dispose();
    expect(hasElectronProviderSessionBindings()).toBe(false);
    await h.scope.dispose();
  });

  it('spawns with the lane command preparer so a Windows .cmd shim resolves', async () => {
    const h = harness();
    const binding = bindElectronProviderSessionChat(h.scope, { lookup } as never, input());
    const [deps] = jest.mocked(createAcpProviderSessionRuntime).mock.calls.at(-1) ?? [];
    expect(deps?.prepareCommand).toBe(laneAcpCommandPreparer);

    const custom = jest.fn();
    bindElectronProviderSessionChat(h.scope, { lookup } as never, {
      ...input(),
      prepareCommand: custom,
    });
    const [override] = jest.mocked(createAcpProviderSessionRuntime).mock.calls.at(-1) ?? [];
    expect(override?.prepareCommand).toBe(custom);
    await binding.dispose();
    await h.scope.dispose();
  });

  it('binds an auth probe over the lane adapter with the profile sign-in hint', async () => {
    const h = harness();
    const binding = bindElectronProviderSessionChat(h.scope, { lookup } as never, input());
    binding.register();
    const probe = h.scope.resolve<ProviderSessionAuthStatusProbe>(
      CHAT_TOKENS.PROVIDER_SESSION_AUTH_STATUS,
    );
    const rows = await probe.probe();
    expect(rows.antigravity).toEqual(
      expect.objectContaining({
        installed: true,
        authenticated: true,
        version: '1.2.3',
        signInHint: expect.any(String),
      }),
    );
    expect(rows.antigravity?.signInHint.length).toBeGreaterThan(0);
    await binding.dispose();
    await h.scope.dispose();
  });

  it('reports the adapter sign-in read at probe time', async () => {
    const h = harness();
    const binding = bindElectronProviderSessionChat(h.scope, { lookup } as never, input());
    binding.register();
    const probe = h.scope.resolve<ProviderSessionAuthStatusProbe>(
      CHAT_TOKENS.PROVIDER_SESSION_AUTH_STATUS,
    );
    // Added after binding: the lane is read per probe, not captured.
    Object.assign(h.adapter, { ensureTokensFresh: jest.fn(async () => false) });
    expect((await probe.probe()).antigravity).toMatchObject({
      installed: true,
      authenticated: false,
    });
    await binding.dispose();
    await h.scope.dispose();
  });

  it('session delete closes an owned session through the adapter, then releases the pool entry', async () => {
    const h = harness();
    const release = jest
      .spyOn(ProviderSessionPool.prototype, 'release')
      .mockResolvedValue(undefined);
    const binding = bindElectronProviderSessionChat(h.scope, { lookup } as never, input());
    binding.register();
    const owner = { owns: jest.fn(() => true), closeSession: jest.fn(async () => undefined) };
    h.scope.registerInstance(SDK_TOKENS.PROVIDER_SESSION_CHAT_ADAPTER, owner);
    const port = h.scope.resolve<ProviderSessionDeleteRelease>(
      SESSION_DELETE_TOKENS.PROVIDER_SESSION_RELEASE,
    );

    await port.release(SESSION);
    expect(owner.closeSession).toHaveBeenCalledWith(SESSION);
    expect(release).toHaveBeenCalledWith(SESSION, 'deleted');

    owner.owns.mockReturnValue(false);
    owner.closeSession.mockClear();
    await port.release(SESSION);
    // A history-only entry has no adapter record; the pool still closes it.
    expect(owner.closeSession).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(2);
    await binding.dispose();
    await h.scope.dispose();
  });

  it('dispose before register closes the pool once and tracks nothing', async () => {
    const h = harness();
    const dispose = jest.spyOn(ProviderSessionPool.prototype, 'dispose');
    const binding = bindElectronProviderSessionChat(h.scope, { lookup } as never, input());
    await Promise.all([binding.dispose(), binding.dispose()]);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(hasElectronProviderSessionBindings()).toBe(false);
    await h.scope.dispose();
  });
});

describe('provider-session context deps', () => {
  it('omits absent services and resolves memory and harness sync on use', async () => {
    const scope = container.createChildContainer();
    expect(createProviderSessionContextDeps(scope)).toEqual({});
    const memory = {
      buildSessionStartBlock: jest.fn(async () => 'start'),
      buildBlock: jest.fn(async () => 'block'),
    };
    const harness = { apply: jest.fn(async () => undefined) };
    const capabilities = { resolve: jest.fn() };
    const memoryFactory = jest.fn(() => memory);
    scope.register(SDK_TOKENS.SDK_MEMORY_PROMPT_INJECTOR, { useFactory: memoryFactory });
    scope.registerInstance(SDK_TOKENS.SDK_HARNESS_POLICY_SYNC, harness);
    scope.registerInstance(SDK_TOKENS.SDK_CAPABILITY_RESOLVER, capabilities);
    const deps = createProviderSessionContextDeps(scope);
    expect(deps.capabilityResolver).toBe(capabilities);
    expect(memoryFactory).not.toHaveBeenCalled();
    const call = (fn: unknown) => (fn as () => Promise<unknown>)();
    await call(deps.memory?.buildBlock);
    expect(memory.buildBlock).toHaveBeenCalledTimes(1);
    await call(deps.harnessPolicySync?.apply);
    expect(harness.apply).toHaveBeenCalledTimes(1);
    await scope.dispose();
  });
});

describe('provider-session control settings', () => {
  const identity = {
    version: 1 as const,
    sessionId: SESSION,
    providerId: 'antigravity-cli',
    workspaceId: '/work',
    runtime: 'provider-session' as const,
    providerSession: { profile: 'antigravity' as const },
  };

  it('reads model, effort and permission under the provider namespace', () => {
    const values: Record<string, unknown> = {
      'provider.thirdParty.antigravity-cli.selectedModel': 'gemini-4-hydrogen-low',
      'autopilot.enabled': true,
      'autopilot.permissionLevel': 'auto-edit',
    };
    const readForPath = jest.fn((key: string) => values[key]);
    const settings = createProviderSessionControlSettings(
      { lookup: () => ({ persisted: identity, workspacePath: '/Work' }) },
      { readForPath },
    );
    const result = settings(SESSION);
    expect(result).toEqual(
      expect.objectContaining({
        workspacePath: '/Work',
        authKey: 'thirdParty.antigravity-cli',
        model: 'gemini-4-hydrogen-low',
        permissionLevel: 'auto-edit',
      }),
    );
    expect(readForPath).toHaveBeenCalledWith(
      expect.any(String),
      '/Work',
      true,
    );
  });

  it('refuses a session that is not a provider session or has no workspace', () => {
    const settings = createProviderSessionControlSettings(
      {
        lookup: (id) =>
          id === SESSION
            ? { persisted: { ...identity, runtime: 'claude-sdk' } as never }
            : undefined,
      },
      { readForPath: () => undefined },
    );
    expect(() => settings(SESSION)).toThrow(
      expect.objectContaining({ code: 'unavailable' }),
    );
    const noWorkspace = createProviderSessionControlSettings(
      { lookup: () => ({ persisted: identity }) },
      { readForPath: () => undefined },
    );
    expect(() => noWorkspace(SESSION)).toThrow(
      expect.objectContaining({ code: 'unavailable' }),
    );
  });

  it('refuses an invalid saved permission level', () => {
    const settings = createProviderSessionControlSettings(
      { lookup: () => ({ persisted: identity, workspacePath: '/Work' }) },
      {
        readForPath: (key: string) =>
          key === 'autopilot.enabled'
            ? true
            : key === 'autopilot.permissionLevel'
              ? 'root'
              : undefined,
      },
    );
    expect(() => settings(SESSION)).toThrow(
      expect.objectContaining({ code: 'runtime-failed' }),
    );
  });
});

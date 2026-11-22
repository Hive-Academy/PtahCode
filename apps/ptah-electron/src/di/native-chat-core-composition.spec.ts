import 'reflect-metadata';
import { container, type DependencyContainer } from 'tsyringe';
import { TOKENS } from '@ptah-extension/vscode-core';
import { PLATFORM_TOKENS } from '@ptah-extension/platform-core';
import { AUTH_PROVIDERS_TOKENS } from '@ptah-extension/auth-providers';
import {
  SDK_TOKENS,
  registerCodexChatServices,
  wireAgentAdapterAliases,
} from '@ptah-extension/agent-sdk';
import { createMockLogger } from '@ptah-extension/shared/testing';
import type { RuntimeAdmissionPort } from '@ptah-extension/agent-sdk';
import {
  bindElectronNativeChatCore,
  ElectronNativeChatCoreError,
  finishElectronNativeChatCore,
} from './native-chat-core-composition';

interface Harness {
  readonly scope: DependencyContainer;
  readonly legacy: object;
  readonly unsubscribe: jest.Mock;
}

/** Only the inputs the core reads; no Codex binding is involved. */
function harness(): Harness {
  const scope = container.createChildContainer();
  const unsubscribe = jest.fn();
  const legacy = { initialize: jest.fn() };
  scope.registerInstance(TOKENS.LOGGER, createMockLogger());
  scope.registerInstance(SDK_TOKENS.SDK_SESSION_METADATA_STORE, {
    getAll: jest.fn(async () => []),
    get: jest.fn(async () => null),
    onMetadataChanged: jest.fn(() => unsubscribe),
    updateCodexExecution: jest.fn(),
    incrementCodexMessageCount: jest.fn(),
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
  scope.registerInstance(SDK_TOKENS.SDK_AGENT_ADAPTER, legacy);
  registerCodexChatServices(scope);
  wireAgentAdapterAliases(scope);
  return { scope, legacy, unsubscribe };
}

/** A built Codex binding double whose `register` binds the Codex ports. */
function pendingCodex(scope: DependencyContainer) {
  return {
    capabilities: { nativeCodex: true, nativeCodexGateway: true },
    register: jest.fn(() => {
      scope.registerInstance(SDK_TOKENS.CODEX_CHAT_ADAPTER_PORTS, {});
      scope.registerInstance(SDK_TOKENS.CODEX_CHAT_ADAPTER, {
        owns: () => false,
      });
    }),
  };
}

/** A built provider-session binding double whose `register` binds the ports. */
function pendingProviderSession(scope: DependencyContainer) {
  return {
    profiles: ['antigravity'] as const,
    register: jest.fn(() => bindProviderSessionPorts(scope)),
  };
}

/** A provider-session adapter double; P7 supplies the real one. */
function bindProviderSessionPorts(scope: DependencyContainer): void {
  scope.registerInstance(SDK_TOKENS.PROVIDER_SESSION_CHAT_PORTS, {});
  scope.registerInstance(SDK_TOKENS.PROVIDER_SESSION_CHAT_ADAPTER, {
    owns: () => false,
    listSessionModels: async () => [],
  });
}

describe('Electron native chat core composition', () => {
  it('Codex failed, provider sessions bound: the core is registered without Codex', async () => {
    const h = harness();
    const core = await bindElectronNativeChatCore(h.scope);
    const providerSession = pendingProviderSession(h.scope);

    const capabilities = finishElectronNativeChatCore(core, {
      codex: undefined,
      providerSession,
    });
    expect(providerSession.register).toHaveBeenCalledTimes(1);

    expect(capabilities).toEqual({
      nativeCodex: false,
      nativeCodexGateway: false,
      providerSessions: ['antigravity'],
    });
    expect(Object.isFrozen(capabilities)).toBe(true);
    expect(h.scope.resolve(SDK_TOKENS.RUNTIME_HOST_CAPABILITIES)).toBe(
      capabilities,
    );
    expect(h.scope.resolve(SDK_TOKENS.SESSION_RUNTIME_IDENTITY_LOOKUP)).toBe(
      core.lookup,
    );
    expect(
      typeof h.scope.resolve<RuntimeAdmissionPort>(
        SDK_TOKENS.RUNTIME_ADMISSION_PORT,
      ).servingProviderId,
    ).toBe('function');
    expect(h.scope.resolve(SDK_TOKENS.CODEX_CHAT_ADAPTER)).toBeNull();
    // The guard accepts core + provider-session ports with no Codex ports.
    const routing = h.scope.resolve(SDK_TOKENS.ROUTING_AGENT_ADAPTER);
    expect(routing).not.toBeNull();
    expect(h.scope.resolve(TOKENS.AGENT_ADAPTER)).toBe(routing);
    expect(h.unsubscribe).not.toHaveBeenCalled();
  });

  it('Codex bound: registers the Codex ports with the core; capabilities match exactly', async () => {
    const h = harness();
    const core = await bindElectronNativeChatCore(h.scope);
    const codex = pendingCodex(h.scope);
    const capabilities = finishElectronNativeChatCore(core, {
      codex,
      providerSession: undefined,
    });
    expect(codex.register).toHaveBeenCalledTimes(1);
    expect(capabilities).toEqual({ nativeCodex: true, nativeCodexGateway: true });
    expect(h.scope.resolve(SDK_TOKENS.RUNTIME_HOST_CAPABILITIES)).toBe(
      capabilities,
    );
    expect(h.scope.resolve(SDK_TOKENS.ROUTING_AGENT_ADAPTER)).not.toBeNull();
    expect(h.unsubscribe).not.toHaveBeenCalled();
  });

  it('Codex and provider sessions bound: both register with one core', async () => {
    const h = harness();
    const core = await bindElectronNativeChatCore(h.scope);
    const codex = pendingCodex(h.scope);
    const providerSession = pendingProviderSession(h.scope);
    const capabilities = finishElectronNativeChatCore(core, {
      codex,
      providerSession,
    });
    expect(codex.register).toHaveBeenCalledTimes(1);
    expect(providerSession.register).toHaveBeenCalledTimes(1);
    expect(capabilities).toEqual({
      nativeCodex: true,
      nativeCodexGateway: true,
      providerSessions: ['antigravity'],
    });
    expect(h.scope.resolve(SDK_TOKENS.ROUTING_AGENT_ADAPTER)).not.toBeNull();
  });

  it('both failed -> defaults: registers nothing and disposes the lookup', async () => {
    const h = harness();
    const core = await bindElectronNativeChatCore(h.scope);

    expect(
      finishElectronNativeChatCore(core, {
        codex: undefined,
        providerSession: undefined,
      }),
    ).toBeUndefined();

    expect(h.unsubscribe).toHaveBeenCalledTimes(1);
    expect(h.scope.resolve(SDK_TOKENS.RUNTIME_HOST_CAPABILITIES)).toEqual({
      nativeCodex: false,
    });
    expect(h.scope.resolve(SDK_TOKENS.SESSION_RUNTIME_IDENTITY_LOOKUP)).toBeNull();
    expect(h.scope.resolve(SDK_TOKENS.RUNTIME_ADMISSION_PORT)).toBeNull();
    expect(h.scope.resolve(SDK_TOKENS.ROUTING_AGENT_ADAPTER)).toBeNull();
    expect(h.scope.resolve(TOKENS.AGENT_ADAPTER)).toBe(h.legacy);
  });

  it('late registration throws: finishing after the routing adapter resolved', async () => {
    const h = harness();
    const core = await bindElectronNativeChatCore(h.scope);
    expect(h.scope.resolve(SDK_TOKENS.ROUTING_AGENT_ADAPTER)).toBeNull();
    const lateProviderSession = pendingProviderSession(h.scope);

    expect(() =>
      finishElectronNativeChatCore(core, {
        codex: undefined,
        providerSession: lateProviderSession,
      }),
    ).toThrow(
      expect.objectContaining({
        name: 'ElectronNativeChatCoreError',
        code: 'late-registration',
      }),
    );
    expect(lateProviderSession.register).not.toHaveBeenCalled();
    expect(h.scope.resolve(SDK_TOKENS.RUNTIME_ADMISSION_PORT)).toBeNull();
    // FM-2: nothing was registered, so the lookup is released.
    expect(h.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('late registration with Codex built registers no Codex ports (Claude-only stays)', async () => {
    const h = harness();
    const core = await bindElectronNativeChatCore(h.scope);
    const codex = pendingCodex(h.scope);
    expect(h.scope.resolve(TOKENS.AGENT_ADAPTER)).toBe(h.legacy);

    expect(() =>
      finishElectronNativeChatCore(core, {
        codex,
        providerSession: undefined,
      }),
    ).toThrow(expect.objectContaining({ code: 'late-registration' }));

    expect(codex.register).not.toHaveBeenCalled();
    expect(h.scope.resolve(SDK_TOKENS.CODEX_CHAT_ADAPTER_PORTS)).toBeNull();
    expect(h.unsubscribe).toHaveBeenCalledTimes(1);
    // The guard never sees a partial binding: Claude keeps the SDK adapter.
    expect(h.scope.resolve(TOKENS.AGENT_ADAPTER)).toBe(h.legacy);
  });

  it('late registration throws: a core bound after resolution trips the guard', async () => {
    const h = harness();
    expect(h.scope.resolve(TOKENS.AGENT_ADAPTER)).toBe(h.legacy);
    bindProviderSessionPorts(h.scope);
    h.scope.registerInstance(SDK_TOKENS.SESSION_RUNTIME_IDENTITY_LOOKUP, {});
    expect(() => h.scope.resolve(SDK_TOKENS.ROUTING_AGENT_ADAPTER)).toThrow(
      expect.objectContaining({ code: 'unstable-binding' }),
    );
  });

  it('registers the core once', async () => {
    const h = harness();
    const core = await bindElectronNativeChatCore(h.scope);
    finishElectronNativeChatCore(core, {
      codex: undefined,
      providerSession: pendingProviderSession(h.scope),
    });
    expect(() =>
      finishElectronNativeChatCore(core, {
        codex: undefined,
        providerSession: pendingProviderSession(h.scope),
      }),
    ).toThrow(ElectronNativeChatCoreError);
  });
});

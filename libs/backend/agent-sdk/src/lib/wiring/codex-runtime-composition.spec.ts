import 'reflect-metadata';
import { container } from 'tsyringe';
import { TOKENS } from '@ptah-extension/vscode-core';
import { SDK_TOKENS } from '../di/tokens';
import { guardRuntimeComposition } from './codex-runtime-composition';
import { CodexRuntimeCompositionError } from './codex-runtime-composition-error';
import {
  registerCodexChatServices,
  wireAgentAdapterAliases,
} from '../di/register';

describe('runtime composition order', () => {
  it.each([
    SDK_TOKENS.SESSION_RUNTIME_IDENTITY_LOOKUP,
    SDK_TOKENS.CODEX_CHAT_ADAPTER_PORTS,
    SDK_TOKENS.RUNTIME_ADMISSION_PORT,
    SDK_TOKENS.RUNTIME_HOST_CAPABILITIES,
    SDK_TOKENS.CODEX_CHAT_ADAPTER,
  ])('rejects late host binding after SDK resolution (%s)', (token) => {
    const scope = container.createChildContainer();
    scope.registerInstance(SDK_TOKENS.SDK_AGENT_ADAPTER, {});
    registerCodexChatServices(scope);
    wireAgentAdapterAliases(scope);
    scope.resolve(TOKENS.AGENT_ADAPTER);
    scope.registerInstance(token, {});
    expect(() => scope.resolve(TOKENS.AGENT_ADAPTER)).toThrow(
      'Runtime ports must be bound',
    );
    expect(() => scope.resolve(SDK_TOKENS.ROUTING_AGENT_ADAPTER)).toThrow(
      'Runtime ports must be bound',
    );
  });
});

/** Reported when neither runtime's ports are bound beside a bound core. */
const ANY_RUNTIME_PORTS =
  'CODEX_CHAT_ADAPTER_PORTS or PROVIDER_SESSION_CHAT_PORTS';

describe('all-or-nothing native bindings', () => {
  const names = [
    'SESSION_RUNTIME_IDENTITY_LOOKUP',
    'CODEX_CHAT_ADAPTER_PORTS',
    'RUNTIME_ADMISSION_PORT',
    'RUNTIME_HOST_CAPABILITIES',
  ] as const;
  const reported = (name: (typeof names)[number]) =>
    name === 'CODEX_CHAT_ADAPTER_PORTS' ? ANY_RUNTIME_PORTS : name;

  // All 14 partial subsets: singles, every pair, and each missing-one case.
  it.each(Array.from({ length: 14 }, (_value, index) => index + 1))(
    'names every missing token for binding mask %s before adapter construction',
    (mask) => {
      const scope = container.createChildContainer();
      registerCodexChatServices(scope);
      names.forEach((name, index) => {
        if (mask & (1 << index)) {
          scope.registerInstance(SDK_TOKENS[name], { nativeCodex: false });
        }
      });
      const constructNative = jest.fn(() => ({}));
      scope.register(SDK_TOKENS.CODEX_CHAT_ADAPTER, {
        useFactory: constructNative,
      });
      wireAgentAdapterAliases(scope);
      const missing = names
        .filter((_name, index) => !(mask & (1 << index)))
        .map(reported);
      for (const alias of [
        TOKENS.AGENT_ADAPTER,
        SDK_TOKENS.ROUTING_AGENT_ADAPTER,
      ]) {
        expect(() => scope.resolve(alias)).toThrow(
          expect.objectContaining({
            code: 'partial-native-binding',
            token: missing.join(', '),
          }),
        );
      }
      expect(constructNative).not.toHaveBeenCalled();
    },
  );

  it('recognizes inherited SDK defaults across repeated registration', () => {
    const parent = container.createChildContainer();
    registerCodexChatServices(parent);
    const scope = parent.createChildContainer();
    const sdk = {};
    scope.registerInstance(SDK_TOKENS.SDK_AGENT_ADAPTER, sdk);
    registerCodexChatServices(scope);
    registerCodexChatServices(scope);
    wireAgentAdapterAliases(scope);
    expect(scope.resolve(TOKENS.AGENT_ADAPTER)).toBe(sdk);
    expect(scope.resolve(TOKENS.AGENT_ADAPTER)).toBe(sdk);
  });

  it('treats a host rebinding the default object as a host capability binding', () => {
    const scope = container.createChildContainer();
    registerCodexChatServices(scope);
    const defaultValue = scope.resolve(SDK_TOKENS.RUNTIME_HOST_CAPABILITIES);
    scope.registerInstance(SDK_TOKENS.RUNTIME_HOST_CAPABILITIES, defaultValue);
    expect(() => scope.resolve(SDK_TOKENS.ROUTING_AGENT_ADAPTER)).toThrow(
      expect.objectContaining({
        code: 'partial-native-binding',
        token: names.slice(0, 3).map(reported).join(', '),
      }),
    );
  });

  it.each([false, true])(
    'accepts complete host composition with nativeCodex=%s',
    (nativeCodex) => {
      const scope = container.createChildContainer();
      registerCodexChatServices(scope);
      for (const name of names) {
        scope.registerInstance(SDK_TOKENS[name], { nativeCodex });
      }
      scope.registerInstance(SDK_TOKENS.CODEX_CHAT_ADAPTER, {});
      scope.registerInstance(SDK_TOKENS.SDK_AGENT_ADAPTER, {});
      expect(() =>
        scope.resolve(SDK_TOKENS.ROUTING_AGENT_ADAPTER),
      ).not.toThrow();
    },
  );
});

describe('provider-session runtime group', () => {
  const core = [
    SDK_TOKENS.SESSION_RUNTIME_IDENTITY_LOOKUP,
    SDK_TOKENS.RUNTIME_ADMISSION_PORT,
    SDK_TOKENS.RUNTIME_HOST_CAPABILITIES,
  ];

  it('accepts the core with provider-session ports and no Codex ports', () => {
    const scope = container.createChildContainer();
    registerCodexChatServices(scope);
    for (const token of core)
      scope.registerInstance(token, {
        nativeCodex: false,
        providerSessions: ['antigravity'],
      });
    scope.registerInstance(SDK_TOKENS.PROVIDER_SESSION_CHAT_PORTS, {});
    scope.registerInstance(SDK_TOKENS.PROVIDER_SESSION_CHAT_ADAPTER, {
      owns: () => false,
    });
    scope.registerInstance(SDK_TOKENS.SDK_AGENT_ADAPTER, {});
    expect(scope.resolve(SDK_TOKENS.CODEX_CHAT_ADAPTER)).toBeNull();
    expect(scope.resolve(SDK_TOKENS.ROUTING_AGENT_ADAPTER)).not.toBeNull();
  });

  it('accepts both runtimes bound beside one core', () => {
    const scope = container.createChildContainer();
    registerCodexChatServices(scope);
    for (const token of core)
      scope.registerInstance(token, { nativeCodex: true });
    scope.registerInstance(SDK_TOKENS.CODEX_CHAT_ADAPTER_PORTS, {});
    scope.registerInstance(SDK_TOKENS.CODEX_CHAT_ADAPTER, {});
    scope.registerInstance(SDK_TOKENS.PROVIDER_SESSION_CHAT_PORTS, {});
    scope.registerInstance(SDK_TOKENS.PROVIDER_SESSION_CHAT_ADAPTER, {});
    scope.registerInstance(SDK_TOKENS.SDK_AGENT_ADAPTER, {});
    expect(() =>
      scope.resolve(SDK_TOKENS.ROUTING_AGENT_ADAPTER),
    ).not.toThrow();
  });

  it('rejects provider-session ports without the core', () => {
    const scope = container.createChildContainer();
    registerCodexChatServices(scope);
    scope.registerInstance(SDK_TOKENS.PROVIDER_SESSION_CHAT_PORTS, {});
    scope.registerInstance(SDK_TOKENS.SDK_AGENT_ADAPTER, {});
    wireAgentAdapterAliases(scope);
    expect(() => scope.resolve(TOKENS.AGENT_ADAPTER)).toThrow(
      expect.objectContaining({
        code: 'partial-native-binding',
        token:
          'SESSION_RUNTIME_IDENTITY_LOOKUP, RUNTIME_ADMISSION_PORT, RUNTIME_HOST_CAPABILITIES',
      }),
    );
  });

  it('rejects a core with no runtime ports, naming either runtime', () => {
    const scope = container.createChildContainer();
    registerCodexChatServices(scope);
    for (const token of core)
      scope.registerInstance(token, { nativeCodex: false });
    scope.registerInstance(SDK_TOKENS.SDK_AGENT_ADAPTER, {});
    expect(() => scope.resolve(SDK_TOKENS.ROUTING_AGENT_ADAPTER)).toThrow(
      expect.objectContaining({
        code: 'partial-native-binding',
        token: ANY_RUNTIME_PORTS,
      }),
    );
  });

  it.each([
    SDK_TOKENS.PROVIDER_SESSION_CHAT_PORTS,
    SDK_TOKENS.PROVIDER_SESSION_CHAT_ADAPTER,
  ])('rejects late provider-session binding after resolution (%s)', (token) => {
    const scope = container.createChildContainer();
    scope.registerInstance(SDK_TOKENS.SDK_AGENT_ADAPTER, {});
    registerCodexChatServices(scope);
    wireAgentAdapterAliases(scope);
    scope.resolve(TOKENS.AGENT_ADAPTER);
    scope.registerInstance(token, {});
    expect(() => scope.resolve(SDK_TOKENS.ROUTING_AGENT_ADAPTER)).toThrow(
      'Runtime ports must be bound',
    );
  });
});

describe('stable host bindings', () => {
  const tokens = [
    SDK_TOKENS.SESSION_RUNTIME_IDENTITY_LOOKUP,
    SDK_TOKENS.CODEX_CHAT_ADAPTER_PORTS,
    SDK_TOKENS.RUNTIME_ADMISSION_PORT,
    SDK_TOKENS.RUNTIME_HOST_CAPABILITIES,
    SDK_TOKENS.CODEX_CHAT_ADAPTER,
    SDK_TOKENS.PROVIDER_SESSION_CHAT_PORTS,
    SDK_TOKENS.PROVIDER_SESSION_CHAT_ADAPTER,
  ];
  it.each(tokens)('names unstable useFactory token %s', (token) => {
    const scope = container.createChildContainer();
    for (const guarded of tokens) scope.registerInstance(guarded, {});
    scope.register(token, { useFactory: () => ({}) });
    const assertComposition = guardRuntimeComposition(scope);
    assertComposition();
    expect(assertComposition).toThrow(CodexRuntimeCompositionError);
    expect(assertComposition).toThrow(
      expect.objectContaining({
        code: 'unstable-binding',
        token: token.description,
        message: expect.stringContaining('bind a stable instance'),
      }),
    );
  });
});

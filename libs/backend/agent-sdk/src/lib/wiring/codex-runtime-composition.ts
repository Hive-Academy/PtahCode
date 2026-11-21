import type { DependencyContainer, FactoryProvider } from 'tsyringe';
import type { RuntimeHostCapabilities } from '@ptah-extension/shared';
import { SDK_TOKENS } from '../di/tokens';
import { CodexRuntimeCompositionError } from './codex-runtime-composition-error';

// Record which provider actually ran, including inherited defaults. A host may
// bind the same value (or even the same object); neither makes it our default.
const defaultCapabilityResolutions = new WeakSet<DependencyContainer>();

/** Default provider for SDK_TOKENS.RUNTIME_HOST_CAPABILITIES. The caller registers it
 * with a literal container.register call so di-lint sees the registration. */
export function defaultRuntimeHostCapabilitiesProvider(): FactoryProvider<RuntimeHostCapabilities> {
  const capabilities: RuntimeHostCapabilities = { nativeCodex: false };
  return {
    useFactory: (scope) => {
      defaultCapabilityResolutions.add(scope);
      return capabilities;
    },
  };
}

/** Runtime-neutral chat core: bound together, once, by the host. */
const CORE_TOKENS = [
  ['SESSION_RUNTIME_IDENTITY_LOOKUP', SDK_TOKENS.SESSION_RUNTIME_IDENTITY_LOOKUP],
  ['RUNTIME_ADMISSION_PORT', SDK_TOKENS.RUNTIME_ADMISSION_PORT],
  ['RUNTIME_HOST_CAPABILITIES', SDK_TOKENS.RUNTIME_HOST_CAPABILITIES],
] as const;

/** Host ports of each native runtime; any one of them needs the core. */
const RUNTIME_PORT_TOKENS = [
  ['CODEX_CHAT_ADAPTER_PORTS', SDK_TOKENS.CODEX_CHAT_ADAPTER_PORTS],
  ['PROVIDER_SESSION_CHAT_PORTS', SDK_TOKENS.PROVIDER_SESSION_CHAT_PORTS],
] as const;

/** Adapters built from the ports; resolved only after the binding check. */
const ADAPTER_TOKENS = [
  SDK_TOKENS.CODEX_CHAT_ADAPTER,
  SDK_TOKENS.PROVIDER_SESSION_CHAT_ADAPTER,
] as const;

/** Name shown when no runtime's ports are bound beside a bound core. */
const ANY_RUNTIME_PORTS = RUNTIME_PORT_TOKENS.map(([name]) => name).join(' or ');

/**
 * Guard cached adapters against late activation, unstable host factories and
 * partial native composition. Rules: the core is all-or-nothing; any runtime's
 * ports require the core; a bound core requires at least one runtime's ports.
 */
export function guardRuntimeComposition(
  container: DependencyContainer,
): () => void {
  const tokens = [
    ...CORE_TOKENS.map(([, token]) => token),
    ...RUNTIME_PORT_TOKENS.map(([, token]) => token),
    ...ADAPTER_TOKENS,
  ];
  let snapshot: unknown[] | undefined;
  tokens.forEach((token, index) =>
    container.afterResolution(token, (_token, value) => {
      if (snapshot && value !== snapshot[index]) {
        throw new CodexRuntimeCompositionError(
          'unstable-binding',
          token.description,
        );
      }
    }),
  );
  return () => {
    defaultCapabilityResolutions.delete(container);
    const core = CORE_TOKENS.map(([, token]) =>
      container.resolve<unknown>(token),
    );
    const ports = RUNTIME_PORT_TOKENS.map(([, token]) =>
      container.resolve<unknown>(token),
    );
    const coreBound = core.map((value, index) =>
      CORE_TOKENS[index][1] === SDK_TOKENS.RUNTIME_HOST_CAPABILITIES
        ? value != null && !defaultCapabilityResolutions.has(container)
        : value != null,
    );
    const anyPorts = ports.some((value) => value != null);
    const anyCore = coreBound.some(Boolean);
    if ((anyCore || anyPorts) && !(coreBound.every(Boolean) && anyPorts)) {
      // Order: identity lookup, runtime ports, admission, capabilities.
      const missing = [
        ...(coreBound[0] ? [] : [CORE_TOKENS[0][0]]),
        ...(anyPorts ? [] : [ANY_RUNTIME_PORTS]),
        ...CORE_TOKENS.slice(1).flatMap(([name], index) =>
          coreBound[index + 1] ? [] : [name],
        ),
      ];
      throw new CodexRuntimeCompositionError(
        'partial-native-binding',
        missing.join(', '),
      );
    }
    const current = [
      ...core,
      ...ports,
      ...ADAPTER_TOKENS.map((token) => container.resolve<unknown>(token)),
    ];
    snapshot ??= current;
  };
}

import type { DependencyContainer } from 'tsyringe';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { PLATFORM_TOKENS } from '@ptah-extension/platform-core';
import { AUTH_PROVIDERS_TOKENS } from '@ptah-extension/auth-providers';
import {
  SDK_TOKENS,
  initializeSessionRuntimeIdentityLookup,
  type SessionMetadataStore,
} from '@ptah-extension/agent-sdk';
import {
  createChatRuntimeAdmission,
  type ChatRuntimeAdmissionDeps,
} from '@ptah-extension/rpc-handlers';
import type {
  ProviderSessionProfileId,
  RuntimeHostCapabilities,
} from '@ptah-extension/shared';
import type {
  ElectronCodexIdentityLookup,
  ElectronCodexRouting,
} from './codex-binding.types';

/** A runtime binding the finish step registers together with the core. */
export interface ElectronNativeRuntimeRegistration extends ElectronCodexRouting {
  register(): void;
}

/** The built provider-session binding and the profiles it admits. */
export interface ElectronProviderSessionRegistration {
  readonly profiles: readonly ProviderSessionProfileId[];
  register(): void;
}

/**
 * The runtime-neutral native chat core (A13): the identity lookup every
 * native runtime binding writes through. Created before any runtime binding,
 * registered by {@link finishElectronNativeChatCore} after all of them ran.
 */
export interface ElectronNativeChatCore {
  readonly lookup: ElectronCodexIdentityLookup;
}

export interface ElectronNativeChatCoreFinishInput {
  /** The built, not yet registered Codex binding; undefined when it failed. */
  readonly codex: ElectronNativeRuntimeRegistration | undefined;
  /** The built, not yet registered provider-session binding; undefined when it failed. */
  readonly providerSession: ElectronProviderSessionRegistration | undefined;
}

export class ElectronNativeChatCoreError extends Error {
  constructor(readonly code: 'already-finished' | 'late-registration') {
    super(
      code === 'already-finished'
        ? '[NativeChatCore] The native chat core is already finished.'
        : '[NativeChatCore] The native chat core must be registered before the routing adapter is resolved.',
    );
    this.name = 'ElectronNativeChatCoreError';
  }
}

interface CoreState {
  readonly container: DependencyContainer;
  /** Admission inputs other than capabilities, resolved at bind time so the
   * finish step cannot fail after a runtime binding registered its ports. */
  readonly admissionDeps: Omit<ChatRuntimeAdmissionDeps, 'hostCapabilities'>;
  finished: boolean;
  routingResolved: boolean;
}

const states = new WeakMap<ElectronNativeChatCore, CoreState>();

/** Create the identity lookup and resolve admission inputs; register nothing. */
export async function bindElectronNativeChatCore(
  container: DependencyContainer,
): Promise<ElectronNativeChatCore> {
  const admissionDeps: CoreState['admissionDeps'] = {
    resolver: container.resolve<ChatRuntimeAdmissionDeps['resolver']>(
      AUTH_PROVIDERS_TOKENS.SDK_WORKSPACE_PROVIDER_PROFILE_RESOLVER,
    ),
    workspaceProvider: container.resolve<
      ChatRuntimeAdmissionDeps['workspaceProvider']
    >(PLATFORM_TOKENS.WORKSPACE_PROVIDER),
    platformInfo: container.resolve<ChatRuntimeAdmissionDeps['platformInfo']>(
      PLATFORM_TOKENS.PLATFORM_INFO,
    ),
    webviewManager: container.resolve<
      ChatRuntimeAdmissionDeps['webviewManager']
    >(TOKENS.WEBVIEW_MANAGER),
  };
  const lookup = await initializeSessionRuntimeIdentityLookup(
    container.resolve<SessionMetadataStore>(
      SDK_TOKENS.SDK_SESSION_METADATA_STORE,
    ),
    container.resolve<Logger>(TOKENS.LOGGER),
  );
  const core: ElectronNativeChatCore = { lookup };
  const state: CoreState = {
    container,
    admissionDeps,
    finished: false,
    routingResolved: false,
  };
  container.afterResolution(
    SDK_TOKENS.ROUTING_AGENT_ADAPTER,
    () => {
      state.routingResolved = true;
    },
    { frequency: 'Once' },
  );
  states.set(core, state);
  return core;
}

/**
 * Register the Codex and provider-session ports and the core tokens in one
 * synchronous step, only
 * when at least one native runtime bound. Every refusal happens before any
 * registration, so a failure leaves the consistent Claude-only defaults and
 * disposes the lookup; the caller disposes the unregistered runtime bindings.
 * Must run before the first ROUTING_AGENT_ADAPTER resolution.
 * Returns the registered capabilities, or undefined when nothing bound.
 */
export function finishElectronNativeChatCore(
  core: ElectronNativeChatCore,
  input: ElectronNativeChatCoreFinishInput,
): RuntimeHostCapabilities | undefined {
  const state = states.get(core);
  if (!state || state.finished)
    throw new ElectronNativeChatCoreError('already-finished');
  state.finished = true;
  if (state.routingResolved) {
    // Nothing was registered: the lookup has no owner left.
    core.lookup.dispose();
    throw new ElectronNativeChatCoreError('late-registration');
  }
  // Only a built binding lists its profiles, and it registers its ports in
  // this same step, so no listed profile is ever left without ports.
  const providerSessions = [
    ...new Set(input.providerSession?.profiles ?? []),
  ];
  if (!input.codex && providerSessions.length === 0) {
    core.lookup.dispose();
    return undefined;
  }
  const codexBound = input.codex !== undefined;
  const capabilities: RuntimeHostCapabilities = Object.freeze({
    nativeCodex: codexBound,
    nativeCodexGateway:
      input.codex?.capabilities.nativeCodexGateway === true,
    ...(providerSessions.length > 0
      ? { providerSessions: Object.freeze(providerSessions) }
      : {}),
  });
  const admission = createChatRuntimeAdmission({
    ...state.admissionDeps,
    hostCapabilities: capabilities,
  });
  const { container } = state;
  input.codex?.register();
  if (providerSessions.length > 0) input.providerSession?.register();
  container.register(SDK_TOKENS.SESSION_RUNTIME_IDENTITY_LOOKUP, {
    useValue: core.lookup,
  });
  container.register(SDK_TOKENS.RUNTIME_HOST_CAPABILITIES, {
    useValue: capabilities,
  });
  container.register(SDK_TOKENS.RUNTIME_ADMISSION_PORT, {
    useValue: admission,
  });
  return capabilities;
}

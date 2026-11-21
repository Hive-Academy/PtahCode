/**
 * Electron provider-session chat composition (plan component 11, P8): binds
 * the host side of the provider-session main chat (Antigravity in P8) over
 * one `ProviderSessionPool` and the ACP provider-session runtime.
 *
 * Mirrors the Codex binding: everything is built first, without registering
 * anything; the native chat core finish calls `register` in the same
 * synchronous step as the core tokens, so a failure can never leave
 * provider-session ports without the core. A failure here is logged by the
 * caller and leaves `providerSessions: []`; Claude and Codex are unaffected.
 */
import type { DependencyContainer } from 'tsyringe';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import {
  PLATFORM_TOKENS,
  resolveAuthProviderKey,
  type IMcpCallerCredentials,
  type IProcessSpawner,
} from '@ptah-extension/platform-core';
import {
  providerReasoningEffortDef,
  providerSelectedModelDef,
} from '@ptah-extension/settings-core';
import {
  SDK_TOKENS,
  ProviderSessionChatAdapterError,
  type ProviderSessionChatAdapter,
  type ProviderSessionHistoryPort,
  type SessionApprovalRouter,
  type SessionMetadataStore,
  type NativeSessionControls,
} from '@ptah-extension/agent-sdk';
import { AUTH_PROVIDERS_TOKENS } from '@ptah-extension/auth-providers';
import {
  laneAcpBaseEnv,
  laneAcpCommandPreparer,
  type CliDetectionService,
} from '@ptah-extension/cli-agent-runtime';
import {
  ANTIGRAVITY_ACP_PTAH_MCP_TOOL_PREFIX,
  antigravityAcpProfile,
  createAcpProviderSessionRuntime,
  type AcpCommandPreparer,
  type AcpVendorProfile,
} from '@ptah-extension/acp-runtime';
import {
  CHAT_TOKENS,
  ProviderSessionPool,
  createProviderSessionAuthStatusProbe,
  createProviderSessionChatHostPorts,
  createProviderSessionHistoryPort,
  createProviderSessionNativeControls,
  createProviderSessionOpenRequests,
  resolveSavedCodexPermissionLevel,
  SESSION_DELETE_TOKENS,
  type NativeSessionControlsDeps,
  type ProviderSessionAuthLane,
  type ProviderSessionAuthProfile,
  type ProviderSessionChatHostPorts,
  type ProviderSessionChatHostPortsDeps,
  type ProviderSessionDeleteRelease,
  type ProviderSessionPidLedger,
  type ProviderSessionPoolRuntime,
  type SessionControlSettings,
} from '@ptah-extension/rpc-handlers';
import type {
  EffortLevel,
  ProviderInfo,
  ProviderSessionProfileId,
  RuntimeHostCapabilities,
  SessionId,
} from '@ptah-extension/shared';
import type { ElectronCodexIdentityLookup } from './codex-binding.types';
import type { ElectronNativeChatCore } from './native-chat-core-composition';
import { trackElectronProviderSessionBinding } from './provider-session-binding-registry';

/** The profiles this host admits (P8: Antigravity; Grok P10, OpenCode P11c). */
export const ELECTRON_PROVIDER_SESSION_PROFILES = [
  'antigravity',
] as const satisfies readonly ProviderSessionProfileId[];

/**
 * Per admitted profile: the ACP vendor profile, whether the agent advertises
 * `session/load` (agy does: `loadSession:true`, preflight PF-4), and the
 * prefix the agent puts on Ptah MCP tool names (agy: `mcp_ptah_lane_`).
 */
type AdmittedProfile = (typeof ELECTRON_PROVIDER_SESSION_PROFILES)[number];
const PROFILE_TABLE: Readonly<
  Record<
    AdmittedProfile,
    {
      readonly acp: AcpVendorProfile;
      readonly load: boolean;
      readonly ptahMcpToolPrefix: string;
    }
  >
> = {
  antigravity: {
    acp: antigravityAcpProfile,
    load: true,
    ptahMcpToolPrefix: ANTIGRAVITY_ACP_PTAH_MCP_TOOL_PREFIX,
  },
};

function isAdmittedProfile(profile: ProviderSessionProfileId): profile is AdmittedProfile {
  return (ELECTRON_PROVIDER_SESSION_PROFILES as readonly ProviderSessionProfileId[]).includes(
    profile,
  );
}

export interface ElectronProviderSessionBindingInput {
  /** WorkspaceScopeResolver.readForPath; values are unknown until validated. */
  readonly scopeResolver: {
    readForPath(
      globalKey: string,
      workspacePath: string,
      appScopable?: boolean,
    ): unknown;
  };
  readonly settingsStore: NativeSessionControlsDeps['store'];
  /** Persistent ledger the pool records its pids in (crash sweep). */
  readonly pidLedger: ProviderSessionPidLedger;
  /** Environment the agent starts from; defaults to the host env, cleaned. */
  readonly baseEnv?: () => Readonly<Record<string, string | undefined>>;
  /** Spawn command preparer; defaults to the lane one (Windows `.cmd` shims). */
  readonly prepareCommand?: AcpCommandPreparer;
}

/**
 * A built provider-session binding whose ports are not registered yet. The
 * native chat core finish registers it with the core.
 */
export interface ElectronProviderSessionPendingBinding {
  readonly profiles: readonly ProviderSessionProfileId[];
  /** Register the ports, controls, history, auth probe; call at most once. */
  register(): void;
  /** Close every agent process; safe before and after `register`. */
  dispose(): Promise<void>;
}

const PROVIDER_SESSION_INFO: ProviderInfo = {
  // The adapter label, like Codex's `codex-app-server`: never `ptah-cli`. The
  // session's provider (`antigravity-cli`) rides on its runtime identity.
  id: 'provider-session',
  name: 'Provider Session',
  vendor: 'Ptah',
  version: '1',
  description: 'Native provider-session chat runtime (ACP agents)',
  capabilities: {
    streaming: true,
    fileAttachments: false,
    contextManagement: true,
    sessionPersistence: true,
    multiTurn: true,
    codeGeneration: true,
    imageAnalysis: false,
    functionCalling: true,
  },
};

function effortOf(value: unknown): EffortLevel | undefined {
  if (value === undefined || value === '') return undefined;
  if (
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh' ||
    value === 'max'
  )
    return value;
  throw new ProviderSessionChatAdapterError('runtime-failed', 'settings');
}

/**
 * Effective settings of a provider session for the native controls: the
 * persisted binding's workspace and provider, then the saved model, effort and
 * permission under that provider's settings namespace.
 */
export function createProviderSessionControlSettings(
  lookup: Pick<ElectronCodexIdentityLookup, 'lookup'>,
  scopeResolver: ElectronProviderSessionBindingInput['scopeResolver'],
): (sessionId: SessionId) => SessionControlSettings {
  return (sessionId) => {
    const binding = lookup.lookup(sessionId);
    const identity = binding?.live ?? binding?.persisted;
    if (
      !identity ||
      identity.sessionId !== sessionId ||
      identity.runtime !== 'provider-session'
    )
      throw new ProviderSessionChatAdapterError('unavailable', 'settings');
    const workspacePath = binding?.workspacePath;
    if (!workspacePath)
      throw new ProviderSessionChatAdapterError('unavailable', 'settings');
    const authKey = resolveAuthProviderKey('thirdParty', identity.providerId);
    const read = (name: string) =>
      scopeResolver.readForPath(name, workspacePath, true);
    const modelDef = providerSelectedModelDef(authKey);
    const effortDef = providerReasoningEffortDef(authKey);
    const model = modelDef.schema.safeParse(
      read(modelDef.key) ?? modelDef.default,
    );
    const effort = effortDef.schema.safeParse(
      read(effortDef.key) ?? effortDef.default,
    );
    if (!model.success || !effort.success)
      throw new ProviderSessionChatAdapterError('runtime-failed', 'settings');
    const level = effortOf(effort.data);
    return {
      workspacePath,
      authKey,
      ...(model.data ? { model: model.data } : {}),
      ...(level ? { effort: level } : {}),
      permissionLevel: resolveSavedCodexPermissionLevel(read, () => {
        throw new ProviderSessionChatAdapterError('runtime-failed', 'settings');
      }),
    };
  };
}

type ContextDeps = Pick<
  ProviderSessionChatHostPortsDeps,
  'memory' | 'capabilityResolver' | 'harnessPolicySync'
>;

/**
 * The Ptah context a provider-session start carries (memory blocks, the
 * capability policy, the harness preflight), from the same services Claude
 * chat uses. Each is optional: a host without one starts without it. Memory
 * and the harness sync resolve on use, so binding does not build their graphs.
 */
export function createProviderSessionContextDeps(
  container: DependencyContainer,
): ContextDeps {
  const has = (token: symbol) => container.isRegistered(token, true);
  const deps: { -readonly [K in keyof ContextDeps]: ContextDeps[K] } = {};
  if (has(SDK_TOKENS.SDK_MEMORY_PROMPT_INJECTOR)) {
    const memory = () =>
      container.resolve<NonNullable<ContextDeps['memory']>>(
        SDK_TOKENS.SDK_MEMORY_PROMPT_INJECTOR,
      );
    deps.memory = {
      buildSessionStartBlock: (...args) => memory().buildSessionStartBlock(...args),
      buildBlock: (...args) => memory().buildBlock(...args),
    };
  }
  if (has(SDK_TOKENS.SDK_CAPABILITY_RESOLVER)) {
    deps.capabilityResolver = container.resolve<
      NonNullable<ContextDeps['capabilityResolver']>
    >(SDK_TOKENS.SDK_CAPABILITY_RESOLVER);
  }
  if (has(SDK_TOKENS.SDK_HARNESS_POLICY_SYNC)) {
    deps.harnessPolicySync = {
      apply: (...args) =>
        container
          .resolve<NonNullable<ContextDeps['harnessPolicySync']>>(
            SDK_TOKENS.SDK_HARNESS_POLICY_SYNC,
          )
          .apply(...args),
    };
  }
  return deps;
}

/** The lane adapter surface of one profile, read on every probe. */
function authLane(
  cliDetection: Pick<CliDetectionService, 'getAdapter'>,
  profile: ProviderSessionProfileId,
): ProviderSessionAuthLane {
  const adapter = () => cliDetection.getAdapter(profile);
  return {
    detect: async () => {
      const lane = adapter();
      return lane ? lane.detect() : { installed: false };
    },
    // Read on every probe (never captured at bind time): the Antigravity
    // adapter answers from agy's keyring entry, model-free; a lane without a
    // reader counts an installed CLI as signed in, and a missing sign-in then
    // surfaces as `auth-required` on open.
    ensureTokensFresh: async () => {
      const lane = adapter();
      return lane?.ensureTokensFresh
        ? (await lane.ensureTokensFresh()) === true
        : true;
    },
  };
}

/**
 * Build the provider-session binding. Registers nothing: the core finish
 * calls `register`. The identity lookup belongs to the core; this binding
 * never disposes it.
 */
export function bindElectronProviderSessionChat(
  container: DependencyContainer,
  core: Pick<ElectronNativeChatCore, 'lookup'>,
  input: ElectronProviderSessionBindingInput,
): ElectronProviderSessionPendingBinding {
  const logger = container.resolve<Logger>(TOKENS.LOGGER);
  const profiles: readonly AdmittedProfile[] = ELECTRON_PROVIDER_SESSION_PROFILES;
  const spawner = container.resolve<IProcessSpawner>(
    SDK_TOKENS.SDK_PROCESS_SPAWNER,
  );
  const cliDetection = container.resolve<
    Pick<CliDetectionService, 'getDetection' | 'getAdapter'>
  >(TOKENS.CLI_DETECTION_SERVICE);
  const metadataStore = container.resolve<SessionMetadataStore>(
    SDK_TOKENS.SDK_SESSION_METADATA_STORE,
  );
  const runtime = createAcpProviderSessionRuntime({
    spawner,
    logger,
    profiles: profiles.map((profile) => PROFILE_TABLE[profile].acp),
    // Same spawn policy as the Antigravity lane: a Windows `.cmd` shim is
    // resolved to its target, then the command-line length is checked.
    prepareCommand: input.prepareCommand ?? laneAcpCommandPreparer,
  });
  const runtimes = new Map<ProviderSessionProfileId, ProviderSessionPoolRuntime>(
    profiles.map((profile) => [
      profile,
      { runtime, load: PROFILE_TABLE[profile].load },
    ]),
  );
  const credentials = container.isRegistered(
    PLATFORM_TOKENS.MCP_CALLER_CREDENTIALS,
    true,
  )
    ? container.resolve<IMcpCallerCredentials>(
        PLATFORM_TOKENS.MCP_CALLER_CREDENTIALS,
      )
    : undefined;
  const pool = new ProviderSessionPool({
    runtimeFor: (profile) => runtimes.get(profile),
    ...(credentials ? { credentials } : {}),
    pidLedger: input.pidLedger,
    logger,
  });
  const openRequests = createProviderSessionOpenRequests({
    cliDetection,
    readSavedPermissionLevel: (workspacePath) =>
      resolveSavedCodexPermissionLevel(
        (name) => input.scopeResolver.readForPath(name, workspacePath, true),
        () => {
          throw new ProviderSessionChatAdapterError('runtime-failed', 'permission');
        },
      ),
    mcpServerRunning: () =>
      container
        .resolve<{ isMcpServerRunning(): boolean }>(CHAT_TOKENS.SDK_CONTEXT)
        .isMcpServerRunning(),
    baseEnv: input.baseEnv ?? laneAcpBaseEnv,
    ptahMcpToolPrefix: (profile) =>
      isAdmittedProfile(profile) ? PROFILE_TABLE[profile].ptahMcpToolPrefix : undefined,
    logger,
  });
  // The resolver admits a provider session only on a host that lists its
  // profile; this service serves provider sessions alone.
  const hostCapabilities: RuntimeHostCapabilities = Object.freeze({
    nativeCodex: false,
    nativeCodexGateway: false,
    providerSessions: Object.freeze([...profiles]),
  });
  const broadcaster: ProviderSessionChatHostPortsDeps['broadcaster'] = {
    streamEventsToWebview: (...args) =>
      container
        .resolve<ProviderSessionChatHostPortsDeps['broadcaster']>(
          CHAT_TOKENS.STREAM_BROADCASTER,
        )
        .streamEventsToWebview(...args),
  };
  const ports: ProviderSessionChatHostPorts = createProviderSessionChatHostPorts({
    resolver: container.resolve<ProviderSessionChatHostPortsDeps['resolver']>(
      AUTH_PROVIDERS_TOKENS.SDK_WORKSPACE_PROVIDER_PROFILE_RESOLVER,
    ),
    workspaceProvider: container.resolve<
      ProviderSessionChatHostPortsDeps['workspaceProvider']
    >(PLATFORM_TOKENS.WORKSPACE_PROVIDER),
    platformInfo: container.resolve<ProviderSessionChatHostPortsDeps['platformInfo']>(
      PLATFORM_TOKENS.PLATFORM_INFO,
    ),
    hostCapabilities,
    webviewManager: container.resolve<
      ProviderSessionChatHostPortsDeps['webviewManager']
    >(TOKENS.WEBVIEW_MANAGER),
    logger,
    info: PROVIDER_SESSION_INFO,
    pool,
    openRequests,
    metadata: metadataStore,
    approvals: {
      respond: (...args) =>
        container
          .resolve<SessionApprovalRouter>(SDK_TOKENS.SESSION_APPROVAL_ROUTER)
          .respond(...args),
    },
    broadcaster,
    hostAttention: container.resolve<
      NonNullable<ProviderSessionChatHostPortsDeps['hostAttention']>
    >(SDK_TOKENS.HOST_ATTENTION_COORDINATOR),
    ...createProviderSessionContextDeps(container),
  });
  const historyPort: ProviderSessionHistoryPort =
    createProviderSessionHistoryPort({
      metadata: metadataStore,
      pool,
      openRequests,
    });
  const adapter = () =>
    container.resolve<ProviderSessionChatAdapter | null>(
      SDK_TOKENS.PROVIDER_SESSION_CHAT_ADAPTER,
    );
  const liveAdapter = (): ProviderSessionChatAdapter => {
    const resolved = adapter();
    if (!resolved)
      throw new ProviderSessionChatAdapterError('unavailable', 'controls');
    return resolved;
  };
  const controls: NativeSessionControls = createProviderSessionNativeControls({
    store: input.settingsStore,
    settings: createProviderSessionControlSettings(
      core.lookup,
      input.scopeResolver,
    ),
    broadcaster,
    tabId: (id) => ports.tabId(id),
    adapter: {
      setSessionModel: (...args) => liveAdapter().setSessionModel(...args),
      setSessionEffort: (...args) => liveAdapter().setSessionEffort(...args),
      setSessionPermissionLevel: (...args) =>
        liveAdapter().setSessionPermissionLevel(...args),
      // A provider session has one interrupt; the stop cause is not forwarded.
      interruptCurrentTurn: (id) => liveAdapter().interruptCurrentTurn(id),
      executeSlashCommand: (...args) =>
        liveAdapter().executeSlashCommand(...args),
      getSessionToken: (...args) => liveAdapter().getSessionToken(...args),
      canSendFollowUp: (id) => liveAdapter().canSendFollowUp(id),
    },
  });
  const deleteRelease: ProviderSessionDeleteRelease = {
    async release(sessionId) {
      // The adapter's own close also gives the session back to the pool and
      // clears the host routing; the pool release covers an entry only a
      // history read opened (no adapter record).
      const owner = adapter();
      if (owner?.owns(sessionId)) await owner.closeSession(sessionId);
      await pool.release(sessionId, 'deleted');
    },
  };
  const authStatus = createProviderSessionAuthStatusProbe({
    profiles: profiles.map(
      (profile): ProviderSessionAuthProfile => ({
        profile,
        lane: authLane(cliDetection, profile),
        signInHint: PROFILE_TABLE[profile].acp.signInHint,
      }),
    ),
    logger,
  });

  let registered = false;
  let untrack: (() => void) | undefined;
  let disposed: Promise<void> | undefined;
  const dispose = (): Promise<void> => {
    disposed ??= pool.dispose().finally(() => untrack?.());
    return disposed;
  };
  return {
    profiles,
    register() {
      if (registered)
        throw new Error('Provider-session chat binding is already registered');
      registered = true;
      container.register(SDK_TOKENS.PROVIDER_SESSION_CHAT_PORTS, {
        useValue: ports,
      });
      container.register(SDK_TOKENS.PROVIDER_SESSION_HISTORY_PORT, {
        useValue: historyPort,
      });
      container.register(SDK_TOKENS.PROVIDER_SESSION_CONTROLS, {
        useValue: controls,
      });
      // Read once by AuthRpcHandlers' constructor, which resolves later
      // (wireRuntime), after this bootstrap step.
      container.register(CHAT_TOKENS.PROVIDER_SESSION_AUTH_STATUS, {
        useValue: authStatus,
      });
      container.register(SESSION_DELETE_TOKENS.PROVIDER_SESSION_RELEASE, {
        useValue: deleteRelease,
      });
      untrack = trackElectronProviderSessionBinding({ dispose });
    },
    dispose,
  };
}

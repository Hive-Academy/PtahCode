import {
  getProviderSessionProfile,
  type AgentModelInfo,
  type IAgentAdapter,
  type PermissionLevel,
  type RuntimeHostCapabilities,
  type SessionId,
} from '@ptah-extension/shared';
import {
  resolveSessionRuntimeIdentity,
  type SessionRuntimeIdentityLookup,
} from './session-runtime-identity';

/**
 * A provider-session chat whose adapter is not bound, or whose profile this
 * host does not list, is refused instead of being served on the Claude SDK.
 */
export const PROVIDER_SESSION_CHAT_UNAVAILABLE_MESSAGE =
  'Provider-session chat is not available on this host.';

export class ChatRuntimeAdmissionError extends Error {
  readonly code = 'runtime-admission-mismatch';

  constructor(
    message = 'Prepared chat runtime disagrees with runtime admission.',
  ) {
    super(message);
    this.name = 'ChatRuntimeAdmissionError';
  }
}

export interface RuntimeAdmissionPort {
  servingProviderId(
    config: Parameters<IAgentAdapter['startChatSession']>[0],
  ): Promise<string | undefined>;
}

export interface NativeChatAdapter extends IAgentAdapter {
  /** Includes open sessions and in-progress opens keyed by their tab id. */
  owns(sessionId: SessionId): boolean;
  /** Resolves a live native thread; returns undefined for an opening tab. */
  resolveLiveSessionId?(callerId: string): SessionId | undefined;
  /** Reads the effective level for a resolved session ID. */
  getPermissionLevel?(sessionId: string): PermissionLevel | undefined;
  listSessionModels(sessionId: SessionId): Promise<readonly AgentModelInfo[]>;
}

const CODEX_UNAVAILABLE_MESSAGE =
  'Codex chat requires a host with the native Codex runtime.';

type AdmittedRuntime = 'claude-sdk' | 'codex-app-server' | 'provider-session';

/** Capability is supplied by composition from the parity gate / DS1 override.
 * It is an admission hint only: CodexChatAdapter still uses the gated resolver.
 * `native` is the Codex adapter. Either native adapter is null when its
 * runtime is not bound on this host.
 */
export class RoutingAgentAdapter implements IAgentAdapter {
  constructor(
    private readonly identities: SessionRuntimeIdentityLookup,
    private readonly legacy: IAgentAdapter,
    private readonly native: NativeChatAdapter | null,
    private readonly admission: RuntimeAdmissionPort,
    private readonly capabilities: RuntimeHostCapabilities = {
      nativeCodex: false,
    },
    private readonly providerSessions: NativeChatAdapter | null = null,
  ) {}

  get providerId() {
    return this.legacy.providerId;
  }
  get info() {
    return this.legacy.info;
  }
  initialize(): Promise<boolean> {
    return this.legacy.initialize();
  }
  dispose(): void {
    try {
      this.native?.dispose();
    } finally {
      try {
        this.providerSessions?.dispose();
      } finally {
        this.legacy.dispose();
      }
    }
  }
  preloadSdk(): Promise<void> {
    return this.legacy.preloadSdk();
  }
  getCliJsPath(): string | null {
    return this.legacy.getCliJsPath();
  }
  verifyInstallation(): Promise<boolean> {
    return this.legacy.verifyInstallation();
  }
  getHealth(): ReturnType<IAgentAdapter['getHealth']> {
    return this.legacy.getHealth();
  }
  async reset(): Promise<void> {
    await Promise.all([
      this.legacy.reset(),
      this.native?.reset(),
      this.providerSessions?.reset(),
    ]);
  }
  getSupportedModels(): ReturnType<IAgentAdapter['getSupportedModels']> {
    return this.legacy.getSupportedModels();
  }
  getDefaultModel(): Promise<string> {
    return this.legacy.getDefaultModel();
  }
  getApiModels(): ReturnType<IAgentAdapter['getApiModels']> {
    return this.legacy.getApiModels();
  }
  async startChatSession(
    ...args: Parameters<IAgentAdapter['startChatSession']>
  ): ReturnType<IAgentAdapter['startChatSession']> {
    const config = args[0];
    const preparedRuntime = config.runtime;
    const nativeEnabled =
      config.consumer === 'gateway'
        ? this.capabilities.nativeCodexGateway === true
        : this.capabilities.nativeCodex === true;
    if (preparedRuntime) {
      if (
        preparedRuntime === 'codex-app-server' &&
        (!nativeEnabled || !this.native || !this.admission)
      ) {
        throw new ChatRuntimeAdmissionError(CODEX_UNAVAILABLE_MESSAGE);
      }
      // Mirrors the Codex `nativeEnabled` gate: refused before admission
      // resolves, so an unresolved serving provider cannot bypass A9 or the
      // host's profile listing.
      if (
        preparedRuntime === 'provider-session' &&
        (!this.providerSessions ||
          config.consumer === 'gateway' ||
          !this.capabilities.providerSessions?.length)
      ) {
        throw new ChatRuntimeAdmissionError(
          PROVIDER_SESSION_CHAT_UNAVAILABLE_MESSAGE,
        );
      }
      if (!this.admission) {
        throw new ChatRuntimeAdmissionError(
          'Chat runtime admission is unavailable.',
        );
      }
      const provider = await this.admission.servingProviderId(config);
      const admittedRuntime = this.admit(provider, config, nativeEnabled);
      if (provider !== undefined && preparedRuntime !== admittedRuntime) {
        throw new ChatRuntimeAdmissionError();
      }
      return this.startAdapter(preparedRuntime).startChatSession(...args);
    }
    // Admission lookup failures propagate: a failed workspace lookup is not consent to switch runtimes.
    if (!this.admission) {
      throw new ChatRuntimeAdmissionError(
        'Chat runtime admission is unavailable.',
      );
    }
    const provider = await this.admission.servingProviderId(config);
    return this.startAdapter(
      this.admit(provider, config, nativeEnabled),
    ).startChatSession(...args);
  }
  resumeSession(
    ...args: Parameters<IAgentAdapter['resumeSession']>
  ): ReturnType<IAgentAdapter['resumeSession']> {
    return this.adapter(args[0], true).resumeSession(...args);
  }
  endSession(...args: Parameters<IAgentAdapter['endSession']>): void {
    this.adapter(args[0]).endSession(...args);
  }
  sendMessageToSession(
    ...args: Parameters<IAgentAdapter['sendMessageToSession']>
  ): ReturnType<IAgentAdapter['sendMessageToSession']> {
    return this.adapter(args[0], true).sendMessageToSession(...args);
  }
  claimHeldPeerMessages(
    sessionId: SessionId,
  ): ReturnType<IAgentAdapter['claimHeldPeerMessages']> {
    return this.adapter(sessionId).claimHeldPeerMessages(sessionId);
  }
  onQueuedFollowUpState(
    listener: Parameters<
      NonNullable<IAgentAdapter['onQueuedFollowUpState']>
    >[0],
  ): () => void {
    const unsubscribeLegacy = this.legacy.onQueuedFollowUpState?.(listener);
    const unsubscribeNative = this.native?.onQueuedFollowUpState?.(listener);
    const unsubscribeProviderSessions =
      this.providerSessions?.onQueuedFollowUpState?.(listener);
    return () => {
      unsubscribeLegacy?.();
      unsubscribeNative?.();
      unsubscribeProviderSessions?.();
    };
  }
  withdrawQueuedFollowUp(
    sessionId: SessionId,
    clientMessageId: string,
  ): Promise<boolean> {
    return (
      this.adapter(sessionId).withdrawQueuedFollowUp?.(
        sessionId,
        clientMessageId,
      ) ?? Promise.resolve(false)
    );
  }
  listQueuedFollowUps(
    sessionId: SessionId,
  ): ReturnType<NonNullable<IAgentAdapter['listQueuedFollowUps']>> {
    return this.adapter(sessionId).listQueuedFollowUps?.(sessionId) ?? [];
  }
  steerQueuedFollowUp(
    sessionId: SessionId,
    clientMessageId: string,
  ): ReturnType<NonNullable<IAgentAdapter['steerQueuedFollowUp']>> {
    return (
      this.adapter(sessionId).steerQueuedFollowUp?.(
        sessionId,
        clientMessageId,
      ) ?? Promise.resolve({ ok: false, code: 'UNSUPPORTED' })
    );
  }
  isSessionActive(
    ...args: Parameters<IAgentAdapter['isSessionActive']>
  ): boolean {
    return this.adapter(args[0]).isSessionActive(...args);
  }
  /** Confirms a published native thread id, excluding opening tab ids. */
  resolveLiveSessionId(callerId: string): SessionId | undefined {
    for (const native of [this.native, this.providerSessions]) {
      const resolved = native?.resolveLiveSessionId?.(callerId);
      if (resolved === callerId) return resolved;
    }
    return undefined;
  }
  /** Reads the effective level for a resolved session ID. */
  getPermissionLevel(sessionId: string): PermissionLevel | undefined {
    return (
      this.native?.getPermissionLevel?.(sessionId) ??
      this.providerSessions?.getPermissionLevel?.(sessionId)
    );
  }
  getSessionToken(
    ...args: Parameters<IAgentAdapter['getSessionToken']>
  ): string | null {
    return this.adapter(args[0]).getSessionToken(...args);
  }
  endSessionIfTokenMatches(
    ...args: Parameters<IAgentAdapter['endSessionIfTokenMatches']>
  ): ReturnType<IAgentAdapter['endSessionIfTokenMatches']> {
    return this.adapter(args[0]).endSessionIfTokenMatches(...args);
  }
  executeSlashCommand(
    ...args: Parameters<IAgentAdapter['executeSlashCommand']>
  ): ReturnType<IAgentAdapter['executeSlashCommand']> {
    return this.adapter(args[0], true).executeSlashCommand(...args);
  }
  interruptCurrentTurn(
    ...args: Parameters<IAgentAdapter['interruptCurrentTurn']>
  ): Promise<boolean> {
    return this.adapter(args[0]).interruptCurrentTurn(...args);
  }
  interruptSession(
    ...args: Parameters<IAgentAdapter['interruptSession']>
  ): Promise<void> {
    return this.adapter(args[0]).interruptSession(...args);
  }
  setSessionPermissionLevel(
    ...args: Parameters<IAgentAdapter['setSessionPermissionLevel']>
  ): Promise<void> {
    return this.adapter(args[0], true).setSessionPermissionLevel(...args);
  }
  setSessionModel(
    ...args: Parameters<IAgentAdapter['setSessionModel']>
  ): Promise<void> {
    return this.adapter(args[0], true).setSessionModel(...args);
  }
  setSessionEffort(
    ...args: Parameters<IAgentAdapter['setSessionEffort']>
  ): Promise<void> {
    return this.adapter(args[0], true).setSessionEffort(...args);
  }
  setSessionIdResolvedCallback(
    ...args: Parameters<IAgentAdapter['setSessionIdResolvedCallback']>
  ): void {
    this.legacy.setSessionIdResolvedCallback(...args);
    this.native?.setSessionIdResolvedCallback(...args);
    this.providerSessions?.setSessionIdResolvedCallback(...args);
  }
  setResultStatsCallback(
    ...args: Parameters<IAgentAdapter['setResultStatsCallback']>
  ): void {
    this.legacy.setResultStatsCallback(...args);
    this.native?.setResultStatsCallback(...args);
    this.providerSessions?.setResultStatsCallback(...args);
  }
  setCompactionStartCallback(
    ...args: Parameters<IAgentAdapter['setCompactionStartCallback']>
  ): void {
    this.legacy.setCompactionStartCallback(...args);
  }
  setAgentNoticeCallback(
    ...args: Parameters<NonNullable<IAgentAdapter['setAgentNoticeCallback']>>
  ): void {
    this.legacy.setAgentNoticeCallback?.(...args);
  }
  // Legacy-only event shapes have no native source. Native file/image/usage
  // observations are delivered by CodexChatAdapterPorts.callbacks instead.
  setLiveStatsCallback(
    ...args: Parameters<IAgentAdapter['setLiveStatsCallback']>
  ): void {
    this.legacy.setLiveStatsCallback(...args);
  }
  setWorktreeCreatedCallback(
    ...args: Parameters<IAgentAdapter['setWorktreeCreatedCallback']>
  ): void {
    this.legacy.setWorktreeCreatedCallback(...args);
  }
  setWorktreeRemovedCallback(
    ...args: Parameters<IAgentAdapter['setWorktreeRemovedCallback']>
  ): void {
    this.legacy.setWorktreeRemovedCallback(...args);
  }

  listSessionModels(sessionId: SessionId): Promise<readonly AgentModelInfo[]> {
    const adapter = this.adapter(sessionId);
    if (this.native && adapter === this.native)
      return this.native.listSessionModels(sessionId);
    if (this.providerSessions && adapter === this.providerSessions)
      return this.providerSessions.listSessionModels(sessionId);
    return this.legacy.getSupportedModels();
  }

  /**
   * Runtime the serving provider is admitted to on this host. Refuses a
   * native provider whose runtime is not bound or not enabled here.
   */
  private admit(
    provider: string | undefined,
    config: Parameters<IAgentAdapter['startChatSession']>[0],
    nativeEnabled: boolean,
  ): AdmittedRuntime {
    if (provider === undefined) return 'claude-sdk';
    const profile = getProviderSessionProfile(provider);
    if (profile !== undefined) {
      // A9: messaging-gateway turns never run on a provider session.
      if (
        config.consumer === 'gateway' ||
        !this.providerSessions ||
        !this.capabilities.providerSessions?.includes(profile)
      ) {
        throw new ChatRuntimeAdmissionError(
          PROVIDER_SESSION_CHAT_UNAVAILABLE_MESSAGE,
        );
      }
      return 'provider-session';
    }
    if (provider === 'openai-codex') {
      if (!nativeEnabled || !this.native)
        throw new ChatRuntimeAdmissionError(CODEX_UNAVAILABLE_MESSAGE);
      return 'codex-app-server';
    }
    return 'claude-sdk';
  }

  private startAdapter(runtime: AdmittedRuntime): IAgentAdapter {
    switch (runtime) {
      case 'codex-app-server':
        if (!this.native)
          throw new ChatRuntimeAdmissionError(CODEX_UNAVAILABLE_MESSAGE);
        return this.native;
      case 'provider-session':
        if (!this.providerSessions)
          throw new ChatRuntimeAdmissionError(
            PROVIDER_SESSION_CHAT_UNAVAILABLE_MESSAGE,
          );
        return this.providerSessions;
      case 'claude-sdk':
        return this.legacy;
      default: {
        const unsupported: never = runtime;
        throw new Error(`Unsupported session runtime: ${unsupported}`);
      }
    }
  }

  private adapter(id: SessionId, startsOrChangesChat = false): IAgentAdapter {
    if (this.native?.owns(id)) return this.native;
    if (this.providerSessions?.owns(id)) return this.providerSessions;
    const identity = resolveSessionRuntimeIdentity(this.identities, id);
    if (
      startsOrChangesChat &&
      identity?.providerId === 'openai-codex' &&
      identity.runtime !== 'codex-app-server'
    ) {
      throw new ChatRuntimeAdmissionError(CODEX_UNAVAILABLE_MESSAGE);
    }
    if (!identity) return this.legacy;
    switch (identity.runtime) {
      case 'codex-app-server':
        if (!this.native)
          throw new ChatRuntimeAdmissionError(CODEX_UNAVAILABLE_MESSAGE);
        return this.native;
      case 'claude-sdk':
        return this.legacy;
      case 'provider-session':
        // A start or change also needs this host to list the stored profile.
        if (
          !this.providerSessions ||
          (startsOrChangesChat &&
            !this.capabilities.providerSessions?.includes(
              identity.providerSession.profile,
            ))
        ) {
          throw new ChatRuntimeAdmissionError(
            PROVIDER_SESSION_CHAT_UNAVAILABLE_MESSAGE,
          );
        }
        return this.providerSessions;
      default: {
        const unsupported: never = identity;
        throw new Error(`Unsupported session runtime: ${String(unsupported)}`);
      }
    }
  }
}

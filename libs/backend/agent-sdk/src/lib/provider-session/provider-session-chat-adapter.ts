import { randomUUID } from 'node:crypto';
import { realpath as fsRealpath } from 'node:fs/promises';
import { z } from 'zod';
import type { Logger } from '@ptah-extension/vscode-core';
import type { ProviderSession } from '@ptah-extension/provider-session-contracts';
import {
  MAX_IMAGE_SIZE_BYTES,
  SessionId,
  type AgentModelInfo,
  type AgentSessionResumeConfig,
  type AgentSessionStartConfig,
  type FlatStreamEventUnion,
  type IAgentAdapter,
  type QueuedFollowUpSnapshot,
  type QueuedFollowUpStateChange,
  type ResultStatsCallback,
  type SessionEndCause,
  type SteerQueuedFollowUpResult,
} from '@ptah-extension/shared';
import type { NativeChatAdapter } from '../codex-app-server/routing-agent-adapter';
import type { SessionApprovalRouter } from '../codex-app-server/session-approval-router';
import type { SessionTurnStateRegistry } from '../helpers/session-turn-state.registry';
import type { SessionIdResolvedCallbackRegistry } from '../helpers/session-id-resolved-callback-registry';
import { SessionAdmissionRefusedError } from '../errors/session-admission-refused.error';
import { ProviderSessionChatAdapterError } from './provider-session-chat-adapter-error';
import { toProviderSessionChatAdapterError } from './provider-session-error-mapping';
import type {
  ProviderSessionChatPorts,
  ProviderSessionChatPrepared,
  ProviderSessionReleaseReason,
} from './provider-session-chat-ports';
import {
  ProviderSessionSessionControls,
  type ProviderSessionOpening,
} from './provider-session-session-controls';
import { ProviderSessionFollowUpQueue } from './provider-session-follow-up-queue';
import {
  createProviderSessionChatSession,
  providerSessionBinding,
} from './provider-session-chat-session';
import {
  brokenSessionNotice,
  createProviderSessionUsageLedger,
  publishProviderSessionTurn,
  streamProviderSessionTurn,
  type ProviderSessionChatSession as Session,
  type ProviderSessionTurnDependencies,
  type ProviderSessionTurnInput,
  type ProviderSessionTurnOptions,
} from './provider-session-turn-stream';
import type { ProviderSessionRealpath } from './provider-session-turn-files';
import {
  createPricingGate,
  createProviderSessionUsagePersistence,
  type ProviderSessionUsagePersistence,
} from './provider-session-usage-capture';
import type { SessionUsageSink } from '../session-stats/session-usage-sink';
import type { IPricingProvider } from '../pricing.port';

/** Host ports plus what agent-sdk composition adds (logger, approval router). */
export interface ProviderSessionChatAdapterDependencies extends ProviderSessionChatPorts {
  readonly logger: Logger;
  readonly approvals: Pick<SessionApprovalRouter, 'register' | 'cancelPrompt'>;
  /** Canonicalises a turn's file references; `fs.promises.realpath` when absent. */
  readonly realpath?: ProviderSessionRealpath;
  /** Durable usage ledger (`SESSION_USAGE_SINK`); absent: usage stays in memory. */
  readonly usageSink?: SessionUsageSink | null;
  /** Runtime price catalog; the first priced turn waits (bounded) for it. */
  readonly pricing?: Pick<IPricingProvider, 'ensureHydrated'> | null;
}

const clientMessageIdSchema = z.string().min(1).optional();
const peerOriginSchema = z
  .object({
    kind: z.literal('peer'),
    from: z.string().min(1),
    name: z.string().optional(),
  })
  .passthrough();

/**
 * Main-chat `NativeChatAdapter` for every provider session (Antigravity,
 * Grok, OpenCode). Thin consumer of the neutral `ProviderSession` contract:
 * the host pool owns processes, this adapter owns chat sessions, turns,
 * queued follow-ups and approvals. A session outlives a broken process: the
 * next send re-acquires and attaches to the same native session.
 */
export class ProviderSessionChatAdapter implements NativeChatAdapter {
  private readonly sessions = new Map<SessionId, Session>();
  private readonly opening = new Map<string, ProviderSessionOpening>();
  private readonly followUps: ProviderSessionFollowUpQueue;
  private readonly controls: ProviderSessionSessionControls;
  private readonly turnDeps: ProviderSessionTurnDependencies;
  private readonly usage: ProviderSessionUsagePersistence;
  private disposed = false;
  private generation = 0;
  private resolved?: Parameters<
    IAgentAdapter['setSessionIdResolvedCallback']
  >[0];
  private stats?: ResultStatsCallback;

  constructor(
    private readonly ports: ProviderSessionChatAdapterDependencies,
    turnState: Pick<
      SessionTurnStateRegistry,
      'markGenerating' | 'settleTurn' | 'recordFailure' | 'forceIdle'
    >,
    private readonly sessionIdResolvedRegistry?: Pick<
      SessionIdResolvedCallbackRegistry,
      'notifyAll'
    >,
  ) {
    this.controls = new ProviderSessionSessionControls({
      sessions: this.sessions,
      opening: this.opening,
      ports: this.ports,
      logger: this.ports.logger,
      session: (id) => this.session(id),
      current: (session) => this.current(session),
      failure: (error, operation) => this.failure(error, operation),
      rejectQueued: (session) => this.followUps.rejectAll(session),
    });
    const realpath =
      this.ports.realpath ?? ((path: string) => fsRealpath(path));
    this.usage = createProviderSessionUsagePersistence(
      ports.usageSink,
      ports.logger,
    );
    // Started now so the catalog wait overlaps the first turn, not its end.
    const pricingReady = createPricingGate(ports.pricing, ports.logger);
    void pricingReady();
    this.followUps = new ProviderSessionFollowUpQueue({
      logger: this.ports.logger,
      realpath,
      publish: (session, input, options) =>
        this.publishTurn(session, input, options),
      failure: (error, operation) => this.failure(error, operation),
      drainIfIdle: (session) => this.drain(session),
    });
    this.turnDeps = {
      turnState,
      logger: this.ports.logger,
      realpath,
      live: (session, refreshInheritedPermission) =>
        this.live(session, refreshInheritedPermission),
      stats: (payload) => this.stats?.(payload),
      usage: this.usage,
      pricingReady,
      failure: (error, operation) => this.failure(error, operation),
      broken: (session) => this.broken(session),
      onIdle: (session) => this.drain(session),
    };
  }

  get providerId() {
    return this.ports.info.id;
  }
  get info() {
    return this.ports.info;
  }
  async preloadSdk(): Promise<void> {
    /* No SDK modules belong to this consumer. */
  }
  getCliJsPath(): null {
    return null;
  }
  async initialize(): Promise<boolean> {
    return !this.disposed;
  }
  async verifyInstallation(): Promise<boolean> {
    return this.unsupported('verifyInstallation');
  }
  getHealth(): ReturnType<IAgentAdapter['getHealth']> {
    return {
      status: this.disposed ? 'disabled' : 'available',
      lastCheck: Date.now(),
    };
  }
  async getSupportedModels(): ReturnType<IAgentAdapter['getSupportedModels']> {
    return this.unsupported('getSupportedModels');
  }
  async getDefaultModel(): Promise<string> {
    return this.unsupported('getDefaultModel');
  }
  async getApiModels(): ReturnType<IAgentAdapter['getApiModels']> {
    return this.unsupported('getApiModels');
  }

  async reset(): Promise<void> {
    this.disposed = true;
    const generation = ++this.generation;
    this.cancelOpenings();
    // A failed release was logged by close(); reset still completes.
    await Promise.allSettled(
      [...this.sessions.values()].map((session) =>
        this.controls.close(session, 'reset'),
      ),
    );
    if (this.generation === generation) this.disposed = false;
  }
  dispose(): void {
    this.generation++;
    this.disposed = true;
    this.cancelOpenings();
    for (const session of this.sessions.values()) {
      session.abort.abort();
      session.approvals.dispose();
      this.followUps.rejectAll(session);
      session.live = undefined;
    }
    this.sessions.clear();
    void this.ports.releaseAll().catch((error: unknown) => {
      this.failure(error, 'releaseAll');
    });
  }

  /** Trusted live level for a provider-session chat, including runtime changes. */
  getPermissionLevel(
    sessionId: string,
  ): 'ask' | 'auto-edit' | 'yolo' | 'plan' | undefined {
    if (!SessionId.validate(sessionId)) return undefined;
    const session = this.sessions.get(sessionId);
    return (
      session?.settings.permission ??
      session?.inheritedPermission ??
      session?.live?.getPermission?.()
    );
  }

  /** Live chat session id for a Ptah MCP caller id (tab id or session id). */
  resolveLiveSessionId(callerId: string): SessionId | undefined {
    if (callerId.trim() === '') return undefined;
    if (SessionId.validate(callerId) && this.sessions.has(callerId))
      return callerId;
    let match: SessionId | undefined;
    for (const session of this.sessions.values()) {
      if (session.tabId !== callerId) continue;
      if (match !== undefined) return undefined;
      match = session.id;
    }
    return match;
  }

  startChatSession(
    config: AgentSessionStartConfig,
  ): Promise<AsyncIterable<FlatStreamEventUnion>> {
    return this.open(config);
  }

  async resumeSession(
    id: SessionId,
    config: AgentSessionResumeConfig = {},
  ): Promise<AsyncIterable<FlatStreamEventUnion>> {
    const session = this.sessions.get(id);
    if (!session) return this.open(config, id);
    if (session.closing)
      throw new ProviderSessionChatAdapterError('unavailable', 'resume');
    const changed = (['model', 'effort', 'permissionLevel'] as const).filter(
      (key) => config[key] !== undefined,
    );
    if (changed.length > 0) {
      this.ports.logger.info(
        'Provider-session chat: session options are not reapplied to an open session.',
        { code: 'provider-session-resume-options-not-applied', keys: changed },
      );
    }
    const input = this.turnInput(
      config.prompt,
      config.files,
      config.images,
      session,
    );
    return isEmptyTurn(input)
      ? emptyStream()
      : this.turn(session, input, {
          refreshInheritedPermission: config.permissionLevel === undefined,
        });
  }

  private async open(
    config: AgentSessionStartConfig | AgentSessionResumeConfig,
    resumeId?: SessionId,
  ): Promise<AsyncIterable<FlatStreamEventUnion>> {
    const key = config.tabId ?? resumeId;
    if (!key || this.disposed)
      throw new ProviderSessionChatAdapterError('unavailable', 'open');
    if (this.opening.has(key) || (resumeId && this.opening.has(resumeId)))
      throw new ProviderSessionChatAdapterError('busy', 'open');
    const opening: ProviderSessionOpening = {
      cancelled: false,
      abort: new AbortController(),
    };
    this.opening.set(key, opening);
    if (resumeId) this.opening.set(resumeId, opening);
    const generation = this.generation;
    let prepared: ProviderSessionChatPrepared | undefined;
    try {
      const clientMessageId = this.parseClientMessageId(
        'clientMessageId' in config ? config.clientMessageId : undefined,
      );
      // Refused before anything spawns.
      const input = this.turnInput(config.prompt, config.files, config.images);
      prepared = await this.ports.prepare(config, resumeId);
      this.checkOpening(opening, generation);
      if (resumeId && !prepared.resume)
        throw new ProviderSessionChatAdapterError('resume-failed', 'open');
      const id = resumeId ?? SessionId.create();
      const session = createProviderSessionChatSession(id, prepared, config, {
        router: this.ports.approvals,
        presentation: this.ports.presentation,
      });
      // Read alongside the attach; never rejects.
      const restoring = resumeId ? this.usage.restore(id) : undefined;
      await this.attach(
        session,
        opening.abort.signal,
        'tab-closed',
        () => this.checkOpening(opening, generation),
        session.settings.permission ?? session.inheritedPermission,
      );
      if (restoring)
        session.usage ??= createProviderSessionUsageLedger(
          session,
          await restoring,
        );
      if (this.sessions.has(id)) {
        await this.releaseQuietly(id, 'tab-closed');
        throw new ProviderSessionChatAdapterError('busy', 'open');
      }
      this.sessions.set(id, session);
      this.resolved?.(config.tabId, id);
      this.sessionIdResolvedRegistry?.notifyAll({
        tabId: config.tabId,
        realSessionId: id,
        ...(!resumeId ? { isNewSession: true as const } : {}),
        timestamp: Date.now(),
      });
      return isEmptyTurn(input)
        ? emptyStream()
        : this.turn(session, input, { clientMessageId });
    } catch (error) {
      throw this.failure(error, 'open', prepared);
    } finally {
      this.opening.delete(key);
      if (resumeId) this.opening.delete(resumeId);
    }
  }

  /**
   * Acquire a live process for the session, then persist its identity before
   * the first prompt. A session that has a native id always attaches to it
   * and fails the attach as `resume-failed` (plan A8).
   *
   * Called before every turn: the pool returns its live entry (and counts the
   * turn as activity), or a process it opened in place of one it closed (idle
   * close, eviction, a history read's `load`). Only a new process is
   * attached again; the same one is returned as is.
   */
  private async attach(
    session: Session,
    signal: AbortSignal,
    failReason: ProviderSessionReleaseReason,
    check?: () => void,
    openingPermission?: Session['settings']['permission'],
  ): Promise<ProviderSession> {
    const nativeSessionId = session.nativeSessionId || undefined;
    const seed = session.prepared.seed;
    const live = await this.ports.acquire(
      {
        sessionId: session.id,
        ...(session.tabId ? { tabId: session.tabId } : {}),
        seed: session.settings.model
          ? { ...seed, model: session.settings.model }
          : seed,
        ...(nativeSessionId
          ? { resume: { nativeSessionId, onFailure: 'error' as const } }
          : {}),
        approvals: session.approvals,
        ...(session.prepared.open ? { open: session.prepared.open } : {}),
        ...(openingPermission ? { permission: openingPermission } : {}),
      },
      signal,
    );
    const previous = session.live;
    if (live === previous) {
      check?.();
      return live;
    }
    try {
      check?.();
      if (nativeSessionId && live.nativeSessionId !== nativeSessionId)
        throw new ProviderSessionChatAdapterError('resume-failed', 'attach');
      await this.ports.identity.save(
        session.id,
        providerSessionBinding(session, live),
        session.title,
      );
      check?.();
      if (session.settings.effort !== undefined)
        await live.setEffort(session.settings.effort);
      await this.controls.changePermission(session, async () => {
        const permission =
          session.settings.permission ?? session.inheritedPermission;
        if (permission !== undefined) await live.setPermission(permission);
        // An adopted history process needs the session's model.
        const model = session.settings.model ?? seed.model;
        if (nativeSessionId && model && live.capabilities().setModel)
          await live.setModel(model);
        check?.();
        // Publish the replacement before queued toggles can update it.
        if (previous) session.approvals.cancelAll('superseded');
        session.nativeSessionId = live.nativeSessionId;
        session.contextId = randomUUID();
        session.live = live;
      });
    } catch (error) {
      // A session closed while its process opened is released for good, so
      // the host forgets its routing instead of keeping it for a re-acquire.
      await this.releaseQuietly(
        session.id,
        session.closing ? 'tab-closed' : failReason,
      );
      throw error;
    }
    await this.controls.waitForPermissionChanges(session);
    return live;
  }

  /**
   * The live process of a turn, always through the pool: a reused entry, a
   * re-acquire after a break (respawn + attach), or the process the pool
   * opened after closing the cached one.
   */
  private async live(
    session: Session,
    refreshInheritedPermission = false,
  ): Promise<ProviderSession> {
    if (refreshInheritedPermission)
      await this.controls.refreshInheritedPermission(session);
    if (session.closing || this.disposed)
      throw new ProviderSessionChatAdapterError('unavailable', 'turn');
    return this.attach(
      session,
      session.abort.signal,
      'broken',
      () => {
        if (session.closing || this.disposed)
          throw new ProviderSessionChatAdapterError('cancelled', 'turn');
      },
      refreshInheritedPermission
        ? (session.settings.permission ?? session.inheritedPermission)
        : undefined,
    );
  }

  /** One notice per break; the session stays addressable. */
  private broken(session: Session): void {
    if (session.closing || !session.live) return;
    session.live = undefined;
    session.approvals.cancelAll('turn-ended');
    void this.releaseQuietly(session.id, 'broken');
    void this.ports
      .publishNotice(session.id, brokenSessionNotice(session.id))
      .catch((error: unknown) => {
        // degradation-audit: reported - the notice is best effort; the failed
        // turn row already shows the error.
        this.ports.logger.warn(
          '[ProviderSessionChatAdapter] broken-session notice failed',
          {
            error: error instanceof Error ? error.message : 'unknown',
          },
        );
      });
  }

  private turn(
    session: Session,
    input: ProviderSessionTurnInput,
    options: ProviderSessionTurnOptions,
  ): AsyncIterable<FlatStreamEventUnion> {
    if (session.closing)
      throw new ProviderSessionChatAdapterError('unavailable', 'turn');
    if (session.busy) throw new ProviderSessionChatAdapterError('busy', 'turn');
    return streamProviderSessionTurn(session, input, this.turnDeps, options);
  }

  /**
   * Publish a turn through the host channel. Resolves when the provider
   * accepted the prompt; rejects when it was refused before admission.
   */
  private publishTurn(
    session: Session,
    input: ProviderSessionTurnInput,
    options: Omit<ProviderSessionTurnOptions, 'admission' | 'reserved'>,
  ): Promise<void> {
    if (session.closing || this.sessions.get(session.id) !== session)
      return Promise.reject(
        new ProviderSessionChatAdapterError('unavailable', 'turn'),
      );
    if (session.busy)
      return Promise.reject(
        new ProviderSessionChatAdapterError('busy', 'turn'),
      );
    return publishProviderSessionTurn(session, input, options, this.turnDeps, {
      publish: (id, stream) => this.ports.publish(id, stream),
      unreserve: () => {
        session.busy = false;
        this.drain(session);
      },
    });
  }

  /** Start the next held turn once the session is idle. */
  private drain(session: Session): void {
    if (session.busy || session.closing || this.disposed) return;
    this.followUps.drain(session);
  }

  async sendMessageToSession(
    ...[id, text, options]: Parameters<IAgentAdapter['sendMessageToSession']>
  ): Promise<void> {
    let clientMessageId: string | undefined;
    let inboundPeer: { readonly label: string } | undefined;
    try {
      clientMessageId = clientMessageIdSchema.parse(options?.clientMessageId);
      if (options?.origin?.kind === 'peer') {
        const origin = peerOriginSchema.parse(options.origin);
        inboundPeer = { label: origin.name?.trim() || 'peer session' };
      }
    } catch (error) {
      throw this.failure(error, 'messageOptions');
    }
    const requireIdle = options?.admission === 'require-idle';
    const current = this.sessions.get(id);
    if (requireIdle) {
      if (!current || current.closing)
        throw new SessionAdmissionRefusedError('session-ended', id);
      if (current.busy || this.followUps.hasHeld(current))
        throw new SessionAdmissionRefusedError('busy', id);
    }
    const session = this.session(id);
    const input = this.turnInput(
      text,
      options?.files,
      options?.images,
      session,
    );
    const held = session.busy || this.followUps.hasHeld(session);
    if (options?.queueIntent === 'next-turn' && !inboundPeer && !requireIdle) {
      if (!clientMessageId)
        throw this.failure(
          new Error('clientMessageId required'),
          'messageOptions',
        );
      // A retried send of the same follow-up is already held.
      if (this.followUps.isQueued(session, clientMessageId)) return;
      const followUp: QueuedFollowUpSnapshot = {
        clientMessageId,
        content: text,
      };
      if (held) {
        this.followUps.holdFollowUp(session, input, followUp);
        return;
      }
      await this.publishTurn(session, input, { clientMessageId });
      this.followUps.delivered(id, followUp);
      return;
    }
    if (inboundPeer && held && !requireIdle) {
      await this.followUps.holdPeer(session, {
        input,
        inboundPeer,
        ...(clientMessageId ? { clientMessageId } : {}),
      });
      return;
    }
    if (held) throw new ProviderSessionChatAdapterError('busy', 'turn');
    await this.publishTurn(session, input, {
      ...(clientMessageId ? { clientMessageId } : {}),
      ...(inboundPeer ? { inboundPeer } : {}),
    });
  }

  claimHeldPeerMessages(
    sessionId: SessionId,
  ): ReturnType<IAgentAdapter['claimHeldPeerMessages']> {
    this.ports.logger.warn(
      'Held peer message transfer unsupported for provider sessions',
      { sessionId },
    );
    return [];
  }

  onQueuedFollowUpState(
    listener: (change: QueuedFollowUpStateChange) => void,
  ): () => void {
    return this.followUps.onState(listener);
  }
  async withdrawQueuedFollowUp(
    id: SessionId,
    clientMessageId: string,
  ): Promise<boolean> {
    const session = this.sessions.get(id);
    return session ? this.followUps.withdraw(session, clientMessageId) : false;
  }
  listQueuedFollowUps(id: SessionId): readonly QueuedFollowUpSnapshot[] {
    const session = this.sessions.get(id);
    return session ? this.followUps.list(session) : [];
  }
  /** Steers into the running turn only when the provider can steer. */
  async steerQueuedFollowUp(
    id: SessionId,
    clientMessageId: string,
  ): Promise<SteerQueuedFollowUpResult> {
    const session = this.sessions.get(id);
    if (!session || session.closing)
      return { ok: false, code: 'SESSION_ENDED' };
    return this.followUps.steer(session, clientMessageId);
  }

  async listSessionModels(
    sessionId: SessionId,
  ): Promise<readonly AgentModelInfo[]> {
    const live = this.current(this.session(sessionId));
    if (!live)
      throw new ProviderSessionChatAdapterError('unavailable', 'listModels');
    try {
      return (await live.listModels()).map((model) => ({
        value: model.id,
        displayName: model.name ?? model.id,
      }));
    } catch (error) {
      throw this.failure(error, 'listModels');
    }
  }

  owns(id: SessionId): boolean {
    return this.controls.owns(id);
  }
  isSessionActive(id: SessionId): boolean {
    return this.controls.isSessionActive(id);
  }
  canSendFollowUp(id: SessionId): boolean {
    return this.controls.canSendFollowUp(id);
  }
  getSessionToken(id: SessionId): string | null {
    return this.controls.getSessionToken(id);
  }
  endSession(id: SessionId): void {
    this.controls.endSession(id);
  }
  closeSession(id: SessionId): Promise<void> {
    return this.controls.closeSession(id);
  }
  /** Never ends the session: each turn is its own stream (see Codex). */
  endSessionIfTokenMatches(): Promise<boolean> {
    return this.controls.endSessionIfTokenMatches();
  }
  interruptCurrentTurn(id: SessionId): Promise<boolean> {
    return this.controls.interruptCurrentTurn(id);
  }
  interruptSession(id: SessionId, cause?: SessionEndCause): Promise<void> {
    return this.controls.interruptSession(id, cause);
  }
  executeSlashCommand(
    ...args: Parameters<IAgentAdapter['executeSlashCommand']>
  ): Promise<AsyncIterable<FlatStreamEventUnion>> {
    return this.controls.executeSlashCommand(...args);
  }
  setSessionPermissionLevel(
    ...args: Parameters<IAgentAdapter['setSessionPermissionLevel']>
  ): Promise<void> {
    return this.controls.setSessionPermissionLevel(...args);
  }
  setSessionModel(
    ...args: Parameters<IAgentAdapter['setSessionModel']>
  ): Promise<void> {
    return this.controls.setSessionModel(...args);
  }
  setSessionEffort(
    ...args: Parameters<IAgentAdapter['setSessionEffort']>
  ): Promise<void> {
    return this.controls.setSessionEffort(...args);
  }

  setSessionIdResolvedCallback(
    cb: Parameters<IAgentAdapter['setSessionIdResolvedCallback']>[0],
  ): void {
    this.resolved = cb;
  }
  setResultStatsCallback(cb: ResultStatsCallback): void {
    this.stats = cb;
  }
  setCompactionStartCallback(): void {
    // Provider sessions report no compaction; the routing adapter keeps the
    // callback on the Claude adapter only.
  }
  setLiveStatsCallback(): void {
    this.unsupported('liveStats');
  }
  setWorktreeCreatedCallback(): void {
    this.unsupported('worktreeCreated');
  }
  setWorktreeRemovedCallback(): void {
    this.unsupported('worktreeRemoved');
  }

  /**
   * The turn's text, images and file references. Images go to the provider
   * as base64 image blocks and files as resource links (ACP baseline). An
   * image for a provider that did not advertise image input is refused,
   * never dropped: here when the session's process is known, else at the
   * prompt (`streamProviderSessionTurn`) before anything is sent.
   */
  private turnInput(
    text: string | undefined,
    files: readonly string[] | undefined,
    images: ReadonlyArray<unknown> | undefined,
    session?: Session,
  ): ProviderSessionTurnInput {
    const parsedImages = turnImagesSchema.safeParse(images ?? []);
    if (!parsedImages.success)
      throw new ProviderSessionChatAdapterError(
        'unsupported-option',
        'images',
        {
          option: 'images',
          cause: parsedImages.error,
        },
      );
    const parsedFiles = turnFilesSchema.safeParse(files ?? []);
    if (!parsedFiles.success)
      throw new ProviderSessionChatAdapterError('unsupported-option', 'files', {
        option: 'files',
        cause: parsedFiles.error,
      });
    if (
      parsedImages.data.length > 0 &&
      session &&
      this.current(session)?.capabilities().images === false
    )
      throw new ProviderSessionChatAdapterError(
        'unsupported-option',
        'images',
        {
          option: 'images',
        },
      );
    return {
      text: text ?? '',
      ...(parsedImages.data.length > 0
        ? {
            images: parsedImages.data.map((image) => ({
              mimeType: image.mediaType,
              data: image.data,
            })),
          }
        : {}),
      ...(parsedFiles.data.length > 0 ? { files: parsedFiles.data } : {}),
    };
  }

  private parseClientMessageId(value: unknown): string | undefined {
    try {
      return clientMessageIdSchema.parse(value);
    } catch (error) {
      throw this.failure(error, 'messageOptions');
    }
  }

  private checkOpening(
    opening: ProviderSessionOpening,
    generation: number,
  ): void {
    if (opening.cancelled || this.disposed || generation !== this.generation)
      throw new ProviderSessionChatAdapterError('cancelled', 'open');
  }

  private cancelOpenings(): void {
    for (const opening of this.opening.values()) {
      opening.cancelled = true;
      opening.abort.abort();
    }
  }

  private async releaseQuietly(
    id: SessionId,
    reason: ProviderSessionReleaseReason,
  ): Promise<void> {
    try {
      await this.ports.release(id, reason);
    } catch (error) {
      // degradation-audit: reported - the pool still owns the process and
      // closes it on idle or shutdown; the failure is logged.
      this.failure(error, 'release');
    }
  }

  /**
   * The cached process while the pool still holds it. A process the pool
   * closed on its own (idle, eviction, history reopen) is forgotten, so a
   * setting waits for the next turn's acquire instead of reaching it.
   */
  private current(session: Session): ProviderSession | undefined {
    const live = session.live;
    if (live && !this.ports.holds(session.id, live)) session.live = undefined;
    return session.live;
  }

  private session(id: SessionId): Session {
    const session = this.sessions.get(id);
    if (!session || session.closing)
      throw new ProviderSessionChatAdapterError('unavailable', 'session');
    return session;
  }

  private unsupported(operation: string): never {
    throw new ProviderSessionChatAdapterError('unsupported-option', operation, {
      option: operation,
    });
  }

  private failure(
    error: unknown,
    operation: string,
    prepared?: ProviderSessionChatPrepared,
  ): ProviderSessionChatAdapterError {
    const failure = toProviderSessionChatAdapterError(
      error,
      operation,
      prepared?.seed,
    );
    // An adapter error is an expected refusal (busy, unavailable, ...) and was
    // logged where it was mapped; only a raw failure is logged here.
    if (failure.code === 'cancelled' || failure === error) return failure;
    this.ports.logger.error(
      `[ProviderSessionChatAdapter] ${failure.code}: ${operation}.`,
      error instanceof Error ? error : new Error(String(error)),
    );
    return failure;
  }
}

/** At most this many images per turn, as the chat image picker allows. */
export const PROVIDER_SESSION_MAX_TURN_IMAGES = 10;

/** Canonical base64: the alphabet, at most two padding characters, whole quads. */
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Decoded bytes of a canonical base64 string. */
function decodedBytes(data: string): number {
  const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return (data.length / 4) * 3 - padding;
}

/**
 * The chat image shape (`{ data, mediaType }`, base64 without a data: prefix).
 * Each image is canonical base64 within the chat attachment cap
 * (`MAX_IMAGE_SIZE_BYTES`, decoded), so an oversized or malformed payload is
 * refused before it is held in the queue or sent.
 */
const turnImagesSchema = z
  .array(
    z.object({
      data: z
        .string()
        .min(1)
        .refine((data) => data.length % 4 === 0 && BASE64.test(data), {
          message: 'image data is not base64',
        })
        .refine((data) => decodedBytes(data) <= MAX_IMAGE_SIZE_BYTES, {
          message: 'image is too large',
        }),
      mediaType: z.string().regex(/^image\/[\w.+-]+$/),
    }),
  )
  .max(PROVIDER_SESSION_MAX_TURN_IMAGES);
const turnFilesSchema = z.array(z.string().trim().min(1));

/** Nothing to send: an open without a first prompt. */
function isEmptyTurn(input: ProviderSessionTurnInput): boolean {
  return input.text === '' && !input.images?.length && !input.files?.length;
}

function emptyStream(): AsyncIterable<FlatStreamEventUnion> {
  return (async function* () {
    /* No prompt: the session is open, no turn runs. */
  })();
}

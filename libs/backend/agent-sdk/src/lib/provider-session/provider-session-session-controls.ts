import type { Logger } from '@ptah-extension/vscode-core';
import type {
  ProviderSession,
  ProviderSessionPermission,
} from '@ptah-extension/provider-session-contracts';
import type {
  FlatStreamEventUnion,
  IAgentAdapter,
  SessionEndCause,
  SessionId,
} from '@ptah-extension/shared';
import { ProviderSessionChatAdapterError } from './provider-session-chat-adapter-error';
import type {
  ProviderSessionChatPorts,
  ProviderSessionReleaseReason,
} from './provider-session-chat-ports';
import { providerSessionRuntimeErrorCode } from './provider-session-error-mapping';
import type { ProviderSessionChatSession as Session } from './provider-session-turn-stream';

/** An open in progress, keyed by its tab id (and its session id on resume). */
export interface ProviderSessionOpening {
  cancelled: boolean;
  readonly abort: AbortController;
}

interface SessionControlsDependencies {
  readonly sessions: Map<SessionId, Session>;
  readonly opening: Map<string, ProviderSessionOpening>;
  readonly ports: Pick<
    ProviderSessionChatPorts,
    'release' | 'readSavedPermissionLevel'
  >;
  readonly logger: Logger;
  session(id: SessionId): Session;
  /** The cached process while the pool still holds it (else forgotten). */
  current(session: Session): ProviderSession | undefined;
  failure(error: unknown, operation: string): ProviderSessionChatAdapterError;
  /** Fail the follow-ups and peer turns still queued for a closing session. */
  rejectQueued(session: Session): void;
}

const PERMISSION_LEVELS: ReadonlySet<string> =
  new Set<ProviderSessionPermission>(['plan', 'ask', 'auto-edit', 'yolo']);

function isProviderSessionPermission(
  level: string,
): level is ProviderSessionPermission {
  return PERMISSION_LEVELS.has(level);
}

/**
 * Session lifecycle and live controls of the provider-session chat. A user
 * Stop interrupts the turn and keeps the process (the host pool owns idle
 * close); only an explicit end releases the session to the pool.
 */
export class ProviderSessionSessionControls {
  private readonly permissionChanges = new WeakMap<Session, Promise<void>>();

  constructor(private readonly deps: SessionControlsDependencies) {}

  owns(id: SessionId): boolean {
    return this.deps.sessions.has(id) || this.deps.opening.has(id);
  }
  isSessionActive(id: SessionId): boolean {
    return (
      this.deps.sessions.has(id) ||
      this.deps.opening.get(id)?.cancelled === false
    );
  }
  canSendFollowUp(id: SessionId): boolean {
    const session = this.deps.sessions.get(id);
    return !!session && !session.busy && !session.closing;
  }
  getSessionToken(id: SessionId): string | null {
    return this.deps.sessions.get(id)?.token ?? null;
  }

  endSession(id: SessionId): void {
    // An open in flight releases what it got itself once cancelled.
    const opening = this.deps.opening.has(id);
    this.cancelOpening(id);
    const session = this.deps.sessions.get(id);
    if (!session && opening) return;
    const closing = session
      ? this.close(session, 'tab-closed')
      : this.releaseUnowned(id);
    void closing.catch((error: unknown) => {
      this.deps.failure(error, 'cleanup');
    });
  }
  /** Explicit teardown for commands that must finish closing before returning. */
  async closeSession(id: SessionId): Promise<void> {
    this.cancelOpening(id);
    const session = this.deps.sessions.get(id);
    if (session) await this.close(session, 'tab-closed');
  }
  /** Each turn is its own stream; the session outlives it. */
  async endSessionIfTokenMatches(): Promise<boolean> {
    return false;
  }

  /**
   * A session this adapter holds no record for, but the host may still hold a
   * process for: one only a history read opened (`load`). Its tab closing
   * gives that process back now instead of after the pool's idle close; the
   * host release is a no-op when nothing is live.
   */
  private releaseUnowned(id: SessionId): Promise<void> {
    return this.deps.ports.release(id, 'tab-closed').catch((error: unknown) => {
      throw this.deps.failure(error, 'release');
    });
  }

  /** Remove the record and give the session back to the pool, once. */
  close(session: Session, reason: ProviderSessionReleaseReason): Promise<void> {
    if (session.closing) return session.closing;
    // Withdraw open cards while the session is still owned: the router's
    // cancel fan-out picks the provider-session presentation by `owns()`.
    session.approvals.dispose();
    if (this.deps.sessions.get(session.id) === session)
      this.deps.sessions.delete(session.id);
    session.abort.abort();
    this.deps.rejectQueued(session);
    session.live = undefined;
    session.closing = this.deps.ports
      .release(session.id, reason)
      .catch((error: unknown) => {
        throw this.deps.failure(error, 'release');
      });
    return session.closing;
  }

  async interruptCurrentTurn(id: SessionId): Promise<boolean> {
    const session = this.deps.session(id);
    const turnId = session.turnId;
    if (!turnId) {
      // Opening or re-acquiring: interrupt as soon as the receipt arrives.
      session.pendingInterrupt = session.busy;
      return session.pendingInterrupt;
    }
    const live = session.live;
    if (!live) return false;
    try {
      return await live.interrupt(turnId);
    } catch (error) {
      throw this.deps.failure(error, 'interrupt');
    }
  }

  async interruptSession(
    id: SessionId,
    cause?: SessionEndCause,
  ): Promise<void> {
    const opening = this.deps.opening.get(id);
    if (opening) {
      opening.cancelled = true;
      opening.abort.abort();
      return;
    }
    const session = this.deps.sessions.get(id);
    if (!session) {
      if (cause === 'tab-close') await this.releaseUnowned(id);
      return;
    }
    const hardStop = cause === 'parent-stop';
    if (session.busy && !session.stopRequested) {
      session.stopRequested = true;
      const turnId = session.turnId;
      let accepted: boolean;
      try {
        accepted = await this.interruptCurrentTurn(id);
      } catch (error) {
        // A refused interrupt leaves a turn nobody can stop: drop the process.
        await this.close(session, 'broken');
        throw error;
      }
      // A refusal counts only while that turn still runs: a Stop that races
      // the turn's end is answered `false` with nothing left to stop.
      if (!accepted && this.stillRunning(session, turnId)) {
        this.deps.logger.warn(
          '[ProviderSessionChatAdapter] turn interrupt was refused; releasing the session.',
          { sessionId: id },
        );
        await this.close(session, 'broken');
        return;
      }
    }
    if (hardStop) await this.close(session, 'session-ended');
  }

  async executeSlashCommand(
    ...[id, command]: Parameters<IAgentAdapter['executeSlashCommand']>
  ): Promise<AsyncIterable<FlatStreamEventUnion>> {
    this.deps.session(id);
    // `/compact` and other native commands are not offered by provider
    // sessions; the slash router answers them before reaching here.
    throw new ProviderSessionChatAdapterError(
      'unsupported-option',
      'slashCommand',
      {
        option: command.split(/\s+/, 1)[0] || 'slash command',
      },
    );
  }

  async setSessionPermissionLevel(
    ...[id, level]: Parameters<IAgentAdapter['setSessionPermissionLevel']>
  ): Promise<void> {
    // SDK aliases (default/acceptEdits/bypassPermissions) have no provider mode.
    if (!isProviderSessionPermission(level))
      throw new ProviderSessionChatAdapterError(
        'unsupported-option',
        'permission',
        {
          option: 'permission',
        },
      );
    const permission = level;
    const session = this.deps.session(id);
    await this.changePermission(session, async () => {
      await this.apply(session, 'permission', (live) =>
        live.setPermission(permission),
      );
      session.settings = { ...session.settings, permission };
    });
  }

  refreshInheritedPermission(session: Session): Promise<void> {
    return this.changePermission(session, async () => {
      if (session.settings.permission !== undefined) return;
      let permission: ProviderSessionPermission = 'ask';
      try {
        permission =
          this.deps.ports.readSavedPermissionLevel?.(
            session.prepared.seed.workspacePath,
          ) ?? 'ask';
      } catch {
        this.deps.logger.warn(
          'Could not read the saved provider-session permission level. Using ask.',
          { sessionId: session.id },
        );
      }
      if (session.inheritedPermission === permission) return;
      session.inheritedPermission = permission;
      const live = this.deps.current(session);
      if (!live) return;
      try {
        await live.setPermission(permission);
      } catch (error) {
        // A later attach must apply the new level before it can reuse a process.
        session.live = undefined;
        session.approvals.cancelAll('superseded');
        const failure = this.deps.failure(error, 'permission');
        if (providerSessionRuntimeErrorCode(error) !== 'process-exited')
          throw failure;
        await this.deps.ports.release(session.id, 'broken');
      }
    });
  }

  changePermission(
    session: Session,
    change: () => Promise<void>,
  ): Promise<void> {
    // Attaching, refreshing, and toggling can target the same session.
    const previous = this.permissionChanges.get(session) ?? Promise.resolve();
    const pending = previous
      .catch(() => {
        // degradation-audit: reported - the earlier caller receives its own rejection.
      })
      .then(change);
    this.permissionChanges.set(session, pending);
    return pending;
  }

  /** Wait for toggles queued while a replacement process was attaching. */
  async waitForPermissionChanges(session: Session): Promise<void> {
    await this.permissionChanges.get(session);
  }

  async setSessionModel(
    ...[id, model]: Parameters<IAgentAdapter['setSessionModel']>
  ): Promise<void> {
    const session = this.deps.session(id);
    if (session.live && !session.live.capabilities().setModel)
      throw new ProviderSessionChatAdapterError('unsupported-option', 'model', {
        option: 'model',
      });
    await this.apply(session, 'model', (live) => live.setModel(model));
    session.settings = { ...session.settings, model };
  }
  async setSessionEffort(
    ...[id, effort]: Parameters<IAgentAdapter['setSessionEffort']>
  ): Promise<void> {
    const session = this.deps.session(id);
    await this.apply(session, 'effort', (live) => live.setEffort(effort));
    session.settings = { ...session.settings, effort };
  }

  private stillRunning(session: Session, turnId: string | undefined): boolean {
    if (!session.busy || session.closing) return false;
    // No receipt yet: the interrupt is held until it lands.
    if (turnId === undefined) return session.turnId === undefined;
    return session.turnId === turnId && session.live?.isTurnRunning() === true;
  }

  /** A broken or pool-closed session keeps the setting for its next acquire. */
  private async apply(
    session: Session,
    operation: string,
    action: (live: ProviderSession) => Promise<unknown>,
  ): Promise<void> {
    const live = this.deps.current(session);
    if (!live) return;
    try {
      await action(live);
    } catch (error) {
      throw this.deps.failure(error, operation);
    }
  }

  private cancelOpening(id: SessionId): void {
    const opening = this.deps.opening.get(id);
    if (!opening) return;
    opening.cancelled = true;
    opening.abort.abort();
  }
}

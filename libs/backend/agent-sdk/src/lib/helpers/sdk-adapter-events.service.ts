import { injectable, inject } from 'tsyringe';
import EventEmitter from 'eventemitter3';
import { Logger, TOKENS } from '@ptah-extension/vscode-core';
import { SDK_TOKENS } from '../di/tokens';
import type { TurnStopCause } from '@ptah-extension/shared';
import type { CompactionCoordinator } from './compaction/compaction-coordinator';
import type { CompactionStateChange } from './compaction/compaction-state.types';
import type {
  BackgroundTaskSummary,
  SessionCronSummary,
  SDKAssistantMessageError,
  TerminalReason,
} from '../types/sdk-types/claude-sdk.types';

export interface SdkAdapterInitializedEvent {
  readonly success: boolean;
  readonly timestamp: number;
}

export interface SdkAdapterDisposedEvent {
  readonly timestamp: number;
}

export interface SdkAdapterConfigChangedEvent {
  readonly key: string;
  readonly timestamp: number;
}

export interface SdkAdapterAuthFileChangedEvent {
  /** Provider whose external credential file changed (e.g. 'openai-codex'). */
  readonly providerId: string;
  readonly timestamp: number;
}

export interface SdkAdapterCompactionCompleteEvent {
  readonly sessionId: string;
  readonly cwd: string;
  readonly trigger: 'manual' | 'auto';
  readonly compactSummary: string;
  readonly timestamp: number;
}

export interface SdkAdapterTurnEndedEvent {
  readonly sessionId: string;
  readonly cwd: string;
  readonly lastAssistantMessage: string | null;
  readonly backgroundTasks: readonly BackgroundTaskSummary[];
  readonly sessionCrons: readonly SessionCronSummary[];
  readonly terminalReason: TerminalReason | null;
  readonly timestamp: number;
}

export interface SdkAdapterTurnFailedEvent {
  readonly stopCause?: TurnStopCause;
  readonly sessionId: string;
  readonly cwd: string;
  readonly lastAssistantMessage: string | null;
  readonly error: SDKAssistantMessageError;
  readonly errorDetails: string | null;
  readonly terminalReason: TerminalReason | null;
  readonly timestamp: number;
}

export interface SdkAdapterSubagentEndedEvent {
  readonly sessionId: string;
  readonly cwd: string;
  readonly agentId: string;
  readonly agentType: string;
  /**
   * The Task tool_use id the SDK handed to the `SubagentStop` hook.
   *
   * Optional: the SDK types `toolUseID` as `string | undefined` on every hook
   * callback. `SessionLifecycleNotifier` forwards it only when it is a
   * non-empty string, and the webview treats its absence as today's behaviour.
   *
   * It carries the `agentId` ↔ `toolCallId` pairing that `BackgroundAgentStore`
   * needs to re-key an entry it had to file under `toolCallId` because the
   * `background_agent_started` event reached it without an `agentId`.
   */
  readonly toolCallId?: string;
  readonly lastAssistantMessage: string | null;
  readonly backgroundTasks: readonly BackgroundTaskSummary[];
  readonly timestamp: number;
}

/**
 * Emitted when the SDK fires the `TeammateIdle` hook — a named in-SDK teammate
 * has gone idle and is awaiting steering. Keyed on the human-legible
 * `teammateName` (never on `team_name`, which the SDK is deprecating toward a
 * single implicit team). A future UI can use this to show "agent idle, awaiting
 * steering" affordances.
 */
export interface SdkAdapterTeammateIdleEvent {
  readonly sessionId: string;
  readonly cwd: string;
  readonly teammateName: string;
  readonly timestamp: number;
}

/**
 * One A8 compaction coordinator transition (TASK_2026_597): from, to, the
 * trigger, and the pre/post token counts on the `compact-boundary` change.
 */
export interface SdkAdapterCompactionStateChangedEvent
  extends CompactionStateChange {
  readonly timestamp: number;
}

interface SdkAdapterEventMap {
  initialized: (event: SdkAdapterInitializedEvent) => void;
  disposed: (event: SdkAdapterDisposedEvent) => void;
  configChanged: (event: SdkAdapterConfigChangedEvent) => void;
  authFileChanged: (event: SdkAdapterAuthFileChangedEvent) => void;
  compactionComplete: (event: SdkAdapterCompactionCompleteEvent) => void;
  turnEnded: (event: SdkAdapterTurnEndedEvent) => void;
  turnFailed: (event: SdkAdapterTurnFailedEvent) => void;
  subagentEnded: (event: SdkAdapterSubagentEndedEvent) => void;
  teammateIdle: (event: SdkAdapterTeammateIdleEvent) => void;
  compactionStateChanged: (
    event: SdkAdapterCompactionStateChangedEvent,
  ) => void;
}

export type SdkAdapterEventName = keyof SdkAdapterEventMap;

/** One recorded stop cause; identity is the ownership token. */
export interface StopCauseEntry {
  readonly cause: TurnStopCause;
}

@injectable()
export class SdkAdapterEvents {
  private readonly pendingStopCauses = new Map<string, StopCauseEntry>();
  private readonly currentStopCauses = new Map<string, StopCauseEntry>();

  /** Returns the recorded entry, so its owner can clear only its own cause. */
  recordStopCause(ids: readonly string[], cause: TurnStopCause): StopCauseEntry {
    const entry = { cause };
    for (const id of ids) {
      this.pendingStopCauses.set(id, entry);
      this.currentStopCauses.set(id, entry);
    }
    return entry;
  }

  peekStopCause(id: string): TurnStopCause | undefined {
    const entry = this.currentStopCauses.get(id);
    if (!entry) return undefined;
    for (const [key, value] of this.currentStopCauses) {
      if (value === entry) this.currentStopCauses.delete(key);
    }
    return entry.cause;
  }

  takeStopCause(id: string): TurnStopCause | undefined {
    const entry = this.pendingStopCauses.get(id);
    if (!entry) return undefined;
    for (const [key, value] of this.pendingStopCauses) {
      if (value === entry) this.pendingStopCauses.delete(key);
    }
    return entry.cause;
  }

  /**
   * Clear the cause of `id`. With `owned`, clear that entry only: a newer cause
   * recorded on the same id by another interrupt stays.
   */
  clearStopCause(id: string, owned?: StopCauseEntry): void {
    const entry = owned ?? this.currentStopCauses.get(id) ?? this.pendingStopCauses.get(id);
    if (!entry) return;
    for (const [key, value] of this.currentStopCauses) {
      if (value === entry) this.currentStopCauses.delete(key);
    }
    for (const [key, value] of this.pendingStopCauses) {
      if (value === entry) this.pendingStopCauses.delete(key);
    }
  }
  private readonly emitter = new EventEmitter<SdkAdapterEventMap>();

  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
    /**
     * The A8 coordinator whose transitions are published as
     * `compactionStateChanged`. Optional so a container without it still
     * constructs. Both are container singletons; `CompactionCoordinator.dispose`
     * drops this subscription with every other one.
     */
    @inject(SDK_TOKENS.SDK_COMPACTION_COORDINATOR, { isOptional: true })
    compactionCoordinator?: Pick<CompactionCoordinator, 'subscribe'>,
  ) {
    compactionCoordinator?.subscribe((change) =>
      this.emitCompactionStateChanged({ ...change, timestamp: Date.now() }),
    );
  }

  emitInitialized(event: SdkAdapterInitializedEvent): void {
    this.safeEmit('initialized', event);
  }

  emitDisposed(event: SdkAdapterDisposedEvent): void {
    this.safeEmit('disposed', event);
  }

  emitConfigChanged(event: SdkAdapterConfigChangedEvent): void {
    this.safeEmit('configChanged', event);
  }

  emitAuthFileChanged(event: SdkAdapterAuthFileChangedEvent): void {
    this.safeEmit('authFileChanged', event);
  }

  emitCompactionComplete(event: SdkAdapterCompactionCompleteEvent): void {
    this.logger.info('[SdkAdapterEvents] Publishing PostCompact advisory', {
      sessionId: event.sessionId,
      trigger: event.trigger,
    });
    this.safeEmit('compactionComplete', event);
  }

  emitCompactionStateChanged(
    event: SdkAdapterCompactionStateChangedEvent,
  ): void {
    this.logger.info('[SdkAdapterEvents] Compaction state changed', {
      sessionId: event.sessionId,
      from: event.from,
      to: event.to,
      trigger: event.trigger,
      preTokens: event.preTokens,
      postTokens: event.postTokens,
    });
    this.safeEmit('compactionStateChanged', event);
  }

  emitTurnEnded(event: SdkAdapterTurnEndedEvent): void {
    this.safeEmit('turnEnded', event);
  }

  emitTurnFailed(event: SdkAdapterTurnFailedEvent): void {
    this.safeEmit('turnFailed', event);
  }

  emitSubagentEnded(event: SdkAdapterSubagentEndedEvent): void {
    this.safeEmit('subagentEnded', event);
  }

  emitTeammateIdle(event: SdkAdapterTeammateIdleEvent): void {
    this.safeEmit('teammateIdle', event);
  }

  onInitialized(
    listener: (event: SdkAdapterInitializedEvent) => void,
  ): () => void {
    this.emitter.on('initialized', listener);
    return () => this.emitter.off('initialized', listener);
  }

  onDisposed(listener: (event: SdkAdapterDisposedEvent) => void): () => void {
    this.emitter.on('disposed', listener);
    return () => this.emitter.off('disposed', listener);
  }

  onConfigChanged(
    listener: (event: SdkAdapterConfigChangedEvent) => void,
  ): () => void {
    this.emitter.on('configChanged', listener);
    return () => this.emitter.off('configChanged', listener);
  }

  onAuthFileChanged(
    listener: (event: SdkAdapterAuthFileChangedEvent) => void,
  ): () => void {
    this.emitter.on('authFileChanged', listener);
    return () => this.emitter.off('authFileChanged', listener);
  }

  onCompactionComplete(
    listener: (event: SdkAdapterCompactionCompleteEvent) => void,
  ): () => void {
    this.emitter.on('compactionComplete', listener);
    return () => this.emitter.off('compactionComplete', listener);
  }

  onTurnEnded(listener: (event: SdkAdapterTurnEndedEvent) => void): () => void {
    this.emitter.on('turnEnded', listener);
    return () => this.emitter.off('turnEnded', listener);
  }

  onTurnFailed(
    listener: (event: SdkAdapterTurnFailedEvent) => void,
  ): () => void {
    this.emitter.on('turnFailed', listener);
    return () => this.emitter.off('turnFailed', listener);
  }

  onSubagentEnded(
    listener: (event: SdkAdapterSubagentEndedEvent) => void,
  ): () => void {
    this.emitter.on('subagentEnded', listener);
    return () => this.emitter.off('subagentEnded', listener);
  }

  onTeammateIdle(
    listener: (event: SdkAdapterTeammateIdleEvent) => void,
  ): () => void {
    this.emitter.on('teammateIdle', listener);
    return () => this.emitter.off('teammateIdle', listener);
  }

  onCompactionStateChanged(
    listener: (event: SdkAdapterCompactionStateChangedEvent) => void,
  ): () => void {
    this.emitter.on('compactionStateChanged', listener);
    return () => this.emitter.off('compactionStateChanged', listener);
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }

  listenerCount(event: SdkAdapterEventName): number {
    return this.emitter.listenerCount(event);
  }

  private safeEmit<E extends SdkAdapterEventName>(
    event: E,
    payload: Parameters<SdkAdapterEventMap[E]>[0],
  ): void {
    try {
      this.emitter.emit(
        event,
        payload as unknown as SdkAdapterInitializedEvent &
          SdkAdapterDisposedEvent &
          SdkAdapterConfigChangedEvent &
          SdkAdapterAuthFileChangedEvent &
          SdkAdapterCompactionCompleteEvent &
          SdkAdapterTurnEndedEvent &
          SdkAdapterTurnFailedEvent &
          SdkAdapterSubagentEndedEvent &
          SdkAdapterTeammateIdleEvent &
          SdkAdapterCompactionStateChangedEvent,
      );
    } catch (err) {
      this.logger.warn(
        `[SdkAdapterEvents] '${event}' listener threw`,
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }
}

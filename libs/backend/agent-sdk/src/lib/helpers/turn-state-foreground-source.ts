/**
 * TurnStateForegroundSource — the background-work governor's foreground
 * signal over `SessionTurnStateRegistry` (TASK_2026_437 C14, INV-7).
 *
 * Busy while any session is `generating`, EXCEPT a record that has been
 * generating longer than {@link STALE_GENERATING_CEILING_MS}. Such a record is
 * almost certainly one whose teardown never ran (`forceIdle` / `settleTurn`
 * missed), and the registry's LRU bound only evicts it after 256 other session
 * ids — in single-tab use, never. Counted as busy, it would hold every
 * background lane to its 10-minute deferral ceiling for the life of the
 * process. It is ignored FOR THIS SIGNAL ONLY: turn state is not touched, and
 * one warn line names it.
 *
 * **The age is measured from the turn's START** (`since`, the `generating`
 * commit), not from its last activity: the registry records no per-chunk
 * timestamp. So a LEGITIMATE turn that runs past 60 min also stops counting —
 * background lanes resume beside it for the rest of that turn. Nothing in this
 * codebase bounds a turn's length, so that is a real (if rare) case, accepted
 * because the alternative is a leaked record starving background work forever.
 *
 * **A turn blocked on a human prompt is not busy.** A session that waits on a
 * permission prompt or an AskUserQuestion stays `generating`, but it uses no
 * CPU, and holding background work for it gave the foreground no benefit (a
 * benchmark run kept the code indexer deferred for 14 min behind such waits).
 * Such a session is excluded while the prompt is pending, and it counts again
 * as soon as the prompt is answered (the prompt source notifies, this source
 * re-notifies the governor). The pending state is read from
 * {@link PromptWaitSource}, the permission handler's own pending maps — this
 * file keeps no tracker of its own.
 *
 * The registry notifies only on turn transitions, and nothing transitions when
 * a record goes stale, so this source arms one `unref()`-ed timer for the
 * earliest stale deadline and notifies its listeners when it fires. The timer
 * lives only while someone is subscribed.
 */
import type {
  ForegroundActivitySource,
  Logger,
} from '@ptah-extension/vscode-core';
import type { GeneratingSession } from './session-turn-state.registry';

/**
 * 60 min from turn start. Long past an ordinary agentic turn (minutes), short
 * enough that a leaked record stops starving background work within the
 * session. A real turn longer than this is not background-gated for its
 * remainder — see the file header.
 */
export const STALE_GENERATING_CEILING_MS = 60 * 60_000;

/** The registry surface this source reads. */
export interface GeneratingSessionsSource {
  generatingSessions(): readonly GeneratingSession[];
  onGeneratingChange(listener: () => void): () => void;
}

/**
 * Pending-prompt state, read from the permission handler (permission prompts
 * and AskUserQuestion). The id is whatever the turn-state registry keys the
 * session by (tab id before the SDK id resolves, session id after); the
 * source matches on either.
 */
export interface PromptWaitSource {
  isSessionWaitingOnPrompt(sessionOrTabId: string): boolean;
  onPromptWaitChange(listener: () => void): () => void;
}

/** Clock seam, so the spec drives the ceiling without real time. */
export interface ForegroundSourceClock {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const REAL_CLOCK: ForegroundSourceClock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => {
    const handle = setTimeout(callback, ms);
    // A diagnostics-adjacent timer is never the reason a process stays alive.
    handle.unref();
    return handle;
  },
  clearTimeout: (handle) => {
    clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

const LOG_TAG = '[TurnStateForegroundSource]';

export class TurnStateForegroundSource implements ForegroundActivitySource {
  private readonly listeners = new Set<() => void>();
  /** `sessionId@since` of stale records already warned about. */
  private readonly warnedStale = new Set<string>();
  private unsubscribeRegistry: (() => void) | undefined;
  private unsubscribePrompts: (() => void) | undefined;
  private staleTimer: unknown;

  constructor(
    private readonly registry: GeneratingSessionsSource,
    private readonly logger: Logger,
    private readonly clock: ForegroundSourceClock = REAL_CLOCK,
    private readonly staleCeilingMs: number = STALE_GENERATING_CEILING_MS,
    /**
     * Resolved lazily (first read or first subscription), so a host whose
     * permission handler cannot be built still gets the plain turn signal.
     */
    private readonly promptWaits?: () => PromptWaitSource | undefined,
  ) {}

  private resolvedPrompts: PromptWaitSource | undefined;

  private resolvePromptWaits(quiet = false): PromptWaitSource | undefined {
    if (this.resolvedPrompts !== undefined) return this.resolvedPrompts;
    if (this.promptWaits === undefined) return undefined;
    try {
      this.resolvedPrompts = this.promptWaits();
      if (this.resolvedPrompts !== undefined) {
        this.logger.debug?.(`${LOG_TAG} prompt-wait source attached`);
      }
      return this.resolvedPrompts;
    } catch (error: unknown) {
      // degradation-audit: reported - warn-logged once; the turn signal stays correct without the prompt source.
      if (quiet) {
        // Subscription time: the host may still be composing. A read retries.
        this.logger.debug?.(
          `${LOG_TAG} prompt-wait source not ready yet; a later read retries`,
        );
      } else if (!this.warnedPromptSource) {
        this.warnedPromptSource = true;
        this.logger.warn(
          `${LOG_TAG} prompt-wait source unavailable — approval waits count as busy`,
          { reason: error instanceof Error ? error.message : String(error) },
        );
      }
      return undefined;
    }
  }
  private warnedPromptSource = false;

  /**
   * Subscribes to prompt changes once the source can be resolved. The governor
   * subscribes while the host is still composing (Electron registers the
   * webview manager the permission handler needs AFTER the SDK services), so
   * the first attempt can fail. Every read retries it, and the first read after
   * startup happens on a turn transition, before any prompt can exist.
   */
  private ensurePromptSubscription(quiet = false): void {
    if (this.unsubscribePrompts !== undefined || this.listeners.size === 0) {
      return;
    }
    this.unsubscribePrompts = this.resolvePromptWaits(
      quiet,
    )?.onPromptWaitChange(() => {
      this.notify();
    });
  }

  /**
   * True while a session has been generating for less than the stale ceiling.
   * Also (re)arms the stale-deadline timer for the youngest-to-expire record.
   */
  isForegroundBusy(): boolean {
    const now = this.clock.now();
    const current = new Set<string>();
    let nextStaleAt = Number.POSITIVE_INFINITY;
    const generating = this.registry.generatingSessions();
    // The source only matters while a session generates. An idle read during
    // host start-up (handler not built yet) must not warn: a later read retries.
    const idle = generating.length === 0;
    this.ensurePromptSubscription(idle);
    const prompts = this.resolvePromptWaits(idle);
    for (const { sessionId, since } of generating) {
      const staleAt = since + this.staleCeilingMs;
      if (now < staleAt) {
        // A session blocked on a human prompt is not foreground work. It sets
        // no stale deadline either: the answer notifies, and the next read
        // arms the timer.
        if (prompts?.isSessionWaitingOnPrompt(sessionId)) continue;
        nextStaleAt = Math.min(nextStaleAt, staleAt);
        continue;
      }
      const key = `${sessionId}@${since}`;
      current.add(key);
      if (!this.warnedStale.has(key)) {
        this.warnedStale.add(key);
        this.logger.warn(
          `${LOG_TAG} session generating past the stale ceiling — no longer holding background work`,
          {
            sessionId,
            generatingForMs: now - since,
            staleCeilingMs: this.staleCeilingMs,
          },
        );
      }
    }
    // Forget records that settled or were evicted, so the set stays bounded.
    for (const key of this.warnedStale) {
      if (!current.has(key)) this.warnedStale.delete(key);
    }
    const busy = Number.isFinite(nextStaleAt);
    this.armStaleTimer(busy ? nextStaleAt - now : null);
    return busy;
  }

  onForegroundChange(listener: () => void): () => void {
    this.listeners.add(listener);
    if (this.unsubscribeRegistry === undefined) {
      this.unsubscribeRegistry = this.registry.onGeneratingChange(() => {
        this.notify();
      });
    }
    this.ensurePromptSubscription(true);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size > 0) return;
      this.unsubscribeRegistry?.();
      this.unsubscribeRegistry = undefined;
      this.unsubscribePrompts?.();
      this.unsubscribePrompts = undefined;
      this.armStaleTimer(null);
    };
  }

  private armStaleTimer(delayMs: number | null): void {
    if (this.staleTimer !== undefined) {
      this.clock.clearTimeout(this.staleTimer);
      this.staleTimer = undefined;
    }
    if (delayMs === null || this.listeners.size === 0) return;
    this.staleTimer = this.clock.setTimeout(() => {
      this.staleTimer = undefined;
      this.notify();
    }, delayMs);
  }

  /**
   * Fan out, isolated per listener. Runs inside the registry's turn
   * transitions, so a throw here must never reach them.
   */
  private notify(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error: unknown) {
        this.logger.warn(`${LOG_TAG} foreground listener threw`, {
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

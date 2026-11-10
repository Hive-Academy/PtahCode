import {
  DestroyRef,
  Injectable,
  Injector,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { LoggingService } from '@ptah-extension/core';
import {
  QueuedFollowUpStore,
  TabManagerService,
  TabWorkspacePartitionService,
  type QueuedFollowUpRef,
} from '@ptah-extension/chat-state';
import type { TabState } from '@ptah-extension/chat-types';
import type { SessionBudgetState } from '@ptah-extension/shared';
import { displayBudgetStage } from '../components/molecules/notifications/session-budget-format';
import { FollowUpQueueService } from './chat-store/follow-up-queue.service';
import { MessageDispatchService } from './chat-store/message-dispatch.service';
import { SessionAutoHandoffService } from './session-auto-handoff.service';
import { SessionHandoffSkillService } from './session-handoff-skill.service';
import { buildHandoffCommand } from './session-handoff-prompts';

/** One session that reached its limit with the setting on, and the tab to send to. */
interface HandoffCandidate {
  readonly tabId: string;
  readonly sessionId: string;
  readonly budget: SessionBudgetState;
}

/** A queued hand-off whose session is no longer at its limit. */
interface StaleHandoff {
  readonly sessionId: string;
  readonly queued: QueuedFollowUpRef;
}

/**
 * Delays before a failed attempt is allowed again, in ms. The last entry
 * repeats. One timer wakes the earliest pending retry.
 */
const RETRY_DELAYS_MS: readonly number[] = [5_000, 15_000, 30_000, 60_000];

/** Failed attempts after which the session is left alone for this page's lifetime. */
const MAX_FAILED_ATTEMPTS = 5;

const LOG_CONTEXT = '[SessionAutoHandoff]';

/**
 * SessionAutoHandoffCoordinatorService - the ROOT trigger of "hand off
 * automatically at 100%" (`sessionBudget.autoHandoffAtLimit`, TASK_2026_863).
 *
 * The old trigger lived in the per-view `SessionBudgetActionsService` and read
 * only the SHOWN tab and its visible banner, so a background tab — or a
 * background workspace partition — that reached its limit never fired. This
 * coordinator watches the budget state of EVERY mounted tab, in the active
 * workspace and every background partition:
 *
 * - The effect depends on the active tab-set signal and the background
 *   revision, so any tab update in any partition re-evaluates every candidate.
 * - It also reads the pending-permission state of each candidate, so a session
 *   that must wait for a prompt fires once the prompt is answered.
 * - A candidate is claimed atomically in {@link SessionAutoHandoffService}
 *   before the send: once per session, app-wide.
 * - The send goes through the same queued path as the wrap-up button
 *   (`MessageDispatchService.sendOrQueueMessage` with an explicit tab id), so a
 *   running turn queues it and a pending permission is not denied.
 * - A confirmed skill absence (`missing`) marks the session once. A transient
 *   probe or send failure does not: the claim is released and the next budget
 *   update retries, rate-limited by {@link RETRY_DELAYS_MS} and capped at
 *   {@link MAX_FAILED_ATTEMPTS}, so there is no tight loop.
 *
 * The banner keeps only its DISPLAY role: it projects the queued state and its
 * Cancel through the same claim store. Sessions with no mounted tab are out of
 * scope (they have no queue to send into).
 */
@Injectable({ providedIn: 'root' })
export class SessionAutoHandoffCoordinatorService {
  private readonly tabManager = inject(TabManagerService);
  private readonly partition = inject(TabWorkspacePartitionService);
  private readonly messageDispatch = inject(MessageDispatchService);
  private readonly followUpStore = inject(QueuedFollowUpStore);
  /** Resolved on first use: the queue service has its own construction-time wiring. */
  private readonly injector = inject(Injector);
  private readonly autoHandoff = inject(SessionAutoHandoffService);
  private readonly skill = inject(SessionHandoffSkillService);
  private readonly logger = inject(LoggingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly retryRevision = signal(0);
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  /** Sessions with a probe or send in flight; guarded synchronously, so a re-run cannot double-fire. */
  private readonly inFlight = new Set<string>();
  /** Sessions whose workspace confirmed it has no `session-handoff` skill. */
  private readonly skillMissing = new Set<string>();
  /** Earliest next attempt per session, as `Date.now()` ms; a failed attempt sets it. */
  private readonly nextAttemptAt = new Map<string, number>();
  /** Failed attempts per session since the last qualifying change. */
  private readonly failedAttempts = new Map<string, number>();
  /** Sessions that exhausted {@link MAX_FAILED_ATTEMPTS}; left alone for this page's lifetime. */
  private readonly givenUp = new Set<string>();
  private readonly loggedSkips = new Set<string>();
  /** Sessions whose queued hand-off is being withdrawn because the confirmed stage is below `limit`. */
  private readonly withdrawing = new Set<string>();

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.retryTimer !== null) clearTimeout(this.retryTimer);
      this.loggedSkips.clear();
    });
    effect(() => {
      this.retryRevision();
      const candidates = this.candidates();
      const stale = this.staleQueued();
      if (candidates.length === 0 && stale.length === 0) return;
      untracked(() => {
        for (const item of stale) void this.withdrawStale(item);
        for (const candidate of candidates) void this.fire(candidate);
      });
    });
  }

  /**
   * Every session that must fire now, one tab each: a limit budget with the
   * setting on, not yet claimed, cancelled, wrapped up by hand, marked without
   * the skill, in flight, rate-gated or given up — and with no pending
   * permission prompt on its tab. Called inside the effect: every read here
   * that can change (tab state in both partitions, the permission prompts)
   * re-runs the effect when it changes.
   */
  private candidates(): readonly HandoffCandidate[] {
    const now = Date.now();
    const found: HandoffCandidate[] = [];
    const sessions = new Set<string>();
    for (const tab of this.budgetTabs()) {
      const budget = tab.sessionBudget;
      if (!budget || budgetStage(tab) !== 'limit') continue;
      const sessionId = tab.claudeSessionId;
      if (typeof sessionId !== 'string') continue;
      if (budget.sessionId !== sessionId) {
        this.logSkip(sessionId, 'session id mismatch', tab.id);
        continue;
      }
      if (budget.autoHandoff !== true) {
        this.logSkip(sessionId, 'auto handoff off', tab.id);
        continue;
      }
      if (sessions.has(sessionId)) continue; // the first tab per session sends
      sessions.add(sessionId);
      const entry = this.autoHandoff.entry(sessionId);
      if (entry !== null) {
        this.logSkip(sessionId, entry.state === 'cancelled' ? 'cancelled' : 'already claimed', tab.id);
        continue;
      }
      if (this.autoHandoff.isManuallyWrappedUp(sessionId)) {
        this.logSkip(sessionId, 'manual wrap-up', tab.id);
        continue;
      }
      if (this.skillMissing.has(sessionId)) {
        this.logSkip(sessionId, 'skill unavailable', tab.id);
        continue;
      }
      if (this.givenUp.has(sessionId)) {
        this.logSkip(sessionId, 'retry limit reached', tab.id);
        continue;
      }
      if (this.inFlight.has(sessionId)) continue;
      const gatedAt = this.nextAttemptAt.get(sessionId);
      if (gatedAt !== undefined && now < gatedAt) continue;
      if (tab.status === 'resuming') {
        this.logSkip(sessionId, 'pending resume', tab.id);
        continue;
      }
      // A queued message would deny the prompt; this tracked read re-runs the
      // effect once the prompt is answered.
      if (this.messageDispatch.hasPendingPermissionForTab(tab.id)) {
        this.logSkip(sessionId, 'pending permission', tab.id);
        continue;
      }
      found.push({ tabId: tab.id, sessionId, budget });
    }
    return found;
  }

  private atLimit(tabId: string): boolean {
    const tab = this.tabManager.findTabByIdAcrossWorkspaces(tabId)?.tab ?? null;
    return tab !== null && budgetStage(tab) === 'limit';
  }

  /** Tabs in both partitions; the tracked reads re-run the effect when either changes. */
  private budgetTabs(): readonly TabState[] {
    const activeTabs = this.tabManager.tabs();
    this.tabManager.backgroundTabsRevision();
    return [
      ...activeTabs,
      ...this.partition.findBackgroundTabs(
        (tab) => tab.sessionBudget !== null && tab.sessionBudget !== undefined,
      ),
    ];
  }

  /**
   * Hand-offs queued on the live estimate of a running turn (D25) whose stage
   * is no longer `limit`: the turn's result cleared the estimate and the
   * confirmed stage stayed below the limit. They must not run.
   */
  private staleQueued(): readonly StaleHandoff[] {
    const found: StaleHandoff[] = [];
    for (const tab of this.budgetTabs()) {
      const sessionId = tab.claudeSessionId;
      if (typeof sessionId !== 'string' || tab.sessionBudget?.sessionId !== sessionId) continue;
      if (budgetStage(tab) === 'limit') continue;
      const entry = this.autoHandoff.entry(sessionId);
      if (entry?.state !== 'fired' || !entry.queued || entry.queued.tabId !== tab.id) continue;
      if (this.withdrawing.has(sessionId) || !this.followUpStore.isPending(entry.queued.clientMessageId)) continue;
      found.push({ sessionId, queued: entry.queued });
    }
    return found;
  }

  /** Withdraw one stale queued hand-off; a later confirmed `limit` fires a new one. */
  private async withdrawStale({ sessionId, queued }: StaleHandoff): Promise<void> {
    this.withdrawing.add(sessionId);
    try {
      const withdrawn = await this.injector.get(FollowUpQueueService).withdraw(queued, { restore: false });
      this.logger.info(
        LOG_CONTEXT,
        withdrawn
          ? 'queued automatic hand-off withdrawn: the confirmed stage is below the limit'
          : 'queued automatic hand-off not withdrawn: a turn already took it',
        { sessionId, tabId: queued.tabId },
      );
    } catch (error: unknown) {
      this.logger.warn(LOG_CONTEXT, 'withdrawing the queued automatic hand-off failed', { sessionId, error });
    } finally {
      this.withdrawing.delete(sessionId);
    }
  }

  private logSkip(sessionId: string, reason: string, tabId: string): void {
    const key = `${sessionId}:${reason}`;
    if (this.loggedSkips.has(key)) return;
    this.loggedSkips.add(key);
    this.logger.info(LOG_CONTEXT, `automatic hand-off skipped: ${reason}`, { sessionId, tabId });
  }

  /**
   * Probe the skill, claim the session, and send `/session-handoff` to the
   * captured tab through the queued send path. Runs untracked: the effect
   * re-fires it from fresh state whenever something changes.
   */
  private async fire(candidate: HandoffCandidate): Promise<void> {
    const { tabId, sessionId } = candidate;
    this.inFlight.add(sessionId);
    try {
      const probe = await this.skill.probe();
      if (probe === 'missing') {
        // Confirmed: this workspace resolves no `/session-handoff`. The
        // automatic hand-off never falls back to the inline prompt (it would
        // repeat on every reload); the button keeps its manual fallback.
        this.skillMissing.add(sessionId);
        this.logSkip(sessionId, 'skill unavailable', tabId);
        this.logger.info(
          LOG_CONTEXT,
          'the session-handoff skill is not installed; the automatic hand-off stays off for the session',
          { tabId, sessionId },
        );
        return;
      }
      if (probe === 'transient') {
        this.deferAttempt(sessionId, 'the skill probe failed');
        return;
      }
      // The probe was asynchronous: re-read the tab, not the view. A tab
      // switch does not abort it — the hand-off belongs to the session.
      const target = this.stillQualifies(tabId, sessionId);
      if (!target) {
        this.logSkip(sessionId, 'tab no longer qualifies or is not mounted', tabId);
        return;
      }
      if (
        this.autoHandoff.isManuallyWrappedUp(sessionId) ||
        this.messageDispatch.hasPendingPermissionForTab(tabId)
      ) {
        this.logSkip(sessionId, this.autoHandoff.isManuallyWrappedUp(sessionId) ? 'manual wrap-up' : 'pending permission', tabId);
        return; // the effect re-fires once the blocker clears
      }
      if (!this.autoHandoff.claim(sessionId)) {
        this.logSkip(sessionId, 'already claimed', tabId);
        return;
      }
      const outcome = await this.messageDispatch.sendOrQueueMessage(
        buildHandoffCommand(target.budget),
        { tabId },
      );
      if (outcome?.success !== true) {
        // The send path already showed its own failure notice.
        this.autoHandoff.release(sessionId);
        this.deferAttempt(sessionId, 'the hand-off send failed');
        return;
      }
      // Queued (the turn runs): delivery is reported by the follow-up store.
      const queued = outcome.queued ?? null;
      this.autoHandoff.recordQueued(sessionId, queued);
      this.logger.info(LOG_CONTEXT, 'automatic hand-off fired', { sessionId, tabId, delivery: queued ? 'queued' : 'sent' });
      if (queued) this.watchQueued(sessionId, queued);
    } catch (error: unknown) {
      this.autoHandoff.release(sessionId);
      this.deferAttempt(sessionId, 'the hand-off attempt threw');
      this.logger.warn(LOG_CONTEXT, 'the automatic hand-off attempt failed', {
        tabId,
        sessionId,
        error,
      });
    } finally {
      this.inFlight.delete(sessionId);
    }
  }

  /**
   * Follow the queued command to its outcome. Delivered: the hand-off ran.
   * Withdrawn (Stop, tab closed) or failed: release the claim and retry later,
   * unless the user cancelled it.
   */
  private watchQueued(sessionId: string, queued: QueuedFollowUpRef): void {
    this.followUpStore.onSettled(queued.clientMessageId, (outcome) => {
      if (outcome === 'delivered' || outcome === 'steered') {
        if (this.autoHandoff.entry(sessionId) === null) {
          this.autoHandoff.claim(sessionId);
        }
        return;
      }
      if (this.autoHandoff.entry(sessionId)?.state === 'cancelled') return;
      this.autoHandoff.release(sessionId);
      // Withdrawn because the confirmed stage is below the limit (here, or by
      // the queue at its send): not a failure. A later limit fires again.
      if (outcome === 'withdrawn' && !this.atLimit(queued.tabId)) return;
      this.deferAttempt(
        sessionId,
        outcome === 'failed'
          ? 'the queued hand-off send failed'
          : 'the queued hand-off was withdrawn before it ran',
      );
    });
  }

  /**
   * After the probe: the tab still exists, still holds the session, and the
   * session still reached its limit with the setting on.
   */
  private stillQualifies(
    tabId: string,
    sessionId: string,
  ): { readonly budget: SessionBudgetState } | null {
    const tab = this.tabManager.findTabByIdAcrossWorkspaces(tabId)?.tab ?? null;
    const budget = tab?.sessionBudget ?? null;
    if (!tab || !budget) return null;
    if (tab.claudeSessionId !== sessionId) return null;
    if (budget.sessionId !== sessionId) return null;
    if (budget.autoHandoff !== true) return null;
    if (tab.status === 'resuming') return null;
    return handoffStageReached(tab) ? { budget } : null;
  }

  /**
   * Count one failed attempt and gate the session's next one. After
   * {@link MAX_FAILED_ATTEMPTS} the session is given up for this page.
   */
  private deferAttempt(sessionId: string, reason: string): void {
    const failures = (this.failedAttempts.get(sessionId) ?? 0) + 1;
    if (failures >= MAX_FAILED_ATTEMPTS) {
      this.failedAttempts.delete(sessionId);
      this.nextAttemptAt.delete(sessionId);
      this.givenUp.add(sessionId);
      this.scheduleRetryWake();
      this.logger.warn(
        LOG_CONTEXT,
        `the automatic hand-off stopped retrying after ${MAX_FAILED_ATTEMPTS} failed attempts`,
        { sessionId, lastReason: reason },
      );
      return;
    }
    this.failedAttempts.set(sessionId, failures);
    const delay =
      RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length) - 1];
    this.nextAttemptAt.set(sessionId, Date.now() + delay);
    this.scheduleRetryWake();
    this.logger.info(
      LOG_CONTEXT,
      `the automatic hand-off will retry: ${reason}`,
      {
        sessionId,
        retryInMs: delay,
      },
    );
  }

  private scheduleRetryWake(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const now = Date.now();
    const next = [...this.nextAttemptAt.values()]
      .filter((at) => at > now)
      .reduce((earliest, at) => Math.min(earliest, at), Infinity);
    if (!Number.isFinite(next)) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.scheduleRetryWake();
      this.retryRevision.update((value) => value + 1);
    }, next - now);
  }
}

/**
 * True when the tab shows a session budget whose display stage reached
 * `limit`: the higher of the authoritative stage and the live estimate of the
 * running turn (D25) — the same rule the banner shows.
 */
function handoffStageReached(tab: TabState): boolean {
  const budget = tab.sessionBudget;
  if (!budget) return false;
  if (budget.autoHandoff !== true) return false;
  if (typeof tab.claudeSessionId !== 'string') return false;
  if (budget.sessionId !== tab.claudeSessionId) return false;
  return budgetStage(tab) === 'limit';
}

function budgetStage(tab: TabState): string | undefined {
  const budget = tab.sessionBudget;
  if (!budget) return undefined;
  return (
    tab.status === 'streaming'
      ? displayBudgetStage(budget.stage, tab.liveBudgetStage ?? null)
      : budget.stage
  );
}

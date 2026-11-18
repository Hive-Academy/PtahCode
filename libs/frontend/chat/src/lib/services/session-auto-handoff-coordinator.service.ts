import {
  DestroyRef,
  Injectable,
  Injector,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ClaudeRpcService, LoggingService } from '@ptah-extension/core';
import {
  QueuedFollowUpStore,
  TabManagerService,
  TabWorkspacePartitionService,
  SessionTurnActivityStore,
  type QueuedFollowUpRef,
} from '@ptah-extension/chat-state';
import type { TabState } from '@ptah-extension/chat-types';
import type { SessionBudgetState } from '@ptah-extension/shared';
import { FollowUpQueueService } from './chat-store/follow-up-queue.service';
import { MessageDispatchService } from './chat-store/message-dispatch.service';
import { ChatStore } from './chat.store';
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
  readonly queued: QueuedFollowUpRef | null;
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
 * only the SHOWN tab and its visible banner, so a background tab â€” or a
 * background workspace partition â€” that reached its limit never fired. This
 * coordinator watches the budget state of EVERY mounted tab, in the active
 * workspace and every background partition. Only sessions with renderer or backend-confirmed turn activity in
 * this page lifetime qualify, even if their budget reaches the limit after the
 * turn ends: a reopened idle session at its limit does not fire.
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
  private readonly turnActivity = inject(SessionTurnActivityStore);
  private readonly messageDispatch = inject(MessageDispatchService);
  private readonly followUpStore = inject(QueuedFollowUpStore);
  /** Resolved on first use: the queue service has its own construction-time wiring. */
  private readonly injector = inject(Injector);
  private readonly autoHandoff = inject(SessionAutoHandoffService);
  private readonly skill = inject(SessionHandoffSkillService);
  private readonly logger = inject(LoggingService);
  private readonly rpc = inject(ClaudeRpcService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly retryRevision = signal(0);
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly reconcileTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Delivery alone does not prove a turn started; retain observations past polling. */
  private readonly awaitingSettlement = new Map<string, {
    tabId: string;
    state: 'waiting' | 'streaming' | 'settled';
  }>();
  private readonly deferralTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Sessions with a probe or send in flight; guarded synchronously, so a re-run cannot double-fire. */
  private readonly inFlight = new Set<string>();
  /** Sessions whose workspace confirmed it has no `session-handoff` skill. */
  private readonly skillMissing = new Set<string>();
  /** Earliest next attempt per session, as `Date.now()` ms; a failed attempt sets it. */
  private readonly nextAttemptAt = new Map<string, number>();
  /** Failed attempts per session since the last qualifying change. */
  private readonly failedAttempts = new Map<string, number>();
  /** Successful command submissions, retained when a stale pending claim is released. */
  private readonly sentAttempts = new Map<string, number>();
  /** Sessions that exhausted {@link MAX_FAILED_ATTEMPTS}; left alone for this page's lifetime. */
  private readonly givenUp = new Set<string>();
  private readonly loggedSkips = new Set<string>();
  /** Sessions whose queued hand-off is being withdrawn because the confirmed stage is below `limit`. */
  private readonly withdrawing = new Set<string>();

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.retryTimer !== null) clearTimeout(this.retryTimer);
      for (const timer of this.reconcileTimers.values()) clearTimeout(timer);
      for (const timer of this.deferralTimers.values()) clearTimeout(timer);
      this.loggedSkips.clear();
    });
    effect(() => {
      this.retryRevision();
      const candidates = this.candidates();
      const stale = this.staleQueued();
      for (const [sessionId, delivery] of this.awaitingSettlement) {
        const { tabId } = delivery;
        const tab = this.budgetTabs().find((item) => item.id === tabId);
        if (!tab || tab.claudeSessionId !== sessionId || this.autoHandoff.entry(sessionId)?.state !== 'delivered') {
          this.awaitingSettlement.delete(sessionId);
        } else if (tab.status === 'streaming') {
          delivery.state = 'streaming';
        } else if (delivery.state === 'streaming') {
          delivery.state = 'settled';
          this.scheduleReconcile(tabId, sessionId, 0);
        }
      }
      this.clearObsoleteTimers();
      if (candidates.length === 0 && stale.length === 0) return;
      untracked(() => {
        for (const item of stale) void this.withdrawStale(item);
        for (const candidate of candidates) void this.fire(candidate);
      });
    });
  }

  /**
   * Sessions with turn activity this page that must fire now, one tab each: at the
   * limit with the setting on, not yet claimed, cancelled, wrapped up by hand, marked without
   * the skill, in flight, rate-gated or given up â€” and with no pending
   * permission prompt on its tab. Called inside the effect: every read here
   * that can change (tab state in both partitions, the permission prompts)
   * re-runs the effect when it changes.
   */
  private candidates(): readonly HandoffCandidate[] {
    const now = Date.now();
    const found: HandoffCandidate[] = [];
    const sessions = new Set<string>();
    for (const tab of this.budgetTabs()) {
      const sessionId = tab.claudeSessionId;
      const budget = tab.sessionBudget;
      if (!budget || budget.stage !== 'limit') continue;
      if (typeof sessionId !== 'string') continue;
      if (budget.sessionId !== sessionId) {
        this.logSkip(sessionId, 'session id mismatch', tab.id);
        continue;
      }
      if (budget.autoHandoff !== true) {
        this.logSkip(sessionId, 'auto handoff off', tab.id);
        continue;
      }
      if (!this.turnActivity.hasTurnActivity(sessionId)) {
        this.logSkip(sessionId, 'no turn in this page lifetime', tab.id);
        continue;
      }
      if (sessions.has(sessionId)) continue; // the first tab per session sends
      sessions.add(sessionId);
      const entry = this.autoHandoff.entry(sessionId);
      // This tracked read wakes a deferred intent when compaction ends.
      const compacting = this.compacting(tab.id);
      if (!compacting) {
        const timer = this.deferralTimers.get(sessionId);
        if (timer) clearTimeout(timer);
        this.deferralTimers.delete(sessionId);
      }
      if (entry !== null && !(entry.state === 'pending' && entry.attempts > 0 && entry.queued === null)) {
        const timer = this.deferralTimers.get(sessionId);
        if (timer && entry.state === 'cancelled') {
          clearTimeout(timer);
          this.deferralTimers.delete(sessionId);
        }
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
    return tab?.sessionBudget?.stage === 'limit';
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
      if (tab.sessionBudget.stage === 'limit') continue;
      const entry = this.autoHandoff.entry(sessionId);
      if (entry?.state !== 'pending' || this.withdrawing.has(sessionId)) continue;
      if (entry.queued && (entry.queued.tabId !== tab.id || !this.followUpStore.isPending(entry.queued.clientMessageId))) continue;
      found.push({ sessionId, queued: entry.queued });
    }
    return found;
  }

  /** Withdraw one stale queued hand-off; a later confirmed `limit` fires a new one. */
  private async withdrawStale({ sessionId, queued }: StaleHandoff): Promise<void> {
    this.withdrawing.add(sessionId);
    try {
      if (!queued) {
        this.autoHandoff.release(sessionId);
        return;
      }
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
      if (this.compacting(tabId)) {
        this.deferCompaction(candidate);
        return;
      }
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
      // switch does not abort it â€” the hand-off belongs to the session.
      const target = this.stillQualifies(tabId, sessionId);
      if (!target) {
        this.logSkip(sessionId, 'tab no longer qualifies or is not mounted', tabId);
        return;
      }
      if (this.compacting(tabId)) {
        this.deferCompaction(candidate);
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
      if ((this.sentAttempts.get(sessionId) ?? 0) >= MAX_FAILED_ATTEMPTS) {
        this.autoHandoff.transition(sessionId, 'failed');
        return;
      }
      if (!(await this.checkBeforeSend(tabId, sessionId))) {
        this.scheduleReconcile(tabId, sessionId, 1);
        return;
      }
      if (!this.stillQualifies(tabId, sessionId)) {
        this.autoHandoff.release(sessionId);
        return;
      }
      if (this.autoHandoff.isManuallyWrappedUp(sessionId) || this.autoHandoff.entry(sessionId)?.state !== 'pending') return;
      if (this.compacting(tabId)) {
        this.autoHandoff.release(sessionId);
        this.deferCompaction(candidate);
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
      this.sentAttempts.set(sessionId, (this.sentAttempts.get(sessionId) ?? 0) + 1);
      if (!queued) {
        this.awaitingSettlement.set(sessionId, { tabId, state: 'waiting' });
        this.autoHandoff.transition(sessionId, 'delivered');
      }
      this.scheduleReconcile(tabId, sessionId, 0);
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
        this.awaitingSettlement.set(sessionId, { tabId: queued.tabId, state: 'waiting' });
        this.autoHandoff.transition(sessionId, 'delivered');
        this.scheduleReconcile(queued.tabId, sessionId, 0);
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
    if (!this.turnActivity.hasTurnActivity(sessionId)) return null;
    if (tab.status === 'resuming') return null;
    return budget.stage === 'limit' ? { budget } : null;
  }

  private compacting(tabId: string): boolean {
    return this.injector.get(ChatStore).isCompactingForTab(tabId);
  }

  private clearObsoleteTimers(): void {
    for (const [sessionId, timer] of this.deferralTimers) {
      const bound = this.budgetTabs().some((tab) => tab.claudeSessionId === sessionId && tab.sessionBudget?.sessionId === sessionId);
      if (bound && this.autoHandoff.entry(sessionId)?.state !== 'cancelled') continue;
      clearTimeout(timer);
      this.deferralTimers.delete(sessionId);
    }
    for (const [sessionId, timer] of this.reconcileTimers) {
      const bound = this.budgetTabs().some((tab) => tab.claudeSessionId === sessionId && tab.sessionBudget?.sessionId === sessionId);
      if (bound && this.autoHandoff.entry(sessionId)?.state !== 'cancelled') continue;
      clearTimeout(timer);
      this.reconcileTimers.delete(sessionId);
    }
    for (const [sessionId, { tabId }] of this.awaitingSettlement) {
      if (!this.budgetTabs().some((tab) => tab.id === tabId && tab.claudeSessionId === sessionId)) {
        this.awaitingSettlement.delete(sessionId);
      }
    }
  }

  private deferCompaction(candidate: HandoffCandidate): void {
    const { sessionId, tabId } = candidate;
    if (this.deferralTimers.has(sessionId)) return;
    const timer = setTimeout(() => {
      this.deferralTimers.delete(sessionId);
      if (this.compacting(tabId) && this.stillQualifies(tabId, sessionId)) {
        this.autoHandoff.claim(sessionId);
        this.autoHandoff.transition(sessionId, 'failed');
      } else {
        this.retryRevision.update((value) => value + 1);
      }
    }, 600_000);
    this.deferralTimers.set(sessionId, timer);
  }

  private async checkBeforeSend(tabId: string, sessionId: string): Promise<boolean> {
    const result = await this.rpc.call('session:handoffStatus', { tabId, sessionId }).catch((error: unknown) => {
      this.logger.warn(LOG_CONTEXT, 'handoff status lookup failed', { tabId, sessionId, error });
      return null;
    });
    if (!result) {
      this.autoHandoff.transition(sessionId, 'pending', true);
      return false;
    }
    const status = result.success && result.data ? result.data : { state: 'unavailable' as const };
    if (status.state === 'recorded' || status.state === 'closePending') {
      this.autoHandoff.transition(sessionId, 'recorded');
      return false;
    }
    if (status.state === 'closeCompleted') {
      this.autoHandoff.transition(sessionId, 'completed');
      return false;
    }
    if (status.state === 'unavailable') {
      this.autoHandoff.transition(sessionId, this.autoHandoff.entry(sessionId)?.state ?? 'pending', true);
      return false;
    }
    return status.state === 'absent';
  }

  private scheduleReconcile(tabId: string, sessionId: string, step: number): void {
    const previous = this.reconcileTimers.get(sessionId);
    if (previous) clearTimeout(previous);
    const delay = step === 0 ? 0 : RETRY_DELAYS_MS[Math.min(step - 1, RETRY_DELAYS_MS.length - 1)];
    const timer = setTimeout(() => {
      this.reconcileTimers.delete(sessionId);
      void this.reconcile(tabId, sessionId, step);
    }, delay);
    this.reconcileTimers.set(sessionId, timer);
  }

  private async reconcile(tabId: string, sessionId: string, step: number): Promise<void> {
    const entry = this.autoHandoff.entry(sessionId);
    if (!entry || entry.state === 'cancelled' || entry.state === 'completed' || entry.state === 'failed') return;
    const tab = this.tabManager.findTabByIdAcrossWorkspaces(tabId)?.tab;
    if (tab?.claudeSessionId !== sessionId) return;
    try {
      const result = await this.rpc.call('session:handoffStatus', { tabId, sessionId });
      const current = this.autoHandoff.entry(sessionId);
      const currentTab = this.tabManager.findTabByIdAcrossWorkspaces(tabId)?.tab;
      if (!current || current.state === 'cancelled' || current.state === 'completed' || current.state === 'failed' || currentTab?.claudeSessionId !== sessionId) return;
      const status = result.success && result.data ? result.data : { state: 'unavailable' as const };
      if (status.state === 'recorded' || status.state === 'closePending') {
        this.autoHandoff.transition(sessionId, 'recorded');
        if (step < 12) this.scheduleReconcile(tabId, sessionId, step + 1);
        return;
      }
      if (status.state === 'closeCompleted') {
        this.autoHandoff.transition(sessionId, 'completed');
        return;
      }
      if (status.state === 'unavailable') {
        this.autoHandoff.transition(sessionId, current.state, true);
      } else if (status.state === 'absent' && current.state === 'pending' && current.attempts === 0 && current.queued === null) {
        this.autoHandoff.release(sessionId);
        this.retryRevision.update((value) => value + 1);
        return;
      } else if (status.state === 'absent' && current.state === 'delivered' &&
        this.awaitingSettlement.get(sessionId)?.state === 'settled' && currentTab.status !== 'streaming') {
        if ((this.sentAttempts.get(sessionId) ?? current.attempts) >= MAX_FAILED_ATTEMPTS) {
          this.autoHandoff.transition(sessionId, 'failed');
          return;
        }
        if (!this.compacting(tabId) && this.stillQualifies(tabId, sessionId)) {
          this.autoHandoff.releaseForResend(sessionId);
          this.retryRevision.update((value) => value + 1);
          return;
        }
      }
    } catch (error: unknown) {
      this.logger.warn(LOG_CONTEXT, 'handoff status lookup failed', { tabId, sessionId, error });
      const current = this.autoHandoff.entry(sessionId);
      if (current && current.state !== 'cancelled' && current.state !== 'completed' && current.state !== 'failed') {
        this.autoHandoff.transition(sessionId, current.state, true);
      }
    }
    if (step < 12) this.scheduleReconcile(tabId, sessionId, step + 1);
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
      this.autoHandoff.claim(sessionId);
      this.autoHandoff.transition(sessionId, 'failed');
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

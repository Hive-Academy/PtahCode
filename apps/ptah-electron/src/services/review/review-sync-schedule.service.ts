import type { IHandlerRegistry, IJobStore, JobHandlerContext, JobHandlerResult, UpsertJobInput } from '@ptah-extension/cron-scheduler';
import type { IReviewSettingsStore, ReviewOrchestratorService } from '@ptah-extension/review-core';
import type { RepoIdentity } from '@ptah-extension/review-contracts';
import type { JobId } from '@ptah-extension/shared';
import type { Logger } from '@ptah-extension/vscode-core';

/** Named cron handler for the one review sync job (TASK_2026_901). */
export const REVIEW_SYNC_HANDLER = 'review:sync';
/** Deterministic system job ID: repeated boots and processes upsert the same row. */
export const REVIEW_SYNC_JOB_ID = '@ptah/review-sync';
/** The discovery-only job this service replaces; it is removed so it cannot fire with no handler. */
export const LEGACY_REVIEW_DISCOVERY_JOB_ID = '@ptah/review-discovery';
export const LEGACY_REVIEW_DISCOVERY_HANDLER = 'review:discover';

export const REVIEW_SYNC_TOKENS = {
  /** Optional {@link ReviewSyncHooks}; the host binds the review-core/review-github sync operations here. */
  HOOKS: Symbol.for('ElectronReviewSyncHooks'),
  SCHEDULE: Symbol.for('ElectronReviewSyncSchedule'),
} as const;

/**
 * Sync operations that come from the status and thread work of TASK_2026_901. Each hook is
 * optional, so the schedule works before the operation exists and when it is not configured.
 * A hook must not run review lanes inline: the detached worker drains the queue.
 */
export interface ReviewSyncHooks {
  /** Reads GitHub review-thread resolution into local findings. Returns the changed finding count. */
  syncThreads?(repo: RepoIdentity, signal: AbortSignal): Promise<number>;
  /**
   * Startup recovery for statuses this machine owns: resume a lease-requeued attempt on the same
   * head, otherwise complete its own in-progress status with a reason. It never touches a status
   * that another machine owns. Returns the recovered status count.
   */
  recoverStatuses?(signal: AbortSignal): Promise<number>;
}

export type ReviewSyncOrchestrator = Pick<ReviewOrchestratorService,
  'lastPollAt' | 'pollAndRecord' | 'reconcileStartup' | 'startupPoll'>;

/** The part of {@link IJobStore} the schedule uses; the returned rows are not read. */
export interface ReviewSyncJobStore {
  upsert(input: UpsertJobInput): unknown;
  get(id: Parameters<IJobStore['get']>[0]): unknown;
  delete(id: Parameters<IJobStore['delete']>[0]): boolean;
}

export interface ReviewSyncScheduleDeps {
  orchestrator: ReviewSyncOrchestrator;
  settings: Pick<IReviewSettingsStore, 'getSettings'>;
  /** Null when the cron scheduler registration failed; startup must still continue. */
  jobs: ReviewSyncJobStore | null;
  registry: Pick<IHandlerRegistry, 'register' | 'unregister' | 'has'> | null;
  hooks: ReviewSyncHooks;
  logger: Pick<Logger, 'error'>;
  now?: () => number;
}

export interface ReviewSyncRegistration { readonly scheduled: boolean; dispose(): void }

/**
 * One deterministic cron job that discovers new PR heads (queue dedupe makes it idempotent) and
 * syncs thread resolution. It returns promptly: reviews run in the detached queue worker.
 * Errors are logged with fixed messages, because GitHub errors can echo credentials.
 */
export class ReviewSyncScheduleService {
  private readonly now: () => number;
  private tickActive = false;
  private tickController: AbortController | null = null;

  constructor(private readonly deps: ReviewSyncScheduleDeps) {
    this.now = deps.now ?? Date.now;
  }

  /** Binds the handler and upserts the system job. A missing or failed scheduler never throws. */
  register(): ReviewSyncRegistration {
    const { jobs, registry } = this.deps;
    if (!jobs || !registry) {
      this.deps.logger.error('Review sync schedule unavailable', new Error('Review sync schedule unavailable'));
      return { scheduled: false, dispose: () => undefined };
    }
    let owned = false;
    try {
      if (!registry.has(REVIEW_SYNC_HANDLER)) {
        registry.register(REVIEW_SYNC_HANDLER, (context) => this.handle(context));
        owned = true;
      }
      jobs.upsert({ id: REVIEW_SYNC_JOB_ID, name: 'Review pull requests', cronExpr: '* * * * *',
        timezone: 'UTC', prompt: `handler:${REVIEW_SYNC_HANDLER}`, enabled: true });
      // Shown as a JobId only because the store types system IDs that way (see IJobStore.upsert).
      const legacy = LEGACY_REVIEW_DISCOVERY_JOB_ID as JobId;
      if (jobs.get(legacy)) jobs.delete(legacy);
    } catch (_error: unknown) {
      this.deps.logger.error('Review sync schedule failed', new Error('Review sync schedule failed'));
      if (owned) registry.unregister(REVIEW_SYNC_HANDLER);
      return { scheduled: false, dispose: () => undefined };
    }
    let disposed = false;
    return { scheduled: true, dispose: () => {
      if (disposed) return;
      disposed = true;
      this.tickController?.abort();
      if (owned) registry.unregister(REVIEW_SYNC_HANDLER);
    } };
  }

  /** Cron tick: discovery for each due repository, then thread sync. One failure does not stop the others. */
  async handle(context: Pick<JobHandlerContext, 'signal'>): Promise<JobHandlerResult> {
    const { signal } = context;
    if (signal.aborted) return { outcome: 'skipped', reason: 'aborted' };
    // An overlapped slot (slow GitHub) must not start a second sync for the same rows.
    if (this.tickActive) return { outcome: 'skipped', reason: 'sync-in-progress' };
    this.tickActive = true;
    try {
      const settings = await this.deps.settings.getSettings();
      const repos = this.enabledRepos(settings);
      if (!settings || repos.length === 0) {
        this.tickActive = false;
        return { outcome: 'skipped', reason: 'review-disabled' };
      }
      const controller = new AbortController();
      this.tickController = controller;
      void this.runTick(repos, settings.pollMinutes, controller.signal).catch((_error: unknown) => {
        this.deps.logger.error('Review sync tick failed', new Error('Review sync tick failed'));
      }).finally(() => { this.tickController = null; this.tickActive = false; });
      return { summary: 'Review sync started' };
    } catch (error) {
      this.tickActive = false;
      throw error;
    }
  }

  private async runTick(repos: RepoIdentity[], pollMinutes: number, signal: AbortSignal): Promise<void> {
      for (const repo of repos) {
        if (signal.aborted) break;
        try {
          const last = await this.deps.orchestrator.lastPollAt(repo);
          if (last === null || this.now() - last >= pollMinutes * 60_000)
            await this.deps.orchestrator.pollAndRecord(repo);
        } catch (_error: unknown) { this.deps.logger.error('Review poll failed', new Error('Review poll failed')); }
        if (signal.aborted || !this.deps.hooks.syncThreads) continue;
        try { await this.deps.hooks.syncThreads(repo, signal); }
        catch (_error: unknown) { this.deps.logger.error('Review thread sync failed', new Error('Review thread sync failed')); }
      }
      if (this.deps.hooks.recoverStatuses && !signal.aborted) {
        try { await this.deps.hooks.recoverStatuses(signal); }
        catch (_error: unknown) { this.deps.logger.error('Review status retry failed', new Error('Review status retry failed')); }
      }
  }

  /**
   * Startup order: requeue expired local leases, recover this machine's remote statuses, then
   * poll repositories whose last discovery is old. It never throws.
   */
  async recoverStartup(signal: AbortSignal): Promise<void> {
    try { await this.deps.orchestrator.reconcileStartup(); }
    catch (_error: unknown) { this.deps.logger.error('Review startup reconcile failed', new Error('Review startup reconcile failed')); }
    if (signal.aborted) return;
    if (this.deps.hooks.recoverStatuses) {
      try { await this.deps.hooks.recoverStatuses(signal); }
      catch (_error: unknown) { this.deps.logger.error('Review status recovery failed', new Error('Review status recovery failed')); }
    }
    let repos: RepoIdentity[] = [];
    try { repos = this.enabledRepos(await this.deps.settings.getSettings()); }
    catch (_error: unknown) { this.deps.logger.error('Review startup poll failed', new Error('Review startup poll failed')); }
    for (const repo of repos) {
      if (signal.aborted) return;
      try { await this.deps.orchestrator.startupPoll(await this.deps.orchestrator.lastPollAt(repo), repo); }
      catch (_error: unknown) { this.deps.logger.error('Review startup poll failed', new Error('Review startup poll failed')); }
    }
    if (this.deps.hooks.recoverStatuses && !signal.aborted) {
      try { await this.deps.hooks.recoverStatuses(signal); }
      catch (_error: unknown) { this.deps.logger.error('Review status recovery failed', new Error('Review status recovery failed')); }
    }
  }

  /** Strict identities only: downstream schemas reject the full settings entry. */
  private enabledRepos(settings: Awaited<ReturnType<IReviewSettingsStore['getSettings']>>): RepoIdentity[] {
    return (settings?.repositories.filter((entry) => entry.enabled) ?? [])
      .map((entry) => ({ owner: entry.owner, name: entry.name }));
  }
}

import {
  Injectable,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { AppStateManager } from '@ptah-extension/core';
import type {
  CronCreateParams,
  CronListParams,
  CronUpdateParams,
  JobRunDto,
  ScheduledJobDto,
} from '@ptah-extension/shared';
import { CronRpcService } from './cron-rpc.service';

/**
 * UI-side workspace scope filter for the Schedules tab.
 * - `'workspace'` — restrict the list to the active workspace's jobs.
 * - `'all'`       — show every workspace's jobs (global view).
 */
export type CronScopeFilter = 'workspace' | 'all';

/**
 * State of the `cron:runs` request of the selected job. The run history shows
 * "no runs" only for `'loaded'`, never while a request is open or after it
 * failed.
 */
export type CronRunsState = 'idle' | 'loading' | 'loaded' | 'error';

/**
 * Aggregate stats derived from the current job list. The backend does not
 * yet expose a `cron:stats` handler (only nine methods are wired); we derive
 * stats client-side from the job list to keep parity with the architecture
 * spec without inventing a non-existent RPC.
 */
export interface CronAggregateStats {
  total: number;
  enabled: number;
  disabled: number;
  nextRunAt: number | null;
}

@Injectable({ providedIn: 'root' })
export class CronStateService {
  private readonly rpc = inject(CronRpcService);
  private readonly appState = inject(AppStateManager);

  private readonly _jobs = signal<ScheduledJobDto[]>([]);
  private readonly _selectedJobId = signal<string | null>(null);
  private readonly _runs = signal<JobRunDto[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);
  private readonly _scopeFilter = signal<CronScopeFilter>('workspace');
  private readonly _runsState = signal<CronRunsState>('idle');
  private readonly _saveError = signal<string | null>(null);

  public readonly jobs = this._jobs.asReadonly();
  public readonly selectedJobId = this._selectedJobId.asReadonly();
  public readonly runs = this._runs.asReadonly();
  public readonly loading = this._loading.asReadonly();
  public readonly error = this._error.asReadonly();
  public readonly runsState = this._runsState.asReadonly();
  /**
   * Error of the last `create` or `update` call. A list refresh does not
   * change it, so the form keeps the reason of its own failed save.
   */
  public readonly saveError = this._saveError.asReadonly();
  /**
   * Scope that the list shows. With no workspace open there is nothing to
   * filter by, so the list is global and the scope reads `'all'`.
   */
  public readonly scopeFilter = computed<CronScopeFilter>(() =>
    this._scopeFilter() === 'workspace' && !this.appState.workspaceInfo()?.path
      ? 'all'
      : this._scopeFilter(),
  );

  /**
   * Monotonic refresh token. Every {@link refresh} captures the current value;
   * a response only renders if its token still matches, so a slow list for
   * workspace A can never overwrite the view after the user switched to B.
   */
  private refreshSeq = 0;

  /**
   * List params (as a key) of the result that `_jobs` holds; `null` before
   * the first result. A refresh for other params first removes the rows, so
   * jobs of the previous scope never show, with live actions, as results of
   * the new one.
   */
  private jobsKey: string | null = null;

  /** Same guard as {@link refreshSeq}, for the `cron:runs` request. */
  private runsSeq = 0;

  /**
   * Workspace root the constructor effect last observed. `undefined` means "no
   * emission seen yet" — the first observation only records the value so the
   * effect's initial run doesn't duplicate the tab's `ngOnInit` refresh.
   */
  private lastWorkspaceRoot: string | null | undefined;

  /**
   * Workspace root captured synchronously at construction, before the effect's
   * first (deferred) flush. If the active workspace changes in that window —
   * construction → first effect flush — the effect's first observation would
   * otherwise silently record the post-switch root as the baseline and never
   * fetch for it, leaving the tab showing the old workspace's jobs. Comparing
   * the first-flush value against this baseline closes that hole (Issue 7).
   */
  private readonly initialWorkspaceRoot: string | null =
    this.appState.workspaceInfo()?.path ?? null;

  public constructor() {
    // Mirrors ThothStatusService: re-list when the active workspace changes
    // while scoped to 'workspace', so the tab tracks the workspace switcher.
    effect(() => {
      const root = this.appState.workspaceInfo()?.path ?? null;
      untracked(() => {
        const prev = this.lastWorkspaceRoot;
        this.lastWorkspaceRoot = root;
        if (prev === undefined) {
          // First flush: a real switch happened during construction if the
          // now-observed root differs from the construction-time baseline.
          if (root === this.initialWorkspaceRoot) return;
        } else if (prev === root) {
          return;
        }
        if (this._scopeFilter() !== 'workspace') return;
        void this.refresh();
      });
    });
  }

  public readonly selectedJob = computed<ScheduledJobDto | null>(() => {
    const id = this._selectedJobId();
    if (!id) return null;
    return this._jobs().find((j) => j.id === id) ?? null;
  });

  public readonly stats = computed<CronAggregateStats>(() => {
    const jobs = this._jobs();
    const enabled = jobs.filter((j) => j.enabled);
    const upcoming = enabled
      .map((j) => j.nextRunAt)
      .filter((v): v is number => typeof v === 'number');
    const nextRunAt = upcoming.length === 0 ? null : Math.min(...upcoming);
    return {
      total: jobs.length,
      enabled: enabled.length,
      disabled: jobs.length - enabled.length,
      nextRunAt,
    };
  });

  public select(id: string | null): void {
    if (this._selectedJobId() !== id) {
      // Runs of the previous job must not show under the new one.
      this.runsSeq++;
      this._runs.set([]);
      this._runsState.set('idle');
    }
    this._selectedJobId.set(id);
    if (id) void this.loadRuns(id);
  }

  /**
   * Switch the workspace scope filter and re-list. No-op when the scope is
   * already the requested value.
   */
  public setScopeFilter(scope: CronScopeFilter): void {
    if (this._scopeFilter() === scope) return;
    this._scopeFilter.set(scope);
    void this.refresh();
  }

  public async refresh(): Promise<void> {
    const token = ++this.refreshSeq;
    const params = this.buildListParams();
    const key = JSON.stringify(params);
    if (this.jobsKey !== null && this.jobsKey !== key) {
      this.jobsKey = null;
      this._jobs.set([]);
    }
    this._loading.set(true);
    this._error.set(null);
    try {
      const result = await this.rpc.list(params);
      if (token !== this.refreshSeq) return; // stale — a newer refresh ran
      this.jobsKey = key;
      this._jobs.set(result.jobs);
    } catch (err) {
      if (token !== this.refreshSeq) return;
      this._error.set(this.toMessage(err));
    } finally {
      if (token === this.refreshSeq) this._loading.set(false);
    }
  }

  /**
   * Resolve the `cron:list` params for the active scope. `'workspace'` scope
   * with a resolved workspace root filters to that path; `'all'` (or a scope
   * with no workspace open) lists globally.
   */
  private buildListParams(): CronListParams {
    if (this._scopeFilter() !== 'workspace') return {};
    const root = this.appState.workspaceInfo()?.path;
    return root ? { workspaceRoot: root } : {};
  }

  public async create(spec: CronCreateParams): Promise<ScheduledJobDto | null> {
    this._error.set(null);
    this._saveError.set(null);
    try {
      const result = await this.rpc.create(spec);
      this._jobs.update((jobs) => [...jobs, result.job]);
      return result.job;
    } catch (err) {
      this._error.set(this.toMessage(err));
      this._saveError.set(this.toMessage(err));
      return null;
    }
  }

  /** Forget the error of the last save, for example when the form resets. */
  public clearSaveError(): void {
    this._saveError.set(null);
  }

  public async update(
    id: string,
    patch: CronUpdateParams['patch'],
  ): Promise<ScheduledJobDto | null> {
    this._error.set(null);
    this._saveError.set(null);
    try {
      const result = await this.rpc.update({ id, patch });
      this._jobs.update((jobs) =>
        jobs.map((j) => (j.id === result.job.id ? result.job : j)),
      );
      return result.job;
    } catch (err) {
      this._error.set(this.toMessage(err));
      this._saveError.set(this.toMessage(err));
      return null;
    }
  }

  public async delete(id: string): Promise<boolean> {
    this._error.set(null);
    try {
      const result = await this.rpc.delete({ id });
      if (result.ok) {
        this._jobs.update((jobs) => jobs.filter((j) => j.id !== id));
        if (this._selectedJobId() === id) {
          this.runsSeq++;
          this._selectedJobId.set(null);
          this._runs.set([]);
          this._runsState.set('idle');
        }
      }
      return result.ok;
    } catch (err) {
      this._error.set(this.toMessage(err));
      return false;
    }
  }

  public async toggle(id: string, enabled: boolean): Promise<void> {
    this._error.set(null);
    try {
      const result = await this.rpc.toggle({ id, enabled });
      this._jobs.update((jobs) =>
        jobs.map((j) => (j.id === result.job.id ? result.job : j)),
      );
    } catch (err) {
      this._error.set(this.toMessage(err));
    }
  }

  public async runNow(id: string): Promise<JobRunDto | null> {
    this._error.set(null);
    try {
      const result = await this.rpc.runNow({ id });
      // The history shows the selected job only.
      if (result.run && this._selectedJobId() === id) {
        this._runs.update((runs) => [result.run as JobRunDto, ...runs]);
      }
      return result.run;
    } catch (err) {
      this._error.set(this.toMessage(err));
      return null;
    }
  }

  public async loadRuns(id: string, limit = 50): Promise<void> {
    const token = ++this.runsSeq;
    // A response is for the job that was selected when the request started.
    const current = (): boolean =>
      token === this.runsSeq && this._selectedJobId() === id;
    this._error.set(null);
    this._runsState.set('loading');
    try {
      const result = await this.rpc.runs({ id, limit });
      if (!current()) return;
      this._runs.set(result.runs);
      this._runsState.set('loaded');
    } catch (err) {
      // degradation-audit: reported - a failure of the selected job goes to
      // `error` and `runsState`; a response for another job is discarded.
      if (!current()) return;
      this._error.set(this.toMessage(err));
      this._runsState.set('error');
    }
  }

  /**
   * Aggregate stats are derived client-side via the {@link stats} computed.
   * This method exists for API symmetry with the requested spec; it simply
   * triggers a refresh of the underlying job list.
   */
  public async loadStats(): Promise<void> {
    await this.refresh();
  }

  private toMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return 'Unknown cron error';
  }
}

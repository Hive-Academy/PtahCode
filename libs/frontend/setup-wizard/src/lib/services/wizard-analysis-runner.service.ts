import {
  DestroyRef,
  Injectable,
  computed,
  inject,
  signal,
} from '@angular/core';
import type {
  MultiPhaseAnalysisResponse,
  ResumableGenerationAgent,
  ResumableGenerationRun,
} from '@ptah-extension/shared';

import { SetupWizardStateService } from './setup-wizard-state.service';
import type { SkillGenerationProgressItem } from './setup-wizard-state.types';
import { WizardRpcService } from './wizard-rpc.service';

/**
 * WizardAnalysisRunner — owns the deep-analysis run, not the component that
 * displays it.
 *
 * The wizard is rendered inside the app shell's `@switch`, so navigating to
 * any other view destroys `ScanProgressComponent` mid-run. When the run lived
 * in the component, every `await` was guarded by an `isDestroyed` flag and the
 * resolved `MultiPhaseAnalysisResponse` was dropped on the floor — the backend
 * had done the whole analysis, nothing stored it, and returning to Setup
 * started it again from zero.
 *
 * This service is `providedIn: 'root'`, so the run outlives the view: results
 * always land in `SetupWizardStateService`, and a component that remounts
 * mid-run re-attaches to the same promise instead of launching a second one.
 *
 * Staleness is tracked by a run token rather than component lifetime. Only a
 * cancel or a reset invalidates a run; a destroyed view does not.
 */
/**
 * Checkpoint statuses a resume does not rerun: the file was written, already
 * current, or left as the user's (`kept`, `changed-since-preview`).
 */
const SETTLED_ON_RESUME: ReadonlySet<ResumableGenerationAgent['status']> =
  new Set(['written', 'unchanged', 'kept', 'changed-since-preview']);

/**
 * Map a persisted checkpoint agent onto an item-progress entry. Agents whose
 * file is settled show as complete; `pending`, `running` and `failed` re-run
 * on resume and start as pending.
 */
function toProgressItem(
  agent: ResumableGenerationAgent,
): SkillGenerationProgressItem {
  const done = SETTLED_ON_RESUME.has(agent.status);
  const fileName = agent.filePath.split(/[\\/]/).pop();
  return {
    id: agent.agentId,
    name: fileName && fileName.length > 0 ? fileName : agent.agentId,
    type: 'agent',
    status: done ? 'complete' : 'pending',
    ...(done ? { progress: 100 } : {}),
  };
}

/** Normalize a workspace path for equality comparison by trimming trailing slashes. */
function normalizeWorkspacePath(
  workspacePath: string | null | undefined,
): string | null {
  if (!workspacePath) {
    return null;
  }
  const trimmed = workspacePath.trim();
  if (!trimmed) {
    return null;
  }
  const stripped = trimmed.replace(/[\\/]+$/, '');
  return stripped.length > 0 ? stripped : trimmed[0];
}

/**
 * Check whether `candidatePath` is equal to or inside `workspacePath`.
 * Normalizes path separators and compares Windows drive paths case-insensitively.
 */
function isPathWithinWorkspace(
  candidatePath: string,
  workspacePath: string,
): boolean {
  const normCandidate = normalizeWorkspacePath(candidatePath)?.replace(
    /\\/g,
    '/',
  );
  const normWorkspace = normalizeWorkspacePath(workspacePath)?.replace(
    /\\/g,
    '/',
  );
  if (!normCandidate || !normWorkspace) {
    return false;
  }
  const isWindows =
    /^[a-zA-Z]:(?:\/|$)/.test(normWorkspace) ||
    /^[a-zA-Z]:(?:\/|$)/.test(normCandidate);
  const candidate = isWindows ? normCandidate.toLowerCase() : normCandidate;
  const workspace = isWindows ? normWorkspace.toLowerCase() : normWorkspace;
  if (candidate === workspace) {
    return true;
  }
  const prefix = workspace.endsWith('/') ? workspace : `${workspace}/`;
  return candidate.startsWith(prefix);
}

/** Parse a numeric or ISO 8601 timestamp into epoch milliseconds. */
function parseStartedAtMs(
  value: string | number | null | undefined,
): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

const BACKEND_POLL_INTERVAL_MS = 2500;
const MAX_BACKEND_POLL_ERRORS = 5;

@Injectable({
  providedIn: 'root',
})
export class WizardAnalysisRunner {
  private readonly wizardState = inject(SetupWizardStateService);
  private readonly wizardRpc = inject(WizardRpcService);
  private readonly destroyRef = inject(DestroyRef, { optional: true });

  private readonly INITIAL_STATUS = 'Initializing workspace scan...';

  /** The run in progress, so a remounting view joins it instead of forking. */
  private inFlight: Promise<void> | null = null;

  /**
   * Incremented by `cancel()` / `reset()`. A run whose token no longer matches
   * writes nothing — its result belongs to a flow the user has left.
   */
  private runToken = 0;

  /** One-shot guard: `wizard:get-resumable-run` is queried once per session. */
  private discoveryDone = false;

  /** Bounded watcher for a post-reload backend-hydrated analysis run. */
  private backendWatcherTimer: ReturnType<typeof setTimeout> | null = null;
  private backendWatcherToken = 0;
  private backendWatcherErrors = 0;

  /** Currently active frontend workspace path; pauses backend polling on other workspaces. */
  private currentWorkspacePath: string | null = null;

  private readonly _isRunning = signal(false);
  private readonly _backendActive = signal(false);
  private readonly _isCanceling = signal(false);
  private readonly _startedAt = signal<number | null>(null);
  private readonly _activeWorkspacePath = signal<string | null>(null);
  private readonly _resultWorkspacePath = signal<string | null>(null);
  private readonly _runGeneration = signal(0);
  private readonly _statusText = signal(this.INITIAL_STATUS);
  private readonly _errorMessage = signal<string | null>(null);
  private readonly _resumableAnalysis =
    signal<MultiPhaseAnalysisResponse | null>(null);
  private readonly _resumableGeneration = signal<ResumableGenerationRun | null>(
    null,
  );

  public readonly backendActive = this._backendActive.asReadonly();
  public readonly isRunning = computed(
    () => this._isRunning() || this._backendActive(),
  );
  public readonly isCanceling = this._isCanceling.asReadonly();
  public readonly startedAt = this._startedAt.asReadonly();
  public readonly activeWorkspacePath = this._activeWorkspacePath.asReadonly();
  public readonly resultWorkspacePath = this._resultWorkspacePath.asReadonly();
  public readonly runGeneration = this._runGeneration.asReadonly();
  public readonly statusText = this._statusText.asReadonly();
  public readonly errorMessage = this._errorMessage.asReadonly();
  /** An unfinished persisted analysis the user can resume or discard. */
  public readonly resumableAnalysis = this._resumableAnalysis.asReadonly();
  /** An unfinished persisted generation run the user can resume. */
  public readonly resumableGeneration = this._resumableGeneration.asReadonly();

  /** True once the wizard holds a result — the view can render it directly. */
  public readonly hasResult = computed(
    () => this.wizardState.multiPhaseResult() !== null,
  );

  public constructor() {
    this.destroyRef?.onDestroy(() => this.stopBackendWatcher());
  }

  /**
   * Whether an analysis run is currently active (running, canceling, or
   * hydrated from an active backend run) for the given workspace path.
   * When the caller that started the run omitted `workspacePath`, returns
   * `true` for backward compatibility.
   */
  public isRunningForWorkspace(
    workspacePath: string | null | undefined,
  ): boolean {
    if (!this._isRunning() && !this._isCanceling() && !this._backendActive()) {
      return false;
    }
    const activePath = this._activeWorkspacePath();
    if (activePath === null) {
      return true;
    }
    const normalized = normalizeWorkspacePath(workspacePath);
    return normalized !== null && normalized === activePath;
  }

  /**
   * Whether the last completed or failed result/error belongs to the given
   * workspace path. Returns `true` when no result workspace was recorded
   * (legacy callers or no result yet), or when the normalized paths match.
   */
  public isResultForWorkspace(
    workspacePath: string | null | undefined,
  ): boolean {
    const resultPath = this._resultWorkspacePath();
    if (resultPath === null) {
      return true;
    }
    const normalized = normalizeWorkspacePath(workspacePath);
    return normalized !== null && normalized === resultPath;
  }

  /**
   * Notify the runner which workspace is currently active in the frontend.
   * Pauses the backend completion watcher while another workspace is active so
   * `getResumableRun()` is never polled against the wrong backend workspace,
   * and resumes watching when the user switches back.
   */
  public setCurrentWorkspacePath(
    workspacePath: string | null | undefined,
  ): void {
    const normalized = normalizeWorkspacePath(workspacePath);
    if (normalized === this.currentWorkspacePath) {
      return;
    }
    this.currentWorkspacePath = normalized;

    if (!this._backendActive() || this._isRunning()) {
      return;
    }

    if (!this.isWatcherAllowedForCurrentWorkspace()) {
      // Pause polling without clearing `_backendActive` — the other workspace is still running.
      this.stopBackendWatcher();
      return;
    }

    if (this.backendWatcherTimer === null) {
      this.startBackendWatcher();
    }
  }

  /**
   * Synchronize runner state with an in-process analysis running on the
   * backend (e.g., after a webview reload).
   */
  public syncBackendActive(
    active: boolean,
    options?: {
      startedAt?: string | number | null;
      workspacePath?: string | null;
    },
  ): void {
    if (!active) {
      this.stopBackendWatcher();
      this._backendActive.set(false);
      if (!this._isRunning()) {
        this._startedAt.set(null);
        this._activeWorkspacePath.set(null);
      }
      return;
    }

    // Never latch backend-hydrated state while a local run owns the lifecycle.
    if (this._isRunning()) {
      return;
    }

    this._backendActive.set(true);
    this._resumableAnalysis.set(null);

    if (this._startedAt() === null) {
      const parsedStartedAt = parseStartedAtMs(options?.startedAt);
      if (parsedStartedAt !== null) {
        this._startedAt.set(parsedStartedAt);
      }
    }

    const normalizedWorkspace = normalizeWorkspacePath(options?.workspacePath);
    if (normalizedWorkspace !== null) {
      this._activeWorkspacePath.set(normalizedWorkspace);
    }

    if (this.isWatcherAllowedForCurrentWorkspace()) {
      this.startBackendWatcher();
    } else {
      this.stopBackendWatcher();
    }
  }

  private isWatcherAllowedForCurrentWorkspace(
    watchedWorkspace: string | null = this._activeWorkspacePath(),
  ): boolean {
    return (
      this.currentWorkspacePath === null ||
      watchedWorkspace === null ||
      this.currentWorkspacePath === watchedWorkspace
    );
  }

  private startBackendWatcher(): void {
    if (
      this.backendWatcherTimer !== null ||
      !this._backendActive() ||
      this._isRunning() ||
      !this.isWatcherAllowedForCurrentWorkspace()
    ) {
      return;
    }
    this.backendWatcherErrors = 0;
    const watcherToken = ++this.backendWatcherToken;
    this.scheduleBackendWatcherTick(watcherToken);
  }

  private scheduleBackendWatcherTick(watcherToken: number): void {
    if (
      watcherToken !== this.backendWatcherToken ||
      !this._backendActive() ||
      this._isRunning() ||
      !this.isWatcherAllowedForCurrentWorkspace()
    ) {
      return;
    }
    this.backendWatcherTimer = setTimeout(() => {
      this.backendWatcherTimer = null;
      void this.pollBackendActive(watcherToken);
    }, BACKEND_POLL_INTERVAL_MS);
  }

  private async pollBackendActive(watcherToken: number): Promise<void> {
    if (
      watcherToken !== this.backendWatcherToken ||
      !this._backendActive() ||
      this._isRunning()
    ) {
      this.stopBackendWatcher();
      return;
    }

    const watchedWorkspace = this._activeWorkspacePath();
    const workspaceBefore = this.currentWorkspacePath;
    if (!this.isWatcherAllowedForCurrentWorkspace(watchedWorkspace)) {
      this.stopBackendWatcher();
      return;
    }

    try {
      const resumable = await this.wizardRpc.getResumableRun();
      if (
        watcherToken !== this.backendWatcherToken ||
        !this._backendActive() ||
        this._isRunning()
      ) {
        return;
      }
      if (
        this.currentWorkspacePath !== workspaceBefore ||
        !this.isWatcherAllowedForCurrentWorkspace(watchedWorkspace)
      ) {
        if (this.isWatcherAllowedForCurrentWorkspace(watchedWorkspace)) {
          this.scheduleBackendWatcherTick(watcherToken);
        } else {
          this.stopBackendWatcher();
        }
        return;
      }

      if (resumable.analysisActive === true) {
        this.backendWatcherErrors = 0;
        this.scheduleBackendWatcherTick(watcherToken);
        return;
      }

      if (resumable.analysisActive === false) {
        this.backendWatcherErrors = 0;
        const analysis = resumable.analysis;
        const analysisMatchesWorkspace =
          watchedWorkspace === null ||
          !analysis?.analysisDir ||
          isPathWithinWorkspace(analysis.analysisDir, watchedWorkspace);
        if (
          analysis &&
          analysisMatchesWorkspace &&
          (analysis.manifest.lifecycle === 'completed' ||
            analysis.manifest.lifecycle === 'failed') &&
          !this.wizardState.multiPhaseResult()
        ) {
          this._resultWorkspacePath.set(watchedWorkspace);
          this.wizardState.setMultiPhaseResult(analysis);
        }
        this.syncBackendActive(false);
        return;
      }

      // `WizardRpcService.getResumableRun()` swallows RPC errors and returns
      // `{ analysis: null, generation: null }` (`analysisActive === undefined`).
      // Treat missing `analysisActive` as a transient poll error, not completion.
      this.handleBackendPollError(watcherToken);
    } catch {
      // degradation-audit: optional-capability - backend watcher retries transient poll failures up to a bounded limit.
      this.handleBackendPollError(watcherToken);
    }
  }

  private handleBackendPollError(watcherToken: number): void {
    if (
      watcherToken !== this.backendWatcherToken ||
      !this._backendActive() ||
      this._isRunning()
    ) {
      return;
    }
    this.backendWatcherErrors++;
    if (this.backendWatcherErrors >= MAX_BACKEND_POLL_ERRORS) {
      this.stopBackendWatcher();
      return;
    }
    this.scheduleBackendWatcherTick(watcherToken);
  }

  private stopBackendWatcher(): void {
    this.backendWatcherToken++;
    if (this.backendWatcherTimer !== null) {
      clearTimeout(this.backendWatcherTimer);
      this.backendWatcherTimer = null;
    }
    this.backendWatcherErrors = 0;
  }

  /**
   * Start the analysis unless one is already running. Safe to call from every
   * `ngOnInit` — a remount during a run joins the existing promise, and a
   * remount after one resolves re-uses the stored result.
   *
   * The first call performs resume discovery. When an unfinished analysis is
   * found, the runner holds instead of starting a fresh run: the prior run is
   * never deleted or restarted automatically — the user chooses through
   * `resumeAnalysis()` or `startFreshAnalysis()`.
   */
  public ensureStarted(workspacePath?: string | null): Promise<void> {
    return this.launch(() => this.launchAfterDiscovery(workspacePath));
  }

  /** Re-run after a failure. Identical to `ensureStarted()` by design. */
  public retry(workspacePath?: string | null): Promise<void> {
    return this.ensureStarted(workspacePath);
  }

  /** Continue the discovered unfinished analysis on the backend. */
  public resumeAnalysis(workspacePath?: string | null): Promise<void> {
    this._resumableAnalysis.set(null);
    return this.launch(() => this.run(true, workspacePath, false));
  }

  /** Discard the resume offer and run a fresh analysis. */
  public startFreshAnalysis(workspacePath?: string | null): Promise<void> {
    this._resumableAnalysis.set(null);
    return this.launch(() => this.run(false, workspacePath, false));
  }

  /**
   * Resume the discovered generation run.
   *
   * Seeds the item-progress signal from the persisted checkpoint agents
   * (backend state, not frontend memory), moves to the generation step, and
   * asks the backend to continue via `wizard:submit-selection { resume: true }`.
   */
  public async resumeGeneration(): Promise<void> {
    const checkpoint = this._resumableGeneration();
    if (!checkpoint) {
      return;
    }
    this._resumableGeneration.set(null);
    this.wizardState.setSkillGenerationProgress(
      checkpoint.agents.map((agent) => toProgressItem(agent)),
    );
    this.wizardState.setCurrentStep('generation');
    try {
      await this.wizardRpc.resumeGeneration();
    } catch {
      const message = 'Generation could not be resumed. Try again.';
      // Nothing ran: mark the still-pending items as failed so the
      // generation view reports the truth instead of hanging.
      this.wizardState.setSkillGenerationProgress(
        this.wizardState
          .skillGenerationProgress()
          .map((item) =>
            item.status === 'pending'
              ? { ...item, status: 'error' as const, errorMessage: message }
              : item,
          ),
      );
    }
  }

  /** Share the in-flight promise so concurrent starts never fork a run. */
  private launch(start: () => Promise<void>): Promise<void> {
    if (this.inFlight) {
      return this.inFlight;
    }
    const run = start().finally(() => {
      if (this.inFlight === run) {
        this.inFlight = null;
      }
    });
    this.inFlight = run;
    return run;
  }

  /** First-start path: discover a resumable run, then hold or analyze. */
  private async launchAfterDiscovery(
    workspacePath?: string | null,
  ): Promise<void> {
    const token = this.runToken;
    await this.discoverResumableRun(token, workspacePath);
    if (token !== this.runToken) {
      // A cancel/reset landed while discovery was in flight.
      return;
    }
    if (this._backendActive()) {
      this._statusText.set('Analyzing project structure...');
      return;
    }
    if (this._resumableAnalysis()) {
      this._statusText.set('An unfinished analysis was found.');
      return;
    }
    return this.run(false, workspacePath, true);
  }

  private async discoverResumableRun(
    token: number,
    workspacePath?: string | null,
  ): Promise<void> {
    if (this.discoveryDone) {
      return;
    }
    this.discoveryDone = true;

    const resumable = await this.wizardRpc.getResumableRun();
    if (token !== this.runToken) {
      return;
    }
    if (resumable.generation) {
      this._resumableGeneration.set(resumable.generation);
    }
    if (resumable.analysisActive === true) {
      this.syncBackendActive(true, {
        startedAt: resumable.activeAnalysisStartedAt,
        workspacePath,
      });
      return;
    }
    const analysis = resumable.analysis;
    if (!analysis) {
      return;
    }
    if (analysis.manifest.lifecycle === 'completed') {
      // Not resumable — adopt it as the stored result so the wizard can
      // continue where it stopped (e.g. resume its generation run).
      if (!this.wizardState.multiPhaseResult()) {
        this._resultWorkspacePath.set(normalizeWorkspacePath(workspacePath));
        this.wizardState.setMultiPhaseResult(analysis);
      }
      return;
    }
    this._resumableAnalysis.set(analysis);
  }

  /**
   * Cancel the backend analysis and clear the wizard.
   *
   * The token bump lands before the RPC so the in-flight run cannot write its
   * result (or advance the step) after the user has already cancelled.
   */
  public async cancel(): Promise<void> {
    this.stopBackendWatcher();
    this._isCanceling.set(true);
    this._statusText.set('Canceling analysis...');
    this.runToken++;
    this._runGeneration.update((n) => n + 1);
    this.inFlight = null;
    try {
      await this.wizardRpc.cancelAnalysis();
    } finally {
      this.reset();
      this.wizardState.reset();
    }
  }

  /** Drop runner-local UI state and invalidate any run still in flight. */
  public reset(): void {
    this.stopBackendWatcher();
    this.runToken++;
    this._runGeneration.update((n) => n + 1);
    this.inFlight = null;
    this._isRunning.set(false);
    this._backendActive.set(false);
    this._isCanceling.set(false);
    this._startedAt.set(null);
    this._activeWorkspacePath.set(null);
    this._resultWorkspacePath.set(null);
    this._errorMessage.set(null);
    this._statusText.set(this.INITIAL_STATUS);
  }

  private async run(
    resume: boolean,
    workspacePath?: string | null,
    allowCachedResult = false,
  ): Promise<void> {
    const token = ++this.runToken;
    this._runGeneration.update((n) => n + 1);
    this.stopBackendWatcher();
    const normalizedWorkspace = normalizeWorkspacePath(workspacePath);
    this._isRunning.set(true);
    this._backendActive.set(false);
    this._startedAt.set(Date.now());
    this._activeWorkspacePath.set(normalizedWorkspace);
    this._errorMessage.set(null);

    try {
      const existingMultiPhase = this.wizardState.multiPhaseResult();
      const existingLifecycle = existingMultiPhase?.manifest?.lifecycle;
      if (
        allowCachedResult &&
        !resume &&
        existingMultiPhase &&
        (existingLifecycle === undefined || existingLifecycle === 'completed')
      ) {
        this.wizardState.setCurrentStep('analysis');
        return;
      }

      this._statusText.set(
        resume
          ? 'Resuming project analysis...'
          : 'Analyzing project structure...',
      );
      const multiPhaseResult = await this.wizardRpc.deepAnalyze({ resume });
      if (token !== this.runToken) return;
      this._resultWorkspacePath.set(normalizedWorkspace);
      this.wizardState.setMultiPhaseResult(multiPhaseResult);

      this.wizardState.setCurrentStep('analysis');
    } catch (error: unknown) {
      if (token !== this.runToken) return;
      const message =
        error instanceof Error
          ? error.message
          : 'Analysis failed. Please try again.';
      this._resultWorkspacePath.set(normalizedWorkspace);
      this._errorMessage.set(message);
      this._statusText.set('Analysis failed');
      console.error('[WizardAnalysisRunner] Analysis failed:', error);
    } finally {
      if (token === this.runToken) {
        this.stopBackendWatcher();
        this._isRunning.set(false);
        this._backendActive.set(false);
        this._startedAt.set(null);
        this._activeWorkspacePath.set(null);
        this._runGeneration.update((n) => n + 1);
      }
    }
  }
}

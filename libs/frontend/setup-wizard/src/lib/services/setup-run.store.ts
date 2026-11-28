/**
 * Owns Setup records and persistence across workspaces. For bound workflows,
 * the record id is the backend binding's tab id, independent of any chat tab.
 * Workflow coordinators reconcile with the backend on activation and refresh,
 * from pushed reports, and through one shared poll when push is unavailable.
 */

import {
  DestroyRef,
  Injectable,
  Injector,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import {
  TabManagerService,
  consumeLegacySetupTabs,
} from '@ptah-extension/chat-state';
import { VSCodeService, type OnboardingTarget } from '@ptah-extension/core';
import type {
  SetupGenerationRunBinding,
  SetupGenerationRunState,
  SetupGenerationTabBinding,
  SetupGenerationWorkflow,
  WizardRecommendAnalysisSkillsResult,
} from '@ptah-extension/shared';
import { GenerationHandoffStore } from './generation-handoff.store';
import {
  isSetupRunStepOf,
  normalizeSetupWorkspacePath,
  sameSetupWorkspacePath,
  setupWorkspacePath,
  readSetupRunIndex,
  capWorkspaceRuns,
  writeSetupRunIndex,
  type GuidanceHandoffState,
  type SetupRunIndex,
  type StoredSetupRunRecord,
} from './setup-run-persistence';
import { SetupRunAnalysisCoordinator } from './setup-run/setup-run-analysis.coordinator';
import { SetupRunAttempts } from './setup-run/setup-run-attempt';
import {
  bindingOf,
  createBoundRunRecord,
  matchesBinding,
} from './setup-run/setup-run-binding';
import { SetupRunBoundCoordinator } from './setup-run/setup-run-bound.coordinator';
import { SetupRunDismissals } from './setup-run/setup-run-dismissals';
import { SetupRunSavedAnalysis } from './setup-run/setup-run-saved-analysis';
import {
  isLive,
  newRunId,
  type SetupRunRecordHost,
  type SetupRunReport,
} from './setup-run/setup-run-host';
import { applyReportFields } from './setup-run/setup-run-record';
import { SetupRunSkillReviewCoordinator } from './setup-run/setup-run-skill-review.coordinator';
import { entrySubPathFor, stepTarget } from './setup-run-steps';
import {
  SETUP_RUN_STEPS,
  isTerminalSetupRunStatus,
  type SetupRunRecord,
  type SetupRunStatus,
  type SetupRunStep,
  type SetupRunWorkflow,
} from './setup-run.types';
import { SetupWizardStateService } from './setup-wizard-state.service';
import { WizardAnalysisRunner } from './wizard-analysis-runner.service';
import { WizardRpcService } from './wizard-rpc.service';

export { SETUP_RUN_POLL_INTERVAL_MS } from './setup-run/setup-run-poll';
export type { SetupRunReport } from './setup-run/setup-run-host';

/** Options of {@link SetupRunStore.start}. */
export interface SetupRunStartOptions {
  parentId?: string | null;
  analysisRunId?: string | null;
  origin?: string;
  /** The first step; defaults to the workflow's first step. */
  step?: SetupRunStep;
  /** `needs-input` for a run that begins at a user step; default `running`. */
  status?: Extract<SetupRunStatus, 'running' | 'needs-input'>;
}

function newestFirst(a: SetupRunRecord, b: SetupRunRecord): number {
  return b.createdAt - a.createdAt || b.updatedAt - a.updatedAt;
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // degradation-audit: optional-capability - unavailable browser storage keeps Setup runs in memory for this session.
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class SetupRunStore {
  private readonly rpc = inject(WizardRpcService);
  private readonly runner = inject(WizardAnalysisRunner);
  private readonly wizardState = inject(SetupWizardStateService);
  private readonly tabs = inject(TabManagerService);
  private readonly vscode = inject(VSCodeService);
  private readonly injector = inject(Injector);
  private readonly storage = browserStorage();

  private readonly dismissals = new SetupRunDismissals();
  private readonly _index = signal<SetupRunIndex>({});
  private readonly _cancelling = signal<ReadonlySet<string>>(new Set());

  /** Records whose work started, was adopted live, or pushed in this session. */
  private readonly liveThisSession = new Set<string>();
  /** Records a view currently shows (rule 7). */
  private readonly viewing = new Set<string>();
  private writeQueued = false;
  private reconcileSequence = 0;

  /** The active workspace path as provided by the host. */
  public readonly workspacePath = computed(() =>
    setupWorkspacePath(
      this.tabs.activeWorkspacePath || this.vscode.config().workspaceRoot,
    ),
  );

  /** The active workspace's records, newest first. */
  public readonly runs = computed<readonly SetupRunRecord[]>(() =>
    this.runsFor(this.workspacePath()),
  );

  /** Active workspace: runs that need input plus unseen terminal runs. */
  public readonly attentionCount = computed(
    () =>
      this.runs().filter(
        (record) =>
          record.status === 'needs-input' ||
          (record.unseen && isTerminalSetupRunStatus(record.status)),
      ).length,
  );

  /** Active workspace: runs still running. */
  public readonly runningCount = computed(
    () => this.runs().filter((record) => record.status === 'running').length,
  );

  /** Ids whose cancel waits for backend confirmation. */
  public readonly cancellingIds = this._cancelling.asReadonly();

  private readonly host: SetupRunRecordHost = {
    get: (id) => this.get(id),
    runsFor: (workspace) => this.runsFor(workspace),
    workspacePath: this.workspacePath,
    isCancelling: (id) => this.isCancelling(id),
    wasDismissed: (workspace, workflow, runId) =>
      this.dismissals.has(workspace, workflow, runId),
    setCancelling: (id, on) => this.setCancelling(id, on),
    insert: (record) => this.insert(record),
    apply: (id, update, correction, finalizationRunId) =>
      this.apply(id, update, correction, finalizationRunId),
    patch: (id, change) => this.patch(id, change),
    adopt: (binding) => this.adopt(binding),
    markLiveThisSession: (id) => this.liveThisSession.add(id),
    isLiveThisSession: (id) => this.liveThisSession.has(id),
    setGuidanceHandoff: (id, state) => this.setGuidanceHandoff(id, state),
  };

  private readonly attempts = new SetupRunAttempts();
  private readonly bound = new SetupRunBoundCoordinator(
    this.host,
    this.rpc,
    this.attempts,
    this.runs,
    (): boolean => this.pollNeeded(),
    // Resolve lazily because the hand-off opens its child through this store.
    () => this.injector.get(GenerationHandoffStore),
  );
  private readonly savedAnalysis = new SetupRunSavedAnalysis(
    this.host,
    this.rpc,
  );
  private readonly analysis = new SetupRunAnalysisCoordinator(
    this.host,
    this.runner,
    this.wizardState,
    this.rpc,
    this.savedAnalysis,
  );
  private readonly skillReview = new SetupRunSkillReviewCoordinator(
    this.host,
    this.rpc,
  );
  private readonly pollNeeded = computed(() =>
    this.runs().some((record) => this.bound.shouldPoll(record)),
  );

  public constructor() {
    const read = this.storage
      ? readSetupRunIndex(this.storage)
      : { index: {}, corrupt: false };
    this._index.set(read.index);
    this.dismissals.restore(read.dismissals);
    if (read.corrupt) this.scheduleWrite();

    effect(() => {
      const workspace = this.workspacePath();
      untracked(() => {
        this.runner.setCurrentWorkspacePath(workspace);
        this.bound.stopPoll();
        if (this.pollNeeded()) this.bound.ensurePoll();
        if (workspace) void this.activate();
      });
    });
    effect(() => {
      const running = this.runner.isRunning();
      const canceling = this.runner.isCanceling();
      this.runner.runGeneration();
      this.runner.activeWorkspacePath();
      untracked(() => this.analysis.syncFromRunner(running, canceling));
    });
    effect(() => {
      const needed = this.pollNeeded();
      untracked(() =>
        needed ? this.bound.ensurePoll() : this.bound.stopPoll(),
      );
    });
    inject(DestroyRef).onDestroy(() => this.bound.stopPoll());
  }

  /** A workspace's records, newest first. Reactive inside a computed. */
  public runsFor(
    workspacePath: string | null | undefined,
  ): StoredSetupRunRecord[] {
    const workspace = normalizeSetupWorkspacePath(workspacePath);
    if (!workspace) return [];
    return [...(this._index()[workspace] ?? [])].sort(newestFirst);
  }

  /** The newest `running` or `needs-input` record of a workspace. */
  public activeRun(
    workspacePath: string | null | undefined = this.workspacePath(),
  ): SetupRunRecord | null {
    return this.runsFor(workspacePath).find(isLive) ?? null;
  }

  /** A record by id, in any workspace. */
  public get(id: string): StoredSetupRunRecord | null {
    for (const records of Object.values(this._index())) {
      const found = records.find((record) => record.id === id);
      if (found) return found;
    }
    return null;
  }

  /** Validate a persisted generation route against its Setup-owned record. */
  public canRestoreGenerationRoute(
    id: string,
    workflow: SetupGenerationWorkflow,
  ): boolean {
    const workspace = this.workspacePath();
    if (workspace === null) return false;
    let record = this.get(id);
    if (!record) {
      // A saved route can be checked before the workspace activation effect runs.
      untracked(() => this.adoptLegacyTabs());
      record = this.get(id);
    }
    return (
      record !== null &&
      bindingOf(record)?.workflow === workflow &&
      sameSetupWorkspacePath(record.workspacePath, workspace)
    );
  }

  /** Where Setup opens `record` (plan section 3). */
  public targetOf(
    record: SetupRunRecord,
    destination?: 'entry',
  ): OnboardingTarget {
    const target = stepTarget(record);
    return destination === 'entry'
      ? {
          ...target,
          subPath: entrySubPathFor(record.workflow, record.parentId !== null),
        }
      : target;
  }

  public setGuidanceHandoff(id: string, state: GuidanceHandoffState): void {
    this.patch(id, (record) =>
      record.workflow === 'agent-generation' &&
      record.status === 'completed' &&
      record.guidanceHandoff !== state
        ? { ...record, guidanceHandoff: state }
        : record,
    );
  }

  /** Whether a cancel of `id` waits for backend confirmation. */
  public isCancelling(id: string): boolean {
    return this._cancelling().has(id);
  }

  /**
   * Start a run, or attach to the live one of the same workflow and
   * workspace (rule 1). Records only: the caller starts the backend work
   * with `tabId = record.id`.
   */
  public start(
    workflow: SetupRunWorkflow,
    workspacePath: string | null | undefined,
    options: SetupRunStartOptions = {},
  ): SetupRunRecord | null {
    const workspace = setupWorkspacePath(workspacePath);
    if (!workspace) return null;
    const live = this.runsFor(workspace).find(
      (record) => record.workflow === workflow && isLive(record),
    );
    if (live) return live;
    const step =
      options.step && isSetupRunStepOf(workflow, options.step)
        ? options.step
        : SETUP_RUN_STEPS[workflow][0];
    const now = Date.now();
    const record: SetupRunRecord = {
      id: newRunId(),
      workspacePath: workspace,
      workflow,
      status: options.status ?? 'running',
      step,
      backendRunId: null,
      analysisRunId: options.analysisRunId ?? null,
      parentId: options.parentId ?? null,
      ...(options.origin ? { origin: options.origin } : {}),
      unseen: false,
      createdAt: now,
      updatedAt: now,
    };
    this.liveThisSession.add(record.id);
    this.insert(record);
    return record;
  }

  /**
   * Adopt a backend owner discovered through a bound workflow command (R1).
   * Returns the existing record when there is one.
   */
  public adopt(binding: SetupGenerationTabBinding): SetupRunRecord | null {
    return this.adoptBinding(binding, true);
  }

  /** @internal Adopt a pushed run when it has not been dismissed. */
  public adoptPushedRun(
    binding: SetupGenerationRunBinding,
  ): SetupRunRecord | null {
    if (!this.get(binding.tabId) && this.dismissals.hasPushedBinding(binding))
      return null;
    return this.adopt(binding);
  }

  private adoptBinding(
    binding: SetupGenerationTabBinding,
    live: boolean,
    lastActivityAt?: number,
  ): SetupRunRecord | null {
    const existing = this.get(binding.tabId);
    if (existing)
      return matchesBinding(this.bindingFor(existing), binding)
        ? existing
        : null;
    const record = createBoundRunRecord(binding, lastActivityAt);
    if (!record) return null;
    if (live) this.liveThisSession.add(record.id);
    this.insert(record);
    return record;
  }

  /** A view shows `id`: completions are seen while it stays attached. */
  public attach(id: string): SetupRunRecord | null {
    const record = this.get(id);
    if (!record) return null;
    this.viewing.add(id);
    this.markSeen(id);
    return this.get(id);
  }

  /** The view of `id` closed. Never cancels the run (rule 5). */
  public release(id: string): void {
    this.viewing.delete(id);
  }

  public markSeen(id: string): void {
    this.patch(id, (record) =>
      record.unseen ? { ...record, unseen: false } : record,
    );
  }

  /** Apply a state change reported by the workflow's owner. */
  public report(id: string, update: SetupRunReport): SetupRunRecord | null {
    const record = this.get(id);
    if (!record) return null;
    this.apply(id, update);
    return this.get(id);
  }

  /** @internal Apply the workflow view's verified state to its current record. */
  public reportRun(
    id: string,
    run: SetupGenerationRunState,
  ): SetupRunRecord | null {
    return this.bound.reportRun(id, run);
  }

  /** @internal Bound-run coordination delegate. */
  public startInitial<T>(
    binding: SetupGenerationTabBinding,
    send: () => Promise<T>,
  ): Promise<T> {
    return this.bound.startInitial(binding, send);
  }

  /** @internal Bound-run coordination delegate. */
  public reporterFor(id: string): (run: SetupGenerationRunState) => void {
    return this.bound.reporterFor(id);
  }

  /** @internal Bound-run coordination delegate. */
  public reportStream(pushed: SetupGenerationRunBinding): boolean {
    return this.bound.reportStream(pushed);
  }

  /** @internal Bound-run coordination delegate. */
  public verifyTerminal(pushed: SetupGenerationRunBinding): Promise<boolean> {
    return this.bound.verifyTerminal(pushed);
  }

  /** @internal Resolve the record carrying the run, including an owner reported by a settled start. */
  public whenStarted(id: string): Promise<SetupRunRecord | null> {
    return this.bound.whenStarted(id);
  }

  /** @internal Resolve both initial starts and repeats against the backend's owner. */
  public resolveBlockedStart(
    binding: SetupGenerationTabBinding,
    ownerTabId: string,
  ): Promise<{
    owner: SetupRunRecord | null;
    run: SetupGenerationRunState | null;
  }> {
    return this.bound.resolveBlockedStart(binding, ownerTabId);
  }

  /** The backend binding of a generation or guidance record; else `null`. */
  public bindingFor(record: SetupRunRecord): SetupGenerationTabBinding | null {
    return bindingOf(record);
  }

  public setStep(id: string, step: SetupRunStep): void {
    this.apply(id, { step });
  }

  public setSelection(id: string, skillIds: readonly string[]): void {
    this.patch(id, (record) =>
      record.workflow === 'skill-review'
        ? { ...record, selection: { skillIds: [...skillIds] } }
        : record,
    );
  }

  /** Remove a terminal record (rule 6). Backend artifacts stay. */
  public dismiss(id: string): boolean {
    const record = this.get(id);
    if (!record || !isTerminalSetupRunStatus(record.status)) return false;
    this.dismissals.remember(record);
    this.remove(id);
    return true;
  }

  /**
   * Cancel a live run (rule 2). The record becomes `cancelled` only once the
   * backend confirms or reconcile shows the run is not active; until then
   * `isCancelling(id)` is true. Resolves `true` when the run is cancelled.
   */
  public async cancel(id: string): Promise<boolean> {
    const record = this.get(id);
    if (!record || !isLive(record) || this.isCancelling(id)) return false;
    this.setCancelling(id, true);
    try {
      switch (record.workflow) {
        case 'analysis':
          return await this.analysis.cancel(record);
        case 'agent-generation':
        case 'project-guidance':
          return await this.bound.cancel(record);
        case 'skill-review':
        case 'team-builder':
          // The work runs in this webview (the review call, the team-builder
          // coordinator); its owner aborts it. Nothing on the backend to wait for.
          this.apply(id, { status: 'cancelled' });
          return true;
      }
    } finally {
      this.setCancelling(id, false);
    }
  }

  /**
   * Retry a `failed` or `interrupted` run on the same record (rule 3).
   * Resolves the record that now carries the run: itself, or the record of a
   * run that already owns the workflow (`blocked`).
   */
  public async retry(id: string): Promise<SetupRunRecord | null> {
    const record = this.get(id);
    if (
      !record ||
      (record.status !== 'failed' && record.status !== 'interrupted')
    ) {
      return null;
    }
    this.liveThisSession.add(id);
    switch (record.workflow) {
      case 'analysis':
        this.apply(id, { status: 'running', step: 'analyzing', error: null });
        this.analysis.run(record, this.runner.resumableAnalysis() !== null);
        return this.get(id);
      case 'skill-review':
        this.reviewSkills(id, { force: true }).catch(() => {
          // degradation-audit: optional-capability - the record carries the failure; the skills page re-reads it
        });
        return this.get(id);
      case 'agent-generation':
      case 'project-guidance':
        return this.bound.start(record, 'retry');
      case 'team-builder':
        this.apply(id, { status: 'needs-input', step: 'review', error: null });
        return this.get(id);
    }
  }

  /**
   * Run a `completed` or `cancelled` workflow again as a new record with the
   * same parent (rule 4). The old record and its results stay. A live run of
   * the workflow is attached instead. Work that needs no user input starts.
   */
  public rerun(id: string): SetupRunRecord | null {
    const previous = this.get(id);
    if (
      !previous ||
      (previous.status !== 'completed' && previous.status !== 'cancelled')
    ) {
      return null;
    }
    const live = this.runsFor(previous.workspacePath).find(
      (record) => record.workflow === previous.workflow && isLive(record),
    );
    if (live) return live;
    const userStart =
      previous.workflow === 'agent-generation' ||
      previous.workflow === 'team-builder';
    const record = this.start(previous.workflow, previous.workspacePath, {
      parentId: previous.parentId,
      analysisRunId:
        previous.workflow === 'analysis' ? null : previous.analysisRunId,
      ...(previous.origin ? { origin: previous.origin } : {}),
      status: userStart ? 'needs-input' : 'running',
    });
    if (!record) return null;
    switch (record.workflow) {
      case 'analysis':
        this.analysis.run(record, false);
        break;
      case 'skill-review':
        this.reviewSkills(record.id, { force: true }).catch(() => {
          // degradation-audit: optional-capability - the record carries the failure; the stored review stays until a new one succeeds
        });
        break;
      case 'project-guidance':
        void this.bound.start(record, 'regenerate');
        break;
      case 'agent-generation':
      case 'team-builder':
        break;
    }
    return this.get(record.id);
  }

  /**
   * The judged skill review of a skill-review record. Attaches to the
   * in-flight review; otherwise reads the stored review, and runs the judged
   * call only when none is stored or on `force` ("Review again"). The stored
   * review is replaced only after a new one succeeds.
   *
   * Rejects with the RPC error (a `WizardRpcError` carrying its code).
   */
  public reviewSkills(
    id: string,
    options: { force?: boolean } = {},
  ): Promise<WizardRecommendAnalysisSkillsResult | null> {
    return this.skillReview.reviewSkills(id, options);
  }

  public savedAnalysisError(workspacePath: string | null): string | null {
    return this.savedAnalysis.errorFor(workspacePath);
  }

  public isDiscoveringSavedAnalysis(workspacePath: string | null): boolean {
    return this.savedAnalysis.isDiscovering(workspacePath);
  }

  public retrySavedAnalysis(workspacePath: string): Promise<void> {
    return this.savedAnalysis.discover(workspacePath);
  }

  public hasDismissedGeneration(workspacePath: string | null): boolean {
    return this.bound.hasDismissedCheckpoint(workspacePath);
  }

  public reopenDismissedGeneration(
    workspacePath: string,
  ): SetupRunRecord | null {
    if (!sameSetupWorkspacePath(this.workspacePath(), workspacePath))
      return null;
    return this.bound.reopenDismissedCheckpoint(workspacePath);
  }

  /** Reconcile the active workspace's records with the backend now. */
  public refresh(): Promise<void> {
    return this.reconcile();
  }

  private async activate(): Promise<void> {
    this.adoptLegacyTabs();
    this.bound.restoreGuidanceHandoffs();
    await this.reconcile();
  }

  /** D6: restored chat tabs of a Setup workflow hand their binding over once. */
  private adoptLegacyTabs(): void {
    for (const tab of consumeLegacySetupTabs())
      this.adoptBinding(tab, false, tab.lastActivityAt);
  }

  private async reconcile(): Promise<void> {
    const sequence = ++this.reconcileSequence;
    const workspace = this.workspacePath();
    if (!workspace) return;
    const resumable = await this.rpc.getResumableRun(workspace);
    if (sequence !== this.reconcileSequence) return;
    if (this.workspacePath() !== workspace) return;
    await this.analysis.reconcile(workspace, resumable);
    if (
      sequence !== this.reconcileSequence ||
      this.workspacePath() !== workspace
    )
      return;
    this.bound.adoptResumableGeneration(workspace, resumable);
    await Promise.all([
      this.savedAnalysis.discover(workspace),
      ...this.runsFor(workspace)
        .filter((record) => isLive(record))
        .map((record) => this.reconcileRecord(record)),
    ]);
  }

  private async reconcileRecord(record: SetupRunRecord): Promise<void> {
    switch (record.workflow) {
      case 'agent-generation':
      case 'project-guidance':
        await this.bound.reconcile(record);
        return;
      case 'skill-review':
        return this.skillReview.reconcile(record);
      case 'team-builder':
        // No backend run: an install or launch cut by a reload is interrupted.
        if (
          !this.liveThisSession.has(record.id) &&
          (record.step === 'installing' || record.step === 'launching')
        ) {
          this.apply(record.id, { status: 'interrupted' });
        }
        return;
      case 'analysis':
        return;
    }
  }

  private apply(
    id: string,
    update: SetupRunReport,
    correction = false,
    finalizationRunId?: string,
  ): void {
    this.patch(id, (record) => {
      const next = applyReportFields(record, update);
      const becameTerminal =
        isTerminalSetupRunStatus(next.status) &&
        !isTerminalSetupRunStatus(record.status);
      if (becameTerminal || correction) {
        this.bound.settle(id, finalizationRunId);
        next.unseen = !this.viewing.has(id);
        this.liveThisSession.delete(id);
        this.setCancelling(id, false);
      } else if (!isTerminalSetupRunStatus(next.status)) {
        next.unseen = false;
      }
      return next;
    });
  }

  private patch(
    id: string,
    change: (record: StoredSetupRunRecord) => StoredSetupRunRecord,
  ): void {
    const record = this.get(id);
    if (!record) return;
    const workspace = normalizeSetupWorkspacePath(record.workspacePath);
    if (!workspace) return;
    const next = change(record);
    if (next === record) return;
    const updated = { ...next, updatedAt: Date.now() };
    this._index.update((index) => ({
      ...index,
      [workspace]: (index[workspace] ?? []).map((item) =>
        item.id === id ? updated : item,
      ),
    }));
    this.scheduleWrite();
    this.bound.scheduleGuidanceHandoff(record, updated);
  }

  private insert(record: SetupRunRecord): void {
    const workspace = normalizeSetupWorkspacePath(record.workspacePath);
    if (!workspace) return;
    this._index.update((index) => {
      const previous = index[workspace] ?? [];
      const kept = capWorkspaceRuns([...previous, record]);
      for (const item of previous)
        if (!kept.includes(item)) this.forget(item.id);
      return { ...index, [workspace]: kept };
    });
    this.scheduleWrite();
  }

  private forget(id: string): void {
    this.viewing.delete(id);
    this.bound.forget(id);
    this.liveThisSession.delete(id);
    this.setCancelling(id, false);
  }

  private remove(id: string): void {
    const record = this.get(id);
    if (!record) return;
    const workspace = normalizeSetupWorkspacePath(record.workspacePath);
    if (!workspace) return;
    this.forget(id);
    this._index.update((index) => {
      const rest = (index[workspace] ?? []).filter((item) => item.id !== id);
      const next: Record<string, readonly SetupRunRecord[]> = { ...index };
      if (rest.length > 0) next[workspace] = rest;
      else delete next[workspace];
      return next;
    });
    this.scheduleWrite();
  }

  private setCancelling(id: string, on: boolean): void {
    const current = this._cancelling();
    if (current.has(id) === on) return;
    const next = new Set(current);
    if (on) next.add(id);
    else next.delete(id);
    this._cancelling.set(next);
  }

  /** One write per microtask, whatever the number of changes. */
  private scheduleWrite(): void {
    if (this.writeQueued || !this.storage) return;
    this.writeQueued = true;
    queueMicrotask(() => {
      this.writeQueued = false;
      if (this.storage)
        writeSetupRunIndex(
          this.storage,
          this._index(),
          this.dismissals.snapshot(),
        );
    });
  }
}

/**
 * SetupRunStore (TASK_2026_2330, plan component 1).
 *
 * The single owner of Setup run records for every workspace: it creates,
 * attaches, reconciles, persists and derives lists and targets. A record is a
 * background workflow's identity in the webview, independent of any chat tab
 * (D1, D2): for generation and guidance the record id is the backend binding
 * `tabId`.
 *
 * The backend stays the source of truth. The persisted index holds ids,
 * statuses and steps; reconcile maps backend state onto them once per
 * workspace activation, on `refresh()`, on pushed reports and on one shared
 * 2.5 s poll while a bound run is running without push.
 *
 * Normative rules (plan "Cancel, retry and re-run rules"):
 * 1. One live run per workflow per workspace: `start` attaches.
 * 2. Cancel waits for backend confirmation (`isCancelling`).
 * 3. Retry reuses the record; generation resumes from its checkpoint.
 * 4. Re-run creates a new record and keeps the old one.
 * 5. Leaving Setup never cancels a run.
 * 6. Dismiss removes terminal records only.
 * 7. A completion without a view sets `unseen`.
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
import {
  VSCodeService,
  isOnboardingIdentityValue,
  type OnboardingTarget,
} from '@ptah-extension/core';
import type {
  SetupGenerationRunBinding,
  SetupGenerationRunState,
  SetupGenerationTabBinding,
  WizardGetResumableRunResponse,
  WizardRecommendAnalysisSkillsResult,
} from '@ptah-extension/shared';
import { GenerationHandoffStore } from './generation-handoff.store';
import {
  isSetupRunStepOf,
  normalizeSetupWorkspacePath,
  readSetupRunIndex,
  capWorkspaceRuns,
  writeSetupRunIndex,
  type GuidanceHandoffState,
  type SetupRunIndex,
  type StoredSetupRunRecord,
} from './setup-run-persistence';
import {
  bindingOf,
  isBound,
  matchesBinding,
  readBoundState,
  reconcileGuidanceOutput,
  requestBoundStart,
  SetupRunAttempts,
  SetupRunPoll,
  startRefusalCopy,
  verifiedRunStatus,
  workflowOfBinding,
  type SetupRunAttempt,
} from './setup-run-attempt';
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

/** Matches the runner's `BACKEND_POLL_INTERVAL_MS`. */
export const SETUP_RUN_POLL_INTERVAL_MS = 2500;

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

/** A state change reported by a workflow owner (event adapter, stores, pages). */
export interface SetupRunReport {
  status?: SetupRunStatus;
  step?: SetupRunStep;
  backendRunId?: string;
  analysisRunId?: string;
  /** User-facing text only; `null` clears it. */
  error?: string | null;
  handoffTabId?: string;
  teamBuilder?: { intent: string; installed: string[] };
}

const LIVE_STATUSES: ReadonlySet<SetupRunStatus> = new Set([
  'running',
  'needs-input',
]);

/** Fixed user copy; raw backend text never reaches a record. */
const FAILURE_COPY = {
  analysis: 'The analysis did not finish.',
  'skill-review': 'Could not load skill recommendations.',
};

const ORPHAN_GRACE_MS = 2 * SETUP_RUN_POLL_INTERVAL_MS;

function isLive(record: SetupRunRecord): boolean {
  return LIVE_STATUSES.has(record.status);
}

function newestFirst(a: SetupRunRecord, b: SetupRunRecord): number {
  return b.createdAt - a.createdAt || b.updatedAt - a.updatedAt;
}

function newRunId(): string {
  return `setup-${crypto.randomUUID()}`;
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

  private readonly _index = signal<SetupRunIndex>({});
  private readonly _cancelling = signal<ReadonlySet<string>>(new Set());
  private readonly attempts = new SetupRunAttempts();

  /** Records whose work started, was adopted live, or pushed in this session. */
  private readonly liveThisSession = new Set<string>();
  /** Analysis records for which the runner was seen running. */
  private readonly runnerSeen = new Set<string>();
  /** Records a view currently shows (rule 7). */
  private readonly viewing = new Set<string>();
  /** The in-flight judged review per skill-review record. */
  private readonly reviews = new Map<
    string,
    Promise<WizardRecommendAnalysisSkillsResult>
  >();
  private writeQueued = false;
  private reconcileSequence = 0;

  /** The active workspace, normalized. */
  public readonly workspacePath = computed(() =>
    normalizeSetupWorkspacePath(
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

  private readonly pollNeeded = computed(() =>
    this.runs().some(
      (record) => isBound(record.workflow) && this.attempts.shouldPoll(record),
    ),
  );

  private readonly poll = new SetupRunPoll(
    SETUP_RUN_POLL_INTERVAL_MS,
    () => this.pollNeeded(),
    () =>
      Promise.all(
        this.runs()
          .filter(
            (record) =>
              isBound(record.workflow) && this.attempts.shouldPoll(record),
          )
          .map((record) => this.reconcileBound(record)),
      ),
  );

  public constructor() {
    const read = this.storage
      ? readSetupRunIndex(this.storage)
      : { index: {}, corrupt: false };
    this._index.set(read.index);
    if (read.corrupt) this.scheduleWrite();

    effect(() => {
      const workspace = this.workspacePath();
      untracked(() => {
        this.poll.stop();
        if (this.pollNeeded()) this.poll.ensure();
        if (workspace) void this.activate();
      });
    });
    effect(() => {
      const running = this.runner.isRunning();
      const canceling = this.runner.isCanceling();
      this.runner.runGeneration();
      untracked(() => this.syncAnalysisFromRunner(running, canceling));
    });
    effect(() => {
      const needed = this.pollNeeded();
      untracked(() => (needed ? this.poll.ensure() : this.poll.stop()));
    });
    inject(DestroyRef).onDestroy(() => this.poll.stop());
  }

  // ---------------------------------------------------------------- reads

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

  // ------------------------------------------------------------ commands

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
    const workspace = normalizeSetupWorkspacePath(workspacePath);
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
   * Adopt a backend binding that has no record yet: a push for an unknown
   * id, or a `blocked` reply naming its `ownerTabId` (R1). Returns the
   * existing record when there is one.
   */
  public adopt(binding: SetupGenerationTabBinding): SetupRunRecord | null {
    const existing = this.get(binding.tabId);
    if (existing)
      return matchesBinding(this.bindingFor(existing), binding)
        ? existing
        : null;
    const workspace = normalizeSetupWorkspacePath(binding.workspacePath);
    if (!workspace || !isOnboardingIdentityValue(binding.tabId)) return null;
    const now = Date.now();
    const record: SetupRunRecord = {
      id: binding.tabId,
      workspacePath: workspace,
      workflow: workflowOfBinding(binding.workflow),
      status: 'running',
      step: 'generating',
      backendRunId: null,
      analysisRunId: null,
      parentId: null,
      unseen: false,
      createdAt: now,
      updatedAt: now,
    };
    this.liveThisSession.add(record.id);
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

  /** Apply the workflow view's verified state to its current record. */
  public reportRun(
    id: string,
    run: SetupGenerationRunState,
  ): SetupRunRecord | null {
    this.observeRun(id, run, this.attempts.get(id));
    return this.get(id);
  }

  public startInitial<T>(
    binding: SetupGenerationTabBinding,
    send: () => Promise<T>,
  ): Promise<T> {
    const record = this.get(binding.tabId);
    if (
      !record ||
      !isLive(record) ||
      !matchesBinding(this.bindingFor(record), binding)
    )
      return send();
    this.liveThisSession.add(record.id);
    return this.attempts.startInitial(record.id, send);
  }

  public reporterFor(id: string): (run: SetupGenerationRunState) => void {
    const attempt = this.attempts.get(id);
    return (run) => this.observeRun(id, run, attempt);
  }

  public reportStream(pushed: SetupGenerationRunBinding): boolean {
    const record = this.get(pushed.tabId);
    if (
      !this.attempts.canObserve(
        record,
        this.attempts.get(pushed.tabId),
        pushed.runId,
      )
    )
      return false;
    if (!matchesBinding(this.bindingFor(record), pushed)) return false;
    this.liveThisSession.add(record.id);
    this.attempts.evidence(record.id);
    this.attempts.pushed(record.id);
    this.apply(record.id, {
      status: 'running',
      step: 'generating',
      backendRunId: pushed.runId,
      error: null,
    });
    return true;
  }

  public async verifyTerminal(
    pushed: SetupGenerationRunBinding,
  ): Promise<boolean> {
    const { tabId: id, runId } = pushed;
    const attempt = this.attempts.get(id);
    const record = this.get(id);
    if (
      !this.attempts.canObserve(record, attempt, runId) &&
      !this.attempts.hasFinalizationFailure(record, attempt, runId)
    )
      return false;
    const binding = this.bindingFor(record);
    if (!binding || !matchesBinding(binding, pushed)) return false;
    this.liveThisSession.add(id);
    const run = await readBoundState(this.rpc, binding, runId);
    const observed =
      run?.binding?.runId === runId && this.observeRun(id, run, attempt);
    if (this.attempts.canObserve(this.get(id), attempt, runId))
      this.attempts.fallback(id);
    return (
      observed ||
      (this.attempts.get(id) === attempt &&
        this.get(id)?.backendRunId === runId)
    );
  }

  /** Resolve the record carrying the run, including an owner reported by a settled start. */
  public whenStarted(id: string): Promise<SetupRunRecord | null> {
    const attempt = this.attempts.get(id);
    return attempt?.start ?? Promise.resolve(this.get(attempt?.ownerId ?? id));
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
          return await this.cancelAnalysis(record);
        case 'agent-generation':
        case 'project-guidance':
          return await this.cancelBound(record);
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
        this.runAnalysis(record, this.runner.resumableAnalysis() !== null);
        return this.get(id);
      case 'skill-review':
        this.reviewSkills(id, { force: true }).catch(() => {
          // degradation-audit: optional-capability - the record carries the failure; the skills page re-reads it
        });
        return this.get(id);
      case 'agent-generation':
      case 'project-guidance':
        return this.startBound(record, 'retry');
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
      analysisRunId: previous.analysisRunId,
      ...(previous.origin ? { origin: previous.origin } : {}),
      status: userStart ? 'needs-input' : 'running',
    });
    if (!record) return null;
    switch (record.workflow) {
      case 'analysis':
        this.runAnalysis(record, false);
        break;
      case 'skill-review':
        this.reviewSkills(record.id, { force: true }).catch(() => {
          // degradation-audit: optional-capability - the record carries the failure; the stored review stays until a new one succeeds
        });
        break;
      case 'project-guidance':
        void this.startBound(record, 'regenerate');
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
  public async reviewSkills(
    id: string,
    options: { force?: boolean } = {},
  ): Promise<WizardRecommendAnalysisSkillsResult | null> {
    const inFlight = this.reviews.get(id);
    if (inFlight) return inFlight;
    const record = this.get(id);
    const analysisRunId = record?.analysisRunId;
    if (!record || record.workflow !== 'skill-review' || !analysisRunId) {
      return null;
    }
    if (!options.force) {
      const stored = await this.readStoredReview(analysisRunId);
      if (stored) {
        this.applyReviewed(id);
        return stored;
      }
      const raced = this.reviews.get(id);
      if (raced) return raced;
    }
    const hadReview =
      record.status === 'needs-input' || record.status === 'completed';
    const previousStatus = record.status;
    this.liveThisSession.add(id);
    this.apply(id, { status: 'running', step: 'reviewing', error: null });
    const review = this.rpc.recommendAnalysisSkills(analysisRunId);
    this.reviews.set(id, review);
    try {
      const result = await review;
      this.applyReviewed(id);
      return result;
    } catch (error: unknown) {
      this.apply(
        id,
        hadReview
          ? { status: previousStatus, step: 'selecting' }
          : { status: 'failed', error: FAILURE_COPY['skill-review'] },
      );
      throw error;
    } finally {
      if (this.reviews.get(id) === review) this.reviews.delete(id);
    }
  }

  /** Reconcile the active workspace's records with the backend now. */
  public refresh(): Promise<void> {
    return this.reconcile();
  }

  // --------------------------------------------------------- reconcile

  private async activate(): Promise<void> {
    this.adoptLegacyTabs();
    this.restoreGuidanceHandoffs();
    await this.reconcile();
  }

  private restoreGuidanceHandoffs(): void {
    const records = this.runsFor(this.workspacePath());
    const parents = new Set(
      records
        .filter((record) => record.workflow === 'project-guidance')
        .map((record) => record.parentId),
    );
    for (const record of records) {
      if (
        record.workflow !== 'agent-generation' ||
        record.status !== 'completed' ||
        record.guidanceHandoff === 'skipped' ||
        record.guidanceHandoff === 'consumed'
      )
        continue;
      if (parents.has(record.id)) {
        this.setGuidanceHandoff(record.id, 'consumed');
        continue;
      }
      if (typeof record.guidanceHandoff !== 'number') continue;
      const handoff = this.injector.get(GenerationHandoffStore);
      if (!handoff.pendingFor(record.id))
        handoff.schedule(record.id, record.workspacePath);
    }
  }

  /** D6: restored chat tabs of a Setup workflow hand their binding over once. */
  private adoptLegacyTabs(): void {
    for (const tab of consumeLegacySetupTabs()) this.adopt(tab);
  }

  private async reconcile(): Promise<void> {
    const sequence = ++this.reconcileSequence;
    const workspace = this.workspacePath();
    if (!workspace) return;
    const resumable = await this.rpc.getResumableRun();
    if (sequence !== this.reconcileSequence) return;
    if (this.workspacePath() !== workspace) return;
    this.reconcileAnalysis(workspace, resumable);
    this.adoptResumableGeneration(workspace, resumable);
    await Promise.all(
      this.runsFor(workspace)
        .filter((record) => isLive(record))
        .map((record) => this.reconcileRecord(record)),
    );
  }

  private async reconcileRecord(record: SetupRunRecord): Promise<void> {
    switch (record.workflow) {
      case 'agent-generation':
      case 'project-guidance':
        await this.reconcileBound(record);
        return;
      case 'skill-review':
        return this.reconcileReview(record);
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

  private reconcileAnalysis(
    workspace: string,
    resumable: WizardGetResumableRunResponse,
  ): void {
    const manifest = resumable.analysis?.manifest ?? null;
    const active =
      resumable.analysisActive === true ||
      this.runner.isRunningForWorkspace(workspace);
    const live = this.runsFor(workspace).filter(
      (record) => record.workflow === 'analysis' && isLive(record),
    );
    if (active) {
      if (live.length === 0) {
        this.adoptAnalysis(workspace, 'running', manifest?.runId ?? null);
      }
      return;
    }
    for (const record of live) {
      if (this.liveThisSession.has(record.id)) continue;
      if (
        !manifest ||
        (record.backendRunId !== null && record.backendRunId !== manifest.runId)
      ) {
        // No evidence about this run: keep the last known status.
        continue;
      }
      this.apply(record.id, {
        status:
          manifest.lifecycle === 'completed' ? 'completed' : 'interrupted',
        backendRunId: manifest.runId,
        analysisRunId: manifest.runId,
      });
    }
    if (
      manifest &&
      manifest.lifecycle !== 'completed' &&
      !this.runsFor(workspace).some(
        (record) =>
          record.workflow === 'analysis' &&
          (record.backendRunId === manifest.runId || isLive(record)),
      )
    ) {
      this.adoptAnalysis(workspace, 'interrupted', manifest.runId);
    }
  }

  private adoptAnalysis(
    workspace: string,
    status: SetupRunStatus,
    runId: string | null,
  ): void {
    const now = Date.now();
    this.insert({
      id: newRunId(),
      workspacePath: workspace,
      workflow: 'analysis',
      status,
      step: 'analyzing',
      backendRunId: runId,
      analysisRunId: runId,
      parentId: null,
      unseen: isTerminalSetupRunStatus(status),
      createdAt: now,
      updatedAt: now,
    });
  }

  /** 1.4: an unfinished checkpoint without a record becomes one record. */
  private adoptResumableGeneration(
    workspace: string,
    resumable: WizardGetResumableRunResponse,
  ): void {
    const generation = resumable.generation;
    if (
      !generation ||
      generation.lifecycle === 'completed' ||
      !isOnboardingIdentityValue(generation.runId) ||
      this.runsFor(workspace).some(
        (record) =>
          record.workflow === 'agent-generation' &&
          (record.backendRunId === generation.runId || isLive(record)),
      )
    ) {
      return;
    }
    const status: SetupRunStatus =
      generation.lifecycle === 'running' ? 'running' : 'interrupted';
    const now = Date.now();
    this.insert({
      id: newRunId(),
      workspacePath: workspace,
      workflow: 'agent-generation',
      status,
      step: 'generating',
      backendRunId: generation.runId,
      analysisRunId: null,
      parentId: null,
      unseen: status === 'interrupted',
      createdAt: now,
      updatedAt: now,
    });
  }

  private async reconcileBound(
    record: SetupRunRecord,
    ownerAttempt?: SetupRunAttempt,
  ): Promise<SetupGenerationRunState | null> {
    const binding = this.bindingFor(record);
    const attempt = this.attempts.get(record.id);
    if (
      !binding ||
      record.step === 'preview' ||
      (attempt?.pending && attempt !== ownerAttempt)
    )
      return null;
    const initialStartPending = !!attempt?.pendingInitialStarts;
    const run = await readBoundState(
      this.rpc,
      binding,
      record.backendRunId ?? undefined,
    );
    if (ownerAttempt) ownerAttempt.pending = false;
    if (run) return this.observeRun(record.id, run, attempt) ? run : null;
    const stillMissing = (): boolean =>
      !initialStartPending &&
      !attempt?.pendingInitialStarts &&
      this.get(record.id) === record &&
      this.attempts.canObserve(record, attempt);
    if (run !== null || !stillMissing()) return null;
    const live = this.liveThisSession.has(record.id);
    if (live && !this.attempts.orphaned(record.id, ORPHAN_GRACE_MS))
      return null;
    const status =
      !live && record.workflow === 'project-guidance'
        ? await reconcileGuidanceOutput(this.rpc, record)
        : 'interrupted';
    if (status && stillMissing()) this.apply(record.id, { status });
    return null;
  }

  private observeRun(
    id: string,
    run: SetupGenerationRunState,
    attempt: SetupRunAttempt | undefined,
  ): boolean {
    const observation = this.attempts.observation(this.get(id), attempt, run);
    if (!observation) return false;
    this.attempts.evidence(id);
    this.liveThisSession.add(id);
    const { update, correction, finalizationRunId } = observation;
    this.apply(id, update, correction, finalizationRunId);
    return true;
  }

  private async reconcileReview(record: SetupRunRecord): Promise<void> {
    if (
      record.status !== 'running' ||
      this.reviews.has(record.id) ||
      this.liveThisSession.has(record.id) ||
      !record.analysisRunId
    ) {
      return;
    }
    let stored: Awaited<ReturnType<WizardRpcService['getSkillReview']>>;
    try {
      stored = await this.rpc.getSkillReview(record.analysisRunId);
    } catch {
      // degradation-audit: optional-capability - an unreadable stored review keeps the last known status
      return;
    }
    if (this.reviews.has(record.id)) return;
    if (stored.review) this.applyReviewed(record.id);
    // The judged call was cut by a reload before it stored a review.
    else this.apply(record.id, { status: 'interrupted' });
  }

  private async readStoredReview(
    analysisRunId: string,
  ): Promise<WizardRecommendAnalysisSkillsResult | null> {
    try {
      return (await this.rpc.getSkillReview(analysisRunId)).review;
    } catch {
      // degradation-audit: optional-capability - an unreadable stored review falls back to a new judged review
      return null;
    }
  }

  private applyReviewed(id: string): void {
    const record = this.get(id);
    if (!record || record.status === 'completed') return;
    this.apply(id, { status: 'needs-input', step: 'selecting', error: null });
  }

  /** Map the runner's signals onto the analysis records it ran here. */
  private syncAnalysisFromRunner(running: boolean, canceling: boolean): void {
    const workspace = this.workspacePath();
    if (!workspace) return;
    const live = this.runsFor(workspace).filter(
      (record) => record.workflow === 'analysis' && isLive(record),
    );
    if (running && this.runner.isRunningForWorkspace(workspace)) {
      for (const record of live) {
        this.runnerSeen.add(record.id);
        if (canceling) this.setCancelling(record.id, true);
      }
      return;
    }
    for (const record of live) {
      if (!this.runnerSeen.has(record.id)) continue;
      this.runnerSeen.delete(record.id);
      const result = this.wizardState.multiPhaseResult();
      const ownsResult = this.runner.isResultForWorkspace(workspace);
      if (this.isCancelling(record.id)) {
        this.setCancelling(record.id, false);
        this.apply(record.id, { status: 'cancelled' });
      } else if (ownsResult && this.runner.errorMessage()) {
        this.apply(record.id, {
          status: 'failed',
          error: FAILURE_COPY.analysis,
        });
      } else if (
        ownsResult &&
        result &&
        result.manifest.lifecycle === 'completed' &&
        isOnboardingIdentityValue(result.manifest.runId)
      ) {
        this.apply(record.id, {
          status: 'completed',
          backendRunId: result.manifest.runId,
          analysisRunId: result.manifest.runId,
        });
      } else {
        this.apply(record.id, { status: 'interrupted' });
      }
    }
  }

  // ------------------------------------------------- backend commands

  private runAnalysis(record: SetupRunRecord, resume: boolean): void {
    this.liveThisSession.add(record.id);
    const run = resume
      ? this.runner.resumeAnalysis(record.workspacePath)
      : this.runner.startFreshAnalysis(record.workspacePath);
    // The runner effect maps the outcome; a rejection is already in its signals.
    run.catch(() => {
      // degradation-audit: optional-capability - the runner records the failure in errorMessage
    });
  }

  private async cancelAnalysis(record: SetupRunRecord): Promise<boolean> {
    if (this.runner.isRunningForWorkspace(record.workspacePath)) {
      this.runnerSeen.delete(record.id);
      await this.runner.cancel();
    } else {
      await this.rpc.cancelAnalysis();
    }
    const resumable = await this.rpc.getResumableRun();
    if (resumable.analysisActive === true) return false;
    this.apply(record.id, { status: 'cancelled' });
    return true;
  }

  private async cancelBound(record: SetupRunRecord): Promise<boolean> {
    const binding = this.bindingFor(record);
    const attempt = this.attempts.get(record.id);
    if (!binding || attempt?.pending) return false;
    let runId = record.backendRunId;
    try {
      if (!runId) {
        const run = await readBoundState(this.rpc, binding);
        if (
          !this.attempts.canObserve(
            this.get(record.id),
            attempt,
            run?.binding?.runId,
          )
        )
          return false;
        if (run === null && this.get(record.id)?.backendRunId === null) {
          this.apply(record.id, { status: 'cancelled' });
          return true;
        }
        const status = verifiedRunStatus(run ?? null, binding);
        if (!status || !run) return false;
        if (isTerminalSetupRunStatus(status)) {
          this.observeRun(record.id, run, attempt);
          return this.get(record.id)?.status === 'cancelled';
        }
        runId = run.binding.runId;
      }
      if (await this.rpc.cancelBoundRun({ ...binding, runId })) {
        if (this.attempts.canObserve(this.get(record.id), attempt, runId)) {
          this.apply(record.id, { status: 'cancelled' });
        }
        return this.get(record.id)?.status === 'cancelled';
      }
    } catch {
      // degradation-audit: optional-capability - an unconfirmed stop keeps the run's last known status
      return false;
    }
    if (this.attempts.canObserve(this.get(record.id), attempt, runId)) {
      await this.reconcileBound(this.get(record.id) ?? record);
    }
    return this.get(record.id)?.status === 'cancelled';
  }

  private startBound(
    record: SetupRunRecord,
    mode: 'retry' | 'regenerate',
  ): Promise<SetupRunRecord | null> {
    return this.attempts.start(record.id, (attempt) =>
      this.sendBoundStart(record, mode, attempt),
    );
  }

  private async sendBoundStart(
    record: SetupRunRecord,
    mode: 'retry' | 'regenerate',
    attempt: SetupRunAttempt,
  ): Promise<SetupRunRecord | null> {
    const binding = this.bindingFor(record);
    if (!binding) return null;
    this.liveThisSession.add(record.id);
    this.apply(record.id, {
      status: 'running',
      step: 'generating',
      error: null,
    });
    const response = await requestBoundStart(this.rpc, binding, mode);
    attempt.pending = false;
    if (this.attempts.get(record.id) !== attempt) return null;
    if (!response || 'refusalCode' in response) {
      this.apply(record.id, {
        status: mode === 'retry' ? record.status : 'failed',
        error: startRefusalCopy(response?.refusalCode),
      });
      return this.get(record.id);
    }
    const { accepted, rejection } = response;
    if (accepted && isOnboardingIdentityValue(accepted.runId)) {
      this.apply(record.id, { backendRunId: accepted.runId });
      // The backend can finish before its acceptance reaches us. Read after
      // acceptance, especially when retry reused the previous checkpoint id.
      const current = this.get(record.id);
      if (current) void this.reconcileBound(current);
      return current;
    }
    if (rejection?.reason === 'blocked' && rejection.ownerTabId) {
      const { owner } = await this.resolveBlockedStart(
        binding,
        rejection.ownerTabId,
      );
      if (this.attempts.get(record.id) !== attempt) return this.get(record.id);
      if (owner?.id === record.id) return owner;
      if (owner) {
        attempt.ownerId = owner.id;
        this.apply(record.id, {
          status: record.status === 'running' ? 'failed' : record.status,
          error: record.error ?? null,
        });
        return owner;
      }
    }
    this.apply(record.id, {
      status: 'failed',
      error: startRefusalCopy(rejection?.reason),
    });
    return this.get(record.id);
  }

  /** Resolve both initial starts and repeats against the backend's owner. */
  public async resolveBlockedStart(
    binding: SetupGenerationTabBinding,
    ownerTabId: string,
  ): Promise<{
    owner: SetupRunRecord | null;
    run: SetupGenerationRunState | null;
  }> {
    const owner = this.adopt({ ...binding, tabId: ownerTabId });
    if (owner?.id !== binding.tabId) return { owner, run: null };
    const attempt = this.attempts.hold(owner.id);
    this.liveThisSession.add(owner.id);
    this.attempts.fallback(owner.id);
    this.patch(owner.id, (record) => ({
      ...record,
      backendRunId: null,
      step: 'generating',
      status: 'running',
      unseen: false,
    }));
    const current = this.get(owner.id);
    const run = current && (await this.reconcileBound(current, attempt));
    return { owner: this.get(owner.id), run };
  }

  // ------------------------------------------------------ index writes

  private apply(
    id: string,
    update: SetupRunReport,
    correction = false,
    finalizationRunId?: string,
  ): void {
    this.patch(id, (record) => {
      const next: SetupRunRecord = { ...record };
      if (update.status !== undefined) next.status = update.status;
      if (update.step !== undefined) {
        if (isSetupRunStepOf(record.workflow, update.step)) {
          next.step = update.step;
        } else {
          console.warn(
            `[SetupRunStore] Ignored step "${update.step}" for ${record.workflow}.`,
          );
        }
      }
      if (update.backendRunId !== undefined) {
        next.backendRunId = update.backendRunId;
      }
      if (update.analysisRunId !== undefined) {
        next.analysisRunId = update.analysisRunId;
      }
      if (update.error === null) delete next.error;
      else if (update.error !== undefined) next.error = update.error;
      if (record.workflow === 'team-builder') {
        if (update.handoffTabId !== undefined) {
          next.handoffTabId = update.handoffTabId;
        }
        if (update.teamBuilder !== undefined) {
          next.teamBuilder = {
            intent: update.teamBuilder.intent,
            installed: [...update.teamBuilder.installed],
          };
        }
      }
      const becameTerminal =
        isTerminalSetupRunStatus(next.status) &&
        !isTerminalSetupRunStatus(record.status);
      if (becameTerminal || correction) {
        this.attempts.settle(id, finalizationRunId);
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
    const next = change(record);
    if (next === record) return;
    const updated = { ...next, updatedAt: Date.now() };
    this._index.update((index) => ({
      ...index,
      [record.workspacePath]: (index[record.workspacePath] ?? []).map((item) =>
        item.id === id ? updated : item,
      ),
    }));
    this.scheduleWrite();
    if (
      updated.workflow === 'agent-generation' &&
      record.status !== 'completed' &&
      updated.status === 'completed'
    ) {
      // Resolve lazily because the hand-off opens its child through this store.
      this.injector
        .get(GenerationHandoffStore)
        .schedule(updated.id, updated.workspacePath);
    }
  }

  private insert(record: SetupRunRecord): void {
    this._index.update((index) => {
      const previous = index[record.workspacePath] ?? [];
      const kept = capWorkspaceRuns([...previous, record]);
      for (const item of previous)
        if (!kept.includes(item)) this.forget(item.id);
      return { ...index, [record.workspacePath]: kept };
    });
    this.scheduleWrite();
  }

  private forget(id: string): void {
    this.viewing.delete(id);
    this.attempts.forget(id);
    this.liveThisSession.delete(id);
    this.setCancelling(id, false);
  }

  private remove(id: string): void {
    const record = this.get(id);
    if (!record) return;
    this.forget(id);
    this._index.update((index) => {
      const rest = (index[record.workspacePath] ?? []).filter(
        (item) => item.id !== id,
      );
      const next: Record<string, readonly SetupRunRecord[]> = { ...index };
      if (rest.length > 0) next[record.workspacePath] = rest;
      else delete next[record.workspacePath];
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
      if (this.storage) writeSetupRunIndex(this.storage, this._index());
    });
  }
}

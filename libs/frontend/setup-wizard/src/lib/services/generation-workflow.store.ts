import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  SetupGenerationAccepted,
  SetupGenerationRejection,
  SetupGenerationRunState,
  SetupGenerationTabBinding,
} from '@ptah-extension/shared';
import {
  WizardRpcService,
  type BoundAgentDecisions,
} from './wizard-rpc.service';
import {
  FOREIGN_WORKSPACE_COPY,
  isFinalizationCorrection,
} from './setup-run-attempt';
import { SetupRunStore } from './setup-run.store';
import type { SetupRunRecord } from './setup-run.types';

const LOOKUP_FAILED = Symbol('lookup-failed');

/** Record copy for a start the backend refused for this workspace. */

export type GenerationViewState =
  | 'idle'
  | 'starting'
  | 'running'
  | 'quiet'
  | 'cancelling'
  | 'stop-unconfirmed'
  | 'stop-unknown'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'timed-out';

/**
 * The view state of one agent-generation or guidance run, bound to a Setup
 * run record (`binding.tabId` is the record id). Initial starts with user
 * input happen here; retry, re-run and cancel belong to `SetupRunStore`,
 * and every verified run state is reported to it.
 */
@Injectable({ providedIn: 'root' })
export class GenerationWorkflowStore {
  private readonly rpc = inject(WizardRpcService);
  private readonly runs = inject(SetupRunStore);
  private readonly bindingValue = signal<SetupGenerationTabBinding | null>(
    null,
  );
  private readonly runValue = signal<SetupGenerationRunState | null>(null);
  private readonly stateValue = signal<GenerationViewState>('idle');
  private readonly rejectionValue = signal<SetupGenerationRejection | null>(
    null,
  );
  private pendingStop = false;
  private watchdog: ReturnType<typeof setTimeout> | null = null;
  private lookupFailures = 0;
  private expectedRunId: string | undefined;
  private bindingRevision = 0;
  readonly runMismatch = signal(false);
  readonly lookupExhausted = signal(false);
  readonly acceptedRun = signal<{ runId: string; revision: number } | null>(
    null,
  );
  readonly binding = this.bindingValue.asReadonly();
  readonly run = this.runValue.asReadonly();
  readonly state = this.stateValue.asReadonly();
  readonly rejection = this.rejectionValue.asReadonly();
  readonly startError = signal<string | null>(null);
  readonly isBound = computed(() =>
    [
      'starting',
      'running',
      'quiet',
      'cancelling',
      'stop-unconfirmed',
      'stop-unknown',
    ].includes(this.stateValue()),
  );
  readonly provider = computed(() => {
    const value = this.runValue()?.effectiveProvider;
    return value && value !== 'unknown' ? value : null;
  });
  readonly model = computed(() => {
    const value = this.runValue()?.effectiveModel;
    return value && value !== 'unknown' ? value : null;
  });

  bind(binding: SetupGenerationTabBinding, expectedRunId?: string): void {
    this.lookupExhausted.set(false);
    const old = this.bindingValue();
    if (
      old?.tabId === binding.tabId &&
      old.workspacePath === binding.workspacePath &&
      old.workflow === binding.workflow &&
      (this.expectedRunId === expectedRunId ||
        (expectedRunId !== undefined &&
          this.runValue()?.binding.runId === expectedRunId))
    )
      return;
    this.pendingStop = false;
    this.bindingRevision++;
    this.expectedRunId = expectedRunId;
    this.runMismatch.set(false);
    this.clearWatchdog();
    this.lookupFailures = 0;
    this.lookupExhausted.set(false);
    this.runValue.set(null);
    this.stateValue.set('idle');
    this.rejectionValue.set(null);
    this.startError.set(null);
    this.bindingValue.set(binding);
    void this.refresh();
  }

  /** Show a Setup run record: its binding and its latest run. */
  bindRecord(record: SetupRunRecord): boolean {
    const binding = this.runs.bindingFor(record);
    if (!binding) return false;
    this.bind(binding);
    return true;
  }

  unbind(): void {
    this.pendingStop = false;
    this.bindingRevision++;
    this.expectedRunId = undefined;
    this.runMismatch.set(false);
    this.clearWatchdog();
    this.lookupFailures = 0;
    this.lookupExhausted.set(false);
    this.bindingValue.set(null);
    this.runValue.set(null);
    this.stateValue.set('idle');
  }

  /**
   * Start generation for the bound tab. `decisions` carries a confirmed
   * preview's token, replace entries and target; without it the server keeps
   * every existing file and writes to the harness root.
   */
  async startAgents(
    selectedAgentIds: string[],
    decisions?: BoundAgentDecisions,
  ): Promise<void> {
    const binding = this.bindingValue();
    const revision = this.bindingRevision;
    if (
      !binding ||
      binding.workflow !== 'setup-agent-generation' ||
      this.isBound()
    )
      return;
    this.stateValue.set('starting');
    this.rejectionValue.set(null);
    this.startError.set(null);
    try {
      const response = await this.runs.startInitial(binding, () =>
        decisions
          ? this.rpc.startBoundAgents(
              binding,
              selectedAgentIds,
              false,
              decisions,
            )
          : this.rpc.startBoundAgents(binding, selectedAgentIds),
      );
      if (!this.sameBinding(binding) || revision !== this.bindingRevision)
        return;
      if (response.accepted) await this.accept(binding, response.accepted);
      else if (response.rejection)
        await this.reject(binding, response.rejection);
      else if (response.success === false) this.failStart(response.error);
      else await this.refresh();
    } catch (error: unknown) {
      if (this.sameBinding(binding) && revision === this.bindingRevision) {
        if (
          error instanceof Error &&
          error.message ===
            'The selected model is not available for this provider.'
        )
          this.startError.set(error.message);
        await this.refresh();
      }
    }
  }

  async startGuidance(): Promise<void> {
    const binding = this.bindingValue();
    const revision = this.bindingRevision;
    if (
      !binding ||
      binding.workflow !== 'setup-project-prompt' ||
      this.isBound()
    )
      return;
    this.stateValue.set('starting');
    this.rejectionValue.set(null);
    this.startError.set(null);
    try {
      const response = await this.runs.startInitial(binding, () =>
        this.rpc.startBoundGuidance(binding),
      );
      if (!this.sameBinding(binding) || revision !== this.bindingRevision)
        return;
      if (response.accepted) await this.accept(binding, response.accepted);
      else if (response.rejection)
        await this.reject(binding, response.rejection);
      else if (response.success === false) this.failStart(response.error);
      else await this.refresh();
    } catch (error: unknown) {
      if (this.sameBinding(binding) && revision === this.bindingRevision) {
        const message = error instanceof Error ? error.message : '';
        if (
          message.startsWith('SETUP_') ||
          message.includes('Update Background models and retry.')
        ) {
          this.startError.set(message);
          this.failStart();
        }
        await this.refresh();
      }
    }
  }

  /**
   * Run guidance again for the shown record: `SetupRunStore.retry` for a
   * failed or interrupted record, `rerun` (a new record) for a completed or
   * cancelled one.
   */
  async regenerateGuidance(): Promise<void> {
    const binding = this.bindingValue();
    if (
      !binding ||
      binding.workflow !== 'setup-project-prompt' ||
      this.isBound()
    )
      return;
    // Interim gap until Batch 8 binds onboarding pages to records: a binding
    // with no Setup run record has no owner to retry or re-run it, so nothing
    // happens.
    const record = this.runs.get(binding.tabId);
    if (!record) return;
    if (record.status === 'failed' || record.status === 'interrupted') {
      await this.retry();
      return;
    }
    if (record.status !== 'completed' && record.status !== 'cancelled') return;
    const revision = this.bindingRevision;
    this.beginStart();
    const next = this.runs.rerun(record.id);
    const started = next ? await this.runs.whenStarted(next.id) : null;
    if (!this.sameBinding(binding) || revision !== this.bindingRevision) return;
    await this.follow(binding, next?.id ?? null, started);
  }

  /**
   * Retry the shown record when it failed or was interrupted. Agent
   * generation resumes from its checkpoint. A run that already owns the
   * workflow is attached instead.
   */
  async retry(): Promise<void> {
    const binding = this.bindingValue();
    const record = binding ? this.runs.get(binding.tabId) : null;
    if (
      !binding ||
      !record ||
      this.isBound() ||
      (record.status !== 'failed' && record.status !== 'interrupted')
    )
      return;
    const revision = this.bindingRevision;
    this.beginStart();
    const started = await this.runs.retry(record.id);
    if (!this.sameBinding(binding) || revision !== this.bindingRevision) return;
    await this.follow(binding, record.id, started);
  }

  private beginStart(): void {
    this.stateValue.set('starting');
    this.rejectionValue.set(null);
    this.startError.set(null);
  }

  /**
   * Show what a `SetupRunStore` retry or re-run of record `startedId`
   * resolved: another record (attach), a refused start, or the new run.
   */
  private async follow(
    binding: SetupGenerationTabBinding,
    startedId: string | null,
    started: SetupRunRecord | null,
  ): Promise<void> {
    if (!started || !startedId) {
      this.failStart();
      return;
    }
    if (started.id !== startedId) {
      // `blocked`: another run owns the workflow; show it.
      this.bindRecord(started);
      return;
    }
    if (started.status !== 'running' || !started.backendRunId) {
      this.startError.set(started.error ?? null);
      this.failStart();
      return;
    }
    if (started.id !== binding.tabId) {
      // A re-run is a new record.
      const next = this.runs.bindingFor(started);
      if (next) this.bind(next, started.backendRunId);
      return;
    }
    this.runValue.set(null);
    await this.track(binding, started.backendRunId);
  }

  private async reject(
    binding: SetupGenerationTabBinding,
    rejection: SetupGenerationRejection,
  ): Promise<void> {
    this.pendingStop = false;
    if (rejection.reason === 'blocked' && rejection.ownerTabId) {
      const revision = ++this.bindingRevision;
      const { owner, run } = await this.runs.resolveBlockedStart(
        binding,
        rejection.ownerTabId,
      );
      if (!this.sameBinding(binding) || revision !== this.bindingRevision)
        return;
      if (owner?.id === binding.tabId) {
        this.stateValue.set('idle');
        this.runValue.set(null);
        this.runMismatch.set(false);
        this.expectedRunId = undefined;
        if (run) this.applyRun(run);
        return;
      }
      if (owner && this.bindRecord(owner)) return;
    }
    if (
      rejection.reason === 'invalid-binding' ||
      rejection.reason === 'workspace-mismatch'
    )
      this.runs.report(binding.tabId, {
        status: 'failed',
        error: FOREIGN_WORKSPACE_COPY,
      });
    this.rejectionValue.set(rejection);
    this.stateValue.set('idle');
  }

  private failStart(error?: string): void {
    this.pendingStop = false;
    this.clearWatchdog();
    this.lookupFailures = 0;
    this.stateValue.set('idle');
    this.startError.set(
      error === 'No agents selected. Please select at least one agent.' ||
        error === 'Agent generation could not start. Please retry.'
        ? error
        : (this.startError() ?? 'Generation could not be started. Try again.'),
    );
  }

  private async accept(
    binding: SetupGenerationTabBinding,
    accepted: SetupGenerationAccepted,
  ): Promise<void> {
    const placeholder: SetupGenerationRunState = {
      binding: { ...binding, runId: accepted.runId },
      status: 'starting',
      source: accepted.source,
      effectiveProvider: accepted.effectiveProvider,
      effectiveModel: accepted.effectiveModel,
    };
    const record = this.runs.get(binding.tabId) ?? this.runs.adopt(binding);
    if (record) this.runs.reportRun(record.id, placeholder);
    this.runValue.set(placeholder);
    await this.track(binding, accepted.runId);
  }

  /** Follow backend run `runId` of the shown binding until a lookup sees it. */
  private async track(
    binding: SetupGenerationTabBinding,
    runId: string,
  ): Promise<void> {
    this.bindingRevision++;
    this.expectedRunId = undefined;
    this.runMismatch.set(false);
    const revision = this.bindingRevision;
    this.lookupFailures = 0;
    this.rejectionValue.set(null);
    this.acceptedRun.update((previous) => ({
      runId,
      revision: (previous?.revision ?? 0) + 1,
    }));
    if (!this.runValue()) this.stateValue.set('starting');
    const report = this.runs.reporterFor(binding.tabId);
    const run = await this.safeLookup(binding, runId);
    if (!this.sameBinding(binding) || revision !== this.bindingRevision) return;
    if (run !== LOOKUP_FAILED && run?.binding.runId === runId)
      this.applyRun(run, report);
    else this.stateValue.set('quiet');
    if (this.pendingStop) await this.flushStop(binding);
  }

  stop(): void {
    if (!this.bindingValue() || !this.isBound()) return;
    this.pendingStop = true;
    this.stateValue.set('cancelling');
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const binding = this.bindingValue();
    if (!binding || this.runMismatch()) return;
    const revision = this.bindingRevision;
    const expectedRunId = this.expectedRunId;
    const report = this.runs.reporterFor(binding.tabId);
    const lookup = await this.safeLookup(
      binding,
      expectedRunId ? undefined : this.runValue()?.binding.runId,
    );
    if (!this.sameBinding(binding) || revision !== this.bindingRevision) return;
    if (lookup === LOOKUP_FAILED && expectedRunId) {
      if (this.expectedRunId !== expectedRunId) return;
      if (this.lookupFailures < 3) {
        const delay = 1000 * 2 ** this.lookupFailures++;
        this.clearWatchdog();
        this.watchdog = setTimeout(() => void this.refresh(), delay);
      } else {
        this.lookupExhausted.set(true);
      }
      return;
    }
    if (lookup !== LOOKUP_FAILED) this.lookupExhausted.set(false);
    const run = lookup === LOOKUP_FAILED ? null : lookup;
    if (expectedRunId) {
      if (this.expectedRunId !== expectedRunId) return;
      this.expectedRunId = undefined;
      if (run?.binding.runId !== expectedRunId) {
        this.runMismatch.set(true);
        this.runValue.set(null);
        this.stateValue.set('idle');
        return;
      }
    }
    this.runMismatch.set(false);
    if (!run) {
      const lastRun = this.runValue();
      if (lastRun && this.isTerminal(lastRun.status)) return;
      if (this.stateValue() !== 'idle' && this.lookupFailures < 3) {
        const delay = 1000 * 2 ** this.lookupFailures++;
        this.clearWatchdog();
        this.watchdog = setTimeout(() => void this.refresh(), delay);
      } else if (!lastRun && this.stateValue() !== 'idle') {
        this.failStart();
        return;
      }
      this.stateValue.set(
        this.pendingStop
          ? 'stop-unknown'
          : this.stateValue() === 'idle'
            ? 'idle'
            : 'quiet',
      );
      return;
    }
    this.lookupFailures = 0;
    this.clearWatchdog();
    const heldRunId = this.runValue()?.binding.runId;
    if (heldRunId && run.binding.runId !== heldRunId) return;
    this.applyRun(run, report);
    if (this.pendingStop && !this.isTerminal(run.status))
      await this.flushStop(binding);
  }

  /**
   * Send a queued Stop through `SetupRunStore.cancel`, which cancels the
   * record's backend run (the run `applyRun` last reported).
   */
  private async flushStop(binding: SetupGenerationTabBinding): Promise<void> {
    if (!this.pendingStop) return;
    this.pendingStop = false;
    const record = this.runs.get(binding.tabId) ?? this.runs.adopt(binding);
    let cancelled = false;
    try {
      cancelled = record ? await this.runs.cancel(record.id) : false;
    } catch {
      // degradation-audit: reported - an unconfirmed stop shows stop-unconfirmed and rereads the run.
      cancelled = false;
    }
    if (!this.sameBinding(binding)) return;
    this.stateValue.set(cancelled ? 'cancelling' : 'stop-unconfirmed');
    await this.refresh();
  }

  private async safeLookup(
    binding: SetupGenerationTabBinding,
    runId?: string,
  ): Promise<SetupGenerationRunState | null | typeof LOOKUP_FAILED> {
    try {
      return await this.rpc.getBoundRunState(binding, runId);
    } catch {
      // degradation-audit: reported - refresh retries a failed host lookup without exposing transport errors.
      return LOOKUP_FAILED;
    }
  }

  private applyRun(
    run: SetupGenerationRunState,
    report?: (run: SetupGenerationRunState) => void,
  ): void {
    const binding = this.bindingValue();
    if (
      !binding ||
      run.binding.tabId !== binding.tabId ||
      run.binding.workspacePath !== binding.workspacePath ||
      run.binding.workflow !== binding.workflow
    )
      return;
    const previous = this.runValue();
    if (
      previous?.binding.runId === run.binding.runId &&
      this.isTerminal(previous.status)
    ) {
      const verifiedCorrection = isFinalizationCorrection(previous, run);
      if (
        !verifiedCorrection &&
        (!this.isTerminal(run.status) || previous.result || !run.result)
      )
        return;
    }
    this.runValue.set(run);
    if (
      report &&
      (this.runs.get(binding.tabId) ||
        (!this.isTerminal(run.status) && this.runs.adopt(binding)))
    )
      report(run);
    this.stateValue.set(
      this.isTerminal(run.status)
        ? run.status
        : run.status === 'starting'
          ? 'starting'
          : this.stateValue() === 'stop-unconfirmed'
            ? 'stop-unconfirmed'
            : this.pendingStop
              ? 'cancelling'
              : run.status,
    );
    if (this.isTerminal(run.status)) {
      this.pendingStop = false;
      this.clearWatchdog();
    }
  }

  private clearWatchdog(): void {
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = null;
  }

  private sameBinding(binding: SetupGenerationTabBinding): boolean {
    const current = this.bindingValue();
    return (
      current?.tabId === binding.tabId &&
      current.workflow === binding.workflow &&
      current.workspacePath === binding.workspacePath
    );
  }

  private isTerminal(
    status: string,
  ): status is 'completed' | 'cancelled' | 'failed' | 'timed-out' {
    return ['completed', 'cancelled', 'failed', 'timed-out'].includes(status);
  }
}

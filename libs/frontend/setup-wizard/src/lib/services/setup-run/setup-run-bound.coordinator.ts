import { isOnboardingIdentityValue } from '@ptah-extension/core';
import type {
  SetupGenerationRunBinding,
  SetupGenerationRunState,
  SetupGenerationTabBinding,
  WizardGetResumableRunResponse,
} from '@ptah-extension/shared';
import {
  isTerminalSetupRunStatus,
  type SetupRunRecord,
  type SetupRunStatus,
} from '../setup-run.types';
import type { WizardRpcService } from '../wizard-rpc.service';
import {
  readBoundState,
  reconcileGuidanceOutput,
  requestBoundStart,
  type SetupRunAttempts,
  type SetupRunAttempt,
} from './setup-run-attempt';
import {
  bindingOf,
  isBound,
  matchesBinding,
  startRefusalCopy,
  verifiedRunStatus,
} from './setup-run-binding';
import {
  isLive,
  newRunId,
  ORPHAN_GRACE_MS,
  type SetupRunRecordHost,
} from './setup-run-host';
import { SETUP_RUN_POLL_INTERVAL_MS, SetupRunPoll } from './setup-run-poll';

interface GuidanceHandoffScheduler {
  pendingFor(agentRunId: string): object | null;
  schedule(agentRunId: string, workspacePath: string): void;
}

export class SetupRunBoundCoordinator {
  private readonly poll: SetupRunPoll;

  public constructor(
    private readonly host: SetupRunRecordHost,
    private readonly rpc: WizardRpcService,
    private readonly attempts: SetupRunAttempts,
    runs: () => readonly SetupRunRecord[],
    pollNeeded: () => boolean,
    private readonly getHandoff: () => GuidanceHandoffScheduler,
  ) {
    this.poll = new SetupRunPoll(SETUP_RUN_POLL_INTERVAL_MS, pollNeeded, () =>
      Promise.all(
        runs()
          .filter((record) => this.shouldPoll(record))
          .map((record) => this.reconcile(record)),
      ),
    );
  }

  public shouldPoll(record: SetupRunRecord): boolean {
    return isBound(record.workflow) && this.attempts.shouldPoll(record);
  }

  public ensurePoll(): void {
    this.poll.ensure();
  }

  public stopPoll(): void {
    this.poll.stop();
  }

  public settle(id: string, finalizationRunId?: string): void {
    this.attempts.settle(id, finalizationRunId);
  }

  public forget(id: string): void {
    this.attempts.forget(id);
  }

  public scheduleGuidanceHandoff(
    previous: SetupRunRecord,
    updated: SetupRunRecord,
  ): void {
    if (
      updated.workflow === 'agent-generation' &&
      previous.status !== 'completed' &&
      updated.status === 'completed'
    ) {
      this.getHandoff().schedule(updated.id, updated.workspacePath);
    }
  }

  /** Apply the workflow view's verified state to its current record. */
  public reportRun(
    id: string,
    run: SetupGenerationRunState,
  ): SetupRunRecord | null {
    this.observeRun(id, run, this.attempts.get(id));
    return this.host.get(id);
  }

  public startInitial<T>(
    binding: SetupGenerationTabBinding,
    send: () => Promise<T>,
  ): Promise<T> {
    const record = this.host.get(binding.tabId);
    if (
      !record ||
      !isLive(record) ||
      !matchesBinding(bindingOf(record), binding)
    )
      return send();
    this.host.markLiveThisSession(record.id);
    return this.attempts.startInitial(record.id, send);
  }

  public reporterFor(id: string): (run: SetupGenerationRunState) => void {
    const attempt = this.attempts.get(id);
    return (run) => this.observeRun(id, run, attempt);
  }

  public reportStream(pushed: SetupGenerationRunBinding): boolean {
    const record = this.host.get(pushed.tabId);
    if (
      !this.attempts.canObserve(
        record,
        this.attempts.get(pushed.tabId),
        pushed.runId,
      )
    )
      return false;
    if (!matchesBinding(bindingOf(record), pushed)) return false;
    this.host.markLiveThisSession(record.id);
    this.attempts.evidence(record.id);
    this.attempts.pushed(record.id);
    this.host.apply(record.id, {
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
    const record = this.host.get(id);
    if (
      !this.attempts.canObserve(record, attempt, runId) &&
      !this.attempts.hasFinalizationFailure(record, attempt, runId)
    )
      return false;
    const binding = bindingOf(record);
    if (!binding || !matchesBinding(binding, pushed)) return false;
    this.host.markLiveThisSession(id);
    const run = await readBoundState(this.rpc, binding, runId);
    const observed =
      run?.binding?.runId === runId && this.observeRun(id, run, attempt);
    if (this.attempts.canObserve(this.host.get(id), attempt, runId))
      this.attempts.fallback(id);
    return (
      observed ||
      (this.attempts.get(id) === attempt &&
        this.host.get(id)?.backendRunId === runId)
    );
  }

  /** Resolve the record carrying the run, including an owner reported by a settled start. */
  public whenStarted(id: string): Promise<SetupRunRecord | null> {
    return (
      this.attempts.startPromise(id) ??
      Promise.resolve(this.host.get(this.attempts.resolveTargetId(id)))
    );
  }

  public restoreGuidanceHandoffs(): void {
    const records = this.host.runsFor(this.host.workspacePath());
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
        this.host.setGuidanceHandoff(record.id, 'consumed');
        continue;
      }
      if (typeof record.guidanceHandoff !== 'number') continue;
      const handoff = this.getHandoff();
      if (!handoff.pendingFor(record.id))
        handoff.schedule(record.id, record.workspacePath);
    }
  }

  /** 1.4: an unfinished checkpoint without a record becomes one record. */
  public adoptResumableGeneration(
    workspace: string,
    resumable: WizardGetResumableRunResponse,
  ): void {
    const generation = resumable.generation;
    if (
      !generation ||
      generation.lifecycle === 'completed' ||
      !isOnboardingIdentityValue(generation.runId) ||
      this.host
        .runsFor(workspace)
        .some(
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
    this.host.insert({
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

  public async reconcile(
    record: SetupRunRecord,
    ownerAttempt?: SetupRunAttempt,
  ): Promise<SetupGenerationRunState | null> {
    const binding = bindingOf(record);
    const attempt = this.attempts.get(record.id);
    if (
      !binding ||
      record.step === 'preview' ||
      (this.attempts.isPending(record.id) && attempt !== ownerAttempt)
    )
      return null;
    const initialStartPending = this.attempts.hasPendingInitialStarts(attempt);
    const run = await readBoundState(
      this.rpc,
      binding,
      record.backendRunId ?? undefined,
    );
    if (ownerAttempt) this.attempts.clearPending(record.id, ownerAttempt);
    if (run) return this.observeRun(record.id, run, attempt) ? run : null;
    const stillMissing = (): boolean =>
      !initialStartPending &&
      !this.attempts.hasPendingInitialStarts(attempt) &&
      this.host.get(record.id) === record &&
      this.attempts.canObserve(record, attempt);
    if (run !== null || !stillMissing()) return null;
    const live = this.host.isLiveThisSession(record.id);
    if (live && !this.attempts.orphaned(record.id, ORPHAN_GRACE_MS))
      return null;
    const status =
      !live && record.workflow === 'project-guidance'
        ? await reconcileGuidanceOutput(this.rpc, record)
        : 'interrupted';
    if (status && stillMissing()) this.host.apply(record.id, { status });
    return null;
  }

  private observeRun(
    id: string,
    run: SetupGenerationRunState,
    attempt: SetupRunAttempt | undefined,
  ): boolean {
    const observation = this.attempts.observation(
      this.host.get(id),
      attempt,
      run,
    );
    if (!observation) return false;
    this.attempts.evidence(id);
    this.host.markLiveThisSession(id);
    const { update, correction, finalizationRunId } = observation;
    this.host.apply(id, update, correction, finalizationRunId);
    return true;
  }

  public async cancel(record: SetupRunRecord): Promise<boolean> {
    const binding = bindingOf(record);
    const attempt = this.attempts.get(record.id);
    if (!binding || this.attempts.isPending(record.id)) return false;
    let runId = record.backendRunId;
    try {
      if (!runId) {
        const run = await readBoundState(this.rpc, binding);
        if (
          !this.attempts.canObserve(
            this.host.get(record.id),
            attempt,
            run?.binding?.runId,
          )
        )
          return false;
        if (run === null && this.host.get(record.id)?.backendRunId === null) {
          this.host.apply(record.id, { status: 'cancelled' });
          return true;
        }
        const status = verifiedRunStatus(run ?? null, binding);
        if (!status || !run) return false;
        if (isTerminalSetupRunStatus(status)) {
          this.observeRun(record.id, run, attempt);
          return this.host.get(record.id)?.status === 'cancelled';
        }
        runId = run.binding.runId;
      }
      if (await this.rpc.cancelBoundRun({ ...binding, runId })) {
        if (
          this.attempts.canObserve(this.host.get(record.id), attempt, runId)
        ) {
          this.host.apply(record.id, { status: 'cancelled' });
        }
        return this.host.get(record.id)?.status === 'cancelled';
      }
    } catch {
      // degradation-audit: optional-capability - an unconfirmed stop keeps the run's last known status
      return false;
    }
    if (this.attempts.canObserve(this.host.get(record.id), attempt, runId)) {
      await this.reconcile(this.host.get(record.id) ?? record);
    }
    return this.host.get(record.id)?.status === 'cancelled';
  }

  public start(
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
    const binding = bindingOf(record);
    if (!binding) return null;
    this.host.markLiveThisSession(record.id);
    this.host.apply(record.id, {
      status: 'running',
      step: 'generating',
      error: null,
    });
    const response = await requestBoundStart(this.rpc, binding, mode);
    this.attempts.clearPending(record.id, attempt);
    if (this.attempts.get(record.id) !== attempt) return null;
    if (!response || 'refusalCode' in response) {
      this.host.apply(record.id, {
        status: mode === 'retry' ? record.status : 'failed',
        error: startRefusalCopy(response?.refusalCode),
      });
      return this.host.get(record.id);
    }
    const { accepted, rejection } = response;
    if (accepted && isOnboardingIdentityValue(accepted.runId)) {
      this.host.apply(record.id, { backendRunId: accepted.runId });
      // The backend can finish before its acceptance reaches us. Read after
      // acceptance, especially when retry reused the previous checkpoint id.
      const current = this.host.get(record.id);
      if (current) void this.reconcile(current);
      return current;
    }
    if (rejection?.reason === 'blocked' && rejection.ownerTabId) {
      const { owner } = await this.resolveBlockedStart(
        binding,
        rejection.ownerTabId,
      );
      if (this.attempts.get(record.id) !== attempt)
        return this.host.get(record.id);
      if (owner?.id === record.id) return owner;
      if (owner) {
        this.attempts.assignOwner(record.id, attempt, owner.id);
        this.host.apply(record.id, {
          status: record.status === 'running' ? 'failed' : record.status,
          error: record.error ?? null,
        });
        return owner;
      }
    }
    this.host.apply(record.id, {
      status: 'failed',
      error: startRefusalCopy(rejection?.reason),
    });
    return this.host.get(record.id);
  }

  /** Resolve both initial starts and repeats against the backend's owner. */
  public async resolveBlockedStart(
    binding: SetupGenerationTabBinding,
    ownerTabId: string,
  ): Promise<{
    owner: SetupRunRecord | null;
    run: SetupGenerationRunState | null;
  }> {
    const owner = this.host.adopt({ ...binding, tabId: ownerTabId });
    if (owner?.id !== binding.tabId) return { owner, run: null };
    const attempt = this.attempts.hold(owner.id);
    this.host.markLiveThisSession(owner.id);
    this.attempts.fallback(owner.id);
    this.host.patch(owner.id, (record) => ({
      ...record,
      backendRunId: null,
      step: 'generating',
      status: 'running',
      unseen: false,
    }));
    const current = this.host.get(owner.id);
    const run = current && (await this.reconcile(current, attempt));
    return { owner: this.host.get(owner.id), run };
  }
}

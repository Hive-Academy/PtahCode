import { signal } from '@angular/core';
import type {
  EnhancedPromptsRunWizardResponse,
  SetupGenerationRunState,
  SetupGenerationTabBinding,
  WizardSubmitSelectionResponse,
} from '@ptah-extension/shared';
import { WizardRpcError, type WizardRpcService } from '../wizard-rpc.service';
import {
  isTerminalSetupRunStatus,
  type SetupRunRecord,
  type SetupRunStatus,
} from '../setup-run.types';
import {
  bindingOf,
  isFinalizationCorrection,
  RUN_FAILURE_COPY,
  verifiedRunStatus,
} from './setup-run-binding';

/** A local start gets a new identity even when the host reuses its checkpoint id. */
interface AttemptState {
  pending: boolean;
  pendingInitialStarts?: number;
  start?: Promise<SetupRunRecord | null>;
  ownerId?: string;
  settled?: boolean;
}

export type SetupRunAttempt = Readonly<AttemptState>;

export class SetupRunAttempts {
  private readonly attempts = new Map<string, AttemptState>();
  private readonly missingSince = new Map<string, number>();
  private readonly finalizationFailures = new Map<string, string>();
  private readonly delivery = signal<ReadonlyMap<string, 'push' | 'fallback'>>(
    new Map(),
  );

  public get(id: string): SetupRunAttempt | undefined {
    return this.attempts.get(id);
  }

  public clearPending(id: string, attempt: SetupRunAttempt): void {
    const current = this.attempts.get(id);
    if (current === attempt) current.pending = false;
  }

  public assignOwner(
    id: string,
    attempt: SetupRunAttempt,
    ownerId: string,
  ): void {
    const current = this.attempts.get(id);
    if (current === attempt) current.ownerId = ownerId;
  }

  public isPending(id: string): boolean {
    return this.get(id)?.pending ?? false;
  }

  public hasPendingInitialStarts(
    attempt: SetupRunAttempt | undefined,
  ): boolean {
    return !!attempt?.pendingInitialStarts;
  }

  public startPromise(id: string): Promise<SetupRunRecord | null> | undefined {
    return this.get(id)?.start;
  }

  public resolveTargetId(id: string): string {
    return this.get(id)?.ownerId ?? id;
  }

  /** Initial starts can receive verified run evidence before the RPC returns. */
  public async startInitial<T>(id: string, send: () => Promise<T>): Promise<T> {
    const attempt = this.attempts.get(id) ?? { pending: false };
    this.attempts.set(id, attempt);
    attempt.pendingInitialStarts = (attempt.pendingInitialStarts ?? 0) + 1;
    this.evidence(id);
    try {
      return await send();
    } finally {
      attempt.pendingInitialStarts--;
      this.prune(id, attempt);
    }
  }

  public start(
    id: string,
    send: (attempt: SetupRunAttempt) => Promise<SetupRunRecord | null>,
  ): Promise<SetupRunRecord | null> {
    const attempt: AttemptState = { pending: true };
    this.attempts.set(id, attempt);
    this.clearEvidence(id);
    const start = send(attempt);
    attempt.start = start;
    const settle = (): void => {
      delete attempt.start;
      this.prune(id, attempt);
    };
    void start.then(settle, settle);
    return start;
  }

  public hold(id: string): SetupRunAttempt {
    const previous = this.attempts.get(id);
    const attempt = previous?.start ? previous : { pending: true };
    this.clearEvidence(id);
    this.attempts.set(id, attempt);
    attempt.pending = true;
    return attempt;
  }

  public forget(id: string): void {
    this.attempts.delete(id);
    this.clearEvidence(id);
    for (const [source, attempt] of this.attempts) {
      if (attempt.ownerId !== id) continue;
      delete attempt.ownerId;
      this.prune(source, attempt);
    }
  }

  private clearEvidence(id: string): void {
    this.evidence(id);
    this.setDelivery(id, undefined);
    this.finalizationFailures.delete(id);
  }

  public settle(id: string, finalizationRunId?: string): void {
    this.clearEvidence(id);
    if (finalizationRunId) this.finalizationFailures.set(id, finalizationRunId);
    const attempt = this.attempts.get(id);
    if (attempt) {
      attempt.settled = true;
      this.prune(id, attempt);
    }
  }

  private prune(id: string, attempt: SetupRunAttempt): void {
    if (
      this.get(id) === attempt &&
      attempt.settled &&
      !attempt.pendingInitialStarts &&
      !attempt.start &&
      !attempt.ownerId &&
      !this.finalizationFailures.has(id)
    )
      this.attempts.delete(id);
  }

  public evidence(id: string): void {
    this.missingSince.delete(id);
  }

  public orphaned(id: string, graceMs: number): boolean {
    const now = Date.now();
    const since = this.missingSince.get(id);
    if (since === undefined) {
      this.fallback(id);
      this.missingSince.set(id, now);
      return false;
    }
    return now - since >= graceMs;
  }

  public hasFinalizationFailure(
    record: SetupRunRecord | null,
    attempt: SetupRunAttempt | undefined,
    runId: string,
  ): record is SetupRunRecord {
    return (
      record?.workflow === 'agent-generation' &&
      record.status === 'failed' &&
      record.backendRunId === runId &&
      !attempt?.pending &&
      this.get(record.id) === attempt &&
      this.finalizationFailures.get(record.id) === runId
    );
  }

  /** The record update a verified run proves, plus its correction flags. */
  public observation(
    record: SetupRunRecord | null,
    attempt: SetupRunAttempt | undefined,
    run: SetupGenerationRunState,
  ): {
    update: {
      status: SetupRunStatus;
      step?: 'generating';
      backendRunId: string;
      error: string | null;
      analysisRunId: string | undefined;
    };
    correction: boolean;
    finalizationRunId: string | undefined;
  } | null {
    if (!record) return null;
    const status = verifiedRunStatus(run, bindingOf(record));
    if (!status) return null;
    const { runId } = run.binding;
    const correction =
      this.hasFinalizationFailure(record, attempt, runId) &&
      isFinalizationCorrection(
        { status: 'failed', result: { finalizationFailed: true } },
        run,
      );
    if (!correction && !this.canObserve(record, attempt, runId)) return null;
    return {
      update: {
        status,
        ...(status === 'running' ? { step: 'generating' as const } : {}),
        backendRunId: runId,
        error:
          status === 'failed' ? RUN_FAILURE_COPY[run.binding.workflow] : null,
        analysisRunId:
          record.analysisRunId ??
          (run.source.kind === 'verified-analysis'
            ? run.source.analysisRunId
            : undefined),
      },
      correction,
      finalizationRunId:
        status === 'failed' &&
        run.status === 'failed' &&
        run.binding.workflow === 'setup-agent-generation' &&
        run.result?.finalizationFailed === true
          ? runId
          : undefined,
    };
  }

  public canObserve(
    record: SetupRunRecord | null,
    attempt: SetupRunAttempt | undefined,
    runId?: string,
  ): record is SetupRunRecord {
    return (
      record !== null &&
      this.get(record.id) === attempt &&
      !attempt?.pending &&
      !isTerminalSetupRunStatus(record.status) &&
      (runId === undefined ||
        record.backendRunId === null ||
        record.backendRunId === runId)
    );
  }

  public shouldPoll(record: SetupRunRecord): boolean {
    return (
      record.status === 'running' && this.delivery().get(record.id) !== 'push'
    );
  }

  public pushed(id: string): void {
    if (this.delivery().get(id) !== 'fallback') this.setDelivery(id, 'push');
  }

  public fallback(id: string): void {
    this.setDelivery(id, 'fallback');
  }

  private setDelivery(id: string, mode: 'push' | 'fallback' | undefined): void {
    const current = this.delivery();
    if (current.get(id) === mode) return;
    const next = new Map(current);
    if (mode) next.set(id, mode);
    else next.delete(id);
    this.delivery.set(next);
  }
}

export async function readBoundState(
  rpc: WizardRpcService,
  binding: SetupGenerationTabBinding,
  runId?: string,
): Promise<SetupGenerationRunState | null | undefined> {
  try {
    return await rpc.getBoundRunState(binding, runId);
  } catch {
    // degradation-audit: optional-capability - an unavailable run state keeps the last known status
    return undefined;
  }
}

export async function requestBoundStart(
  rpc: WizardRpcService,
  binding: SetupGenerationTabBinding,
  mode: 'retry' | 'regenerate',
): Promise<
  | WizardSubmitSelectionResponse
  | EnhancedPromptsRunWizardResponse
  | { refusalCode: string }
  | null
> {
  try {
    // Resume agent retries from the checkpoint so settled items are kept.
    if (binding.workflow === 'setup-agent-generation') {
      return await rpc.startBoundAgents(binding, [], true);
    }
    return mode === 'retry'
      ? await rpc.startBoundGuidance(binding)
      : await rpc.regenerateBoundGuidance(binding);
  } catch (error: unknown) {
    // degradation-audit: reported - the caller shows fixed copy for coded or unconfirmed starts
    return error instanceof WizardRpcError && error.code
      ? { refusalCode: error.code }
      : null;
  }
}

/** On reload, a committed output newer than the record proves guidance finished. */
export async function reconcileGuidanceOutput(
  rpc: WizardRpcService,
  record: SetupRunRecord,
): Promise<SetupRunStatus | null> {
  const status = await rpc.getEnhancedPromptsStatus(record.workspacePath);
  if (status.error) {
    // An unavailable guidance status keeps the last known status.
    return null;
  }
  const generatedAt = status.generatedAt ? Date.parse(status.generatedAt) : NaN;
  return generatedAt > record.createdAt ? 'completed' : 'interrupted';
}

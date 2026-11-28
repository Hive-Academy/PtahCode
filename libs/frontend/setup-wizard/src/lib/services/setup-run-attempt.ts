import { signal } from '@angular/core';
import { isOnboardingIdentityValue } from '@ptah-extension/core';
import type {
  SetupGenerationResultFacts,
  SetupGenerationRunBinding,
  SetupGenerationRunLifecycle,
  SetupGenerationRunState,
  SetupGenerationTabBinding,
  SetupGenerationWorkflow,
} from '@ptah-extension/shared';
import { WizardRpcError, type WizardRpcService } from './wizard-rpc.service';
import { normalizeSetupWorkspacePath } from './setup-run-persistence';
import {
  isTerminalSetupRunStatus,
  type SetupRunRecord,
  type SetupRunStatus,
  type SetupRunWorkflow,
} from './setup-run.types';

const BOUND_WORKFLOW = {
  'agent-generation': 'setup-agent-generation',
  'project-guidance': 'setup-project-prompt',
} satisfies Partial<Record<SetupRunWorkflow, SetupGenerationWorkflow>>;

export function isBound(
  workflow: SetupRunWorkflow,
): workflow is keyof typeof BOUND_WORKFLOW {
  return Object.hasOwn(BOUND_WORKFLOW, workflow);
}

export function bindingOf(
  record: SetupRunRecord,
): SetupGenerationTabBinding | null {
  return isBound(record.workflow)
    ? {
        tabId: record.id,
        workflow: BOUND_WORKFLOW[record.workflow],
        workspacePath: record.workspacePath,
      }
    : null;
}

export function workflowOfBinding(
  workflow: SetupGenerationWorkflow,
): keyof typeof BOUND_WORKFLOW {
  return workflow === 'setup-agent-generation'
    ? 'agent-generation'
    : 'project-guidance';
}

const RUN_FAILURE_COPY = {
  'setup-agent-generation': 'Agent generation did not finish.',
  'setup-project-prompt': 'Project guidance did not finish.',
} satisfies Record<SetupGenerationWorkflow, string>;

const LIFECYCLE_STATUS = {
  starting: 'running',
  running: 'running',
  cancelling: 'running',
  completed: 'completed',
  failed: 'failed',
  'timed-out': 'failed',
  cancelled: 'cancelled',
} satisfies Record<SetupGenerationRunLifecycle, SetupRunStatus>;

export function isRunLifecycle(
  value: unknown,
): value is SetupGenerationRunLifecycle {
  return typeof value === 'string' && Object.hasOwn(LIFECYCLE_STATUS, value);
}

export function isTerminalLifecycle(
  value: SetupGenerationRunLifecycle,
): boolean {
  return isTerminalSetupRunStatus(LIFECYCLE_STATUS[value]);
}

export function matchesBinding(
  expected: SetupGenerationTabBinding | null,
  actual: SetupGenerationTabBinding,
): boolean {
  return (
    expected !== null &&
    expected.tabId === actual.tabId &&
    expected.workflow === actual.workflow &&
    expected.workspacePath === normalizeSetupWorkspacePath(actual.workspacePath)
  );
}

export function isRunBinding(
  value: unknown,
): value is SetupGenerationRunBinding {
  if (!value || typeof value !== 'object') return false;
  const { tabId, runId, workflow, workspacePath } = value as Record<
    string,
    unknown
  >;
  return (
    isOnboardingIdentityValue(tabId) &&
    isOnboardingIdentityValue(runId) &&
    (workflow === 'setup-agent-generation' ||
      workflow === 'setup-project-prompt') &&
    typeof workspacePath === 'string' &&
    !!normalizeSetupWorkspacePath(workspacePath)
  );
}

export const FOREIGN_WORKSPACE_COPY = 'This run belongs to another workspace.';
export const START_REFUSED_COPY = 'The run could not be started.';

export function startRefusalCopy(reason?: string): string {
  if (reason === 'invalid-binding' || reason === 'workspace-mismatch')
    return FOREIGN_WORKSPACE_COPY;
  if (reason === 'SETUP_MODEL_INVALID')
    return 'The Setup model could not be resolved. Update Background models and retry.';
  return START_REFUSED_COPY;
}

export function hasCommittedGuidance(run: SetupGenerationRunState): boolean {
  const committed = run.committedState ?? run.result?.committedState;
  return committed === 'committed' || committed === 'unchanged';
}

type FinalizationState = Pick<SetupGenerationRunState, 'status'> & {
  result?: Pick<SetupGenerationResultFacts, 'finalizationFailed'>;
};

export function isFinalizationCorrection(
  previous: FinalizationState,
  run: SetupGenerationRunState,
): boolean {
  return (
    previous.status === 'failed' &&
    previous.result?.finalizationFailed === true &&
    run.status === 'completed' &&
    run.interrupted !== true &&
    !!run.result?.counts &&
    Array.isArray(run.result.agentOutcomes)
  );
}

export function verifiedRunStatus(
  run: SetupGenerationRunState | null,
  binding: SetupGenerationTabBinding | null,
): SetupRunStatus | null {
  if (
    !isRunBinding(run?.binding) ||
    !matchesBinding(binding, run.binding) ||
    !isRunLifecycle(run.status) ||
    (run.source?.kind !== 'workspace-discovery' &&
      !(
        run.source?.kind === 'verified-analysis' &&
        isOnboardingIdentityValue(run.source.analysisRunId)
      ))
  ) {
    return null;
  }
  if (run.interrupted === true) return 'interrupted';
  if (
    run.binding.workflow === 'setup-project-prompt' &&
    run.status === 'completed' &&
    !hasCommittedGuidance(run)
  )
    return 'failed';
  return LIFECYCLE_STATUS[run.status];
}

/** A local start gets a new identity even when the host reuses its checkpoint id. */
export interface SetupRunAttempt {
  pending: boolean;
  pendingInitialStarts?: number;
  start?: Promise<SetupRunRecord | null>;
  ownerId?: string;
  settled?: boolean;
}

export class SetupRunAttempts {
  private readonly attempts = new Map<string, SetupRunAttempt>();
  private readonly missingSince = new Map<string, number>();
  private readonly finalizationFailures = new Map<string, string>();
  private readonly delivery = signal<ReadonlyMap<string, 'push' | 'fallback'>>(
    new Map(),
  );

  public get(id: string): SetupRunAttempt | undefined {
    return this.attempts.get(id);
  }

  /** Initial starts can receive verified run evidence before the RPC returns. */
  public async startInitial<T>(id: string, send: () => Promise<T>): Promise<T> {
    const attempt = this.get(id) ?? { pending: false };
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
    const attempt: SetupRunAttempt = { pending: true };
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
    const previous = this.get(id);
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
    const attempt = this.get(id);
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

  public observation(
    record: SetupRunRecord | null,
    attempt: SetupRunAttempt | undefined,
    run: SetupGenerationRunState,
  ) {
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
) {
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
    // degradation-audit: optional-capability - an unavailable guidance status keeps the last known status
    return null;
  }
  const generatedAt = status.generatedAt ? Date.parse(status.generatedAt) : NaN;
  return generatedAt > record.createdAt ? 'completed' : 'interrupted';
}

/** A workspace switch invalidates any in-flight tick before scheduling the next. */
export class SetupRunPoll {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private revision = 0;

  public constructor(
    private readonly interval: number,
    private readonly needed: () => boolean,
    private readonly tick: () => Promise<unknown>,
  ) {}

  public ensure(): void {
    if (this.timer !== null) return;
    const revision = this.revision;
    this.timer = setTimeout(() => void this.poll(revision), this.interval);
  }

  public stop(): void {
    this.revision++;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private async poll(revision: number): Promise<void> {
    if (revision !== this.revision) return;
    try {
      await this.tick();
    } finally {
      if (revision === this.revision) {
        this.timer = null;
        if (this.needed()) this.ensure();
      }
    }
  }
}

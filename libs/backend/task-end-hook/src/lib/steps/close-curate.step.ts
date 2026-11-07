import { inject, injectable } from 'tsyringe';
import {
  TASK_END_RETRYABLE_CURATOR_REASONS,
  type TaskEndCloseCurateOutcome,
  type TaskEndCurateRetryReason,
  type TaskEndCurationResult,
  type TaskEndCuratorReason,
  type TaskEndObservationsHandling,
  type TaskEndPendingOutcome,
  type TaskEndRunRecord,
} from '@ptah-extension/shared';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { TASK_END_TOKENS } from '../di/tokens';
import type { ITaskEndStore } from '../persistence/task-end-store.interface';
import type { ActivityPort } from '../ports/activity.port';
import type { CurationPort } from '../ports/curation.port';
import type { SessionLinkPort } from '../ports/session-link.port';

/**
 * Close-curate step (plan Component 6.1): captures the learning of the task's
 * linked sessions before anything else runs.
 *
 * The step records codes and counts only. A thrown or rejected port call is
 * recorded as `failed/curator-failed`; its text goes to a debug log line and
 * never into a stored row. A port call that settles (either way) after the
 * worker's signal aborted records nothing: the entry stays `running` with no
 * reason, which the store reads back as pending, so the next worker start
 * resumes that session's curation (plan Component 5, durable resume). The step never marks observations: that stays the
 * curation engine's rule, and `observations` only reports what it did.
 */

/** First pass (1) or the worker's single retry of a deferred entry (2). */
export type CloseCurateAttempt = 1 | 2;

/** The memory gates read from settings, recorded on the placeholder. */
export interface CloseCurateGates {
  /** `memory.enabled`. */
  readonly memoryEnabled: boolean;
  /** `memory.triggers.sessionEnd.enabled`. */
  readonly sessionEndEnabled: boolean;
}

/** One step entry the step recorded during a call. */
export interface CloseCurateRecorded {
  /** `''` for the placeholder entry, otherwise the session id. */
  readonly subject: string;
  readonly outcome: TaskEndCloseCurateOutcome;
}

type AttemptOutcomes = Readonly<
  Record<CloseCurateAttempt, TaskEndCloseCurateOutcome>
>;

const STEP = 'close-curate' as const;

function sameOnRetry(outcome: TaskEndCloseCurateOutcome): AttemptOutcomes {
  return { 1: outcome, 2: outcome };
}

function deferThenFail(reason: TaskEndCurateRetryReason): AttemptOutcomes {
  return {
    1: { step: STEP, state: 'deferred', reason },
    2: { step: STEP, state: 'failed', reason },
  };
}

const CURATOR_FAILED: TaskEndCloseCurateOutcome = {
  step: STEP,
  state: 'failed',
  reason: 'curator-failed',
};

/** `{ kind: 'gated' }` results, keyed by gate. */
const GATE_OUTCOMES = {
  'memory-disabled': sameOnRetry({
    step: STEP,
    state: 'skipped',
    reason: 'memory-disabled',
  }),
  'session-end-disabled': sameOnRetry({
    step: STEP,
    state: 'skipped',
    reason: 'session-end-disabled',
  }),
  'in-flight': sameOnRetry({
    step: STEP,
    state: 'skipped',
    reason: 'curation-in-flight',
  }),
  'hourly-limit': deferThenFail('hourly-limit'),
} as const satisfies Readonly<
  Record<
    Extract<TaskEndCurationResult, { readonly kind: 'gated' }>['gate'],
    AttemptOutcomes
  >
>;

/**
 * `{ kind: 'stalled', reason }` results, keyed by curator code. The eight
 * retryable codes defer once, then fail; `provider-unsupported` fails at once.
 * `curator-error` and `auth-required` cannot stall after #957; a stalled pass
 * keeps its rows, so they record `failed/<code>` with `observations: 'kept'`.
 */
const STALLED_OUTCOMES = {
  'provider-cooling-down': deferThenFail('provider-cooling-down'),
  'provider-unreachable': deferThenFail('provider-unreachable'),
  'concurrency-slot-timeout': deferThenFail('concurrency-slot-timeout'),
  'curator-queue-wait-timeout': deferThenFail('curator-queue-wait-timeout'),
  'caller-aborted': deferThenFail('caller-aborted'),
  'network-backoff': deferThenFail('network-backoff'),
  'host-shutdown': deferThenFail('host-shutdown'),
  'no-output': deferThenFail('no-output'),
  'provider-unsupported': sameOnRetry({
    step: STEP,
    state: 'failed',
    reason: 'provider-unsupported',
  }),
  'curator-error': sameOnRetry({
    step: STEP,
    state: 'failed',
    reason: 'curator-error',
    observations: 'kept',
  }),
  'auth-required': sameOnRetry({
    step: STEP,
    state: 'failed',
    reason: 'auth-required',
    observations: 'kept',
  }),
} as const satisfies Readonly<Record<TaskEndCuratorReason, AttemptOutcomes>>;

/**
 * `{ kind: 'failed', reason }` results, keyed by curator code. Only
 * `curator-error` and `auth-required` are engine failures (the engine bounds
 * its own retries, so neither is retried); any other code cannot fail after
 * #957 and records `failed/curator-failed` rather than throwing.
 */
const FAILED_OUTCOMES = {
  'provider-cooling-down': () => CURATOR_FAILED,
  'provider-unreachable': () => CURATOR_FAILED,
  'provider-unsupported': () => CURATOR_FAILED,
  'concurrency-slot-timeout': () => CURATOR_FAILED,
  'curator-queue-wait-timeout': () => CURATOR_FAILED,
  'caller-aborted': () => CURATOR_FAILED,
  'network-backoff': () => CURATOR_FAILED,
  'host-shutdown': () => CURATOR_FAILED,
  'no-output': () => CURATOR_FAILED,
  'curator-error': (observations) => ({
    step: STEP,
    state: 'failed',
    reason: 'curator-error',
    observations,
  }),
  'auth-required': (observations) => ({
    step: STEP,
    state: 'failed',
    reason: 'auth-required',
    observations,
  }),
} as const satisfies Readonly<
  Record<
    TaskEndCuratorReason,
    (observations: TaskEndObservationsHandling) => TaskEndCloseCurateOutcome
  >
>;

/**
 * Maps one curation port result to exactly one close-curate outcome (the
 * total mapping of plan Component 6.1). A new result `kind`, gate or curator
 * code fails to compile here.
 */
export function mapCurationResult(
  result: TaskEndCurationResult,
  attempt: CloseCurateAttempt,
): TaskEndCloseCurateOutcome {
  switch (result.kind) {
    case 'ran':
      return {
        step: STEP,
        state: 'succeeded',
        reason: 'curated',
        counts: {
          extracted: result.counts.extracted,
          merged: result.counts.merged,
          created: result.counts.created,
        },
        transcript: result.transcript,
      };
    case 'gated':
      return GATE_OUTCOMES[result.gate][attempt];
    case 'stalled':
      return result.reason === null
        ? CURATOR_FAILED
        : STALLED_OUTCOMES[result.reason][attempt];
    case 'failed':
      return result.reason === null
        ? CURATOR_FAILED
        : FAILED_OUTCOMES[result.reason](result.observations);
    case 'threw':
      return CURATOR_FAILED;
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}

const RETRY_REASONS: ReadonlySet<string> = new Set<TaskEndCurateRetryReason>([
  ...TASK_END_RETRYABLE_CURATOR_REASONS,
  'hourly-limit',
]);

/**
 * Whether an entry is one of the nine `deferred/<code>` members the worker
 * retries once. `deferred/session-active` is a terminal hand-off, never
 * retried.
 */
export function isRetryableCloseCurateOutcome(
  outcome: TaskEndCloseCurateOutcome | TaskEndPendingOutcome,
): boolean {
  return outcome.state === 'deferred' && RETRY_REASONS.has(outcome.reason);
}

/** Session ids of the run whose close-curate entry waits for its retry. */
export function retryableCloseCurateSessions(
  run: TaskEndRunRecord,
): readonly string[] {
  const subjects: string[] = [];
  for (const entry of run.steps) {
    if (
      entry.step === STEP &&
      entry.subject !== '' &&
      isRetryableCloseCurateOutcome(entry.outcome)
    ) {
      subjects.push(entry.subject);
    }
  }
  return subjects;
}

/** The roots to search for links: main root (when known), then seen root. */
function linkRoots(run: TaskEndRunRecord): readonly string[] {
  const roots: string[] = [];
  for (const root of [run.mainRoot, run.seenRoot]) {
    if (root !== null && !roots.includes(root)) {
      roots.push(root);
    }
  }
  return roots;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@injectable()
export class CloseCurateStep {
  constructor(
    @inject(TASK_END_TOKENS.STORE) private readonly store: ITaskEndStore,
    @inject(TASK_END_TOKENS.CURATION_PORT)
    private readonly curation: CurationPort,
    @inject(TASK_END_TOKENS.SESSION_LINK_PORT)
    private readonly sessionLinks: SessionLinkPort,
    @inject(TASK_END_TOKENS.ACTIVITY_PORT)
    private readonly activity: ActivityPort,
    @inject(TOKENS.LOGGER)
    private readonly logger: Pick<Logger, 'debug' | 'warn'>,
  ) {}

  /**
   * First pass over the run's linked sessions. Records the memory gates or
   * `no-linked-sessions` on the placeholder; otherwise replaces the
   * placeholder with one entry per session and curates each entry that has
   * not recorded an outcome yet (a resumed run skips finished entries).
   *
   * Store failures propagate to the worker, which keeps the last committed
   * row and retries on its next tick. An aborted `signal` stops before the
   * next session; the remaining entries stay pending for the resume.
   */
  async run(
    run: TaskEndRunRecord,
    gates: CloseCurateGates,
    signal: AbortSignal,
  ): Promise<readonly CloseCurateRecorded[]> {
    const placeholderOpen = run.steps.some(
      (entry) =>
        entry.step === STEP &&
        entry.subject === '' &&
        entry.outcome.state === 'pending',
    );

    if (placeholderOpen) {
      const gated = this.gateOutcome(gates);
      if (gated !== null) {
        return [this.record(run.runId, '', gated)];
      }

      let sessionIds: readonly string[];
      try {
        sessionIds = this.sessionLinks.linkedSessions(
          run.taskId,
          linkRoots(run),
        );
      } catch (error: unknown) {
        // The organization store is not available: the placeholder records
        // failed/curator-failed, and the error text stays in a debug line.
        this.logger.debug('[task-end-hook] close-curate links unavailable', {
          runId: run.runId,
          error: errorText(error),
        });
        return [this.record(run.runId, '', CURATOR_FAILED)];
      }

      if (sessionIds.length === 0) {
        return [
          this.record(run.runId, '', {
            step: STEP,
            state: 'skipped',
            reason: 'no-linked-sessions',
          }),
        ];
      }
      this.store.expandStep(run.runId, STEP, sessionIds);
    }

    const current = this.store.getRun(run.runId);
    if (current === null) {
      throw new Error(`task-end run ${run.runId} disappeared during close-curate`);
    }

    const recorded: CloseCurateRecorded[] = [];
    for (const entry of current.steps) {
      if (entry.step !== STEP || entry.subject === '') continue;
      if (entry.outcome.state !== 'pending') continue;
      if (signal.aborted) break;
      const outcome = await this.curateSession(
        current,
        entry.subject,
        1,
        signal,
      );
      if (outcome === null) break;
      recorded.push(outcome);
    }
    return recorded;
  }

  /**
   * The worker's single retry of one `deferred/<code>` entry (attempt 2).
   * An entry that is not waiting for its retry is left untouched and `null`
   * is returned; so is an entry whose curation the abort interrupted (left
   * resumable, see {@link curateSession}).
   */
  async retry(
    run: TaskEndRunRecord,
    sessionId: string,
    signal: AbortSignal,
  ): Promise<CloseCurateRecorded | null> {
    const entry = run.steps.find(
      (candidate) => candidate.step === STEP && candidate.subject === sessionId,
    );
    if (
      entry === undefined ||
      entry.step !== STEP ||
      !isRetryableCloseCurateOutcome(entry.outcome)
    ) {
      return null;
    }
    return this.curateSession(run, sessionId, 2, signal);
  }

  private gateOutcome(gates: CloseCurateGates): TaskEndCloseCurateOutcome | null {
    if (!gates.memoryEnabled) {
      return { step: STEP, state: 'skipped', reason: 'memory-disabled' };
    }
    if (!gates.sessionEndEnabled) {
      return { step: STEP, state: 'skipped', reason: 'session-end-disabled' };
    }
    return null;
  }

  /**
   * Curates one session. Returns `null`, recording nothing, when `signal`
   * aborts before the port call or while it is in flight.
   */
  private async curateSession(
    run: TaskEndRunRecord,
    sessionId: string,
    attempt: CloseCurateAttempt,
    signal: AbortSignal,
  ): Promise<CloseCurateRecorded | null> {
    const live = this.activity.isSessionLive(sessionId);
    if (live.kind === 'unavailable') {
      // Liveness cannot be proved either way: curating could race the
      // session-end trigger, handing off could lose the learning. Neither is
      // a pass, so the entry fails with the step's fallback reason.
      this.logger.warn('[task-end-hook] close-curate liveness unavailable', {
        runId: run.runId,
        sessionId,
      });
      return this.record(run.runId, sessionId, CURATOR_FAILED);
    }
    if (live.value) {
      return this.record(run.runId, sessionId, {
        step: STEP,
        state: 'deferred',
        reason: 'session-active',
        handedOffTo: 'session-end-trigger',
      });
    }

    if (signal.aborted) return null;
    this.store.markStepRunning(run.runId, STEP, sessionId);
    let result: TaskEndCurationResult;
    try {
      result = await this.curation.curateEndedSession(
        sessionId,
        run.mainRoot ?? run.seenRoot,
        signal,
      );
    } catch (error: unknown) {
      // degradation-audit: reported - an abort (shutdown) leaves the entry
      // running/no-reason, read back as pending, so the next worker start
      // re-curates it (debug-logged, never a pass). Any other adapter fault
      // or an unregistered engine is recorded as failed/curator-failed; the
      // error text stays in a debug line.
      if (signal.aborted) {
        this.interrupted(run.runId, sessionId);
        return null;
      }
      this.logger.debug('[task-end-hook] close-curate port failed', {
        runId: run.runId,
        sessionId,
        error: errorText(error),
      });
      return this.record(run.runId, sessionId, CURATOR_FAILED);
    }
    if (signal.aborted) {
      // The port finished despite the abort; its result is not trusted as
      // final (an engine may report a partial pass), so the entry is resumed.
      this.interrupted(run.runId, sessionId);
      return null;
    }

    if (
      (result.kind === 'stalled' || result.kind === 'failed') &&
      result.reason === null
    ) {
      this.logger.warn('[task-end-hook] curator-reason-missing', {
        runId: run.runId,
        sessionId,
        kind: result.kind,
      });
    }
    return this.record(run.runId, sessionId, mapCurationResult(result, attempt));
  }

  private interrupted(runId: string, sessionId: string): void {
    this.logger.debug('[task-end-hook] close-curate interrupted by shutdown', {
      runId,
      sessionId,
    });
  }

  private record(
    runId: string,
    subject: string,
    outcome: TaskEndCloseCurateOutcome,
  ): CloseCurateRecorded {
    this.store.upsertStep(runId, STEP, subject, outcome);
    return { subject, outcome };
  }
}

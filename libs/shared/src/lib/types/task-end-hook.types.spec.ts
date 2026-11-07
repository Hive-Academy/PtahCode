/**
 * Task-end hook vocabulary (TASK_2026_886). ts-jest type-checks this file:
 * every `@ts-expect-error` below must stay an error, or the unused directive
 * fails the suite. Each rejected literal sits on one line so the reported
 * error cannot move off the directive.
 */
import {
  TASK_END_CURATOR_REASONS,
  TASK_END_OUTCOME_TABLE,
  TASK_END_PENDING_STEP_MESSAGE,
  TASK_END_REASON_MESSAGES,
  TASK_END_RETRYABLE_CURATOR_REASONS,
  TASK_END_STEP_KINDS,
  isTerminalStep,
  taskEndStepMessage,
  type TaskEndDisposeModeFields,
  type TaskEndOutcomeTableComplete,
  type TaskEndPendingOutcome,
  type TaskEndReasonCode,
  type TaskEndRunRecord,
  type TaskEndStepOutcome,
  type TaskEndStepRecord,
} from './task-end-hook.types';

const accept = (outcome: TaskEndStepOutcome): TaskEndStepOutcome => outcome;

const MODE: TaskEndDisposeModeFields = {
  requestedMode: 'confirm',
  effectiveMode: 'off',
  modeReason: 'confirm-unavailable',
  activityScope: 'in-process',
};

const RETRY_REASONS = [...TASK_END_RETRYABLE_CURATOR_REASONS, 'hourly-limit'] as const;

describe('task-end hook outcome union', () => {
  it('accepts the listed pairs with their extra fields', () => {
    const accepted: TaskEndStepOutcome[] = [
      {
        step: 'close-curate',
        state: 'succeeded',
        reason: 'curated',
        counts: { extracted: 3, merged: 1, created: 2 },
        transcript: 'read',
      },
      {
        step: 'close-curate',
        state: 'deferred',
        reason: 'session-active',
        handedOffTo: 'session-end-trigger',
      },
      { step: 'close-curate', state: 'deferred', reason: 'hourly-limit' },
      { step: 'close-curate', state: 'failed', reason: 'hourly-limit' },
      {
        step: 'close-curate',
        state: 'failed',
        reason: 'curator-error',
        observations: 'marked-uncurated',
      },
      { step: 'dispose', state: 'skipped', reason: 'eligible-report-only', ...MODE },
      { step: 'dispose', state: 'blocked', reason: 'precondition-unverifiable', ...MODE },
      {
        step: 'index',
        state: 'succeeded',
        reason: 'coalesced',
        joined: { source: 'hook-run', runId: 'run-1' },
      },
      { step: 'index', state: 'skipped', reason: 'main-root-unresolved' },
      { step: 'index', state: 'skipped', reason: 'main-root-not-open' },
    ];
    expect(accepted.map(accept)).toHaveLength(10);
  });

  it('rejects unlisted pairs and missing extra fields at compile time', () => {
    const rejected = [
      // @ts-expect-error removal is not a member while the hook is report-only
      () => accept({ step: 'dispose', state: 'succeeded', reason: 'removed', ...MODE }),
      // @ts-expect-error session-active must name who it was handed off to
      () => accept({ step: 'close-curate', state: 'deferred', reason: 'session-active' }),
      // @ts-expect-error coalesced must say which census it joined
      () => accept({ step: 'index', state: 'succeeded', reason: 'coalesced' }),
      () =>
        accept({
          step: 'dispose',
          state: 'skipped',
          reason: 'eligible-report-only',
          ...MODE,
          // @ts-expect-error auto removal is unreachable in this task
          effectiveMode: 'auto',
        }),
      // @ts-expect-error provider-unsupported is terminal, never deferred
      () => accept({ step: 'close-curate', state: 'deferred', reason: 'provider-unsupported' }),
      // @ts-expect-error curator-error is terminal, never deferred
      () => accept({ step: 'close-curate', state: 'deferred', reason: 'curator-error' }),
      // @ts-expect-error queue-timeout was replaced by curator-queue-wait-timeout
      () => accept({ step: 'close-curate', state: 'failed', reason: 'queue-timeout' }),
      // @ts-expect-error curator-error must report the engine's observation handling
      () => accept({ step: 'close-curate', state: 'failed', reason: 'curator-error' }),
      // @ts-expect-error awaiting-confirmation is follow-up behaviour, not a member
      () => accept({ step: 'dispose', state: 'blocked', reason: 'awaiting-confirmation', ...MODE }),
    ];
    expect(rejected).toHaveLength(9);
  });

  it('proves the table lists every member', () => {
    const complete: TaskEndOutcomeTableComplete = true;
    expect(complete).toBe(true);
  });
});

describe('TASK_END_OUTCOME_TABLE', () => {
  const ids = TASK_END_OUTCOME_TABLE.map((k) => `${k.step}/${k.state}/${k.reason}`);

  it('has no duplicate pairs', () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lists the nine retryable close-curate reasons as deferred and as failed', () => {
    expect(RETRY_REASONS).toHaveLength(9);
    for (const reason of RETRY_REASONS) {
      expect(ids).toContain(`close-curate/deferred/${reason}`);
      expect(ids).toContain(`close-curate/failed/${reason}`);
    }
  });

  it('never defers the terminal curator codes', () => {
    const terminal = TASK_END_CURATOR_REASONS.filter(
      (r) => !(TASK_END_RETRYABLE_CURATOR_REASONS as readonly string[]).includes(r),
    );
    expect([...terminal].sort()).toEqual(
      ['auth-required', 'curator-error', 'provider-unsupported'].sort(),
    );
    for (const reason of terminal) {
      expect(ids).not.toContain(`close-curate/deferred/${reason}`);
      expect(ids).toContain(`close-curate/failed/${reason}`);
    }
  });

  it('mirrors the eleven curator codes', () => {
    expect(TASK_END_CURATOR_REASONS).toHaveLength(11);
    expect(new Set(TASK_END_CURATOR_REASONS).size).toBe(11);
  });

  it('has no removal or confirmation pairs', () => {
    for (const reason of [
      'removed',
      'admin-entry-removed-missing-directory',
      'archive-failed',
      'archive-verify-failed',
      'git-remove-failed',
      'awaiting-confirmation',
      'queue-timeout',
    ]) {
      expect(ids.some((id) => id.endsWith(`/${reason}`))).toBe(false);
    }
  });

  it('covers every step kind', () => {
    expect(new Set(TASK_END_OUTCOME_TABLE.map((k) => k.step))).toEqual(
      new Set(TASK_END_STEP_KINDS),
    );
  });
});

describe('isTerminalStep', () => {
  const cases: Array<[TaskEndStepOutcome | TaskEndPendingOutcome, boolean]> = [
    [{ state: 'pending' }, false],
    [{ step: 'index', state: 'running', reason: 'census-requested' }, false],
    [{ step: 'index', state: 'succeeded', reason: 'census-completed' }, true],
    [{ step: 'harvest', state: 'skipped', reason: 'no-carrier' }, true],
    [{ step: 'dispose', state: 'blocked', reason: 'locked', ...MODE }, true],
    [{ step: 'harvest', state: 'failed', reason: 'harvest-failed' }, true],
    [
      {
        step: 'close-curate',
        state: 'deferred',
        reason: 'session-active',
        handedOffTo: 'session-end-trigger',
      },
      true,
    ],
    [{ step: 'close-curate', state: 'deferred', reason: 'provider-unreachable' }, false],
    [{ step: 'close-curate', state: 'deferred', reason: 'hourly-limit' }, false],
    [{ step: 'index', state: 'deferred', reason: 'census-cooldown' }, false],
    [{ step: 'index', state: 'deferred', reason: 'foreground-active' }, false],
  ];

  it.each(cases)('%j -> %s', (outcome, terminal) => {
    expect(isTerminalStep(outcome)).toBe(terminal);
  });
});

describe('TASK_END_REASON_MESSAGES', () => {
  const tableReasons = new Set(TASK_END_OUTCOME_TABLE.map((k) => k.reason));
  const otherReasons: TaskEndReasonCode[] = [
    'status-reverted',
    'queue-full',
    'steps-terminal',
    'baseline',
    'hook-disabled',
  ];

  it('has a non-empty sentence for every reason code', () => {
    for (const reason of [...tableReasons, ...otherReasons]) {
      expect(TASK_END_REASON_MESSAGES[reason].trim().length).toBeGreaterThan(0);
    }
  });

  it('has no sentence for a code outside the vocabulary', () => {
    const known = new Set<string>([...tableReasons, ...otherReasons]);
    expect(Object.keys(TASK_END_REASON_MESSAGES).filter((k) => !known.has(k))).toEqual([]);
  });

  it('looks up step messages, including the pending placeholder', () => {
    expect(taskEndStepMessage({ state: 'pending' })).toBe(TASK_END_PENDING_STEP_MESSAGE);
    expect(taskEndStepMessage({ step: 'dispose', state: 'blocked', reason: 'open-pr', ...MODE })).toBe(
      TASK_END_REASON_MESSAGES['open-pr'],
    );
  });
});

describe('records', () => {
  it('ties a step record outcome to its own step kind', () => {
    const harvest: TaskEndStepRecord = {
      step: 'harvest',
      subject: '',
      outcome: { step: 'harvest', state: 'succeeded', reason: 'harvested' },
      message: TASK_END_REASON_MESSAGES.harvested,
      updatedAt: 1,
      attempts: 1,
    };
    const mismatched = {
      step: 'harvest',
      subject: '',
      outcome: { step: 'index', state: 'succeeded', reason: 'census-completed' },
      message: '',
      updatedAt: 1,
      attempts: 1,
    } as const;
    // @ts-expect-error a harvest record cannot carry an index outcome
    const rejected: TaskEndStepRecord = mismatched;
    expect([harvest, rejected]).toHaveLength(2);
  });

  it('allows a run without a validated main root and pairs run state with reason', () => {
    const base = {
      runId: 'run-1',
      repoId: 'repo-1',
      taskId: 'TASK_2026_886',
      episode: 1,
      source: 'write',
      fromStatus: 'in_review',
      toStatus: 'done',
      seenRoot: '/repo',
      mainRoot: null,
      createdAt: 1,
      settleUntil: 2,
      startedAt: null,
      endedAt: null,
      updatedAt: 1,
      steps: TASK_END_STEP_KINDS.map(
        (step): TaskEndStepRecord => ({
          step,
          subject: '',
          outcome: { state: 'pending' },
          message: TASK_END_PENDING_STEP_MESSAGE,
          updatedAt: 1,
          attempts: 0,
        }),
      ),
    } as const;
    const settling: TaskEndRunRecord = { ...base, state: 'settling', reason: null };
    const cancelled = { ...base, state: 'cancelled', reason: 'queue-full' } as const;
    // @ts-expect-error a cancelled run is cancelled only by a status reversion
    const rejected: TaskEndRunRecord = cancelled;
    expect(settling.mainRoot).toBeNull();
    expect(settling.steps.map((s) => s.step)).toEqual([...TASK_END_STEP_KINDS]);
    expect(rejected.state).toBe('cancelled');
  });
});

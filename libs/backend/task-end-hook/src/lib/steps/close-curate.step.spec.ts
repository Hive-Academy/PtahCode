import {
  TASK_END_CURATOR_REASONS,
  TASK_END_RETRYABLE_CURATOR_REASONS,
  type TaskEndCloseCurateOutcome,
  type TaskEndCurationResult,
  type TaskEndRunRecord,
  type TaskEndStepKind,
  type TaskEndStepOutcome,
  type TaskEndStepRecord,
} from '@ptah-extension/shared';
import type {
  ITaskEndStore,
  TaskEndExpandableStep,
} from '../persistence/task-end-store.interface';
import type { ActivityPort, TaskEndProbeResult } from '../ports/activity.port';
import type { CurationPort } from '../ports/curation.port';
import type { SessionLinkPort } from '../ports/session-link.port';
import {
  CloseCurateStep,
  isRetryableCloseCurateOutcome,
  mapCurationResult,
  retryableCloseCurateSessions,
  type CloseCurateAttempt,
  type CloseCurateGates,
} from './close-curate.step';

// ---------------------------------------------------------------------------
// In-memory store: the step-facing subset of ITaskEndStore (Decision D3)
// ---------------------------------------------------------------------------

type MutableEntry = {
  step: TaskEndStepKind;
  subject: string;
  outcome: TaskEndStepOutcome | { readonly state: 'pending' | 'running' };
  attempts: number;
};

class InMemoryStepStore
  implements
    Pick<ITaskEndStore, 'getRun' | 'markStepRunning' | 'upsertStep' | 'expandStep'>
{
  readonly entries: MutableEntry[];
  readonly calls: string[] = [];

  constructor(private readonly base: TaskEndRunRecord) {
    this.entries = base.steps.map((s) => ({
      step: s.step,
      subject: s.subject,
      outcome: s.outcome,
      attempts: s.attempts,
    }));
  }

  getRun(runId: string): TaskEndRunRecord | null {
    if (runId !== this.base.runId) return null;
    return { ...this.base, steps: this.entries.map(toRecord) };
  }

  markStepRunning(runId: string, step: TaskEndStepKind, subject: string): number {
    this.calls.push(`running:${step}:${subject}`);
    const entry = this.find(runId, step, subject);
    entry.outcome = { state: 'running' };
    entry.attempts += 1;
    return entry.attempts;
  }

  upsertStep<K extends TaskEndStepKind>(
    runId: string,
    step: K,
    subject: string,
    outcome: Extract<TaskEndStepOutcome, { readonly step: K }>,
  ): void {
    this.calls.push(`upsert:${step}:${subject}`);
    this.find(runId, step, subject).outcome = outcome;
  }

  expandStep(
    runId: string,
    step: TaskEndExpandableStep,
    subjects: readonly string[],
  ): void {
    this.calls.push(`expand:${step}:${subjects.join(',')}`);
    if (runId !== this.base.runId || subjects.length === 0) return;
    const at = this.entries.findIndex((e) => e.step === step && e.subject === '');
    if (at === -1) return;
    const rows = [...new Set(subjects)].map(
      (subject): MutableEntry => ({
        step,
        subject,
        outcome: { state: 'pending' },
        attempts: 0,
      }),
    );
    this.entries.splice(at, 1, ...rows);
  }

  outcomeOf(subject: string): MutableEntry['outcome'] | undefined {
    return this.entries.find((e) => e.step === 'close-curate' && e.subject === subject)
      ?.outcome;
  }

  private find(runId: string, step: TaskEndStepKind, subject: string): MutableEntry {
    const entry = this.entries.find((e) => e.step === step && e.subject === subject);
    if (runId !== this.base.runId || entry === undefined) {
      throw new Error(`no step entry ${step}/${subject}`);
    }
    return entry;
  }
}

function toRecord(entry: MutableEntry): TaskEndStepRecord {
  return {
    step: entry.step,
    subject: entry.subject,
    outcome: entry.outcome.state === 'running' ? { state: 'pending' } : entry.outcome,
    message: '',
    updatedAt: 0,
    attempts: entry.attempts,
  } as TaskEndStepRecord;
}

function makeRun(
  overrides: Partial<Pick<TaskEndRunRecord, 'mainRoot' | 'seenRoot'>> = {},
): TaskEndRunRecord {
  const pending = { state: 'pending' } as const;
  return {
    runId: 'run-1',
    repoId: 'repo-1',
    taskId: 'TASK_2026_001_abcd',
    episode: 1,
    source: 'write',
    fromStatus: 'in_progress',
    toStatus: 'done',
    seenRoot: '/repo/.claude-worktrees/wt',
    mainRoot: '/repo',
    createdAt: 1,
    settleUntil: 2,
    startedAt: 3,
    endedAt: null,
    updatedAt: 3,
    state: 'running',
    reason: null,
    ...overrides,
    steps: (['close-curate', 'harvest', 'dispose', 'index'] as const).map(
      (step): TaskEndStepRecord =>
        ({
          step,
          subject: '',
          outcome: pending,
          message: '',
          updatedAt: 1,
          attempts: 0,
        }) as TaskEndStepRecord,
    ),
  };
}

const OPEN: CloseCurateGates = { memoryEnabled: true, sessionEndEnabled: true };
const RAN: TaskEndCurationResult = {
  kind: 'ran',
  counts: { extracted: 3, merged: 1, created: 2 },
  transcript: 'read',
};

interface Harness {
  readonly step: CloseCurateStep;
  readonly store: InMemoryStepStore;
  readonly curate: jest.Mock;
  readonly linked: jest.Mock;
  readonly live: jest.Mock;
  readonly logger: { debug: jest.Mock; warn: jest.Mock };
}

function harness(
  options: {
    run?: TaskEndRunRecord;
    sessions?: readonly string[];
    curate?: (sessionId: string) => Promise<TaskEndCurationResult>;
    live?: (sessionId: string) => TaskEndProbeResult<boolean>;
  } = {},
): Harness {
  const run = options.run ?? makeRun();
  const store = new InMemoryStepStore(run);
  const curate = jest.fn(options.curate ?? (async () => RAN));
  const linked = jest.fn(() => options.sessions ?? ['s1']);
  const live = jest.fn(
    options.live ?? ((): TaskEndProbeResult<boolean> => ({ kind: 'ok', value: false })),
  );
  const curation: CurationPort = { curateEndedSession: curate };
  const links: SessionLinkPort = {
    linkedSessions: linked,
    worktreePathForSession: () => null,
    taskIdsInWorktreeName: () => [],
  };
  const activity: ActivityPort = {
    isSessionLive: live,
    liveSessionRoots: () => ({ kind: 'ok', value: [] }),
    trackedLaneDirs: () => ({ kind: 'ok', value: [] }),
    registeredWorkspaceRoots: () => ({ kind: 'ok', value: [] }),
    foregroundActive: () => ({ kind: 'ok', value: false }),
  };
  const logger = { debug: jest.fn(), warn: jest.fn() };
  const step = new CloseCurateStep(
    store as unknown as ITaskEndStore,
    curation,
    links,
    activity,
    logger,
  );
  return { step, store, curate, linked, live, logger };
}

const signal = (): AbortSignal => new AbortController().signal;

// ---------------------------------------------------------------------------
// The total mapping: one row per mapping-table line, attempts 1 and 2
// ---------------------------------------------------------------------------

type Row = {
  readonly name: string;
  readonly result: TaskEndCurationResult;
  readonly first: TaskEndCloseCurateOutcome;
  readonly retry: TaskEndCloseCurateOutcome;
};

const CURATOR_FAILED: TaskEndCloseCurateOutcome = {
  step: 'close-curate',
  state: 'failed',
  reason: 'curator-failed',
};

const ROWS: readonly Row[] = [
  {
    name: 'ran',
    result: RAN,
    first: {
      step: 'close-curate',
      state: 'succeeded',
      reason: 'curated',
      counts: { extracted: 3, merged: 1, created: 2 },
      transcript: 'read',
    },
    retry: {
      step: 'close-curate',
      state: 'succeeded',
      reason: 'curated',
      counts: { extracted: 3, merged: 1, created: 2 },
      transcript: 'read',
    },
  },
  ...(
    [
      ['memory-disabled', 'memory-disabled'],
      ['session-end-disabled', 'session-end-disabled'],
      ['in-flight', 'curation-in-flight'],
    ] as const
  ).map(
    ([gate, reason]): Row => ({
      name: `gated/${gate}`,
      result: { kind: 'gated', gate },
      first: { step: 'close-curate', state: 'skipped', reason },
      retry: { step: 'close-curate', state: 'skipped', reason },
    }),
  ),
  {
    name: 'gated/hourly-limit',
    result: { kind: 'gated', gate: 'hourly-limit' },
    first: { step: 'close-curate', state: 'deferred', reason: 'hourly-limit' },
    retry: { step: 'close-curate', state: 'failed', reason: 'hourly-limit' },
  },
  ...TASK_END_RETRYABLE_CURATOR_REASONS.map(
    (reason): Row => ({
      name: `stalled/${reason}`,
      result: { kind: 'stalled', reason, transcript: 'read' },
      first: { step: 'close-curate', state: 'deferred', reason },
      retry: { step: 'close-curate', state: 'failed', reason },
    }),
  ),
  {
    name: 'stalled/provider-unsupported',
    result: { kind: 'stalled', reason: 'provider-unsupported', transcript: 'not-read' },
    first: { step: 'close-curate', state: 'failed', reason: 'provider-unsupported' },
    retry: { step: 'close-curate', state: 'failed', reason: 'provider-unsupported' },
  },
  ...(['curator-error', 'auth-required'] as const).flatMap((reason) =>
    (['kept', 'marked-uncurated'] as const).map(
      (observations): Row => ({
        name: `failed/${reason}/${observations}`,
        result: { kind: 'failed', reason, observations, transcript: 'read-failed' },
        first: { step: 'close-curate', state: 'failed', reason, observations },
        retry: { step: 'close-curate', state: 'failed', reason, observations },
      }),
    ),
  ),
  ...(['curator-error', 'auth-required'] as const).map(
    (reason): Row => ({
      name: `stalled/${reason} (cannot occur after #957)`,
      result: { kind: 'stalled', reason, transcript: 'read' },
      first: { step: 'close-curate', state: 'failed', reason, observations: 'kept' },
      retry: { step: 'close-curate', state: 'failed', reason, observations: 'kept' },
    }),
  ),
  ...TASK_END_CURATOR_REASONS.filter(
    (reason) => reason !== 'curator-error' && reason !== 'auth-required',
  ).map(
    (reason): Row => ({
      name: `failed/${reason} (cannot occur after #957)`,
      result: { kind: 'failed', reason, observations: 'kept', transcript: 'read' },
      first: CURATOR_FAILED,
      retry: CURATOR_FAILED,
    }),
  ),
  {
    name: 'stalled/null',
    result: { kind: 'stalled', reason: null, transcript: 'read' },
    first: CURATOR_FAILED,
    retry: CURATOR_FAILED,
  },
  {
    name: 'failed/null',
    result: { kind: 'failed', reason: null, observations: 'kept', transcript: 'read' },
    first: CURATOR_FAILED,
    retry: CURATOR_FAILED,
  },
  ...(['pass', 'unexpected'] as const).map(
    (stage): Row => ({
      name: `threw/${stage}`,
      result: { kind: 'threw', stage },
      first: CURATOR_FAILED,
      retry: CURATOR_FAILED,
    }),
  ),
];

describe('mapCurationResult', () => {
  it.each(ROWS.flatMap((row) => [
    [row.name, 1, row] as const,
    [row.name, 2, row] as const,
  ]))('%s, attempt %i', (_name, attempt: CloseCurateAttempt, row) => {
    expect(mapCurationResult(row.result, attempt)).toEqual(
      attempt === 1 ? row.first : row.retry,
    );
  });

  it('defers exactly the nine retryable reasons on attempt 1', () => {
    const deferred = ROWS.map((row) => mapCurationResult(row.result, 1)).filter(
      (outcome) => outcome.state === 'deferred',
    );
    expect(new Set(deferred.map((o) => o.reason)).size).toBe(9);
    expect(deferred.every((o) => isRetryableCloseCurateOutcome(o))).toBe(true);
  });

  it('never defers on attempt 2', () => {
    for (const row of ROWS) {
      expect(mapCurationResult(row.result, 2).state).not.toBe('deferred');
    }
  });
});

// ---------------------------------------------------------------------------
// The step
// ---------------------------------------------------------------------------

describe('CloseCurateStep.run', () => {
  it('records memory-disabled on the placeholder without looking up sessions', async () => {
    const h = harness();
    const recorded = await h.step.run(
      makeRun(),
      { memoryEnabled: false, sessionEndEnabled: true },
      signal(),
    );
    expect(recorded).toEqual([
      { subject: '', outcome: { step: 'close-curate', state: 'skipped', reason: 'memory-disabled' } },
    ]);
    expect(h.linked).not.toHaveBeenCalled();
    expect(h.curate).not.toHaveBeenCalled();
    expect(h.store.outcomeOf('')).toEqual(recorded[0].outcome);
  });

  it('records session-end-disabled on the placeholder (no per-session rows)', async () => {
    const h = harness({ sessions: ['s1', 's2'] });
    await h.step.run(makeRun(), { memoryEnabled: true, sessionEndEnabled: false }, signal());
    expect(h.store.outcomeOf('')).toEqual({
      step: 'close-curate',
      state: 'skipped',
      reason: 'session-end-disabled',
    });
    expect(h.store.calls.some((c) => c.startsWith('expand:'))).toBe(false);
  });

  it('records no-linked-sessions on the placeholder when nothing is linked', async () => {
    const h = harness({ sessions: [] });
    await h.step.run(makeRun(), OPEN, signal());
    expect(h.store.outcomeOf('')).toEqual({
      step: 'close-curate',
      state: 'skipped',
      reason: 'no-linked-sessions',
    });
    expect(h.curate).not.toHaveBeenCalled();
  });

  it('searches the main root then the seen root, de-duplicated', async () => {
    const h = harness();
    await h.step.run(makeRun(), OPEN, signal());
    expect(h.linked).toHaveBeenCalledWith('TASK_2026_001_abcd', [
      '/repo',
      '/repo/.claude-worktrees/wt',
    ]);

    const same = harness({ run: makeRun({ mainRoot: '/repo', seenRoot: '/repo' }) });
    await same.step.run(makeRun({ mainRoot: '/repo', seenRoot: '/repo' }), OPEN, signal());
    expect(same.linked).toHaveBeenCalledWith('TASK_2026_001_abcd', ['/repo']);

    const noMain = harness({ run: makeRun({ mainRoot: null }) });
    await noMain.step.run(makeRun({ mainRoot: null }), OPEN, signal());
    expect(noMain.linked).toHaveBeenCalledWith('TASK_2026_001_abcd', [
      '/repo/.claude-worktrees/wt',
    ]);
    expect(noMain.curate).toHaveBeenCalledWith(
      's1',
      '/repo/.claude-worktrees/wt',
      expect.anything(),
    );
  });

  it('replaces the placeholder with one row per session and curates each', async () => {
    const h = harness({ sessions: ['s1', 's2'] });
    const recorded = await h.step.run(makeRun(), OPEN, signal());
    expect(h.store.entries.filter((e) => e.step === 'close-curate').map((e) => e.subject)).toEqual(
      ['s1', 's2'],
    );
    expect(recorded.map((r) => r.subject)).toEqual(['s1', 's2']);
    expect(h.curate).toHaveBeenNthCalledWith(1, 's1', '/repo', expect.anything());
    expect(h.curate).toHaveBeenNthCalledWith(2, 's2', '/repo', expect.anything());
    expect(h.store.calls).toEqual([
      'expand:close-curate:s1,s2',
      'running:close-curate:s1',
      'upsert:close-curate:s1',
      'running:close-curate:s2',
      'upsert:close-curate:s2',
    ]);
  });

  it('hands a live session off to the session-end trigger without curating it', async () => {
    const h = harness({
      sessions: ['live', 'ended'],
      live: (id) => ({ kind: 'ok', value: id === 'live' }),
    });
    await h.step.run(makeRun(), OPEN, signal());
    expect(h.store.outcomeOf('live')).toEqual({
      step: 'close-curate',
      state: 'deferred',
      reason: 'session-active',
      handedOffTo: 'session-end-trigger',
    });
    expect(h.curate).toHaveBeenCalledTimes(1);
    expect(h.curate).toHaveBeenCalledWith('ended', '/repo', expect.anything());
    expect(isRetryableCloseCurateOutcome({
      step: 'close-curate',
      state: 'deferred',
      reason: 'session-active',
      handedOffTo: 'session-end-trigger',
    })).toBe(false);
  });

  it('records curator-failed when liveness cannot be probed', async () => {
    const h = harness({ live: () => ({ kind: 'unavailable' }) });
    await h.step.run(makeRun(), OPEN, signal());
    expect(h.store.outcomeOf('s1')).toEqual(CURATOR_FAILED);
    expect(h.curate).not.toHaveBeenCalled();
  });

  it.each([
    [
      'throws',
      (): Promise<TaskEndCurationResult> => {
        throw new Error('token sk-test-123 at /home/secret');
      },
    ],
    [
      'rejects',
      (): Promise<TaskEndCurationResult> =>
        Promise.reject(new Error('token sk-test-123 at /home/secret')),
    ],
  ])('a port that %s records failed/curator-failed with no error text', async (_n, curate) => {
    const h = harness({ curate });
    const recorded = await h.step.run(makeRun(), OPEN, signal());
    expect(recorded).toEqual([{ subject: 's1', outcome: CURATOR_FAILED }]);
    const stored = JSON.stringify(h.store.getRun('run-1'));
    expect(stored).not.toContain('sk-test-123');
    expect(stored).not.toContain('/home/secret');
    expect(JSON.stringify(recorded)).not.toContain('sk-test-123');
  });

  it('records curator-failed on the placeholder when links are unavailable', async () => {
    const h = harness();
    h.linked.mockImplementation(() => {
      throw new Error('organization store sk-test-123 unavailable');
    });
    await h.step.run(makeRun(), OPEN, signal());
    expect(h.store.outcomeOf('')).toEqual(CURATOR_FAILED);
    expect(JSON.stringify(h.store.getRun('run-1'))).not.toContain('sk-test-123');
  });

  it('warns curator-reason-missing for a pass without a curator code', async () => {
    const h = harness({
      curate: async () => ({ kind: 'stalled', reason: null, transcript: 'read' }),
    });
    await h.step.run(makeRun(), OPEN, signal());
    expect(h.store.outcomeOf('s1')).toEqual(CURATOR_FAILED);
    expect(h.logger.warn).toHaveBeenCalledWith(
      '[task-end-hook] curator-reason-missing',
      expect.objectContaining({ sessionId: 's1' }),
    );
  });

  it('resumes: finished entries are not curated again and re-expansion is a no-op', async () => {
    const h = harness({ sessions: ['s1', 's2'] });
    await h.step.run(makeRun(), OPEN, signal());
    const resumed = h.store.getRun('run-1');
    if (resumed === null) throw new Error('run missing');
    h.curate.mockClear();
    const again = await h.step.run(resumed, OPEN, signal());
    expect(again).toEqual([]);
    expect(h.curate).not.toHaveBeenCalled();
  });

  it('stops before the next session once aborted, leaving it pending', async () => {
    const controller = new AbortController();
    const h = harness({
      sessions: ['s1', 's2'],
      curate: async () => {
        controller.abort();
        return RAN;
      },
    });
    await h.step.run(makeRun(), OPEN, controller.signal);
    expect(h.curate).toHaveBeenCalledTimes(1);
    expect(h.store.outcomeOf('s2')).toEqual({ state: 'pending' });
  });

  it('never marks observations: the store sees only the step outcome', async () => {
    const h = harness({
      curate: async () => ({
        kind: 'failed',
        reason: 'curator-error',
        observations: 'marked-uncurated',
        transcript: 'read',
      }),
    });
    await h.step.run(makeRun(), OPEN, signal());
    expect(h.store.outcomeOf('s1')).toEqual({
      step: 'close-curate',
      state: 'failed',
      reason: 'curator-error',
      observations: 'marked-uncurated',
    });
  });
});

describe('CloseCurateStep.retry', () => {
  it('retries a deferred entry once and records failed/<same code>', async () => {
    const h = harness({
      sessions: ['s1', 's2'],
      curate: async () => ({ kind: 'gated', gate: 'hourly-limit' }),
    });
    await h.step.run(makeRun(), OPEN, signal());
    const run = h.store.getRun('run-1');
    if (run === null) throw new Error('run missing');
    expect(retryableCloseCurateSessions(run)).toEqual(['s1', 's2']);

    const retried = await h.step.retry(run, 's1', signal());
    expect(retried).toEqual({
      subject: 's1',
      outcome: { step: 'close-curate', state: 'failed', reason: 'hourly-limit' },
    });
    expect(h.store.entries.find((e) => e.subject === 's1')?.attempts).toBe(2);
  });

  it('records the retry success when the curator recovers', async () => {
    let calls = 0;
    const h = harness({
      curate: async () =>
        calls++ === 0
          ? { kind: 'stalled', reason: 'provider-cooling-down', transcript: 'not-read' }
          : RAN,
    });
    await h.step.run(makeRun(), OPEN, signal());
    const run = h.store.getRun('run-1');
    if (run === null) throw new Error('run missing');
    await h.step.retry(run, 's1', signal());
    expect(h.store.outcomeOf('s1')).toMatchObject({ state: 'succeeded', reason: 'curated' });
  });

  it('leaves an entry that is not waiting for a retry untouched', async () => {
    const h = harness();
    await h.step.run(makeRun(), OPEN, signal());
    const run = h.store.getRun('run-1');
    if (run === null) throw new Error('run missing');
    h.curate.mockClear();
    expect(await h.step.retry(run, 's1', signal())).toBeNull();
    expect(await h.step.retry(run, 'unknown', signal())).toBeNull();
    expect(h.curate).not.toHaveBeenCalled();
  });
});

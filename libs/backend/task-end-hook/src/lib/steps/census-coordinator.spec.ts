import type {
  TaskEndIndexOutcome,
  TaskEndPendingOutcome,
  TaskEndRunRecord,
  TaskEndStepKind,
  TaskEndStepOutcome,
  TaskEndStepRecord,
} from '@ptah-extension/shared';
import type {
  ITaskEndStore,
  TaskEndDeferredCensusStep,
  TaskEndPendingCensus,
} from '../persistence/task-end-store.interface';
import type { CensusPort } from '../ports/census.port';
import {
  CensusCoordinator,
  classifyCensusCompletion,
  type TaskEndCensusSettled,
} from './census-coordinator';

const ROOT = '/repo/main';

type IndexState = TaskEndIndexOutcome | TaskEndPendingOutcome;

interface FakeRunRow {
  readonly runId: string;
  readonly mainRoot: string | null;
  readonly queueSeq: number;
  index: IndexState;
  requestedAt: number | null;
  updatedAt: number;
  attempts: number;
}

/**
 * In-memory index-step store (Decision D3: no real database). It applies the
 * interface's documented rules: `running/census-requested` sets
 * `requested_at`, `attempts` changes only in `markStepRunning`.
 */
class FakeIndexStore implements Pick<
  ITaskEndStore,
  | 'getRun'
  | 'listOpenRuns'
  | 'markStepRunning'
  | 'upsertStep'
  | 'pendingCensus'
  | 'lastHookCensusCompletedAt'
  | 'listDeferredCensusSteps'
> {
  readonly rows = new Map<string, FakeRunRow>();
  readonly upserts: string[] = [];
  failUpserts = false;
  private seq = 0;

  add(runId: string, index: IndexState = { state: 'pending' }): void {
    this.seq += 1;
    this.rows.set(runId, {
      runId,
      mainRoot: ROOT,
      queueSeq: this.seq,
      index,
      requestedAt: null,
      updatedAt: Date.now(),
      attempts: 0,
    });
  }

  index(runId: string): IndexState {
    const row = this.rows.get(runId);
    if (row === undefined) throw new Error(`no run ${runId}`);
    return row.index;
  }

  getRun(runId: string): TaskEndRunRecord | null {
    const row = this.rows.get(runId);
    return row === undefined ? null : toRecord(row);
  }

  listOpenRuns(): readonly TaskEndRunRecord[] {
    return [...this.rows.values()]
      .sort((a, b) => a.queueSeq - b.queueSeq)
      .map(toRecord);
  }

  markStepRunning(runId: string, _step: TaskEndStepKind): number {
    const row = this.rows.get(runId);
    if (row === undefined) throw new Error(`no run ${runId}`);
    row.attempts += 1;
    return row.attempts;
  }

  upsertStep<K extends TaskEndStepKind>(
    runId: string,
    step: K,
    _subject: string,
    outcome: Extract<TaskEndStepOutcome, { readonly step: K }>,
  ): void {
    if (this.failUpserts) throw new Error('database is locked');
    const written: TaskEndStepOutcome = outcome;
    const row = this.rows.get(runId);
    if (row === undefined || written.step !== 'index') {
      throw new Error(`unexpected upsert ${runId}:${step}`);
    }
    row.index = written;
    row.updatedAt = Date.now();
    if (written.state === 'running') row.requestedAt = row.updatedAt;
    this.upserts.push(`${runId}:${written.state}/${written.reason}`);
  }

  pendingCensus(mainRoot: string): TaskEndPendingCensus | null {
    for (const row of this.rows.values()) {
      if (
        row.mainRoot === mainRoot &&
        row.index.state === 'running' &&
        row.requestedAt !== null
      ) {
        return { runId: row.runId, requestedAt: row.requestedAt };
      }
    }
    return null;
  }

  lastHookCensusCompletedAt(mainRoot: string): number | null {
    let latest: number | null = null;
    for (const row of this.rows.values()) {
      if (
        row.mainRoot === mainRoot &&
        row.index.state === 'succeeded' &&
        row.index.reason === 'census-completed'
      ) {
        latest = Math.max(latest ?? 0, row.updatedAt);
      }
    }
    return latest;
  }

  listDeferredCensusSteps(
    mainRoot: string,
  ): readonly TaskEndDeferredCensusStep[] {
    return [...this.rows.values()]
      .filter((row) => row.mainRoot === mainRoot)
      .sort((a, b) => a.queueSeq - b.queueSeq)
      .flatMap((row): TaskEndDeferredCensusStep[] =>
        row.index.state === 'deferred'
          ? [
              {
                runId: row.runId,
                reason: row.index.reason,
                queueSeq: row.queueSeq,
              },
            ]
          : [],
      );
  }
}

function toRecord(row: FakeRunRow): TaskEndRunRecord {
  return {
    runId: row.runId,
    repoId: 'repo-1',
    taskId: `TASK_${row.runId}`,
    episode: 1,
    source: 'watcher',
    fromStatus: 'in_review',
    toStatus: 'done',
    seenRoot: ROOT,
    mainRoot: row.mainRoot,
    createdAt: 1,
    settleUntil: 2,
    startedAt: 3,
    endedAt: null,
    updatedAt: row.updatedAt,
    state: 'running',
    reason: null,
    steps: (['close-curate', 'harvest', 'dispose', 'index'] as const).map(
      (step): TaskEndStepRecord =>
        ({
          step,
          subject: '',
          outcome: step === 'index' ? row.index : { state: 'pending' },
          message: '',
          updatedAt: row.updatedAt,
          attempts: step === 'index' ? row.attempts : 0,
        }) as TaskEndStepRecord,
    ),
  };
}

interface PendingRequest {
  readonly root: string;
  readonly signal: AbortSignal;
  resolve(): void;
  reject(error: Error): void;
}

/** A census engine whose requests the spec settles by hand. */
class FakeCensus implements CensusPort {
  indexedAt: number | null = null;
  error: string | null = null;
  readonly requests: PendingRequest[] = [];

  async symbolsEnabled(): Promise<boolean> {
    return true;
  }

  isCensusActive(): boolean {
    return false;
  }

  async lastIndexedAt(): Promise<number | null> {
    return this.indexedAt;
  }

  async lastError(): Promise<string | null> {
    return this.error;
  }

  requestCensus(root: string, signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.requests.push({ root, signal, resolve, reject });
    });
  }
}

const RUNNING: TaskEndIndexOutcome = {
  step: 'index',
  state: 'running',
  reason: 'census-requested',
};

let clock = 1_000_000;

function harness() {
  const store = new FakeIndexStore();
  const census = new FakeCensus();
  const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const coordinator = new CensusCoordinator(
    store as unknown as ITaskEndStore,
    census,
    logger,
  );
  const settled: TaskEndCensusSettled[] = [];
  coordinator.onDidSettleCensus((event) => settled.push(event));
  return { store, census, logger, coordinator, settled };
}

/** Persists the request as the step does, then hands it to the coordinator. */
function requestAs(h: ReturnType<typeof harness>, runId: string): number {
  h.store.upsertStep(runId, 'index', '', RUNNING);
  const requestedAt = h.store.pendingCensus(ROOT)?.requestedAt ?? -1;
  expect(h.coordinator.start(runId, ROOT, requestedAt)).toBe(true);
  return requestedAt;
}

beforeEach(() => {
  clock = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('classifyCensusCompletion (AC 5.6, pre-878)', () => {
  it.each([
    ['engine error', 'boom', 2000, 1000, 'census-failed'],
    ['error wins over a fresh index', 'boom', 5000, 1000, 'census-failed'],
    ['index at the request time', null, 1000, 1000, 'census-completed'],
    ['index after the request', null, 1001, 1000, 'census-completed'],
    ['index before the request', null, 999, 1000, 'census-interrupted'],
    ['never indexed', null, null, 1000, 'census-interrupted'],
  ] as const)('%s gives %s', (_name, error, indexedAt, requestedAt, reason) => {
    expect(classifyCensusCompletion(error, indexedAt, requestedAt).reason).toBe(
      reason,
    );
  });
});

describe('CensusCoordinator completion', () => {
  it('starts the census without waiting and records census-completed', async () => {
    const h = harness();
    h.store.add('run-a');
    const requestedAt = requestAs(h, 'run-a');

    expect(h.census.requests).toHaveLength(1);
    expect(h.store.index('run-a')).toEqual(RUNNING);

    h.census.indexedAt = requestedAt + 10;
    h.census.requests[0].resolve();
    await h.coordinator.settled();

    expect(h.store.index('run-a')).toEqual({
      step: 'index',
      state: 'succeeded',
      reason: 'census-completed',
    });
    expect(h.settled).toEqual([
      {
        runId: 'run-a',
        mainRoot: ROOT,
        outcome: expect.objectContaining({ reason: 'census-completed' }),
      },
    ]);
    expect(h.coordinator.activeHookCensus(ROOT)).toBeNull();
  });

  it('records census-failed when the engine reports an error, and never stores its text', async () => {
    const h = harness();
    h.store.add('run-a');
    requestAs(h, 'run-a');
    h.census.error = 'token=sk-secret-value';
    h.census.indexedAt = clock + 5;
    h.census.requests[0].resolve();
    await h.coordinator.settled();

    expect(h.store.index('run-a')).toEqual({
      step: 'index',
      state: 'failed',
      reason: 'census-failed',
    });
    expect(JSON.stringify(h.store.index('run-a'))).not.toContain('sk-secret');
    expect(JSON.stringify(h.logger.info.mock.calls)).not.toContain('sk-secret');
  });

  it('records census-interrupted when the index did not advance (start ignored)', async () => {
    const h = harness();
    h.store.add('run-a');
    const requestedAt = requestAs(h, 'run-a');
    h.census.indexedAt = requestedAt - 1;
    h.census.requests[0].resolve();
    await h.coordinator.settled();

    expect(h.store.index('run-a')).toMatchObject({
      state: 'failed',
      reason: 'census-interrupted',
    });
  });

  it('records census-failed when the request rejects; the error text goes to debug only', async () => {
    const h = harness();
    h.store.add('run-a');
    requestAs(h, 'run-a');
    h.census.requests[0].reject(new Error('indexer crashed: /secret/path'));
    await h.coordinator.settled();

    expect(h.store.index('run-a')).toMatchObject({
      state: 'failed',
      reason: 'census-failed',
    });
    expect(h.logger.debug).toHaveBeenCalledWith(
      '[task-end-hook] census request failed',
      expect.objectContaining({ runId: 'run-a' }),
    );
    expect(JSON.stringify(h.logger.info.mock.calls)).not.toContain('/secret');
  });

  it('dispose aborts the census, records census-interrupted and refuses new starts', async () => {
    const h = harness();
    h.store.add('run-a');
    h.store.add('run-b');
    requestAs(h, 'run-a');

    h.coordinator.dispose();
    expect(h.census.requests[0].signal.aborted).toBe(true);
    h.census.requests[0].reject(new Error('aborted'));
    await h.coordinator.settled();

    expect(h.store.index('run-a')).toMatchObject({
      state: 'failed',
      reason: 'census-interrupted',
    });
    expect(h.coordinator.start('run-b', ROOT, clock)).toBe(false);
    expect(h.census.requests).toHaveLength(1);
  });

  it('starts at most one census per main root while one is in flight', () => {
    const h = harness();
    h.store.add('run-a');
    h.store.add('run-b');
    requestAs(h, 'run-a');

    expect(h.coordinator.start('run-b', ROOT, clock)).toBe(false);
    expect(h.census.requests).toHaveLength(1);
  });

  it('drops the result when the step no longer holds running/census-requested', async () => {
    const h = harness();
    h.store.add('run-a');
    requestAs(h, 'run-a');
    // The restart rule (or a cancel) already settled this row.
    h.store.upsertStep('run-a', 'index', '', {
      step: 'index',
      state: 'failed',
      reason: 'census-interrupted',
    });
    h.census.indexedAt = clock + 100;
    h.census.requests[0].resolve();
    await h.coordinator.settled();

    expect(h.store.index('run-a')).toMatchObject({
      reason: 'census-interrupted',
    });
    expect(h.settled).toEqual([
      { runId: 'run-a', mainRoot: ROOT, outcome: null },
    ]);
  });

  it('logs a store failure as an Error and frees the root', async () => {
    const h = harness();
    h.store.add('run-a');
    requestAs(h, 'run-a');
    h.store.failUpserts = true;
    h.census.indexedAt = clock + 1;
    h.census.requests[0].resolve();
    await h.coordinator.settled();

    expect(h.logger.error).toHaveBeenCalledWith(
      '[task-end-hook] census result not recorded',
      expect.any(Error),
    );
    expect(h.settled[0].outcome).toBeNull();
    h.store.failUpserts = false;
    // The durable row still names the census for the restart rule.
    expect(h.coordinator.activeHookCensus(ROOT)?.runId).toBe('run-a');
    expect(h.store.index('run-a')).toEqual(RUNNING);
  });
});

describe('CensusCoordinator.activeHookCensus', () => {
  it('reports the durable running/census-requested step', () => {
    const h = harness();
    h.store.add('run-a');
    h.store.upsertStep('run-a', 'index', '', RUNNING);
    expect(h.coordinator.activeHookCensus(ROOT)).toEqual({
      runId: 'run-a',
      requestedAt: clock,
    });
  });

  it('falls back to the census this process runs when no durable row is visible', () => {
    const h = harness();
    h.store.add('run-a');
    expect(h.coordinator.start('run-a', ROOT, 42)).toBe(true);
    expect(h.coordinator.activeHookCensus(ROOT)).toEqual({
      runId: 'run-a',
      requestedAt: 42,
    });
    expect(h.coordinator.activeHookCensus('/other/root')).toBeNull();
  });
});

describe('CensusCoordinator.coalesceDeferredInto (cooldown end, AC 5.3)', () => {
  it('joins every other deferred step of the root to the owner', () => {
    const h = harness();
    const cooldown: TaskEndIndexOutcome = {
      step: 'index',
      state: 'deferred',
      reason: 'census-cooldown',
    };
    h.store.add('run-a', cooldown);
    h.store.add('run-b', cooldown);
    h.store.add('run-c', {
      step: 'index',
      state: 'deferred',
      reason: 'foreground-active',
    });
    h.store.add('run-d', {
      step: 'index',
      state: 'skipped',
      reason: 'pipeline-disabled',
    });

    expect(h.coordinator.coalesceDeferredInto(ROOT, 'run-a')).toEqual([
      'run-b',
      'run-c',
    ]);
    for (const runId of ['run-b', 'run-c']) {
      expect(h.store.index(runId)).toEqual({
        step: 'index',
        state: 'succeeded',
        reason: 'coalesced',
        joined: { source: 'hook-run', runId: 'run-a' },
      });
    }
    expect(h.store.index('run-a')).toEqual(cooldown);
    expect(h.store.index('run-d')).toMatchObject({
      reason: 'pipeline-disabled',
    });
  });
});

describe('CensusCoordinator.reconcileAfterRestart (AC 5.7, 5.2)', () => {
  it('turns a requesting step into census-interrupted and leaves the coalesced step untouched', () => {
    // Before the restart: run-a requested the census, run-b joined it.
    const before = harness();
    before.store.add('run-a');
    before.store.add('run-b');
    requestAs(before, 'run-a');
    const joined: TaskEndIndexOutcome = {
      step: 'index',
      state: 'succeeded',
      reason: 'coalesced',
      joined: { source: 'hook-run', runId: 'run-a' },
    };
    before.store.upsertStep('run-b', 'index', '', joined);

    // After the restart: same durable rows, a fresh coordinator.
    const after = new CensusCoordinator(
      before.store as unknown as ITaskEndStore,
      new FakeCensus(),
      { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    );
    const upsertsBefore = before.store.upserts.length;

    expect(after.reconcileAfterRestart()).toEqual(['run-a']);
    expect(before.store.index('run-a')).toEqual({
      step: 'index',
      state: 'failed',
      reason: 'census-interrupted',
    });
    expect(before.store.index('run-b')).toEqual(joined);
    expect(before.store.upserts.slice(upsertsBefore)).toEqual([
      'run-a:failed/census-interrupted',
    ]);
    expect(after.activeHookCensus(ROOT)).toBeNull();
  });

  it('keeps a census this process is still running', () => {
    const h = harness();
    h.store.add('run-a');
    requestAs(h, 'run-a');
    expect(h.coordinator.reconcileAfterRestart()).toEqual([]);
    expect(h.store.index('run-a')).toEqual(RUNNING);
  });
});

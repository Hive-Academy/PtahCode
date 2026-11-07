import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type {
  TaskEndIndexOutcome,
  TaskEndPendingOutcome,
  TaskEndRunRecord,
  TaskEndStepKind,
  TaskEndStepOutcome,
  TaskEndStepRecord,
} from '@ptah-extension/shared';
import type { TaskEndHookSettings } from '../config/task-end-hook-config';
import type {
  ITaskEndStore,
  TaskEndDeferredCensusStep,
  TaskEndPendingCensus,
} from '../persistence/task-end-store.interface';
import type { ActivityPort, TaskEndProbeResult } from '../ports/activity.port';
import type { CensusPort } from '../ports/census.port';
import { CensusCoordinator } from './census-coordinator';
import {
  FOREGROUND_RECHECK_MIN_MS,
  IndexRequestStep,
} from './index-request.step';

const ROOT = path.join(os.tmpdir(), 'ptah-task-end-index-spec-missing-root');

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

  enabled = true;
  active = false;
  probeError: Error | null = null;

  async symbolsEnabled(): Promise<boolean> {
    if (this.probeError !== null) throw this.probeError;
    return this.enabled;
  }

  isCensusActive(): boolean {
    return this.active;
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

const COOLDOWN_MS = 6 * 60 * 60 * 1000;
const BACKOFF_MS = 300_000;

const ok = <T>(value: T): TaskEndProbeResult<T> => ({ kind: 'ok', value });

class FakeActivity implements ActivityPort {
  roots: TaskEndProbeResult<readonly string[]> = ok([ROOT]);
  foreground: TaskEndProbeResult<boolean> = ok(false);
  readonly backoffs: number[] = [];

  isSessionLive(): TaskEndProbeResult<boolean> {
    return { kind: 'unavailable' };
  }

  liveSessionRoots(): TaskEndProbeResult<readonly string[]> {
    return { kind: 'unavailable' };
  }

  trackedLaneDirs(): TaskEndProbeResult<readonly string[]> {
    return { kind: 'unavailable' };
  }

  registeredWorkspaceRoots(): TaskEndProbeResult<readonly string[]> {
    return this.roots;
  }

  foregroundActive(backoffMs: number): TaskEndProbeResult<boolean> {
    this.backoffs.push(backoffMs);
    return this.foreground;
  }
}

function settingsWith(censusCooldownMs: number): TaskEndHookSettings {
  return {
    enabled: true,
    disposalMode: 'off',
    settleWindowMs: 60_000,
    queueCap: 50,
    censusCooldownMs,
    maxWorktreesPerRun: 8,
    archive: { maxBytes: 1, maxFiles: 1 },
    memory: {
      enabled: true,
      sessionEndEnabled: true,
      bootScanIdleBackoffMs: BACKOFF_MS,
    },
  };
}

let clock = 10_000_000;

function harness(censusCooldownMs = COOLDOWN_MS) {
  const store = new FakeIndexStore();
  const census = new FakeCensus();
  const activity = new FakeActivity();
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
  const settings = { cooldown: censusCooldownMs };
  const step = new IndexRequestStep(
    store as unknown as ITaskEndStore,
    census,
    activity,
    coordinator,
    { read: () => settingsWith(settings.cooldown) },
    logger,
  );
  const record = (runId: string): TaskEndRunRecord => {
    const run = store.getRun(runId);
    if (run === null) throw new Error(`no run ${runId}`);
    return run;
  };
  return { store, census, activity, logger, coordinator, step, record };
}

beforeEach(() => {
  clock = 10_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('IndexRequestStep gate 0 (D6)', () => {
  it('records skipped/main-root-unresolved for a null main root and starts nothing', async () => {
    const h = harness();
    h.store.add('run-a');
    const result = await h.step.run({ ...h.record('run-a'), mainRoot: null });

    expect(result).toEqual({
      outcome: {
        step: 'index',
        state: 'skipped',
        reason: 'main-root-unresolved',
      },
      resumeAt: null,
    });
    expect(h.store.index('run-a')).toMatchObject({
      reason: 'main-root-unresolved',
    });
    expect(h.activity.backoffs).toEqual([]);
    expect(h.census.requests).toHaveLength(0);
  });

  it('records skipped/main-root-not-open for an unregistered main root and starts nothing', async () => {
    const h = harness();
    h.activity.roots = ok(['/some/other/workspace']);
    h.store.add('run-a');
    const result = await h.step.run(h.record('run-a'));

    expect(result.outcome).toEqual({
      step: 'index',
      state: 'skipped',
      reason: 'main-root-not-open',
    });
    expect(h.census.requests).toHaveLength(0);
  });

  it('treats unavailable workspace roots as not open (never a pass) and warns', async () => {
    const h = harness();
    h.activity.roots = { kind: 'unavailable' };
    h.store.add('run-a');
    const result = await h.step.run(h.record('run-a'));

    expect(result.outcome).toMatchObject({ reason: 'main-root-not-open' });
    expect(h.logger.warn).toHaveBeenCalledWith(
      '[task-end-hook] index workspace roots unavailable',
      { runId: 'run-a' },
    );
    expect(h.census.requests).toHaveLength(0);
  });

  it('compares real paths: a registered symlink to the main root counts as open', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptah-index-step-'));
    try {
      const real = path.join(dir, 'main');
      const link = path.join(dir, 'link');
      fs.mkdirSync(real);
      fs.symlinkSync(real, link, 'dir');
      const h = harness();
      h.activity.roots = ok([link]);
      h.store.add('run-a');
      const result = await h.step.run({
        ...h.record('run-a'),
        mainRoot: real,
      });

      expect(result.outcome).toMatchObject({
        state: 'running',
        reason: 'census-requested',
      });
      expect(h.census.requests.map((r) => r.root)).toEqual([real]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
  it('fails closed when realpath fails for a reason other than a missing path', async () => {
    const realpath = fs.promises.realpath;
    jest
      .spyOn(fs.promises, 'realpath')
      .mockImplementation(async (p: fs.PathLike) => {
        if (String(p) === ROOT) {
          throw Object.assign(new Error('permission denied'), {
            code: 'EACCES',
          });
        }
        return realpath(p);
      });
    const h = harness();
    h.store.add('run-a');
    const result = await h.step.run(h.record('run-a'));

    expect(result.outcome).toEqual({
      step: 'index',
      state: 'skipped',
      reason: 'main-root-not-open',
    });
    expect(h.census.requests).toHaveLength(0);
    expect(h.logger.warn).toHaveBeenCalledWith(
      '[task-end-hook] index main root path unverifiable',
      { runId: 'run-a' },
    );
  });

  it('compares a confirmed missing root (ENOENT) by its lexical spelling', async () => {
    const h = harness();
    h.store.add('run-a');
    const result = await h.step.run(h.record('run-a'));

    expect(fs.existsSync(ROOT)).toBe(false);
    expect(result.outcome).toMatchObject({ reason: 'census-requested' });
  });
});

describe('IndexRequestStep decision order 1-6', () => {
  it('1. records skipped/pipeline-disabled when the symbols pipeline is off', async () => {
    const h = harness();
    h.census.enabled = false;
    h.store.add('run-a');
    const result = await h.step.run(h.record('run-a'));

    expect(result.outcome).toEqual({
      step: 'index',
      state: 'skipped',
      reason: 'pipeline-disabled',
    });
    expect(h.census.requests).toHaveLength(0);
  });

  it('2. coalesces onto a hook run that already requested a census', async () => {
    const h = harness();
    h.store.add('run-a');
    h.store.add('run-b');
    await h.step.run(h.record('run-a'));
    const result = await h.step.run(h.record('run-b'));

    expect(result.outcome).toEqual({
      step: 'index',
      state: 'succeeded',
      reason: 'coalesced',
      joined: { source: 'hook-run', runId: 'run-a' },
    });
    expect(h.census.requests).toHaveLength(1);
  });

  it('3. coalesces onto a census started outside the hook (finding 19)', async () => {
    const h = harness();
    h.census.active = true;
    h.store.add('run-a');
    const result = await h.step.run(h.record('run-a'));

    expect(result.outcome).toEqual({
      step: 'index',
      state: 'succeeded',
      reason: 'coalesced',
      joined: { source: 'external' },
    });
    expect(h.census.requests).toHaveLength(0);
  });

  it('4. defers inside the cooldown after the engine completion, with a resume time', async () => {
    const h = harness();
    h.census.indexedAt = clock - 1000;
    h.store.add('run-a');
    const result = await h.step.run(h.record('run-a'));

    expect(result).toEqual({
      outcome: { step: 'index', state: 'deferred', reason: 'census-cooldown' },
      resumeAt: clock - 1000 + COOLDOWN_MS,
    });
    expect(h.store.index('run-a')).toMatchObject({ reason: 'census-cooldown' });
    expect(h.census.requests).toHaveLength(0);
  });

  it('4. uses the later of the engine and the hook completion', async () => {
    const h = harness();
    h.census.indexedAt = clock - 5 * COOLDOWN_MS;
    h.store.add('run-old', {
      step: 'index',
      state: 'succeeded',
      reason: 'census-completed',
    });
    clock += 2000;
    h.store.add('run-a');
    const result = await h.step.run(h.record('run-a'));

    expect(result.outcome).toMatchObject({ reason: 'census-cooldown' });
    expect(result.resumeAt).toBe(clock - 2000 + COOLDOWN_MS);
  });

  it('4. requests a census once the cooldown has elapsed', async () => {
    const h = harness();
    h.census.indexedAt = clock - COOLDOWN_MS;
    h.store.add('run-a');
    const result = await h.step.run(h.record('run-a'));
    expect(result.outcome).toMatchObject({ reason: 'census-requested' });
  });

  it('5. defers while the foreground is active, under the boot-scan back-off', async () => {
    const h = harness();
    h.activity.foreground = ok(true);
    h.store.add('run-a');
    const result = await h.step.run(h.record('run-a'));

    expect(result).toEqual({
      outcome: {
        step: 'index',
        state: 'deferred',
        reason: 'foreground-active',
      },
      resumeAt: clock + BACKOFF_MS,
    });
    expect(h.activity.backoffs).toEqual([BACKOFF_MS]);
    expect(h.census.requests).toHaveLength(0);
  });

  it('5. treats an unavailable activity probe as foreground-active (never a pass)', async () => {
    const h = harness();
    h.activity.foreground = { kind: 'unavailable' };
    h.store.add('run-a');
    const result = await h.step.run(h.record('run-a'));
    expect(result.outcome).toMatchObject({ reason: 'foreground-active' });
    expect(h.census.requests).toHaveLength(0);
  });

  it('5. starts the census once the app is idle (AC 5.5)', async () => {
    const h = harness();
    h.activity.foreground = ok(true);
    h.store.add('run-a');
    const deferred = await h.step.run(h.record('run-a'));
    expect(deferred.outcome).toMatchObject({ reason: 'foreground-active' });
    expect(deferred.resumeAt).toBeGreaterThanOrEqual(
      clock + FOREGROUND_RECHECK_MIN_MS,
    );

    clock = deferred.resumeAt ?? clock;
    h.activity.foreground = ok(false);
    const resumed = await h.step.run(h.record('run-a'));
    expect(resumed.outcome).toMatchObject({
      state: 'running',
      reason: 'census-requested',
    });
    expect(h.census.requests).toHaveLength(1);
  });

  it('6. persists running/census-requested before the request and does not await the census', async () => {
    const h = harness();
    h.store.add('run-a');
    const result = await h.step.run(h.record('run-a'));

    expect(result).toEqual({
      outcome: { step: 'index', state: 'running', reason: 'census-requested' },
      resumeAt: null,
    });
    // The census is still unresolved: `run` returned without waiting on it.
    expect(h.census.requests).toHaveLength(1);
    expect(h.store.index('run-a')).toMatchObject({ state: 'running' });
    expect(h.store.pendingCensus(ROOT)).toEqual({
      runId: 'run-a',
      requestedAt: clock,
    });
    expect(h.store.rows.get('run-a')?.attempts).toBe(1);

    h.census.indexedAt = clock + 1;
    h.census.requests[0].resolve();
    await h.coordinator.settled();
    expect(h.store.index('run-a')).toMatchObject({
      reason: 'census-completed',
    });
  });

  it('records census-failed when a census probe throws; the text stays in debug', async () => {
    const h = harness();
    h.census.probeError = new Error('db path /secret leaked');
    h.store.add('run-a');
    const result = await h.step.run(h.record('run-a'));

    expect(result.outcome).toEqual({
      step: 'index',
      state: 'failed',
      reason: 'census-failed',
    });
    expect(JSON.stringify(h.store.index('run-a'))).not.toContain('secret');
    expect(h.logger.debug).toHaveBeenCalledWith(
      '[task-end-hook] index probe failed',
      expect.objectContaining({ runId: 'run-a' }),
    );
  });

  it('records census-interrupted when the coordinator is shut down', async () => {
    const h = harness();
    h.coordinator.dispose();
    h.store.add('run-a');
    const result = await h.step.run(h.record('run-a'));

    expect(result.outcome).toMatchObject({
      state: 'failed',
      reason: 'census-interrupted',
    });
    expect(h.store.index('run-a')).toMatchObject({
      reason: 'census-interrupted',
    });
    expect(h.census.requests).toHaveLength(0);
  });

  it('returns a terminal or requesting entry as it is, without probing', async () => {
    const h = harness();
    const joined: TaskEndIndexOutcome = {
      step: 'index',
      state: 'succeeded',
      reason: 'coalesced',
      joined: { source: 'external' },
    };
    h.store.add('run-a', joined);
    h.store.add('run-b', {
      step: 'index',
      state: 'running',
      reason: 'census-requested',
    });
    const upserts = h.store.upserts.length;

    expect((await h.step.run(h.record('run-a'))).outcome).toEqual(joined);
    expect((await h.step.run(h.record('run-b'))).outcome).toMatchObject({
      reason: 'census-requested',
    });
    expect(h.store.upserts.length).toBe(upserts);
    expect(h.activity.backoffs).toEqual([]);
    expect(h.census.requests).toHaveLength(0);
  });

  it('does not request a second census for a stale record of its own pending census', async () => {
    const h = harness();
    h.store.add('run-a');
    const stale = h.record('run-a');
    await h.step.run(h.record('run-a'));
    const again = await h.step.run(stale);

    expect(again.outcome).toMatchObject({ reason: 'census-requested' });
    expect(h.census.requests).toHaveLength(1);
  });
});

describe('IndexRequestStep cooldown window (AC 5.3)', () => {
  it('three tasks ending inside one cooldown window give at most one further census', async () => {
    const h = harness();

    // Each task ends just after a separate census completion.
    for (const runId of ['run-a', 'run-b', 'run-c']) {
      clock += 60_000;
      h.census.indexedAt = clock;
      clock += 1000;
      h.store.add(runId);
      const result = await h.step.run(h.record(runId));
      expect(result.outcome).toMatchObject({ reason: 'census-cooldown' });
    }
    expect(h.census.requests).toHaveLength(0);

    // Cooldown end: the worker re-enters the oldest deferred run.
    const lastCompletion = h.census.indexedAt ?? 0;
    clock = lastCompletion + COOLDOWN_MS;
    const owner = await h.step.run(h.record('run-a'));
    expect(owner.outcome).toMatchObject({ reason: 'census-requested' });

    for (const runId of ['run-b', 'run-c']) {
      expect(h.store.index(runId)).toEqual({
        step: 'index',
        state: 'succeeded',
        reason: 'coalesced',
        joined: { source: 'hook-run', runId: 'run-a' },
      });
      // A later re-entry of a coalesced run starts nothing.
      await h.step.run(h.record(runId));
    }
    expect(h.census.requests).toHaveLength(1);

    // The census completes; a fourth task in the new window defers again.
    h.census.indexedAt = clock + 10;
    h.census.requests[0].resolve();
    await h.coordinator.settled();
    clock += 20;
    h.store.add('run-d');
    expect((await h.step.run(h.record('run-d'))).outcome).toMatchObject({
      reason: 'census-cooldown',
    });
    expect(h.census.requests).toHaveLength(1);
  });

  it('a restart while the joined census runs reconciles only the requesting step', async () => {
    const h = harness();
    h.store.add('run-a');
    h.store.add('run-b');
    await h.step.run(h.record('run-a'));
    await h.step.run(h.record('run-b'));
    expect(h.store.index('run-b')).toMatchObject({ reason: 'coalesced' });

    const restarted = new CensusCoordinator(
      h.store as unknown as ITaskEndStore,
      h.census,
      h.logger,
    );
    expect(restarted.reconcileAfterRestart()).toEqual(['run-a']);
    expect(h.store.index('run-a')).toMatchObject({
      reason: 'census-interrupted',
    });
    expect(h.store.index('run-b')).toEqual({
      step: 'index',
      state: 'succeeded',
      reason: 'coalesced',
      joined: { source: 'hook-run', runId: 'run-a' },
    });
  });

  it('shutdown before the cooldown-end request leaves both waiting runs deferred', async () => {
    const h = harness();
    h.census.indexedAt = clock;
    clock += 1000;
    for (const runId of ['run-a', 'run-b', 'run-c']) {
      h.store.add(runId);
      expect((await h.step.run(h.record(runId))).outcome).toMatchObject({
        reason: 'census-cooldown',
      });
    }

    // Shutdown disposes the coordinator as the cooldown ends.
    clock = (h.census.indexedAt ?? 0) + COOLDOWN_MS;
    h.coordinator.dispose();
    const owner = await h.step.run(h.record('run-a'));

    expect(owner.outcome).toMatchObject({
      state: 'failed',
      reason: 'census-interrupted',
    });
    expect(h.census.requests).toHaveLength(0);
    for (const runId of ['run-b', 'run-c']) {
      expect(h.store.index(runId)).toEqual({
        step: 'index',
        state: 'deferred',
        reason: 'census-cooldown',
      });
    }
    // The waiting runs can still re-enter: a fresh coordinator after the
    // restart starts one census for them.
    const restarted = new CensusCoordinator(
      h.store as unknown as ITaskEndStore,
      h.census,
      h.logger,
    );
    const step = new IndexRequestStep(
      h.store as unknown as ITaskEndStore,
      h.census,
      h.activity,
      restarted,
      { read: () => settingsWith(COOLDOWN_MS) },
      h.logger,
    );
    expect((await step.run(h.record('run-b'))).outcome).toMatchObject({
      reason: 'census-requested',
    });
    expect(h.store.index('run-c')).toMatchObject({
      reason: 'coalesced',
      joined: { source: 'hook-run', runId: 'run-b' },
    });
    expect(h.census.requests).toHaveLength(1);
  });
});

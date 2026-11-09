import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  MIGRATIONS,
  SqliteConnectionService,
  type SqliteDatabase,
} from '@ptah-extension/persistence-sqlite';
import type {
  TaskEndCurationResult,
  TaskEndRunRecord,
  TaskEndStepKind,
  TaskStatus,
} from '@ptah-extension/shared';
import { Logger } from '@ptah-extension/vscode-core';
import type { TaskEndHookSettings } from '../config/task-end-hook-config';
import { SqliteTaskEndStore } from '../persistence/sqlite-task-end.store';
import type {
  TaskEndObservation,
  TaskEndRunPolicy,
} from '../persistence/task-end-store.interface';
import type { ActivityPort } from '../ports/activity.port';
import type { CensusPort } from '../ports/census.port';
import type { CurationPort } from '../ports/curation.port';
import type { GitReadRunner } from '../ports/git-read-runner.port';
import type { HarvestPort } from '../ports/harvest.port';
import type { PrStatusPort } from '../ports/pr-status.port';
import type { SessionLinkPort } from '../ports/session-link.port';
import { CensusCoordinator } from '../steps/census-coordinator';
import { CloseCurateStep } from '../steps/close-curate.step';
import { DisposeEvaluateStep } from '../steps/dispose-evaluate.step';
import { HarvestStep } from '../steps/harvest.step';
import { IndexRequestStep } from '../steps/index-request.step';
import { CarrierReader } from './carrier-reader';
import {
  STORE_FAILURE_BACKOFF_MS,
  TaskEndRunWorker,
} from './task-end-run-worker';

const SETTLE_MS = 5_000;
const POLICY: TaskEndRunPolicy = {
  hookEnabled: true,
  settleWindowMs: SETTLE_MS,
  queueCap: 10,
};
const SECRET = 'token sk-test-123 at /home/secret';
const RAN: TaskEndCurationResult = {
  kind: 'ran',
  counts: { extracted: 2, merged: 1, created: 1 },
  transcript: 'read',
};

const SETTINGS: TaskEndHookSettings = {
  enabled: true,
  disposalMode: 'off',
  settleWindowMs: SETTLE_MS,
  queueCap: 10,
  censusCooldownMs: 0,
  maxWorktreesPerRun: 8,
  archive: { maxBytes: 1_000_000, maxFiles: 100 },
  memory: { enabled: true, sessionEndEnabled: true, bootScanIdleBackoffMs: 0 },
};

interface Ports {
  readonly curation: jest.Mocked<CurationPort>;
  readonly harvest: jest.Mocked<HarvestPort>;
  readonly census: jest.Mocked<CensusPort>;
  readonly sessionLinks: jest.Mocked<SessionLinkPort>;
  readonly activity: jest.Mocked<ActivityPort>;
  readonly prStatus: jest.Mocked<PrStatusPort>;
  readonly git: jest.Mocked<GitReadRunner>;
}

interface Harness {
  readonly root: string;
  readonly store: SqliteTaskEndStore;
  readonly logger: Logger;
  readonly ports: Ports;
  readonly worker: TaskEndRunWorker;
  /** Builds a second worker over the same store and ports (a restart). */
  restart(): TaskEndRunWorker;
}

let tmp: string;
const workers: TaskEndRunWorker[] = [];

function writeCarrier(root: string, taskId: string, status: TaskStatus): void {
  const dir = path.join(root, '.ptah', 'specs', taskId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'task.md'),
    `---\nid: ${taskId}\nstatus: ${status}\ntitle: Fixture ${taskId}\n---\n\nBody.\n`,
  );
}

const HARVESTED = { outcome: 'harvested', reconciled: 1 } as const;
const ok = <T>(value: T) => ({ kind: 'ok', value }) as const;

function makePorts(root: string): Ports {
  let indexedAt: number | null = null;
  return {
    curation: { curateEndedSession: jest.fn().mockResolvedValue(RAN) },
    harvest: { harvestTask: jest.fn().mockResolvedValue(HARVESTED) },
    census: {
      symbolsEnabled: jest.fn().mockResolvedValue(true),
      isCensusActive: jest.fn().mockReturnValue(false),
      lastIndexedAt: jest.fn().mockImplementation(async () => indexedAt),
      lastError: jest.fn().mockResolvedValue(null),
      requestCensus: jest.fn().mockImplementation(async () => {
        indexedAt = Date.now();
      }),
    },
    sessionLinks: {
      linkedSessions: jest.fn().mockReturnValue([]),
      worktreePathForSession: jest.fn().mockReturnValue(null),
      taskIdsInWorktreeName: jest.fn().mockReturnValue([]),
    },
    activity: {
      isSessionLive: jest.fn().mockReturnValue(ok(false)),
      liveSessionRoots: jest.fn().mockReturnValue(ok([])),
      trackedLaneDirs: jest.fn().mockReturnValue(ok([])),
      registeredWorkspaceRoots: jest.fn().mockReturnValue(ok([root])),
      foregroundActive: jest.fn().mockReturnValue(ok(false)),
    },
    prStatus: { openPrStatus: jest.fn().mockResolvedValue({ kind: 'none' }) },
    git: { run: jest.fn().mockRejectedValue(new Error('git unavailable')) },
  };
}

function setup(
  steps: {
    readonly harvest?: Pick<HarvestStep, 'run'>;
    readonly dispose?: Pick<DisposeEvaluateStep, 'run'>;
  } = {},
): Harness {
  const root = fs.mkdtempSync(path.join(tmp, 'root-'));
  const Database = require('better-sqlite3') as new (
    file: string,
  ) => SqliteDatabase;
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const migration of MIGRATIONS) {
    if (migration.sql) db.exec(migration.sql);
  }
  const logger = Object.create(Logger.prototype) as Logger;
  logger.info = jest.fn();
  logger.debug = jest.fn();
  logger.warn = jest.fn();
  logger.error = jest.fn();
  const connection = new SqliteConnectionService(':memory:', logger);
  Object.defineProperty(connection, 'db', { value: db });
  const store = new SqliteTaskEndStore(connection, logger, {
    now: () => Date.now(),
  });
  const ports = makePorts(root);
  const settings = { read: () => SETTINGS };

  const build = (): TaskEndRunWorker => {
    const coordinator = new CensusCoordinator(store, ports.census, logger);
    const worker = new TaskEndRunWorker(
      store,
      new CloseCurateStep(
        store,
        ports.curation,
        ports.sessionLinks,
        ports.activity,
        logger,
      ),
      steps.harvest ?? new HarvestStep(store, ports.harvest, logger),
      steps.dispose ??
        new DisposeEvaluateStep(
          store,
          ports.sessionLinks,
          ports.activity,
          ports.prStatus,
          ports.git,
          settings,
          logger,
        ),
      new IndexRequestStep(
        store,
        ports.census,
        ports.activity,
        coordinator,
        settings,
        logger,
      ),
      coordinator,
      settings,
      logger,
    );
    workers.push(worker);
    return worker;
  };
  return { root, store, logger, ports, worker: build(), restart: build };
}

function journal(
  h: Harness,
  taskId: string,
  overrides: Partial<TaskEndObservation> = {},
  policy: TaskEndRunPolicy = POLICY,
): string {
  writeCarrier(h.root, taskId, 'done');
  const result = h.store.journalObservation(
    {
      repoId: 'repo-1',
      taskId,
      status: 'done',
      source: 'write',
      seenRoot: h.root,
      mainRoot: h.root,
      ...overrides,
    },
    policy,
  );
  if (result.kind !== 'terminal-entry' || result.entry.kind !== 'run') {
    throw new Error(`expected a run for ${taskId}`);
  }
  return result.entry.runId;
}

function run(h: Harness, runId: string): TaskEndRunRecord {
  const record = h.store.getRun(runId);
  if (record === null) throw new Error(`no run ${runId}`);
  return record;
}

/** `state/reason` of every entry of one step kind, in stored order. */
function outcomes(h: Harness, runId: string, step: TaskEndStepKind): string[] {
  return run(h, runId)
    .steps.filter((entry) => entry.step === step)
    .map((entry) =>
      entry.outcome.state === 'pending'
        ? 'pending'
        : `${entry.outcome.state}/${entry.outcome.reason}`,
    );
}

/** A run left `running` by a crash after close-curate and harvest ended. */
function seedResumed(h: Harness, runId: string): void {
  h.store.setRunState(runId, { state: 'running', reason: null });
  h.store.upsertStep(runId, 'close-curate', '', {
    step: 'close-curate',
    state: 'skipped',
    reason: 'no-linked-sessions',
  });
  h.store.markStepRunning(runId, 'harvest', '');
  h.store.upsertStep(runId, 'harvest', '', {
    step: 'harvest',
    state: 'succeeded',
    reason: 'harvested',
  });
}

/** Fires due timers and waits until the worker and its censuses are idle. */
async function flush(h: Harness, ms = 0, worker = h.worker): Promise<void> {
  await jest.advanceTimersByTimeAsync(ms);
  for (let i = 0; i < 8; i++) {
    await worker.awaitStopped();
    await new Promise((resolve) => setImmediate(resolve));
    await jest.advanceTimersByTimeAsync(0);
  }
}

/**
 * Polls while a census is held open (so `awaitStopped` would wait). Bounded
 * by real elapsed time, not turns: carrier reads are real I/O, which a loaded
 * machine can delay past any fixed number of event-loop turns.
 */
async function until(condition: () => boolean): Promise<void> {
  const deadline = performance.now() + 10_000;
  while (!condition() && performance.now() < deadline) {
    await jest.advanceTimersByTimeAsync(0);
    await new Promise((resolve) => setImmediate(resolve));
  }
  expect(condition()).toBe(true);
}

beforeAll(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'teh-worker-')));
});

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  jest.useFakeTimers({
    doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask', 'performance'],
    now: 1_700_000_000_000,
  });
});

afterEach(() => {
  for (const worker of workers.splice(0)) worker.dispose();
  jest.useRealTimers();
});

describe('TaskEndRunWorker', () => {
  it('runs no step during the settle window; a read sees four pending steps', async () => {
    const h = setup();
    const runId = journal(h, 'TASK_2026_001');
    h.worker.start();
    await flush(h);

    const record = run(h, runId);
    expect(record.state).toBe('settling');
    expect(record.steps.map((e) => `${e.step}:${e.outcome.state}`)).toEqual(
      ['close-curate', 'harvest', 'dispose', 'index'].map(
        (k) => `${k}:pending`,
      ),
    );
    expect(h.ports.harvest.harvestTask).not.toHaveBeenCalled();
  });

  it('arms exactly one unref timer for several settling runs', async () => {
    const timeouts = jest.spyOn(global, 'setTimeout');
    const h = setup();
    journal(h, 'TASK_2026_001');
    jest.advanceTimersByTime(1_000);
    journal(h, 'TASK_2026_002');
    h.worker.start();
    await flush(h);

    expect(jest.getTimerCount()).toBe(1);
    expect(timeouts).toHaveBeenCalled();
    for (const { value } of timeouts.mock.results) {
      expect((value as NodeJS.Timeout).hasRef()).toBe(false);
    }
  });

  it('cancels a run reopened inside the settle window without running a step (AC 1.2a)', async () => {
    const h = setup();
    const runId = journal(h, 'TASK_2026_001');
    h.worker.start();
    writeCarrier(h.root, 'TASK_2026_001', 'in_progress');
    await flush(h, SETTLE_MS);

    const record = run(h, runId);
    expect([record.state, record.reason]).toEqual([
      'cancelled',
      'status-reverted',
    ]);
    expect(
      record.steps.every((entry) => entry.outcome.state === 'pending'),
    ).toBe(true);
    expect(h.ports.curation.curateEndedSession).not.toHaveBeenCalled();
    expect(h.ports.harvest.harvestTask).not.toHaveBeenCalled();
  });

  it('runs every step, expands linked sessions, logs each outcome and completes', async () => {
    const h = setup();
    h.ports.sessionLinks.linkedSessions.mockReturnValue(['s1', 's2']);
    const runId = journal(h, 'TASK_2026_001');
    h.worker.start();
    await flush(h, SETTLE_MS);

    const record = run(h, runId);
    expect([record.state, record.reason]).toEqual([
      'completed',
      'steps-terminal',
    ]);
    expect(
      record.steps
        .filter((entry) => entry.step === 'close-curate')
        .map((entry) => entry.subject),
    ).toEqual(['s1', 's2']);
    expect(outcomes(h, runId, 'close-curate')).toEqual([
      'succeeded/curated',
      'succeeded/curated',
    ]);
    expect(outcomes(h, runId, 'harvest')).toEqual(['skipped/manual-only']);
    expect(outcomes(h, runId, 'dispose')).toEqual([
      'blocked/precondition-unverifiable',
    ]);
    expect(outcomes(h, runId, 'index')).toEqual(['succeeded/census-completed']);
    expect(h.ports.harvest.harvestTask).not.toHaveBeenCalled();
    // One info line per step outcome (AC 6.4), codes only.
    const lines = jest
      .mocked(h.logger.info)
      .mock.calls.filter(([message]) => message === '[task-end-hook] step')
      .map(([, fields]) => fields as Record<string, string>)
      .filter((fields) => fields['runId'] === runId);
    expect(
      lines.map(
        (f) => `${f['step']}:${f['subject']}:${f['state']}/${f['reason']}`,
      ),
    ).toEqual([
      'close-curate:s1:succeeded/curated',
      'close-curate:s2:succeeded/curated',
      'harvest::skipped/manual-only',
      'dispose::blocked/precondition-unverifiable',
      'index::running/census-requested',
      'index::succeeded/census-completed',
    ]);
  });

  it('records no-linked-sessions on the placeholder; a second pass changes nothing (NFR Idempotence)', async () => {
    const h = setup();
    const runId = journal(h, 'TASK_2026_001');
    h.worker.start();
    await flush(h, SETTLE_MS);
    expect(outcomes(h, runId, 'close-curate')).toEqual([
      'skipped/no-linked-sessions',
    ]);
    expect(h.ports.curation.curateEndedSession).not.toHaveBeenCalled();
    const before = JSON.stringify(run(h, runId));

    h.worker.wake();
    await flush(h, 60_000);
    const second = h.restart();
    second.start();
    await flush(h, 0, second);

    expect(JSON.stringify(run(h, runId))).toBe(before);
    expect(h.ports.harvest.harvestTask).not.toHaveBeenCalled();
    expect(h.ports.census.requestCensus).toHaveBeenCalledTimes(1);
  });

  it('stops before dispose when the task is reopened after curation (AC 1.2b)', async () => {
    const h = setup();
    h.ports.sessionLinks.linkedSessions.mockReturnValue(['s1']);
    h.ports.curation.curateEndedSession.mockImplementation(async () => {
      writeCarrier(h.root, 'TASK_2026_001', 'in_progress');
      return RAN;
    });
    const runId = journal(h, 'TASK_2026_001');
    h.worker.start();
    await flush(h, SETTLE_MS);

    const record = run(h, runId);
    expect([record.state, record.reason]).toEqual([
      'cancelled',
      'status-reverted',
    ]);
    expect(outcomes(h, runId, 'harvest')).toEqual(['pending']);
    expect(outcomes(h, runId, 'dispose')).toEqual(['pending']);
    expect(outcomes(h, runId, 'index')).toEqual(['pending']);
    expect(h.ports.git.run).not.toHaveBeenCalled();
  });

  it('keeps a done-to-cancelled run going without automatic harvest', async () => {
    const h = setup();
    const runId = journal(h, 'TASK_2026_001');
    writeCarrier(h.root, 'TASK_2026_001', 'cancelled');
    h.worker.start();
    await flush(h, SETTLE_MS);

    expect(run(h, runId).state).toBe('completed');
    expect(outcomes(h, runId, 'harvest')).toEqual(['skipped/manual-only']);
    expect(outcomes(h, runId, 'dispose')[0]).toMatch(/^blocked\//);
  });

  it('runs queued runs in FIFO order', async () => {
    const h = setup();
    const ids = ['TASK_2026_001', 'TASK_2026_002', 'TASK_2026_003'];
    const runIds = ids.map((id) => journal(h, id));
    h.worker.start();
    await flush(h, SETTLE_MS);

    expect(h.ports.harvest.harvestTask).not.toHaveBeenCalled();
    for (const runId of runIds) {
      expect(outcomes(h, runId, 'harvest')).toEqual(['skipped/manual-only']);
    }
  });

  it('never runs a run created as skipped/queue-full, and keeps its journal entry', async () => {
    const h = setup();
    const capped: TaskEndRunPolicy = { ...POLICY, queueCap: 1 };
    const first = journal(h, 'TASK_2026_001', {}, capped);
    const second = journal(h, 'TASK_2026_002', {}, capped);
    h.worker.start();
    await flush(h, SETTLE_MS);

    expect(run(h, first).state).toBe('completed');
    const skipped = run(h, second);
    expect([skipped.state, skipped.reason]).toEqual(['skipped', 'queue-full']);
    expect(
      h.store.latestRun({ repoId: 'repo-1' }, 'TASK_2026_002')?.runId,
    ).toBe(second);
    expect(h.ports.harvest.harvestTask).not.toHaveBeenCalled();
  });

  it('releases the slot while a run waits on its census (AC 5.8)', async () => {
    const h = setup();
    let finishCensus: () => void = () => undefined;
    h.ports.census.requestCensus.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishCensus = resolve;
        }),
    );
    const first = journal(h, 'TASK_2026_001');
    const second = journal(h, 'TASK_2026_002');
    h.worker.start();
    await jest.advanceTimersByTimeAsync(SETTLE_MS);

    await until(() => run(h, second).state === 'completed');
    expect(run(h, first).state).toBe('running');
    expect(outcomes(h, first, 'index')).toEqual(['running/census-requested']);
    expect(outcomes(h, second, 'index')).toEqual(['succeeded/coalesced']);

    finishCensus();
    await until(() => run(h, first).state === 'completed');
    expect(outcomes(h, first, 'index')).toEqual(['failed/census-interrupted']);
  });

  it('resumes a running run at its first unfinished step after a restart (AC 6.2)', async () => {
    const h = setup();
    const runId = journal(h, 'TASK_2026_001');
    seedResumed(h, runId);
    // A crash mid-dispose leaves the entry `running`: it is re-probed.
    h.store.markStepRunning(runId, 'dispose', '');
    h.worker.start();
    await flush(h);

    expect(h.ports.harvest.harvestTask).not.toHaveBeenCalled();
    expect(h.ports.git.run).toHaveBeenCalled();
    expect(outcomes(h, runId, 'dispose')).toEqual([
      'blocked/precondition-unverifiable',
    ]);
    expect(outcomes(h, runId, 'index')).toEqual(['succeeded/census-completed']);
    expect(run(h, runId).state).toBe('completed');
  });

  it('re-reads the carrier on resume and cancels a reopened task', async () => {
    const h = setup();
    const runId = journal(h, 'TASK_2026_001');
    h.store.setRunState(runId, { state: 'running', reason: null });
    writeCarrier(h.root, 'TASK_2026_001', 'in_review');
    h.worker.start();
    await flush(h);

    expect(run(h, runId).state).toBe('cancelled');
    expect(h.ports.harvest.harvestTask).not.toHaveBeenCalled();
  });

  it('reconciles a census requested before the restart to census-interrupted', async () => {
    const h = setup();
    const runId = journal(h, 'TASK_2026_001');
    seedResumed(h, runId);
    h.store.markStepRunning(runId, 'index', '');
    h.store.upsertStep(runId, 'index', '', {
      step: 'index',
      state: 'running',
      reason: 'census-requested',
    });
    h.worker.start();
    await flush(h);

    expect(outcomes(h, runId, 'index')).toEqual(['failed/census-interrupted']);
    expect(h.ports.census.requestCensus).not.toHaveBeenCalled();
    expect(run(h, runId).state).toBe('completed');
  });

  it('records a throwing step with its fallback reason and continues (AC 6.3)', async () => {
    const h = setup({
      harvest: { run: jest.fn().mockRejectedValue(new Error(SECRET)) },
      dispose: { run: jest.fn().mockRejectedValue(new Error(SECRET)) },
    });
    const runId = journal(h, 'TASK_2026_001');
    h.worker.start();
    await flush(h, SETTLE_MS);

    expect(outcomes(h, runId, 'harvest')).toEqual(['skipped/manual-only']);
    expect(outcomes(h, runId, 'dispose')).toEqual([
      'blocked/precondition-unverifiable',
    ]);
    const dispose = run(h, runId).steps.find(
      (entry) => entry.step === 'dispose',
    );
    expect(dispose?.outcome).toMatchObject({
      effectiveMode: 'off',
      requestedMode: 'off',
      modeReason: 'none',
    });
    expect(outcomes(h, runId, 'index')).toEqual(['succeeded/census-completed']);
    expect(run(h, runId).state).toBe('completed');
  });

  type Throwing = { mockImplementation(fn: () => never): unknown };
  const boom = (): never => {
    throw new Error(SECRET);
  };
  const throwers: ReadonlyArray<[string, (p: Ports) => Throwing[]]> = [
    ['curation', (p) => [p.curation.curateEndedSession]],
    ['session link', (p) => Object.values(p.sessionLinks)],
    ['activity', (p) => Object.values(p.activity)],
    ['pr status', (p) => [p.prStatus.openPrStatus]],
    ['git', (p) => [p.git.run]],
    ['census', (p) => [p.census.symbolsEnabled, p.census.requestCensus]],
  ];

  it.each(throwers)(
    'stores no raw error text when the %s port throws (finding 3)',
    async (_name, methods) => {
      const h = setup();
      h.ports.sessionLinks.linkedSessions.mockReturnValue(['s1']);
      for (const method of methods(h.ports)) method.mockImplementation(boom);
      const runId = journal(h, 'TASK_2026_001');
      h.worker.start();
      await flush(h, SETTLE_MS);

      const record = run(h, runId);
      expect(record.state).toBe('completed');
      for (const text of [
        JSON.stringify(record),
        JSON.stringify(jest.mocked(h.logger.info).mock.calls),
      ]) {
        expect(text).not.toContain('sk-test-123');
        expect(text).not.toContain('/home/secret');
      }
    },
  );

  it('without a main root records dispose unverifiable and index main-root-unresolved, and still curates', async () => {
    const h = setup();
    h.ports.sessionLinks.linkedSessions.mockReturnValue(['s1']);
    const runId = journal(h, 'TASK_2026_001', { mainRoot: null });
    h.worker.start();
    await flush(h, SETTLE_MS);

    expect(outcomes(h, runId, 'close-curate')).toEqual(['succeeded/curated']);
    expect(outcomes(h, runId, 'harvest')).toEqual(['skipped/manual-only']);
    expect(outcomes(h, runId, 'dispose')).toEqual([
      'blocked/precondition-unverifiable',
    ]);
    expect(outcomes(h, runId, 'index')).toEqual([
      'skipped/main-root-unresolved',
    ]);
    expect(h.ports.git.run).not.toHaveBeenCalled();
    expect(h.ports.census.requestCensus).not.toHaveBeenCalled();
    expect(run(h, runId).state).toBe('completed');
  });

  it('retries a deferred close-curate entry once, after the index step was dispatched (R11)', async () => {
    const h = setup();
    const order: string[] = [];
    h.ports.sessionLinks.linkedSessions.mockReturnValue(['s1']);
    h.ports.curation.curateEndedSession.mockImplementation(async () => {
      order.push('curate');
      return {
        kind: 'stalled',
        reason: 'provider-unreachable',
        transcript: 'read',
      };
    });
    h.ports.census.symbolsEnabled.mockImplementation(async () => {
      order.push('index');
      return true;
    });
    const runId = journal(h, 'TASK_2026_001');
    h.worker.start();
    await flush(h, SETTLE_MS);

    expect(order).toEqual(['curate', 'index', 'curate']);
    const entry = run(h, runId).steps.find(
      (candidate) => candidate.step === 'close-curate',
    );
    expect(outcomes(h, runId, 'close-curate')).toEqual([
      'failed/provider-unreachable',
    ]);
    expect(entry?.attempts).toBe(2);
    expect(run(h, runId).state).toBe('completed');
  });

  it('re-enters a deferred index step at its resume time', async () => {
    const h = setup();
    h.ports.activity.foregroundActive
      .mockReturnValueOnce(ok(true))
      .mockReturnValue(ok(false));
    const runId = journal(h, 'TASK_2026_001');
    h.worker.start();
    await flush(h, SETTLE_MS);
    expect(outcomes(h, runId, 'index')).toEqual(['deferred/foreground-active']);
    expect(run(h, runId).state).toBe('running');

    await flush(h, 60_000);
    expect(outcomes(h, runId, 'index')).toEqual(['succeeded/census-completed']);
    expect(run(h, runId).state).toBe('completed');
  });

  it('backs off after a store failure and resumes from the committed state', async () => {
    const h = setup();
    const runId = journal(h, 'TASK_2026_001');
    jest.spyOn(h.store, 'setRunState').mockImplementationOnce(() => {
      throw new Error('database is locked');
    });
    h.worker.start();
    await flush(h, SETTLE_MS);

    expect(h.logger.error).toHaveBeenCalledWith(
      '[task-end-hook] worker tick failed; retrying after back-off',
      expect.any(Error),
    );
    expect(run(h, runId).state).toBe('settling');
    h.worker.wake();
    await flush(h, STORE_FAILURE_BACKOFF_MS - 1_000);
    expect(run(h, runId).state).toBe('settling');

    await flush(h, 1_000);
    expect(run(h, runId).state).toBe('completed');
  });

  it('dispose() aborts the in-flight step, clears the timer and stops', async () => {
    const h = setup();
    const seen: { signal: AbortSignal | null } = { signal: null };
    h.ports.sessionLinks.linkedSessions.mockReturnValue(['s1']);
    h.ports.curation.curateEndedSession.mockImplementation(
      (_session, _root, signal) =>
        new Promise<TaskEndCurationResult>((_resolve, reject) => {
          seen.signal = signal;
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const runId = journal(h, 'TASK_2026_001');
    h.worker.start();
    await jest.advanceTimersByTimeAsync(SETTLE_MS);
    await until(() => seen.signal !== null);

    h.worker.dispose();
    await h.worker.awaitStopped();

    expect(seen.signal?.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
    expect(run(h, runId).state).toBe('running');
    expect(h.ports.harvest.harvestTask).not.toHaveBeenCalled();
  });
});

describe('CarrierReader', () => {
  const reader = new CarrierReader();
  const UNREADABLE = { kind: 'unreadable' };

  it.each([
    ['done', 'terminal'],
    ['cancelled', 'terminal'],
    ['in_progress', 'non-terminal'],
  ] as const)('reads %s as %s', async (status, kind) => {
    const root = fs.mkdtempSync(path.join(tmp, 'carrier-'));
    writeCarrier(root, 'TASK_2026_009', status);
    await expect(reader.read(root, 'TASK_2026_009')).resolves.toEqual({
      kind,
      status,
    });
  });

  it('reads an absent or unparseable carrier as unreadable', async () => {
    const root = fs.mkdtempSync(path.join(tmp, 'carrier-'));
    const dir = path.join(root, '.ptah', 'specs', 'TASK_2026_010');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'task.md'), 'no frontmatter');
    for (const taskId of ['TASK_2026_009', 'TASK_2026_010']) {
      expect(await reader.read(root, taskId)).toEqual(UNREADABLE);
    }
  });

  it.each(['../TASK_2026_009', 'a/b', '..', ' TASK_2026_009', 'C:x', ''])(
    'never joins the unsafe task id %p',
    async (taskId) => {
      const root = fs.mkdtempSync(path.join(tmp, 'carrier-'));
      writeCarrier(root, 'TASK_2026_009', 'done');
      expect(await reader.read(path.join(root, 'sub'), taskId)).toEqual(
        UNREADABLE,
      );
    },
  );
});

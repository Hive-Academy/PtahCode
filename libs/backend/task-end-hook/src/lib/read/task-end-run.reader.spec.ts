import 'reflect-metadata';
import {
  MIGRATIONS,
  SqliteConnectionService,
  type SqliteDatabase,
} from '@ptah-extension/persistence-sqlite';
import type { TaskStatus } from '@ptah-extension/shared';
import { Logger } from '@ptah-extension/vscode-core';
import { SqliteTaskEndStore } from '../persistence/sqlite-task-end.store';
import type {
  TaskEndObservation,
  TaskEndRunPolicy,
} from '../persistence/task-end-store.interface';
import { TaskEndRunReader } from './task-end-run.reader';

const POLICY: TaskEndRunPolicy = {
  hookEnabled: true,
  settleWindowMs: 5_000,
  queueCap: 10,
};
const TASK = 'TASK_2026_701';
const MAIN = '/repos/app';
const WORKTREE = '/repos/app/.claude-worktrees/feature';
const REPO_ID = '/repos/app/.git';

function observe(
  status: TaskStatus,
  overrides: Partial<TaskEndObservation> = {},
): TaskEndObservation {
  return {
    repoId: REPO_ID,
    taskId: TASK,
    status,
    source: 'write',
    seenRoot: WORKTREE,
    mainRoot: MAIN,
    ...overrides,
  };
}

interface Harness {
  readonly db: SqliteDatabase;
  readonly logger: Logger;
  readonly store: SqliteTaskEndStore;
  /** Roots the fake detector has resolved, with their repository ids. */
  readonly cached: Map<string, string>;
  readonly reader: TaskEndRunReader;
}

function setup(): Harness {
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
  const store = new SqliteTaskEndStore(connection, logger);
  const cached = new Map<string, string>();
  const detector = { cachedRepoId: (root: string) => cached.get(root) ?? null };
  const reader = new TaskEndRunReader(store, detector, logger);
  return { db, logger, store, cached, reader };
}

/** Journals an in-progress then a done observation; returns the run id. */
function endTask(h: Harness, overrides: Partial<TaskEndObservation> = {}) {
  h.store.journalObservation(observe('in_progress', overrides), POLICY);
  const result = h.store.journalObservation(observe('done', overrides), POLICY);
  if (result.kind !== 'terminal-entry' || result.entry.kind !== 'run') {
    throw new Error(`expected a run, got ${JSON.stringify(result)}`);
  }
  return result.entry.runId;
}

describe('TaskEndRunReader', () => {
  let h: Harness;
  beforeEach(() => {
    h = setup();
  });
  afterEach(() => h.db.close());

  it('reads a run right after creation with four pending steps', () => {
    const runId = endTask(h);
    h.cached.set(WORKTREE, REPO_ID);

    const run = h.reader.latestForTask(WORKTREE, TASK);

    expect(run).toMatchObject({ runId, taskId: TASK, state: 'settling' });
    expect(run?.steps.map((entry) => entry.step)).toEqual([
      'close-curate',
      'harvest',
      'dispose',
      'index',
    ]);
    expect(run?.steps.every((entry) => entry.outcome.state === 'pending')).toBe(
      true,
    );
  });

  it('finds a run seen in a linked worktree from the main checkout by the cached repository id', () => {
    const runId = endTask(h);
    h.cached.set(MAIN, REPO_ID);

    expect(h.reader.latestForTask(MAIN, TASK)?.runId).toBe(runId);
  });

  it('falls back to the runs first seen at the root when the repository id is not cached', () => {
    const runId = endTask(h);

    expect(h.reader.latestForTask(WORKTREE, TASK)?.runId).toBe(runId);
    expect(h.reader.latestForTask(MAIN, TASK)).toBeNull();
  });

  it('normalises the workspace root before both lookups', () => {
    const runId = endTask(h);

    expect(h.reader.latestForTask(`${WORKTREE}/`, TASK)?.runId).toBe(runId);
  });

  it('returns the latest episode and keeps repositories with the same task id apart', () => {
    endTask(h);
    const second = endTask(h);
    const otherRepo = endTask(h, { repoId: '/repos/other/.git' });
    h.cached.set(MAIN, REPO_ID);
    h.cached.set('/repos/other', '/repos/other/.git');

    expect(h.reader.latestForTask(MAIN, TASK)?.runId).toBe(second);
    expect(h.reader.latestForTask('/repos/other', TASK)?.runId).toBe(otherRepo);
  });

  it('returns null for a task without a run', () => {
    h.cached.set(MAIN, REPO_ID);

    expect(h.reader.latestForTask(MAIN, 'TASK_2026_999')).toBeNull();
    expect(h.logger.warn).not.toHaveBeenCalled();
  });

  it('omits a run with a step kind missing after a malformed row, and logs it', () => {
    const runId = endTask(h);
    h.cached.set(MAIN, REPO_ID);
    h.db
      .prepare(
        `UPDATE task_end_steps SET state = 'failed', reason = 'not-a-reason'
         WHERE run_id = ? AND step = 'harvest'`,
      )
      .run(runId);

    expect(h.reader.latestForTask(MAIN, TASK)).toBeNull();
    expect(h.logger.error).toHaveBeenCalledWith(
      '[task-end-hook] malformed step row skipped',
      expect.any(Error),
    );
    expect(h.logger.warn).toHaveBeenCalledWith(
      '[task-end-hook] run omitted: step kinds missing',
      { runId, missing: ['harvest'] },
    );
  });

  it('propagates a store failure to the caller', () => {
    h.db.close();
    // afterEach closes it again; better-sqlite3 ignores a second close.
    expect(() => h.reader.latestForTask(MAIN, TASK)).toThrow();
  });
});

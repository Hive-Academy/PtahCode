import 'reflect-metadata';
import { container as rootContainer } from 'tsyringe';
import {
  MIGRATIONS,
  PERSISTENCE_TOKENS,
  SqliteConnectionService,
  type SqliteDatabase,
} from '@ptah-extension/persistence-sqlite';
import { createEvent, PLATFORM_TOKENS } from '@ptah-extension/platform-core';
import { createMockWorkspaceProvider } from '@ptah-extension/platform-core/testing';
import { TASK_SPECS_TOKENS } from '@ptah-extension/task-specs';
import { Logger, TOKENS } from '@ptah-extension/vscode-core';
import { SqliteTaskEndStore } from '../persistence/sqlite-task-end.store';
import { TaskEndRunReader } from '../read/task-end-run.reader';
import { TaskEndTransitionDetector } from '../trigger/task-end-transition-detector';
import type { TaskEndRunsChanged } from '../trigger/task-end-transition-detector';
import { TaskEndRunWorker } from '../worker/task-end-run-worker';
import { connectTaskEndHook, registerTaskEndHook } from './register';
import { TASK_END_TOKENS } from './tokens';

/** The seven host-bound port tokens; the library never binds them. */
const HOST_PORTS = [
  TASK_END_TOKENS.CURATION_PORT,
  TASK_END_TOKENS.HARVEST_PORT,
  TASK_END_TOKENS.CENSUS_PORT,
  TASK_END_TOKENS.SESSION_LINK_PORT,
  TASK_END_TOKENS.ACTIVITY_PORT,
  TASK_END_TOKENS.PR_STATUS_PORT,
  TASK_END_TOKENS.GIT_READ_RUNNER,
] as const;

const LIBRARY_TOKENS = Object.values(TASK_END_TOKENS).filter(
  (token) => !(HOST_PORTS as readonly symbol[]).includes(token),
);

function makeLogger(): Logger {
  const logger = Object.create(Logger.prototype) as Logger;
  logger.info = jest.fn();
  logger.debug = jest.fn();
  logger.warn = jest.fn();
  logger.error = jest.fn();
  return logger;
}

/** A child container with the host dependencies a composition root binds. */
function hostContainer(db: SqliteDatabase) {
  const c = rootContainer.createChildContainer();
  const logger = makeLogger();
  const connection = new SqliteConnectionService(':memory:', logger);
  Object.defineProperty(connection, 'db', { value: db });
  c.registerInstance(TOKENS.LOGGER, logger);
  c.registerInstance(PERSISTENCE_TOKENS.SQLITE_CONNECTION, connection);
  c.registerInstance(
    PLATFORM_TOKENS.WORKSPACE_PROVIDER,
    createMockWorkspaceProvider(),
  );
  const [indexEvent] = createEvent<never>();
  const [settleEvent] = createEvent<never>();
  c.registerInstance(TASK_SPECS_TOKENS.TASK_INDEX_SERVICE, {
    onDidChangeIndex: indexEvent,
    ensureStarted: async () => null,
    list: async () => ({ tasks: [], excluded: [], excludedCount: 0 }),
  });
  c.registerInstance(TASK_SPECS_TOKENS.TASK_WRITER, {
    hasWriteInFlight: () => false,
    onDidSettleWrites: settleEvent,
  });
  for (const port of HOST_PORTS) c.registerInstance(port, {});
  return c;
}

describe('registerTaskEndHook', () => {
  let db: SqliteDatabase;

  beforeEach(() => {
    const Database = require('better-sqlite3') as new (
      file: string,
    ) => SqliteDatabase;
    db = new Database(':memory:');
    for (const migration of MIGRATIONS) {
      if (migration.sql) db.exec(migration.sql);
    }
  });
  afterEach(() => db.close());

  it('registers every library token and no host port', () => {
    const c = rootContainer.createChildContainer();
    registerTaskEndHook(c);

    for (const token of LIBRARY_TOKENS) {
      expect(c.isRegistered(token)).toBe(true);
    }
    for (const port of HOST_PORTS) expect(c.isRegistered(port)).toBe(false);
  });

  it('resolves every library token once the host binds its ports, as singletons', () => {
    const c = hostContainer(db);
    registerTaskEndHook(c);

    for (const token of LIBRARY_TOKENS) {
      expect(c.resolve(token)).toBe(c.resolve(token));
    }
    expect(c.resolve(TASK_END_TOKENS.STORE)).toBeInstanceOf(SqliteTaskEndStore);
    expect(c.resolve(TASK_END_TOKENS.DETECTOR)).toBeInstanceOf(
      TaskEndTransitionDetector,
    );
    expect(c.resolve(TASK_END_TOKENS.WORKER)).toBeInstanceOf(TaskEndRunWorker);
    expect(c.resolve(TASK_END_TOKENS.RUN_READER)).toBeInstanceOf(
      TaskEndRunReader,
    );
    // vscode-lm-tools resolves the reader through its own Symbol.for literal.
    expect(c.resolve(Symbol.for('PtahTaskEndRunReader'))).toBe(
      c.resolve(TASK_END_TOKENS.RUN_READER),
    );
  });
});

describe('connectTaskEndHook', () => {
  function fakes() {
    const [onDidChangeRuns, fire] = createEvent<TaskEndRunsChanged>();
    const detector = {
      onDidChangeRuns,
      dispose: jest.fn(),
      whenIdle: jest.fn(async () => undefined),
    };
    const worker = {
      wake: jest.fn(),
      dispose: jest.fn(),
      awaitStopped: jest.fn(async () => undefined),
    };
    const c = rootContainer.createChildContainer();
    c.registerInstance(TASK_END_TOKENS.DETECTOR, detector);
    c.registerInstance(TASK_END_TOKENS.WORKER, worker);
    return { c, fire, detector, worker };
  }

  const changed: TaskEndRunsChanged = {
    createdRunIds: ['run-1'],
    cancelledRunIds: [],
  };

  it('wakes the worker on every run change until disposed', () => {
    const { c, fire, worker } = fakes();
    const handle = connectTaskEndHook(c);

    fire(changed);
    fire(changed);
    expect(worker.wake).toHaveBeenCalledTimes(2);

    handle.dispose();
    fire(changed);
    expect(worker.wake).toHaveBeenCalledTimes(2);
  });

  it('disposes the detector and the worker once, and awaits both', async () => {
    const { c, detector, worker } = fakes();
    const handle = connectTaskEndHook(c);

    handle.dispose();
    handle.dispose();
    await handle.awaitStopped();

    expect(detector.dispose).toHaveBeenCalledTimes(1);
    expect(worker.dispose).toHaveBeenCalledTimes(1);
    expect(detector.whenIdle).toHaveBeenCalledTimes(1);
    expect(worker.awaitStopped).toHaveBeenCalledTimes(1);
  });
});

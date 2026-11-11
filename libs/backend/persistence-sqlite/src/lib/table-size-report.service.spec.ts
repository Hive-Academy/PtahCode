/** SqliteTableSizeReportService: once-only log, no-op without factory, timeout. */
import 'reflect-metadata';
import type { BackgroundWorkAdmission } from '@ptah-extension/vscode-core';
import { DbWorkerRunner } from './integrity/db-worker-runner';
import type {
  IIntegrityWorkerProcess,
  IIntegrityWorkerProcessFactory,
} from './integrity/worker-process.port';
import type { TableSizeRequest } from './integrity/table-size-protocol';
import { SqliteTableSizeReportService } from './table-size-report.service';
import { createMockLogger } from './testing/mock-logger';

type Reply = (request: TableSizeRequest) => unknown;

function makeFactory(reply: Reply | null): {
  factory: IIntegrityWorkerProcessFactory;
  spawned: () => number;
  kills: () => number;
} {
  let spawned = 0;
  let kills = 0;
  const factory: IIntegrityWorkerProcessFactory = {
    spawn: () => {
      spawned += 1;
      let onMessage: ((msg: unknown) => void) | null = null;
      const worker: IIntegrityWorkerProcess = {
        postMessage: (msg: unknown) => {
          if (reply === null) return;
          const response = reply(msg as TableSizeRequest);
          queueMicrotask(() => onMessage?.(response));
        },
        on: ((event: string, cb: (arg: never) => void) => {
          if (event === 'message') onMessage = cb as (msg: unknown) => void;
        }) as IIntegrityWorkerProcess['on'],
        kill: () => {
          kills += 1;
        },
      };
      return worker;
    },
  };
  return { factory, spawned: () => spawned, kills: () => kills };
}

const OK: Reply = (request) => ({
  id: request.id,
  type: 'table-size',
  ok: true,
  status: 'ok',
  totalBytes: 5000,
  tables: [{ name: 'memories', bytes: 4000, pages: 4 }],
  durationMs: 12,
  detail: null,
});

function make(
  factory: IIntegrityWorkerProcessFactory | null,
  governor: BackgroundWorkAdmission | null = null,
) {
  const logger = createMockLogger();
  const service = new SqliteTableSizeReportService(
    'db-path-not-logged',
    logger,
    new DbWorkerRunner(logger),
    factory,
    governor,
  );
  return { service, logger };
}

describe('SqliteTableSizeReportService', () => {
  it('logs one report line with totals and tables, once per process', async () => {
    const f = makeFactory(OK);
    const { service, logger } = make(f.factory);
    await service.reportOnce();
    await service.reportOnce();
    const lines = logger.entries.filter(
      (e) => e.message === '[persistence-sqlite] table size report',
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].context).toEqual({
      totalBytes: 5000,
      tables: [{ name: 'memories', bytes: 4000, pages: 4 }],
      durationMs: 12,
    });
    expect(f.spawned()).toBe(1);
    expect(JSON.stringify(lines)).not.toContain('db-path-not-logged');
  });

  it('is a silent no-op without a worker factory', async () => {
    const { service, logger } = make(null);
    await service.reportOnce();
    expect(logger.entries).toEqual([]);
  });

  it('does not log a path carried by governor or worker errors', async () => {
    const secretPath = '/private/profile/database.sqlite';
    const governor: BackgroundWorkAdmission = {
      isClear: () => false,
      whenClear: async () => { throw new Error(`failed at ${secretPath}`); },
    };
    const factory: IIntegrityWorkerProcessFactory = {
      spawn: () => { throw new Error(`spawn failed at ${secretPath}`); },
    };
    const { service, logger } = make(factory, governor);
    await service.reportOnce();
    expect(logger.entries.some((entry) => entry.message.includes('background-work wait failed'))).toBe(true);
    expect(logger.entries.some((entry) => entry.message.includes('worker spawn failed'))).toBe(true);
    expect(JSON.stringify(logger.entries)).not.toContain(secretPath);
  });

  it('waits for the governor before it spawns', async () => {
    const f = makeFactory(OK);
    let release: () => void = () => undefined;
    const governor: BackgroundWorkAdmission = {
      isClear: () => false,
      whenClear: () =>
        new Promise((resolve) => {
          release = () => resolve('clear');
        }),
    };
    const { service } = make(f.factory, governor);
    const pending = service.reportOnce();
    await Promise.resolve();
    expect(f.spawned()).toBe(0);
    release();
    await pending;
    expect(f.spawned()).toBe(1);
  });

  it('logs one warning and kills the worker when the budget expires', async () => {
    jest.useFakeTimers();
    try {
      const f = makeFactory(null);
      const { service, logger } = make(f.factory);
      const pending = service.reportOnce();
      await jest.advanceTimersByTimeAsync(60_001);
      await pending;
      const abandoned = logger.entries.filter((e) =>
        e.message.includes('table size report abandoned'),
      );
      expect(abandoned).toHaveLength(1);
      expect(abandoned[0].level).toBe('warn');
      expect(f.kills()).toBeGreaterThan(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('logs unavailable without a table list when dbstat is missing', async () => {
    const f = makeFactory((request) => ({
      id: request.id,
      type: 'table-size',
      ok: true,
      status: 'unavailable',
      totalBytes: 0,
      tables: [],
      durationMs: 1,
      detail: 'dbstat-missing',
    }));
    const { service, logger } = make(f.factory);
    await service.reportOnce();
    expect(
      logger.entries.some((e) =>
        e.message.endsWith('table size report unavailable'),
      ),
    ).toBe(true);
  });
});

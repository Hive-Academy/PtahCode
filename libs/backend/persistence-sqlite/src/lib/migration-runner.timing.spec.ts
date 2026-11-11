/**
 * Timing log lines of SqliteMigrationRunner: bookkeeping, backup request and
 * settle (main wait vs worker duration), per-migration duration.
 */
import 'reflect-metadata';
import { SqliteMigrationRunner } from './migration-runner';
import type { Migration } from './migrations';
import type { IBackupService } from './backup.service';
import { FakeSqliteDatabase } from './testing/fake-sqlite-database';
import { createMockLogger } from './testing/mock-logger';

const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: '0001_init', sql: 'CREATE TABLE t1 (id INTEGER);' },
  { version: 2, name: '0002_t2', sql: 'CREATE TABLE t2 (id INTEGER);' },
];

function setup(workerMs: number, blockMs: number) {
  let t = 1000;
  const now = (): number => {
    t += 1;
    return t;
  };
  const backupService: IBackupService & { lastWorkerDurationMs: number } = {
    lastWorkerDurationMs: workerMs,
    backup: async () => {
      t += blockMs;
      return 'DEST_PATH_SENTINEL';
    },
    rotate: async () => undefined,
  } as IBackupService & { lastWorkerDurationMs: number };
  const logger = createMockLogger();
  const runner = new SqliteMigrationRunner(
    new FakeSqliteDatabase(),
    logger,
    backupService,
    undefined,
    now,
  );
  return { runner, logger };
}

function ctx(
  logger: ReturnType<typeof createMockLogger>,
  message: string,
): Record<string, unknown> {
  const entry = logger.entries.find((e) => e.message.includes(message));
  if (!entry) throw new Error(`no log line: ${message}`);
  return (entry.context ?? {}) as Record<string, unknown>;
}

describe('SqliteMigrationRunner timing logs', () => {
  it('logs bookkeeping with duration and pending versions', async () => {
    const { runner, logger } = setup(100, 100);
    await runner.applyAll(MIGRATIONS);
    const c = ctx(logger, 'migration bookkeeping');
    expect(typeof c['durationMs']).toBe('number');
    expect(c['pendingVersions']).toEqual([1, 2]);
  });

  it('logs backup request and settle with main wait and excess', async () => {
    const { runner, logger } = setup(1200, 30_000);
    await runner.applyAll(MIGRATIONS);
    expect(ctx(logger, 'pre-migration backup requested')['pendingCount']).toBe(
      2,
    );
    const c = ctx(logger, 'pre-migration backup settled');
    const mainWaitMs = c['mainWaitMs'] as number;
    expect(mainWaitMs).toBeGreaterThanOrEqual(30_000);
    expect(c['workerDurationMs']).toBe(1200);
    expect(c['mainWaitExcessMs']).toBe(
      Math.round((mainWaitMs - 1200) * 100) / 100,
    );
    expect(typeof ctx(logger, 'rotation finished')['durationMs']).toBe(
      'number',
    );
  });

  it('logs each applied migration with version and duration', async () => {
    const { runner, logger } = setup(10, 10);
    await runner.applyAll(MIGRATIONS);
    const lines = logger.entries.filter((e) =>
      e.message.endsWith('migration applied'),
    );
    expect(lines.map((l) => (l.context as { version: number }).version)).toEqual(
      [1, 2],
    );
    for (const l of lines) {
      expect(typeof (l.context as { durationMs: number }).durationMs).toBe(
        'number',
      );
    }
  });

  it('keeps file paths out of the new timing lines', async () => {
    const { runner, logger } = setup(10, 10);
    await runner.applyAll(MIGRATIONS);
    const timing = logger.entries.filter((e) =>
      /bookkeeping|backup requested|backup settled|rotation|migration applied/.test(
        e.message,
      ),
    );
    expect(timing.length).toBeGreaterThanOrEqual(5);
    expect(JSON.stringify(timing)).not.toContain('DEST_PATH_SENTINEL');
  });
});

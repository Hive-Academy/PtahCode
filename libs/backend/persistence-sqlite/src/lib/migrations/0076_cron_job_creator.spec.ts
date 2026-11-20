import 'reflect-metadata';
import { sql } from './0076_cron_job_creator';
import { MIGRATIONS } from './index';

interface DatabaseShape {
  exec(statement: string): void;
  prepare(statement: string): {
    run(...params: (string | number | null)[]): unknown;
    get(...params: (string | number | null)[]): unknown;
    all(...params: (string | number | null)[]): unknown;
  };
  close(): void;
}

function openAt75(): DatabaseShape {
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (file: string) => DatabaseShape;
  };
  const db = new DatabaseSync(':memory:');
  for (const migration of MIGRATIONS.filter((entry) => entry.version < 76)) {
    if (migration.sql) db.exec(migration.sql);
  }
  return db;
}

function columnNames(db: DatabaseShape, table: string): string[] {
  return (
    db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  ).map((row) => row.name);
}

describe('migration 0076_cron_job_creator', () => {
  it('registers after 0075 as the latest static migration', () => {
    const previous = MIGRATIONS.findIndex(
      (migration) => migration.version === 75,
    );
    expect(MIGRATIONS[previous + 1]).toEqual({
      version: 76,
      name: '0076_cron_job_creator',
      sql,
    });
    expect(MIGRATIONS[MIGRATIONS.length - 1]?.version).toBe(76);
    expect(sql).not.toContain('${');
    expect(sql).not.toMatch(/\b(DELETE|UPDATE|INSERT|DROP)\b/i);
  });

  it('adds the creator and run session columns; old rows read as user-created', () => {
    const db = openAt75();
    try {
      db.prepare(
        `INSERT INTO scheduled_jobs
          (id, name, cron_expr, timezone, prompt, workspace_root, enabled,
           created_at, updated_at, last_run_at, next_run_at)
         VALUES ('job-old', 'old', '0 9 * * *', 'UTC', 'say hi', '/ws', 1, 1, 1, NULL, NULL)`,
      ).run();
      db.prepare(
        `INSERT INTO job_runs (id, job_id, scheduled_for, status)
         VALUES ('run-old', 'job-old', 1000, 'succeeded')`,
      ).run();

      db.exec(sql);

      expect(columnNames(db, 'scheduled_jobs')).toEqual(
        expect.arrayContaining(['created_by_kind', 'created_by_session_id']),
      );
      expect(columnNames(db, 'job_runs')).toContain('session_id');
      expect(
        db
          .prepare(
            `SELECT name, created_by_kind, created_by_session_id
             FROM scheduled_jobs WHERE id = 'job-old'`,
          )
          .get(),
      ).toEqual({
        name: 'old',
        created_by_kind: 'user',
        created_by_session_id: null,
      });
      expect(
        db
          .prepare(
            `SELECT status, session_id FROM job_runs WHERE id = 'run-old'`,
          )
          .get(),
      ).toEqual({ status: 'succeeded', session_id: null });
    } finally {
      db.close();
    }
  });

  it('stores a session creator and a run session id, and rejects an unknown kind', () => {
    const db = openAt75();
    try {
      db.exec(sql);
      db.prepare(
        `INSERT INTO scheduled_jobs
          (id, name, cron_expr, timezone, prompt, workspace_root, enabled,
           created_at, updated_at, created_by_kind, created_by_session_id)
         VALUES ('job-new', 'new', '0 9 * * *', 'UTC', 'p', NULL, 1, 2, 2, 'session', 'sess-1')`,
      ).run();
      db.prepare(
        `INSERT INTO job_runs (id, job_id, scheduled_for, status, session_id)
         VALUES ('run-new', 'job-new', 2000, 'running', 'sdk-sess-9')`,
      ).run();
      expect(
        db
          .prepare(
            `SELECT created_by_kind, created_by_session_id FROM scheduled_jobs
             WHERE id = 'job-new'`,
          )
          .get(),
      ).toEqual({
        created_by_kind: 'session',
        created_by_session_id: 'sess-1',
      });
      expect(
        db
          .prepare(`SELECT session_id FROM job_runs WHERE id = 'run-new'`)
          .get(),
      ).toEqual({ session_id: 'sdk-sess-9' });
      expect(() =>
        db
          .prepare(
            `INSERT INTO scheduled_jobs
              (id, name, cron_expr, prompt, created_at, updated_at, created_by_kind)
             VALUES ('job-bad', 'bad', '* * * * *', 'p', 3, 3, 'robot')`,
          )
          .run(),
      ).toThrow();
    } finally {
      db.close();
    }
  });
});

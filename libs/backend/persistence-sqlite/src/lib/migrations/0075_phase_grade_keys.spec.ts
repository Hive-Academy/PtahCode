import 'reflect-metadata';
import { sql } from './0075_phase_grade_keys';
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

function openAt74(): DatabaseShape {
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (file: string) => DatabaseShape;
  };
  const db = new DatabaseSync(':memory:');
  for (const migration of MIGRATIONS.filter((entry) => entry.version < 75)) {
    if (migration.sql) db.exec(migration.sql);
  }
  return db;
}

function columnNames(db: DatabaseShape, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
    .map((row) => row.name);
}

describe('migration 0075_phase_grade_keys', () => {
  it('registers after 0074 as the latest static migration', () => {
    const previous = MIGRATIONS.findIndex((migration) => migration.version === 74);
    expect(MIGRATIONS[previous + 1]).toEqual({
      version: 75,
      name: '0075_phase_grade_keys',
      sql,
    });
    expect(MIGRATIONS[MIGRATIONS.length - 1]?.version).toBe(75);
    expect(sql).not.toContain('${');
    expect(sql).not.toMatch(/\b(DELETE|UPDATE|INSERT|DROP)\b/i);
  });

  it('adds nullable columns and keeps old rows unchanged with NULL keys', () => {
    const db = openAt74();
    try {
      db.prepare(`INSERT INTO lane_outcome_records
        (run_id, executor_kind, lane_id, agent_id, model, verdict, role, task_id,
         ended_at, created_at, updated_at)
        VALUES ('old-run', 'subagent', 'subagent', 'agent-1', 'm1', 'completed',
          'backend-developer', 'TASK_A', 1, 1, 1)`).run();
      db.prepare(`INSERT INTO skill_task_grades
        (task_id, subject_kind, subject_slug, attribution_key, run_id, verdict,
         evidence_source, workspace_root, graded_at)
        VALUES ('TASK_A', 'agent', 'backend-developer', 'run:old-run', 'old-run',
          'pass', 'spec:TASK_A', '/ws', 10)`).run();

      db.exec(sql);

      expect(columnNames(db, 'lane_outcome_records')).toContain('phase_kind');
      expect(columnNames(db, 'skill_task_grades')).toEqual(
        expect.arrayContaining(['phase_kind', 'executor_kind']),
      );
      expect(db.prepare(`SELECT role, phase_kind FROM lane_outcome_records
        WHERE run_id = 'old-run'`).get()).toEqual({
        role: 'backend-developer', phase_kind: null,
      });
      expect(db.prepare(`SELECT subject_kind, subject_slug, verdict, phase_kind, executor_kind
        FROM skill_task_grades WHERE task_id = 'TASK_A'`).get()).toEqual({
        subject_kind: 'agent', subject_slug: 'backend-developer', verdict: 'pass',
        phase_kind: null, executor_kind: null,
      });
    } finally {
      db.close();
    }
  });

  it('stores the new keys on new rows', () => {
    const db = openAt74();
    try {
      db.exec(sql);
      db.prepare(`INSERT INTO skill_task_grades
        (task_id, subject_kind, subject_slug, attribution_key, run_id, verdict,
         evidence_source, workspace_root, graded_at, phase_kind, executor_kind)
        VALUES ('TASK_B', 'phase', 'implement', 'run:r1', 'r1', 'fail',
          'spec:TASK_B', '/ws', 20, 'implement', 'cli')`).run();
      expect(db.prepare(`SELECT phase_kind, executor_kind FROM skill_task_grades
        WHERE task_id = 'TASK_B'`).get()).toEqual({
        phase_kind: 'implement', executor_kind: 'cli',
      });
    } finally {
      db.close();
    }
  });
});

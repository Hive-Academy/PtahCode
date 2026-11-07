/**
 * Migration 0072 — task-end hook tables (TASK_2026_886).
 *
 * Part B registered 0072 after #957's 0070 and 0071, so the database is
 * migrated through every entry of MIGRATIONS, 0072 included, and the
 * registry order and the registered SQL are asserted here.
 * Fails instead of skipping when neither SQLite binding loads.
 */
import { sql } from './0072_task_end_hook';
import { MIGRATIONS } from './index';

interface DatabaseShape {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  close(): void;
}

function resolveOpener(): (() => DatabaseShape) | null {
  try {
    const Database = require('better-sqlite3') as new (file: string) => DatabaseShape;
    new Database(':memory:').close();
    return () => new Database(':memory:');
  } catch {
    // Electron's native ABI may not load in Jest; fall through to node:sqlite.
  }
  try {
    const { DatabaseSync } = require('node:sqlite') as {
      DatabaseSync: new (file: string) => DatabaseShape;
    };
    new DatabaseSync(':memory:').close();
    return () => new DatabaseSync(':memory:');
  } catch {
    return null;
  }
}

/** [name, type, notnull, dflt_value, pk] per PRAGMA table_info row. */
type ColumnRow = [string, string, number, string | null, number];

function tableColumns(db: DatabaseShape, table: string): ColumnRow[] {
  const rows = db
    .prepare('SELECT name, type, "notnull", dflt_value, pk FROM pragma_table_info(?) ORDER BY cid')
    .all(table) as Array<{
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }>;
  return rows.map((r): ColumnRow => [r.name, r.type, r.notnull, r.dflt_value, r.pk]);
}

function indexColumns(db: DatabaseShape, index: string): string[] {
  const rows = db
    .prepare('SELECT name, "desc", "key" FROM pragma_index_xinfo(?) ORDER BY seqno')
    .all(index) as Array<{
    name: string | null;
    desc: number;
    key: number;
  }>;
  return rows.filter((r) => r.key === 1).map((r) => String(r.name) + (r.desc ? ' DESC' : ''));
}

const TABLES = [
  'task_end_journal',
  'task_end_repo_state',
  'task_end_runs',
  'task_end_steps',
  'task_end_transitions',
];

describe('migration 0072_task_end_hook', () => {
  it('registers 0070, 0071 and 0072 in order with the exported sql', () => {
    const start = MIGRATIONS.findIndex((migration) => migration.version === 70);
    expect(
      MIGRATIONS.slice(start, start + 3).map(({ version, name }) => ({ version, name })),
    ).toEqual([
      { version: 70, name: '0070_indexing_last_run' },
      { version: 71, name: '0071_skill_inv_events_task_unreconciled' },
      { version: 72, name: '0072_task_end_hook' },
    ]);
    expect(MIGRATIONS[start + 2]?.sql).toBe(sql);
    expect(sql).not.toContain('${');
  });

  const opener = resolveOpener();
  let db: DatabaseShape;

  beforeEach(() => {
    if (!opener) throw new Error('No SQLite binding loaded');
    db = opener();
    // Base SQL of every registered migration (0072 included), as the 0054
    // spec applies it; vec0-only bodies need the sqlite-vec extension and are
    // not relevant here.
    for (const migration of MIGRATIONS) {
      if (migration.sql) db.exec(migration.sql);
    }
  });

  afterEach(() => db.close());

  function insertTransition(id: string, episode = 1): void {
    db.prepare(
      `INSERT INTO task_end_transitions
         (transition_id, repo_id, task_id, episode, from_status, to_status, source, seen_root, observed_at)
       VALUES (?, 'repo-1', 'TASK_1', ?, 'in_review', 'done', 'write', '/repo', 1000)`,
    ).run(id, episode);
  }

  function insertRun(runId: string, transitionId: string, episode = 1, mainRoot: string | null = '/repo'): void {
    db.prepare(
      `INSERT INTO task_end_runs
         (run_id, transition_id, repo_id, task_id, episode, source, from_status, to_status,
          seen_root, main_root, state, queue_seq, settle_until, created_at, updated_at)
       VALUES (?, ?, 'repo-1', 'TASK_1', ?, 'write', 'in_review', 'done',
               '/repo', ?, 'settling', 1, 2000, 1000, 1000)`,
    ).run(runId, transitionId, episode, mainRoot);
  }

  it('is plain static SQL that writes no rows', () => {
    expect(sql).not.toContain('${');
    expect(sql).not.toMatch(/\b(DELETE|UPDATE|INSERT|DROP)\b/i);
  });

  it('applies on top of the current registry and is idempotent', () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'task_end_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    expect(tables.map((t) => t.name)).toEqual(TABLES);
    expect(() => db.exec(sql)).not.toThrow();
  });

  it('creates the per-repository state and journal tables', () => {
    expect(tableColumns(db, 'task_end_repo_state')).toEqual([
      ['repo_id', 'TEXT', 0, null, 1],
      ['baseline_at', 'INTEGER', 1, null, 0],
      ['main_root', 'TEXT', 0, null, 0],
      ['updated_at', 'INTEGER', 1, null, 0],
    ]);
    expect(tableColumns(db, 'task_end_journal')).toEqual([
      ['repo_id', 'TEXT', 1, null, 1],
      ['task_id', 'TEXT', 1, null, 2],
      ['last_status', 'TEXT', 1, null, 0],
      ['episode', 'INTEGER', 1, '0', 0],
      ['updated_at', 'INTEGER', 1, null, 0],
    ]);
  });

  it('creates the steps table without a free-text message column', () => {
    const columns = tableColumns(db, 'task_end_steps');
    expect(columns.map((c) => c[0])).toEqual([
      'run_id',
      'step',
      'subject',
      'ordinal',
      'state',
      'reason',
      'extra_json',
      'attempts',
      'requested_at',
      'updated_at',
    ]);
    expect(columns.map((c) => c[0])).not.toContain('message');
    expect(columns.filter((c) => c[4] > 0).map((c) => c[0])).toEqual(['run_id', 'step', 'subject']);
  });

  it('creates the listed indexes', () => {
    expect(indexColumns(db, 'idx_task_end_transitions_task_episode')).toEqual([
      'repo_id',
      'task_id',
      'episode',
    ]);
    expect(indexColumns(db, 'idx_task_end_runs_state_queue')).toEqual(['state', 'queue_seq']);
    expect(indexColumns(db, 'idx_task_end_runs_task_created')).toEqual([
      'repo_id',
      'task_id',
      'created_at DESC',
    ]);
    expect(indexColumns(db, 'idx_task_end_steps_step_state')).toEqual(['step', 'state']);
  });

  it('accepts a run whose main root is NULL', () => {
    insertTransition('t1');
    insertRun('r1', 't1', 1, null);
    expect(db.prepare("SELECT main_root FROM task_end_runs WHERE run_id = 'r1'").get()).toEqual({
      main_root: null,
    });
    db.prepare(
      "INSERT INTO task_end_repo_state (repo_id, baseline_at, main_root, updated_at) VALUES ('repo-1', 1, NULL, 1)",
    ).run();
    expect(db.prepare('SELECT main_root FROM task_end_repo_state').get()).toEqual({ main_root: null });
  });

  it('rejects a second run for the same task episode', () => {
    insertTransition('t1');
    insertTransition('t2');
    insertRun('r1', 't1', 1);
    expect(() => insertRun('r2', 't2', 1)).toThrow(/UNIQUE/);
    expect(() => insertRun('r3', 't2', 2)).not.toThrow();
  });

  it('rejects a second run for the same transition', () => {
    insertTransition('t1');
    insertRun('r1', 't1', 1);
    expect(() => insertRun('r2', 't1', 2)).toThrow(/UNIQUE/);
  });

  it('rejects unknown states, sources, statuses, step kinds and no-run reasons', () => {
    insertTransition('t1');
    insertRun('r1', 't1');
    expect(() =>
      db.prepare("UPDATE task_end_runs SET state = 'removed' WHERE run_id = 'r1'").run(),
    ).toThrow(/CHECK/);
    expect(() =>
      db
        .prepare(
          `INSERT INTO task_end_steps (run_id, step, subject, ordinal, state, updated_at)
           VALUES ('r1', 'harvest', '', 1, 'awaiting-confirmation', 1)`,
        )
        .run(),
    ).toThrow(/CHECK/);
    expect(() =>
      db
        .prepare(
          `INSERT INTO task_end_steps (run_id, step, subject, ordinal, state, updated_at)
           VALUES ('r1', 'archive', '', 4, 'pending', 1)`,
        )
        .run(),
    ).toThrow(/CHECK/);
    expect(() =>
      db
        .prepare(
          `INSERT INTO task_end_journal (repo_id, task_id, last_status, updated_at)
           VALUES ('repo-1', 'TASK_1', 'archived', 1)`,
        )
        .run(),
    ).toThrow(/CHECK/);
    expect(() =>
      db
        .prepare(
          `INSERT INTO task_end_transitions
             (transition_id, repo_id, task_id, episode, to_status, source, seen_root, observed_at)
           VALUES ('t9', 'repo-1', 'TASK_1', 1, 'done', 'poll', '/repo', 1)`,
        )
        .run(),
    ).toThrow(/CHECK/);
    expect(() =>
      db
        .prepare(
          `INSERT INTO task_end_transitions
             (transition_id, repo_id, task_id, episode, to_status, source, seen_root, observed_at, no_run_reason)
           VALUES ('t9', 'repo-1', 'TASK_1', 1, 'done', 'baseline', '/repo', 1, 'duplicate')`,
        )
        .run(),
    ).toThrow(/CHECK/);
  });

  it('stores the four placeholder steps of a run', () => {
    insertTransition('t1');
    insertRun('r1', 't1');
    const insertStep = db.prepare(
      `INSERT INTO task_end_steps (run_id, step, subject, ordinal, state, updated_at)
       VALUES ('r1', ?, '', ?, 'pending', 1000)`,
    );
    ['close-curate', 'harvest', 'dispose', 'index'].forEach((step, ordinal) =>
      insertStep.run(step, ordinal),
    );
    expect(
      db.prepare("SELECT step, attempts FROM task_end_steps WHERE run_id = 'r1' ORDER BY ordinal").all(),
    ).toEqual([
      { step: 'close-curate', attempts: 0 },
      { step: 'harvest', attempts: 0 },
      { step: 'dispose', attempts: 0 },
      { step: 'index', attempts: 0 },
    ]);
    expect(() => insertStep.run('harvest', 1)).toThrow(/UNIQUE|PRIMARY/);
  });
});

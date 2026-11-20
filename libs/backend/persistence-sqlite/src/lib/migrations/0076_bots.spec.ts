import 'reflect-metadata';
import { sql } from './0076_bots';
import { MIGRATIONS } from './index';

type Param = string | number | null | Uint8Array;

interface DatabaseShape {
  exec(statement: string): void;
  prepare(statement: string): {
    run(...params: Param[]): unknown;
    get(...params: Param[]): unknown;
    all(...params: Param[]): unknown;
  };
  close(): void;
}

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';
const IMG = '33333333-3333-4333-8333-333333333333';
const MAX_BYTES = 2 * 1024 * 1024;

function newDatabase(): DatabaseShape {
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (file: string) => DatabaseShape;
  };
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

function openAt(maxVersion: number): DatabaseShape {
  const db = newDatabase();
  for (const migration of MIGRATIONS.filter((m) => m.version <= maxVersion)) {
    if (migration.sql) db.exec(migration.sql);
  }
  return db;
}

function tableNames(db: DatabaseShape): string[] {
  return (
    db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all() as Array<{ name: string }>
  ).map((row) => row.name);
}

function indexNames(db: DatabaseShape, table: string): string[] {
  return (
    db.prepare(`PRAGMA index_list(${table})`).all() as Array<{ name: string }>
  ).map((row) => row.name);
}

function insertRow(
  db: DatabaseShape,
  table: string,
  row: Record<string, Param>,
): void {
  const columns = Object.keys(row);
  const marks = columns.map(() => '?').join(', ');
  db.prepare(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${marks})`,
  ).run(...columns.map((column) => row[column] ?? null));
}

function insertBot(
  db: DatabaseShape,
  id: string,
  overrides: Record<string, Param> = {},
): void {
  insertRow(db, 'bots', {
    id,
    schema_version: 2,
    revision: 1,
    definition_json: '{}',
    scope_kind: 'workspace',
    workspace_root: '/ws',
    name: 'Bot',
    enabled: 1,
    created_at: 1,
    updated_at: 1,
    archived_at: null,
    deleted_at: null,
    retain_memory: null,
    retain_history: null,
    ...overrides,
  });
}

function insertImage(
  db: DatabaseShape,
  overrides: Record<string, Param> = {},
): void {
  insertRow(db, 'bot_avatar_images', {
    image_id: IMG,
    media_type: 'image/png',
    bytes: new Uint8Array([1, 2, 3]),
    scope_kind: 'workspace',
    workspace_root: '/ws',
    owner_bot_id: null,
    created_at: 1,
    expires_at: 100,
    ...overrides,
  });
}

function countOf(db: DatabaseShape, table: string): { n: number } {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {
    n: number;
  };
}

describe('migration 0076_bots', () => {
  it('registers after 0075 as the latest static migration', () => {
    const previous = MIGRATIONS.findIndex((m) => m.version === 75);
    expect(MIGRATIONS[previous + 1]).toEqual({
      version: 76,
      name: '0076_bots',
      sql,
    });
    expect(MIGRATIONS[MIGRATIONS.length - 1]?.version).toBe(76);
    expect(sql).not.toContain('${');
    expect(sql).not.toMatch(/^\s*(DELETE|UPDATE|INSERT|DROP)\b/im);
  });

  it('migrates a version 75 database and an empty database', () => {
    const expected = ['bots', 'bot_revisions', 'bot_avatar_images'];
    const prior = openAt(75);
    try {
      expect(tableNames(prior)).not.toContain('bots');
      prior.exec(sql);
      expect(tableNames(prior)).toEqual(expect.arrayContaining(expected));
    } finally {
      prior.close();
    }
    const empty = newDatabase();
    try {
      empty.exec(sql);
      expect(tableNames(empty)).toEqual(expect.arrayContaining(expected));
    } finally {
      empty.close();
    }
  });

  it('preserves existing data in other tables', () => {
    const db = openAt(75);
    try {
      db.prepare(
        `INSERT INTO skill_task_grades
          (task_id, subject_kind, subject_slug, attribution_key, run_id, verdict,
           evidence_source, workspace_root, graded_at)
          VALUES ('TASK_A', 'agent', 'x', 'run:r', 'r', 'pass', 'spec:A', '/ws', 10)`,
      ).run();
      db.exec(sql);
      expect(countOf(db, 'skill_task_grades')).toEqual({ n: 1 });
    } finally {
      db.close();
    }
  });

  it('creates the planned indexes', () => {
    const db = openAt(76);
    try {
      expect(indexNames(db, 'bots')).toContain('idx_bots_scope_list');
      expect(indexNames(db, 'bot_avatar_images')).toEqual(
        expect.arrayContaining([
          'idx_bot_avatar_images_staging',
          'idx_bot_avatar_images_owner',
        ]),
      );
      const columns = (
        db.prepare(`PRAGMA index_info(idx_bots_scope_list)`).all() as Array<{
          name: string;
        }>
      ).map((c) => c.name);
      expect(columns).toEqual([
        'scope_kind',
        'workspace_root',
        'archived_at',
        'deleted_at',
        'name',
        'id',
      ]);
    } finally {
      db.close();
    }
  });

  it('accepts valid bots and rejects invalid bot rows', () => {
    const db = openAt(76);
    try {
      insertBot(db, ID_A);
      insertBot(db, ID_B, { scope_kind: 'user', workspace_root: null });
      expect(() => insertBot(db, ID_A)).toThrow();
      const bad: Array<Record<string, Param>> = [
        { id: null },
        { revision: 0 },
        { enabled: 2 },
        { scope_kind: 'global' },
        { scope_kind: 'user', workspace_root: '/ws' },
        { scope_kind: 'workspace', workspace_root: null },
        { definition_json: null },
        { name: null },
        { retain_memory: 1 },
        { archived_at: 5, enabled: 1 },
        { deleted_at: 5, definition_json: null, enabled: 0 },
        {
          deleted_at: 5,
          definition_json: '{}',
          enabled: 0,
          retain_memory: 1,
          retain_history: 1,
        },
      ];
      bad.forEach((overrides, index) => {
        const id = `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`;
        expect(() => insertBot(db, id, overrides)).toThrow();
      });
      expect(() => insertBot(db, 'short-id')).toThrow();
      expect(countOf(db, 'bots')).toEqual({ n: 2 });
    } finally {
      db.close();
    }
  });

  it('accepts a tombstone with both retention choices and a null name', () => {
    const db = openAt(76);
    try {
      insertBot(db, ID_A, {
        deleted_at: 9,
        definition_json: null,
        name: null,
        enabled: 0,
        retain_memory: 1,
        retain_history: 0,
      });
      expect(
        db.prepare(`SELECT retain_memory, retain_history FROM bots`).get(),
      ).toEqual({ retain_memory: 1, retain_history: 0 });
    } finally {
      db.close();
    }
  });

  it('keeps revisions unique and restricts deletion of a bot with revisions', () => {
    const db = openAt(76);
    try {
      insertBot(db, ID_A);
      const add = (revision: number, botId: string = ID_A): void =>
        insertRow(db, 'bot_revisions', {
          bot_id: botId,
          revision,
          schema_version: 2,
          definition_json: '{}',
          created_at: 1,
        });
      add(1);
      add(2);
      expect(() => add(2)).toThrow();
      expect(() => add(0)).toThrow();
      expect(() => add(1, ID_B)).toThrow();
      expect(() =>
        db.prepare(`DELETE FROM bots WHERE id = ?`).run(ID_A),
      ).toThrow();
      db.prepare(`DELETE FROM bot_revisions WHERE bot_id = ?`).run(ID_A);
      db.prepare(`DELETE FROM bots WHERE id = ?`).run(ID_A);
      expect(countOf(db, 'bots')).toEqual({ n: 0 });
    } finally {
      db.close();
    }
  });

  it('enforces avatar media, size, scope and staging or ownership rules', () => {
    const db = openAt(76);
    try {
      insertBot(db, ID_A);
      insertImage(db);
      insertImage(db, {
        image_id: '44444444-4444-4444-8444-444444444444',
        owner_bot_id: ID_A,
        expires_at: null,
      });
      const bad: Array<Record<string, Param>> = [
        { image_id: null },
        { bytes: 'x'.repeat(16) },
        { media_type: 'image/gif' },
        { media_type: 'image/svg+xml' },
        { bytes: new Uint8Array(0) },
        { bytes: new Uint8Array(MAX_BYTES + 1) },
        { scope_kind: 'user', workspace_root: '/ws' },
        { scope_kind: 'workspace', workspace_root: null },
        { owner_bot_id: null, expires_at: null },
        { owner_bot_id: ID_A, expires_at: 100 },
        { owner_bot_id: ID_B, expires_at: null },
      ];
      bad.forEach((overrides, index) => {
        const id = `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, '0')}`;
        expect(() => insertImage(db, { image_id: id, ...overrides })).toThrow();
      });
      insertImage(db, {
        image_id: '55555555-5555-4555-8555-555555555555',
        bytes: new Uint8Array(MAX_BYTES),
      });
      expect(() =>
        db.prepare(`DELETE FROM bots WHERE id = ?`).run(ID_A),
      ).toThrow();
    } finally {
      db.close();
    }
  });

  it('rolls back every table when the migration transaction aborts', () => {
    const db = openAt(75);
    try {
      db.exec('BEGIN IMMEDIATE');
      db.exec(sql);
      expect(tableNames(db)).toContain('bots');
      db.exec('ROLLBACK');
      const names = tableNames(db);
      expect(names).not.toContain('bots');
      expect(names).not.toContain('bot_revisions');
      expect(names).not.toContain('bot_avatar_images');
    } finally {
      db.close();
    }
  });
});

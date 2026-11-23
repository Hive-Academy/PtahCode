import 'reflect-metadata';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { sql } from './0077_code_symbol_files';
import { MIGRATIONS } from './index';
import { SqliteConnectionService } from '../sqlite-connection.service';
import { createMockLogger } from '../testing/mock-logger';

interface DatabaseShape {
  exec(statement: string): void;
  prepare(statement: string): {
    run(...params: (string | number | null)[]): unknown;
    get(...params: (string | number | null)[]): unknown;
    all(...params: (string | number | null)[]): unknown;
  };
  close(): void;
}

/** Opens an in-memory DB with every migration before 0077 already applied. */
function openAt76(): DatabaseShape {
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (file: string) => DatabaseShape;
  };
  const db = new DatabaseSync(':memory:');
  for (const migration of MIGRATIONS.filter((entry) => entry.version < 77)) {
    if (migration.sql) db.exec(migration.sql);
  }
  return db;
}

interface TableInfoRow {
  name: string;
  pk: number;
}

function tableInfo(db: DatabaseShape, table: string): TableInfoRow[] {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string; pk: number }>;
}

function columnNames(db: DatabaseShape, table: string): string[] {
  return tableInfo(db, table).map((row) => row.name);
}

function primaryKeyColumns(db: DatabaseShape, table: string): string[] {
  return tableInfo(db, table)
    .filter((row) => row.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((row) => row.name);
}

function indexNames(db: DatabaseShape, table: string): string[] {
  return (
    db.prepare(`PRAGMA index_list(${table})`).all() as Array<{ name: string }>
  ).map((row) => row.name);
}

describe('migration 0077_code_symbol_files', () => {
  it('registers after 0076 as the latest static migration', () => {
    const previous = MIGRATIONS.findIndex(
      (migration) => migration.version === 76,
    );
    expect(MIGRATIONS[previous + 1]).toEqual({
      version: 77,
      name: '0077_code_symbol_files',
      sql,
    });
    expect(MIGRATIONS.findIndex((m) => m.version === 77)).toBe(76);
    expect(sql).not.toContain('${');
    expect(sql).not.toMatch(/\b(DELETE|UPDATE|INSERT|DROP)\b/i);
  });

  it('upgrades a 0076 database with an existing symbol row; FTS stays intact', () => {
    const db = openAt76();
    try {
      db.prepare(
        `INSERT INTO code_symbols
          (id, workspace_root, file_path, kind, symbol_name, subject, text,
           token_count, created_at, updated_at)
         VALUES ('sym-old', '/ws', 'src/a.ts', 'function', 'doWork',
                 'code:/ws:src/a.ts:doWork', 'doWork reindexes the file quickly',
                 5, 1, 1)`,
      ).run();
      const oldRow = db
        .prepare(`SELECT rowid FROM code_symbols WHERE id = 'sym-old'`)
        .get() as { rowid: number };

      db.exec(sql);

      expect(columnNames(db, 'code_symbol_files')).toEqual([
        'workspace_root',
        'file_path',
        'fingerprint',
        'updated_at',
      ]);
      expect(primaryKeyColumns(db, 'code_symbol_files')).toEqual([
        'workspace_root',
        'file_path',
      ]);
      expect(columnNames(db, 'code_index_roots')).toEqual([
        'workspace_root',
        'validated_at',
      ]);
      expect(primaryKeyColumns(db, 'code_index_roots')).toEqual([
        'workspace_root',
      ]);
      expect(columnNames(db, 'code_symbols')).toContain('text_hash');
      expect(indexNames(db, 'code_symbols')).toContain(
        'idx_code_symbols_text_hash',
      );

      expect(
        db
          .prepare(`SELECT text_hash FROM code_symbols WHERE id = 'sym-old'`)
          .get(),
      ).toEqual({ text_hash: null });

      expect(
        db
          .prepare(
            `SELECT rowid FROM code_symbols_fts WHERE code_symbols_fts MATCH 'quickly'`,
          )
          .all(),
      ).toEqual([{ rowid: oldRow.rowid }]);
    } finally {
      db.close();
    }
  });

  it('rejects a duplicate (root, path) and upserts via ON CONFLICT DO UPDATE', () => {
    const db = openAt76();
    try {
      db.exec(sql);
      db.prepare(
        `INSERT INTO code_symbol_files (workspace_root, file_path, fingerprint, updated_at)
         VALUES ('/ws', 'src/a.ts', 'fp-1', 1)`,
      ).run();
      db.prepare(
        `INSERT INTO code_index_roots (workspace_root, validated_at)
         VALUES ('/ws', 1)`,
      ).run();

      expect(() =>
        db
          .prepare(
            `INSERT INTO code_symbol_files (workspace_root, file_path, fingerprint, updated_at)
             VALUES ('/ws', 'src/a.ts', 'fp-dupe', 2)`,
          )
          .run(),
      ).toThrow();
      expect(() =>
        db
          .prepare(
            `INSERT INTO code_index_roots (workspace_root, validated_at)
             VALUES ('/ws', 2)`,
          )
          .run(),
      ).toThrow();

      db.prepare(
        `INSERT INTO code_symbol_files (workspace_root, file_path, fingerprint, updated_at)
         VALUES ('/ws', 'src/a.ts', 'fp-2', 3)
         ON CONFLICT (workspace_root, file_path)
         DO UPDATE SET fingerprint = excluded.fingerprint, updated_at = excluded.updated_at`,
      ).run();
      db.prepare(
        `INSERT INTO code_index_roots (workspace_root, validated_at)
         VALUES ('/ws', 3)
         ON CONFLICT (workspace_root)
         DO UPDATE SET validated_at = excluded.validated_at`,
      ).run();

      expect(
        db
          .prepare(
            `SELECT workspace_root, file_path, fingerprint, updated_at
             FROM code_symbol_files WHERE workspace_root = '/ws' AND file_path = 'src/a.ts'`,
          )
          .get(),
      ).toEqual({
        workspace_root: '/ws',
        file_path: 'src/a.ts',
        fingerprint: 'fp-2',
        updated_at: 3,
      });
      expect(
        db
          .prepare(
            `SELECT workspace_root, validated_at FROM code_index_roots
             WHERE workspace_root = '/ws'`,
          )
          .all(),
      ).toEqual([{ workspace_root: '/ws', validated_at: 3 }]);
    } finally {
      db.close();
    }
  });
});

describe('migration 0077_code_symbol_files — real runner (skipped without native)', () => {
  let nativeAvailable = false;
  let nativeProbeError: string | null = null;
  try {
    require.resolve('better-sqlite3');
    const Database = require('better-sqlite3') as new (file: string) => {
      close(): void;
    };
    const probe = new Database(':memory:');
    probe.close();
    nativeAvailable = true;
  } catch (err: unknown) {
    nativeProbeError = err instanceof Error ? err.message : String(err);
  }
  if (!nativeAvailable && nativeProbeError) {
    process.stderr.write(
      `[0077-real-spec] native probe failed; cases skipped: ${nativeProbeError}\n`,
    );
  }

  const maybe = nativeAvailable ? it : it.skip;
  const tempDirs: string[] = [];

  function makeTempDbPath(): string {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'ptah-0077-code-symbol-files-'),
    );
    tempDirs.push(dir);
    return path.join(dir, 'ptah.db');
  }

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  maybe(
    'applies through the runner: user_version 77, recorded once, reopen applies nothing',
    async () => {
      const dbPath = makeTempDbPath();
      const service = new SqliteConnectionService(dbPath, createMockLogger());
      await service.openAndMigrate();

      expect(
        service.db.prepare('PRAGMA user_version').get(),
      ).toEqual({ user_version: 77 });
      expect(
        service.db
          .prepare(
            `SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 77`,
          )
          .get(),
      ).toEqual({ n: 1 });
      const recorded = service.db
        .prepare(`SELECT COUNT(*) AS n FROM schema_migrations`)
        .get() as { n: number };

      service.close();

      const reopened = new SqliteConnectionService(dbPath, createMockLogger());
      await reopened.openAndMigrate();

      expect(
        reopened.db.prepare('PRAGMA user_version').get(),
      ).toEqual({ user_version: 77 });
      expect(
        reopened.db
          .prepare(`SELECT COUNT(*) AS n FROM schema_migrations`)
          .get(),
      ).toEqual(recorded);

      reopened.close();
    },
  );

  maybe(
    'opens and migrates with vec resolvers disabled; tables and column exist',
    async () => {
      const service = new SqliteConnectionService(
        makeTempDbPath(),
        createMockLogger(),
      );
      service.configure({
        vecPathResolver: null,
        vecPathPlatformResolver: null,
        vecPathFallbackResolver: null,
      });
      await service.openAndMigrate();

      expect(
        service.db
          .prepare(
            `SELECT name FROM sqlite_master
             WHERE type = 'table' AND name IN ('code_symbol_files', 'code_index_roots')
             ORDER BY name`,
          )
          .all(),
      ).toEqual([{ name: 'code_index_roots' }, { name: 'code_symbol_files' }]);
      expect(
        (
          service.db
            .prepare(`PRAGMA table_info(code_symbols)`)
            .all() as Array<{ name: string }>
        ).map((row) => row.name),
      ).toContain('text_hash');

      service.close();
    },
  );

  maybe(
    'two connections on the same file both migrate and share records',
    async () => {
      const dbPath = makeTempDbPath();
      const writer = new SqliteConnectionService(dbPath, createMockLogger());
      const reader = new SqliteConnectionService(dbPath, createMockLogger());

      await writer.openAndMigrate();
      await reader.openAndMigrate();

      writer.db
        .prepare(
          `INSERT INTO code_symbol_files (workspace_root, file_path, fingerprint, updated_at)
           VALUES ('/ws', 'src/shared.ts', 'fp-shared', 1)`,
        )
        .run();

      expect(
        reader.db
          .prepare(
            `SELECT workspace_root, file_path, fingerprint, updated_at
             FROM code_symbol_files
             WHERE workspace_root = '/ws' AND file_path = 'src/shared.ts'`,
          )
          .get(),
      ).toEqual({
        workspace_root: '/ws',
        file_path: 'src/shared.ts',
        fingerprint: 'fp-shared',
        updated_at: 1,
      });

      writer.close();
      reader.close();
    },
  );
});

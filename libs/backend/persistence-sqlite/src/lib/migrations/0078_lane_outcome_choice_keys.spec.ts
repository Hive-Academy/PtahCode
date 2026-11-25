import 'reflect-metadata';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { sql } from './0078_lane_outcome_choice_keys';
import { MIGRATIONS } from './index';
import {
  defaultBetterSqlite3Factory,
  SqliteConnectionService,
} from '../sqlite-connection.service';
import { SqliteMigrationRunner } from '../migration-runner';
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

interface TableInfoRow {
  name: string;
  type: string;
  notnull: number;
}

const NEW_COLUMNS = [
  { name: 'model_source', type: 'TEXT' },
  { name: 'resolved_model', type: 'TEXT' },
  { name: 'resolved_model_provenance', type: 'TEXT' },
  { name: 'requested_effort', type: 'TEXT' },
  { name: 'effort', type: 'TEXT' },
  { name: 'effort_source', type: 'TEXT' },
  { name: 'effort_provenance', type: 'TEXT' },
  { name: 'effort_disposition', type: 'TEXT' },
  { name: 'resolved_effort', type: 'TEXT' },
  { name: 'resolved_effort_provenance', type: 'TEXT' },
  { name: 'routed_model', type: 'TEXT' },
  { name: 'routed_effort', type: 'TEXT' },
  { name: 'decision_model', type: 'TEXT' },
  { name: 'proposal_confidence', type: 'REAL' },
] as const;

const NEW_COLUMN_NAMES = NEW_COLUMNS.map((col) => col.name);

const NULL_CHOICE_KEYS = Object.fromEntries(
  NEW_COLUMN_NAMES.map((name) => [name, null]),
);

/** Opens an in-memory DB with every migration before 0078 already applied. */
function openAt77(): DatabaseShape {
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (file: string) => DatabaseShape;
  };
  const db = new DatabaseSync(':memory:');
  for (const migration of MIGRATIONS.filter((entry) => entry.version < 78)) {
    if (migration.sql) db.exec(migration.sql);
  }
  return db;
}

function tableInfo(db: DatabaseShape, table: string): TableInfoRow[] {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as TableInfoRow[];
}

describe('migration 0078_lane_outcome_choice_keys', () => {
  it('registers after 0077 as a static migration without data rewrites', () => {
    const previous = MIGRATIONS.findIndex(
      (migration) => migration.version === 77,
    );
    expect(MIGRATIONS[previous + 1]).toEqual({
      version: 78,
      name: '0078_lane_outcome_choice_keys',
      sql,
    });
    expect(MIGRATIONS.findIndex((m) => m.version === 78)).toBe(77);
    expect(sql).not.toContain('${');
    expect(sql).not.toMatch(/\b(DELETE|UPDATE|INSERT|DROP)\b/i);
  });

  it('adds 14 nullable columns and keeps pre-0078 rows unchanged with NULL values (FA2.4)', () => {
    const db = openAt77();
    try {
      db.prepare(
        `INSERT INTO lane_outcome_records
          (run_id, executor_kind, lane_id, agent_id, family, model, role,
           task_kind, task_kind_source, phase_kind, verdict, routing_source,
           ended_at, created_at, updated_at)
         VALUES ('pre-0078', 'cli', 'claude-code', 'agent-1', 'claude',
                 'claude-sonnet-4-6', 'backend-developer', 'implement',
                 'explicit', 'implement', 'delivered', 'ranking', 100, 100, 100)`,
      ).run();

      db.exec(sql);

      const infoByName = new Map(
        tableInfo(db, 'lane_outcome_records').map((col) => [col.name, col]),
      );
      for (const expected of NEW_COLUMNS) {
        const col = infoByName.get(expected.name);
        expect(col).toBeDefined();
        expect(col?.type).toBe(expected.type);
        expect(col?.notnull).toBe(0);
      }

      const row = db
        .prepare(
          `SELECT run_id, model, verdict, ${NEW_COLUMN_NAMES.join(', ')}
           FROM lane_outcome_records WHERE run_id = 'pre-0078'`,
        )
        .get();
      expect(row).toEqual({
        run_id: 'pre-0078',
        model: 'claude-sonnet-4-6',
        verdict: 'delivered',
        ...NULL_CHOICE_KEYS,
      });
    } finally {
      db.close();
    }
  });

  it('stores and reads back all 14 choice-key columns on new rows', () => {
    const db = openAt77();
    try {
      db.exec(sql);
      db.prepare(
        `INSERT INTO lane_outcome_records
          (run_id, executor_kind, lane_id, agent_id, family, model, verdict,
           ended_at, created_at, updated_at,
           model_source, resolved_model, resolved_model_provenance,
           requested_effort, effort, effort_source, effort_provenance,
           effort_disposition, resolved_effort, resolved_effort_provenance,
           routed_model, routed_effort, decision_model, proposal_confidence)
         VALUES ('post-0078', 'cli', 'codex', 'agent-2', 'codex', 'o3',
                 'delivered', 200, 200, 200,
                 'request', 'o3-2025-04-16', 'native',
                 'high', 'high', 'role-default', 'native',
                 'native-match', 'high', 'native',
                 'o3', 'high', 'openai:gpt-5-mini', 0.85)`,
      ).run();

      const row = db
        .prepare(
          `SELECT ${NEW_COLUMN_NAMES.join(', ')}
           FROM lane_outcome_records WHERE run_id = 'post-0078'`,
        )
        .get();
      expect(row).toEqual({
        model_source: 'request',
        resolved_model: 'o3-2025-04-16',
        resolved_model_provenance: 'native',
        requested_effort: 'high',
        effort: 'high',
        effort_source: 'role-default',
        effort_provenance: 'native',
        effort_disposition: 'native-match',
        resolved_effort: 'high',
        resolved_effort_provenance: 'native',
        routed_model: 'o3',
        routed_effort: 'high',
        decision_model: 'openai:gpt-5-mini',
        proposal_confidence: 0.85,
      });
    } finally {
      db.close();
    }
  });
});

describe('migration 0078_lane_outcome_choice_keys — real runner (skipped without native)', () => {
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
      `[0078-real-spec] native probe failed; cases skipped: ${nativeProbeError}\n`,
    );
  }

  const maybe = nativeAvailable ? it : it.skip;
  const tempDirs: string[] = [];

  function makeTempDbPath(): string {
    const dir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'ptah-0078-lane-outcome-choice-keys-'),
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
    'applies through SqliteConnectionService: recorded once, reopen is a no-op',
    async () => {
      const dbPath = makeTempDbPath();
      const service = new SqliteConnectionService(dbPath, createMockLogger());
      await service.openAndMigrate();

      const versionRow = service.db
        .prepare('PRAGMA user_version')
        .get() as { user_version: number };
      expect(versionRow.user_version).toBeGreaterThanOrEqual(78);
      expect(
        service.db
          .prepare(
            `SELECT COUNT(*) AS n FROM schema_migrations WHERE version = 78`,
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
        reopened.db
          .prepare(`SELECT COUNT(*) AS n FROM schema_migrations`)
          .get(),
      ).toEqual(recorded);

      reopened.close();
    },
  );

  maybe(
    'upgrades a 0077 database through SqliteMigrationRunner with pre-0078 row intact',
    async () => {
      const dbPath = makeTempDbPath();
      const archiveRoot = path.join(path.dirname(dbPath), 'archive');
      const options = { vecExtensionLoaded: false };
      const through77 = MIGRATIONS.filter((entry) => entry.version <= 77);
      const through78 = MIGRATIONS.filter((entry) => entry.version <= 78);
      const db = defaultBetterSqlite3Factory(dbPath);
      try {
        await new SqliteMigrationRunner(
          db,
          createMockLogger(),
          undefined,
          archiveRoot,
        ).applyAll(through77, options);

        db.prepare(
          `INSERT INTO lane_outcome_records
            (run_id, executor_kind, lane_id, agent_id, model, verdict,
             ended_at, created_at, updated_at)
           VALUES ('runner-old', 'subagent', 'subagent', 'agent-old',
                   'lane-default', 'unverified', 10, 10, 10)`,
        ).run();

        const result = await new SqliteMigrationRunner(
          db,
          createMockLogger(),
          undefined,
          archiveRoot,
        ).applyAll(through78, options);

        expect(result.appliedVersions).toEqual([78]);
        expect(result.finalVersion).toBe(78);
        expect(db.prepare('PRAGMA user_version').get()).toEqual({
          user_version: 78,
        });
        expect(
          db
            .prepare(
              `SELECT ${NEW_COLUMN_NAMES.join(', ')}
               FROM lane_outcome_records WHERE run_id = 'runner-old'`,
            )
            .get(),
        ).toEqual(NULL_CHOICE_KEYS);
      } finally {
        db.close();
      }
    },
  );
});

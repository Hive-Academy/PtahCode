# Batch B2A — 0077_code_symbol_files migration spec

Status: complete

## Deliverable

Spec file: `libs/backend/persistence-sqlite/src/lib/migrations/0077_code_symbol_files.spec.ts`

## Cases written (6)

1. **Registration** — `MIGRATIONS.findIndex((m) => m.version === 77)` is 76
   (directly after 76, and index equals version minus 1, so registered once);
   `MIGRATIONS[76]` equals `{ version: 77, name: '0077_code_symbol_files', sql }`;
   sql is static (no `${`) and contains no DML (`DELETE|UPDATE|INSERT|DROP`).
2. **Upgrade from 0076 with existing rows** — apply migrations 1..76 with
   `node:sqlite` in-memory, insert a `code_symbols` row (0013 columns: id,
   workspace_root, file_path, kind, symbol_name, subject, text, token_count,
   created_at, updated_at) so the FTS trigger indexes it, then exec 0077.
   Asserts: `code_symbol_files` columns exactly
   `[workspace_root, file_path, fingerprint, updated_at]` with composite PK
   `(workspace_root, file_path)` (PRAGMA table_info pk order);
   `code_index_roots` columns `[workspace_root, validated_at]` with PK
   `workspace_root`; `code_symbols` gains `text_hash`; index
   `idx_code_symbols_text_hash` exists (PRAGMA index_list); the old row has
   `text_hash IS NULL`; `code_symbols_fts MATCH 'quickly'` still returns the
   old rowid.
3. **Records** — a duplicate `(workspace_root, file_path)` insert into
   `code_symbol_files` throws; a duplicate root insert into `code_index_roots`
   throws; `INSERT ... ON CONFLICT ... DO UPDATE` updates both records in place
   (new fingerprint and timestamps readable, single row).
4. **Real runner (native-gated)** — `SqliteConnectionService.openAndMigrate()`
   on a temp file: `PRAGMA user_version` = 77, `schema_migrations` has version
   77 exactly once; close; reopen on the same file migrates without error,
   `user_version` still 77 and the `schema_migrations` row count is unchanged
   (nothing re-applied).
5. **Vec disabled (native-gated)** — `configure({ vecPathResolver: null,
   vecPathPlatformResolver: null, vecPathFallbackResolver: null })` before
   open; `openAndMigrate()` succeeds and both tables exist (sqlite_master) and
   `code_symbols.text_hash` exists.
6. **Two connections (native-gated)** — two `SqliteConnectionService` instances
   on the same temp file both open and migrate without error (Electron and CLI
   share one DB file); a `code_symbol_files` row written by one is read by the
   other with identical values.

Temp dirs are tracked and removed with `fs.rmSync` in `afterEach`.

## Commands run and results

| Command | Result |
| --- | --- |
| `npx jest --config libs/backend/persistence-sqlite/jest.config.ts --runInBand --coverage=false --runTestsByPath libs/backend/persistence-sqlite/src/lib/migrations/0077_code_symbol_files.spec.ts` | `Tests: 6 passed, 6 total` (log: `.ptah/tmp/b2a-jest.log`) |
| `npx tsc --noEmit --project libs/backend/persistence-sqlite/tsconfig.spec.json` | exit 0, no errors (log: `.ptah/tmp/b2a-tsc.log`) |
| `npx eslint libs/backend/persistence-sqlite/src/lib/migrations/0077_code_symbol_files.spec.ts` | exit 0, 0 errors, 0 warnings (log: `.ptah/tmp/b2a-eslint.log`) |

No `npm run verify`, `nx`, build, serve, e2e or workspace-wide check was run,
per the lane rules.

## Decisions

- **"Nothing re-applied" evidence (case 4).** The first draft asserted
  `reopened.lastMigrationVersion === 0`. That failed: the runner sets
  `finalVersion = Math.max(dbMaxVersion, ...appliedNow, 0)`
  (`migration-runner.ts:157`), so `lastAppliedVersion` reports the database
  maximum (77) even when this run applied nothing. Kept evidence: no error,
  `user_version` still 77, and `schema_migrations` row count unchanged across
  the reopen. Options were dropping the assertion or weakening to `<= 77`;
  the count check is the direct proof, so the getter assertion was removed.
  Reversible: one line.
- **Native gate probes only `better-sqlite3`.** The vec extension is not part
  of what 0077 proves, and case 5 disables vec resolvers, so the gate only
  needs the real SQLite binary. `sqlite-vec` is not probed (unlike
  `sqlite-connection.realbinary.spec.ts`, which asserts `vec_version()`).
- **Case 3 covers both tables.** "Records" is plural; the upsert pattern is the
  intended write path for both `code_symbol_files` and `code_index_roots`,
  so both PK rejections and both upserts are asserted.
- **Static-sql assertions in case 1** mirror the 0076 spec's "registers after"
  shape (`no ${`, no DML); 0077's sql satisfies both.

## Not done

- Nothing. All six required cases are written and pass; the migration itself
  showed no defect.

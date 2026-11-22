import type { SqliteDatabase } from '../sqlite-connection.service';
import { ledgerWorkspaceKey } from './ledger-workspace-key';

type MigrationDb = Pick<SqliteDatabase, 'exec' | 'prepare'>;

interface KeyedTable {
  readonly distinct: string;
  readonly rewrite: string;
}

// Static per-table SQL (no interpolation). DISTINCT reads each table's
// workspace_key index and each UPDATE touches the rows of one legacy key
// through that same index, so the pass costs one statement per distinct
// workspace rather than a rewrite of the whole usage ledger. The indexes stay
// in place and are maintained by the UPDATEs.
const USAGE_TABLES: readonly KeyedTable[] = [
  {
    distinct:
      'SELECT DISTINCT workspace_key AS key FROM session_usage_turns WHERE workspace_key IS NOT NULL',
    rewrite: 'UPDATE session_usage_turns SET workspace_key = ? WHERE workspace_key = ?',
  },
  {
    distinct:
      'SELECT DISTINCT workspace_key AS key FROM session_stats WHERE workspace_key IS NOT NULL',
    rewrite: 'UPDATE session_stats SET workspace_key = ? WHERE workspace_key = ?',
  },
];

const COVERAGE_ROWS = `SELECT workspace_key AS key, first_captured_at_ms AS first,
  last_captured_at_ms AS last FROM session_usage_coverage`;

const MERGE_COVERAGE = `INSERT INTO session_usage_coverage
  (workspace_key, first_captured_at_ms, last_captured_at_ms) VALUES (?, ?, ?)
  ON CONFLICT (workspace_key) DO UPDATE SET
    first_captured_at_ms = MIN(first_captured_at_ms, excluded.first_captured_at_ms),
    last_captured_at_ms = MAX(last_captured_at_ms, excluded.last_captured_at_ms)`;

/** Stored spellings grouped by the ledger key they fold to. */
function groupByLedgerKey(keys: readonly string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const key of keys) {
    const canonical = ledgerWorkspaceKey(key);
    const group = groups.get(canonical);
    if (group) group.push(key);
    else groups.set(canonical, [key]);
  }
  return groups;
}

/**
 * S0010: fill `sessions.ledger_workspace_key` and rewrite the usage tables'
 * keys to {@link ledgerWorkspaceKey}.
 *
 * Before it, the ledger reads matched `sessions.workspace_key` (platform-core
 * form: real case, native separators) against the folded shared key, so
 * Analytics and the sidebar found no usage on Windows and macOS, and on Linux
 * for any path with an uppercase letter. `sessions.workspace_key` itself is
 * left alone: the session list keeps matching it exactly.
 *
 * Every stored key folds the same way on every host, the way the usage
 * producers have always written theirs, so the sessions key and the usage
 * rows of one folder always agree. On a case-sensitive host two folders that
 * differ only by case therefore share Analytics totals (a documented trade-off,
 * TASK_2026_2302_usage); the session list stays exact. Coverage windows merge
 * to their widest span. A second run changes nothing.
 */
export function rewriteLedgerWorkspaceKeys(db: MigrationDb): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    const fill = db.prepare('UPDATE sessions SET ledger_workspace_key = ? WHERE session_id = ?');
    const sessions = db
      .prepare(`SELECT session_id AS id, workspace_path AS path FROM sessions
        WHERE workspace_path IS NOT NULL AND ledger_workspace_key IS NULL`)
      .all() as { id: string; path: string }[];
    for (const row of sessions) fill.run(ledgerWorkspaceKey(row.path), row.id);

    for (const table of USAGE_TABLES) {
      const rewrite = db.prepare(table.rewrite);
      const keys = (db.prepare(table.distinct).all() as { key: string }[]).map((row) => row.key);
      for (const [canonical, spellings] of groupByLedgerKey(keys)) {
        for (const spelling of spellings) {
          if (spelling !== canonical) rewrite.run(canonical, spelling);
        }
      }
    }

    const coverage = db.prepare(COVERAGE_ROWS).all() as { key: string; first: number; last: number }[];
    const byKey = new Map(coverage.map((row) => [row.key, row]));
    const drop = db.prepare('DELETE FROM session_usage_coverage WHERE workspace_key = ?');
    const merge = db.prepare(MERGE_COVERAGE);
    for (const [canonical, spellings] of groupByLedgerKey([...byKey.keys()])) {
      for (const spelling of spellings) {
        if (spelling === canonical) continue;
        const row = byKey.get(spelling);
        if (!row) continue;
        drop.run(spelling);
        merge.run(canonical, row.first, row.last);
      }
    }
    db.exec('COMMIT');
  } catch (error: unknown) {
    db.exec('ROLLBACK');
    throw error;
  }
}

import type { SqliteDatabase } from '../sqlite-connection.service';
import { ledgerKeyFoldsCase, ledgerWorkspaceKey } from './ledger-workspace-key';

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

/** Stored spellings grouped by the key they are rewritten to. */
function groupByTarget(keys: readonly string[], target: (key: string) => string): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const key of keys) {
    const canonical = target(key);
    const group = groups.get(canonical);
    if (group) group.push(key);
    else groups.set(canonical, [key]);
  }
  return groups;
}

/**
 * The ledger key for a stored legacy key. The old producers lowercased every
 * key, so on a case-sensitive host a lowercase POSIX key may have lost its
 * case: it takes the case-kept key of the one session folder that folds to
 * it, and stays as it is when no session folder or more than one does.
 */
function legacyLedgerKey(
  stored: string,
  platform: NodeJS.Platform,
  sessionKeysByLowercase: ReadonlyMap<string, ReadonlySet<string>>,
): string {
  const key = ledgerWorkspaceKey(stored, platform);
  if (ledgerKeyFoldsCase(stored, platform) || key !== key.toLowerCase()) return key;
  const candidates = sessionKeysByLowercase.get(key);
  return candidates?.size === 1 ? [...candidates][0] : key;
}

/**
 * S0010: fill `sessions.ledger_workspace_key` and rewrite the usage tables'
 * keys to {@link ledgerWorkspaceKey}.
 *
 * Before it, the ledger reads matched `sessions.workspace_key` (platform-core
 * form: real case, native separators) against the lowercased shared key the
 * producers wrote, so Analytics and the sidebar found no usage on Windows and
 * macOS, and on Linux for any path with an uppercase letter.
 * `sessions.workspace_key` itself is left alone: the session list keeps
 * matching it exactly.
 *
 * Every stored key goes through {@link ledgerWorkspaceKey}: Windows keys
 * (drive letter or UNC prefix, or any key on a Windows host) fold, every key
 * folds case on a macOS host, and a backslash in a POSIX key stays a filename
 * character. On a case-sensitive host POSIX keys keep their case, so two
 * folders that differ only by case stay apart. Legacy usage keys the old
 * producers had already lowercased cannot regain their case on their own:
 * each takes the case of the single session folder that folds to it, and
 * stays lowercase when none or several do (those rows then match only a
 * lowercase folder, or, for rows of a session with a sessions row, the read
 * join on that row's key). Coverage windows that meet on one key merge to
 * their widest span. A second run changes nothing.
 */
export function rewriteLedgerWorkspaceKeys(
  db: MigrationDb,
  platform: NodeJS.Platform = process.platform,
): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    const fill = db.prepare('UPDATE sessions SET ledger_workspace_key = ? WHERE session_id = ?');
    const sessions = db
      .prepare('SELECT session_id AS id, workspace_path AS path FROM sessions WHERE workspace_path IS NOT NULL')
      .all() as { id: string; path: string }[];
    for (const row of sessions) fill.run(ledgerWorkspaceKey(row.path, platform), row.id);

    const sessionKeysByLowercase = new Map<string, Set<string>>();
    const sessionKeys = db
      .prepare('SELECT DISTINCT ledger_workspace_key AS key FROM sessions WHERE ledger_workspace_key IS NOT NULL')
      .all() as { key: string }[];
    for (const { key } of sessionKeys) {
      const folded = key.toLowerCase();
      const group = sessionKeysByLowercase.get(folded);
      if (group) group.add(key);
      else sessionKeysByLowercase.set(folded, new Set([key]));
    }
    const target = (key: string) => legacyLedgerKey(key, platform, sessionKeysByLowercase);

    for (const table of USAGE_TABLES) {
      const rewrite = db.prepare(table.rewrite);
      const keys = (db.prepare(table.distinct).all() as { key: string }[]).map((row) => row.key);
      for (const [canonical, spellings] of groupByTarget(keys, target)) {
        for (const spelling of spellings) {
          if (spelling !== canonical) rewrite.run(canonical, spelling);
        }
      }
    }

    const coverage = db.prepare(COVERAGE_ROWS).all() as { key: string; first: number; last: number }[];
    const byKey = new Map(coverage.map((row) => [row.key, row]));
    const drop = db.prepare('DELETE FROM session_usage_coverage WHERE workspace_key = ?');
    const merge = db.prepare(MERGE_COVERAGE);
    for (const [canonical, spellings] of groupByTarget([...byKey.keys()], target)) {
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

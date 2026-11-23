import { createHash } from 'node:crypto';
import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname } from 'node:path';
import { inject, injectable } from 'tsyringe';
import { ulid } from 'ulid';
import { TOKENS } from '@ptah-extension/vscode-core';
import type {
  CuratorLogger,
  SqliteDbProvider,
  VecAvailability,
} from './sqlite-reader-deps.types';
import {
  PERSISTENCE_TOKENS,
  type IEmbedder,
  type SqliteDatabase,
} from '@ptah-extension/persistence-sqlite';
import {
  type ICodeSymbolReader,
  type CodeIndexFreshness,
  type CodeSymbolHit,
  type CodeSymbolHitPage,
} from '@ptah-extension/memory-contracts';
import { buildFtsQueryPlan, executeFtsQueryPlan } from './fts-query.util';
import { SearchFlight } from './search-flight';
import { scopedVectorCandidates } from './scoped-vector-search';
import {
  BudgetExceededError,
  remainingMs,
  withinBudget,
} from './search-deadline';
import { HostBridgeEmbedder } from './search-worker-host-embedder';
import { MEMORY_TOKENS } from './di/tokens';
import type { ISqliteSearchWorker } from './search-worker.port';

function isMissingRoot(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}

export interface CodeSymbolInsert {
  readonly workspaceRoot: string;
  readonly filePath: string;
  readonly kind: string;
  readonly symbolName: string;
  readonly subject: string;
  readonly text: string;
  readonly tokenCount: number;
}

export interface CodeSymbolSearchParams {
  readonly workspaceRoot?: string | null;
  readonly query?: string;
  readonly kinds?: readonly string[];
  readonly limit?: number;
  readonly offset?: number;
}

export interface CodeSymbolListEntry {
  readonly id: string;
  readonly workspaceRoot: string;
  readonly filePath: string;
  readonly kind: string;
  readonly symbolName: string;
  readonly subject: string;
  readonly tokenCount: number;
  readonly updatedAt: number;
}

export interface CodeSymbolSearchResult {
  readonly items: readonly CodeSymbolListEntry[];
  readonly total: number;
}

/**
 * Tri-state workspace predicate, matching `MemoryStore.stats`:
 *
 *   - `string`    → that workspace only (`workspace_root IS ?`)
 *   - `null`      → unscoped rows only (`workspace_root IS NULL`)
 *   - `undefined` → no predicate at all, i.e. EVERY workspace
 *
 * `null` used to be folded into `undefined` here (`!== undefined && !== null`),
 * which is exactly why a no-workspace `memory:stats` reported the code-symbol
 * count of every workspace in `~/.ptah/state/ptah-dev.sqlite`: the caller said
 * "global/unscoped" and the store heard "unfiltered". `code_symbols.workspace_root`
 * is never NULL (see `CodeSymbolInsert`), so `null` correctly matches nothing.
 *
 * A caller that genuinely means "every workspace" must now say `undefined`, and
 * no RPC path does — `MemoryRpcHandlers` resolves the tri-state at the boundary.
 */
function workspaceClause(workspaceRoot: string | null | undefined): {
  readonly sql: string;
  readonly values: readonly unknown[];
} {
  if (workspaceRoot === undefined) return { sql: '', values: [] };
  if (workspaceRoot === null)
    return { sql: 'workspace_root IS NULL', values: [] };
  return { sql: 'workspace_root IS ?', values: [workspaceRoot] };
}

interface CodeSymbolRow {
  id: string;
  workspace_root: string;
  file_path: string;
  kind: string;
  symbol_name: string;
  subject: string;
  token_count: number;
  updated_at: number;
}

/** Full row shape used by the hybrid semantic search path (carries `text`). */
interface CodeSymbolHitRow {
  rowid: number;
  id: string;
  workspace_root: string;
  file_path: string;
  kind: string;
  symbol_name: string;
  subject: string;
  text: string;
  token_count: number;
}

interface CodeVecRow {
  rowid: number;
  distance: number;
}

/** Default k for Reciprocal Rank Fusion — matches MemorySearchService. */
const CODE_RRF_K = 25;

/** Upper bound on `searchSymbols` topK, and so on the length of the exact-name list. */
const CODE_SEARCH_MAX_TOP_K = 50;

/**
 * RRF weight of the exact `symbol_name` candidate list. BM25 and vector weights
 * sum to 1, so a row absent from the exact list scores at most 1 / (k + 1).
 * An exact row at 0-based index i scores at least W / (k + i + 1), and i is at
 * most CODE_SEARCH_MAX_TOP_K - 1. W = 3 gives 3 / 75 = 0.04 > 1 / 26 ≈ 0.0385,
 * so every exact-name row outranks every non-exact row. Raising the topK cap
 * requires re-deriving this weight.
 */
const EXACT_NAME_RRF_WEIGHT = 3;

/**
 * RRF weight of the name-token candidate list (multi-word queries only, so
 * it never competes with the exact list, which skips them). The same
 * derivation as {@link EXACT_NAME_RRF_WEIGHT}: every row whose name holds at
 * least two query words outranks every row matched by text or vector alone.
 */
const NAME_TOKEN_RRF_WEIGHT = EXACT_NAME_RRF_WEIGHT;
/** Query words the name-token tier looks for at most. */
const NAME_TOKEN_MAX_WORDS = 6;
/** A query word shorter than this is too common to narrow the name scan. */
const NAME_TOKEN_MIN_LENGTH = 3;
/** Rows the name-token scan reads at most before ranking them. */
const NAME_TOKEN_SCAN_CAP = 5000;

/** Lower-case words of an identifier or query: camelCase, acronyms, snake/kebab case and `.` split. */
function identifierWords(text: string): string[] {
  return text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 0);
}

/** A query SQLite `NOCASE` can compare case-insensitively on its own. */
const ASCII_ONLY = /^\p{ASCII}*$/u;

/** Files deleted per transaction in {@link CodeSymbolStore.purgeMissing}. */
const PURGE_MISSING_BATCH = 200;

/** Symbol rows deleted per transaction by the stale-root purge. */
const STALE_ROOT_BATCH = 128;

/**
 * Marker row in `indexing_state`, the database's existing per-key meta
 * table (migration 0012). Real workspace fingerprints are 16 hex characters
 * (`deriveWorkspaceFingerprint`); this key is not, and every reader of the
 * table looks up a fingerprint it already has, so the row is not a workspace.
 * Presence means a symbol replace, purge, delete, or insert committed while
 * sqlite-vec was unloaded. The next time vec is available, every
 * `code_symbols_vec` row is deleted and this row is removed. Embeddings are
 * absent until the next index run. Lexical search does not read them.
 */
const VEC_STALE_FINGERPRINT = 'code-symbols-vec-stale';

/**
 * `code_symbol_files` (migration 0077) records that one file was indexed
 * under a fingerprint, with every row carrying its vector. Every writer that
 * changes or removes a file's rows deletes its record in the same
 * transaction, so a record never outlives the rows it describes.
 */
const DELETE_FILE_RECORD_SQL = `DELETE FROM code_symbol_files WHERE workspace_root = ? AND file_path = ?`;
const UPSERT_FILE_RECORD_SQL = `INSERT INTO code_symbol_files (workspace_root, file_path, fingerprint, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(workspace_root, file_path) DO UPDATE SET
         fingerprint = excluded.fingerprint,
         updated_at = excluded.updated_at`;
/** Current file path of the row a `(workspace_root, subject)` upsert would update. */
const SELECT_SUBJECT_FILE_SQL = `SELECT rowid AS rowid, file_path AS file_path FROM code_symbols WHERE workspace_root = ? AND subject = ?`;

function normalizeStoredPath(filePath: string): string {
  return filePath.replaceAll('\\', '/');
}

/** Row columns selected by the exact-name lookups. */
const EXACT_NAME_COLUMNS = `cs.rowid AS rowid, cs.id AS id, cs.workspace_root AS workspace_root,
             cs.file_path AS file_path, cs.kind AS kind, cs.symbol_name AS symbol_name,
             cs.subject AS subject, cs.text AS text, cs.token_count AS token_count`;

@injectable()
export class CodeSymbolStore implements ICodeSymbolReader {
  private readOnlySearch = false;

  /** Worker searches must never run the main connection's vector repair writes. */
  enableReadOnlySearch(): void {
    this.readOnlySearch = true;
  }
  private readonly searchFlight = new SearchFlight<CodeSymbolHitPage>();
  private revision = 0;
  private embedderWarnedOnce = false;
  private fileRecordWarnedOnce = false;
  /**
   * Set after orphan `code_symbols_vec` rows have been removed for the
   * current stretch of vec availability. Cleared when vec is unavailable
   * so the next time it loads, leftovers from that outage are removed.
   */
  private vecOrphansReconciled = false;
  private lastStaleRootPurgeAt = Number.NEGATIVE_INFINITY;
  /**
   * A stale-root scan is running. The throttle timestamp advances only after
   * a completed scan, so this flag — not the timestamp — is what stops a
   * concurrent call from starting a second scan.
   */
  private staleRootPurgeInFlight = false;

  constructor(
    @inject(TOKENS.LOGGER) private readonly logger: CuratorLogger,
    @inject(PERSISTENCE_TOKENS.SQLITE_CONNECTION)
    private readonly connection: SqliteDbProvider,
    @inject(PERSISTENCE_TOKENS.EMBEDDER) private readonly embedder: IEmbedder,
    @inject(PERSISTENCE_TOKENS.VEC_STATUS)
    private readonly vecStatus: VecAvailability,
    @inject(MEMORY_TOKENS.SQLITE_SEARCH_WORKER, { isOptional: true })
    private readonly searchWorker: ISqliteSearchWorker | null = null,
  ) {}

  /**
   * Remove only roots confirmed absent. An inaccessible root is retained.
   *
   * The six-hour throttle advances only after a COMPLETED scan: an abort or a
   * database failure must not suppress the next attempt. While a scan runs, an
   * in-flight flag holds the place the early timestamp advance used to hold,
   * so a concurrent call still cannot start a second scan. The flag is set
   * synchronously, before the first `await`, and cleared in a `finally`.
   */
  async purgeStaleRoots(
    nowMs = Date.now(),
    statPath: (path: string) => ReturnType<typeof stat> = stat,
    signal?: AbortSignal,
  ): Promise<{ roots: number; rows: number }> {
    const throwIfAborted = (): void => {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    };
    throwIfAborted();
    if (this.staleRootPurgeInFlight) {
      return { roots: 0, rows: 0 };
    }
    if (nowMs - this.lastStaleRootPurgeAt < 6 * 60 * 60 * 1000) {
      return { roots: 0, rows: 0 };
    }
    this.staleRootPurgeInFlight = true;
    try {
      const purged = await this.scanAndPurgeStaleRoots(
        statPath,
        throwIfAborted,
      );
      this.lastStaleRootPurgeAt = nowMs;
      return purged;
    } finally {
      this.staleRootPurgeInFlight = false;
    }
  }

  /** One stale-root scan and purge, driven by {@link purgeStaleRoots}. */
  private async scanAndPurgeStaleRoots(
    statPath: (path: string) => ReturnType<typeof stat>,
    throwIfAborted: () => void,
  ): Promise<{ roots: number; rows: number }> {
    const db = this.connection.db;
    // A root can hold only file records (zero-symbol files) or only a
    // validation row; it is stale the same way when its directory is gone.
    const roots = db
      .prepare(
        `SELECT workspace_root AS root FROM code_symbols
         UNION SELECT workspace_root AS root FROM code_symbol_files
         UNION SELECT workspace_root AS root FROM code_index_roots`,
      )
      .all() as Array<{ root: string }>;
    let purgedRoots = 0;
    let purgedRows = 0;
    for (const { root } of roots) {
      throwIfAborted();
      try {
        await statPath(root);
        continue;
      } catch (error: unknown) {
        if (!isMissingRoot(error)) {
          this.logger.warn(
            '[code-symbol-store] Cannot inspect indexed root; retaining it',
            { root, error },
          );
          continue;
        }
      }
      const parent = dirname(root);
      try {
        const parentStat = await stat(parent);
        if (!parentStat.isDirectory()) {
          this.logger.info(
            '[code-symbol-store] Indexed root parent is not a directory; retaining it',
            { root, parent },
          );
          continue;
        }
        await access(parent, constants.R_OK);
      } catch (error: unknown) {
        if (isMissingRoot(error)) {
          this.logger.info(
            '[code-symbol-store] Indexed root parent is missing; retaining it',
            { root, parent },
          );
        } else {
          this.logger.warn(
            '[code-symbol-store] Cannot read indexed root parent; retaining it',
            { root, parent, error },
          );
        }
        continue;
      }
      const vecAvailable = this.vecStatus.available;
      const select = db.prepare(
        `SELECT rowid AS rowid FROM code_symbols WHERE workspace_root = ? LIMIT ${STALE_ROOT_BATCH}`,
      );
      const deleteSymbol = db.prepare(
        'DELETE FROM code_symbols WHERE rowid = ?',
      );
      const deleteVec = vecAvailable
        ? db.prepare('DELETE FROM code_symbols_vec WHERE rowid = ?')
        : null;
      const deleteRecords = db.prepare(
        'DELETE FROM code_symbol_files WHERE workspace_root = ?',
      );
      const deleteRootRow = db.prepare(
        'DELETE FROM code_index_roots WHERE workspace_root = ?',
      );
      let removedForRoot = 0;
      let removedMeta = 0;
      for (;;) {
        throwIfAborted();
        try {
          await statPath(root);
          this.logger.warn(
            '[code-symbol-store] Indexed root reappeared; stopping purge',
            { root },
          );
          break;
        } catch (error: unknown) {
          if (!isMissingRoot(error)) {
            this.logger.warn(
              '[code-symbol-store] Cannot confirm indexed root is absent; stopping purge',
              { root, error },
            );
            break;
          }
        }
        try {
          const parentStat = await stat(parent);
          if (!parentStat.isDirectory()) {
            this.logger.warn(
              '[code-symbol-store] Indexed root parent changed; stopping purge',
              { root, parent },
            );
            break;
          }
          await access(parent, constants.R_OK);
        } catch (error: unknown) {
          this.logger.warn(
            '[code-symbol-store] Cannot read indexed root parent; stopping purge',
            { root, parent, error },
          );
          break;
        }
        throwIfAborted();
        // The batch is selected inside the delete transaction, after the
        // async checks above, so it never holds rowids across an await.
        let batch: { readonly rows: number; readonly meta: number };
        try {
          batch = db.transaction((): { rows: number; meta: number } => {
            const ids = select.all(root) as Array<{ rowid: number }>;
            for (const { rowid } of ids) {
              deleteVec?.run(rowid);
              deleteSymbol.run(rowid);
            }
            const meta =
              deleteRecords.run(root).changes + deleteRootRow.run(root).changes;
            if (!vecAvailable && ids.length > 0) this.markVecStale();
            return { rows: ids.length, meta };
          })();
        } catch (error: unknown) {
          this.connection.handleFatalWriteError(error);
          throw error;
        }
        removedForRoot += batch.rows;
        removedMeta += batch.meta;
        if (batch.rows < STALE_ROOT_BATCH) break;
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      if (removedForRoot === 0 && removedMeta === 0) continue;
      purgedRoots++;
      purgedRows += removedForRoot;
      this.revision++;
      // Only the path-derived fingerprint is unambiguously owned by this
      // root. Git/package fingerprints can also belong to a live checkout.
      const pathFp = createHash('sha256')
        .update(`path:${root}`, 'utf8')
        .digest('hex')
        .slice(0, 16);
      db.prepare(
        'DELETE FROM indexing_state WHERE workspace_fingerprint = ?',
      ).run(pathFp);
    }
    this.logger.info('[code-symbol-store] stale-root maintenance complete', {
      roots: purgedRoots,
      rows: purgedRows,
    });
    return { roots: purgedRoots, rows: purgedRows };
  }

  /**
   * `code_symbols.id` is `TEXT PRIMARY KEY` (migration 0013), not
   * `INTEGER PRIMARY KEY AUTOINCREMENT`. The implicit rowid can be reused
   * after a delete. sqlite-vec's `vec0` table cannot be written while the
   * extension is unloaded, so a delete or replace during an outage leaves
   * the old `code_symbols_vec` row in place. Once vec returns, that rowid
   * may already belong to a different symbol, so deleting only orphans
   * keeps the stale embedding.
   *
   * A committed symbol write during the outage inserts
   * {@link VEC_STALE_FINGERPRINT} in the same transaction. The first call
   * after vec is available again, including a search, deletes every vec
   * row and clears the marker. A missing vector is not a semantic
   * candidate. Lexical search still runs. While vec stayed available, only
   * true orphans are removed, and each vec insert still deletes that rowid
   * first (`vec0` is not written with `INSERT OR REPLACE`).
   *
   * The marker lives in SQLite, so an outage that lasts the whole process
   * is still repaired in the next process. Electron and the CLI can open the
   * same database file, so another connection can write the marker after
   * this one warmed: the writable branch reads the marker on every call (one
   * primary-key lookup). `vecOrphansReconciled` only skips the orphan scan.
   * Returns whether vec reads and writes may run.
   */
  private reconcileOrphanVecRows(): boolean {
    const vecAvailable = this.vecStatus.available;
    if (!vecAvailable) this.vecOrphansReconciled = false;
    if (this.readOnlySearch) {
      if (!vecAvailable) return false;
      const stale = this.connection.db
        .prepare(
          `SELECT 1 AS present FROM indexing_state WHERE workspace_fingerprint = ?`,
        )
        .get(VEC_STALE_FINGERPRINT);
      return !stale;
    }

    const db = this.connection.db;
    try {
      const stale = this.isVecStale(db);
      if (!vecAvailable) return false;
      if (stale) {
        this.recoverVecIfStale(db);
      } else if (!this.vecOrphansReconciled) {
        this.dropOrphanVecRows(db);
      }
    } catch (err: unknown) {
      this.connection.handleFatalWriteError(err);
      throw err;
    }
    this.vecOrphansReconciled = true;
    return true;
  }

  private isVecStale(db: SqliteDatabase): boolean {
    const stale = db
      .prepare(
        `SELECT 1 AS present FROM indexing_state WHERE workspace_fingerprint = ?`,
      )
      .get(VEC_STALE_FINGERPRINT) as { present: number } | undefined;
    return stale !== undefined;
  }

  /** Record that symbol rows changed while vec rows could not. */
  private markVecStale(): void {
    this.connection.db
      .prepare(
        `INSERT OR IGNORE INTO indexing_state (workspace_fingerprint) VALUES (?)`,
      )
      .run(VEC_STALE_FINGERPRINT);
  }

  /**
   * Wipe the vector index once per marker. Explicit `BEGIN IMMEDIATE`
   * (the `observation-queue.store.ts` idiom) takes the write lock before the
   * marker is read again, so of two connections that both saw the marker
   * only the first wipes; the second finds it cleared and commits nothing.
   */
  private recoverVecIfStale(db: SqliteDatabase): void {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (this.isVecStale(db)) this.dropAllVecRows(db);
      db.exec('COMMIT');
    } catch (err: unknown) {
      if (db.inTransaction) db.exec('ROLLBACK');
      throw err;
    }
  }

  /**
   * Delete every vec row, every file record and root validation, then the
   * stale marker. The records claim "indexed with vectors", which no longer
   * holds once the vectors are gone. Runs inside the caller's write
   * transaction, rowid selection included: a failure rolls everything back
   * and leaves the marker so the next call tries again. vec0 is deleted by
   * rowid.
   */
  private dropAllVecRows(db: SqliteDatabase): void {
    const rowids = db
      .prepare(`SELECT rowid AS rowid FROM code_symbols_vec_rowids`)
      .all() as Array<{ rowid: number }>;
    const deleteVec = db.prepare(
      `DELETE FROM code_symbols_vec WHERE rowid = ?`,
    );
    for (const row of rowids) deleteVec.run(row.rowid);
    db.prepare(`DELETE FROM code_symbol_files`).run();
    db.prepare(`DELETE FROM code_index_roots`).run();
    db.prepare(
      `DELETE FROM indexing_state WHERE workspace_fingerprint = ?`,
    ).run(VEC_STALE_FINGERPRINT);
    this.logger.debug?.(
      '[code-symbol-store] dropped code_symbols_vec after a vec outage',
      { removed: rowids.length },
    );
  }

  /**
   * vec0 accepts `DELETE … WHERE rowid = ?`. A `NOT IN` delete against the
   * virtual table is not that shape, so the predicate runs on the vec0
   * rowid shadow and each orphan is deleted by rowid.
   */
  private dropOrphanVecRows(db: SqliteDatabase): void {
    const removed = db.transaction(() => {
      const orphans = db
        .prepare(
          `SELECT rowid AS rowid FROM code_symbols_vec_rowids
           WHERE rowid NOT IN (SELECT rowid FROM code_symbols)`,
        )
        .all() as Array<{ rowid: number }>;
      if (orphans.length === 0) return 0;
      const deleteVec = db.prepare(
        `DELETE FROM code_symbols_vec WHERE rowid = ?`,
      );
      for (const { rowid } of orphans) deleteVec.run(rowid);
      return orphans.length;
    })();
    if (removed > 0) {
      this.logger.debug?.(
        '[code-symbol-store] removed orphan code_symbols_vec rows',
        { removed },
      );
    }
  }

  deleteByFile(workspaceRoot: string, filePath: string): number {
    return this.deleteFileRows(workspaceRoot, filePath);
  }

  /**
   * Delete every symbol row for `filePath` and insert `rows` in one
   * transaction. A failed insert leaves the previous rows (and their FTS
   * and vector rows) in place. FTS follows the `code_symbols` triggers;
   * vector rows are deleted by rowid before the symbol rows.
   *
   * `fingerprint` is the indexer's value without the embedder model id. The
   * same transaction records the file as `${fingerprint}:${modelId}` when it
   * is a string and every row got a valid vector (or vec is unavailable,
   * which sets the stale marker and makes the record unusable until the
   * recovery wipe removes it). Otherwise the file's record is deleted.
   */
  async replaceFileSymbols(
    workspaceRoot: string,
    filePath: string,
    rows: readonly CodeSymbolInsert[],
    fingerprint?: string | null,
  ): Promise<void> {
    const now = Date.now();
    const vecAvailable = this.reconcileOrphanVecRows();
    const hashes = rows.map(({ text }) => this.textHash(text));
    const embeddings = new Map<string, Float32Array>();
    if (vecAvailable && rows.length > 0) {
      const textsByHash = new Map(hashes.map((hash, i) => [hash, rows[i].text]));
      this.readDonorVectors(textsByHash.keys(), embeddings);
      const misses = [...textsByHash].filter(([hash]) => !embeddings.has(hash));
      if (misses.length > 0) {
        const embedded = await this.embedderEmbed(misses.map(([, text]) => text));
        misses.forEach(([hash], i) => {
          const vector = embedded[i];
          if (vector?.length === this.embedder.dim) embeddings.set(hash, vector);
        });
      }
    }

    const db = this.connection.db;
    const selectRowidsStmt = vecAvailable
      ? db.prepare(
          `SELECT rowid AS rowid FROM code_symbols WHERE workspace_root = ? AND file_path = ?`,
        )
      : null;
    const deleteVecStmt = vecAvailable
      ? db.prepare(`DELETE FROM code_symbols_vec WHERE rowid = ?`)
      : null;
    const deleteSymbolsStmt = db.prepare(
      `DELETE FROM code_symbols WHERE workspace_root = ? AND file_path = ?`,
    );
    const upsertStmt = db.prepare(
      `INSERT INTO code_symbols (id, workspace_root, file_path, kind, symbol_name, subject, text, text_hash, token_count, created_at, updated_at)
       VALUES (@id, @workspace_root, @file_path, @kind, @symbol_name, @subject, @text, @text_hash, @token_count, @created_at, @updated_at)
       ON CONFLICT(workspace_root, subject) DO UPDATE SET
         file_path = excluded.file_path,
         kind = excluded.kind,
         symbol_name = excluded.symbol_name,
         text = excluded.text,
         text_hash = excluded.text_hash,
         token_count = excluded.token_count,
         updated_at = excluded.updated_at`,
    );
    const fetchRowidStmt = db.prepare(
      `SELECT rowid AS rowid FROM code_symbols WHERE workspace_root = ? AND subject = ?`,
    );
    const insertVecStmt = vecAvailable
      ? db.prepare(
          `INSERT INTO code_symbols_vec(rowid, embedding) VALUES (CAST(? AS INTEGER), ?)`,
        )
      : null;

    const selectSubjectStmt = db.prepare(SELECT_SUBJECT_FILE_SQL);
    const deleteRecordStmt = db.prepare(DELETE_FILE_RECORD_SQL);
    const upsertRecordStmt = db.prepare(UPSERT_FILE_RECORD_SQL);

    type Payload = { readonly entries: readonly CodeSymbolInsert[] };
    const txnFn = ((payload: Payload): void => {
      if (selectRowidsStmt && deleteVecStmt) {
        const oldRows = selectRowidsStmt.all(workspaceRoot, filePath) as Array<{
          rowid: number;
        }>;
        for (const old of oldRows) {
          deleteVecStmt.run(old.rowid);
        }
      }
      const removed = deleteSymbolsStmt.run(workspaceRoot, filePath);
      if (
        !vecAvailable &&
        (removed.changes > 0 || payload.entries.length > 0)
      ) {
        this.markVecStale();
      }
      let everyRowHasVector = true;
      for (let i = 0; i < payload.entries.length; i++) {
        const e = payload.entries[i];
        // The file's own rows are gone, so a row still holding this subject
        // belongs to another file: the upsert moves it here, and that
        // file's record no longer describes its rows.
        const moved = selectSubjectStmt.get(e.workspaceRoot, e.subject) as
          | { rowid: number; file_path: string }
          | undefined;
        if (moved) {
          deleteRecordStmt.run(e.workspaceRoot, moved.file_path);
        }
        upsertStmt.run({
          id: ulid(),
          workspace_root: e.workspaceRoot,
          file_path: e.filePath,
          kind: e.kind,
          symbol_name: e.symbolName,
          subject: e.subject,
          text: e.text,
          text_hash: hashes[i],
          token_count: e.tokenCount,
          created_at: now,
          updated_at: now,
        });
        let wroteVector = false;
        if (insertVecStmt && deleteVecStmt) {
          const row = moved ?? (fetchRowidStmt.get(e.workspaceRoot, e.subject) as
            { rowid: number } | undefined);
          const vec = embeddings.get(hashes[i]);
          if (row) {
            // A moved or reused rowid may still have an old embedding.
            deleteVecStmt.run(row.rowid);
            if (vec) {
              insertVecStmt.run(
                row.rowid,
                Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength),
              );
              wroteVector = true;
            }
          }
        }
        if (!wroteVector) everyRowHasVector = false;
      }
      if (
        typeof fingerprint === 'string' &&
        (!vecAvailable || everyRowHasVector)
      ) {
        upsertRecordStmt.run(
          workspaceRoot,
          filePath,
          `${fingerprint}:${this.embedder.modelId}`,
          now,
        );
      } else {
        deleteRecordStmt.run(workspaceRoot, filePath);
      }
    }) as unknown as (...args: unknown[]) => unknown;
    const txn = db.transaction(txnFn) as unknown as (p: Payload) => void;
    try {
      txn({ entries: rows });
      this.revision++;
    } catch (err: unknown) {
      this.connection.handleFatalWriteError(err);
      throw err;
    }
  }

  private textHash(text: string): string {
    return createHash('sha256')
      .update(`${this.embedder.modelId}\0${text}`)
      .digest('hex');
  }

  private readDonorVectors(
    hashes: Iterable<string>,
    embeddings: Map<string, Float32Array>,
  ): void {
    const db = this.connection.db;
    db.transaction(() => {
      // The marker and all donor reads share one SQLite snapshot, including
      // when a second connection writes while we read.
      if (this.isVecStale(db)) return;
      const donor = db.prepare(
        `SELECT v.embedding FROM code_symbols s
         CROSS JOIN code_symbols_vec v ON v.rowid = s.rowid
         WHERE s.text_hash = ? AND length(v.embedding) = ? LIMIT 1`,
      );
      const byteLength = this.embedder.dim * Float32Array.BYTES_PER_ELEMENT;
      for (const hash of hashes) {
        const row = donor.get(hash, byteLength) as { embedding: Buffer } | undefined;
        if (row) {
          const blob = row.embedding;
          const owned = new Float32Array(this.embedder.dim);
          new Uint8Array(owned.buffer).set(blob);
          embeddings.set(hash, owned);
        }
      }
    })();
  }

  /**
   * Delete symbol rows (and their FTS/vector rows) whose `file_path` is not
   * in `presentPaths`. Scoped to `workspaceRoot`; other roots are untouched.
   * Deletes run in batches of {@link PURGE_MISSING_BATCH} files. Each
   * batch is its own transaction: a failure rolls that batch back (no
   * file in it loses its symbol row while keeping a vec row) and leaves
   * earlier batches committed. Those paths are already absent, and the
   * next purge deletes whatever remains. One transaction for the whole
   * set would hold the write lock for every missing file.
   */
  purgeMissing(workspaceRoot: string, presentPaths: readonly string[]): number {
    const vecAvailable = this.reconcileOrphanVecRows();
    const present = new Set(
      presentPaths.map((filePath) => normalizeStoredPath(filePath)),
    );
    const db = this.connection.db;
    // A file with zero symbols has a record and no symbol rows; it is
    // missing too when it is gone from disk.
    const listed = db
      .prepare(
        `SELECT file_path AS file_path FROM code_symbols WHERE workspace_root = ?
         UNION
         SELECT file_path AS file_path FROM code_symbol_files WHERE workspace_root = ?`,
      )
      .all(workspaceRoot, workspaceRoot) as Array<{ file_path: string }>;
    const missing: string[] = [];
    for (const row of listed) {
      if (!present.has(normalizeStoredPath(row.file_path))) {
        missing.push(row.file_path);
      }
    }
    if (missing.length === 0) return 0;

    const selectRowidsStmt = vecAvailable
      ? db.prepare(
          `SELECT rowid AS rowid FROM code_symbols WHERE workspace_root = ? AND file_path = ?`,
        )
      : null;
    const deleteVecStmt = vecAvailable
      ? db.prepare(`DELETE FROM code_symbols_vec WHERE rowid = ?`)
      : null;
    const deleteSymbolsStmt = db.prepare(
      `DELETE FROM code_symbols WHERE workspace_root = ? AND file_path = ?`,
    );

    const deleteRecordStmt = db.prepare(DELETE_FILE_RECORD_SQL);

    type Payload = { readonly paths: readonly string[] };
    const txnFn = ((payload: Payload): number => {
      if (!vecAvailable && payload.paths.length > 0) this.markVecStale();
      let changes = 0;
      for (const filePath of payload.paths) {
        deleteRecordStmt.run(workspaceRoot, filePath);
        if (selectRowidsStmt && deleteVecStmt) {
          const ids = selectRowidsStmt.all(workspaceRoot, filePath) as Array<{
            rowid: number;
          }>;
          for (const id of ids) {
            deleteVecStmt.run(id.rowid);
          }
        }
        changes += deleteSymbolsStmt.run(workspaceRoot, filePath).changes;
      }
      return changes;
    }) as unknown as (...args: unknown[]) => unknown;
    const txn = db.transaction(txnFn) as unknown as (p: Payload) => number;

    let totalDeleted = 0;
    try {
      for (let i = 0; i < missing.length; i += PURGE_MISSING_BATCH) {
        totalDeleted += txn({
          paths: missing.slice(i, i + PURGE_MISSING_BATCH),
        });
        this.revision++;
      }
    } catch (err: unknown) {
      this.connection.handleFatalWriteError(err);
      throw err;
    }
    return totalDeleted;
  }

  /** Delete one file's symbol rows and their vector rows, FTS via triggers. */
  private deleteFileRows(workspaceRoot: string, filePath: string): number {
    const db = this.connection.db;
    const vecAvailable = this.reconcileOrphanVecRows();
    const selectRowidsStmt = vecAvailable
      ? db.prepare(
          `SELECT rowid AS rowid FROM code_symbols WHERE workspace_root = ? AND file_path = ?`,
        )
      : null;
    const deleteVecStmt = vecAvailable
      ? db.prepare(`DELETE FROM code_symbols_vec WHERE rowid = ?`)
      : null;
    const deleteSymbolsStmt = db.prepare(
      `DELETE FROM code_symbols WHERE workspace_root = ? AND file_path = ?`,
    );
    const deleteRecordStmt = db.prepare(DELETE_FILE_RECORD_SQL);
    type Payload = {
      readonly workspaceRoot: string;
      readonly filePath: string;
    };
    const txnFn = ((payload: Payload): number => {
      deleteRecordStmt.run(payload.workspaceRoot, payload.filePath);
      if (selectRowidsStmt && deleteVecStmt) {
        const ids = selectRowidsStmt.all(
          payload.workspaceRoot,
          payload.filePath,
        ) as Array<{ rowid: number }>;
        for (const id of ids) {
          deleteVecStmt.run(id.rowid);
        }
      }
      const removed = deleteSymbolsStmt.run(
        payload.workspaceRoot,
        payload.filePath,
      );
      if (!vecAvailable && removed.changes > 0) this.markVecStale();
      return removed.changes;
    }) as unknown as (...args: unknown[]) => unknown;
    const txn = db.transaction(txnFn) as unknown as (p: Payload) => number;
    try {
      const removed = txn({ workspaceRoot, filePath });
      if (removed > 0) this.revision++;
      return removed;
    } catch (err: unknown) {
      this.connection.handleFatalWriteError(err);
      throw err;
    }
  }

  async insertBatch(entries: readonly CodeSymbolInsert[]): Promise<void> {
    if (entries.length === 0) return;
    const now = Date.now();
    const vecAvailable = this.reconcileOrphanVecRows();
    const embeddings: Float32Array[] = vecAvailable
      ? await this.embedderEmbed(entries.map((e) => e.text))
      : [];

    const db = this.connection.db;
    const upsertStmt = db.prepare(
      `INSERT INTO code_symbols (id, workspace_root, file_path, kind, symbol_name, subject, text, text_hash, token_count, created_at, updated_at)
       VALUES (@id, @workspace_root, @file_path, @kind, @symbol_name, @subject, @text, @text_hash, @token_count, @created_at, @updated_at)
       ON CONFLICT(workspace_root, subject) DO UPDATE SET
         file_path = excluded.file_path,
         kind = excluded.kind,
         symbol_name = excluded.symbol_name,
         text = excluded.text,
         text_hash = excluded.text_hash,
         token_count = excluded.token_count,
         updated_at = excluded.updated_at`,
    );
    const fetchRowidStmt = db.prepare(
      `SELECT rowid AS rowid FROM code_symbols WHERE workspace_root = ? AND subject = ?`,
    );
    const deleteVecStmt = vecAvailable
      ? db.prepare(`DELETE FROM code_symbols_vec WHERE rowid = ?`)
      : null;
    const insertVecStmt = vecAvailable
      ? db.prepare(
          `INSERT INTO code_symbols_vec(rowid, embedding) VALUES (CAST(? AS INTEGER), ?)`,
        )
      : null;

    const selectSubjectStmt = db.prepare(SELECT_SUBJECT_FILE_SQL);
    const deleteRecordStmt = db.prepare(DELETE_FILE_RECORD_SQL);

    type Payload = { readonly entries: readonly CodeSymbolInsert[] };
    const txnFn = ((payload: Payload): void => {
      if (!vecAvailable) this.markVecStale();
      for (let i = 0; i < payload.entries.length; i++) {
        const e = payload.entries[i];
        // This write changes the rows of `e.filePath` and, on a subject
        // conflict, of the file the row came from: neither record holds.
        deleteRecordStmt.run(e.workspaceRoot, e.filePath);
        const prior = selectSubjectStmt.get(e.workspaceRoot, e.subject) as
          | { rowid: number; file_path: string }
          | undefined;
        if (prior) {
          if (prior.file_path !== e.filePath) {
            deleteRecordStmt.run(e.workspaceRoot, prior.file_path);
          }
        }
        upsertStmt.run({
          id: ulid(),
          workspace_root: e.workspaceRoot,
          file_path: e.filePath,
          kind: e.kind,
          symbol_name: e.symbolName,
          subject: e.subject,
          text: e.text,
          text_hash: this.textHash(e.text),
          token_count: e.tokenCount,
          created_at: now,
          updated_at: now,
        });
        if (insertVecStmt && deleteVecStmt) {
          const row = prior ?? (fetchRowidStmt.get(e.workspaceRoot, e.subject) as
            { rowid: number } | undefined);
          const vec = embeddings[i];
          if (row) {
            // Discard the old vector even if the new one cannot be stored.
            deleteVecStmt.run(row.rowid);
            if (vec?.length === this.embedder.dim) {
              insertVecStmt.run(
                row.rowid,
                Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength),
              );
            }
          }
        }
      }
    }) as unknown as (...args: unknown[]) => unknown;
    const txn = db.transaction(txnFn) as unknown as (p: Payload) => void;
    try {
      txn({ entries });
      this.revision++;
    } catch (err: unknown) {
      this.connection.handleFatalWriteError(err);
      throw err;
    }
  }

  /** Count indexed symbols. See `workspaceClause` for the tri-state contract. */
  count(workspaceRoot?: string | null): number {
    const clause = workspaceClause(workspaceRoot);
    const whereSql = clause.sql ? `WHERE ${clause.sql}` : '';
    const row = this.connection.db
      .prepare(`SELECT COUNT(*) AS n FROM code_symbols ${whereSql}`)
      .get(...clause.values) as { n: number } | undefined;
    return row?.n ?? 0;
  }

  /**
   * Whether `filePath` was last written by {@link replaceFileSymbols} with
   * this `candidate` (the indexer's fingerprint without the model id) under
   * the current embedder model, every row carrying its vector. Reconcile
   * runs first, so a stale marker another connection wrote is recovered
   * (records wiped) before any record is read. The lookup also checks the
   * marker in the same statement, for a marker written after reconcile.
   * `false` when vec is unusable or on any error: a false answer re-indexes
   * the file, which is always correct.
   */
  isFileUnchanged(
    workspaceRoot: string,
    filePath: string,
    candidate: string,
  ): boolean {
    try {
      if (!this.reconcileOrphanVecRows()) return false;
      const row = this.connection.db
        .prepare(
          `SELECT 1 AS present FROM code_symbol_files
           WHERE workspace_root = ? AND file_path = ? AND fingerprint = ?
             AND NOT EXISTS (SELECT 1 FROM indexing_state WHERE workspace_fingerprint = ?)`,
        )
        .get(
          workspaceRoot,
          filePath,
          `${candidate}:${this.embedder.modelId}`,
          VEC_STALE_FINGERPRINT,
        );
      return row !== undefined;
    } catch (error: unknown) {
      // degradation-audit: reported - logged at warn once per store
      // (fileRecordWarnedOnce); the file is re-indexed instead of skipped.
      if (!this.fileRecordWarnedOnce) {
        this.fileRecordWarnedOnce = true;
        this.logger.warn(
          '[code-symbol-store] file record lookup failed; re-indexing files instead of skipping them',
          { error: error instanceof Error ? error.message : String(error) },
        );
      }
      return false;
    }
  }

  /** Record that a complete indexing pass confirmed `workspaceRoot` now. */
  markRootValidated(workspaceRoot: string): void {
    try {
      this.connection.db
        .prepare(
          `INSERT INTO code_index_roots (workspace_root, validated_at) VALUES (?, ?)
           ON CONFLICT(workspace_root) DO UPDATE SET validated_at = excluded.validated_at`,
        )
        .run(workspaceRoot, Date.now());
    } catch (err: unknown) {
      this.connection.handleFatalWriteError(err);
      throw err;
    }
  }

  /**
   * Symbol count, newest `updated_at` and last validation for one workspace
   * root, in a single statement. `newestUpdatedAt` is the newer of the
   * symbols' `updated_at` and `validatedAt`. An empty, never validated root
   * yields `{ symbolCount: 0, newestUpdatedAt: null, validatedAt: null }`.
   */
  async getIndexFreshness(workspaceRoot: string): Promise<CodeIndexFreshness> {
    const row = this.connection.db
      .prepare(
        `SELECT COUNT(*) AS n, MAX(updated_at) AS newest,
                (SELECT validated_at FROM code_index_roots WHERE workspace_root = ?) AS validated
         FROM code_symbols WHERE workspace_root = ?`,
      )
      .get(workspaceRoot, workspaceRoot) as
      | { n: number; newest: number | null; validated: number | null }
      | undefined;
    const symbolCount = row?.n ?? 0;
    const newest =
      symbolCount > 0 && typeof row?.newest === 'number' ? row.newest : null;
    const validatedAt =
      typeof row?.validated === 'number' ? row.validated : null;
    return {
      symbolCount,
      newestUpdatedAt:
        newest === null
          ? validatedAt
          : validatedAt === null
            ? newest
            : Math.max(newest, validatedAt),
      validatedAt,
    };
  }

  search(params: CodeSymbolSearchParams): CodeSymbolSearchResult {
    const clauses: string[] = [];
    const values: unknown[] = [];

    const wsClause = workspaceClause(params.workspaceRoot);
    if (wsClause.sql) {
      clauses.push(wsClause.sql);
      values.push(...wsClause.values);
    }

    const trimmedQuery =
      typeof params.query === 'string' ? params.query.trim() : '';
    if (trimmedQuery.length > 0) {
      const escaped = trimmedQuery
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_');
      const likePattern = `%${escaped}%`;
      clauses.push(
        `(symbol_name LIKE ? ESCAPE '\\' OR file_path LIKE ? ESCAPE '\\')`,
      );
      values.push(likePattern, likePattern);
    }

    if (params.kinds && params.kinds.length > 0) {
      const placeholders = params.kinds.map(() => '?').join(',');
      clauses.push(`kind IN (${placeholders})`);
      for (const k of params.kinds) values.push(k);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    const rawLimit =
      typeof params.limit === 'number' && Number.isFinite(params.limit)
        ? Math.trunc(params.limit)
        : 50;
    const limit = Math.min(200, Math.max(1, rawLimit));
    const rawOffset =
      typeof params.offset === 'number' && Number.isFinite(params.offset)
        ? Math.trunc(params.offset)
        : 0;
    const offset = Math.max(0, rawOffset);

    const db = this.connection.db;
    const countSql = `SELECT COUNT(*) AS n FROM code_symbols ${whereSql}`;
    const countStarted = performance.now();
    const countRow = db.prepare(countSql).get(...values) as
      { n: number } | undefined;
    const countMs = performance.now() - countStarted;
    if (countMs > 250)
      this.logger.warn('[code-symbols] slow search statement', {
        statement: 'count',
        durationMs: countMs,
        scoped: Boolean(wsClause.sql),
        substring: trimmedQuery.length > 0,
        kindCount: params.kinds?.length ?? 0,
      });
    const total = countRow?.n ?? 0;

    const rowsSql = `SELECT id, workspace_root, file_path, kind, symbol_name, subject, token_count, updated_at
       FROM code_symbols
       ${whereSql}
       ORDER BY updated_at DESC, symbol_name ASC
       LIMIT ? OFFSET ?`;
    const pageStarted = performance.now();
    const rows = db
      .prepare(rowsSql)
      .all(...values, limit, offset) as CodeSymbolRow[];
    const pageMs = performance.now() - pageStarted;
    if (pageMs > 250)
      this.logger.warn('[code-symbols] slow search statement', {
        statement: 'page',
        durationMs: pageMs,
        scoped: Boolean(wsClause.sql),
        substring: trimmedQuery.length > 0,
        kindCount: params.kinds?.length ?? 0,
        limit,
        offset,
      });

    const items: CodeSymbolListEntry[] = rows.map((r) => ({
      id: r.id,
      workspaceRoot: r.workspace_root,
      filePath: r.file_path,
      kind: r.kind,
      symbolName: r.symbol_name,
      subject: r.subject,
      tokenCount: r.token_count,
      updatedAt: r.updated_at,
    }));

    return { items, total };
  }

  searchAsync(
    params: CodeSymbolSearchParams,
    deadlineMs?: number,
  ): Promise<CodeSymbolSearchResult> {
    if (this.searchWorker)
      return this.searchWorker.searchSymbolPage(params, deadlineMs);
    // Synchronous in-process SQL cannot be pre-empted by a JS timer.
    return new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          resolve(this.search(params));
        } catch (error: unknown) {
          reject(error);
        }
      });
    });
  }

  /**
   * Hybrid BM25 (code_symbols_fts) + vector (code_symbols_vec) search over the
   * indexed symbols, plus an exact `symbol_name` candidate list, fused with
   * Reciprocal Rank Fusion. An exact-name row always ranks above every other row
   * (see `EXACT_NAME_RRF_WEIGHT`); the porter tokenizer keeps a camelCase name as
   * one opaque token, so BM25 alone does not guarantee that. Falls back to
   * BM25-only when sqlite-vec is unavailable or the vector query fails. Returns
   * `''`-safe empty page on empty query.
   */
  async searchSymbols(
    query: string,
    topK = 10,
    workspaceRoot?: string,
    deadlineMs?: number,
  ): Promise<CodeSymbolHitPage> {
    if (this.searchWorker)
      return this.searchWorker.searchSymbols(query, topK, workspaceRoot);
    const changes = this.connection.db
      .prepare('SELECT total_changes() AS n')
      .get() as { n: number };
    const key = JSON.stringify([query.trim(), topK, workspaceRoot, changes.n]);
    const search = () =>
      this.searchSymbolsInner(query, topK, workspaceRoot, deadlineMs);
    if (deadlineMs === undefined) return this.searchFlight.run(key, search);
    // Deadline-bound (the search worker): see MemorySearchService.searchRich.
    return this.searchFlight.run(
      `${key}|${Math.floor(deadlineMs / 1_000)}`,
      search,
      { serialize: false },
    );
  }

  getRevision(): number {
    return this.revision;
  }

  private async searchSymbolsInner(
    query: string,
    topK: number,
    workspaceRoot: string | undefined,
    deadlineMs: number | undefined,
  ): Promise<CodeSymbolHitPage> {
    const limit = Math.max(1, Math.min(CODE_SEARCH_MAX_TOP_K, topK));
    const trimmed = query.trim();
    if (!trimmed) return { hits: [], bm25Only: !this.vecStatus.available };

    const exactRows = this.exactNameSymbols(trimmed, limit, workspaceRoot);
    const nameTokenRows = this.nameTokenSymbols(trimmed, limit, workspaceRoot);
    const bm25Rows = this.bm25SearchSymbols(trimmed, limit * 4, workspaceRoot);
    let vecRows: CodeSymbolHitRow[] = [];
    let bm25Only = !this.reconcileOrphanVecRows();
    if (!bm25Only) {
      try {
        // Bounded by the request deadline, so the BM25 rows always answer in time.
        vecRows = await withinBudget(
          this.vecSearchSymbols(trimmed, 100, workspaceRoot, deadlineMs),
          remainingMs(deadlineMs) - 200,
          'symbol vector search',
        );
      } catch (err: unknown) {
        this.logger.warn(
          '[code-symbol-store] vec search failed; falling back to BM25',
          { error: err instanceof Error ? err.message : String(err) },
        );
        bm25Only = true;
      }
    }

    const tokenCount = trimmed.split(/\s+/).filter((t) => t.length > 0).length;
    const bm25Weight = tokenCount < 4 ? 0.6 : 0.3;
    const fused = this.rrfFuseSymbols(
      [...exactRows, ...nameTokenRows],
      bm25Rows,
      vecRows,
      limit,
      {
        exact: EXACT_NAME_RRF_WEIGHT,
        bm25: bm25Weight,
        vec: 1 - bm25Weight,
      },
    );

    const hits: CodeSymbolHit[] = fused.map(({ row, score }) => ({
      id: row.id,
      workspaceRoot: row.workspace_root,
      filePath: row.file_path,
      kind: row.kind,
      symbolName: row.symbol_name,
      subject: row.subject,
      text: row.text,
      tokenCount: row.token_count,
      score,
    }));
    return { hits, bm25Only };
  }

  /**
   * Rows whose `symbol_name` equals the query. Case-sensitive matches win: when
   * any exists, only those are returned; otherwise the case-insensitive matches
   * are — through SQL `NOCASE` for an ASCII query (`nocaseNameSymbols`), or the
   * JS Unicode fallback for any other (`foldedNameSymbols`). Ties (the same
   * name in several files) order by file path. A query containing whitespace
   * cannot be a symbol name, so it skips the lookup and natural-language
   * searches fuse exactly as before. The query is bound as a parameter and `=`
   * has no wildcards, so `%`, `_` and quotes stay literal.
   */
  private exactNameSymbols(
    query: string,
    limit: number,
    workspaceRoot?: string,
  ): CodeSymbolHitRow[] {
    if (/\s/.test(query)) return [];
    const rows = this.nameEqualsSymbols('', query, limit, workspaceRoot);
    if (rows.length > 0) return rows;
    return ASCII_ONLY.test(query)
      ? this.nameEqualsSymbols('COLLATE NOCASE', query, limit, workspaceRoot)
      : this.foldedNameSymbols(query, limit, workspaceRoot);
  }

  /**
   * Rows whose name holds at least two words of a multi-word query, after
   * camelCase / snake_case splitting (`session budget deadline` finds
   * `SessionBudgetDeadlineMonitor`, which full-text search cannot: the FTS
   * tokenizer keeps an identifier whole). A name word matches a query word it
   * starts with. More matched words rank first, then the shorter name, then
   * file order. SQL keeps only rows that hold at least two words as
   * `LIKE '%word%'` (ASCII case-insensitive; the words are alphanumeric, so
   * they hold no wildcard), so one common word cannot fill the scan with rows
   * that never qualify; the scan reads at most {@link NAME_TOKEN_SCAN_CAP} rows.
   */
  private nameTokenSymbols(
    query: string,
    limit: number,
    workspaceRoot?: string,
  ): CodeSymbolHitRow[] {
    if (!/\s/.test(query)) return [];
    const words = [
      ...new Set(
        identifierWords(query).filter(
          (word) => word.length >= NAME_TOKEN_MIN_LENGTH,
        ),
      ),
    ].slice(0, NAME_TOKEN_MAX_WORDS);
    if (words.length < 2) return [];
    const wsFilter = workspaceRoot ? 'AND cs.workspace_root = ?' : '';
    const scanSql = `
      SELECT cs.rowid AS rowid, cs.symbol_name AS symbol_name
      FROM code_symbols cs
      WHERE (${words.map(() => '(cs.symbol_name LIKE ?)').join(' + ')}) >= 2
      ${wsFilter}
      ORDER BY cs.file_path ASC, cs.rowid ASC
      LIMIT ?
    `;
    const params: unknown[] = words.map((word) => `%${word}%`);
    if (workspaceRoot) params.push(workspaceRoot);
    params.push(NAME_TOKEN_SCAN_CAP);
    const scanned = this.connection.db
      .prepare(scanSql)
      .all(...params) as Array<{
      rowid: number;
      symbol_name: string;
    }>;
    const ranked = scanned
      .map((row, order) => {
        const nameWords = identifierWords(row.symbol_name);
        const matched = words.filter((word) =>
          nameWords.some((nameWord) => nameWord.startsWith(word)),
        ).length;
        return {
          rowid: row.rowid,
          length: row.symbol_name.length,
          matched,
          order,
        };
      })
      .filter((row) => row.matched >= 2)
      .sort(
        (a, b) =>
          b.matched - a.matched || a.length - b.length || a.order - b.order,
      )
      .slice(0, limit);
    if (ranked.length === 0) return [];
    const byRowid = new Map(
      (
        this.connection.db
          .prepare(
            `SELECT ${EXACT_NAME_COLUMNS}
             FROM code_symbols cs
             WHERE cs.rowid IN (${ranked.map(() => '?').join(',')})`,
          )
          .all(...ranked.map((row) => row.rowid)) as CodeSymbolHitRow[]
      ).map((row) => [row.rowid, row]),
    );
    return ranked.flatMap((row) => {
      const full = byRowid.get(row.rowid);
      return full ? [full] : [];
    });
  }

  /**
   * `symbol_name = ?` with the given collation, workspace-scoped, in file-path
   * order, capped at `limit`. With `COLLATE NOCASE` this is the ASCII
   * case-insensitive tier: for an ASCII query it matches exactly the rows the
   * JS fallback would, except that a stored name containing U+212A KELVIN SIGN
   * lowers to ASCII `k` under `toLowerCase()` but is not folded by `NOCASE`, so
   * `kelvin` does not find `Kelvin`. That gap is accepted to keep an ASCII
   * miss off the JS scan.
   */
  private nameEqualsSymbols(
    collation: '' | 'COLLATE NOCASE',
    query: string,
    limit: number,
    workspaceRoot?: string,
  ): CodeSymbolHitRow[] {
    const wsFilter = workspaceRoot ? 'AND cs.workspace_root = ?' : '';
    const sql = `
      SELECT ${EXACT_NAME_COLUMNS}
      FROM code_symbols cs
      WHERE cs.symbol_name = ? ${collation}
      ${wsFilter}
      ORDER BY cs.file_path ASC, cs.rowid ASC
      LIMIT ?
    `;
    const params: unknown[] = [query];
    if (workspaceRoot) params.push(workspaceRoot);
    params.push(limit);
    return this.connection.db.prepare(sql).all(...params) as CodeSymbolHitRow[];
  }

  /**
   * Case-insensitive fallback for a query with non-ASCII characters. SQLite's
   * `NOCASE` folds only ASCII, so the comparison runs in JS with
   * `String.prototype.toLowerCase()`: the Unicode default lowercase mapping,
   * independent of the host locale. `Äpfel` matches `äpfel` and `ẞ` matches
   * `ß`, but there is no full case folding: `STRASSE` does not match `straße`,
   * `İ` lowers to `i` + U+0307 so `İndex` does not match `index`, and `I`
   * always lowers to `i`, never Turkish `ı`.
   *
   * SQL narrows the candidates by character length first. Lowercasing never
   * shortens a string and only U+0130 (`İ`) lengthens, by one, so a matching
   * name has between `L - d` and `L` characters, where `L` is the length of the
   * lowered query and `d` the number of `i` + U+0307 pairs in it. The scan
   * streams only rowid and name in file-path order and stops after `limit`
   * matches; full rows are fetched for the matched rowids alone. The scan is
   * still O(workspace) on a miss; an indexed lowercase-key column would make
   * it a lookup.
   */
  private foldedNameSymbols(
    query: string,
    limit: number,
    workspaceRoot?: string,
  ): CodeSymbolHitRow[] {
    const folded = query.toLowerCase();
    const foldedLength = [...folded].length;
    const dottedI = folded.split('i̇').length - 1;
    const wsFilter = workspaceRoot ? 'AND cs.workspace_root = ?' : '';
    const scanSql = `
      SELECT cs.rowid AS rowid, cs.symbol_name AS symbol_name
      FROM code_symbols cs
      WHERE length(cs.symbol_name) BETWEEN ? AND ?
      ${wsFilter}
      ORDER BY cs.file_path ASC, cs.rowid ASC
    `;
    const params: unknown[] = [foldedLength - dottedI, foldedLength];
    if (workspaceRoot) params.push(workspaceRoot);
    const matchedRowids: number[] = [];
    for (const row of this.connection.db.prepare(scanSql).iterate(...params)) {
      const candidate = row as { rowid: number; symbol_name: string };
      if (candidate.symbol_name.toLowerCase() !== folded) continue;
      matchedRowids.push(candidate.rowid);
      if (matchedRowids.length >= limit) break;
    }
    if (matchedRowids.length === 0) return [];
    const placeholders = matchedRowids.map(() => '?').join(',');
    return this.connection.db
      .prepare(
        `SELECT ${EXACT_NAME_COLUMNS}
         FROM code_symbols cs
         WHERE cs.rowid IN (${placeholders})
         ORDER BY cs.file_path ASC, cs.rowid ASC`,
      )
      .all(...matchedRowids) as CodeSymbolHitRow[];
  }

  private bm25SearchSymbols(
    query: string,
    limit: number,
    workspaceRoot?: string,
  ): CodeSymbolHitRow[] {
    const wsFilter = workspaceRoot ? 'AND cs.workspace_root = ?' : '';
    const sql = `
      SELECT cs.rowid AS rowid, cs.id AS id, cs.workspace_root AS workspace_root,
             cs.file_path AS file_path, cs.kind AS kind, cs.symbol_name AS symbol_name,
             cs.subject AS subject, cs.text AS text, cs.token_count AS token_count
      FROM code_symbols_fts fts
      JOIN code_symbols cs ON cs.rowid = fts.rowid
      WHERE code_symbols_fts MATCH ?
      ${wsFilter}
      ORDER BY bm25(code_symbols_fts) ASC
      LIMIT ?
    `;
    const plan = buildFtsQueryPlan(query);
    const run = (match: string): CodeSymbolHitRow[] => {
      const params: unknown[] = [match];
      if (workspaceRoot) params.push(workspaceRoot);
      params.push(limit);
      const startedAt = performance.now();
      const rows = this.connection.db
        .prepare(sql)
        .all(...params) as CodeSymbolHitRow[];
      const elapsedMs = Math.round(performance.now() - startedAt);
      if (elapsedMs > 200)
        this.logger.warn('[code-symbol-store] slow query', {
          statement: 'code_symbols_fts.bm25',
          elapsedMs,
        });
      return rows;
    };
    try {
      return executeFtsQueryPlan(plan, limit, run, (row) => row.rowid);
    } catch (err: unknown) {
      // degradation-audit: reported - logged at warn here; the caller gets no
      // BM25 hits and ranks on the vector results alone.
      this.logger.warn('[code-symbol-store] BM25 search failed', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  private async vecSearchSymbols(
    query: string,
    limit: number,
    workspaceRoot: string | undefined,
    deadlineMs: number | undefined,
  ): Promise<CodeSymbolHitRow[]> {
    const [vec] = await (this.embedder instanceof HostBridgeEmbedder
      ? this.embedder.embed([query], deadlineMs)
      : this.embedder.embed([query]));
    if (!vec || vec.length !== this.embedder.dim) return [];
    // The caller stopped waiting: skip the synchronous KNN it no longer needs.
    if (remainingMs(deadlineMs) <= 0)
      throw new BudgetExceededError('symbol vector search', 0);
    const buf = Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
    const startedAt = performance.now();
    const distRows = workspaceRoot
      ? scopedVectorCandidates(
          this.connection,
          'code_symbols_vec',
          buf,
          limit,
          'JOIN code_symbols cs ON cs.rowid = candidates.rowid',
          'cs.workspace_root = ?',
          [workspaceRoot],
          this.logger,
        )
      : (this.connection.db
          .prepare(
            `
          SELECT rowid AS rowid, distance AS distance FROM code_symbols_vec
          WHERE embedding MATCH ? ORDER BY distance ASC LIMIT ?
        `,
          )
          .all(buf, Math.min(limit, 100)) as CodeVecRow[]);
    const elapsedMs = Math.round(performance.now() - startedAt);
    if (elapsedMs > 200) {
      this.logger.warn('[code-symbol-store] slow query', {
        statement: 'code_symbols_vec.knn',
        elapsedMs,
      });
    }
    if (distRows.length === 0) return [];
    const placeholders = distRows.map(() => '?').join(',');
    const wsFilter = workspaceRoot ? 'AND cs.workspace_root = ?' : '';
    const sql = `
      SELECT cs.rowid AS rowid, cs.id AS id, cs.workspace_root AS workspace_root,
             cs.file_path AS file_path, cs.kind AS kind, cs.symbol_name AS symbol_name,
             cs.subject AS subject, cs.text AS text, cs.token_count AS token_count
      FROM code_symbols cs
      WHERE cs.rowid IN (${placeholders})
      ${wsFilter}
    `;
    const params: unknown[] = distRows.map((r) => r.rowid);
    if (workspaceRoot) params.push(workspaceRoot);
    const rows = this.connection.db
      .prepare(sql)
      .all(...params) as CodeSymbolHitRow[];
    const byRowid = new Map(rows.map((r) => [r.rowid, r]));
    const out: CodeSymbolHitRow[] = [];
    for (const v of distRows) {
      const row = byRowid.get(v.rowid);
      if (row) out.push(row);
    }
    return out;
  }

  /** Reciprocal Rank Fusion over the exact-name, BM25 and vector result lists, keyed by rowid. */
  private rrfFuseSymbols(
    exact: readonly CodeSymbolHitRow[],
    bm25: readonly CodeSymbolHitRow[],
    vec: readonly CodeSymbolHitRow[],
    limit: number,
    weights: { exact: number; bm25: number; vec: number },
  ): Array<{ row: CodeSymbolHitRow; score: number }> {
    const k = CODE_RRF_K;
    const acc = new Map<number, { row: CodeSymbolHitRow; score: number }>();
    const add = (list: readonly CodeSymbolHitRow[], weight: number): void => {
      list.forEach((row, idx) => {
        const contribution = weight / (k + idx + 1);
        const existing = acc.get(row.rowid);
        if (existing) existing.score += contribution;
        else acc.set(row.rowid, { row, score: contribution });
      });
    };
    add(exact, weights.exact);
    add(bm25, weights.bm25);
    add(vec, weights.vec);
    return Array.from(acc.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  purgeJunk(workspaceRoot?: string | null): number {
    const junkSegments = [
      '/.angular/',
      '/.cache/',
      '/.next/',
      '/.nx/',
      '/.output/',
      '/.turbo/',
      '/.vite/',
      '/.vscode-test/',
      '/build/',
      '/coverage/',
      '/dist/',
      '/node_modules/',
      '/out/',
      '/target/',
      '/tmp/',
    ];
    const db = this.connection.db;
    const vecAvailable = this.reconcileOrphanVecRows();
    const clause = workspaceClause(workspaceRoot);
    const where = `file_path LIKE ? ESCAPE '\\'${
      clause.sql ? ` AND ${clause.sql}` : ''
    }`;
    const selectRowidsStmt = vecAvailable
      ? db.prepare(`SELECT rowid AS rowid FROM code_symbols WHERE ${where}`)
      : null;
    const deleteVecStmt = vecAvailable
      ? db.prepare(`DELETE FROM code_symbols_vec WHERE rowid = ?`)
      : null;
    const deleteSymbolsStmt = db.prepare(
      `DELETE FROM code_symbols WHERE ${where}`,
    );
    const deleteRecordsStmt = db.prepare(
      `DELETE FROM code_symbol_files WHERE ${where}`,
    );
    const patterns = junkSegments.map((segment) => {
      const escaped = segment
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_');
      return `%${escaped}%`;
    });
    type Payload = { readonly patterns: readonly string[] };
    const txnFn = ((payload: Payload): number => {
      let totalDeleted = 0;
      for (const pattern of payload.patterns) {
        if (selectRowidsStmt && deleteVecStmt) {
          const ids = selectRowidsStmt.all(pattern, ...clause.values) as Array<{
            rowid: number;
          }>;
          for (const id of ids) {
            deleteVecStmt.run(id.rowid);
          }
        }
        const removed = deleteSymbolsStmt.run(pattern, ...clause.values);
        deleteRecordsStmt.run(pattern, ...clause.values);
        totalDeleted += removed.changes;
      }
      if (!vecAvailable && totalDeleted > 0) this.markVecStale();
      return totalDeleted;
    }) as unknown as (...args: unknown[]) => unknown;
    const txn = db.transaction(txnFn) as unknown as (p: Payload) => number;
    try {
      const removed = txn({ patterns });
      if (removed > 0) this.revision++;
      return removed;
    } catch (err: unknown) {
      this.connection.handleFatalWriteError(err);
      throw err;
    }
  }

  purgeWorkspace(workspaceRoot: string): number {
    const db = this.connection.db;
    const vecAvailable = this.reconcileOrphanVecRows();
    const selectRowidsStmt = vecAvailable
      ? db.prepare(
          `SELECT rowid AS rowid FROM code_symbols WHERE workspace_root = ?`,
        )
      : null;
    const deleteVecStmt = vecAvailable
      ? db.prepare(`DELETE FROM code_symbols_vec WHERE rowid = ?`)
      : null;
    const deleteSymbolsStmt = db.prepare(
      `DELETE FROM code_symbols WHERE workspace_root = ?`,
    );
    const deleteRecordsStmt = db.prepare(
      `DELETE FROM code_symbol_files WHERE workspace_root = ?`,
    );
    const deleteRootStmt = db.prepare(
      `DELETE FROM code_index_roots WHERE workspace_root = ?`,
    );
    type Payload = { readonly workspaceRoot: string };
    const txnFn = ((payload: Payload): number => {
      deleteRecordsStmt.run(payload.workspaceRoot);
      deleteRootStmt.run(payload.workspaceRoot);
      if (selectRowidsStmt && deleteVecStmt) {
        const ids = selectRowidsStmt.all(payload.workspaceRoot) as Array<{
          rowid: number;
        }>;
        for (const id of ids) {
          deleteVecStmt.run(id.rowid);
        }
      }
      const removed = deleteSymbolsStmt.run(payload.workspaceRoot);
      if (!vecAvailable && removed.changes > 0) this.markVecStale();
      return removed.changes;
    }) as unknown as (...args: unknown[]) => unknown;
    const txn = db.transaction(txnFn) as unknown as (p: Payload) => number;
    try {
      const removed = txn({ workspaceRoot });
      if (removed > 0) this.revision++;
      return removed;
    } catch (err: unknown) {
      this.connection.handleFatalWriteError(err);
      throw err;
    }
  }

  private async embedderEmbed(
    texts: readonly string[],
  ): Promise<Float32Array[]> {
    try {
      return await this.embedder.embed(texts);
    } catch (err) {
      // degradation-audit: reported - logged at warn once per process
      // (embedderWarnedOnce); symbols are stored without vectors.
      if (!this.embedderWarnedOnce) {
        this.embedderWarnedOnce = true;
        this.logger.warn(
          '[code-symbol-store] embedder unavailable; symbols will be stored without vectors until restart',
          {
            error: err instanceof Error ? err.message : String(err),
          },
        );
      }
      return [];
    }
  }
}

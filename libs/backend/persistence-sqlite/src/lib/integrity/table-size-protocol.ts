/**
 * `table-size` command of the integrity worker: a read-only per-b-tree size
 * report over SQLite's `dbstat` virtual table.
 *
 * Non-destructive by construction: the worker opens the database read-only,
 * runs two aggregate SELECTs and returns the largest b-trees. No write, no
 * VACUUM, no deletion. When `dbstat` is not compiled into the SQLite build the
 * reply is a typed `unavailable` result, never a throw.
 */
import { z } from 'zod';

/** Default number of b-trees returned, largest first. */
export const TABLE_SIZE_TOP_N = 25;

/** Ask the worker for a per-table size report. */
export interface TableSizeRequest {
  readonly id: number;
  readonly type: 'table-size';
  /** Absolute path to the database file. Opened read-only, never written. */
  readonly dbPath: string;
  /** Maximum b-trees to return (largest by bytes first). */
  readonly topN: number;
}

export interface TableSizeEntry {
  /** Schema object name (table or index). Not user data. */
  readonly name: string;
  readonly bytes: number;
  readonly pages: number;
}

export interface TableSizeResponse {
  readonly id: number;
  readonly type: 'table-size';
  readonly ok: true;
  /** `unavailable`: `dbstat` missing or the database could not be read. */
  readonly status: 'ok' | 'unavailable';
  readonly totalBytes: number;
  readonly tables: readonly TableSizeEntry[];
  readonly durationMs: number;
  readonly detail: 'dbstat-missing' | 'open-failed' | 'query-failed' | null;
}

/** The slice of a read-only database connection this command needs. */
export interface TableSizeDatabase {
  prepare(sql: string): { all(...params: unknown[]): unknown[] };
}

export interface TableSizeEnvironment {
  readonly openReadOnly: (dbPath: string) => TableSizeDatabase;
  readonly now: () => number;
}

const tableSizeRequestSchema = z.object({
  type: z.literal('table-size'),
  id: z.number(),
  dbPath: z.string().min(1),
  topN: z.number().int().positive().max(1000),
});

const rowSchema = z.object({
  name: z.string(),
  bytes: z.number(),
  pages: z.number(),
});

export function isTableSizeRequest(msg: unknown): msg is TableSizeRequest {
  return tableSizeRequestSchema.safeParse(msg).success;
}

/** Narrow a worker reply to the `table-size` response. */
export function asTableSizeResponse(msg: unknown): TableSizeResponse | null {
  if (typeof msg !== 'object' || msg === null) return null;
  const candidate = msg as Partial<TableSizeResponse>;
  if (
    candidate.type !== 'table-size' ||
    candidate.ok !== true ||
    typeof candidate.id !== 'number' ||
    (candidate.status !== 'ok' && candidate.status !== 'unavailable') ||
    typeof candidate.totalBytes !== 'number' ||
    !Array.isArray(candidate.tables) ||
    typeof candidate.durationMs !== 'number' ||
    !(candidate.detail === null || candidate.detail === 'dbstat-missing' || candidate.detail === 'open-failed' || candidate.detail === 'query-failed')
  ) {
    return null;
  }
  return candidate as TableSizeResponse;
}

const TOP_SQL =
  'SELECT name, SUM(pgsize) AS bytes, COUNT(*) AS pages FROM dbstat ' +
  'GROUP BY name ORDER BY bytes DESC, name ASC LIMIT ?';
const TOTAL_SQL = 'SELECT COALESCE(SUM(pgsize), 0) AS bytes FROM dbstat';

function unavailable(
  request: TableSizeRequest,
  startedAt: number,
  now: () => number,
  detail: Exclude<TableSizeResponse['detail'], null>,
): TableSizeResponse {
  return {
    id: request.id,
    type: 'table-size',
    ok: true,
    status: 'unavailable',
    totalBytes: 0,
    tables: [],
    durationMs: now() - startedAt,
    detail,
  };
}

/**
 * Run the report. Never throws: every failure maps to `unavailable`.
 * `close` is called on the connection when the opener returned one.
 */
export function performTableSizeReport(
  env: TableSizeEnvironment,
  request: TableSizeRequest,
): TableSizeResponse {
  const startedAt = env.now();
  let db: (TableSizeDatabase & { close?: () => void }) | null = null;
  let opened = false;
  try {
    db = env.openReadOnly(request.dbPath);
    opened = true;
    const rows = db.prepare(TOP_SQL).all(request.topN);
    const totalRows = db.prepare(TOTAL_SQL).all();
    const tables = rows.map((row) => rowSchema.parse(row));
    const total = z.object({ bytes: z.number() }).parse(totalRows[0]);
    return {
      id: request.id,
      type: 'table-size',
      ok: true,
      status: 'ok',
      totalBytes: total.bytes,
      tables,
      durationMs: env.now() - startedAt,
      detail: null,
    };
  } catch (error: unknown) {
    // The reply carries a bounded reason; exception text may contain a path.
    const detail = !opened ? 'open-failed'
      : error instanceof Error && /no such table: dbstat/i.test(error.message)
        ? 'dbstat-missing' : 'query-failed';
    return unavailable(request, startedAt, env.now, detail);
  } finally {
    try {
      db?.close?.();
    } catch {
      // degradation-audit: optional-capability - a close failure says nothing about the report.
    }
  }
}

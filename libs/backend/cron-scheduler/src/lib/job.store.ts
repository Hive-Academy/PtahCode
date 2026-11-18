/**
 * JobStore — CRUD over `scheduled_jobs` (schema 0004_cron.sql + 0076).
 *
 * Owns nothing beyond SQL generation + row mapping. Connection lifecycle is
 * handled by `SqliteConnectionService`; we re-resolve the prepared statement
 * each call rather than caching, since better-sqlite3 prepares are cheap
 * (~microseconds) and caching across reopens would be a footgun.
 *
 * IDs are ULIDs (architecture §8.5). The store is the only authority that
 * generates them: callers send `CreateJobInput` (no id) and we mint one.
 */
import { inject, injectable } from 'tsyringe';
import { ulid } from 'ulid';
import {
  PERSISTENCE_TOKENS,
  SqliteConnectionService,
} from '@ptah-extension/persistence-sqlite';
import { TOKENS, type Logger } from '@ptah-extension/vscode-core';
import { JobId } from '@ptah-extension/shared';
import { normalizeWorkspaceRoot } from './normalize-workspace-root';
import type {
  CreateJobInput,
  CronJobCreator,
  JobRunStatus,
  ScheduledJob,
  UpdateJobPatch,
  UpsertJobInput,
} from './types';

interface ScheduledJobRow {
  id: string;
  name: string;
  cron_expr: string;
  timezone: string;
  prompt: string;
  workspace_root: string | null;
  enabled: number;
  created_at: number;
  updated_at: number;
  last_run_at: number | null;
  next_run_at: number | null;
  created_by_kind: string;
  created_by_session_id: string | null;
  /** Correlated subquery column, see {@link SELECT_JOBS}. */
  last_run_status: JobRunStatus | null;
}

/**
 * Job columns plus the status of the newest run, in ONE query. The correlated
 * subquery is served by `idx_job_runs_job(job_id, scheduled_for DESC)` from
 * 0004, so it costs one index seek per job — no N+1 round trips.
 */
const SELECT_JOBS = `SELECT j.*,
  (SELECT r.status FROM job_runs r
    WHERE r.job_id = j.id
    ORDER BY r.scheduled_for DESC
    LIMIT 1) AS last_run_status
  FROM scheduled_jobs j`;

export interface IJobStore {
  create(input: CreateJobInput): ScheduledJob;
  get(id: JobId): ScheduledJob | null;
  list(filter?: {
    enabledOnly?: boolean;
    workspaceRoot?: string;
  }): ScheduledJob[];
  update(id: JobId, patch: UpdateJobPatch): ScheduledJob;
  delete(id: JobId): boolean;
  /**
   * Insert-or-replace a job with a caller-supplied ID. When a row with the
   * same `id` already exists the existing row is fully replaced. Used for
   * system jobs (e.g. `@ptah/daily-backup`) whose IDs are deterministic and
   * must survive repeated boot cycles without creating duplicates.
   *
   * System job IDs are arbitrary strings (not required to be ULIDs). The
   * returned `ScheduledJob.id` carries the raw string cast to `JobId`.
   */
  upsert(input: UpsertJobInput): ScheduledJob;
}

@injectable()
export class JobStore implements IJobStore {
  constructor(
    @inject(PERSISTENCE_TOKENS.SQLITE_CONNECTION)
    private readonly sqlite: SqliteConnectionService,
    @inject(TOKENS.LOGGER) private readonly logger: Logger,
  ) {}

  create(input: CreateJobInput): ScheduledJob {
    const now = Date.now();
    const id = ulid();
    const tz = input.timezone ?? 'UTC';
    const enabled = input.enabled === false ? 0 : 1;
    const workspaceRoot = input.workspaceRoot ?? null;
    const createdBy: CronJobCreator = input.createdBy ?? { kind: 'user' };
    this.sqlite.db
      .prepare(
        `INSERT INTO scheduled_jobs
         (id, name, cron_expr, timezone, prompt, workspace_root, enabled,
          created_at, updated_at, last_run_at, next_run_at,
          created_by_kind, created_by_session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.cronExpr,
        tz,
        input.prompt,
        workspaceRoot,
        enabled,
        now,
        now,
        input.nextRunAt,
        createdBy.kind,
        createdBy.kind === 'session' ? createdBy.sessionId : null,
      );
    this.logger.debug('[cron-scheduler] job created', { id, name: input.name });
    return {
      id: JobId.from(id),
      name: input.name,
      cronExpr: input.cronExpr,
      timezone: tz,
      prompt: input.prompt,
      workspaceRoot,
      enabled: enabled === 1,
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
      nextRunAt: input.nextRunAt,
      createdBy,
      lastRunStatus: null,
    };
  }

  get(id: JobId): ScheduledJob | null {
    const row = this.sqlite.db
      .prepare(`${SELECT_JOBS} WHERE j.id = ?`)
      .get(id) as ScheduledJobRow | undefined;
    return row ? mapRow(row) : null;
  }

  list(filter?: {
    enabledOnly?: boolean;
    workspaceRoot?: string;
  }): ScheduledJob[] {
    // `enabledOnly` stays a parameterized-free SQL predicate (bounded, cheap).
    // The `workspaceRoot` filter is applied in JS rather than SQL: the match
    // must be against a *normalized* key (trailing-separator strip, drive-case
    // fold) that SQLite cannot reproduce, and legacy rows hold un-normalized
    // `workspace_root` values written before this normalization existed.
    // Comparing normalized values on both sides in TypeScript fixes those
    // legacy rows without a migration; the scheduled_jobs table is small
    // (user-authored jobs), so the full scan is negligible.
    const where = filter?.enabledOnly ? ' WHERE j.enabled = 1' : '';
    const sql = `${SELECT_JOBS}${where} ORDER BY j.created_at ASC`;
    const rows = this.sqlite.db.prepare(sql).all() as ScheduledJobRow[];
    const jobs = rows.map(mapRow);
    if (filter?.workspaceRoot === undefined) return jobs;
    const wanted = normalizeWorkspaceRoot(filter.workspaceRoot);
    return jobs.filter(
      (job) =>
        job.workspaceRoot !== null &&
        normalizeWorkspaceRoot(job.workspaceRoot) === wanted,
    );
  }

  update(id: JobId, patch: UpdateJobPatch): ScheduledJob {
    const existing = this.get(id);
    if (!existing) {
      throw new Error(`JobStore.update: no scheduled_job with id ${id}`);
    }
    const merged: ScheduledJob = {
      ...existing,
      ...{
        name: patch.name ?? existing.name,
        cronExpr: patch.cronExpr ?? existing.cronExpr,
        timezone: patch.timezone ?? existing.timezone,
        prompt: patch.prompt ?? existing.prompt,
        workspaceRoot:
          patch.workspaceRoot === undefined
            ? existing.workspaceRoot
            : patch.workspaceRoot,
        enabled: patch.enabled === undefined ? existing.enabled : patch.enabled,
        nextRunAt:
          patch.nextRunAt === undefined ? existing.nextRunAt : patch.nextRunAt,
        lastRunAt:
          patch.lastRunAt === undefined ? existing.lastRunAt : patch.lastRunAt,
      },
      updatedAt: Date.now(),
    };
    this.sqlite.db
      .prepare(
        `UPDATE scheduled_jobs SET
           name = ?, cron_expr = ?, timezone = ?, prompt = ?,
           workspace_root = ?, enabled = ?, updated_at = ?,
           last_run_at = ?, next_run_at = ?
         WHERE id = ?`,
      )
      .run(
        merged.name,
        merged.cronExpr,
        merged.timezone,
        merged.prompt,
        merged.workspaceRoot,
        merged.enabled ? 1 : 0,
        merged.updatedAt,
        merged.lastRunAt,
        merged.nextRunAt,
        id,
      );
    return merged;
  }

  delete(id: JobId): boolean {
    const result = this.sqlite.db
      .prepare('DELETE FROM scheduled_jobs WHERE id = ?')
      .run(id);
    return result.changes > 0;
  }

  /**
   * Insert-or-replace a job using a caller-supplied ID.
   * If a row with the same `id` already exists it is fully replaced
   * (timestamps reset to now). Subsequent boots calling `upsert` with the
   * same `id` update the schedule without creating duplicates. System jobs
   * are owned by the user: the creator columns keep their default.
   */
  upsert(input: UpsertJobInput): ScheduledJob {
    const now = Date.now();
    const tz = input.timezone ?? 'UTC';
    const enabled = input.enabled === false ? 0 : 1;
    const workspaceRoot = input.workspaceRoot ?? null;
    const nextRunAt = input.nextRunAt ?? null;
    this.sqlite.db
      .prepare(
        `INSERT INTO scheduled_jobs
         (id, name, cron_expr, timezone, prompt, workspace_root, enabled,
          created_at, updated_at, last_run_at, next_run_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
         ON CONFLICT(id) DO UPDATE SET
           name          = excluded.name,
           cron_expr     = excluded.cron_expr,
           timezone      = excluded.timezone,
           prompt        = excluded.prompt,
           workspace_root = excluded.workspace_root,
           enabled       = excluded.enabled,
           updated_at    = excluded.updated_at,
           next_run_at   = excluded.next_run_at`,
      )
      .run(
        input.id,
        input.name,
        input.cronExpr,
        tz,
        input.prompt,
        workspaceRoot,
        enabled,
        now,
        now,
        nextRunAt,
      );
    this.logger.debug('[cron-scheduler] job upserted', {
      id: input.id,
      name: input.name,
    });
    // Read the row back: on a conflict the stored creation time, last run
    // and creator stay, so the input alone does not describe the job.
    const stored = this.get(input.id as unknown as JobId);
    if (stored) return stored;
    return {
      id: input.id as unknown as JobId,
      name: input.name,
      cronExpr: input.cronExpr,
      timezone: tz,
      prompt: input.prompt,
      workspaceRoot,
      enabled: enabled === 1,
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
      nextRunAt,
      createdBy: { kind: 'user' },
      lastRunStatus: null,
    };
  }
}

function mapRow(row: ScheduledJobRow): ScheduledJob {
  return {
    id: row.id as unknown as JobId,
    name: row.name,
    cronExpr: row.cron_expr,
    timezone: row.timezone,
    prompt: row.prompt,
    workspaceRoot: row.workspace_root,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastRunAt: row.last_run_at,
    nextRunAt: row.next_run_at,
    createdBy: mapCreator(row),
    lastRunStatus: row.last_run_status ?? null,
  };
}

/**
 * The CHECK constraint allows only 'user' | 'session'. A 'session' row with a
 * NULL id cannot be linked to a session, so it reads as the user.
 */
function mapCreator(row: ScheduledJobRow): CronJobCreator {
  if (row.created_by_kind === 'session' && row.created_by_session_id) {
    return { kind: 'session', sessionId: row.created_by_session_id };
  }
  return { kind: 'user' };
}

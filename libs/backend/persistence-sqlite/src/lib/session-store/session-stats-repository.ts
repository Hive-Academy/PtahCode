import { z } from 'zod';
import { PHASE_KINDS } from '@ptah-extension/shared';
import type { UsageExecutorType } from '@ptah-extension/platform-core';
import type { Logger } from '@ptah-extension/vscode-core';
import type { SqliteDatabase } from '../sqlite-connection.service';

const safeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const text = z.string().min(1);
export const usagePhaseKindSchema = z.enum(PHASE_KINDS);
export const usageExecutorTypeSchema: z.ZodType<UsageExecutorType> = z.enum(['sdk-subagent', 'session', 'lane']);
export type { UsageExecutorType } from '@ptah-extension/platform-core';

export const sessionUsageContributionSchema = z.object({
  sessionId: text,
  producer: text,
  runId: text,
  turnId: z.string(),
  eventKey: text,
  modelId: text,
  providerId: text,
  occurredAtMs: safeInteger,
  inputTokens: safeInteger.nullable(),
  outputTokens: safeInteger.nullable(),
  cacheReadTokens: safeInteger.nullable(),
  cacheWriteTokens: safeInteger.nullable(),
  knownCostMicroUsd: safeInteger.nullable(),
  costAuthority: z.enum(['provider-reported', 'model-priced', 'unpriced']),
  source: z.enum(['live', 'replay', 'estimated']),
  nativeThreadId: text.nullable().optional(),
  repositoryId: text.nullable().optional(),
  worktreePath: text.nullable().optional(),
  missingReason: z.string().nullable().optional(),
  billable: z.boolean().optional(),
  coverageStartMs: safeInteger.nullable().optional(),
  coverageEndMs: safeInteger.nullable().optional(),
  pricingVersion: text.nullable(),
  revision: safeInteger,
  runCostSnapshot: z.boolean().optional(),
  workspaceKey: text.nullable().optional(),
  host: text.nullable().optional(),
  phaseKind: usagePhaseKindSchema.nullable().optional(),
  executorType: usageExecutorTypeSchema.nullable().optional(),
});

export type SessionUsageContribution = z.infer<
  typeof sessionUsageContributionSchema
>;

const statsRowSchema = z.object({
  session_id: z.string(),
  host: z.string(),
  workspace_key: z.string().nullable(),
  provider_id: z.string(),
  started_at_ms: safeInteger,
  last_usage_at_ms: safeInteger,
  finalized_at_ms: safeInteger.nullable(),
  status: z.string(),
  input_tokens: safeInteger,
  output_tokens: safeInteger,
  cache_read_tokens: safeInteger,
  cache_write_tokens: safeInteger,
  known_cost_micro_usd: safeInteger.nullable(),
  has_unpriced: z.number().int().min(0).max(1),
  source: z.string(),
  pricing_version: z.string().nullable(),
  revision: safeInteger,
  updated_at_ms: safeInteger,
  finalize_revision: safeInteger.nullable(),
  finalize_attempts: safeInteger,
  finalize_retry_at_ms: safeInteger,
  repository_id: z.string().nullable(),
  worktree_path: z.string().nullable(),
  missing_reason: z.string().nullable(),
});
export type SessionStatsRow = z.infer<typeof statsRowSchema>;

const groupedRowSchema = z.object({
  day: z.string(),
  provider_id: z.string(),
  model_id: z.string(),
  source: z.string(),
  cost_authority: z.string(),
  input_tokens: safeInteger,
  output_tokens: safeInteger,
  cache_read_tokens: safeInteger,
  cache_write_tokens: safeInteger,
  known_cost_micro_usd: safeInteger.nullable(),
  has_unpriced: z.number().int().min(0).max(1),
  session_count: safeInteger,
});
export type SessionUsageGroup = z.infer<typeof groupedRowSchema>;

const dimensionTotalSchema = z.object({
  dimension: z.string(),
  input_tokens: safeInteger,
  output_tokens: safeInteger,
  cache_read_tokens: safeInteger,
  cache_write_tokens: safeInteger,
  known_cost_micro_usd: safeInteger.nullable(),
  has_unpriced: z.number().int().min(0).max(1),
});
export type UsageDimensionTotal = z.infer<typeof dimensionTotalSchema>;

const topSessionSchema = z.object({
  session_id: z.string(),
  title: z.string(),
  provider_id: z.string(),
  model_id: z.string(),
  last_active_ms: safeInteger,
  message_count: safeInteger,
  known_cost_micro_usd: safeInteger.nullable(),
  has_unpriced: z.number().int().min(0).max(1),
  input_tokens: safeInteger,
  output_tokens: safeInteger,
  cache_read_tokens: safeInteger,
  cache_write_tokens: safeInteger,
});
export type TopUsageSession = z.infer<typeof topSessionSchema>;

const sessionModelRowSchema = z.object({
  model_id: z.string(),
  input_tokens: safeInteger,
  output_tokens: safeInteger,
  cache_read_tokens: safeInteger,
  cache_write_tokens: safeInteger,
  known_cost_micro_usd: safeInteger.nullable(),
  has_unpriced: z.number().int().min(0).max(1),
});
export type SessionModelUsageRow = z.infer<typeof sessionModelRowSchema>;

const coverageRowSchema = z.object({
  first_captured_at_ms: safeInteger,
  last_captured_at_ms: safeInteger,
});
export type SessionUsageCoverage = z.infer<typeof coverageRowSchema>;

export interface UnresolvedRepositoryUsageRow {
  rowId: number;
  sessionId: string;
  workspacePath: string | null;
}

export interface RepositoryUsageTotals {
  repositoryId: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  knownCostMicroUsd: number | null;
  hasUnknownTokens: boolean;
  worktreePaths: string[];
}

/** One SQLite transaction per accepted contribution. Duplicate and older revisions are ignored. */
export class SessionStatsRepository {
  constructor(
    private readonly store: {
      ready(): Promise<Pick<SqliteDatabase, 'exec' | 'prepare'>>;
    },
    private readonly logger?: Pick<Logger, 'error'>,
  ) {}

  /** Scan by row ID so an unresolved path is not retried in the same pass. */
  async getUnresolvedRepositoryUsagePage(afterRowId: number, limit = 200): Promise<UnresolvedRepositoryUsageRow[]> {
    const db = await this.store.ready();
    const rows: unknown[] = db.prepare(`SELECT t.rowid AS rowId, t.session_id AS sessionId,
      COALESCE(t.worktree_path, s.workspace_path, t.workspace_key, s.workspace_key) AS workspacePath
      FROM session_usage_turns t LEFT JOIN sessions s ON s.session_id = t.session_id
      WHERE t.repository_id IS NULL AND t.rowid > ? ORDER BY t.rowid LIMIT ?`)
      .all(safeInteger.parse(afterRowId), safeInteger.parse(limit));
    return rows.map((row) => z.object({ rowId: safeInteger, sessionId: text, workspacePath: text.nullable() }).parse(row));
  }

  async setRepositoryUsageIdentity(rows: readonly { rowId: number; repositoryId: string; worktreePath: string }[]): Promise<number> {
    if (rows.length === 0) return 0;
    const db = await this.store.ready();
    let updated = 0;
    db.exec('BEGIN IMMEDIATE');
    try {
      const updateTurn = db.prepare(`UPDATE session_usage_turns SET repository_id = ?, worktree_path = ?
        WHERE rowid = ? AND repository_id IS NULL`);
      const updateStats = db.prepare(`UPDATE session_stats SET repository_id = ?, worktree_path = ?
        WHERE session_id = (SELECT session_id FROM session_usage_turns WHERE rowid = ?)
        AND repository_id IS NULL`);
      for (const row of rows) {
        const repositoryId = text.parse(row.repositoryId);
        const worktreePath = text.parse(row.worktreePath);
        const rowId = safeInteger.parse(row.rowId);
        updated += updateTurn.run(repositoryId, worktreePath, rowId).changes;
        updateStats.run(repositoryId, worktreePath, rowId);
      }
      db.exec('COMMIT');
      return updated;
    } catch (error: unknown) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  async getRepositoryUsageTotals(repositoryId: string, fromMs: number, untilMs: number): Promise<RepositoryUsageTotals> {
    const db = await this.store.ready();
    const scope = text.parse(repositoryId);
    const from = safeInteger.parse(fromMs);
    const until = safeInteger.parse(untilMs);
    if (until <= from) throw new Error('Usage range must be increasing');
    const row: unknown = db.prepare(`SELECT COALESCE(SUM(input_tokens),0) AS inputTokens,
      COALESCE(SUM(output_tokens),0) AS outputTokens,
      COALESCE(SUM(cache_read_tokens),0) AS cacheReadTokens,
      COALESCE(SUM(cache_write_tokens),0) AS cacheWriteTokens,
      SUM(known_cost_micro_usd) AS knownCostMicroUsd,
      COALESCE(MAX(input_tokens IS NULL OR output_tokens IS NULL OR cache_read_tokens IS NULL OR cache_write_tokens IS NULL),0) AS hasUnknownTokens
      FROM session_usage_turns WHERE repository_id = ? AND billable = 1
      AND occurred_at_ms >= ? AND occurred_at_ms < ?`).get(scope, from, until);
    const totals = z.object({ inputTokens: safeInteger, outputTokens: safeInteger,
      cacheReadTokens: safeInteger, cacheWriteTokens: safeInteger,
      knownCostMicroUsd: safeInteger.nullable(), hasUnknownTokens: z.number().int().min(0).max(1) }).parse(row);
    const paths: unknown[] = db.prepare(`SELECT DISTINCT worktree_path AS path FROM session_usage_turns
      WHERE repository_id = ? AND billable = 1 AND worktree_path IS NOT NULL
      AND occurred_at_ms >= ? AND occurred_at_ms < ? ORDER BY worktree_path`).all(scope, from, until);
    return { repositoryId: scope, inputTokens: totals.inputTokens, outputTokens: totals.outputTokens,
      cacheReadTokens: totals.cacheReadTokens, cacheWriteTokens: totals.cacheWriteTokens,
      knownCostMicroUsd: totals.knownCostMicroUsd, hasUnknownTokens: totals.hasUnknownTokens === 1,
      worktreePaths: paths.map((path) => z.object({ path: text }).parse(path).path) };
  }

  /** Repository identities observed in one workspace/window, capped for the RPC payload. */
  async getWorkspaceRepositoryIds(workspaceKey: string, fromMs: number, untilMs: number): Promise<string[]> {
    const db = await this.store.ready();
    const from = safeInteger.parse(fromMs);
    const until = safeInteger.parse(untilMs);
    if (until <= from) throw new Error('Usage range must be increasing');
    const rows: unknown[] = db.prepare(`SELECT DISTINCT t.repository_id AS repositoryId FROM session_usage_turns t
      LEFT JOIN sessions s ON s.session_id = t.session_id
      WHERE COALESCE(s.workspace_key, t.workspace_key) = ? AND t.repository_id IS NOT NULL AND t.billable = 1
      AND t.occurred_at_ms >= ? AND t.occurred_at_ms < ? ORDER BY t.repository_id LIMIT 100`)
      .all(text.parse(workspaceKey), from, until);
    return rows.map((row) => z.object({ repositoryId: text }).parse(row).repositoryId);
  }


  async recordUsage(value: SessionUsageContribution): Promise<void> {
    await this.recordEvent([value]);
  }

  async recordEvent(
    values: readonly SessionUsageContribution[],
  ): Promise<void> {
    if (values.length === 0) return;
    const db = await this.store.ready();
    db.exec('BEGIN IMMEDIATE');
    try {
      this.writeEventInTransaction(db, values);
      db.exec('COMMIT');
    } catch (error: unknown) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  /** Write one event on the caller's connection without taking ownership of its transaction. */
  writeEventInTransaction(
    db: Pick<SqliteDatabase, 'exec' | 'prepare'>,
    values: readonly SessionUsageContribution[],
  ): void {
    if (values.length === 0) return;
    const inputs = values.map((value) =>
      sessionUsageContributionSchema.parse(value),
    );
    const first = inputs[0];
    if (!first || inputs.some((input) => input.sessionId !== first.sessionId || input.producer !== first.producer || input.eventKey !== first.eventKey || input.revision !== first.revision || input.runCostSnapshot !== first.runCostSnapshot)) {
      throw new Error('Usage event rows must share one identity and revision');
    }
    if (new Set(inputs.map((input) => input.modelId)).size !== inputs.length) {
      throw new Error('Usage event contains duplicate model rows');
    }
      const prior = db.prepare(`SELECT MAX(revision) AS revision,
        MAX(cost_authority = 'provider-reported') AS reported
        FROM session_usage_turns WHERE session_id = ? AND event_key = ?`)
        .get(first.sessionId, first.eventKey) as { revision: number | null; reported: number | null };
      const owner = db.prepare('SELECT producer FROM session_usage_turns WHERE session_id = ? AND event_key = ? LIMIT 1')
        .get(first.sessionId, first.eventKey) as { producer: string } | undefined;
      if (owner && owner.producer !== first.producer) throw new Error('Usage key belongs to another producer');
      if (prior.revision !== null && (first.revision < prior.revision ||
        (first.revision === prior.revision && (prior.reported === 1 || !inputs.some((input) => input.costAuthority === 'provider-reported')) &&
          !(prior.reported !== 1 && first.missingReason === null &&
            db.prepare(`SELECT 1 FROM session_usage_turns WHERE session_id = ? AND event_key = ?
              AND missing_reason = 'aborted-before-result' LIMIT 1`).get(first.sessionId, first.eventKey))))) {
        return;
      }
      if (first.runCostSnapshot) {
        if (first.producer !== 'sdk-owner') throw new Error('Only SDK owner can reprice a run');
        db.prepare(`UPDATE session_usage_turns SET known_cost_micro_usd = 0,
          cost_authority = 'model-priced'
          WHERE session_id = ? AND producer = ? AND run_id = ?`)
          .run(first.sessionId, first.producer, first.runId);
      }
      const priorCodexThreads = first.source === 'live' && ['codex', 'openai-codex'].includes(first.providerId)
        && ['codex-checkpoint', 'cli-lane'].includes(first.producer)
        ? db.prepare(`SELECT DISTINCT COALESCE(native_thread_id, CASE WHEN producer = 'codex-checkpoint' THEN run_id END) AS thread
          FROM session_usage_turns WHERE session_id = ? AND producer = ? AND event_key = ?`)
          .all(first.sessionId, first.producer, first.eventKey) as { thread: string | null }[]
        : [];
      const incomingModels = inputs.map((input) => input.modelId);
      db.prepare(`DELETE FROM session_usage_turns WHERE session_id = ? AND producer = ?
        AND event_key = ? AND model_id NOT IN (${incomingModels.map(() => '?').join(',')})`)
        .run(first.sessionId, first.producer, first.eventKey, ...incomingModels);
      const statement = db.prepare(`INSERT INTO session_usage_turns (
        session_id, producer, run_id, turn_id, model_id, event_key, occurred_at_ms,
        provider_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
        known_cost_micro_usd, cost_authority, source, pricing_version, revision,
        workspace_key, host, native_thread_id, repository_id, worktree_path,
        missing_reason, billable, coverage_start_ms, coverage_end_ms, phase_kind, executor_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id,event_key,model_id) DO UPDATE SET
        occurred_at_ms=excluded.occurred_at_ms, input_tokens=excluded.input_tokens,
        output_tokens=excluded.output_tokens, cache_read_tokens=excluded.cache_read_tokens,
        cache_write_tokens=excluded.cache_write_tokens,
        known_cost_micro_usd=COALESCE(excluded.known_cost_micro_usd,session_usage_turns.known_cost_micro_usd),
        cost_authority=excluded.cost_authority, source=excluded.source,
        pricing_version=excluded.pricing_version, revision=excluded.revision,
        workspace_key=excluded.workspace_key, host=excluded.host,
        native_thread_id=excluded.native_thread_id, repository_id=excluded.repository_id,
        worktree_path=excluded.worktree_path, missing_reason=excluded.missing_reason,
        billable=excluded.billable, coverage_start_ms=excluded.coverage_start_ms,
        coverage_end_ms=excluded.coverage_end_ms,
        phase_kind=excluded.phase_kind, executor_type=excluded.executor_type`);
      for (const input of inputs) {
        statement.run(
          input.sessionId,
          input.producer,
          input.runId,
          input.turnId,
          input.modelId,
          input.eventKey,
          input.occurredAtMs,
          input.providerId,
          input.inputTokens,
          input.outputTokens,
          input.cacheReadTokens,
          input.cacheWriteTokens,
          input.knownCostMicroUsd,
          input.costAuthority,
          input.source,
          input.pricingVersion,
          input.revision,
          input.workspaceKey ?? null,
          input.host ?? null,
          input.nativeThreadId ?? null,
          input.repositoryId ?? null,
          input.worktreePath ?? null,
          input.missingReason ?? null,
          input.billable === false ? 0 : 1,
          input.coverageStartMs ?? null,
          input.coverageEndMs ?? null,
          input.phaseKind ?? null,
          input.executorType ?? null,
        );
      }
      const affectedReplaySessions: string[] = [];
      const liveCodexThread = first.source === 'live' && ['codex', 'openai-codex'].includes(first.providerId)
        ? first.producer === 'codex-checkpoint' ? first.nativeThreadId ?? first.runId
          : first.producer === 'cli-lane' ? first.nativeThreadId ?? null : null
        : null;
      for (const thread of new Set([...priorCodexThreads.map((row) => row.thread), liveCodexThread].filter((value): value is string => value !== null))) {
        const affected = db.prepare(`SELECT DISTINCT session_id FROM session_usage_turns
          WHERE provider_id IN ('codex', 'openai-codex') AND source = 'live'
            AND (native_thread_id = ? OR (producer = 'codex-checkpoint' AND run_id = ?))`)
          .all(thread, thread) as { session_id: string }[];
        affectedReplaySessions.push(...affected.map((row) => row.session_id));
        db.prepare(`UPDATE session_usage_turns AS lane SET billable = CASE
          WHEN lane.input_tokens IS NULL AND lane.output_tokens IS NULL
            AND lane.cache_read_tokens IS NULL AND lane.cache_write_tokens IS NULL THEN 0
          WHEN EXISTS (SELECT 1 FROM session_usage_turns AS checkpoint
            WHERE checkpoint.producer = 'codex-checkpoint' AND checkpoint.source = 'live'
              AND checkpoint.provider_id IN ('codex', 'openai-codex') AND checkpoint.billable = 1
              AND COALESCE(checkpoint.native_thread_id, checkpoint.run_id) = lane.native_thread_id
              AND (checkpoint.input_tokens IS NOT NULL OR checkpoint.output_tokens IS NOT NULL
                OR checkpoint.cache_read_tokens IS NOT NULL OR checkpoint.cache_write_tokens IS NOT NULL)
              AND (checkpoint.coverage_start_ms IS NULL OR lane.coverage_end_ms IS NULL
                OR checkpoint.coverage_start_ms <= lane.coverage_end_ms)
              AND (lane.coverage_start_ms IS NULL OR checkpoint.coverage_end_ms IS NULL
                OR lane.coverage_start_ms <= checkpoint.coverage_end_ms)) THEN 0
          ELSE 1 END
          WHERE lane.source = 'live' AND lane.producer = 'cli-lane'
            AND lane.provider_id IN ('codex', 'openai-codex') AND lane.native_thread_id = ?`)
          .run(thread);
        const replaySessions = db.prepare(`SELECT DISTINCT session_id FROM session_usage_turns
          WHERE source = 'replay' AND provider_id IN ('codex', 'openai-codex') AND native_thread_id = ?`)
          .all(thread) as { session_id: string }[];
        affectedReplaySessions.push(...replaySessions.map((row) => row.session_id));
        db.prepare(`UPDATE session_usage_turns AS replay SET billable = CASE
          WHEN replay.missing_reason = 'unmatched-provider-event' THEN 0
          WHEN EXISTS (SELECT 1 FROM session_usage_turns AS live
            WHERE live.source = 'live' AND live.provider_id IN ('codex', 'openai-codex') AND live.billable = 1
              AND ((live.producer = 'codex-checkpoint' AND
                COALESCE(live.native_thread_id, live.run_id) = replay.native_thread_id)
                OR (live.producer = 'cli-lane' AND live.native_thread_id = replay.native_thread_id))
              AND (live.input_tokens IS NOT NULL OR live.output_tokens IS NOT NULL
                OR live.cache_read_tokens IS NOT NULL OR live.cache_write_tokens IS NOT NULL)
              AND (live.coverage_start_ms IS NULL OR replay.occurred_at_ms >= live.coverage_start_ms)
              AND (live.coverage_end_ms IS NULL OR replay.occurred_at_ms <= live.coverage_end_ms)) THEN 0
          ELSE 1 END
          WHERE replay.source = 'replay' AND replay.provider_id IN ('codex', 'openai-codex')
            AND replay.native_thread_id = ?`).run(thread);
      }
      if (first.source === 'live' && first.billable !== false &&
        !(first.producer === 'cli-lane' && ['codex', 'openai-codex'].includes(first.providerId) && !first.nativeThreadId) &&
        inputs.some((row) => row.inputTokens !== null || row.outputTokens !== null || row.cacheReadTokens !== null || row.cacheWriteTokens !== null)) {
        const codexThread = first.producer === 'codex-checkpoint'
          ? first.nativeThreadId ?? first.runId
          : first.producer === 'cli-lane' && ['codex', 'openai-codex'].includes(first.providerId)
            ? first.nativeThreadId ?? null : null;
        const ownership = codexThread === null
          ? `session_id = ? AND (native_thread_id IS ? OR ? IS NULL)`
          : `native_thread_id = ?`;
        const args = codexThread === null
          ? [first.sessionId, first.nativeThreadId ?? null, first.nativeThreadId ?? null]
          : [codexThread];
        const affected = db.prepare(`SELECT DISTINCT session_id FROM session_usage_turns
          WHERE source = 'replay' AND billable = 1 AND provider_id = ? AND ${ownership}
           AND (? IS NULL OR occurred_at_ms >= ?)
           AND (? IS NULL OR occurred_at_ms <= ?)`).all(first.providerId, ...args,
            first.coverageStartMs ?? null, first.coverageStartMs ?? null, first.coverageEndMs ?? null, first.coverageEndMs ?? null) as { session_id: string }[];
        affectedReplaySessions.push(...affected.map((row) => row.session_id));
        db.prepare(`UPDATE session_usage_turns SET billable = 0 WHERE source = 'replay'
          AND provider_id = ? AND ${ownership}
           AND (? IS NULL OR occurred_at_ms >= ?)
           AND (? IS NULL OR occurred_at_ms <= ?)`)
          .run(first.providerId, ...args,
            first.coverageStartMs ?? null, first.coverageStartMs ?? null, first.coverageEndMs ?? null, first.coverageEndMs ?? null);
      }
      if (first.source === 'replay') {
        db.prepare(`UPDATE session_usage_turns AS replay SET billable = 0
          WHERE replay.session_id = ? AND replay.event_key = ? AND replay.source = 'replay'
          AND EXISTS (SELECT 1 FROM session_usage_turns AS live
            WHERE live.provider_id = replay.provider_id
            AND live.source = 'live' AND live.billable = 1
            AND (live.input_tokens IS NOT NULL OR live.output_tokens IS NOT NULL
              OR live.cache_read_tokens IS NOT NULL OR live.cache_write_tokens IS NOT NULL)
            AND ((live.producer = 'codex-checkpoint' AND replay.native_thread_id = COALESCE(live.native_thread_id, live.run_id))
              OR (live.producer = 'cli-lane' AND live.provider_id IN ('codex', 'openai-codex')
                AND live.native_thread_id IS NOT NULL AND live.native_thread_id = replay.native_thread_id)
              OR (live.producer NOT IN ('codex-checkpoint', 'cli-lane') AND live.session_id = replay.session_id
                AND (live.native_thread_id IS replay.native_thread_id OR live.native_thread_id IS NULL))
              OR (live.producer = 'cli-lane' AND live.provider_id NOT IN ('codex', 'openai-codex')
                AND live.session_id = replay.session_id))
            AND (live.coverage_start_ms IS NULL OR replay.occurred_at_ms >= live.coverage_start_ms)
            AND (live.coverage_end_ms IS NULL OR replay.occurred_at_ms <= live.coverage_end_ms))`)
          .run(first.sessionId, first.eventKey);
      }
      for (const sessionId of new Set([first.sessionId, ...affectedReplaySessions])) db.prepare(
        `INSERT INTO session_stats (
        session_id, host, workspace_key, provider_id, started_at_ms, last_usage_at_ms,
        finalized_at_ms, status, input_tokens, output_tokens, cache_read_tokens,
        cache_write_tokens, known_cost_micro_usd, has_unpriced, source,
        pricing_version, revision, updated_at_ms, repository_id, worktree_path, missing_reason)
      SELECT ?, COALESCE(s.host, MAX(t.host), 'unknown'), COALESCE(s.workspace_key, MAX(t.workspace_key)), ?,
        MIN(t.occurred_at_ms), MAX(t.occurred_at_ms), NULL, 'active',
        COALESCE(SUM(t.input_tokens),0), COALESCE(SUM(t.output_tokens),0), COALESCE(SUM(t.cache_read_tokens),0),
        COALESCE(SUM(t.cache_write_tokens),0), SUM(t.known_cost_micro_usd),
        MAX(t.known_cost_micro_usd IS NULL OR t.input_tokens IS NULL OR t.output_tokens IS NULL OR t.cache_read_tokens IS NULL OR t.cache_write_tokens IS NULL),
        CASE WHEN MAX(t.source = 'live') = 1 THEN 'live' ELSE 'estimated' END,
        MAX(t.pricing_version), MAX(t.revision), ?, MAX(t.repository_id), MAX(t.worktree_path), MAX(t.missing_reason)
      FROM session_usage_turns t LEFT JOIN sessions s ON s.session_id = t.session_id
      WHERE t.session_id = ? AND t.billable = 1
      HAVING COUNT(*) > 0
      ON CONFLICT (session_id) DO UPDATE SET
        host = excluded.host, workspace_key = excluded.workspace_key,
        provider_id = excluded.provider_id, started_at_ms = excluded.started_at_ms,
        last_usage_at_ms = excluded.last_usage_at_ms,
        finalized_at_ms = CASE WHEN session_stats.finalize_revision IS NULL
          OR (session_stats.status = 'finalized' AND excluded.revision > session_stats.finalize_revision) THEN NULL
          ELSE session_stats.finalized_at_ms END,
        status = CASE WHEN session_stats.finalize_revision IS NULL THEN 'active'
          WHEN session_stats.status = 'finalized' AND excluded.revision > session_stats.finalize_revision THEN 'finalize_pending'
          ELSE session_stats.status END,
        finalize_revision = CASE WHEN session_stats.finalize_revision IS NULL THEN NULL
          WHEN session_stats.status = 'finalized' AND excluded.revision > session_stats.finalize_revision THEN excluded.revision
          ELSE session_stats.finalize_revision END, finalize_attempts = 0,
        finalize_retry_at_ms = 0, input_tokens = excluded.input_tokens,
        output_tokens = excluded.output_tokens, cache_read_tokens = excluded.cache_read_tokens,
        cache_write_tokens = excluded.cache_write_tokens,
        known_cost_micro_usd = excluded.known_cost_micro_usd,
        has_unpriced = excluded.has_unpriced, source = excluded.source,
        pricing_version = excluded.pricing_version, revision = excluded.revision,
        updated_at_ms = excluded.updated_at_ms,
        repository_id = excluded.repository_id, worktree_path = excluded.worktree_path,
        missing_reason = excluded.missing_reason`,
      ).run(sessionId, first.providerId, Date.now(), sessionId);
      for (const sessionId of affectedReplaySessions) {
        db.prepare(`UPDATE session_stats SET
          input_tokens = COALESCE((SELECT SUM(input_tokens) FROM session_usage_turns WHERE session_id = ? AND billable = 1), 0),
          output_tokens = COALESCE((SELECT SUM(output_tokens) FROM session_usage_turns WHERE session_id = ? AND billable = 1), 0),
          cache_read_tokens = COALESCE((SELECT SUM(cache_read_tokens) FROM session_usage_turns WHERE session_id = ? AND billable = 1), 0),
          cache_write_tokens = COALESCE((SELECT SUM(cache_write_tokens) FROM session_usage_turns WHERE session_id = ? AND billable = 1), 0),
          known_cost_micro_usd = (SELECT SUM(known_cost_micro_usd) FROM session_usage_turns WHERE session_id = ? AND billable = 1),
          has_unpriced = COALESCE((SELECT MAX(known_cost_micro_usd IS NULL OR input_tokens IS NULL OR output_tokens IS NULL OR cache_read_tokens IS NULL OR cache_write_tokens IS NULL)
            FROM session_usage_turns WHERE session_id = ? AND billable = 1), 0)
          WHERE session_id = ?`).run(sessionId, sessionId, sessionId, sessionId, sessionId, sessionId, sessionId);
      }
      const stats = db.prepare('SELECT * FROM session_stats WHERE session_id = ?').get(first.sessionId);
      if (stats !== undefined) statsRowSchema.parse(stats);
      const workspaceKey = db.prepare(`SELECT COALESCE(s.workspace_key, MAX(t.workspace_key)) AS workspace_key,
        MIN(t.occurred_at_ms) AS first_at, MAX(t.occurred_at_ms) AS last_at
        FROM session_usage_turns t LEFT JOIN sessions s ON s.session_id = t.session_id
        WHERE t.session_id = ? AND t.billable = 1`).get(first.sessionId) as { workspace_key: string | null; first_at: number | null; last_at: number | null };
      if (workspaceKey.workspace_key !== null && workspaceKey.first_at !== null && workspaceKey.last_at !== null) {
        db.prepare(`INSERT INTO session_usage_coverage (workspace_key, first_captured_at_ms, last_captured_at_ms)
          VALUES (?, ?, ?) ON CONFLICT (workspace_key) DO UPDATE SET
          first_captured_at_ms = MIN(first_captured_at_ms, excluded.first_captured_at_ms),
          last_captured_at_ms = MAX(last_captured_at_ms, excluded.last_captured_at_ms)`)
          .run(workspaceKey.workspace_key, workspaceKey.first_at, workspaceKey.last_at);
      }
  }

  async requestFinalization(sessionId: string, nowMs = Date.now()): Promise<void> {
    const db = await this.store.ready();
    db.prepare(`UPDATE session_stats SET status = 'finalize_pending',
      finalize_revision = revision, finalize_retry_at_ms = ?, finalize_attempts = 0,
      updated_at_ms = ? WHERE session_id = ? AND status != 'finalized'`)
      .run(safeInteger.parse(nowMs), nowMs, text.parse(sessionId));
  }

  async resumeSession(sessionId: string): Promise<void> {
    const db = await this.store.ready();
    db.prepare(`UPDATE session_stats SET status = 'active', finalized_at_ms = NULL,
      finalize_revision = NULL, finalize_attempts = 0, finalize_retry_at_ms = 0,
      updated_at_ms = ? WHERE session_id = ? AND status != 'active'`)
      .run(Date.now(), text.parse(sessionId));
  }

  /** A fixed pending batch. An idle scan is allowed only on the startup pass. */
  async reconcileFinalizations(nowMs = Date.now(), idleMs = 30 * 60_000,
    startup = false, liveSessionIds: readonly string[] = [], deadlineMs = Number.POSITIVE_INFINITY): Promise<number> {
    return (await this.reconcilePage(nowMs, idleMs, startup, liveSessionIds, null, deadlineMs)).changed;
  }

  async reconcileStartupPage(cursor: { updatedAtMs: number; sessionId: string } | null,
    liveSessionIds: readonly string[]): Promise<{
      changed: number;
      nextCursor: { updatedAtMs: number; sessionId: string } | null;
      full: boolean;
    }> {
    return this.reconcilePage(Date.now(), 30 * 60_000, true, liveSessionIds, cursor);
  }

  private async reconcilePage(nowMs: number, idleMs: number, startup: boolean,
    liveSessionIds: readonly string[], cursor: { updatedAtMs: number; sessionId: string } | null,
    deadlineMs = Number.POSITIVE_INFINITY) {
    const now = safeInteger.parse(nowMs);
    const idleBefore = safeInteger.parse(Math.max(0, now - idleMs));
    const db = await this.store.ready();
    const candidates = z.array(z.object({ session_id: text, revision: safeInteger,
      status: z.string(), finalize_attempts: safeInteger, updated_at_ms: safeInteger })).parse(
      db.prepare(`SELECT session_id, revision, status, finalize_attempts, updated_at_ms
        FROM session_stats WHERE
        ((status = 'finalize_pending' AND finalize_retry_at_ms <= ?)
        OR (? = 1 AND status = 'active' AND last_usage_at_ms <= ?
          AND updated_at_ms <= ?))
        AND (? = 0 OR updated_at_ms > ? OR
          (updated_at_ms = ? AND session_id > ?))
        ORDER BY updated_at_ms, session_id LIMIT 32`).all(now, startup ? 1 : 0,
        idleBefore, idleBefore, cursor === null ? 0 : 1,
        cursor?.updatedAtMs ?? 0, cursor?.updatedAtMs ?? 0, cursor?.sessionId ?? ''));
    let changed = 0;
    for (const row of candidates) {
      if (Date.now() >= deadlineMs) break;
      if (liveSessionIds.includes(row.session_id)) continue;
      try {
        const result = db.prepare(`UPDATE session_stats SET status = 'finalized', finalized_at_ms = ?,
          finalize_revision = revision, finalize_attempts = 0, finalize_retry_at_ms = 0,
          updated_at_ms = ? WHERE session_id = ? AND revision = ? AND status = ?
          AND (status = 'finalize_pending' OR (? = 1 AND last_usage_at_ms <= ?
            AND updated_at_ms <= ?))
          AND revision = (SELECT MAX(revision) FROM session_usage_turns
            WHERE session_id = session_stats.session_id)`)
          .run(now, now, row.session_id, row.revision, row.status,
            startup ? 1 : 0, idleBefore, idleBefore);
        changed += result.changes;
      } catch (error: unknown) {
        this.logger?.error('[persistence-sqlite] session finalization row failed',
          error instanceof Error ? error : new Error(String(error)));
        const attempts = row.finalize_attempts + 1;
        const delay = Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6));
        try {
          db.prepare(`UPDATE session_stats SET status = 'finalize_pending',
            finalize_revision = revision, finalize_attempts = ?, finalize_retry_at_ms = ?
            WHERE session_id = ? AND revision = ? AND status = ?`)
            .run(attempts, now + delay, row.session_id, row.revision, row.status);
        } catch (retryError: unknown) {
          this.logger?.error('[persistence-sqlite] session finalization retry update failed',
            retryError instanceof Error ? retryError : new Error(String(retryError)));
        }
        // A single failed row must not starve the rest of this bounded batch.
      }
    }
    const last = candidates.at(-1);
    return { changed, full: candidates.length === 32,
      nextCursor: last ? { updatedAtMs: last.updated_at_ms, sessionId: last.session_id } : null };
  }

  async getSessionStats(sessionId: string, workspaceKey: string): Promise<SessionStatsRow | null> {
    const db = await this.store.ready();
    const row: unknown = db
      .prepare(`SELECT st.* FROM session_stats st
        LEFT JOIN sessions s ON s.session_id = st.session_id
        WHERE st.session_id = ? AND COALESCE(s.workspace_key, st.workspace_key) = ?`)
      .get(text.parse(sessionId), text.parse(workspaceKey));
    return row === undefined ? null : statsRowSchema.parse(row);
  }

  /** Used only to prevent a foreign ledger identity from falling through to legacy JSONL reads. */
  async hasSessionStats(sessionId: string): Promise<boolean> {
    const db = await this.store.ready();
    const row: unknown = db.prepare('SELECT 1 AS present FROM session_stats WHERE session_id = ?')
      .get(text.parse(sessionId));
    return row !== undefined;
  }

  /** Match Codex's native thread identity, which differs from the Ptah session id. */
  async hasWorkspaceCodexRun(workspaceKey: string, nativeThreadId: string, fromMs: number, untilMs: number): Promise<boolean> {
    const from = safeInteger.parse(fromMs);
    const until = safeInteger.parse(untilMs);
    if (until <= from) throw new Error('Usage range must be increasing');
    const db = await this.store.ready();
    const row: unknown = db.prepare(`SELECT 1 AS present FROM session_usage_turns t
      LEFT JOIN sessions s ON s.session_id = t.session_id
      WHERE COALESCE(s.workspace_key, t.workspace_key) = ?
        AND ((t.producer = 'codex-checkpoint' AND t.run_id = ?)
          OR (t.producer = 'cli-lane' AND t.provider_id IN ('codex', 'openai-codex') AND t.session_id = ?))
        AND t.occurred_at_ms >= ? AND t.occurred_at_ms < ? LIMIT 1`)
      .get(text.parse(workspaceKey), text.parse(nativeThreadId), text.parse(nativeThreadId), from, until);
    return row !== undefined;
  }

  async getSessionModelUsage(
    sessionId: string,
    workspaceKey: string,
    fromMs: number,
    untilMs: number,
  ): Promise<SessionModelUsageRow[]> {
    const id = text.parse(sessionId);
    const from = safeInteger.parse(fromMs);
    const until = safeInteger.parse(untilMs);
    if (until < from) throw new Error('Usage range must be increasing');
    const db = await this.store.ready();
    const rows: unknown[] = db.prepare(`SELECT model_id,
      COALESCE(SUM(input_tokens),0) AS input_tokens, COALESCE(SUM(output_tokens),0) AS output_tokens,
      COALESCE(SUM(cache_read_tokens),0) AS cache_read_tokens,
      COALESCE(SUM(cache_write_tokens),0) AS cache_write_tokens,
      SUM(known_cost_micro_usd) AS known_cost_micro_usd,
      MAX(known_cost_micro_usd IS NULL) AS has_unpriced
      FROM session_usage_turns t LEFT JOIN sessions s ON s.session_id = t.session_id
      WHERE t.billable = 1 AND t.session_id = ? AND COALESCE(s.workspace_key, t.workspace_key) = ? AND t.occurred_at_ms >= ? AND t.occurred_at_ms < ?
      GROUP BY t.model_id ORDER BY t.model_id`).all(id, text.parse(workspaceKey), from, until);
    return rows.map((row) => sessionModelRowSchema.parse(row));
  }

  async getSessionUsageEventCount(sessionId: string, workspaceKey: string, fromMs: number, untilMs: number): Promise<number> {
    const id = text.parse(sessionId);
    const from = safeInteger.parse(fromMs);
    const until = safeInteger.parse(untilMs);
    if (until < from) throw new Error('Usage range must be increasing');
    const db = await this.store.ready();
    const row: unknown = db.prepare(`SELECT COUNT(DISTINCT producer || ':' || event_key) AS event_count
      FROM session_usage_turns t LEFT JOIN sessions s ON s.session_id = t.session_id
      WHERE t.billable = 1 AND t.session_id = ? AND COALESCE(s.workspace_key, t.workspace_key) = ? AND t.occurred_at_ms >= ? AND t.occurred_at_ms < ?`).get(id, text.parse(workspaceKey), from, until);
    return z.object({ event_count: safeInteger }).parse(row).event_count;
  }

  async getWorkspaceUsageGroups(
    workspaceKey: string,
    fromMs: number,
    untilMs: number,
  ): Promise<SessionUsageGroup[]> {
    const scope = text.parse(workspaceKey);
    const from = safeInteger.parse(fromMs);
    const until = safeInteger.parse(untilMs);
    if (until <= from) throw new Error('Usage range must be increasing');
    const db = await this.store.ready();
    const rows: unknown[] = db
      .prepare(
        `SELECT
      strftime('%Y-%m-%d', t.occurred_at_ms / 1000, 'unixepoch') AS day,
      t.provider_id, t.model_id, t.source, t.cost_authority,
      COALESCE(SUM(t.input_tokens),0) AS input_tokens, COALESCE(SUM(t.output_tokens),0) AS output_tokens,
      COALESCE(SUM(t.cache_read_tokens),0) AS cache_read_tokens,
      COALESCE(SUM(t.cache_write_tokens),0) AS cache_write_tokens,
      SUM(t.known_cost_micro_usd) AS known_cost_micro_usd,
      MAX(t.known_cost_micro_usd IS NULL OR t.input_tokens IS NULL OR t.output_tokens IS NULL OR t.cache_read_tokens IS NULL OR t.cache_write_tokens IS NULL) AS has_unpriced,
      COUNT(DISTINCT t.session_id) AS session_count
      FROM session_usage_turns t LEFT JOIN sessions s ON s.session_id = t.session_id
      WHERE t.billable = 1 AND COALESCE(s.workspace_key, t.workspace_key) = ? AND t.occurred_at_ms >= ? AND t.occurred_at_ms < ?
      GROUP BY day, t.provider_id, t.model_id, t.source, t.cost_authority
      ORDER BY day, t.provider_id, t.model_id, t.source, t.cost_authority
      LIMIT 100001`,
      )
      .all(scope, from, until);
    return rows.map((row) => groupedRowSchema.parse(row));
  }

  /** Separate totals avoid duplicating tokens across phase and executor views. */
  async getUsageDimensionTotals(sessionId: string): Promise<{
    byPhaseKind: UsageDimensionTotal[];
    byExecutorType: UsageDimensionTotal[];
  }> {
    const db = await this.store.ready();
    const scope = text.parse(sessionId);
    const totals = (column: 'phase_kind' | 'executor_type'): UsageDimensionTotal[] => {
      const rows: unknown[] = db.prepare(`SELECT COALESCE(${column}, 'unknown') AS dimension,
        SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
        SUM(cache_read_tokens) AS cache_read_tokens, SUM(cache_write_tokens) AS cache_write_tokens,
        SUM(known_cost_micro_usd) AS known_cost_micro_usd,
        MAX(known_cost_micro_usd IS NULL) AS has_unpriced
        FROM session_usage_turns WHERE session_id = ? GROUP BY ${column} ORDER BY dimension`).all(scope);
      return rows.map((row) => dimensionTotalSchema.parse(row));
    };
    return { byPhaseKind: totals('phase_kind'), byExecutorType: totals('executor_type') };
  }

  /** Live capture alone cannot prove complete historical coverage. */
  async getWorkspaceCoverage(workspaceKey: string): Promise<SessionUsageCoverage | null> {
    const db = await this.store.ready();
    const row: unknown = db.prepare(`SELECT first_captured_at_ms, last_captured_at_ms
      FROM session_usage_coverage WHERE workspace_key = ?`).get(text.parse(workspaceKey));
    return row === undefined ? null : coverageRowSchema.parse(row);
  }

  async getWorkspaceTopSessions(
    workspaceKey: string,
    fromMs: number,
    untilMs: number,
  ): Promise<TopUsageSession[]> {
    const scope = text.parse(workspaceKey);
    const from = safeInteger.parse(fromMs);
    const until = safeInteger.parse(untilMs);
    if (until <= from) throw new Error('Usage range must be increasing');
    const db = await this.store.ready();
    const rows: unknown[] = db
      .prepare(
        `WITH eligible AS (
          SELECT t.*, COALESCE(s.name, t.session_id) AS name FROM session_usage_turns t
          LEFT JOIN sessions s ON s.session_id = t.session_id
          WHERE t.billable = 1 AND COALESCE(s.workspace_key, t.workspace_key) = ? AND t.occurred_at_ms >= ? AND t.occurred_at_ms < ?
        ), totals AS (
          SELECT session_id, MAX(name) AS title,
            MAX(occurred_at_ms) AS last_active_ms,
            COUNT(DISTINCT producer || ':' || event_key) AS message_count,
            SUM(known_cost_micro_usd) AS known_cost_micro_usd,
             MAX(known_cost_micro_usd IS NULL OR input_tokens IS NULL OR output_tokens IS NULL OR cache_read_tokens IS NULL OR cache_write_tokens IS NULL) AS has_unpriced,
            COALESCE(SUM(input_tokens),0) AS input_tokens, COALESCE(SUM(output_tokens),0) AS output_tokens,
            COALESCE(SUM(cache_read_tokens),0) AS cache_read_tokens,
            COALESCE(SUM(cache_write_tokens),0) AS cache_write_tokens
          FROM eligible GROUP BY session_id
        ), model_totals AS (
          SELECT session_id, provider_id, model_id,
            SUM(COALESCE(known_cost_micro_usd, 0)) AS known_cost,
            SUM(COALESCE(input_tokens,0) + COALESCE(output_tokens,0) + COALESCE(cache_read_tokens,0) + COALESCE(cache_write_tokens,0)) AS tokens
          FROM eligible GROUP BY session_id, provider_id, model_id
        ), ranked_models AS (
          SELECT session_id, provider_id, model_id,
            ROW_NUMBER() OVER (PARTITION BY session_id
              ORDER BY known_cost DESC, tokens DESC, model_id) AS rank
          FROM model_totals
        )
        SELECT totals.*, ranked_models.provider_id, ranked_models.model_id
        FROM totals JOIN ranked_models ON ranked_models.session_id = totals.session_id
          AND ranked_models.rank = 1
        ORDER BY totals.has_unpriced, totals.known_cost_micro_usd DESC,
          totals.input_tokens + totals.output_tokens + totals.cache_read_tokens + totals.cache_write_tokens DESC,
          totals.session_id
        LIMIT 5`,
      )
      .all(scope, from, until);
    return rows.map((row) => topSessionSchema.parse(row));
  }

  async getWorkspaceSessionCount(
    workspaceKey: string,
    fromMs: number,
    untilMs: number,
  ): Promise<number> {
    const scope = text.parse(workspaceKey);
    const from = safeInteger.parse(fromMs);
    const until = safeInteger.parse(untilMs);
    if (until <= from) throw new Error('Usage range must be increasing');
    const db = await this.store.ready();
    const row: unknown = db.prepare(`SELECT COUNT(DISTINCT t.session_id) AS session_count
      FROM session_usage_turns t LEFT JOIN sessions s ON s.session_id = t.session_id
      WHERE t.billable = 1 AND COALESCE(s.workspace_key, t.workspace_key) = ? AND t.occurred_at_ms >= ? AND t.occurred_at_ms < ?`).get(scope, from, until);
    return z.object({ session_count: safeInteger }).parse(row).session_count;
  }

  async getWorkspaceMessageCount(
    workspaceKey: string,
    fromMs: number,
    untilMs: number,
  ): Promise<number> {
    const scope = text.parse(workspaceKey);
    const from = safeInteger.parse(fromMs);
    const until = safeInteger.parse(untilMs);
    if (until <= from) throw new Error('Usage range must be increasing');
    const db = await this.store.ready();
    const row: unknown = db.prepare(`SELECT COUNT(DISTINCT t.session_id || ':' || t.producer || ':' || t.event_key) AS message_count
      FROM session_usage_turns t LEFT JOIN sessions s ON s.session_id = t.session_id
      WHERE t.billable = 1 AND COALESCE(s.workspace_key, t.workspace_key) = ? AND t.occurred_at_ms >= ? AND t.occurred_at_ms < ?`).get(scope, from, until);
    return z.object({ message_count: safeInteger }).parse(row).message_count;
  }
}

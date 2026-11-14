import { z } from 'zod';
import type { SessionUsageContribution as CollectedUsage } from '@ptah-extension/platform-core';
import type { SqliteDatabase } from '../sqlite-connection.service';
import { SessionStatsRepository, type SessionUsageContribution as UsageRow, usagePhaseKindSchema, usageExecutorTypeSchema } from './session-stats-repository';

export interface UsageSourceCursor {
  sourceId: string;
  sourcePath: string;
  fingerprint: string;
  mtimeMs: number;
  byteOffset: number;
  lastEventKey: string | null;
}

export interface UsageCursorRepository {
  load(sourceId: string, sourcePath: string): Promise<UsageSourceCursor | null>;
  commit(cursor: UsageSourceCursor, events: readonly CollectedUsage[]): Promise<void>;
  loadDiscoveryIndex(): Promise<number>;
  saveDiscoveryIndex(index: number): Promise<void>;
  loadDiscoveryKey(): Promise<string | null>;
  saveDiscoveryKey(key: string | null): Promise<void>;
}

const nonempty = z.string().min(1);
const safeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const cursorSchema = z.object({
  sourceId: nonempty, sourcePath: nonempty, fingerprint: nonempty,
  mtimeMs: safeInteger, byteOffset: safeInteger, lastEventKey: nonempty.nullable(),
}).strict();
const modelSchema = z.object({
  modelId: nonempty.nullable(), inputTokens: safeInteger.nullable(),
  outputTokens: safeInteger.nullable(), cacheReadTokens: safeInteger.nullable(),
  cacheCreationTokens: safeInteger.nullable(), knownCostMicroUsd: safeInteger.nullable(),
  costAuthority: z.enum(['provider-reported', 'model-priced', 'unpriced']),
});
const replaySchema = z.object({
  phaseKind: usagePhaseKindSchema.nullable().optional(),
  executorType: usageExecutorTypeSchema.nullable().optional(),
  sessionId: nonempty, producer: z.literal('transcript-replay'), runId: nonempty,
  nativeThreadId: nonempty.nullable().optional(), turnId: nonempty.nullable(),
  eventKey: nonempty, providerId: nonempty.nullable(), occurredAtMs: safeInteger,
  revision: safeInteger, models: z.array(modelSchema).max(256),
  totalCostMicroUsd: safeInteger.nullable(),
  totalCostAuthority: z.enum(['provider-reported', 'model-priced', 'unpriced']),
  pricingVersion: nonempty.nullable(), source: z.literal('replay'),
  missingReason: z.string().nullable().optional(), billable: z.boolean().optional(),
  coverageStartMs: safeInteger.nullable().optional(), coverageEndMs: safeInteger.nullable().optional(),
  workspaceKey: nonempty.nullable().optional(), repositoryId: nonempty.nullable().optional(),
  worktreePath: nonempty.nullable().optional(), host: nonempty.nullable().optional(),
  parentSessionId: nonempty.nullable(), subagentId: nonempty.nullable(),
});

function toRows(event: CollectedUsage): UsageRow[] {
  const parsed = replaySchema.parse(event);
  const models = parsed.models.length > 0 ? parsed.models : [{
    modelId: null, inputTokens: null, outputTokens: null, cacheReadTokens: null,
    cacheCreationTokens: null, knownCostMicroUsd: parsed.totalCostMicroUsd,
    costAuthority: parsed.totalCostAuthority,
  }];
  const rows: UsageRow[] = models.map((model) => ({
    sessionId: parsed.sessionId, producer: parsed.producer, runId: parsed.runId,
    nativeThreadId: parsed.nativeThreadId ?? null, turnId: parsed.turnId ?? '',
    eventKey: parsed.eventKey, modelId: model.modelId ?? '__unattributed__',
    providerId: parsed.providerId ?? 'unknown', occurredAtMs: parsed.occurredAtMs,
    revision: parsed.revision, inputTokens: model.inputTokens,
    outputTokens: model.outputTokens, cacheReadTokens: model.cacheReadTokens,
    cacheWriteTokens: model.cacheCreationTokens, knownCostMicroUsd: model.knownCostMicroUsd,
    costAuthority: model.costAuthority, source: 'replay', pricingVersion: parsed.pricingVersion,
    workspaceKey: parsed.workspaceKey ?? null, repositoryId: parsed.repositoryId ?? null,
    worktreePath: parsed.worktreePath ?? null, host: parsed.host ?? null,
    phaseKind: parsed.phaseKind ?? null, executorType: parsed.executorType ?? null,
    missingReason: parsed.missingReason ?? null, billable: parsed.billable ?? true,
    coverageStartMs: parsed.coverageStartMs ?? null, coverageEndMs: parsed.coverageEndMs ?? null,
  }));
  const attributed = rows.reduce((sum, row) => sum + (row.knownCostMicroUsd ?? 0), 0);
  if (!Number.isSafeInteger(attributed)) throw new Error('Replay cost overflow');
  if (parsed.models.length > 0 && parsed.totalCostMicroUsd !== null && parsed.totalCostMicroUsd > attributed) {
    rows.push({ ...rows[0], modelId: '__session_residual__', inputTokens: 0,
      outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
      knownCostMicroUsd: parsed.totalCostMicroUsd - attributed,
      costAuthority: parsed.totalCostAuthority });
  }
  return rows;
}

/** Commits replay rows, aggregate changes, and the read cursor on one connection. */
export class SqliteUsageCursorRepository implements UsageCursorRepository {
  constructor(
    private readonly store: { ready(): Promise<Pick<SqliteDatabase, 'exec' | 'prepare'>> },
    private readonly stats: SessionStatsRepository,
  ) {}

  async loadDiscoveryIndex(): Promise<number> {
    const db = await this.store.ready();
    const row = db.prepare(`SELECT byte_offset AS byteOffset FROM usage_source_cursor
      WHERE source_id = 'discovery' AND source_path = 'all-roots'`).get() as { byteOffset: number } | undefined;
    return row?.byteOffset ?? 0;
  }

  async saveDiscoveryIndex(index: number): Promise<void> {
    const db = await this.store.ready();
    db.prepare(`INSERT INTO usage_source_cursor
      (source_id, source_path, fingerprint, mtime_ms, byte_offset, last_event_key, updated_at_ms)
      VALUES ('discovery', 'all-roots', 'index', 0, ?, NULL, ?)
      ON CONFLICT(source_id, source_path) DO UPDATE SET byte_offset = excluded.byte_offset,
        updated_at_ms = excluded.updated_at_ms`).run(safeInteger.parse(index), Date.now());
  }

  async loadDiscoveryKey(): Promise<string | null> {
    const db = await this.store.ready();
    const row = db.prepare(`SELECT last_event_key AS key FROM usage_source_cursor
      WHERE source_id = 'discovery' AND source_path = 'all-roots'`).get() as { key: string | null } | undefined;
    return row?.key ?? null;
  }

  async saveDiscoveryKey(key: string | null): Promise<void> {
    const db = await this.store.ready();
    db.prepare(`INSERT INTO usage_source_cursor
      (source_id, source_path, fingerprint, mtime_ms, byte_offset, last_event_key, updated_at_ms)
      VALUES ('discovery', 'all-roots', 'key', 0, 0, ?, ?)
      ON CONFLICT(source_id, source_path) DO UPDATE SET last_event_key = excluded.last_event_key,
        updated_at_ms = excluded.updated_at_ms`).run(key, Date.now());
  }

  async load(sourceId: string, sourcePath: string): Promise<UsageSourceCursor | null> {
    nonempty.parse(sourceId);
    nonempty.parse(sourcePath);
    if (sourceId === 'discovery' && sourcePath === 'all-roots') throw new Error('Reserved discovery cursor');
    const db = await this.store.ready();
    const row = db.prepare(`SELECT source_id AS sourceId, source_path AS sourcePath,
      fingerprint, mtime_ms AS mtimeMs, byte_offset AS byteOffset,
      last_event_key AS lastEventKey FROM usage_source_cursor
      WHERE source_id = ? AND source_path = ?`).get(sourceId, sourcePath);
    return row === undefined ? null : cursorSchema.parse(row);
  }

  async commit(cursor: UsageSourceCursor, events: readonly CollectedUsage[]): Promise<void> {
    const next = cursorSchema.parse(cursor);
    if (next.sourceId === 'discovery' && next.sourcePath === 'all-roots') throw new Error('Reserved discovery cursor');
    const rows = events.map(toRows);
    const db = await this.store.ready();
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const eventRows of rows) this.stats.writeEventInTransaction(db, eventRows);
      db.prepare(`INSERT INTO usage_source_cursor
        (source_id, source_path, fingerprint, mtime_ms, byte_offset, last_event_key, updated_at_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_id, source_path) DO UPDATE SET
          fingerprint = excluded.fingerprint, mtime_ms = excluded.mtime_ms,
          byte_offset = excluded.byte_offset, last_event_key = excluded.last_event_key,
          updated_at_ms = excluded.updated_at_ms`).run(
          next.sourceId, next.sourcePath, next.fingerprint, next.mtimeMs,
          next.byteOffset, next.lastEventKey, Date.now(),
        );
      db.exec('COMMIT');
    } catch (error: unknown) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

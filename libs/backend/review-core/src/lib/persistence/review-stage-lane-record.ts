import { z } from 'zod';
import type { SqliteDatabase } from '@ptah-extension/persistence-sqlite';
import {
  REVIEW_LANE_POOL_MAX, REVIEW_STAGE_USAGE_RUNS_MAX, ReviewLaneFallbackSchema, ReviewLaneIdSchema, ReviewModelIdSchema,
  type ReviewLaneFallback,
} from '@ptah-extension/review-contracts';
import { ReviewLaneRunUsageSchema, UNKNOWN_LANE_RUN_USAGE, type ReviewLaneRunUsage } from '../lanes/review-lane-usage';
import type { ReviewLaneUse } from '../lanes/review-lane.runner';
import type { StoredLaneRun } from '../usage/review-usage-total';

/** Version of the `checkpoint:lane:<stage>` JSON document. */
export const REVIEW_STAGE_LANE_RECORD_VERSION = 1;
/** Stage-name prefix of the lane document rows in `review_stages`. */
export const LANE_RECORD_PREFIX = 'checkpoint:lane:';

const parseJson = z.string().transform((text, ctx): unknown => {
  try { return JSON.parse(text) as unknown; }
  catch {
    ctx.addIssue({ code: 'custom', message: 'Lane record is not JSON' });
    return z.NEVER;
  }
});

/** Lenient: unknown keys pass, an invalid document is ignored for display (plan component 7). */
export const ReviewStageLaneRecordSchema = parseJson.pipe(z.object({ version: z.literal(REVIEW_STAGE_LANE_RECORD_VERSION),
  lane: ReviewLaneIdSchema.nullable(), model: ReviewModelIdSchema.nullable(),
  fallback: z.array(ReviewLaneFallbackSchema).max(REVIEW_LANE_POOL_MAX + 1) }));

const StoredLaneRunSchema = ReviewLaneRunUsageSchema.extend({ ended: z.boolean() }).strict();
const StageLaneUsageSchema = z.object({
  runs: z.array(StoredLaneRunSchema).max(REVIEW_STAGE_USAGE_RUNS_MAX),
  /** Runs were dropped because the list was full; the stage total is partial. */
  overflow: z.literal(true).optional(),
}).strict();
export type ReviewStageLaneUsage = z.infer<typeof StageLaneUsageSchema>;

const usageKeySchema = z.object({ usage: z.unknown() });
const familySchema = z.object({ family: z.string().min(1).max(64).nullable() });

/** The whole `checkpoint:lane:<stage>` document as this build writes it. */
export interface ReviewStageLaneDocument {
  version: typeof REVIEW_STAGE_LANE_RECORD_VERSION;
  lane: string | null;
  model: string | null;
  family: string | null;
  fallback: ReviewLaneFallback[];
  usage?: ReviewStageLaneUsage;
}

/** One stage's lane record as read for display and totals. */
export interface ReviewStageLaneRecord {
  lane: string | null;
  model: string | null;
  fallback: ReviewLaneFallback[];
  runs: StoredLaneRun[];
}

type UsageRead = { kind: 'absent' } | { kind: 'invalid' } | { kind: 'valid'; usage: ReviewStageLaneUsage };

function readUsage(raw: unknown): UsageRead {
  const holder = usageKeySchema.safeParse(raw);
  if (!holder.success || holder.data.usage === undefined) return { kind: 'absent' };
  const usage = StageLaneUsageSchema.safeParse(holder.data.usage);
  return usage.success ? { kind: 'valid', usage: usage.data } : { kind: 'invalid' };
}

const unknownRun = (): StoredLaneRun => ({ ...UNKNOWN_LANE_RUN_USAGE(true), ended: true });

/** The runs a stored document counts: an unreadable or overflowed usage adds one unknown partial run. */
function countedRuns(usage: UsageRead): StoredLaneRun[] {
  if (usage.kind === 'absent') return [];
  if (usage.kind === 'invalid') return [unknownRun()];
  return usage.usage.overflow ? [...usage.usage.runs, unknownRun()] : [...usage.usage.runs];
}

/**
 * Parses a stored lane document for a rewrite; null when there is none or its lane part is unreadable.
 * An unreadable `usage` becomes an empty overflowed list, so the stage total stays partial.
 */
export function parseStageLaneDocument(text: string | null): ReviewStageLaneDocument | null {
  if (text === null) return null;
  const record = ReviewStageLaneRecordSchema.safeParse(text);
  if (!record.success) return null;
  const raw = parseJson.parse(text);
  const family = familySchema.safeParse(raw);
  const usage = readUsage(raw);
  return { version: REVIEW_STAGE_LANE_RECORD_VERSION, lane: record.data.lane, model: record.data.model,
    family: family.success ? family.data.family : null, fallback: record.data.fallback,
    ...(usage.kind === 'valid' ? { usage: usage.usage } : usage.kind === 'invalid' ? { usage: { runs: [], overflow: true as const } } : {}) };
}

function emptyDocument(): ReviewStageLaneDocument {
  return { version: REVIEW_STAGE_LANE_RECORD_VERSION, lane: null, model: null, family: null, fallback: [] };
}

/** Appends one pending run; a full list is marked overflowed and gets nothing appended (F9). */
export function beginLaneRun(doc: ReviewStageLaneDocument | null): ReviewStageLaneDocument {
  const base = doc ?? emptyDocument();
  const usage = base.usage ?? { runs: [] };
  if (usage.runs.length >= REVIEW_STAGE_USAGE_RUNS_MAX) return { ...base, usage: { runs: [...usage.runs], overflow: true } };
  return { ...base, usage: { ...usage, runs: [...usage.runs, { ...UNKNOWN_LANE_RUN_USAGE(true), ended: false }] } };
}

/**
 * Ends one run: drops the last pending entry, then appends `run` as ended when given (a full list is
 * marked overflowed instead). A non-null `use` replaces lane, model, family and fallback.
 */
export function mergeLaneRun(doc: ReviewStageLaneDocument | null, use: ReviewLaneUse | null,
  run: ReviewLaneRunUsage | undefined): ReviewStageLaneDocument {
  const base = doc ?? emptyDocument();
  const lane = use ? { lane: use.lane, model: use.model, family: use.family, fallback: [...use.fallback] } : {};
  if (!base.usage && !run) return { ...base, ...lane };
  const usage = base.usage ?? { runs: [] };
  const runs = [...usage.runs];
  const pending = runs.map((entry) => entry.ended).lastIndexOf(false);
  if (pending >= 0) runs.splice(pending, 1);
  let overflow = usage.overflow;
  if (run) {
    if (runs.length >= REVIEW_STAGE_USAGE_RUNS_MAX) overflow = true;
    else runs.push({ ...run, ended: true });
  }
  return { ...base, ...lane, usage: { runs, ...(overflow ? { overflow } : {}) } };
}

const laneRowSchema = z.object({ stage: z.string(), ordinal: z.number(), outcome: z.string().nullable() });

/**
 * Lane records of one attempt by `<stage>#<ordinal>`. A document whose lane part is unreadable is skipped;
 * one whose usage is unreadable keeps its lane part.
 */
export function readStageLaneRecords(db: Pick<SqliteDatabase, 'prepare'>, attemptId: string): Map<string, ReviewStageLaneRecord> {
  const records = new Map<string, ReviewStageLaneRecord>();
  for (const value of db.prepare(`SELECT stage, ordinal, outcome FROM review_stages
    WHERE attempt_id = ? AND stage LIKE 'checkpoint:lane:%' ORDER BY stage, ordinal`).all(attemptId)) {
    const row = laneRowSchema.parse(value);
    if (row.outcome === null || !row.stage.startsWith(LANE_RECORD_PREFIX)) continue;
    const record = ReviewStageLaneRecordSchema.safeParse(row.outcome);
    if (!record.success) continue;
    records.set(`${row.stage.slice(LANE_RECORD_PREFIX.length)}#${row.ordinal}`, { lane: record.data.lane,
      model: record.data.model, fallback: record.data.fallback, runs: countedRuns(readUsage(parseJson.parse(row.outcome))) });
  }
  return records;
}

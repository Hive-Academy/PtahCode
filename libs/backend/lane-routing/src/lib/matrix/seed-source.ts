import { z } from 'zod';
import { OUTCOME_TASK_KINDS } from '@ptah-extension/shared';
import { ModelEffortSchema } from '../contracts/route-decide-result.schema';
import {
  SCORE_MAX,
  SCORE_MIN,
  SEED_LABEL_SCORE,
  STALENESS_AGE_MS,
} from '../routing-constants';
import { AsOf, NonBlank, SourceId } from './matrix.schema';
import {
  CAPABILITY_MATRIX_VERSION,
  type CapabilityMatrix,
  type MatrixCell,
  type MatrixProfile,
} from './matrix.types';

/** One benchmark result row with its provenance (FA9). */
export const SeedSourceRowSchema = z
  .object({
    sourceId: SourceId,
    licenseId: NonBlank(64),
    fetchedAt: AsOf,
    sourceRow: NonBlank(200),
    benchmarkModel: NonBlank(200),
    /** As the board names it; null when the board has none. */
    benchmarkEffort: NonBlank(32).nullable(),
    /** Exactly one kind per row. */
    taskKind: z.enum(OUTCOME_TASK_KINDS),
    /** Publication date of the result. */
    asOf: AsOf,
    note: NonBlank(500),
    sourceRef: NonBlank(500),
    value: z.union([
      z.object({ label: z.enum(['strong', 'good', 'weak']) }).strict(),
      z
        .object({ score: z.number().int().min(SCORE_MIN).max(SCORE_MAX) })
        .strict(),
    ]),
  })
  .strict();

export type SeedSourceRow = z.infer<typeof SeedSourceRowSchema>;

export const SeedAliasSchema = z
  .object({
    sourceId: SourceId,
    benchmarkModel: NonBlank(200),
    benchmarkEffort: NonBlank(32).nullable(),
    targets: z
      .array(
        z
          .object({
            family: NonBlank(200),
            model: NonBlank(200),
            /** Absent: bucket `*`. */
            effort: ModelEffortSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(16),
  })
  .strict();

export type SeedAlias = z.infer<typeof SeedAliasSchema>;

export interface SeedCompileResult {
  readonly matrix: CapabilityMatrix;
  readonly dropped: {
    /** No exact alias match. */
    readonly noAlias: number;
    /** Second row for the same `[family, model, effort, taskKind]`. */
    readonly duplicate: number;
    /** Failed `SeedSourceRowSchema`. */
    readonly invalid: number;
  };
}

/**
 * `now - asOf > STALENESS_AGE_MS`. An `asOf` that does not parse has no
 * known age and counts as stale.
 */
export function isStale(asOf: string, nowMs: number): boolean {
  const asOfMs = Date.parse(asOf);
  return Number.isNaN(asOfMs) || nowMs - asOfMs > STALENESS_AGE_MS;
}

type MutableCells = {
  -readonly [K in keyof MatrixProfile['cells']]: MatrixCell;
};

function emptyCells(): MutableCells {
  return {
    plan: { kind: 'unknown' },
    implement: { kind: 'unknown' },
    review: { kind: 'unknown' },
    research: { kind: 'unknown' },
    tests: { kind: 'unknown' },
    docs: { kind: 'unknown' },
  };
}

function cellOf(row: SeedSourceRow, nowMs: number): MatrixCell {
  const score =
    'label' in row.value ? SEED_LABEL_SCORE[row.value.label] : row.value.score;
  return {
    kind: 'value',
    score,
    source: 'seed',
    sourceRef: row.sourceRef,
    asOf: row.asOf,
    stale: isStale(row.asOf, nowMs),
    note: row.note,
    sourceId: row.sourceId,
    licenseId: row.licenseId,
    fetchedAt: row.fetchedAt,
    sourceRow: row.sourceRow,
  };
}

/**
 * Pure. Exact match on `[sourceId, benchmarkModel, benchmarkEffort]`; no
 * case folding, trimming or fuzzy match. One row fills one task kind of each
 * target profile. A second row for the same key keeps the first.
 */
export function compileSeed(
  rows: readonly unknown[],
  aliases: readonly unknown[],
  nowMs: number,
): SeedCompileResult {
  const aliasByKey = new Map<string, SeedAlias>();
  for (const candidate of aliases) {
    const parsed = SeedAliasSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const key = JSON.stringify([
      parsed.data.sourceId,
      parsed.data.benchmarkModel,
      parsed.data.benchmarkEffort,
    ]);
    if (!aliasByKey.has(key)) aliasByKey.set(key, parsed.data);
  }

  const dropped = { noAlias: 0, duplicate: 0, invalid: 0 };
  const profiles = new Map<string, Omit<MatrixProfile, 'cells'> & { cells: MutableCells }>();

  for (const candidate of rows) {
    const parsed = SeedSourceRowSchema.safeParse(candidate);
    if (!parsed.success) {
      dropped.invalid += 1;
      continue;
    }
    const row = parsed.data;
    const alias = aliasByKey.get(
      JSON.stringify([row.sourceId, row.benchmarkModel, row.benchmarkEffort]),
    );
    if (alias === undefined) {
      dropped.noAlias += 1;
      continue;
    }
    const visited = new Set<string>();
    for (const target of alias.targets) {
      const key = JSON.stringify([
        target.family,
        target.model,
        target.effort ?? '*',
      ]);
      if (visited.has(key)) continue;
      visited.add(key);
      let profile = profiles.get(key);
      if (profile === undefined) {
        profile = { ...target, cells: emptyCells() };
        profiles.set(key, profile);
      }
      if (profile.cells[row.taskKind].kind === 'value') {
        dropped.duplicate += 1;
        continue;
      }
      profile.cells[row.taskKind] = cellOf(row, nowMs);
    }
  }

  return {
    matrix: {
      version: CAPABILITY_MATRIX_VERSION,
      profiles: [...profiles.values()],
    },
    dropped,
  };
}

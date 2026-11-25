import { z } from 'zod';
import { ModelEffortSchema } from '../contracts/route-decide-result.schema';
import { SCORE_MAX, SCORE_MIN } from '../routing-constants';
import {
  CAPABILITY_MATRIX_VERSION,
  MATRIX_CELL_SOURCES,
  type CapabilityMatrix,
  type MatrixCell,
  type MatrixCells,
  type MatrixProfile,
} from './matrix.types';

/**
 * Zod schemas for the capability matrix (part A §3). The user file, the
 * shipped seed and the view are all checked against these shapes; the issue
 * path of a rejection names the entry (Requirement 6.7).
 */

export const NonBlank = (max: number) =>
  z.string().max(max).regex(/\S/, 'must not be blank');

/** ISO date or an ISO date-time with a time zone. */
export const AsOf = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

/** Stable id of a benchmark source. */
export const SourceId = NonBlank(64).regex(/^[a-z0-9._-]+$/);

export const UnknownMatrixCellSchema = z
  .object({ kind: z.literal('unknown') })
  .strict();

const SEED_ONLY_FIELDS = [
  'sourceId',
  'licenseId',
  'fetchedAt',
  'sourceRow',
] as const;

export const ValueMatrixCellSchema = z
  .object({
    kind: z.literal('value'),
    score: z.number().int().min(SCORE_MIN).max(SCORE_MAX),
    source: z.enum(MATRIX_CELL_SOURCES),
    sourceRef: NonBlank(500).optional(),
    asOf: AsOf,
    stale: z.boolean(),
    note: NonBlank(500).optional(),
    sampleCount: z.number().int().min(1).optional(),
    sourceId: SourceId.optional(),
    licenseId: NonBlank(64).optional(),
    fetchedAt: AsOf.optional(),
    sourceRow: NonBlank(200).optional(),
  })
  .strict()
  .superRefine((cell, ctx) => {
    for (const field of SEED_ONLY_FIELDS) {
      if (cell.source === 'seed' && cell[field] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `a seed value must carry ${field}`,
        });
      }
      if (cell.source !== 'seed' && cell[field] !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `only a seed value carries ${field}`,
        });
      }
    }
    if (cell.source === 'seed') {
      if (cell.sourceRef === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['sourceRef'],
          message: 'a seed value must name its dataset or URL',
        });
      }
      if (cell.note === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['note'],
          message: 'a seed value must say what it measures',
        });
      }
    }
    if (cell.source === 'local') {
      if (cell.sampleCount === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['sampleCount'],
          message: 'a local value must carry its sample count',
        });
      }
      if (cell.sourceRef !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['sourceRef'],
          message: 'a local value has no external source',
        });
      }
    } else if (cell.sampleCount !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['sampleCount'],
        message: 'only a local value carries a sample count',
      });
    }
  });

export const MatrixCellSchema = z.discriminatedUnion('kind', [
  UnknownMatrixCellSchema,
  ValueMatrixCellSchema,
]) satisfies z.ZodType<MatrixCell>;

/** One key per `OUTCOME_TASK_KINDS` entry; the spec pins the key set. */
export const MatrixCellsSchema = z
  .object({
    plan: MatrixCellSchema,
    implement: MatrixCellSchema,
    review: MatrixCellSchema,
    research: MatrixCellSchema,
    tests: MatrixCellSchema,
    docs: MatrixCellSchema,
  })
  .strict() satisfies z.ZodType<MatrixCells>;

export const MatrixProfileSchema = z
  .object({
    family: NonBlank(200),
    model: NonBlank(200),
    effort: ModelEffortSchema.optional(),
    cells: MatrixCellsSchema,
  })
  .strict() satisfies z.ZodType<MatrixProfile>;

export const CapabilityMatrixSchema = z
  .object({
    version: z.literal(CAPABILITY_MATRIX_VERSION),
    // Bounds validation work on a hand-edited file.
    profiles: z.array(MatrixProfileSchema).max(1000),
  })
  .strict()
  .superRefine((matrix, ctx) => {
    const seen = new Set<string>();
    matrix.profiles.forEach((profile, index) => {
      const key = JSON.stringify([
        profile.family,
        profile.model,
        profile.effort ?? '*',
      ]);
      if (seen.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['profiles', index, 'model'],
          message:
            `duplicate profile for family "${profile.family}" ` +
            `and model "${profile.model}" and effort "${profile.effort ?? '*'}"`,
        });
      }
      seen.add(key);
    });
  }) satisfies z.ZodType<CapabilityMatrix>;

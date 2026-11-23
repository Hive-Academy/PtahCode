import { z } from 'zod';
import { LensSchema } from './review-config.schema';

/** Most entries the review lane pool may hold. The UI reads this bound instead of hard-coding it. */
export const REVIEW_LANE_POOL_MAX = 12;
/** Most model ids one lane catalog carries. Producers truncate to this bound before parsing. */
export const REVIEW_LANE_CATALOG_MAX = 500;

/** Lane ids such as `codex` or `ptah-cli:pc-<uuid>`. */
export const ReviewLaneIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
export type ReviewLaneId = z.infer<typeof ReviewLaneIdSchema>;

/** Model ids such as `gpt-5.3-codex`, `provider/model`, `model:free` or `claude-opus[1m]`. */
export const ReviewModelIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/@+[\]-]{0,199}$/);
export type ReviewModelId = z.infer<typeof ReviewModelIdSchema>;

/** One lane choice. `model: null` means the lane default: no model is sent on spawn. */
export const ReviewLaneEntrySchema = z
  .object({
    lane: ReviewLaneIdSchema,
    model: ReviewModelIdSchema.nullable(),
  })
  .strict();
export type ReviewLaneEntry = z.infer<typeof ReviewLaneEntrySchema>;

export const ReviewLaneRoleSchema = z.enum(['triage', ...LensSchema.options, 'verifier']);
export type ReviewLaneRole = z.infer<typeof ReviewLaneRoleSchema>;

/** Per-role pins. Every role is optional; an unknown role key is rejected. */
export const ReviewLanePinsSchema = z
  .object({
    triage: ReviewLaneEntrySchema.optional(),
    'correctness-lifecycle': ReviewLaneEntrySchema.optional(),
    'contracts-callers': ReviewLaneEntrySchema.optional(),
    'security-privacy': ReviewLaneEntrySchema.optional(),
    'host-di-config': ReviewLaneEntrySchema.optional(),
    verifier: ReviewLaneEntrySchema.optional(),
  })
  .strict();
export type ReviewLanePins = z.infer<typeof ReviewLanePinsSchema>;

/**
 * Index of the first pool entry that repeats an earlier entry's lane and model, or `null`.
 * Models compare exactly; `null` (lane default) equals `null`.
 */
export function duplicatePoolEntryIndex(pool: readonly ReviewLaneEntry[]): number | null {
  const seen = new Set<string>();
  for (let index = 0; index < pool.length; index += 1) {
    const entry = pool[index];
    const key = JSON.stringify([entry.lane, entry.model]);
    if (seen.has(key)) return index;
    seen.add(key);
  }
  return null;
}

export const ReviewLaneSettingsSchema = z
  .object({
    pool: z
      .array(ReviewLaneEntrySchema)
      .max(REVIEW_LANE_POOL_MAX)
      .superRefine((pool, ctx) => {
        const index = duplicatePoolEntryIndex(pool);
        if (index !== null) {
          ctx.addIssue({ code: 'custom', path: [index], message: 'Duplicate review lane entry' });
        }
      }),
    pins: ReviewLanePinsSchema,
  })
  .strict();
export type ReviewLaneSettings = z.infer<typeof ReviewLaneSettingsSchema>;

export const EMPTY_REVIEW_LANE_SETTINGS: Readonly<ReviewLaneSettings> = { pool: [], pins: {} };

/**
 * A lane's model catalog. `verifiable` is true only when the list resolved, was not truncated and
 * holds at least one live-reported entry; only a verifiable catalog can mark a model "not offered".
 */
export const ReviewLaneCatalogSchema = z
  .object({
    status: z.enum(['read', 'empty', 'failed']),
    models: z.array(ReviewModelIdSchema).max(REVIEW_LANE_CATALOG_MAX),
    truncated: z.boolean(),
    verifiable: z.boolean(),
  })
  .strict();
export type ReviewLaneCatalog = z.infer<typeof ReviewLaneCatalogSchema>;

export const ReviewLaneLimitStateSchema = z.enum(['confirmed-room', 'unknown', 'at-limit']);

export const ReviewLaneListingEntrySchema = z
  .object({
    id: ReviewLaneIdSchema,
    label: z.string().trim().min(1).max(128),
    family: z.string().trim().min(1).max(64),
    limitState: ReviewLaneLimitStateSchema,
    catalog: ReviewLaneCatalogSchema,
  })
  .strict();
export type ReviewLaneListingEntry = z.infer<typeof ReviewLaneListingEntrySchema>;

export const ReviewLaneListingSchema = z
  .object({
    lanes: z.array(ReviewLaneListingEntrySchema).max(100),
    /** Saved pool and pin models that the lane block list refuses. */
    blockedModels: z.array(ReviewModelIdSchema).max(2 * REVIEW_LANE_POOL_MAX + 12),
  })
  .strict();
export type ReviewLaneListing = z.infer<typeof ReviewLaneListingSchema>;

export const ReviewLaneFallbackReasonSchema = z.enum([
  'lane-not-listed',
  'at-limit',
  'model-blocked',
  'model-not-offered',
]);
export type ReviewLaneFallbackReason = z.infer<typeof ReviewLaneFallbackReasonSchema>;

/** One pin or pool entry that selection skipped, and why. */
export const ReviewLaneFallbackSchema = z
  .object({
    source: z.enum(['pin', 'pool']),
    lane: ReviewLaneIdSchema,
    model: ReviewModelIdSchema.nullable(),
    reason: ReviewLaneFallbackReasonSchema,
  })
  .strict();
export type ReviewLaneFallback = z.infer<typeof ReviewLaneFallbackSchema>;

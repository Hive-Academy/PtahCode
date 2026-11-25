import { z } from 'zod';

/** Most lane usage runs one stage usage document stores; the derived total `runs` has no such cap. */
export const REVIEW_STAGE_USAGE_RUNS_MAX = 16;

const UsageTokenCountSchema = z.number().int().nonnegative().safe().nullable();

/**
 * Token and cost total of a stage or a run. A null count or cost is unknown; a `*Partial` flag
 * marks a total that misses at least one run's value.
 */
export const ReviewUsageTotalSchema = z
  .object({
    inputTokens: UsageTokenCountSchema,
    outputTokens: UsageTokenCountSchema,
    cacheReadTokens: UsageTokenCountSchema,
    cacheWriteTokens: UsageTokenCountSchema,
    totalTokens: UsageTokenCountSchema,
    costUsd: z.number().finite().nonnegative().nullable(),
    tokensPartial: z.boolean(),
    costPartial: z.boolean(),
    /** Lane runs counted, including one unknown run per overflowed or unreadable usage document. */
    runs: z.number().int().nonnegative().safe(),
  })
  .strict();
export type ReviewUsageTotal = z.infer<typeof ReviewUsageTotalSchema>;

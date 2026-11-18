import { z } from 'zod';
const count = z.number().int().nonnegative().safe();
const authority = z.enum(['provider-reported', 'model-priced', 'unpriced']);
export const SpendEventSchema = z.object({
  ownerKey: z.string().min(1), runId: z.string().min(1), eventKey: z.string().min(1),
  occurredAtMs: count, revision: count,
  models: z.array(z.object({
    modelId: z.string().nullable(), inputTokens: count.nullable(), outputTokens: count.nullable(),
    cacheReadTokens: count.nullable(), cacheCreationTokens: count.nullable(),
    cacheCreation1hTokens: count.nullable().optional(),
    knownCostMicroUsd: count.nullable(), costAuthority: authority,
  })),
  totalCostMicroUsd: count.nullable(), totalCostAuthority: authority,
  runCostSnapshot: z.boolean().default(false),
});
export const SpendLedgerSchema = z.object({
  version: z.literal(1),
  events: z.array(SpendEventSchema),
  owners: z.array(z.object({ ownerKey: z.string().min(1), revision: count, resetAtMs: count })),
  credits: z.array(z.object({ ownerKey: z.string().min(1), occurredAtMs: count,
    kind: z.enum(['credit-exhausted', 'rate-limited']) })),
});
export type SpendLedger = z.infer<typeof SpendLedgerSchema>;

export type SpendEvent = z.infer<typeof SpendEventSchema>;

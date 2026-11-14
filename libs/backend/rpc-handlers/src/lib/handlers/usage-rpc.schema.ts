import { z } from 'zod';

/** The session id must be non-empty. Unexpected fields are rejected. */
export const UsageGetDimensionTotalsParamsSchema = z
  .object({ sessionId: z.string().min(1) })
  .strict();

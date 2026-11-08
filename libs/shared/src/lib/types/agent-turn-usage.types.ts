import { z } from 'zod';

export const agentUsageSourceSchema = z.enum([
  'stream', 'session-file', 'provider-api', 'sdk',
]);
export type AgentUsageSource = z.infer<typeof agentUsageSourceSchema>;

export const agentUsageDatumSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('reported'), value: z.number().finite().nonnegative(), source: agentUsageSourceSchema }).strict(),
  z.object({ status: z.literal('unavailable'), reason: z.string().min(1), source: agentUsageSourceSchema }).strict(),
]);
export type AgentUsageDatum = z.infer<typeof agentUsageDatumSchema>;

export const agentTokenDatumSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('reported'), value: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), source: agentUsageSourceSchema }).strict(),
  z.object({ status: z.literal('unavailable'), reason: z.string().min(1), source: agentUsageSourceSchema }).strict(),
]);
export type AgentTokenDatum = z.infer<typeof agentTokenDatumSchema>;

/** Input includes every cached input token. A turn has one stable accounting ID. */
export const agentTurnUsageSchema = z.object({
  turnId: z.string().min(1),
  modelId: z.string().min(1),
  scope: z.literal('turn'),
  source: agentUsageSourceSchema,
  inputTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  outputTokens: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  cacheReadTokens: agentTokenDatumSchema,
  cacheWriteTokens: agentTokenDatumSchema,
  requestContextTokens: agentTokenDatumSchema,
  providerCostUsd: agentUsageDatumSchema,
  cacheSemantics: z.enum(['verified-subsets', 'unknown']),
  models: z.array(z.object({
    modelId: z.string().min(1),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cacheReadTokens: z.number().int().nonnegative(),
    cacheWriteTokens: z.number().int().nonnegative(),
  }).strict()).optional(),
}).strict();
export type AgentTurnUsage = z.infer<typeof agentTurnUsageSchema>;

export const agentTurnTelemetrySchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('reported'), usage: agentTurnUsageSchema }).strict(),
  z.object({ status: z.literal('unavailable'), turnId: z.string().min(1), modelId: z.string().min(1), source: agentUsageSourceSchema, reason: z.string().min(1) }).strict(),
]);
export type AgentTurnTelemetry = z.infer<typeof agentTurnTelemetrySchema>;

/** Stable accounting identity for one completed turn. The provider-labelled
 * unknown model preserves existing fail-open accounting when totals are present;
 * pricing can still report that this model is unknown. */
export function turnIdentity(input: {
  provider: string;
  source: AgentUsageSource;
  turnId?: string;
  sessionId?: string;
  sequence?: string | number;
  modelId?: string;
}): { turnId: string; modelId: string; source: AgentUsageSource } {
  return {
    turnId: input.turnId?.trim() || `${input.sessionId?.trim() || input.provider}:${input.sequence ?? 0}`,
    modelId: input.modelId?.trim() || `${input.provider}/unknown`,
    source: input.source,
  };
}

/** Parse a transport's completed-turn counters without inventing missing totals. */
export function completedTurnTelemetry(input: {
  turnId: string;
  modelId?: string;
  source: AgentUsageSource;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    contextTokens?: number;
    costUsd?: number;
    models?: Array<{ modelId: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }>;
  };
  /** True only when the transport proves input is uncached and cache buckets are disjoint. */
  uncachedInput?: boolean;
}): AgentTurnTelemetry {
  const { usage, source } = input;
  const modelId = input.modelId?.trim() || 'unknown';
  const unavailable = (reason: string): AgentTurnTelemetry => ({
    status: 'unavailable', turnId: input.turnId, modelId, source, reason,
  });
  if (!usage) return unavailable('no-usage-event');
  const valid = (value: number | undefined): value is number =>
    value !== undefined && Number.isSafeInteger(value) && value >= 0;
  if (!valid(usage.inputTokens) || !valid(usage.outputTokens)) return unavailable('missing-input-or-output-tokens');
  if (modelId === 'unknown') return unavailable('model-id-unavailable');
  const metric = (value: number | undefined): AgentTokenDatum =>
    valid(value) ? { status: 'reported', value, source } : { status: 'unavailable', reason: 'not-reported', source };
  const cost = usage.costUsd !== undefined && Number.isFinite(usage.costUsd) && usage.costUsd >= 0
    ? { status: 'reported' as const, value: usage.costUsd, source }
    : { status: 'unavailable' as const, reason: 'not-reported', source };
  const read = usage.cacheReadTokens;
  const write = usage.cacheWriteTokens;
  const cacheSemantics = valid(read) && valid(write) ? 'verified-subsets' : 'unknown';
  if (input.uncachedInput && cacheSemantics !== 'verified-subsets') return unavailable('cache-buckets-unavailable');
  const inputTokens = input.uncachedInput && valid(read) && valid(write)
    ? usage.inputTokens + read + write : usage.inputTokens;
  const parsed = agentTurnUsageSchema.safeParse({
    turnId: input.turnId, modelId, scope: 'turn', source,
    inputTokens, outputTokens: usage.outputTokens,
    cacheReadTokens: metric(read), cacheWriteTokens: metric(write),
    requestContextTokens: metric(usage.contextTokens), providerCostUsd: cost,
    cacheSemantics,
    ...(usage.models && { models: usage.models }),
  });
  return parsed.success ? { status: 'reported', usage: parsed.data } : unavailable('invalid-usage-values');
}

import { agentTurnTelemetrySchema, agentTurnUsageSchema, completedTurnTelemetry } from './agent-turn-usage.types';

const missing = { status: 'unavailable', reason: 'not emitted', source: 'stream' } as const;
const usage = {
  turnId: 'turn-1', modelId: 'model-1', scope: 'turn', source: 'stream',
  inputTokens: 12, outputTokens: 3,
  cacheReadTokens: missing, cacheWriteTokens: missing,
  requestContextTokens: missing, providerCostUsd: missing,
  cacheSemantics: 'unknown',
} as const;

describe('agent turn usage contract', () => {
  it('requires both totals and provenance', () => {
    expect(agentTurnUsageSchema.safeParse(usage).success).toBe(true);
    expect(agentTurnUsageSchema.safeParse({ ...usage, outputTokens: undefined }).success).toBe(false);
    expect(agentTurnUsageSchema.safeParse({ ...usage, inputTokens: -1 }).success).toBe(false);
    expect(agentTurnUsageSchema.safeParse({ ...usage, cacheReadTokens: { status: 'reported', value: 1.5, source: 'stream' } }).success).toBe(false);
  });
  it('represents missing turn accounting explicitly', () => {
    expect(agentTurnTelemetrySchema.safeParse({ status: 'unavailable', turnId: 't', modelId: 'm', source: 'stream', reason: 'missing totals' }).success).toBe(true);
  });
  it('normalizes uncached input only with complete cache buckets', () => {
    expect(completedTurnTelemetry({ turnId: 't', modelId: 'm', source: 'sdk', usage: { inputTokens: 2, outputTokens: 4, cacheReadTokens: 10, cacheWriteTokens: 5 }, uncachedInput: true })).toMatchObject({ status: 'reported', usage: { inputTokens: 17, outputTokens: 4 } });
    expect(completedTurnTelemetry({ turnId: 't', modelId: 'm', source: 'sdk', usage: { inputTokens: 2, outputTokens: 4 }, uncachedInput: true })).toMatchObject({ status: 'unavailable', reason: 'cache-buckets-unavailable' });
  });
  it('never converts a missing usage event into zero', () => {
    expect(completedTurnTelemetry({ turnId: 't', modelId: 'm', source: 'stream' })).toMatchObject({ status: 'unavailable', reason: 'no-usage-event' });
  });
});

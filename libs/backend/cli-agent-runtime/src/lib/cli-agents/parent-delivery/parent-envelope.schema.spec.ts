import { AgentId, LANE_STOP_REASONS } from '@ptah-extension/shared';
import {
  ParentEnvelopeRecordSchema,
  ParentEnvelopeBodySchema,
  ParentCompletionOutboxEntrySchema,
} from './parent-envelope.schema';

describe('parent completion stop reason persistence', () => {
  const agentId = AgentId.create();
  it.each(LANE_STOP_REASONS)('parses old and new reason %s across all envelopes', (stopReason) => {
    const common = {
      parentSessionId: 'session', agentId, kind: 'completion' as const,
      dedupeKey: 'key', verdict: 'unverified' as const,
      stopReason, originName: 'lane', createdAt: 1,
    };
    expect(ParentEnvelopeRecordSchema.parse({
      ...common, id: 'lane-delivery:key', updatedAt: 1,
      state: 'pending', attempts: 0, bodyBytes: 1,
    }).stopReason).toBe(stopReason);
    expect(ParentEnvelopeBodySchema.parse({
      ...common, text: 'body', envelopeId: 'lane-delivery:key',
    }).stopReason).toBe(stopReason);
    expect(ParentCompletionOutboxEntrySchema.parse({
      parentSessionId: common.parentSessionId, agentId: common.agentId,
      dedupeKey: common.dedupeKey, verdict: common.verdict,
      stopReason, originName: common.originName, createdAt: common.createdAt,
      completedAt: '2026-11-08T00:00:00.000Z', body: 'body',
    }).stopReason).toBe(stopReason);
  });
});

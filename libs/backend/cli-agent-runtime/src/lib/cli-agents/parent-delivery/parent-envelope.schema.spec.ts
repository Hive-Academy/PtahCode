import { AgentId, LANE_STOP_REASONS } from '@ptah-extension/shared';
import {
  PARENT_ENVELOPE_MAX_BODY_CHARS,
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

describe('parent envelope originKind', () => {
  const agentId = AgentId.create();
  const common = {
    parentSessionId: 'session', agentId, kind: 'report' as const, dedupeKey: 'key', createdAt: 1,
  };
  const record = { ...common, id: 'lane-delivery:key', updatedAt: 1,
    state: 'pending', attempts: 0, bodyBytes: 1 };
  const body = { ...common, text: 'body', envelopeId: 'lane-delivery:key' };

  it('parses without originKind for records written before child sessions queued reports', () => {
    expect(ParentEnvelopeRecordSchema.parse(record).originKind).toBeUndefined();
    expect(ParentEnvelopeBodySchema.parse(body).originKind).toBeUndefined();
  });

  it.each(['agent', 'session'] as const)('parses originKind %s', (originKind) => {
    expect(ParentEnvelopeRecordSchema.parse({ ...record, originKind }).originKind).toBe(originKind);
    expect(ParentEnvelopeBodySchema.parse({ ...body, originKind }).originKind).toBe(originKind);
  });

  it('rejects an unknown originKind', () => {
    expect(ParentEnvelopeRecordSchema.safeParse({ ...record, originKind: 'human' }).success).toBe(false);
    expect(ParentEnvelopeBodySchema.safeParse({ ...body, originKind: 'human' }).success).toBe(false);
  });
});

describe('parent envelope record unknown keys', () => {
  const record = {
    id: 'lane-delivery:key', parentSessionId: 'session', agentId: 'agent', kind: 'report' as const,
    dedupeKey: 'key', createdAt: 1, updatedAt: 1, state: 'pending', attempts: 0, bodyBytes: 1,
  };

  it('strips an unknown key instead of rejecting the record', () => {
    const parsed = ParentEnvelopeRecordSchema.safeParse({ ...record, futureField: 'x' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).not.toHaveProperty('futureField');
  });
});

describe('parent envelope body limit', () => {
  const body = {
    text: '', envelopeId: 'lane-delivery:key', parentSessionId: 'session', agentId: 'agent',
    kind: 'report' as const, dedupeKey: 'key', createdAt: 1,
  };

  it('accepts a body of exactly the exported limit and rejects one more character', () => {
    expect(PARENT_ENVELOPE_MAX_BODY_CHARS).toBe(1_048_576);
    const limit = 'x'.repeat(PARENT_ENVELOPE_MAX_BODY_CHARS);
    expect(ParentEnvelopeBodySchema.safeParse({ ...body, text: limit }).success).toBe(true);
    expect(ParentEnvelopeBodySchema.safeParse({ ...body, text: `${limit}x` }).success).toBe(false);
  });
});

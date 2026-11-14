import type { NativeCodexAgentStatusEvent } from '@ptah-extension/shared';
import type { SubagentRecord } from './agent-monitor.store';
import { reduceNativeCodexStatus } from './native-codex-status.reducer';

const parentSessionId = 'parent-thread';
const cardId = 'spawn-card';
const childThreadId = 'child-thread';

function statusEvent(
  status: NativeCodexAgentStatusEvent['status'],
  cycleOrdinal = 1,
  cycleId = `cycle-${cycleOrdinal}`,
): NativeCodexAgentStatusEvent {
  return {
    id: `${cycleId}-${status}`,
    eventType: 'agent_status',
    timestamp: cycleOrdinal + 10,
    sessionId: parentSessionId,
    messageId: 'parent-turn',
    parentToolUseId: cardId,
    agentId: childThreadId,
    status,
    native: {
      provider: 'codex',
      agentThreadId: childThreadId,
      activityId: `activity-${cycleOrdinal}`,
      cycleId,
      cycleOrdinal,
      kind: status === 'paused' ? 'interrupted' : status === 'running' ? 'interacted' : 'completed',
    },
  };
}

function record(status: SubagentRecord['status'] = 'running'): SubagentRecord {
  return {
    parentToolUseId: cardId,
    agentId: childThreadId,
    agentType: 'codex',
    parentSessionId,
    status,
    nativeCycleId: 'cycle-1',
    nativeCycleOrdinal: 1,
    ...(status === 'completed' || status === 'failed'
      ? { nativeLastTerminalKey: `cycle-1:${status}`, completedAt: 11 }
      : {}),
  };
}

describe('reduceNativeCodexStatus', () => {
  it('creates a Codex record from an absent card', () => {
    expect(reduceNativeCodexStatus(undefined, statusEvent('running'), parentSessionId)).toMatchObject({
      parentToolUseId: cardId,
      agentId: childThreadId,
      agentType: 'codex',
      parentSessionId,
      status: 'running',
      nativeCycleId: 'cycle-1',
      nativeCycleOrdinal: 1,
    });
  });

  it('reopens a completed card for a higher ordinal', () => {
    const reopened = reduceNativeCodexStatus(record('completed'), statusEvent('running', 2), parentSessionId);
    expect(reopened).toMatchObject({
      status: 'running',
      nativeCycleOrdinal: 2,
      nativeCycleId: 'cycle-2',
    });
    expect(reopened?.completedAt).toBeUndefined();
  });

  it('ignores a lower ordinal', () => {
    expect(reduceNativeCodexStatus({ ...record(), nativeCycleOrdinal: 2 }, statusEvent('failed'), parentSessionId)).toBeNull();
  });

  it('ignores a different cycle ID at the same ordinal', () => {
    expect(reduceNativeCodexStatus(record(), statusEvent('paused', 1, 'other-cycle'), parentSessionId)).toBeNull();
  });

  it('ignores a duplicate terminal status in the same cycle', () => {
    expect(reduceNativeCodexStatus(record('completed'), statusEvent('completed'), parentSessionId)).toBeNull();
  });

  it('lets same-cycle failure override completion', () => {
    expect(reduceNativeCodexStatus(record('completed'), {
      ...statusEvent('failed'), errorMessage: 'child failed',
    }, parentSessionId)).toMatchObject({
      status: 'failed',
      errorMessage: 'child failed',
      nativeLastTerminalKey: 'cycle-1:failed',
    });
  });

  it('ignores completion after failure in the same cycle', () => {
    expect(reduceNativeCodexStatus(record('failed'), statusEvent('completed'), parentSessionId)).toBeNull();
  });

  it('ignores running after a terminal status in the same cycle', () => {
    expect(reduceNativeCodexStatus(record('completed'), statusEvent('running'), parentSessionId)).toBeNull();
  });

  it('applies running to paused in the same cycle', () => {
    expect(reduceNativeCodexStatus(record(), statusEvent('paused'), parentSessionId)?.status).toBe('paused');
  });

  it('keeps a history-settled terminal card for the same or unknown cycle and accepts a new cycle', () => {
    const sameCycle: SubagentRecord = { ...record('completed'), nativeCycleOrdinal: undefined, settledFromHistory: true };
    const unknownCycle: SubagentRecord = { ...sameCycle, nativeCycleId: undefined };
    expect(reduceNativeCodexStatus(sameCycle, statusEvent('running'), parentSessionId)).toBeNull();
    expect(reduceNativeCodexStatus(unknownCycle, statusEvent('running'), parentSessionId)).toBeNull();
    expect(reduceNativeCodexStatus(sameCycle, statusEvent('running', 2), parentSessionId)).toMatchObject({
      status: 'running',
      nativeCycleId: 'cycle-2',
      nativeCycleOrdinal: 2,
      settledFromHistory: false,
    });
  });

  it('ignores an existing agent of another type', () => {
    expect(reduceNativeCodexStatus({ ...record(), agentType: 'Explore' }, statusEvent('running', 2), parentSessionId)).toBeNull();
  });

  it('keeps the existing parent session when the resolved session is undefined', () => {
    expect(reduceNativeCodexStatus(record(), statusEvent('paused'), undefined)?.parentSessionId).toBe(parentSessionId);
  });

  it('preserves existing usage and invents no usage for a new card', () => {
    const existing: SubagentRecord = { ...record(), totalTokens: 42, toolUses: 3, durationMs: 100, usage: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 } };
    const updated = reduceNativeCodexStatus(existing, statusEvent('paused'), parentSessionId);
    expect(updated?.totalTokens).toBe(existing.totalTokens);
    expect(updated?.toolUses).toBe(existing.toolUses);
    expect(updated?.durationMs).toBe(existing.durationMs);
    expect(updated?.usage).toBe(existing.usage);
    const created = reduceNativeCodexStatus(undefined, statusEvent('running'), parentSessionId);
    expect(created?.totalTokens).toBeUndefined();
    expect(created?.toolUses).toBeUndefined();
    expect(created?.durationMs).toBeUndefined();
    expect(created?.usage).toBeUndefined();
  });
});

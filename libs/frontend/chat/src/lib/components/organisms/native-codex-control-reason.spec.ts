import type { SubagentRecord } from '@ptah-extension/chat-streaming';
import { isNativeCodexAgent } from './native-codex-control-reason';

describe('isNativeCodexAgent', () => {
  const record: SubagentRecord = {
    parentToolUseId: 'tool-1',
    agentType: 'codex',
    status: 'running',
  };

  it('recognizes a native Codex cycle', () => {
    expect(isNativeCodexAgent({ ...record, nativeCycleId: 'thread-1:1', nativeCycleOrdinal: 1 })).toBe(true);
  });

  it('leaves v1 Codex records without a native cycle alone', () => {
    expect(isNativeCodexAgent(record)).toBe(false);
  });

  it('leaves SDK records and missing records alone', () => {
    expect(isNativeCodexAgent({ ...record, taskId: 'task-1', nativeCycleId: 'thread-1:1' })).toBe(false);
    expect(isNativeCodexAgent({ ...record, agentType: 'claude', nativeCycleId: 'thread-1:1' })).toBe(false);
    expect(isNativeCodexAgent(undefined)).toBe(false);
  });
});

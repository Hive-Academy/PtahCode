import type { SubagentRecord } from '@ptah-extension/chat-streaming';
import { isNativeCodexAgent, withoutNativeCodexAgents } from './native-codex-control-reason';

describe('withoutNativeCodexAgents', () => {
  const monitor = new Map<string, SubagentRecord>([
    ['native-card', { parentToolUseId: 'native-card', agentType: 'codex', status: 'interrupted', nativeCycleId: 'thread-1:1', nativeCycleOrdinal: 1 }],
    ['claude-task', { parentToolUseId: 'claude-task', agentType: 'Explore', status: 'interrupted', taskId: 'task-1' }],
  ]);

  it('never offers a native Codex child for resume and keeps Claude subagents', () => {
    const resumable = [{ toolCallId: 'native-card' }, { toolCallId: 'claude-task' }, { toolCallId: 'unknown' }];
    expect(withoutNativeCodexAgents(resumable, (id) => monitor.get(id))).toEqual([
      { toolCallId: 'claude-task' },
      { toolCallId: 'unknown' },
    ]);
  });
});

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

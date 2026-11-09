import 'reflect-metadata';
import type { IStateStorage } from '@ptah-extension/platform-core';
import { SessionHandoffAckStore, HANDOFF_ACK_STORAGE_KEY } from './session-handoff-ack.store';

describe('SessionHandoffAckStore', () => {
  it('persists a pair and compare-and-set transitions across store instances', async () => {
    const values = new Map<string, unknown>();
    const storage: IStateStorage = {
      get: <T>(key: string) => values.get(key) as T | undefined,
      update: async (key, value) => { values.set(key, value); },
      keys: () => [...values.keys()],
    };
    const first = new SessionHandoffAckStore(storage);
    await first.record({
      predecessorTabId: 'before', predecessorSdkId: 'sdk-before',
      successorTabId: 'after', successorSdkId: null,
      workspaceRoot: '/workspace', handoffPath: '/workspace/HANDOFF.md', state: 'recorded',
    });
    const restarted = new SessionHandoffAckStore(storage);
    expect(await restarted.findBySuccessor('after')).toMatchObject({ predecessorTabId: 'before' });
    expect(await restarted.compareAndSet('before', 'recorded', { state: 'closePending' })).toBe(true);
    expect(await restarted.compareAndSet('before', 'recorded', { state: 'closeCompleted' })).toBe(false);
    expect(await first.findByPredecessor('sdk-before')).toMatchObject({ state: 'closePending' });
    expect(values.has(HANDOFF_ACK_STORAGE_KEY)).toBe(true);
  });
});

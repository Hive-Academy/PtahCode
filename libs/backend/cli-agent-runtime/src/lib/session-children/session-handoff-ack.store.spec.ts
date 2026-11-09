import 'reflect-metadata';
import type { IStateStorage } from '@ptah-extension/platform-core';
import { SessionHandoffAckStore, HANDOFF_ACK_STORAGE_KEY } from './session-handoff-ack.store';

describe('SessionHandoffAckStore', () => {
  it('recovers invalid state and prunes oldest completed records', async () => {
    const values = new Map<string, unknown>([[HANDOFF_ACK_STORAGE_KEY, { schemaVersion: 99, records: [] }]]);
    const logger = { error: jest.fn() };
    const storage: IStateStorage = {
      get: <T>(key: string) => values.get(key) as T | undefined,
      update: async (key, value) => { values.set(key, value); },
      keys: () => [...values.keys()],
    };
    const store = new SessionHandoffAckStore(storage, logger as never);
    expect(await store.findByPredecessor('missing')).toBeUndefined();
    expect(logger.error).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 202; i++) {
      const predecessorTabId = `before-${i}`;
      await store.record({ predecessorTabId, predecessorSdkId: null, successorTabId: `after-${i}`, successorSdkId: null, workspaceRoot: '/workspace', handoffPath: '/workspace/HANDOFF.md', state: 'closeCompleted' });
    }
    expect(await store.findByPredecessor('before-0')).toBeUndefined();
    expect(await store.findByPredecessor('before-1')).toBeUndefined();
    expect(await store.findByPredecessor('before-2')).toBeDefined();
  });
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

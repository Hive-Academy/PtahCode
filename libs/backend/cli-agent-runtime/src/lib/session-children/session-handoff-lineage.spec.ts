import 'reflect-metadata';
import type { IStateStorage } from '@ptah-extension/platform-core';
import { SessionHandoffAckStore } from './session-handoff-ack.store';
import { deliveryTarget, latestDeliveryTarget } from './session-handoff-lineage';

describe('kept handoff lineage', () => {
  it('routes delivery forward across a restarted store', async () => {
    const values = new Map<string, unknown>();
    const storage: IStateStorage = {
      get: <T>(key: string) => values.get(key) as T | undefined,
      update: async (key, value) => { values.set(key, value); },
      keys: () => [...values.keys()],
    };
    const first = new SessionHandoffAckStore(storage);
    const record = (before: string, after: string, state: 'starting' | 'recorded' = 'recorded') => ({
      predecessorTabId: before, predecessorSdkId: `sdk-${before}`,
      successorTabId: after, successorSdkId: `sdk-${after}`,
      workspaceRoot: '/workspace', handoffPath: '/workspace/HANDOFF.md', state,
    });
    await first.record(record('P', 'S'));
    await first.record(record('S', 'T'));
    await first.record(record('T', 'U', 'starting'));
    const restarted = new SessionHandoffAckStore(storage);
    const records = await restarted.records();
    // A `starting` record (T -> U) is not committed and gives no route.
    expect(latestDeliveryTarget(records, 'sdk-P')).toBe('T');
    expect(await deliveryTarget(restarted, 'P')).toBe('T');
    expect(latestDeliveryTarget(records, 'T')).toBe('T');
  });
});

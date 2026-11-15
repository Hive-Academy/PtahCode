import 'reflect-metadata';
import type { IStateStorage } from '@ptah-extension/platform-core';
import {
  SessionHandoffAckStore,
  HANDOFF_ACK_QUARANTINE_KEY,
  HANDOFF_ACK_STORAGE_KEY,
} from './session-handoff-ack.store';

describe('SessionHandoffAckStore', () => {
  it('replaces a stale recorded successor after restart and acknowledges the new one', async () => {
    const old = {
      predecessorTabId: 'before',
      predecessorSdkId: null,
      successorTabId: 'old',
      successorSdkId: null,
      workspaceRoot: '/workspace',
      handoffPath: '/workspace/HANDOFF.md',
      state: 'recorded' as const,
    };
    const values = new Map<string, unknown>([
      [HANDOFF_ACK_STORAGE_KEY, { schemaVersion: 1, records: [old] }],
    ]);
    const storage: IStateStorage = {
      get: <T>(key: string) => values.get(key) as T | undefined,
      update: async (key, value) => {
        values.set(key, value);
      },
      keys: () => [...values.keys()],
    };
    const restarted = new SessionHandoffAckStore(storage);
    await restarted.record({ ...old, successorTabId: 'new' });
    expect(await restarted.findBySuccessor('old')).toBeUndefined();
    expect(await restarted.findBySuccessor('new')).toMatchObject({
      state: 'recorded',
    });
    expect(
      await restarted.compareAndSet('before', 'recorded', {
        state: 'closePending',
      }),
    ).toBe(true);
    await expect(
      restarted.record({ ...old, successorTabId: 'third' }),
    ).rejects.toThrow();
  });
  it('replaces a starting record left by a stopped host, but not its own', async () => {
    const stale = {
      predecessorTabId: 'before',
      predecessorSdkId: null,
      successorTabId: 'lost',
      successorSdkId: null,
      workspaceRoot: '/workspace',
      handoffPath: '/workspace/HANDOFF.md',
      state: 'starting' as const,
    };
    const values = new Map<string, unknown>([
      [HANDOFF_ACK_STORAGE_KEY, { schemaVersion: 1, records: [stale] }],
    ]);
    const storage: IStateStorage = {
      get: <T>(key: string) => values.get(key) as T | undefined,
      update: async (key, value) => {
        values.set(key, value);
      },
      keys: () => [...values.keys()],
    };
    const restarted = new SessionHandoffAckStore(storage);
    await expect(restarted.record({ ...stale })).rejects.toThrow(
      'already recorded',
    );
    await restarted.record({ ...stale, successorTabId: 'next' });
    expect(await restarted.findBySuccessor('lost')).toBeUndefined();
    expect(await restarted.findBySuccessor('next')).toMatchObject({
      state: 'starting',
    });
    expect(
      await restarted.compareAndSet('before', 'starting', {
        state: 'recorded',
      }),
    ).toBe(true);
  });
  it('recovers invalid state and prunes oldest completed records', async () => {
    const values = new Map<string, unknown>([
      [HANDOFF_ACK_STORAGE_KEY, { schemaVersion: 99, records: [] }],
    ]);
    const logger = { error: jest.fn() };
    const storage: IStateStorage = {
      get: <T>(key: string) => values.get(key) as T | undefined,
      update: async (key, value) => {
        values.set(key, value);
      },
      keys: () => [...values.keys()],
    };
    const store = new SessionHandoffAckStore(storage, logger as never);
    expect(await store.findByPredecessor('missing')).toBeUndefined();
    expect(logger.error).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 202; i++) {
      const predecessorTabId = `before-${i}`;
      await store.record({
        predecessorTabId,
        predecessorSdkId: null,
        successorTabId: `after-${i}`,
        successorSdkId: null,
        workspaceRoot: '/workspace',
        handoffPath: '/workspace/HANDOFF.md',
        state: 'closeCompleted',
      });
    }
    expect(await store.findByPredecessor('before-0')).toBeUndefined();
    expect(await store.findByPredecessor('before-1')).toBeUndefined();
    expect(await store.findByPredecessor('before-2')).toBeDefined();
  });
  it('keeps invalid records unchanged and quarantines an invalid document', async () => {
    const bad = { predecessorTabId: '', state: 'unknown' };
    const valid = {
      predecessorTabId: 'kept',
      predecessorSdkId: null,
      successorTabId: 'kept-after',
      successorSdkId: null,
      workspaceRoot: '/workspace',
      handoffPath: '/workspace/HANDOFF.md',
      state: 'recorded' as const,
    };
    const values = new Map<string, unknown>([
      [HANDOFF_ACK_STORAGE_KEY, { schemaVersion: 1, records: [valid, bad] }],
    ]);
    const storage: IStateStorage = {
      get: <T>(key: string) => values.get(key) as T | undefined,
      update: async (key, value) => {
        values.set(key, value);
      },
      keys: () => [...values.keys()],
    };
    const store = new SessionHandoffAckStore(storage, {
      error: jest.fn(),
    } as never);
    expect(
      await store.compareAndSet('kept', 'recorded', { state: 'closePending' }),
    ).toBe(true);
    const doc = values.get(HANDOFF_ACK_STORAGE_KEY) as { records: unknown[] };
    expect(doc.records).toEqual([{ ...valid, state: 'closePending' }, bad]);

    const whole = { schemaVersion: 99, records: [valid] };
    values.set(HANDOFF_ACK_STORAGE_KEY, whole);
    await store.record({ ...valid, predecessorTabId: 'fresh' });
    expect(values.get(HANDOFF_ACK_QUARANTINE_KEY)).toEqual([whole]);
    expect(
      (values.get(HANDOFF_ACK_STORAGE_KEY) as { records: unknown[] }).records,
    ).toHaveLength(1);

    const second = { schemaVersion: 98 };
    values.set(HANDOFF_ACK_STORAGE_KEY, second);
    await store.record({ ...valid, predecessorTabId: 'later' });
    expect(values.get(HANDOFF_ACK_QUARANTINE_KEY)).toEqual([whole, second]);
  });
  it('persists a pair and compare-and-set transitions across store instances', async () => {
    const values = new Map<string, unknown>();
    const storage: IStateStorage = {
      get: <T>(key: string) => values.get(key) as T | undefined,
      update: async (key, value) => {
        values.set(key, value);
      },
      keys: () => [...values.keys()],
    };
    const first = new SessionHandoffAckStore(storage);
    await first.record({
      predecessorTabId: 'before',
      predecessorSdkId: 'sdk-before',
      successorTabId: 'after',
      successorSdkId: null,
      workspaceRoot: '/workspace',
      handoffPath: '/workspace/HANDOFF.md',
      state: 'recorded',
    });
    const restarted = new SessionHandoffAckStore(storage);
    expect(await restarted.findBySuccessor('after')).toMatchObject({
      predecessorTabId: 'before',
    });
    expect(
      await restarted.compareAndSet('before', 'recorded', {
        state: 'closePending',
      }),
    ).toBe(true);
    expect(
      await restarted.compareAndSet('before', 'recorded', {
        state: 'closeCompleted',
      }),
    ).toBe(false);
    expect(await first.findByPredecessor('sdk-before')).toMatchObject({
      state: 'closePending',
    });
    expect(values.has(HANDOFF_ACK_STORAGE_KEY)).toBe(true);
    expect(
      await restarted.transition('before', 'recorded', {
        state: 'closeCompleted',
      }),
    ).toBe('already');
    expect(
      await restarted.transition('absent', 'recorded', {
        state: 'closePending',
      }),
    ).toBe('missing');
    expect(
      await restarted.transition('before', 'closePending', {
        state: 'closeCompleted',
      }),
    ).toBe('moved');
  });

  it('pins record lookups and transitions to their workspace after the active workspace switches', async () => {
    const documents = new Map<string, Map<string, unknown>>([
      ['/a', new Map()],
      ['/b', new Map()],
    ]);
    const delegate = (path: string): IStateStorage => ({
      get: <T>(key: string) => documents.get(path)?.get(key) as T | undefined,
      update: async (key, value) => {
        documents.get(path)?.set(key, value);
      },
      keys: () => [...(documents.get(path)?.keys() ?? [])],
    });
    const a = delegate('/a');
    const b = delegate('/b');
    let active = a;
    const storage: IStateStorage & {
      getStorageForWorkspace(path: string): IStateStorage | undefined;
      getAllWorkspacePaths(): string[];
    } = {
      get: <T>(key: string) => active.get<T>(key),
      update: (key, value) => active.update(key, value),
      keys: () => active.keys(),
      getStorageForWorkspace: (path) =>
        path === '/a' ? a : path === '/b' ? b : undefined,
      getAllWorkspacePaths: () => ['/a', '/b'],
    };
    const store = new SessionHandoffAckStore(storage);
    await store.record({
      predecessorTabId: 'before',
      predecessorSdkId: null,
      successorTabId: 'after',
      successorSdkId: null,
      workspaceRoot: '/a',
      handoffPath: '/a/HANDOFF.md',
      state: 'recorded',
    });
    active = b;
    expect(await store.findByPredecessor('before')).toMatchObject({
      workspaceRoot: '/a',
    });
    expect(await store.findBySuccessor('after')).toMatchObject({
      workspaceRoot: '/a',
    });
    expect(
      await store.transition('before', 'recorded', { state: 'closePending' }),
    ).toBe('moved');
    expect(
      await store.compareAndSet('before', 'closePending', {
        state: 'closeCompleted',
      }),
    ).toBe(true);
    expect(
      (
        documents.get('/a')?.get(HANDOFF_ACK_STORAGE_KEY) as {
          records: { state: string }[];
        }
      ).records[0].state,
    ).toBe('closeCompleted');
    expect(documents.get('/b')?.has(HANDOFF_ACK_STORAGE_KEY)).toBe(false);
  });

  it('transitions a record in the document that holds it when its workspace document does not', async () => {
    const documents = new Map<string, Map<string, unknown>>([
      ['/a', new Map()],
      ['/b', new Map()],
    ]);
    const delegate = (path: string): IStateStorage => ({
      get: <T>(key: string) => documents.get(path)?.get(key) as T | undefined,
      update: async (key, value) => {
        documents.get(path)?.set(key, value);
      },
      keys: () => [...(documents.get(path)?.keys() ?? [])],
    });
    const a = delegate('/a');
    const b = delegate('/b');
    const storage: IStateStorage & {
      getStorageForWorkspace(path: string): IStateStorage | undefined;
      getAllWorkspacePaths(): string[];
    } = {
      get: <T>(key: string) => b.get<T>(key),
      update: (key, value) => b.update(key, value),
      keys: () => b.keys(),
      getStorageForWorkspace: (path) =>
        path === '/a' ? a : path === '/b' ? b : undefined,
      getAllWorkspacePaths: () => ['/a', '/b'],
    };
    // An older host wrote the record of workspace /a into the active document /b.
    documents.get('/b')?.set(HANDOFF_ACK_STORAGE_KEY, {
      schemaVersion: 1,
      records: [
        {
          predecessorTabId: 'before',
          predecessorSdkId: null,
          successorTabId: 'after',
          successorSdkId: null,
          workspaceRoot: '/a',
          handoffPath: '/a/HANDOFF.md',
          state: 'recorded',
        },
      ],
    });
    const store = new SessionHandoffAckStore(storage);
    expect(
      await store.transition('before', 'recorded', { state: 'closePending' }),
    ).toBe('moved');
    expect(
      (
        documents.get('/b')?.get(HANDOFF_ACK_STORAGE_KEY) as {
          records: { state: string }[];
        }
      ).records[0].state,
    ).toBe('closePending');
    expect(documents.get('/a')?.has(HANDOFF_ACK_STORAGE_KEY)).toBe(false);
  });

  it('serializes concurrent transitions', async () => {
    const values = new Map<string, unknown>();
    const storage: IStateStorage = {
      get: <T>(key: string) => values.get(key) as T | undefined,
      update: async (key, value) => {
        values.set(key, value);
      },
      keys: () => [...values.keys()],
    };
    const store = new SessionHandoffAckStore(storage);
    await store.record({
      predecessorTabId: 'before',
      predecessorSdkId: null,
      successorTabId: 'after',
      successorSdkId: null,
      workspaceRoot: '/a',
      handoffPath: '/a/HANDOFF.md',
      state: 'recorded',
    });
    const results = await Promise.all([
      store.transition('before', 'recorded', { state: 'closePending' }),
      store.transition('before', 'recorded', { state: 'closePending' }),
    ]);
    expect(results.sort()).toEqual(['already', 'moved']);
  });

  it('matches normalized roots and finds records in default storage after activation', async () => {
    const documents = new Map<string, Map<string, unknown>>([
      ['default', new Map()],
      ['/a', new Map()],
      ['/b', new Map()],
    ]);
    const delegate = (name: string): IStateStorage => ({
      get: <T>(key: string) => documents.get(name)?.get(key) as T | undefined,
      update: async (key, value) => {
        documents.get(name)?.set(key, value);
      },
      keys: () => [...(documents.get(name)?.keys() ?? [])],
    });
    const fallback = delegate('default');
    const a = delegate('/a');
    const b = delegate('/b');
    let active: IStateStorage = fallback;
    const storage = {
      get: <T>(key: string) => active.get<T>(key),
      update: (key: string, value: unknown) => active.update(key, value),
      keys: () => active.keys(),
      getStorageForWorkspace: (root: string) =>
        root === '/a' ? a : root === '/b' ? b : undefined,
      getAllWorkspacePaths: () => ['/a', '/b'],
      getDefaultStorage: () => fallback,
    };
    const store = new SessionHandoffAckStore(storage);
    const base = {
      predecessorTabId: 'before',
      predecessorSdkId: null,
      successorTabId: 'after',
      successorSdkId: null,
      workspaceRoot: '/a/',
      handoffPath: '/a/HANDOFF.md',
      state: 'recorded' as const,
    };
    await store.record(base);
    expect(documents.get('/a')?.has(HANDOFF_ACK_STORAGE_KEY)).toBe(true);
    active = b;
    expect(
      await store.transition('before', 'recorded', { state: 'closePending' }),
    ).toBe('moved');
    expect(
      (
        documents.get('/a')?.get(HANDOFF_ACK_STORAGE_KEY) as {
          records: { state: string }[];
        }
      ).records[0].state,
    ).toBe('closePending');

    active = fallback;
    await store.record({
      ...base,
      predecessorTabId: 'default-before',
      successorTabId: 'default-after',
      workspaceRoot: '/unregistered',
    });
    active = b;
    expect(await store.findByPredecessor('default-before')).toBeDefined();
    expect(
      await store.transition('default-before', 'recorded', {
        state: 'closePending',
      }),
    ).toBe('moved');
    expect(
      (
        documents.get('default')?.get(HANDOFF_ACK_STORAGE_KEY) as {
          records: { state: string }[];
        }
      ).records[0].state,
    ).toBe('closePending');
    expect(
      (await store.records()).map((record) => record.predecessorTabId).sort(),
    ).toEqual(['before', 'default-before']);
  });

  it('replaces a record from another document in the pinned document', async () => {
    const documents = new Map<string, Map<string, unknown>>([
      ['/a', new Map()],
      ['/b', new Map()],
    ]);
    const delegate = (root: string): IStateStorage => ({
      get: <T>(key: string) => documents.get(root)?.get(key) as T | undefined,
      update: async (key, value) => {
        documents.get(root)?.set(key, value);
      },
      keys: () => [...(documents.get(root)?.keys() ?? [])],
    });
    const a = delegate('/a');
    const b = delegate('/b');
    const storage = {
      get: <T>(key: string) => b.get<T>(key),
      update: (key: string, value: unknown) => b.update(key, value),
      keys: () => b.keys(),
      getStorageForWorkspace: (root: string) =>
        root === '/a' ? a : root === '/b' ? b : undefined,
      getAllWorkspacePaths: () => ['/a', '/b'],
    };
    const store = new SessionHandoffAckStore(storage);
    const old = {
      predecessorTabId: 'before',
      predecessorSdkId: null,
      successorTabId: 'old',
      successorSdkId: null,
      workspaceRoot: '/b',
      handoffPath: '/b/HANDOFF.md',
      state: 'starting' as const,
    };
    await store.record(old);
    await store.record({ ...old, successorTabId: 'new', workspaceRoot: '/a' });
    expect(documents.get('/b')?.get(HANDOFF_ACK_STORAGE_KEY)).toEqual({
      schemaVersion: 1,
      records: [],
    });
    expect(await store.findByPredecessor('before')).toMatchObject({
      successorTabId: 'new',
    });
    expect(
      (
        documents.get('/a')?.get(HANDOFF_ACK_STORAGE_KEY) as {
          records: unknown[];
        }
      ).records,
    ).toHaveLength(1);
  });
});

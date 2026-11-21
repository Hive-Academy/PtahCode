import {
  PROVIDER_SESSION_PID_LEDGER_KEY,
  createElectronProviderSessionPidLedgerStore,
} from './provider-session-pid-ledger-store';

function memoryStorage(initial?: unknown) {
  const values = new Map<string, unknown>();
  if (initial !== undefined) values.set(PROVIDER_SESSION_PID_LEDGER_KEY, initial);
  return {
    values,
    get<T>(key: string): T | undefined {
      return values.get(key) as T | undefined;
    },
    update: jest.fn(async (key: string, value: unknown) => {
      values.set(key, value);
    }),
  };
}

function logger() {
  return { warn: jest.fn(), error: jest.fn() };
}

describe('Electron provider-session pid ledger store', () => {
  it('records and removes live pids in the state storage', async () => {
    const storage = memoryStorage();
    const store = createElectronProviderSessionPidLedgerStore(storage, logger());
    store.ledger.record({ pid: 41, profile: 'antigravity', startedAt: 1000 });
    store.ledger.record({ pid: 42, profile: 'antigravity', startedAt: 2000 });
    await store.flush();
    expect(storage.values.get(PROVIDER_SESSION_PID_LEDGER_KEY)).toEqual({
      version: 1,
      entries: [
        { pid: 41, profile: 'antigravity', startedAt: 1000 },
        { pid: 42, profile: 'antigravity', startedAt: 2000 },
      ],
    });
    store.ledger.remove(41);
    store.ledger.remove(999); // unknown pid: no write, no throw
    await store.flush();
    expect(storage.update).toHaveBeenCalledTimes(3);
    expect(storage.values.get(PROVIDER_SESSION_PID_LEDGER_KEY)).toEqual({
      version: 1,
      entries: [{ pid: 42, profile: 'antigravity', startedAt: 2000 }],
    });
  });

  it('loads the previous run rows, keeps them until settled, drops malformed rows', async () => {
    const storage = memoryStorage({
      version: 1,
      entries: [
        { pid: 7, profile: 'antigravity', startedAt: 500 },
        { pid: -1, profile: 'antigravity', startedAt: 500 },
        { pid: 8, profile: 'unknown', startedAt: 500 },
        'junk',
      ],
    });
    const store = createElectronProviderSessionPidLedgerStore(storage, logger());
    expect(store.previous()).toEqual([
      { pid: 7, profile: 'antigravity', startedAt: 500 },
    ]);
    store.ledger.record({ pid: 9, profile: 'antigravity', startedAt: 900 });
    await store.flush();
    // A crash before the sweep settles still sweeps row 7 next time.
    expect(storage.values.get(PROVIDER_SESSION_PID_LEDGER_KEY)).toEqual({
      version: 1,
      entries: [
        { pid: 7, profile: 'antigravity', startedAt: 500 },
        { pid: 9, profile: 'antigravity', startedAt: 900 },
      ],
    });
    await store.settlePrevious();
    expect(store.previous()).toEqual([]);
    expect(storage.values.get(PROVIDER_SESSION_PID_LEDGER_KEY)).toEqual({
      version: 1,
      entries: [{ pid: 9, profile: 'antigravity', startedAt: 900 }],
    });
  });

  it('ignores a ledger of unknown shape and an unreadable storage', () => {
    const log = logger();
    expect(
      createElectronProviderSessionPidLedgerStore(
        memoryStorage({ version: 2, rows: [] }),
        log,
      ).previous(),
    ).toEqual([]);
    const throwing = {
      get: jest.fn(() => {
        throw new Error('locked');
      }),
      update: jest.fn(async () => undefined),
    };
    expect(
      createElectronProviderSessionPidLedgerStore(throwing, log).previous(),
    ).toEqual([]);
    expect(log.warn).toHaveBeenCalledTimes(2);
  });

  it('logs a failed write and never throws from record', async () => {
    const log = logger();
    const storage = memoryStorage();
    storage.update.mockRejectedValueOnce(new Error('disk full'));
    const store = createElectronProviderSessionPidLedgerStore(storage, log);
    expect(() =>
      store.ledger.record({ pid: 3, profile: 'antigravity', startedAt: 1 }),
    ).not.toThrow();
    await store.flush();
    expect(log.error).toHaveBeenCalledWith(
      '[ProviderSessionPidLedger] Ledger write failed',
      expect.any(Error),
    );
    store.ledger.record({ pid: 4, profile: 'antigravity', startedAt: 2 });
    await store.flush();
    expect(storage.values.get(PROVIDER_SESSION_PID_LEDGER_KEY)).toEqual({
      version: 1,
      entries: [
        { pid: 3, profile: 'antigravity', startedAt: 1 },
        { pid: 4, profile: 'antigravity', startedAt: 2 },
      ],
    });
  });
});

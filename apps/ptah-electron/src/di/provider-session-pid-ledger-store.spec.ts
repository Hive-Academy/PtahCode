import {
  PROVIDER_SESSION_PID_LEDGER_KEY,
  createElectronProviderSessionPidLedgerStore,
  type ProcessIdentity,
} from './provider-session-pid-ledger-store';
import type { ProcessIdentityProbe } from './provider-session-orphan-sweep';

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

const identityOf = (pid: number): ProcessIdentity => ({
  createdAtMs: pid * 10,
  image: 'agy.exe',
});
/** A probe that finds every pid alive. */
const alive: ProcessIdentityProbe = async (pid) => identityOf(pid);
/** A probe that finds no process (identity cannot be recorded). */
const none: ProcessIdentityProbe = async () => undefined;
const win = (identify: ProcessIdentityProbe) => ({ platform: 'win32' as const, identify });
/** What every row gets without a probe on Windows. */
const IMAGE = { expectedImage: 'agy.exe' };

describe('Electron provider-session pid ledger store', () => {
  it('records live pids with their process identity, and removes them', async () => {
    const storage = memoryStorage();
    const store = createElectronProviderSessionPidLedgerStore(storage, logger(), win(alive));
    store.ledger.record({ pid: 41, profile: 'antigravity', startedAt: 1000, atSpawn: true });
    store.ledger.record({ pid: 42, profile: 'antigravity', startedAt: 2000 });
    await store.flush();
    expect(storage.values.get(PROVIDER_SESSION_PID_LEDGER_KEY)).toEqual({
      version: 1,
      entries: [
        {
          pid: 41,
          profile: 'antigravity',
          startedAt: 1000,
          atSpawn: true,
          ...IMAGE,
          identity: identityOf(41),
        },
        { pid: 42, profile: 'antigravity', startedAt: 2000, ...IMAGE, identity: identityOf(42) },
      ],
    });
    store.ledger.remove(41);
    store.ledger.remove(999); // unknown pid: no write, no throw
    await store.flush();
    expect(storage.values.get(PROVIDER_SESSION_PID_LEDGER_KEY)).toEqual({
      version: 1,
      entries: [
        { pid: 42, profile: 'antigravity', startedAt: 2000, ...IMAGE, identity: identityOf(42) },
      ],
    });
  });

  it('persists the probe-free identity before any probe resolves', async () => {
    const storage = memoryStorage();
    const store = createElectronProviderSessionPidLedgerStore(storage, logger(), {
      platform: 'linux',
      identify: () => new Promise<undefined>(() => undefined),
      flushProbeWaitMs: 10,
    });
    store.ledger.record({ pid: 43, profile: 'antigravity', startedAt: 3000, atSpawn: true });
    // A crash now still leaves a row the sweep can verify by image and time.
    await store.flush();
    expect(storage.values.get(PROVIDER_SESSION_PID_LEDGER_KEY)).toEqual({
      version: 1,
      entries: [
        { pid: 43, profile: 'antigravity', startedAt: 3000, atSpawn: true, expectedImage: 'agy' },
      ],
    });
  });

  it('caps the wait for a slow probe at flush', async () => {
    const storage = memoryStorage();
    const store = createElectronProviderSessionPidLedgerStore(storage, logger(), {
      ...win(() => new Promise<undefined>(() => undefined)),
      flushProbeWaitMs: 20,
    });
    store.ledger.record({ pid: 44, profile: 'antigravity', startedAt: 4000, atSpawn: true });
    const started = Date.now();
    await store.flush();
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(storage.values.get(PROVIDER_SESSION_PID_LEDGER_KEY)).toEqual({
      version: 1,
      entries: [
        { pid: 44, profile: 'antigravity', startedAt: 4000, atSpawn: true, ...IMAGE },
      ],
    });
  });

  it('keeps a row without probed identity when the probe fails, and logs it', async () => {
    const log = logger();
    const storage = memoryStorage();
    const store = createElectronProviderSessionPidLedgerStore(
      storage,
      log,
      win(async () => {
        throw new Error('powershell timeout');
      }),
    );
    store.ledger.record({ pid: 5, profile: 'antigravity', startedAt: 1 });
    await store.flush();
    expect(storage.values.get(PROVIDER_SESSION_PID_LEDGER_KEY)).toEqual({
      version: 1,
      entries: [{ pid: 5, profile: 'antigravity', startedAt: 1, ...IMAGE }],
    });
    expect(log.warn).toHaveBeenCalledWith(
      '[ProviderSessionPidLedger] Process identity not recorded',
      expect.objectContaining({ pid: 5, error: 'powershell timeout' }),
    );
  });

  it('does not attach a late identity to a removed row', async () => {
    const storage = memoryStorage();
    let resolveProbe: (identity: ProcessIdentity) => void = () => undefined;
    const store = createElectronProviderSessionPidLedgerStore(
      storage,
      logger(),
      win(() => new Promise((resolve) => (resolveProbe = resolve))),
    );
    store.ledger.record({ pid: 6, profile: 'antigravity', startedAt: 1 });
    store.ledger.remove(6);
    resolveProbe(identityOf(6));
    await store.flush();
    expect(storage.values.get(PROVIDER_SESSION_PID_LEDGER_KEY)).toEqual({
      version: 1,
      entries: [],
    });
  });

  it('loads the previous run rows, keeps them until settled, drops malformed rows', async () => {
    const storage = memoryStorage({
      version: 1,
      entries: [
        { pid: 7, profile: 'antigravity', startedAt: 500, identity: identityOf(7) },
        { pid: 10, profile: 'antigravity', startedAt: 500, atSpawn: true, ...IMAGE, sweepAttempts: 1 },
        { pid: -1, profile: 'antigravity', startedAt: 500 },
        { pid: 8, profile: 'unknown', startedAt: 500 },
        { pid: 11, profile: 'antigravity', startedAt: 500, identity: { createdAtMs: 1, image: '' } },
        'junk',
      ],
    });
    const store = createElectronProviderSessionPidLedgerStore(storage, logger(), win(none));
    expect(store.previous()).toEqual([
      { pid: 7, profile: 'antigravity', startedAt: 500, identity: identityOf(7) },
      { pid: 10, profile: 'antigravity', startedAt: 500, atSpawn: true, ...IMAGE, sweepAttempts: 1 },
    ]);
    store.ledger.record({ pid: 9, profile: 'antigravity', startedAt: 900 });
    await store.flush();
    const nine = { pid: 9, profile: 'antigravity', startedAt: 900, ...IMAGE };
    // A crash before the sweep settles still sweeps rows 7 and 10 next time.
    expect(storage.values.get(PROVIDER_SESSION_PID_LEDGER_KEY)).toEqual({
      version: 1,
      entries: [
        { pid: 7, profile: 'antigravity', startedAt: 500, identity: identityOf(7) },
        { pid: 10, profile: 'antigravity', startedAt: 500, atSpawn: true, ...IMAGE, sweepAttempts: 1 },
        nine,
      ],
    });
    // The sweep could not stop row 7: it stays for the next start.
    const retry = {
      pid: 7,
      profile: 'antigravity' as const,
      startedAt: 500,
      identity: identityOf(7),
      sweepAttempts: 1,
    };
    await store.settlePrevious([retry]);
    expect(store.previous()).toEqual([retry]);
    expect(storage.values.get(PROVIDER_SESSION_PID_LEDGER_KEY)).toEqual({
      version: 1,
      entries: [retry, nine],
    });
    // A restart loads the retained row with its attempt count.
    expect(
      createElectronProviderSessionPidLedgerStore(storage, logger(), win(none)).previous(),
    ).toEqual(expect.arrayContaining([retry]));

    await store.settlePrevious([]);
    expect(store.previous()).toEqual([]);
    expect(storage.values.get(PROVIDER_SESSION_PID_LEDGER_KEY)).toEqual({
      version: 1,
      entries: [nine],
    });
  });

  it('ignores a ledger of unknown shape and an unreadable storage', () => {
    const log = logger();
    expect(
      createElectronProviderSessionPidLedgerStore(
        memoryStorage({ version: 2, rows: [] }),
        log,
        win(none),
      ).previous(),
    ).toEqual([]);
    const throwing = {
      get: jest.fn(() => {
        throw new Error('locked');
      }),
      update: jest.fn(async () => undefined),
    };
    expect(
      createElectronProviderSessionPidLedgerStore(throwing, log, win(none)).previous(),
    ).toEqual([]);
    expect(log.warn).toHaveBeenCalledTimes(2);
  });

  it('logs a failed write and never throws from record', async () => {
    const log = logger();
    const storage = memoryStorage();
    storage.update.mockRejectedValueOnce(new Error('disk full'));
    const store = createElectronProviderSessionPidLedgerStore(storage, log, win(none));
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
        { pid: 3, profile: 'antigravity', startedAt: 1, ...IMAGE },
        { pid: 4, profile: 'antigravity', startedAt: 2, ...IMAGE },
      ],
    });
  });
});

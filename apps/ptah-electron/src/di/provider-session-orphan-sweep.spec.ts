import {
  ORPHAN_OPEN_WINDOW_MS,
  cimCreationTime,
  startProviderSessionOrphanSweep,
  sweepProviderSessionOrphans,
  type ProviderSessionOrphanSweepDeps,
} from './provider-session-orphan-sweep';

const STARTED_AT = Date.UTC(2026, 10, 21, 20, 0, 0);

function deps(
  overrides: Partial<ProviderSessionOrphanSweepDeps> = {},
): ProviderSessionOrphanSweepDeps & {
  kill: jest.Mock;
  logger: { info: jest.Mock; warn: jest.Mock };
} {
  return {
    platform: 'win32',
    logger: { info: jest.fn(), warn: jest.fn() },
    queryWindows: jest.fn(async () => []),
    posixStartTime: jest.fn(async () => undefined),
    kill: jest.fn(async () => undefined),
    ...overrides,
  } as never;
}

describe('provider-session orphan sweep', () => {
  it('parses CIM creation dates', () => {
    expect(cimCreationTime(`/Date(${STARTED_AT})/`)).toBe(STARTED_AT);
    expect(cimCreationTime('2026-11-21T20:00:00.000Z')).toBe(STARTED_AT);
    expect(cimCreationTime(null)).toBeUndefined();
    expect(cimCreationTime('not a date')).toBeUndefined();
  });

  it('Windows: kills only a row whose pid and creation time match', async () => {
    const d = deps({
      queryWindows: jest.fn(async () => [
        // matches: created 30 s before the pool recorded it (open handshake)
        { ProcessId: 10, ParentProcessId: 1, CreationDate: `/Date(${STARTED_AT - 30_000})/` },
        // pid reused by a process started long after the crash
        { ProcessId: 11, ParentProcessId: 1, CreationDate: `/Date(${STARTED_AT + 60_000})/` },
        // pid reused by a process older than the open window
        { ProcessId: 12, ParentProcessId: 1, CreationDate: `/Date(${STARTED_AT - ORPHAN_OPEN_WINDOW_MS - 1})/` },
        { ProcessId: 14, ParentProcessId: 1, CreationDate: null },
      ]),
    });
    const result = await sweepProviderSessionOrphans(
      [10, 11, 12, 13, 14].map((pid) => ({
        pid,
        profile: 'antigravity' as const,
        startedAt: STARTED_AT,
      })),
      d,
    );
    expect(d.kill).toHaveBeenCalledTimes(1);
    expect(d.kill).toHaveBeenCalledWith(10);
    expect(result).toEqual({ killed: 1, skipped: 4 });
    expect(d.queryWindows).toHaveBeenCalledTimes(1);
  });

  it('POSIX: checks each pid start time and survives a failed kill', async () => {
    const d = deps({
      platform: 'linux',
      posixStartTime: jest.fn(async (pid: number) =>
        pid === 20 || pid === 21 ? STARTED_AT - 1_000 : undefined,
      ),
    });
    d.kill.mockImplementation(async (pid: number) => {
      if (pid === 20) throw new Error('EPERM');
    });
    const result = await sweepProviderSessionOrphans(
      [20, 21, 22].map((pid) => ({
        pid,
        profile: 'antigravity' as const,
        startedAt: STARTED_AT,
      })),
      d,
    );
    expect(d.kill.mock.calls).toEqual([[20], [21]]);
    expect(result).toEqual({ killed: 1, skipped: 2 });
    expect(d.logger.warn).toHaveBeenCalledWith(
      '[ProviderSessionOrphanSweep] Orphan not stopped',
      expect.objectContaining({ pid: 20, error: 'EPERM' }),
    );
  });

  it('does nothing without rows', async () => {
    const d = deps();
    expect(await sweepProviderSessionOrphans([], d)).toEqual({ killed: 0, skipped: 0 });
    expect(d.queryWindows).not.toHaveBeenCalled();
  });

  it('settles the previous rows after a sweep, keeps them when the snapshot fails', async () => {
    const rows = [{ pid: 30, profile: 'antigravity' as const, startedAt: STARTED_AT }];
    const store = { previous: () => rows, settlePrevious: jest.fn(async () => undefined) };
    const onError = jest.fn();
    await startProviderSessionOrphanSweep(store, deps(), onError);
    expect(store.settlePrevious).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();

    const failing = { previous: () => rows, settlePrevious: jest.fn(async () => undefined) };
    await startProviderSessionOrphanSweep(
      failing,
      deps({ queryWindows: jest.fn(async () => { throw new Error('CIM timeout'); }) }),
      onError,
    );
    expect(failing.settlePrevious).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'CIM timeout' }));
  });
});

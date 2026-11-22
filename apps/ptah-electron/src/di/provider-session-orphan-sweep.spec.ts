import {
  MAX_ORPHAN_SWEEP_ATTEMPTS,
  ORPHAN_SPAWN_WINDOW_MS,
  WINDOWS_NO_PROCESS_MARKER,
  cimCreationTime,
  expectedProviderSessionImage,
  identityMatches,
  parsePosixIdentity,
  parseWindowsIdentity,
  startProviderSessionOrphanSweep,
  sweepProviderSessionOrphans,
  windowsProbeScript,
  type ProviderSessionOrphanSweepDeps,
} from './provider-session-orphan-sweep';
import type {
  ProcessIdentity,
  StoredProviderSessionPidEntry,
} from './provider-session-pid-ledger-store';

const STARTED_AT = Date.UTC(2026, 10, 21, 20, 0, 0);
const AGENT: ProcessIdentity = { createdAtMs: STARTED_AT - 400, image: 'node.exe' };

function deps(
  live: Record<number, ProcessIdentity | Error | undefined> = {},
): ProviderSessionOrphanSweepDeps & {
  kill: jest.Mock;
  identify: jest.Mock;
  logger: { info: jest.Mock; warn: jest.Mock };
} {
  return {
    platform: 'win32',
    logger: { info: jest.fn(), warn: jest.fn() },
    identify: jest.fn(async (pid: number) => {
      const value = live[pid];
      if (value instanceof Error) throw value;
      return value;
    }),
    kill: jest.fn(async () => undefined),
  };
}

function row(
  pid: number,
  extra: Partial<StoredProviderSessionPidEntry> = { identity: AGENT },
): StoredProviderSessionPidEntry {
  return { pid, profile: 'antigravity', startedAt: STARTED_AT, ...extra };
}

describe('provider-session orphan sweep', () => {
  it('parses CIM creation dates', () => {
    expect(cimCreationTime(`/Date(${STARTED_AT})/`)).toBe(STARTED_AT);
    expect(cimCreationTime('2026-11-21T20:00:00.000Z')).toBe(STARTED_AT);
    expect(cimCreationTime(null)).toBeUndefined();
    expect(cimCreationTime('not a date')).toBeUndefined();
  });

  it('parses the Windows probe output; only the marker means gone', () => {
    expect(parseWindowsIdentity(`${WINDOWS_NO_PROCESS_MARKER}
`, 10)).toBeUndefined();
    // Empty output or another process is a probe failure, never "gone".
    expect(() => parseWindowsIdentity('', 10)).toThrow();
    expect(() =>
      parseWindowsIdentity(
        JSON.stringify({ ProcessId: 99, Name: 'x.exe', CreationDate: `/Date(${STARTED_AT})/` }),
        10,
      ),
    ).toThrow();
    expect(
      parseWindowsIdentity(
        JSON.stringify({
          ProcessId: 10,
          Name: 'node.exe',
          CreationDate: `/Date(${STARTED_AT})/`,
        }),
        10,
      ),
    ).toEqual({ createdAtMs: STARTED_AT, image: 'node.exe' });
    // A live process whose identity is unreadable is a probe failure.
    expect(() =>
      parseWindowsIdentity(
        JSON.stringify({ ProcessId: 10, Name: null, CreationDate: `/Date(${STARTED_AT})/` }),
        10,
      ),
    ).toThrow();
  });

  it('parses the POSIX probe output, command names with spaces included', () => {
    expect(parsePosixIdentity('  \n', 5)).toBeUndefined();
    const parsed = parsePosixIdentity(
      'Sat Nov 21 20:00:00 2026 /Applications/My App/node\n',
      5,
    );
    expect(parsed?.image).toBe('/Applications/My App/node');
    expect(parsed?.createdAtMs).toBe(new Date(2026, 10, 21, 20, 0, 0).getTime());
    expect(() => parsePosixIdentity('garbage', 5)).toThrow();
  });

  it('matches identity exactly, within the rounding tolerance only', () => {
    expect(identityMatches({ ...AGENT, image: 'NODE.EXE' }, AGENT, 'win32')).toBe(true);
    expect(
      identityMatches({ ...AGENT, image: 'NODE' }, { ...AGENT, image: 'node' }, 'linux'),
    ).toBe(false);
    expect(
      identityMatches({ ...AGENT, createdAtMs: AGENT.createdAtMs + 1_000 }, AGENT, 'win32'),
    ).toBe(true);
    expect(
      identityMatches({ ...AGENT, createdAtMs: AGENT.createdAtMs - 1_001 }, AGENT, 'win32'),
    ).toBe(false);
  });

  it('stops a matching process and settles gone rows', async () => {
    const d = deps({ 10: AGENT, 11: undefined });
    const result = await sweepProviderSessionOrphans([row(10), row(11)], d);
    expect(d.kill.mock.calls).toEqual([[10]]);
    expect(result.outcomes).toEqual([
      { pid: 10, outcome: 'stopped' },
      { pid: 11, outcome: 'gone' },
    ]);
    expect(result.retained).toEqual([]);
  });

  it('never kills a reused pid with another creation time or image', async () => {
    const d = deps({
      20: { ...AGENT, createdAtMs: AGENT.createdAtMs + 30_000 },
      21: { ...AGENT, image: 'explorer.exe' },
    });
    const result = await sweepProviderSessionOrphans([row(20), row(21)], d);
    expect(d.kill).not.toHaveBeenCalled();
    expect(result.outcomes.map((o) => o.outcome)).toEqual(['reused', 'reused']);
    expect(result.retained).toEqual([]);
  });

  it('makes a CIM error fail the Windows probe script instead of printing nothing', () => {
    const script = windowsProbeScript(42);
    expect(script).toContain("-Filter 'ProcessId=42' -ErrorAction Stop");
    expect(script).toContain("$ErrorActionPreference = 'Stop'");
    expect(script).toContain(`'${WINDOWS_NO_PROCESS_MARKER}'`);
    expect(script).toContain('exit 2');
  });

  it('maps each profile to its binary image', () => {
    expect(expectedProviderSessionImage('antigravity', 'win32')).toBe('agy.exe');
    expect(expectedProviderSessionImage('antigravity', 'linux')).toBe('agy');
    expect(expectedProviderSessionImage('opencode', 'darwin')).toBe('opencode');
  });

  it('without a probed identity, kills by image and spawn time', async () => {
    const spawned = { atSpawn: true, expectedImage: 'agy.exe' };
    const d = deps({
      31: { createdAtMs: STARTED_AT - 200, image: 'AGY.EXE' },
      32: { createdAtMs: STARTED_AT + ORPHAN_SPAWN_WINDOW_MS, image: 'agy.exe' },
    });
    const result = await sweepProviderSessionOrphans([row(31, spawned), row(32, spawned)], d);
    expect(d.kill.mock.calls).toEqual([[31], [32]]);
    expect(result.outcomes.map((o) => o.outcome)).toEqual(['stopped', 'stopped']);
  });

  it('POSIX: compares the basename of a macOS command path', async () => {
    const d = deps({ 33: { createdAtMs: STARTED_AT - 900, image: '/Users/u/.local/bin/agy' } });
    const result = await sweepProviderSessionOrphans(
      [row(33, { atSpawn: true, expectedImage: 'agy' })],
      { ...d, platform: 'darwin' },
    );
    expect(result.outcomes).toEqual([{ pid: 33, outcome: 'stopped' }]);
  });

  it('never kills an unverifiable row; keeps it for the bounded retries', async () => {
    const d = deps({
      // spawn-time row, wrong image
      34: { createdAtMs: STARTED_AT, image: 'explorer.exe' },
      // spawn-time row, created outside the window
      35: { createdAtMs: STARTED_AT - ORPHAN_SPAWN_WINDOW_MS - 1, image: 'agy.exe' },
      // recorded after the open (no atSpawn): the window does not apply
      36: { createdAtMs: STARTED_AT, image: 'agy.exe' },
      // nothing recorded but the pid
      37: AGENT,
    });
    const result = await sweepProviderSessionOrphans(
      [
        row(34, { atSpawn: true, expectedImage: 'agy.exe' }),
        row(35, { atSpawn: true, expectedImage: 'agy.exe' }),
        row(36, { expectedImage: 'agy.exe' }),
        row(37, {}),
      ],
      d,
    );
    expect(d.kill).not.toHaveBeenCalled();
    expect(result.outcomes.map((o) => o.outcome)).toEqual([
      'unverifiable',
      'unverifiable',
      'unverifiable',
      'unverifiable',
    ]);
    expect(result.retained.map((r) => [r.pid, r.sweepAttempts])).toEqual([
      [34, 1],
      [35, 1],
      [36, 1],
      [37, 1],
    ]);
  });

  it('settles an unverifiable row once its process is gone', async () => {
    const d = deps({ 38: undefined });
    const result = await sweepProviderSessionOrphans([row(38, {})], d);
    expect(result.outcomes).toEqual([{ pid: 38, outcome: 'gone' }]);
    expect(result.retained).toEqual([]);
  });

  it('drops an unverifiable row after the last allowed start', async () => {
    const d = deps({ 39: AGENT });
    const result = await sweepProviderSessionOrphans(
      [row(39, { sweepAttempts: MAX_ORPHAN_SWEEP_ATTEMPTS - 1 })],
      d,
    );
    expect(d.kill).not.toHaveBeenCalled();
    expect(result.outcomes).toEqual([{ pid: 39, outcome: 'abandoned' }]);
    expect(result.retained).toEqual([]);
  });

  it('keeps a row whose kill failed, with its attempt count raised', async () => {
    const d = deps({ 40: AGENT, 41: AGENT });
    d.kill.mockImplementation(async (pid: number) => {
      if (pid === 40) throw new Error('EPERM');
    });
    const result = await sweepProviderSessionOrphans([row(40), row(41)], d);
    expect(d.kill.mock.calls).toEqual([[40], [41]]);
    expect(result.outcomes).toEqual([
      { pid: 40, outcome: 'retry' },
      { pid: 41, outcome: 'stopped' },
    ]);
    expect(result.retained).toEqual([{ ...row(40), sweepAttempts: 1 }]);
    expect(d.logger.warn).toHaveBeenCalledWith(
      '[ProviderSessionOrphanSweep] Orphan not stopped; retrying next start',
      expect.objectContaining({ pid: 40, attempts: 1, error: 'EPERM' }),
    );
  });

  it('keeps a row whose probe failed and does not kill it', async () => {
    const d = deps({ 50: new Error('CIM timeout') });
    const result = await sweepProviderSessionOrphans(
      [row(50, { identity: AGENT, sweepAttempts: 1 })],
      d,
    );
    expect(d.kill).not.toHaveBeenCalled();
    expect(result.outcomes).toEqual([{ pid: 50, outcome: 'retry' }]);
    expect(result.retained).toEqual([{ ...row(50), sweepAttempts: 2 }]);
  });

  it('drops a row after the last allowed failed start and logs it', async () => {
    const d = deps({ 60: new Error('CIM timeout') });
    const result = await sweepProviderSessionOrphans(
      [row(60, { identity: AGENT, sweepAttempts: MAX_ORPHAN_SWEEP_ATTEMPTS - 1 })],
      d,
    );
    expect(result.outcomes).toEqual([{ pid: 60, outcome: 'abandoned' }]);
    expect(result.retained).toEqual([]);
    expect(d.logger.warn).toHaveBeenCalledWith(
      '[ProviderSessionOrphanSweep] Orphan not stopped; giving up on this row',
      expect.objectContaining({ pid: 60, attempts: MAX_ORPHAN_SWEEP_ATTEMPTS }),
    );
  });

  it('settles only the rows the sweep handled', async () => {
    const rows = [row(70), row(71)];
    const store = { previous: () => rows, settlePrevious: jest.fn(async () => undefined) };
    const onError = jest.fn();
    await startProviderSessionOrphanSweep(
      store,
      deps({ 70: AGENT, 71: new Error('denied') }),
      onError,
    );
    expect(store.settlePrevious).toHaveBeenCalledWith([{ ...row(71), sweepAttempts: 1 }]);
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports a failed settle instead of throwing', async () => {
    const store = {
      previous: () => [row(80)],
      settlePrevious: jest.fn(async () => {
        throw new Error('disk full');
      }),
    };
    const onError = jest.fn();
    await startProviderSessionOrphanSweep(store, deps({ 80: undefined }), onError);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'disk full' }));
  });

  it('does nothing without rows', async () => {
    const d = deps();
    const store = { previous: () => [], settlePrevious: jest.fn(async () => undefined) };
    await startProviderSessionOrphanSweep(store, d, jest.fn());
    expect(d.identify).not.toHaveBeenCalled();
    expect(store.settlePrevious).not.toHaveBeenCalled();
  });
});

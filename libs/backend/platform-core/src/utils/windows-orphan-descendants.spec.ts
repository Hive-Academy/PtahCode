import {
  queryWindowsProcesses,
  WindowsOrphanDescendants,
  type ProcessRow,
} from './windows-orphan-descendants';

const rootStartedAtMs = 10_000;
const rootExitedAtMs = 20_000;
const row = (pid: number, parent: number, created: number | string | null): ProcessRow => ({
  ProcessId: pid,
  ParentProcessId: parent,
  CreationDate: typeof created === 'number' ? `/Date(${created})/` : created,
});

function setup(live: ProcessRow[]) {
  const query = jest.fn(async () => live);
  const kill = jest.fn(async (_pid: number) => undefined);
  const onError = jest.fn();
  const orphan = new WindowsOrphanDescendants(10, rootStartedAtMs,
    rootExitedAtMs, query, kill, onError);
  return { orphan, query, kill, onError };
}

describe('WindowsOrphanDescendants', () => {
  it('stops a direct child created within the root lifetime', async () => {
    const { orphan, query, kill } = setup([row(11, 10, 15_000)]);
    await orphan.stop();
    expect(query).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledWith(11);
  });

  it('rejects a child created before the root start', async () => {
    const { orphan, kill } = setup([row(11, 10, 8_000)]);
    await orphan.stop();
    expect(kill).not.toHaveBeenCalled();
  });

  it('rejects a child created after the root exit', async () => {
    const { orphan, kill } = setup([row(11, 10, 22_000)]);
    await orphan.stop();
    expect(kill).not.toHaveBeenCalled();
  });

  it('never stops a row carrying the exited root PID', async () => {
    const { orphan, kill } = setup([row(10, 1, 15_000)]);
    await orphan.stop();
    expect(kill).not.toHaveBeenCalled();
  });

  it('stops a grandchild of a live selected child before its parent', async () => {
    const { orphan, kill } = setup([row(11, 10, 15_000), row(12, 11, 16_000)]);
    await orphan.stop();
    expect(kill.mock.calls.map(([pid]) => pid)).toEqual([12, 11]);
  });

  it('rejects a row older than its selected parent', async () => {
    const { orphan, kill } = setup([row(11, 10, 15_000), row(12, 11, 14_000)]);
    await orphan.stop();
    expect(kill.mock.calls.map(([pid]) => pid)).toEqual([11]);
  });

  it('skips null and unparsable dates and accepts ISO dates', async () => {
    const started = Date.parse('2026-11-17T00:00:00.000Z');
    const query = jest.fn(async () => [
      row(11, 10, null), row(12, 10, 'not a date'),
      row(13, 10, new Date(started + 500).toISOString()),
    ]);
    const kill = jest.fn(async (_pid: number) => undefined);
    const orphan = new WindowsOrphanDescendants(10, started,
      started + 1_000, query, kill, jest.fn());
    await orphan.stop();
    expect(kill.mock.calls.map(([pid]) => pid)).toEqual([13]);
  });

  it('reports query failure once', async () => {
    const query = jest.fn(async (): Promise<ProcessRow[]> => {
      throw new Error('CIM unavailable');
    });
    const onError = jest.fn();
    const orphan = new WindowsOrphanDescendants(10, 10_000, 20_000,
      query, jest.fn(), onError);
    await orphan.stop();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'CIM unavailable' }));
  });

  it('reports each kill failure once and continues through the tree', async () => {
    const { orphan, kill, onError } = setup([row(11, 10, 15_000), row(12, 11, 16_000)]);
    kill.mockRejectedValueOnce(new Error('denied'));
    await orphan.stop();
    expect(kill).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('parses the PowerShell wire timestamp and reports query timeout', async () => {
    const run = jest.fn().mockResolvedValueOnce(String.raw`[{"ProcessId":11,"ParentProcessId":10,"CreationDate":"\/Date(15000)\/"},{"ProcessId":12,"ParentProcessId":10,"CreationDate":null}]`)
      .mockRejectedValueOnce(new Error('timed out'));
    await expect(queryWindowsProcesses(run)).resolves.toEqual([
      row(11, 10, 15_000), row(12, 10, null),
    ]);
    const onError = jest.fn();
    const orphan = new WindowsOrphanDescendants(10, 10_000, 20_000,
      () => queryWindowsProcesses(run), jest.fn(), onError);
    await orphan.stop();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'timed out' }));
    expect(run).toHaveBeenCalledWith(expect.stringContaining('powershell.exe'),
      expect.any(Array), 3_000);
  });
});

import { scheduleWindowsOrphanCleanup } from './windows-orphan-cleanup';

describe('scheduleWindowsOrphanCleanup', () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  afterAll(() => {
    if (platformDescriptor) Object.defineProperty(process, 'platform', platformDescriptor);
  });

  it('queries asynchronously and kills only a linked descendant', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const query = jest.fn(async () => [
      { ProcessId: 43, ParentProcessId: 42, CreationDate: new Date(10_000).toISOString() },
      { ProcessId: 44, ParentProcessId: 1, CreationDate: new Date(10_000).toISOString() },
    ]);
    const kill = jest.fn(async (_pid: number) => undefined);
    const onError = jest.fn();
    scheduleWindowsOrphanCleanup(42, 10_000, false, onError,
      { query, kill, now: () => 10_000 });
    expect(query).not.toHaveBeenCalled();
    await new Promise((resolve) => setImmediate(resolve));
    expect(query).toHaveBeenCalledTimes(2);
    expect(kill).toHaveBeenCalledWith(43);
    expect(kill).not.toHaveBeenCalledWith(42);
    expect(kill).not.toHaveBeenCalledWith(44);
    expect(onError).not.toHaveBeenCalled();
  });

  it('skips detached and invalid roots', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    const query = jest.fn(async () => []);
    const dependencies = { query, kill: jest.fn(async () => undefined), now: () => 10_000 };
    scheduleWindowsOrphanCleanup(42, 10_000, true, jest.fn(), dependencies);
    scheduleWindowsOrphanCleanup(0, 10_000, false, jest.fn(), dependencies);
    await new Promise((resolve) => setImmediate(resolve));
    expect(query).not.toHaveBeenCalled();
  });
});

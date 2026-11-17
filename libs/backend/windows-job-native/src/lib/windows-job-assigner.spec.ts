import { NativeWindowsJobAssigner } from './windows-job-assigner';

describe('NativeWindowsJobAssigner', () => {
  const win32 = (): NodeJS.Platform => 'win32';

  it('creates a job and closes it once', () => {
    const handle = {};
    const createJobForPid = jest.fn(() => handle);
    const closeJob = jest.fn();
    const assigner = new NativeWindowsJobAssigner(
      () => ({ createJobForPid, closeJob }), win32,
    );
    const job = assigner.assignToNewJob(123);
    expect(createJobForPid).toHaveBeenCalledWith(123);
    job.close();
    job.close();
    expect(closeJob).toHaveBeenCalledTimes(1);
    expect(closeJob).toHaveBeenCalledWith(handle);
  });

  it.each([0, -1, 1.5, Number.NaN, 0x100000000])('rejects bad PID %s', (pid) => {
    const loader = jest.fn();
    expect(() => new NativeWindowsJobAssigner(loader, win32).assignToNewJob(pid))
      .toThrow('positive 32-bit integer');
    expect(loader).not.toHaveBeenCalled();
  });

  it('rejects non-Windows hosts', () => {
    expect(() => new NativeWindowsJobAssigner(() => ({}), () => 'linux')
      .assignToNewJob(1)).toThrow('require win32');
  });

  it('reports an absent binary with the cause', () => {
    const cause = new Error('MODULE_NOT_FOUND');
    expect(() => new NativeWindowsJobAssigner(() => { throw cause; }, win32)
      .assignToNewJob(1)).toThrow('binary is unavailable');
  });

  it.each([null, {}, { createJobForPid: () => ({}) },
    { createJobForPid: 1, closeJob: () => undefined }])('rejects an invalid binding', (binding) => {
    expect(() => new NativeWindowsJobAssigner(() => binding, win32)
      .assignToNewJob(1)).toThrow('invalid binding shape');
  });

  it('passes native errors through', () => {
    const nativeError = new Error('AssignProcessToJobObject failed (GetLastError 5)');
    const assigner = new NativeWindowsJobAssigner(() => ({
      createJobForPid: (): object => { throw nativeError; },
      closeJob: (): void => undefined,
    }), win32);
    expect(() => assigner.assignToNewJob(1)).toThrow(nativeError);
  });
});

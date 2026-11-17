import { join, resolve } from 'node:path';
import { ElectronWindowsJobAssigner } from './electron-windows-job-assigner';

const appPath = resolve('dist/apps/ptah-electron');
const resourcesPath = resolve('fixture/resources');
const packed = join(resourcesPath, 'windows-job', 'windows_job.node');
const development = resolve(appPath, '../../../libs/backend/windows-job-native/build/Release/windows_job.node');

function binding() {
  return { createJobForPid: jest.fn(() => ({})), closeJob: jest.fn() };
}

describe('ElectronWindowsJobAssigner', () => {
  it('loads the external resource only when assigning and closes the job once', () => {
    const native = binding();
    const load = jest.fn(() => native);
    const assigner = new ElectronWindowsJobAssigner({ appPath, resourcesPath,
      platform: 'win32', arch: 'x64', exists: file => file === packed, load });
    expect(load).not.toHaveBeenCalled();
    const handle = assigner.assignToNewJob(42);
    expect(load).toHaveBeenCalledWith(packed);
    expect(native.createJobForPid).toHaveBeenCalledWith(42);
    handle.close();
    handle.close();
    expect(native.closeJob).toHaveBeenCalledTimes(1);
  });

  it('loads the development build when the packed resource is absent', () => {
    const load = jest.fn(() => binding());
    const assigner = new ElectronWindowsJobAssigner({ appPath, resourcesPath,
      platform: 'win32', arch: 'x64', exists: () => false, load });
    assigner.assignToNewJob(42);
    expect(load).toHaveBeenCalledWith(development);
  });

  it('defers a missing binary error until assignment', () => {
    const assigner = new ElectronWindowsJobAssigner({ appPath, resourcesPath,
      platform: 'win32', arch: 'x64', exists: () => false,
      load: () => { throw new Error('missing'); } });
    expect(() => assigner.assignToNewJob(42)).toThrow('Windows job native binary is unavailable');
  });

  it('does not fall back to development when a packed resource is missing', () => {
    const load = jest.fn(() => binding());
    const assigner = new ElectronWindowsJobAssigner({ appPath: resolve('fixture/resources/app.asar'),
      resourcesPath, platform: 'win32', arch: 'x64', exists: () => false, load });
    expect(() => assigner.assignToNewJob(42)).toThrow('Windows job native binary is unavailable');
    expect(load).not.toHaveBeenCalled();
    try {
      assigner.assignToNewJob(42);
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(Error);
      if (error instanceof Error) {
        expect(error.cause).toEqual(new Error('Missing packed resource windows-job/windows_job.node'));
      }
    }
  });

  it('rejects non-Windows platforms', () => {
    const assigner = new ElectronWindowsJobAssigner({ appPath, resourcesPath,
      platform: 'linux', arch: 'x64', load: () => binding() });
    expect(() => assigner.assignToNewJob(42)).toThrow('Windows jobs require win32 x64');
  });

  it('rejects unsupported architectures', () => {
    const assigner = new ElectronWindowsJobAssigner({ appPath, resourcesPath,
      platform: 'win32', arch: 'arm64', load: () => binding() });
    expect(() => assigner.assignToNewJob(42)).toThrow('Windows jobs require win32 x64');
  });
});

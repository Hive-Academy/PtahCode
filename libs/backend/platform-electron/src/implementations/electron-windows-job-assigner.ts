import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { IWindowsJobAssigner, WindowsJobHandle } from '@ptah-extension/platform-core';
import { NativeWindowsJobAssigner } from '@ptah-extension/windows-job-native';

export interface ElectronWindowsJobOptions {
  appPath: string;
  resourcesPath?: string;
  platform?: NodeJS.Platform;
  arch?: string;
  load?: (file: string) => unknown;
  exists?: (file: string) => boolean;
}

/** Resolve the external resource in a package and the source build in development. */
export class ElectronWindowsJobAssigner implements IWindowsJobAssigner {
  constructor(private readonly options: ElectronWindowsJobOptions) {}

  assignToNewJob(pid: number): WindowsJobHandle {
    const platform = this.options.platform ?? process.platform;
    const arch = this.options.arch ?? process.arch;
    if (platform !== 'win32' || arch !== 'x64') {
      throw new Error('Windows jobs require win32 x64');
    }
    const resourcesPath = this.options.resourcesPath ??
      ('resourcesPath' in process && typeof process.resourcesPath === 'string'
        ? process.resourcesPath : this.options.appPath);
    const packed = join(resourcesPath, 'windows-job', 'windows_job.node');
    const exists = this.options.exists ?? existsSync;
    const isPackaged = this.options.appPath.endsWith('.asar');
    const file = isPackaged || exists(packed) ? packed : resolve(
      this.options.appPath, '../../../libs/backend/windows-job-native/build/Release/windows_job.node',
    );
    const load = this.options.load ?? ((candidate: string): unknown => require(candidate));
    return new NativeWindowsJobAssigner(() => {
      if (isPackaged && !exists(packed)) {
        throw new Error('Missing packed resource windows-job/windows_job.node');
      }
      return load(file);
    }, () => platform).assignToNewJob(pid);
  }
}

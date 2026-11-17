import type { IWindowsJobAssigner, WindowsJobHandle } from '@ptah-extension/platform-core';

interface NativeBinding {
  createJobForPid(pid: number): object;
  closeJob(handle: object): void;
}

/**
 * Loads the native binding. The caller supplies it, because the binary path
 * depends on the host layout (packed resources or the lib build output).
 */
export type BindingLoader = () => unknown;

function isBinding(value: unknown): value is NativeBinding {
  return typeof value === 'object' && value !== null &&
    'createJobForPid' in value && typeof value.createJobForPid === 'function' &&
    'closeJob' in value && typeof value.closeJob === 'function';
}

export class NativeWindowsJobAssigner implements IWindowsJobAssigner {
  constructor(
    private readonly loader: BindingLoader,
    private readonly platform: () => NodeJS.Platform = () => process.platform,
  ) {}

  assignToNewJob(pid: number): WindowsJobHandle {
    if (this.platform() !== 'win32') {
      throw new Error('Windows job objects require win32');
    }
    if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 0xffffffff) {
      throw new Error('Windows job PID must be a positive 32-bit integer');
    }
    let loaded: unknown;
    try {
      loaded = this.loader();
    } catch (error: unknown) {
      throw new Error('Windows job native binary is unavailable', { cause: error });
    }
    if (!isBinding(loaded)) {
      throw new Error('Windows job native binary has an invalid binding shape');
    }
    const binding = loaded;
    const handle = binding.createJobForPid(pid);
    let closed = false;
    return {
      close(): void {
        if (closed) return;
        closed = true;
        binding.closeJob(handle);
      },
    };
  }
}

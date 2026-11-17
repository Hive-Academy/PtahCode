import { killProcessTree } from './process-tree-reaper';
import { queryWindowsProcesses, WindowsOrphanDescendants, type ProcessQuery } from './windows-orphan-descendants';

export interface OrphanCleanupDependencies {
  query: ProcessQuery;
  kill: (pid: number) => Promise<void>;
  now: () => number;
}

export const defaultOrphanCleanupDependencies: OrphanCleanupDependencies = {
  query: () => queryWindowsProcesses(async (file, args, timeout) => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    return (await promisify(execFile)(file, args, {
      timeout, windowsHide: true, maxBuffer: 8_000_000,
    })).stdout;
  }),
  kill: async (pid) => {
    let failure: Error | undefined;
    // Windows maps either signal to taskkill /T /F; match the review runner.
    await killProcessTree(pid, 'SIGTERM', (error: unknown) => {
      failure = error instanceof Error ? error : new Error(String(error));
    });
    if (failure) throw failure;
  },
  now: Date.now,
};

export function scheduleWindowsOrphanCleanup(
  pid: number | null | undefined,
  startedAt: number,
  detached: boolean,
  onError: (error: Error) => void,
  dependencies: OrphanCleanupDependencies,
): void {
  // Detached rival CLIs own their process lifetime.
  if (process.platform !== 'win32' || detached ||
      typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 0) return;
  const exitedAt = dependencies.now();
  queueMicrotask(() => {
    void new WindowsOrphanDescendants(pid, startedAt, exitedAt,
      dependencies.query, dependencies.kill, onError).stop().catch((error: unknown) => {
      onError(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

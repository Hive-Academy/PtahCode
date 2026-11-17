import { killProcessTree, queryWindowsProcesses, WindowsOrphanDescendants, type ProcessQuery } from '@ptah-extension/platform-core';

export interface OrphanCleanupOptions {
  readonly query?: ProcessQuery;
  readonly kill?: (pid: number) => Promise<void>;
  /** Returns Unix epoch milliseconds, matching CIM process creation times. */
  readonly now?: () => number;
}

export const queryOrphanProcesses: ProcessQuery = () => queryWindowsProcesses(async (file, args, timeout) => {
  const { execFile } = await import('node:child_process');
  return new Promise<string>((resolve, reject) => {
    execFile(file, args, { timeout, windowsHide: true, maxBuffer: 8_000_000 },
      (error, stdout) => error ? reject(error) : resolve(stdout));
  });
});

export async function killOrphanDescendant(pid: number): Promise<void> {
  let failure: Error | undefined;
  await killProcessTree(pid, 'SIGKILL', (error: unknown) => {
    failure = error instanceof Error ? error : new Error(String(error));
  });
  if (failure) throw failure;
}

export function startOrphanCleanup(
  pid: number,
  startedAt: number,
  options: OrphanCleanupOptions,
  report: (error: Error) => void,
): void {
  const orphan = new WindowsOrphanDescendants(pid, startedAt,
    (options.now ?? Date.now)(), options.query ?? queryOrphanProcesses,
    options.kill ?? killOrphanDescendant, report);
  void Promise.resolve().then(() => orphan.stop()).catch((error: unknown) => {
    // degradation-audit: reported - Unexpected cleanup failures are logged after the exit handler returns.
    report(error instanceof Error ? error : new Error(String(error)));
  });
}

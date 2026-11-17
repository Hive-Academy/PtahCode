import { killProcessTree, queryWindowsProcesses, WindowsOrphanDescendants, type ProcessQuery, type SpawnedProcessHandle } from '@ptah-extension/platform-core';

/** Signal deaths can leave exitCode null on off-thread process handles. */
export function childHasExited(child: SpawnedProcessHandle): boolean {
  if (child.exitCode !== null) return true;
  if ('signalCode' in child && child.signalCode != null) return true;
  return 'exitObserved' in child && child.exitObserved === true;
}

export function cleanupAfterFailedTreeKill(
  child: SpawnedProcessHandle,
  exitObserved: boolean,
  cleanup: () => void,
): void {
  if (exitObserved || childHasExited(child)) cleanup();
  else child.once('exit', cleanup);
}

/** Records the root exit time. A delayed cleanup must not use its own start time as the cutoff. */
export function recordRootExit(child: SpawnedProcessHandle, now: () => number): { at?: number } {
  const exit: { at?: number } = {};
  child.once('exit', () => { exit.at = now(); });
  return exit;
}

export function startOrphanCleanupForRoot(
  child: SpawnedProcessHandle | undefined,
  startedAt: number | undefined,
  options: OrphanCleanupOptions,
  report: (error: Error) => void,
  exitedAt?: number,
): boolean {
  const pid = child?.pid;
  if (process.platform !== 'win32' || !pid || !Number.isSafeInteger(pid) ||
      pid <= 0 || startedAt === undefined) return false;
  startOrphanCleanup(pid, startedAt, options, report, exitedAt);
  return true;
}

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
  exitedAt?: number,
): void {
  const orphan = new WindowsOrphanDescendants(pid, startedAt,
    exitedAt ?? (options.now ?? Date.now)(), options.query ?? queryOrphanProcesses,
    options.kill ?? killOrphanDescendant, report);
  void Promise.resolve().then(() => orphan.stop()).catch((error: unknown) => {
    // degradation-audit: reported - Unexpected cleanup failures are logged after the exit handler returns.
    report(error instanceof Error ? error : new Error(String(error)));
  });
}

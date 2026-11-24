// `node:child_process` is loaded lazily, inside the Windows branch, and must
// NOT become a top-level import. This module is exported from the platform-core
// barrel, so a static import pulls child_process and its module graph into every
// consumer of that barrel — measured at roughly 9 MB of heap, enough on its own
// to push `electron-state-storage-worker-runtime.error-paths.spec.ts` past its
// 64 MiB budget. POSIX never needs it at all.
//
// A caller that may have to kill at quit calls {@link preloadProcessTreeKill}
// early. Once the module is loaded, a win32 kill spawns `taskkill` in the same
// tick as the call, with no `await` in front of it, so a quit sequence that
// does not wait for the returned promise still starts the kill.

type ChildProcessModule = typeof import('node:child_process');

let childProcessModule: ChildProcessModule | null = null;
let childProcessLoading: Promise<ChildProcessModule> | null = null;

function loadChildProcess(): Promise<ChildProcessModule> {
  if (childProcessLoading === null) {
    // Return the bare `import()` promise: a wrapping `.then` would add a
    // microtask before `taskkill` starts. The cache is filled on the side.
    const loading = import('node:child_process');
    childProcessLoading = loading;
    loading.then(
      (loaded) => {
        childProcessModule = loaded;
      },
      () => {
        // The caller awaiting `loading` gets the rejection; clearing the
        // cache lets the next call retry.
        childProcessLoading = null;
      },
    );
  }
  return childProcessLoading;
}

/**
 * Load what a win32 tree kill needs, so a later {@link killProcessTree} starts
 * `taskkill` synchronously. A no-op off Windows. May reject when the module
 * cannot be loaded; the kill itself then loads it again.
 */
export async function preloadProcessTreeKill(): Promise<void> {
  if (process.platform !== 'win32' || childProcessModule !== null) return;
  await loadChildProcess();
}

/** Grace period for SIGTERM before SIGKILL escalation. */
export const PROCESS_TREE_KILL_GRACE_MS = 5_000;

const PROCESS_LIVENESS_POLL_MS = 100;

/**
 * Resolve `taskkill` from `%SystemRoot%\System32` rather than letting Windows
 * search `PATH`. A bare name is resolved through `PATH`, so any writable
 * directory ahead of System32 can interpose its own `taskkill.exe` and receive
 * a forced tree kill (`typescript:S4036`). `SystemRoot` is set on every
 * supported Windows host; the bare name remains as a fallback for an
 * environment that has unset it.
 */
function resolveTaskkill(): string {
  const systemRoot = process.env['SystemRoot'] ?? process.env['windir'];
  return systemRoot
    ? String.raw`${systemRoot}\System32\taskkill.exe`
    : 'taskkill';
}

/**
 * Only ESRCH proves the group is gone. EPERM means it still exists but this
 * process may not signal it, which must not end the poll.
 *
 * Duck-typed, never `instanceof Error`: the errors come from `process.kill`,
 * which Node creates outside a VM caller's realm, so `instanceof` fails there
 * (observed under Jest on the Linux CI runner: the poll's ESRCH fast path
 * never fired, and a harmless ESRCH for an already-gone process reached
 * `onError` as a kill failure).
 */
function isEsrch(error: unknown): boolean {
  const { code, message } = (error ?? {}) as {
    code?: unknown;
    message?: unknown;
  };
  return code === 'ESRCH' || String(message).includes('ESRCH');
}

/**
 * Best-effort cross-platform process-tree termination.
 *
 * Windows delegates tree traversal and forced termination to `taskkill`.
 * POSIX first signals the process group, falls back to the single pid when no
 * group exists, and escalates after the grace period only while the pid remains
 * alive. An already-exited process is the successful fast path.
 */
export async function killProcessTree(
  pid: number,
  signal: NodeJS.Signals = 'SIGTERM',
  onError?: (error: unknown) => void,
  options?: { groupOnly?: boolean },
): Promise<void> {
  if (process.platform === 'win32') {
    if (options?.groupOnly) return;
    try {
      const { execFile } = childProcessModule ?? (await loadChildProcess());
      await new Promise<void>((resolve, reject) => {
        execFile(
          resolveTaskkill(),
          ['/pid', String(pid), '/T', '/F'],
          { windowsHide: true, timeout: 3_000 },
          (error: Error | null, stdout: string | undefined, stderr: string | undefined) => {
            if (!error) return resolve();
            const output = typeof stdout === 'string' ? stdout : '';
            const detail = typeof stderr === 'string' ? stderr : '';
            // An already exited process is the successful termination outcome.
            if (('code' in error && error.code === 128) ||
              /not found|no running instance of the task/i.test(`${output}\n${detail}`)) return resolve();
            const code = 'code' in error ? String(error.code) : 'unknown';
            reject(new Error(`taskkill failed (exit code ${code}): ${detail.trim() || error.message}`, { cause: error }));
          },
        );
      });
    } catch (error: unknown) {
      onError?.(error);
    }
    return;
  }

  const killGroup = (nextSignal: NodeJS.Signals): void => {
    try {
      process.kill(-pid, nextSignal);
    } catch (groupError: unknown) {
      if (options?.groupOnly) {
        // Never fall back to the bare PID: after the leader exited, that PID
        // can belong to an unrelated process.
        if (!isEsrch(groupError)) onError?.(groupError);
      } else {
        try {
          process.kill(pid, nextSignal);
        } catch (error: unknown) {
          // ESRCH: the process already exited, which is the goal. Anything else
          // (EPERM) left it alive; the caller is told, as on win32.
          if (!isEsrch(error)) onError?.(error);
        }
      }
    }
  };

  killGroup(signal);

  await new Promise<void>((resolve) => {
    let waited = 0;
    const poll = (): void => {
      try {
        // Probe the GROUP, not the leader: a leader that exits while a
        // descendant survives would otherwise read as "gone" and the descendant
        // would never be escalated to SIGKILL.
        process.kill(-pid, 0); // liveness probe — throws ESRCH once the group is gone
        // degradation-audit: optional-capability - ESRCH means the process group
        // has already exited, which is the awaited success outcome, not a failure;
        // resolving here is the normal fast path this poll exists for.
      } catch (error: unknown) {
        if (isEsrch(error)) {
          resolve();
          return;
        }
      }

      waited += PROCESS_LIVENESS_POLL_MS;
      if (waited >= PROCESS_TREE_KILL_GRACE_MS) {
        killGroup('SIGKILL');
        resolve();
        return;
      }

      setTimeout(poll, PROCESS_LIVENESS_POLL_MS).unref?.();
    };

    setTimeout(poll, PROCESS_LIVENESS_POLL_MS).unref?.();
  });
}

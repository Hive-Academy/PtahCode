/**
 * Start-up sweep of provider-session agents a crashed host left behind
 * (plan component 11). The pool records each process in the pid ledger; a
 * clean shutdown removes every row, so a row found at start belongs to a run
 * that did not close its agents. A row is killed only when the live process
 * with that pid also started when the row says, so a reused pid is never
 * signalled:
 * - Windows: one CIM snapshot (`queryWindowsProcesses`); the matching
 *   process tree is killed with `killProcessTree` (taskkill /T /F).
 * - POSIX: `ps -o lstart= -p <pid>`; the agent runs detached, so its process
 *   group is signalled (`groupOnly`, never the bare pid). Without `ps` the row
 *   is skipped and logged.
 *
 * Honest limit: between a crash and the next Ptah start, agents can outlive
 * the host. Every failure is logged; the sweep never fails startup.
 */
import {
  defaultOrphanCleanupDependencies,
  killProcessTree,
  type ProcessQuery,
} from '@ptah-extension/platform-core';
import type { Logger } from '@ptah-extension/vscode-core';
import type { ProviderSessionPidEntry } from '@ptah-extension/rpc-handlers';

/**
 * The pool records a pid after its open resolved, which includes the agent's
 * handshake and, for a history read, its replay (bounded at 90 s). The process
 * therefore started up to this long before `startedAt`.
 */
export const ORPHAN_OPEN_WINDOW_MS = 120_000;
/** Clock skew allowed after `startedAt` (CIM and `ps` round to the second). */
export const ORPHAN_TIME_TOLERANCE_MS = 1_000;
/** Bound on one `ps` probe. */
const PS_TIMEOUT_MS = 3_000;

export type ProcessRows = Awaited<ReturnType<ProcessQuery>>;

export interface ProviderSessionOrphanSweepDeps {
  readonly platform: NodeJS.Platform;
  readonly logger: Pick<Logger, 'info' | 'warn'>;
  /** Windows: one snapshot of every live process. */
  readonly queryWindows: ProcessQuery;
  /** POSIX: the start time (epoch ms) of `pid`, or undefined when it is gone. */
  readonly posixStartTime: (pid: number) => Promise<number | undefined>;
  /** Kill the process tree (Windows) or the process group (POSIX) of `pid`. */
  readonly kill: (pid: number) => Promise<void>;
}

export interface ProviderSessionOrphanSweepResult {
  readonly killed: number;
  readonly skipped: number;
}

/** Whether a live process start matches a ledger row's open window. */
export function startedWithin(
  createdAtMs: number,
  entry: ProviderSessionPidEntry,
): boolean {
  return (
    createdAtMs >= entry.startedAt - ORPHAN_OPEN_WINDOW_MS &&
    createdAtMs <= entry.startedAt + ORPHAN_TIME_TOLERANCE_MS
  );
}

/** CIM `CreationDate`: `/Date(<ms>)/` from ConvertTo-Json, or an ISO string. */
export function cimCreationTime(value: string | null): number | undefined {
  if (value === null) return undefined;
  const epoch = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(value);
  const parsed = epoch ? Number(epoch[1]) : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function sweepProviderSessionOrphans(
  entries: readonly ProviderSessionPidEntry[],
  deps: ProviderSessionOrphanSweepDeps,
): Promise<ProviderSessionOrphanSweepResult> {
  if (entries.length === 0) return { killed: 0, skipped: 0 };
  const startTimeOf =
    deps.platform === 'win32'
      ? await windowsStartTimes(deps)
      : (pid: number) => deps.posixStartTime(pid);
  let killed = 0;
  let skipped = 0;
  for (const entry of entries) {
    try {
      const createdAtMs = await startTimeOf(entry.pid);
      if (createdAtMs === undefined || !startedWithin(createdAtMs, entry)) {
        skipped++;
        continue;
      }
      await deps.kill(entry.pid);
      killed++;
    } catch (error) {
      // degradation-audit: reported - one row's failure leaves the others swept.
      skipped++;
      deps.logger.warn('[ProviderSessionOrphanSweep] Orphan not stopped', {
        pid: entry.pid,
        profile: entry.profile,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  deps.logger.info('[ProviderSessionOrphanSweep] Sweep finished', {
    rows: entries.length,
    killed,
    skipped,
  });
  return { killed, skipped };
}

async function windowsStartTimes(
  deps: Pick<ProviderSessionOrphanSweepDeps, 'queryWindows'>,
): Promise<(pid: number) => Promise<number | undefined>> {
  const rows = await deps.queryWindows();
  const byPid = new Map<number, number | undefined>();
  for (const row of rows) byPid.set(row.ProcessId, cimCreationTime(row.CreationDate));
  return async (pid) => byPid.get(pid);
}

/** `ps -o lstart= -p <pid>`; undefined when the pid is gone or `ps` fails. */
export async function readPosixStartTime(pid: number): Promise<number | undefined> {
  const { execFile } = await import('node:child_process');
  const output = await new Promise<string | undefined>((resolve, reject) => {
    execFile(
      'ps',
      ['-o', 'lstart=', '-p', String(pid)],
      { timeout: PS_TIMEOUT_MS, windowsHide: true },
      (error, stdout) => {
        if (!error) return resolve(String(stdout));
        // `ps` exits 1 when no process has that pid: nothing to sweep.
        if ('code' in error && error.code === 1) return resolve(undefined);
        reject(error);
      },
    );
  });
  const text = output?.trim();
  if (!text) return undefined;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Production dependencies for this platform. */
export function defaultProviderSessionOrphanSweepDeps(
  logger: Pick<Logger, 'info' | 'warn'>,
  platform: NodeJS.Platform = process.platform,
): ProviderSessionOrphanSweepDeps {
  return {
    platform,
    logger,
    queryWindows: defaultOrphanCleanupDependencies.query,
    posixStartTime: readPosixStartTime,
    kill: async (pid) => {
      let failure: Error | undefined;
      await killProcessTree(
        pid,
        'SIGTERM',
        (error: unknown) => {
          failure = error instanceof Error ? error : new Error(String(error));
        },
        // POSIX: the detached agent leads its group; never signal a bare pid.
        platform === 'win32' ? undefined : { groupOnly: true },
      );
      if (failure) throw failure;
    },
  };
}

/**
 * Sweep the rows a previous run left, in the background: the binding does not
 * wait for the process snapshot (seconds on Windows). A new agent never
 * matches an old row (other start time), and only the previous run's rows are
 * settled, so the sweep and the live pool never race on a row. A sweep that
 * could not run keeps the rows for the next start.
 */
export function startProviderSessionOrphanSweep(
  store: {
    previous(): readonly ProviderSessionPidEntry[];
    settlePrevious(): Promise<void>;
  },
  deps: ProviderSessionOrphanSweepDeps,
  onError: (error: Error) => void,
): Promise<void> {
  const rows = store.previous();
  if (rows.length === 0) return Promise.resolve();
  return sweepProviderSessionOrphans(rows, deps)
    .then(() => store.settlePrevious())
    .catch((error: unknown) => {
      onError(error instanceof Error ? error : new Error(String(error)));
    });
}

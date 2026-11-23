/**
 * Start-up sweep of provider-session agents a crashed host left behind
 * (plan component 11). The pool records each process in the pid ledger; a
 * clean shutdown removes every row, so a row found at start belongs to a run
 * that did not close its agents.
 *
 * A row is signalled only when the live process with that pid is provably
 * the recorded one, so a reused pid is never signalled:
 * - a probed identity (creation time and image name the ledger store read
 *   with the same probe after the spawn) must match exactly; otherwise
 * - for a row recorded at spawn, the live image must be the profile's
 *   expected binary and its creation time within
 *   {@link ORPHAN_SPAWN_WINDOW_MS} of the spawn-time `startedAt`.
 * A row that has neither cannot be verified and is never signalled.
 *
 * Probes:
 * - Windows: `Get-CimInstance Win32_Process -Filter 'ProcessId=<pid>'
 *   -ErrorAction Stop` (Name, CreationDate in ms), with an explicit marker for
 *   "no such process", so a CIM failure is never read as a gone process; the
 *   matching process tree is killed with `killProcessTree` (taskkill /T /F).
 * - POSIX (Linux, macOS): `ps -o lstart= -o comm= -p <pid>` under `LC_ALL=C`
 *   (start time to the second, command name); the agent runs detached, so its
 *   process group is signalled (`groupOnly`, never the bare pid).
 *
 * Each row gets an outcome. A row is settled (forgotten) when its process is
 * gone, its pid now belongs to another process, or it was stopped. A row
 * whose probe or kill failed, or whose live process cannot be verified, is
 * kept for the next start, up to {@link MAX_ORPHAN_SWEEP_ATTEMPTS} starts;
 * then it is dropped and logged.
 *
 * Honest limit: between a crash and the next Ptah start, agents can outlive
 * the host. Every failure is logged; the sweep never fails startup.
 */
import { killProcessTree } from '@ptah-extension/platform-core';
import type { Logger } from '@ptah-extension/vscode-core';
import { z } from 'zod';
import type { ProviderSessionProfileId } from '@ptah-extension/shared';
import type {
  ProcessIdentity,
  StoredProviderSessionPidEntry,
} from './provider-session-pid-ledger-store';

/**
 * Allowed difference between the recorded and the live creation time. Both
 * come from the same probe, so this only absorbs rounding (`ps` reports whole
 * seconds).
 */
export const ORPHAN_TIME_TOLERANCE_MS = 1_000;
/**
 * Allowed difference between a spawn-time `startedAt` and the live creation
 * time, for a row without a probed identity: the pool records the row as the
 * runtime reports the spawn, and `ps` truncates to whole seconds.
 */
export const ORPHAN_SPAWN_WINDOW_MS = 3_000;
/** Starts that may fail to stop a row before it is dropped. */
export const MAX_ORPHAN_SWEEP_ATTEMPTS = 3;
/** Bound on one probe (PowerShell start-up dominates on Windows). */
const PROBE_TIMEOUT_MS = 5_000;
/** Printed by the Windows probe when no process has the pid. */
export const WINDOWS_NO_PROCESS_MARKER = 'PTAH_NO_PROCESS';

/** The binary each provider-session profile spawns (Windows adds `.exe`). */
const PROFILE_BINARIES: Readonly<Record<ProviderSessionProfileId, string>> = {
  antigravity: 'agy',
  grok: 'grok',
  opencode: 'opencode',
};

/** The image name a live agent of `profile` reports on `platform`. */
export function expectedProviderSessionImage(
  profile: ProviderSessionProfileId,
  platform: NodeJS.Platform,
): string {
  const binary = PROFILE_BINARIES[profile];
  return platform === 'win32' ? `${binary}.exe` : binary;
}

/**
 * The identity of the live process with `pid`, or undefined when no process
 * has that pid. Throws when the probe itself failed.
 */
export type ProcessIdentityProbe = (pid: number) => Promise<ProcessIdentity | undefined>;

export interface ProviderSessionOrphanSweepDeps {
  readonly platform: NodeJS.Platform;
  readonly logger: Pick<Logger, 'info' | 'warn'>;
  readonly identify: ProcessIdentityProbe;
  /** Kill the process tree (Windows) or the process group (POSIX) of `pid`. */
  readonly kill: (pid: number) => Promise<void>;
}

export type ProviderSessionOrphanOutcome =
  /** The matching process was signalled. */
  | 'stopped'
  /** No process has the pid any more. */
  | 'gone'
  /** The pid belongs to a process with another identity. */
  | 'reused'
  /** The live process cannot be verified; never signalled, kept (bounded). */
  | 'unverifiable'
  /** The probe or the kill failed; the row is kept for the next start. */
  | 'retry'
  /** The probe or the kill failed on the last allowed start; the row is dropped. */
  | 'abandoned';

export interface ProviderSessionOrphanSweepResult {
  readonly outcomes: ReadonlyArray<{
    readonly pid: number;
    readonly outcome: ProviderSessionOrphanOutcome;
  }>;
  /** Rows to keep for the next start, with their attempt count raised. */
  readonly retained: readonly StoredProviderSessionPidEntry[];
}

/** Whether a live process is the one the ledger recorded. */
export function identityMatches(
  live: ProcessIdentity,
  recorded: ProcessIdentity,
  platform: NodeJS.Platform,
): boolean {
  const sameImage =
    platform === 'win32'
      ? live.image.toLowerCase() === recorded.image.toLowerCase()
      : live.image === recorded.image;
  return (
    sameImage &&
    Math.abs(live.createdAtMs - recorded.createdAtMs) <= ORPHAN_TIME_TOLERANCE_MS
  );
}

/** Image basename, compared case-insensitively on Windows. */
function imageKey(image: string, platform: NodeJS.Platform): string {
  const base = image.split(/[\\/]/).pop() ?? image;
  return platform === 'win32' ? base.toLowerCase() : base;
}

/**
 * Fallback for a row without a probed identity: the live process runs the
 * profile's binary and was created when the pool reported its spawn.
 */
export function spawnWindowMatches(
  live: ProcessIdentity,
  entry: StoredProviderSessionPidEntry,
  platform: NodeJS.Platform,
): boolean {
  if (!entry.atSpawn || !entry.expectedImage) return false;
  return (
    imageKey(live.image, platform) === imageKey(entry.expectedImage, platform) &&
    Math.abs(live.createdAtMs - entry.startedAt) <= ORPHAN_SPAWN_WINDOW_MS
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
  entries: readonly StoredProviderSessionPidEntry[],
  deps: ProviderSessionOrphanSweepDeps,
): Promise<ProviderSessionOrphanSweepResult> {
  const outcomes: Array<{ pid: number; outcome: ProviderSessionOrphanOutcome }> = [];
  const retained: StoredProviderSessionPidEntry[] = [];
  for (const entry of entries) {
    let outcome: ProviderSessionOrphanOutcome;
    let reason = 'live process cannot be verified as the recorded agent';
    try {
      outcome = await sweepOne(entry, deps);
    } catch (error) {
      // degradation-audit: reported - the row is kept (bounded) and retried at
      // the next start; the other rows are still swept.
      outcome = 'retry';
      reason = error instanceof Error ? error.message : String(error);
    }
    if (outcome === 'retry' || outcome === 'unverifiable') {
      const attempts = (entry.sweepAttempts ?? 0) + 1;
      const detail = { pid: entry.pid, profile: entry.profile, attempts, error: reason };
      if (attempts >= MAX_ORPHAN_SWEEP_ATTEMPTS) {
        outcome = 'abandoned';
        deps.logger.warn(
          '[ProviderSessionOrphanSweep] Orphan not stopped; giving up on this row',
          detail,
        );
      } else {
        retained.push({ ...entry, sweepAttempts: attempts });
        deps.logger.warn(
          '[ProviderSessionOrphanSweep] Orphan not stopped; retrying next start',
          detail,
        );
      }
    }
    outcomes.push({ pid: entry.pid, outcome });
  }
  deps.logger.info('[ProviderSessionOrphanSweep] Sweep finished', {
    rows: entries.length,
    ...countOutcomes(outcomes),
  });
  return { outcomes, retained };
}

/** One row; throws when the probe or the kill failed. */
async function sweepOne(
  entry: StoredProviderSessionPidEntry,
  deps: ProviderSessionOrphanSweepDeps,
): Promise<ProviderSessionOrphanOutcome> {
  const live = await deps.identify(entry.pid);
  if (!live) return 'gone';
  if (entry.identity) {
    if (!identityMatches(live, entry.identity, deps.platform)) return 'reused';
  } else if (!spawnWindowMatches(live, entry, deps.platform)) {
    // Without a probed identity a mismatch proves nothing either way.
    return 'unverifiable';
  }
  await deps.kill(entry.pid);
  return 'stopped';
}

function countOutcomes(
  outcomes: ReadonlyArray<{ outcome: ProviderSessionOrphanOutcome }>,
): Partial<Record<ProviderSessionOrphanOutcome, number>> {
  const counts: Partial<Record<ProviderSessionOrphanOutcome, number>> = {};
  for (const { outcome } of outcomes) counts[outcome] = (counts[outcome] ?? 0) + 1;
  return counts;
}

const cimRowSchema = z.object({
  ProcessId: z.number(),
  Name: z.string().nullable(),
  CreationDate: z.string().nullable(),
});

/**
 * Parses the Windows probe output: undefined only for the explicit
 * {@link WINDOWS_NO_PROCESS_MARKER}; empty or unreadable output throws.
 */
export function parseWindowsIdentity(
  output: string,
  pid: number,
): ProcessIdentity | undefined {
  const text = output.trim();
  if (text === WINDOWS_NO_PROCESS_MARKER) return undefined;
  if (!text) throw new Error(`Process probe for ${pid} printed nothing`);
  const parsed = z
    .union([cimRowSchema, z.array(cimRowSchema)])
    .parse(JSON.parse(text));
  const row = (Array.isArray(parsed) ? parsed : [parsed]).find(
    (candidate) => candidate.ProcessId === pid,
  );
  if (!row) throw new Error(`Process probe for ${pid} returned another process`);
  const createdAtMs = cimCreationTime(row.CreationDate);
  // A live process whose identity cannot be read is a probe failure, not a
  // gone process: the caller must not treat it as safe to forget or to kill.
  if (createdAtMs === undefined || !row.Name)
    throw new Error(`Process ${pid} has no readable creation time or name`);
  return { createdAtMs, image: row.Name };
}

/** Parses `ps -o lstart= -o comm=` output: five lstart tokens, then the command. */
export function parsePosixIdentity(output: string, pid: number): ProcessIdentity | undefined {
  const text = output.trim();
  if (!text) return undefined;
  const tokens = text.split(/\s+/);
  const createdAtMs = Date.parse(tokens.slice(0, 5).join(' '));
  const image = tokens.slice(5).join(' ');
  if (!Number.isFinite(createdAtMs) || !image)
    throw new Error(`Process ${pid} has no readable start time or command`);
  return { createdAtMs, image };
}

/**
 * The Windows probe: a JSON row, the no-process marker, or exit 2 on any CIM
 * error (`Stop` makes a non-terminating error terminating, so it is caught).
 */
export function windowsProbeScript(pid: number): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    'try {',
    `  $p = Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}' -ErrorAction Stop`,
    `  if ($null -eq $p) { '${WINDOWS_NO_PROCESS_MARKER}' }`,
    '  else { $p | Select-Object ProcessId,Name,CreationDate | ConvertTo-Json -Compress }',
    '} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 2 }',
  ].join('\n');
}

/** Production probe for this platform. */
export function createProcessIdentityProbe(
  platform: NodeJS.Platform = process.platform,
): ProcessIdentityProbe {
  return async (pid) => {
    if (!Number.isSafeInteger(pid) || pid <= 0) return undefined;
    const { execFile } = await import('node:child_process');
    if (platform === 'win32') {
      const systemRoot = process.env['SystemRoot'] ?? process.env['windir'];
      const executable = systemRoot
        ? String.raw`${systemRoot}\System32\WindowsPowerShell\v1.0\powershell.exe`
        : 'powershell.exe';
      // `pid` is a validated positive integer; nothing else enters the
      // script. -EncodedCommand avoids any argv quoting of it.
      const encoded = Buffer.from(windowsProbeScript(pid), 'utf16le').toString('base64');
      const output = await new Promise<string>((resolve, reject) => {
        execFile(
          executable,
          ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
          { timeout: PROBE_TIMEOUT_MS, windowsHide: true },
          // stderr is not a failure signal: PowerShell writes CLIXML progress
          // records there. The script turns every CIM error into exit 2.
          (error, stdout) => (error ? reject(error) : resolve(String(stdout))),
        );
      });
      return parseWindowsIdentity(output, pid);
    }
    const output = await new Promise<string | undefined>((resolve, reject) => {
      execFile(
        'ps',
        ['-o', 'lstart=', '-o', 'comm=', '-p', String(pid)],
        // `lstart` is localised; C keeps it parseable by Date.parse.
        { timeout: PROBE_TIMEOUT_MS, windowsHide: true, env: { ...process.env, LC_ALL: 'C' } },
        (error, stdout) => {
          if (!error) return resolve(String(stdout));
          // `ps` exits 1 when no process has that pid.
          if ('code' in error && error.code === 1) return resolve(undefined);
          reject(error);
        },
      );
    });
    return output === undefined ? undefined : parsePosixIdentity(output, pid);
  };
}

/** Production dependencies for this platform. */
export function defaultProviderSessionOrphanSweepDeps(
  logger: Pick<Logger, 'info' | 'warn'>,
  platform: NodeJS.Platform = process.platform,
): ProviderSessionOrphanSweepDeps {
  return {
    platform,
    logger,
    identify: createProcessIdentityProbe(platform),
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
 * wait for the probes. A new agent never matches an old row (other identity),
 * and only the previous run's rows are settled, so the sweep and the live pool
 * never race on a row. Rows whose cleanup failed stay persisted (bounded) for
 * the next start.
 */
export function startProviderSessionOrphanSweep(
  store: {
    previous(): readonly StoredProviderSessionPidEntry[];
    settlePrevious(retained: readonly StoredProviderSessionPidEntry[]): Promise<void>;
  },
  deps: ProviderSessionOrphanSweepDeps,
  onError: (error: Error) => void,
): Promise<void> {
  const rows = store.previous();
  if (rows.length === 0) return Promise.resolve();
  return sweepProviderSessionOrphans(rows, deps)
    .then((result) => store.settlePrevious(result.retained))
    .catch((error: unknown) => {
      onError(error instanceof Error ? error : new Error(String(error)));
    });
}

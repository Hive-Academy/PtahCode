import type { ProviderSessionProfileId } from '@ptah-extension/shared';

/** One live provider-session process, as the crash sweep needs it. */
export interface ProviderSessionPidEntry {
  readonly pid: number;
  readonly profile: ProviderSessionProfileId;
  /** Epoch milliseconds when the pool recorded the process. */
  readonly startedAt: number;
  /**
   * True when the row was recorded as the runtime reported the spawn, so
   * `startedAt` is within moments of the process creation time. A row the
   * pool recorded after the open (`getPid`) leaves it unset.
   */
  readonly atSpawn?: boolean;
}

/**
 * Host port recording the pids the {@link ProviderSessionPool} owns, so a
 * later start can sweep processes a crashed host left behind. The pool calls
 * `record` as soon as a process is spawned and `remove` once its exit is
 * observed (for a runtime that reports no spawn: after the open, and after a
 * close confirmed within the bound); the host binds the persistent
 * implementation (P8). Both calls are synchronous and must not
 * throw for an unknown pid.
 */
export interface ProviderSessionPidLedger {
  record(entry: ProviderSessionPidEntry): void;
  remove(pid: number): void;
}

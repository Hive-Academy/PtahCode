import type { ProviderSessionProfileId } from '@ptah-extension/shared';

/** One live provider-session process, as the crash sweep needs it. */
export interface ProviderSessionPidEntry {
  readonly pid: number;
  readonly profile: ProviderSessionProfileId;
  /** Epoch milliseconds when the pool recorded the process. */
  readonly startedAt: number;
}

/**
 * Host port recording the pids the {@link ProviderSessionPool} owns, so a
 * later start can sweep processes a crashed host left behind. The pool calls
 * `record` after every open and `remove` on every close; the host binds the
 * persistent implementation (P8). Both calls are synchronous and must not
 * throw for an unknown pid.
 */
export interface ProviderSessionPidLedger {
  record(entry: ProviderSessionPidEntry): void;
  remove(pid: number): void;
}

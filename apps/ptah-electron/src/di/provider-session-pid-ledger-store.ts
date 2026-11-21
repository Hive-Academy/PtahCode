/**
 * The persistent `ProviderSessionPidLedger` of the Electron host: the pids the
 * provider-session pool owns, kept in the global state storage so the next
 * start can sweep agents a crashed host left behind
 * (`provider-session-orphan-sweep.ts`).
 *
 * The rows a previous run left are loaded once, at construction, as the
 * sweep's input; they stay persisted until the sweep settles them, so a host
 * that crashes again before the sweep finishes still sweeps them next time.
 * `record` and `remove` are synchronous and never throw: the write is queued
 * and a failed write is logged (the ledger is best effort, the pool must keep
 * working without it).
 */
import { z } from 'zod';
import type { IStateStorage } from '@ptah-extension/platform-core';
import type { Logger } from '@ptah-extension/vscode-core';
import { PROVIDER_SESSION_PROFILE_IDS } from '@ptah-extension/shared';
import type {
  ProviderSessionPidEntry,
  ProviderSessionPidLedger,
} from '@ptah-extension/rpc-handlers';

/** Global state key of the ledger. */
export const PROVIDER_SESSION_PID_LEDGER_KEY = 'ptah.providerSession.pidLedger';

const entrySchema = z.object({
  pid: z.number().int().positive(),
  profile: z.enum(PROVIDER_SESSION_PROFILE_IDS),
  startedAt: z.number(),
});
const ledgerSchema = z.object({
  version: z.literal(1),
  entries: z.array(z.unknown()),
});

export interface ElectronProviderSessionPidLedgerStore {
  /** The port the pool records through. */
  readonly ledger: ProviderSessionPidLedger;
  /** Rows a previous run left behind (the orphan sweep input). */
  previous(): readonly ProviderSessionPidEntry[];
  /** Forget the previous run's rows once the sweep handled them. */
  settlePrevious(): Promise<void>;
  /** Wait for queued writes (specs and shutdown). */
  flush(): Promise<void>;
}

export function createElectronProviderSessionPidLedgerStore(
  storage: Pick<IStateStorage, 'get' | 'update'>,
  logger: Pick<Logger, 'warn' | 'error'>,
): ElectronProviderSessionPidLedgerStore {
  let previous = loadPrevious(storage, logger);
  const live = new Map<number, ProviderSessionPidEntry>();
  let pending: Promise<void> = Promise.resolve();

  const persist = (): Promise<void> => {
    const entries = [...previous, ...live.values()];
    pending = pending.then(async () => {
      try {
        await storage.update(PROVIDER_SESSION_PID_LEDGER_KEY, {
          version: 1,
          entries,
        });
      } catch (error) {
        // degradation-audit: reported - the ledger is best effort; a lost write
        // only means a crash between now and the next write is not swept.
        logger.error(
          '[ProviderSessionPidLedger] Ledger write failed',
          error instanceof Error ? error : new Error('Ledger write failed'),
        );
      }
    });
    return pending;
  };

  return {
    ledger: {
      record(entry) {
        live.set(entry.pid, { ...entry });
        void persist();
      },
      remove(pid) {
        if (!live.delete(pid)) return;
        void persist();
      },
    },
    previous: () => previous,
    settlePrevious() {
      if (previous.length === 0) return pending;
      previous = [];
      return persist();
    },
    flush: () => pending,
  };
}

function loadPrevious(
  storage: Pick<IStateStorage, 'get'>,
  logger: Pick<Logger, 'warn'>,
): ProviderSessionPidEntry[] {
  let raw: unknown;
  try {
    raw = storage.get<unknown>(PROVIDER_SESSION_PID_LEDGER_KEY);
  } catch (error) {
    // degradation-audit: reported - an unreadable ledger means nothing to sweep.
    logger.warn('[ProviderSessionPidLedger] Ledger read failed; nothing to sweep', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
  if (raw === undefined || raw === null) return [];
  const parsed = ledgerSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn('[ProviderSessionPidLedger] Ledger has an unknown shape; ignored');
    return [];
  }
  // A malformed row is dropped alone; the others are still swept.
  const byPid = new Map<number, ProviderSessionPidEntry>();
  for (const row of parsed.data.entries) {
    const entry = entrySchema.safeParse(row);
    if (entry.success) byPid.set(entry.data.pid, entry.data);
  }
  return [...byPid.values()];
}

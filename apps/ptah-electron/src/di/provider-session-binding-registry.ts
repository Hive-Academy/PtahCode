/**
 * Live Electron provider-session chat bindings, kept apart from the
 * composition module so shutdown can drain them without importing the
 * rpc-handlers surface. Mirrors `codex-binding-registry.ts`.
 */
export interface ElectronProviderSessionBindingHandle {
  dispose(): Promise<void>;
}

const bindings = new Set<ElectronProviderSessionBindingHandle>();

export function trackElectronProviderSessionBinding(
  binding: ElectronProviderSessionBindingHandle,
): () => void {
  bindings.add(binding);
  return () => {
    bindings.delete(binding);
  };
}

export function hasElectronProviderSessionBindings(): boolean {
  return bindings.size > 0;
}

/** Flushes of the pid ledgers the bindings record in (one per boot). */
const pidLedgerFlushes = new Set<() => Promise<void>>();

/** Register a pid ledger's flush, so shutdown awaits its queued writes. */
export function trackElectronProviderSessionPidLedger(
  flush: () => Promise<void>,
): () => void {
  pidLedgerFlushes.add(flush);
  return () => {
    pidLedgerFlushes.delete(flush);
  };
}

export function hasElectronProviderSessionPidLedgers(): boolean {
  return pidLedgerFlushes.size > 0;
}

/** Waits for every tracked ledger's queued writes; a write failure is the store's to log. */
export async function flushElectronProviderSessionPidLedgers(): Promise<void> {
  await Promise.all(
    [...pidLedgerFlushes].map((flush) => Promise.resolve().then(flush)),
  );
}

export async function disposeElectronProviderSessionBindings(): Promise<void> {
  const results = await Promise.allSettled(
    [...bindings].map((binding) =>
      Promise.resolve().then(() => binding.dispose()),
    ),
  );
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  );
  if (failures.length)
    throw new AggregateError(failures, 'Electron provider-session shutdown failed');
}

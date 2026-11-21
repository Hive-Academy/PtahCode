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

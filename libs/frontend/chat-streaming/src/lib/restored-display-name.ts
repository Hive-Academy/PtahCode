import type { CliSessionReference } from '@ptah-extension/shared';

/**
 * The display name a card rebuilt from a persisted reference keeps
 * (TASK_2026_905). The card this app run already showed wins, so a session
 * resync never swaps a known name for a fallback. A cold restore reads the
 * Ptah CLI agent name the reference recorded. `undefined` means no name is
 * known and the UI shows the CLI product name.
 */
export function restoredDisplayName(
  ref: Pick<CliSessionReference, 'cli' | 'ptahCliName'>,
  previous: { readonly cli: string; readonly displayName?: string } | undefined,
): string | undefined {
  if (previous && previous.cli === ref.cli && nonBlank(previous.displayName)) {
    return previous.displayName;
  }
  return nonBlank(ref.ptahCliName) ? ref.ptahCliName : undefined;
}

function nonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

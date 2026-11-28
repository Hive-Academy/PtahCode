import type { ProvidersConnection } from '@ptah-extension/core';

/** The connection cards and pickers share the deduplicated Settings connection list. */
export function settingsProviderConnections(
  entries: readonly ProvidersConnection[],
  showSetupCard?: (entry: ProvidersConnection) => boolean,
): ProvidersConnection[] {
  const unique = new Map(entries.map((entry) => [entry.id, entry]));
  return [...unique.values()].filter((entry) => {
    if (showSetupCard) return entry.configured || showSetupCard(entry);
    return entry.configured &&
      (!entry.tokenStale || entry.credentialSource === 'api-key') &&
      !entry.keyUnreadable &&
      (entry.authMode !== 'apiKey' || entry.hasKey);
  });
}

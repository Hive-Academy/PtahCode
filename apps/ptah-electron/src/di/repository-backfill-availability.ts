import type { DependencyContainer } from 'tsyringe';
import { PERSISTENCE_TOKENS } from '@ptah-extension/persistence-sqlite';

/** Persistence may be disabled when Electron runs without a writable database. */
export function repositoryBackfillAvailable(root: Pick<DependencyContainer, 'isRegistered'>): boolean {
  return root.isRegistered(PERSISTENCE_TOKENS.SQLITE_CONNECTION, true);
}

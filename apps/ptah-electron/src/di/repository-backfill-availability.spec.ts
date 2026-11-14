import 'reflect-metadata';
import { container } from 'tsyringe';
import { PERSISTENCE_TOKENS } from '@ptah-extension/persistence-sqlite';
import { repositoryBackfillAvailable } from './repository-backfill-availability';

it('skips repository backfill when SQLite persistence is unavailable', () => {
  const root = container.createChildContainer();
  expect(repositoryBackfillAvailable(root)).toBe(false);
  root.register(PERSISTENCE_TOKENS.SQLITE_CONNECTION, { useValue: {} });
  expect(repositoryBackfillAvailable(root)).toBe(true);
});

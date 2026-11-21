import type { PathLike } from 'node:fs';

/**
 * Call-time `access` override for the single `node:fs/promises` mock in
 * `session-spawner.service.spec.ts`. `null` uses the real function.
 *
 * Specs that import the service spec must not register a second
 * `jest.mock('node:fs/promises')`: Jest keeps only the last factory, which
 * dropped the succession spec's ENOENT `access` and left `access(handoffPath)`
 * on the real filesystem. Fake timers never settle that call.
 */
export const sessionSpawnerFsAccess: {
  current: ((path: PathLike) => Promise<void>) | null;
} = { current: null };

/**
 * Call-time `stat` answer for the same mock. `null`, or an `undefined`
 * answer for a path, uses the real function for that path.
 */
export const sessionSpawnerFsKind: {
  current: ((path: PathLike) => 'file' | 'directory' | 'missing' | undefined) | null;
} = { current: null };

/** The handoff file is absent, so succession does not touch the real disk. */
export function denySessionSpawnerHandoffAccess(): void {
  sessionSpawnerFsAccess.current = async () => {
    throw new Error('ENOENT');
  };
}

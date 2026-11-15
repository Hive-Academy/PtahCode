import { execGit } from '@ptah-extension/vscode-core';
import type { IProcessSpawner } from '@ptah-extension/platform-core';
import type { GitReadRunner } from '@ptah-extension/task-end-hook';

/** Host runner; callers must wrap it in ReadOnlyGit before invoking it. */
export function createCliGitReadRunner(spawner: IProcessSpawner): GitReadRunner {
  return {
    run(args, cwd, options) {
      return execGit([...args], cwd, {
        spawner,
        timeoutMs: options.timeoutMs,
        maxOutputBytes: options.maxOutputBytes,
        priority: 'background',
        ...(options.signal ? { signal: options.signal } : {}),
      });
    },
  };
}

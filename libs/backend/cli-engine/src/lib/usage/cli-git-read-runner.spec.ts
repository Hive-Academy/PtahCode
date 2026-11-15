import 'reflect-metadata';
import { execGit } from '@ptah-extension/vscode-core';
import type { IProcessSpawner } from '@ptah-extension/platform-core';
import { ReadOnlyGit } from '@ptah-extension/task-end-hook';
import { createCliGitReadRunner } from './cli-git-read-runner';

jest.mock('@ptah-extension/vscode-core', () => ({
  ...jest.requireActual('@ptah-extension/vscode-core'),
  execGit: jest.fn(),
}));

describe('CLI read-only Git runner', () => {
  it('rejects unsafe vectors before spawning and forwards a bounded read', async () => {
    const spawner = {} as IProcessSpawner;
    const run = jest.mocked(execGit);
    run.mockResolvedValue({ stdout: '.git', stderr: '', exitCode: 0 });
    const git = new ReadOnlyGit(createCliGitReadRunner(spawner));
    await expect(git.run(['status', '--short'], '/tmp/worktree', { timeoutMs: 1000, maxOutputBytes: 1024 })).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
    await expect(git.run(['rev-parse', '--git-common-dir'], '/tmp/worktree', { timeoutMs: 1000, maxOutputBytes: 1024 })).resolves.toEqual({ stdout: '.git', stderr: '', exitCode: 0 });
    expect(run).toHaveBeenCalledWith(['rev-parse', '--git-common-dir'], '/tmp/worktree', {
      spawner, timeoutMs: 1000, maxOutputBytes: 1024, priority: 'background',
    });
  });
});

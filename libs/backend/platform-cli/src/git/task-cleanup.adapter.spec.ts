import { realpath, lstat } from 'node:fs/promises';
import * as path from 'node:path';
import { TaskCleanupAdapter, type GitRunner } from './task-cleanup.adapter';

jest.mock('node:fs/promises', () => ({ realpath: jest.fn(async (value: string) => value), lstat: jest.fn(async () => ({})) }));

const root = path.resolve('repo');
const tree = path.join(root, '.claude-worktrees', 'task');
const branch = 'feat/task';
const list = `worktree ${root}\nHEAD abc\nbranch refs/heads/main\n\nworktree ${tree}\nHEAD def\nbranch refs/heads/${branch}\n`;

function fixture(status = '', merged = true) {
  const calls: string[][] = [];
  let removed = false;
  const run: GitRunner = async args => {
    calls.push([...args]);
    switch (args[0]) {
      case 'worktree': {
        if (args[1] === 'list') return { stdout: removed ? `worktree ${root}\nHEAD abc\nbranch refs/heads/main\n` : list, exitCode: 0 };
        removed = true;
        return { stdout: '', exitCode: 0 };
      }
      case 'symbolic-ref': return { stdout: 'main\n', exitCode: 0 };
      case 'status': return { stdout: status, exitCode: 0 };
      case 'merge-base': return { stdout: '', exitCode: merged ? 0 : 1 };
      case 'show-ref': return { stdout: '', exitCode: 0 };
      default: return { stdout: '', exitCode: 0 };
    }
  };
  return { adapter: new TaskCleanupAdapter({ error: jest.fn() }, run), calls };
}

describe('TaskCleanupAdapter', () => {
  beforeEach(() => {
    jest.mocked(realpath).mockImplementation(async value => value.toString());
    jest.mocked(lstat).mockResolvedValue({} as Awaited<ReturnType<typeof lstat>>);
  });

  it('inspects a registered clean merged task worktree', async () => {
    const { adapter } = fixture();
    expect(await adapter.inspectTaskWorktree(root, tree, branch)).toEqual({ kind: 'ok', value: { canonicalPath: tree, branch, clean: true, branchMergedIntoMain: true } });
  });

  it('refuses outside paths and dirty or unmerged removal', async () => {
    const { adapter, calls } = fixture('?? new-file\n', false);
    expect((await adapter.inspectTaskWorktree(root, path.resolve('outside'), branch)).kind).toBe('refused');
    expect((await adapter.removeWorktree(root, tree)).kind).toBe('refused');
    expect(calls.some(args => args[0] === 'worktree' && args[1] === 'remove')).toBe(false);
  });

  it('uses only non-force removal and deletion vectors', async () => {
    const { adapter, calls } = fixture();
    expect((await adapter.removeWorktree(root, tree)).kind).toBe('ok');
    expect((await adapter.deleteBranch(root, branch)).kind).toBe('ok');
    expect(calls).toContainEqual(['worktree', 'remove', '--', tree]);
    expect(calls).toContainEqual(['branch', '-d', '--', branch]);
    expect(calls.some(args => args.includes('--force') || args.includes('-D'))).toBe(false);
  });

  it('treats an unknown merge ref as a refusal', async () => {
    const run: GitRunner = async args => {
      if (args[0] === 'worktree') return { stdout: list, exitCode: 0 };
      if (args[0] === 'symbolic-ref') return { stdout: 'main\n', exitCode: 0 };
      if (args[0] === 'merge-base') return { stdout: '', exitCode: 128 };
      return { stdout: '', exitCode: 0 };
    };
    expect((await new TaskCleanupAdapter({ error: jest.fn() }, run)
      .inspectTaskWorktree(root, tree, branch)).kind).toBe('refused');
  });

  it('recognizes a missing and unregistered worktree', async () => {
    jest.mocked(lstat).mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    const run: GitRunner = async () => ({ stdout: `worktree ${root}\nHEAD abc\nbranch refs/heads/main\n`, exitCode: 0 });
    expect(await new TaskCleanupAdapter({ error: jest.fn() }, run)
      .inspectTaskWorktree(root, tree, branch)).toEqual({ kind: 'already-removed', reason: 'already-removed' });
  });

});

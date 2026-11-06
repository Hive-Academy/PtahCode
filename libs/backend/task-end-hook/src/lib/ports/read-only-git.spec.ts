import type {
  GitReadResult,
  GitReadRunner,
  GitReadRunOptions,
} from './git-read-runner.port';
import {
  assertReadOnlyGitVector,
  READ_ONLY_GIT_VECTORS,
  ReadOnlyGit,
  ReadOnlyGitViolation,
} from './read-only-git';

const SHA1 = 'a'.repeat(40);
const SHA256 = '0123456789abcdef'.repeat(4);
const CWD = '/repo/main';
const OPTIONS: GitReadRunOptions = { timeoutMs: 5000, maxOutputBytes: 1024 };

function runnerSpy(): { runner: GitReadRunner; run: jest.Mock } {
  const result: GitReadResult = { stdout: '', stderr: '', exitCode: 0 };
  const run = jest.fn().mockResolvedValue(result);
  return { runner: { run }, run };
}

/** Plan command table rows 1-6, exactly as the collector issues them. */
const ALLOWED: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['row 1 common dir', ['rev-parse', '--git-common-dir']],
  ['row 2 worktree list', ['worktree', 'list', '--porcelain', '-z']],
  [
    'row 3 status',
    [
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
      '--ignored=matching',
    ],
  ],
  [
    'row 4 origin/main',
    ['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main'],
  ],
  [
    'row 5 branch sha',
    [
      'rev-parse',
      '--verify',
      '--quiet',
      '--end-of-options',
      'refs/heads/feat/task-end-hook^{commit}',
    ],
  ],
  [
    'row 6 ancestor (sha-1)',
    ['merge-base', '--is-ancestor', SHA1, 'refs/remotes/origin/main'],
  ],
  [
    'row 6 ancestor (sha-256)',
    ['merge-base', '--is-ancestor', SHA256, 'refs/remotes/origin/main'],
  ],
];

const REJECTED: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['worktree remove', ['worktree', 'remove', '--', '/repo/wt']],
  ['worktree remove --force', ['worktree', 'remove', '--force', '/repo/wt']],
  ['worktree prune', ['worktree', 'prune']],
  ['fetch', ['fetch', 'origin']],
  ['pull', ['pull']],
  ['push', ['push', 'origin', 'main']],
  ['branch -d', ['branch', '-d', 'feat/x']],
  ['branch -D', ['branch', '-D', 'feat/x']],
  ['clean', ['clean', '-fdx']],
  ['stash', ['stash']],
  ['stash push', ['stash', 'push', '-u']],
  ['reset', ['reset', '--hard']],
  ['checkout', ['checkout', 'main']],
  ['-c before an allowed vector', ['-c', 'core.fsmonitor=evil', 'status']],
  [
    '-c before rev-parse',
    ['-c', 'core.hooksPath=/tmp', 'rev-parse', '--git-common-dir'],
  ],
  ['-C before an allowed vector', ['-C', '/elsewhere', 'worktree', 'list']],
  ['empty vector', []],
  ['allowed prefix with extra flag', ['rev-parse', '--git-common-dir', '-q']],
  ['worktree list without -z', ['worktree', 'list', '--porcelain']],
  [
    'status with an extra option',
    [
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
      '--ignored=matching',
      '--output=/tmp/x',
    ],
  ],
  [
    'reordered status flags',
    [
      'status',
      '-z',
      '--porcelain=v1',
      '--untracked-files=all',
      '--ignored=matching',
    ],
  ],
  [
    'rev-parse another remote ref',
    ['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/dev'],
  ],
  [
    'branch sha without --end-of-options',
    ['rev-parse', '--verify', '--quiet', 'refs/heads/feat/x^{commit}'],
  ],
  [
    'branch sha without the peel suffix',
    ['rev-parse', '--verify', '--quiet', '--end-of-options', 'refs/heads/x'],
  ],
  [
    'branch sha on a tag ref',
    [
      'rev-parse',
      '--verify',
      '--quiet',
      '--end-of-options',
      'refs/tags/v1^{commit}',
    ],
  ],
  [
    'merge-base with an abbreviated sha',
    ['merge-base', '--is-ancestor', 'abc1234', 'refs/remotes/origin/main'],
  ],
  [
    'merge-base with an option as sha',
    ['merge-base', '--is-ancestor', '--all', 'refs/remotes/origin/main'],
  ],
  [
    'merge-base against another ref',
    ['merge-base', '--is-ancestor', SHA1, 'refs/heads/main'],
  ],
  ['merge-base without --is-ancestor', ['merge-base', SHA1, 'HEAD']],
];

const UNSAFE_BRANCHES: readonly string[] = [
  '',
  '-b',
  '--output=/tmp/x',
  'feat/../main',
  'feat@{1}',
  'stash@{0}',
  'feat x',
  'feat\nx',
  'feat~1',
  'feat:x',
  'feat*',
  'feat[x',
  'feat\\x',
];

describe('assertReadOnlyGitVector', () => {
  it.each(ALLOWED)('allows %s', (_label, args) => {
    expect(() => assertReadOnlyGitVector(args)).not.toThrow();
  });

  it.each(REJECTED)('rejects %s', (_label, args) => {
    expect(() => assertReadOnlyGitVector(args)).toThrow(ReadOnlyGitViolation);
  });

  it.each(UNSAFE_BRANCHES)(
    'rejects branch %j that fails assertSafeRef',
    (branch) => {
      const args = [
        'rev-parse',
        '--verify',
        '--quiet',
        '--end-of-options',
        `refs/heads/${branch}^{commit}`,
      ];
      expect(() => assertReadOnlyGitVector(args)).toThrow(ReadOnlyGitViolation);
    },
  );

  it('rejects a vector holding a non-string element', () => {
    const args = ['rev-parse', 42] as unknown as readonly string[];
    expect(() => assertReadOnlyGitVector(args)).toThrow(ReadOnlyGitViolation);
  });

  it('carries the refused vector and a bounded message', () => {
    const args = ['worktree', 'remove', 'x'.repeat(500)];
    let caught: unknown;
    try {
      assertReadOnlyGitVector(args);
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ReadOnlyGitViolation);
    const violation = caught as ReadOnlyGitViolation;
    expect(violation.args).toEqual(args);
    expect(violation.name).toBe('ReadOnlyGitViolation');
    expect(violation.message.length).toBeLessThan(300);
  });
});

describe('READ_ONLY_GIT_VECTORS', () => {
  it('builds every allowed row', () => {
    expect(READ_ONLY_GIT_VECTORS.commonDir()).toEqual(ALLOWED[0][1]);
    expect(READ_ONLY_GIT_VECTORS.worktreeList()).toEqual(ALLOWED[1][1]);
    expect(READ_ONLY_GIT_VECTORS.status()).toEqual(ALLOWED[2][1]);
    expect(READ_ONLY_GIT_VECTORS.originMain()).toEqual(ALLOWED[3][1]);
    expect(READ_ONLY_GIT_VECTORS.branchSha('feat/task-end-hook')).toEqual(
      ALLOWED[4][1],
    );
    expect(READ_ONLY_GIT_VECTORS.isAncestorOfOriginMain(SHA1)).toEqual(
      ALLOWED[5][1],
    );
  });

  it('refuses an unsafe branch and a short sha at build time', () => {
    expect(() => READ_ONLY_GIT_VECTORS.branchSha('-x')).toThrow(
      ReadOnlyGitViolation,
    );
    expect(() => READ_ONLY_GIT_VECTORS.isAncestorOfOriginMain('HEAD')).toThrow(
      ReadOnlyGitViolation,
    );
  });

  it('returns a fresh array each call', () => {
    const first = READ_ONLY_GIT_VECTORS.status() as string[];
    first.push('--mutated');
    expect(READ_ONLY_GIT_VECTORS.status()).toEqual(ALLOWED[2][1]);
  });
});

describe('ReadOnlyGit', () => {
  it.each(ALLOWED)('delegates %s to the runner', async (_label, args) => {
    const { runner, run } = runnerSpy();
    const git = new ReadOnlyGit(runner);
    await expect(git.run(args, CWD, OPTIONS)).resolves.toEqual({
      stdout: '',
      stderr: '',
      exitCode: 0,
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith([...args], CWD, OPTIONS);
  });

  it.each(REJECTED)('rejects %s without spawning', async (_label, args) => {
    const { runner, run } = runnerSpy();
    const git = new ReadOnlyGit(runner);
    await expect(git.run(args, CWD, OPTIONS)).rejects.toBeInstanceOf(
      ReadOnlyGitViolation,
    );
    expect(run).not.toHaveBeenCalled();
  });

  it.each(['', 'relative/dir', '.'])(
    'rejects cwd %j without spawning',
    async (cwd) => {
      const { runner, run } = runnerSpy();
      const git = new ReadOnlyGit(runner);
      await expect(
        git.run(READ_ONLY_GIT_VECTORS.commonDir(), cwd, OPTIONS),
      ).rejects.toBeInstanceOf(ReadOnlyGitViolation);
      expect(run).not.toHaveBeenCalled();
    },
  );

  it('passes a copy, so the caller cannot mutate the checked vector', async () => {
    const { runner, run } = runnerSpy();
    const git = new ReadOnlyGit(runner);
    const args = ['rev-parse', '--git-common-dir'];
    await git.run(args, CWD, OPTIONS);
    expect(run.mock.calls[0][0]).not.toBe(args);
  });

  it('propagates a runner rejection unchanged', async () => {
    const failure = new Error('timed out');
    const run = jest.fn().mockRejectedValue(failure);
    const git = new ReadOnlyGit({ run });
    await expect(
      git.run(READ_ONLY_GIT_VECTORS.worktreeList(), CWD, OPTIONS),
    ).rejects.toBe(failure);
  });
});

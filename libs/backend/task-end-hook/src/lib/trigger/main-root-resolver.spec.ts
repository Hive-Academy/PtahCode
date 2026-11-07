import type {
  GitReadResult,
  GitReadRunner,
  GitReadRunOptions,
} from '../ports/git-read-runner.port';
import { READ_ONLY_GIT_VECTORS, ReadOnlyGit } from '../ports/read-only-git';
import { MainRootResolver } from './main-root-resolver';
import {
  RepositoryIdentityResolver,
  type RepositoryIdentity,
} from './repository-identity';

const MAIN = '/repos/app';
const WT_A = '/repos/app/.claude-worktrees/wt-a';
const WT_B = '/repos/app/.claude-worktrees/wt-b';
const COMMON = '/repos/app/.git';
const OTHER_COMMON = '/repos/other/.git';

type GitAnswer = GitReadResult | Error;

interface Call {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly options: GitReadRunOptions;
}

class FakeGitRunner implements GitReadRunner {
  readonly calls: Call[] = [];
  private readonly answers = new Map<string, GitAnswer>();

  answer(args: readonly string[], cwd: string, result: GitAnswer): void {
    this.answers.set(`${cwd}|${args.join(' ')}`, result);
  }

  async run(
    args: readonly string[],
    cwd: string,
    options: GitReadRunOptions,
  ): Promise<GitReadResult> {
    this.calls.push({ args, cwd, options });
    const answer = this.answers.get(`${cwd}|${args.join(' ')}`);
    if (answer === undefined) throw new Error(`unexpected git ${args[0]}`);
    if (answer instanceof Error) throw answer;
    return answer;
  }
}

const ok = (stdout: string): GitReadResult => ({
  stdout,
  stderr: '',
  exitCode: 0,
});

/** One `worktree list --porcelain -z` block. */
function block(worktreePath: string, extra: readonly string[] = []): string {
  return [
    `worktree ${worktreePath}`,
    'HEAD 0123456789abcdef0123456789abcdef01234567',
    'branch refs/heads/main',
    ...extra,
  ].join('\0');
}

function listing(...blocks: string[]): GitReadResult {
  return ok(`${blocks.join('\0\0')}\0\0`);
}

interface Harness {
  readonly git: FakeGitRunner;
  readonly realpaths: Map<string, string>;
  readonly warn: jest.Mock;
  readonly resolver: MainRootResolver;
  readonly identities: RepositoryIdentityResolver;
}

function setup(): Harness {
  const git = new FakeGitRunner();
  const realpaths = new Map<string, string>([
    [MAIN, MAIN],
    [WT_A, WT_A],
    [WT_B, WT_B],
    [COMMON, COMMON],
    [OTHER_COMMON, OTHER_COMMON],
  ]);
  const realpath = async (target: string): Promise<string> => {
    const real = realpaths.get(target);
    if (real === undefined) throw new Error('ENOENT');
    return real;
  };
  const warn = jest.fn();
  const readOnly = new ReadOnlyGit(git);
  const identities = new RepositoryIdentityResolver(readOnly, realpath);
  const resolver = new MainRootResolver({
    git: readOnly,
    identities,
    realpath,
    logger: { warn },
  });
  // The main checkout reports a relative common dir; a linked worktree an
  // absolute one, as git does.
  git.answer(READ_ONLY_GIT_VECTORS.commonDir(), MAIN, ok('.git\n'));
  git.answer(READ_ONLY_GIT_VECTORS.commonDir(), WT_A, ok(`${COMMON}\n`));
  return { git, realpaths, warn, resolver, identities };
}

const GIT_IDENTITY: RepositoryIdentity = { kind: 'git', repoId: COMMON };

function warnedCheck(h: Harness): unknown {
  return h.warn.mock.calls[0]?.[1];
}

describe('MainRootResolver', () => {
  it('resolves the main checkout listed first from a linked worktree', async () => {
    const h = setup();
    h.git.answer(
      READ_ONLY_GIT_VECTORS.worktreeList(),
      WT_A,
      listing(block(MAIN), block(WT_A)),
    );

    await expect(h.resolver.resolve(WT_A, GIT_IDENTITY)).resolves.toBe(MAIN);
    expect(h.warn).not.toHaveBeenCalled();
  });

  it('resolves the seen root itself when it is the main checkout', async () => {
    const h = setup();
    h.git.answer(
      READ_ONLY_GIT_VECTORS.worktreeList(),
      MAIN,
      listing(block(MAIN), block(WT_A)),
    );

    await expect(h.resolver.resolve(MAIN, GIT_IDENTITY)).resolves.toBe(MAIN);
  });

  it('gives null when the first entry is bare', async () => {
    const h = setup();
    h.git.answer(
      READ_ONLY_GIT_VECTORS.worktreeList(),
      WT_A,
      listing(`worktree ${MAIN}\0bare`, block(WT_A)),
    );

    await expect(h.resolver.resolve(WT_A, GIT_IDENTITY)).resolves.toBeNull();
    expect(warnedCheck(h)).toEqual({ check: 'main-entry-bare' });
  });

  it('gives null when the first entry is prunable', async () => {
    const h = setup();
    h.git.answer(
      READ_ONLY_GIT_VECTORS.worktreeList(),
      WT_A,
      listing(
        block(MAIN, ['prunable gitdir file points to non-existent location']),
        block(WT_A),
      ),
    );

    await expect(h.resolver.resolve(WT_A, GIT_IDENTITY)).resolves.toBeNull();
    expect(warnedCheck(h)).toEqual({ check: 'main-entry-prunable' });
  });

  it('gives null when the candidate realpath fails', async () => {
    const h = setup();
    h.realpaths.delete(MAIN);
    h.git.answer(
      READ_ONLY_GIT_VECTORS.worktreeList(),
      WT_A,
      listing(block(MAIN), block(WT_A)),
    );

    await expect(h.resolver.resolve(WT_A, GIT_IDENTITY)).resolves.toBeNull();
    expect(warnedCheck(h)).toEqual({ check: 'main-realpath-failed' });
  });

  it('gives null when the candidate path is not absolute', async () => {
    const h = setup();
    h.git.answer(
      READ_ONLY_GIT_VECTORS.worktreeList(),
      WT_A,
      listing(block('repos/app'), block(WT_A)),
    );

    await expect(h.resolver.resolve(WT_A, GIT_IDENTITY)).resolves.toBeNull();
    expect(warnedCheck(h)).toEqual({ check: 'main-path-not-absolute' });
  });

  it('gives null when the candidate resolves to a different repository identity', async () => {
    const h = setup();
    h.git.answer(
      READ_ONLY_GIT_VECTORS.commonDir(),
      MAIN,
      ok(`${OTHER_COMMON}\n`),
    );
    h.git.answer(
      READ_ONLY_GIT_VECTORS.worktreeList(),
      WT_A,
      listing(block(MAIN), block(WT_A)),
    );

    await expect(h.resolver.resolve(WT_A, GIT_IDENTITY)).resolves.toBeNull();
    expect(warnedCheck(h)).toEqual({ check: 'main-identity-mismatch' });
  });

  it('gives null when the candidate is not inside a git repository', async () => {
    const h = setup();
    h.git.answer(READ_ONLY_GIT_VECTORS.commonDir(), MAIN, {
      stdout: '',
      stderr: 'fatal: not a git repository',
      exitCode: 128,
    });
    h.git.answer(
      READ_ONLY_GIT_VECTORS.worktreeList(),
      WT_A,
      listing(block(MAIN), block(WT_A)),
    );

    await expect(h.resolver.resolve(WT_A, GIT_IDENTITY)).resolves.toBeNull();
    expect(warnedCheck(h)).toEqual({ check: 'main-identity-mismatch' });
  });

  it('gives null when the seen root is absent from the list', async () => {
    const h = setup();
    h.git.answer(
      READ_ONLY_GIT_VECTORS.worktreeList(),
      WT_A,
      listing(block(MAIN), block(WT_B)),
    );

    await expect(h.resolver.resolve(WT_A, GIT_IDENTITY)).resolves.toBeNull();
    expect(warnedCheck(h)).toEqual({ check: 'seen-root-not-listed' });
  });

  it('gives null for an empty listing or a non-zero exit', async () => {
    const h = setup();
    h.git.answer(READ_ONLY_GIT_VECTORS.worktreeList(), WT_A, ok(''));
    await expect(h.resolver.resolve(WT_A, GIT_IDENTITY)).resolves.toBeNull();
    expect(warnedCheck(h)).toEqual({ check: 'worktree-list-empty' });

    h.git.answer(READ_ONLY_GIT_VECTORS.worktreeList(), WT_A, {
      stdout: '',
      stderr: 'fatal',
      exitCode: 129,
    });
    await expect(h.resolver.resolve(WT_A, GIT_IDENTITY)).resolves.toBeNull();
    expect(h.warn.mock.calls[1]?.[1]).toEqual({
      check: 'worktree-list-failed',
    });
  });

  it('gives null on a git timeout and re-runs git on the next call', async () => {
    const h = setup();
    h.git.answer(
      READ_ONLY_GIT_VECTORS.worktreeList(),
      WT_A,
      new Error('git timed out'),
    );

    await expect(h.resolver.resolve(WT_A, GIT_IDENTITY)).resolves.toBeNull();
    expect(warnedCheck(h)).toEqual({ check: 'worktree-list-failed' });

    h.git.answer(
      READ_ONLY_GIT_VECTORS.worktreeList(),
      WT_A,
      listing(block(MAIN), block(WT_A)),
    );
    await expect(h.resolver.resolve(WT_A, GIT_IDENTITY)).resolves.toBe(MAIN);
    const listCalls = h.git.calls.filter((c) => c.args[0] === 'worktree');
    expect(listCalls).toHaveLength(2);
  });

  it('caches a resolved main root: no git call the second time', async () => {
    const h = setup();
    h.git.answer(
      READ_ONLY_GIT_VECTORS.worktreeList(),
      WT_A,
      listing(block(MAIN), block(WT_A)),
    );

    await h.resolver.resolve(WT_A, GIT_IDENTITY);
    const callsAfterFirst = h.git.calls.length;
    await expect(h.resolver.resolve(WT_A, GIT_IDENTITY)).resolves.toBe(MAIN);
    expect(h.git.calls).toHaveLength(callsAfterFirst);
  });

  it('gives realpath(seenRoot) for a nogit identity, without git', async () => {
    const h = setup();
    h.realpaths.set('/plain/folder', '/real/plain/folder');

    await expect(
      h.resolver.resolve('/plain/folder', {
        kind: 'nogit',
        repoId: 'nogit:/real/plain/folder',
        rootRealPath: '/real/plain/folder',
      }),
    ).resolves.toBe('/real/plain/folder');
    expect(h.git.calls).toEqual([]);
  });

  it('sends every git call through ReadOnlyGit with exactly rows 1 and 2', async () => {
    const h = setup();
    h.git.answer(
      READ_ONLY_GIT_VECTORS.worktreeList(),
      WT_A,
      listing(block(MAIN), block(WT_A)),
    );

    const seen = await h.identities.resolve(WT_A);
    expect(seen).toEqual({ kind: 'ok', identity: GIT_IDENTITY });
    await h.resolver.resolve(WT_A, GIT_IDENTITY);

    expect(h.git.calls.map((c) => [c.args, c.cwd])).toEqual([
      [READ_ONLY_GIT_VECTORS.commonDir(), WT_A],
      [READ_ONLY_GIT_VECTORS.worktreeList(), WT_A],
      [READ_ONLY_GIT_VECTORS.commonDir(), MAIN],
    ]);
    for (const call of h.git.calls) {
      expect(call.options.timeoutMs).toBeGreaterThan(0);
      expect(call.options.maxOutputBytes).toBeGreaterThan(0);
    }
  });
});

describe('RepositoryIdentityResolver', () => {
  it('maps exit 128 with no output to a nogit identity on the real path', async () => {
    const h = setup();
    h.realpaths.set('/plain', '/real/plain');
    h.git.answer(READ_ONLY_GIT_VECTORS.commonDir(), '/plain', {
      stdout: '',
      stderr: 'fatal: not a git repository (or any of the parent directories)',
      exitCode: 128,
    });

    await expect(h.identities.resolve('/plain')).resolves.toEqual({
      kind: 'ok',
      identity: {
        kind: 'nogit',
        repoId: 'nogit:/real/plain',
        rootRealPath: '/real/plain',
      },
    });
  });

  it('treats a dubious-ownership exit 128 as unresolved, uncached, and recovers later', async () => {
    const h = setup();
    h.realpaths.set('/owned', '/owned');
    h.git.answer(READ_ONLY_GIT_VECTORS.commonDir(), '/owned', {
      stdout: '',
      stderr:
        "fatal: detected dubious ownership in repository at '/owned'\n" +
        'To add an exception for this directory, call:\n\n' +
        "\tgit config --global --add safe.directory /owned\n",
      exitCode: 128,
    });

    await expect(h.identities.resolve('/owned')).resolves.toEqual({
      kind: 'error',
      error: 'common-dir-unexpected-exit',
    });
    expect(h.identities.cachedRepoId('/owned')).toBeNull();

    // Ownership repaired: the next call re-runs git and resolves the real
    // repository, never a cached `nogit:` id.
    h.git.answer(READ_ONLY_GIT_VECTORS.commonDir(), '/owned', ok(`${COMMON}\n`));
    await expect(h.identities.resolve('/owned')).resolves.toEqual({
      kind: 'ok',
      identity: GIT_IDENTITY,
    });
    expect(h.identities.cachedRepoId('/owned')).toBe(COMMON);
    expect(h.git.calls.filter((c) => c.cwd === '/owned')).toHaveLength(2);
  });

  it('treats an exit 128 with empty stderr as unresolved, not nogit', async () => {
    const h = setup();
    h.realpaths.set('/silent', '/silent');
    h.git.answer(READ_ONLY_GIT_VECTORS.commonDir(), '/silent', {
      stdout: '',
      stderr: '',
      exitCode: 128,
    });

    await expect(h.identities.resolve('/silent')).resolves.toEqual({
      kind: 'error',
      error: 'common-dir-unexpected-exit',
    });
    expect(h.identities.cachedRepoId('/silent')).toBeNull();
  });

  it('caches a not-a-repository nogit identity: the next call runs no git', async () => {
    const h = setup();
    h.realpaths.set('/plain', '/real/plain');
    h.git.answer(READ_ONLY_GIT_VECTORS.commonDir(), '/plain', {
      stdout: '',
      stderr: 'fatal: not a git repository (or any of the parent directories): .git\n',
      exitCode: 128,
    });

    await h.identities.resolve('/plain');
    await h.identities.resolve('/plain');
    expect(h.identities.cachedRepoId('/plain')).toBe('nogit:/real/plain');
    expect(h.git.calls.filter((c) => c.cwd === '/plain')).toHaveLength(1);
  });

  it('resolves a relative common dir against the root and gives the same id for every worktree', async () => {
    const h = setup();
    const main = await h.identities.resolve(MAIN);
    const linked = await h.identities.resolve(WT_A);

    expect(main).toEqual({ kind: 'ok', identity: GIT_IDENTITY });
    expect(linked).toEqual(main);
  });

  it('answers cachedRepoId from the cache only, without running git', async () => {
    const h = setup();
    expect(h.identities.cachedRepoId(MAIN)).toBeNull();
    expect(h.git.calls).toHaveLength(0);

    await h.identities.resolve(MAIN);
    expect(h.identities.cachedRepoId(MAIN)).toBe(COMMON);
    expect(h.identities.cachedRepoId(WT_A)).toBeNull();
    expect(h.git.calls).toHaveLength(1);
  });

  it('does not cache a failure: the next call re-runs git', async () => {
    const h = setup();
    h.git.answer(READ_ONLY_GIT_VECTORS.commonDir(), WT_B, new Error('timeout'));
    await expect(h.identities.resolve(WT_B)).resolves.toEqual({
      kind: 'error',
      error: 'common-dir-git-failed',
    });

    h.git.answer(READ_ONLY_GIT_VECTORS.commonDir(), WT_B, ok(`${COMMON}\n`));
    await expect(h.identities.resolve(WT_B)).resolves.toEqual({
      kind: 'ok',
      identity: GIT_IDENTITY,
    });
    await h.identities.resolve(WT_B);
    expect(h.git.calls.filter((c) => c.cwd === WT_B)).toHaveLength(2);
  });

  it('reports an unexpected exit, an empty path and an unresolvable common dir', async () => {
    const h = setup();
    h.git.answer(READ_ONLY_GIT_VECTORS.commonDir(), '/a', {
      stdout: '',
      stderr: '',
      exitCode: 1,
    });
    h.git.answer(READ_ONLY_GIT_VECTORS.commonDir(), '/b', ok('\n'));
    h.git.answer(READ_ONLY_GIT_VECTORS.commonDir(), '/c', ok('/gone/.git\n'));

    await expect(h.identities.resolve('/a')).resolves.toEqual({
      kind: 'error',
      error: 'common-dir-unexpected-exit',
    });
    await expect(h.identities.resolve('/b')).resolves.toEqual({
      kind: 'error',
      error: 'common-dir-empty',
    });
    await expect(h.identities.resolve('/c')).resolves.toEqual({
      kind: 'error',
      error: 'common-dir-realpath-failed',
    });
  });
});

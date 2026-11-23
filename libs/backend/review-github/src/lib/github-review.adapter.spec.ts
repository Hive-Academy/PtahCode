import type { ISecretStorage } from '@ptah-extension/platform-core';
import type { Logger } from '@ptah-extension/vscode-core';
import type { RepoIdentity } from '@ptah-extension/review-contracts';
import { GithubReviewAdapter } from './github-review.adapter';
import { GitHubReviewError } from './github-review.error';

const repo: RepoIdentity = { owner: 'Hive-Academy', name: 'PtahCode' };
const sha = 'a'.repeat(40);
const base = 'b'.repeat(40);
const pull = { number: 4, head: { sha, repo: { id: 2 } }, base: { sha: base, repo: { id: 1 } },
  state: 'open', draft: true, user: { login: 'author' } };
const response = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(body === null ? null : JSON.stringify(body), { status, headers });

function setup(fetcher: typeof fetch) {
  const get = jest.fn().mockResolvedValue('sensitive-token');
  const secrets = { get } as Pick<ISecretStorage, 'get'>;
  const logger = { warn: jest.fn(), error: jest.fn() } as Pick<Logger, 'warn' | 'error'>;
  const adapter = new GithubReviewAdapter(secrets as ISecretStorage, logger as Logger, fetcher);
  return { adapter, get, logger };
}

describe('GithubReviewAdapter', () => {
  it('reads resolved review threads from GraphQL and matches REST comment IDs', async () => {
    const review = { id: 9, body: 'review', submitted_at: '2026-01-01T00:00:00Z', user: { login: 'bot' } };
    const comment = { id: 12, pull_request_review_id: 9, path: 'a.ts', line: 3,
      original_line: 3, body: 'finding', user: { login: 'bot' } };
    const fetcher = jest.fn().mockResolvedValueOnce(response([review]))
      .mockResolvedValueOnce(response({ login: 'bot' }))
      .mockResolvedValueOnce(response([comment]))
      .mockResolvedValueOnce(response({ data: { repository: { pullRequest: { reviewThreads: {
        nodes: [{ id: 'thread-1', isResolved: true, comments: { nodes: [{ databaseId: 12 }],
          pageInfo: { hasNextPage: false, endCursor: null } } }],
        pageInfo: { hasNextPage: false, endCursor: null },
      } } } } }));
    const { adapter } = setup(fetcher);
    const result = await adapter.listOwnReviewsAndThreads(repo, 4);
    expect(result.items[0].threads[0]).toMatchObject({ id: '12', resolved: true });
    expect(fetcher.mock.calls[3][0]).toBe('https://api.github.com/graphql');
  });
  it('paginates comments within a thread before reconciling its resolution', async () => {
    const review = { id: 9, body: 'review', submitted_at: '2026-01-01T00:00:00Z', user: { login: 'bot' } };
    const comment = { id: 112, pull_request_review_id: 9, path: 'a.ts', line: 3,
      original_line: 3, body: 'finding', user: { login: 'bot' } };
    const fetcher = jest.fn().mockResolvedValueOnce(response([review]))
      .mockResolvedValueOnce(response({ login: 'bot' }))
      .mockResolvedValueOnce(response([comment]))
      .mockResolvedValueOnce(response({ data: { repository: { pullRequest: { reviewThreads: {
        nodes: [{ id: 'thread-1', isResolved: true, comments: {
          nodes: Array.from({ length: 100 }, (_, index) => ({ databaseId: index + 1 })),
          pageInfo: { hasNextPage: true, endCursor: 'after-100' },
        } }], pageInfo: { hasNextPage: false, endCursor: null },
      } } } } }))
      .mockResolvedValueOnce(response({ data: { node: { comments: {
        nodes: [{ databaseId: 112 }], pageInfo: { hasNextPage: false, endCursor: null },
      } } } }));
    const { adapter } = setup(fetcher);
    const result = await adapter.listOwnReviewsAndThreads(repo, 4);
    expect(result.items[0].threads).toEqual([expect.objectContaining({ id: '112', resolved: true })]);
    expect(JSON.parse(String(fetcher.mock.calls[4][1].body)).variables).toEqual({ id: 'thread-1', cursor: 'after-100' });
  });
  it('paginates and maps fork, draft, author, and token headers', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(response([pull], 200, {
      etag: '"one"', link: '<https://api.github.com/repos/Hive-Academy/PtahCode/pulls?page=2>; rel="next"',
    })).mockResolvedValueOnce(response([], 200));
    const { adapter, get } = setup(fetcher);
    const first = await adapter.listOpenPulls(repo);
    expect(first.items[0]).toMatchObject({ headIsFork: true, draft: true, authorLogin: 'author', headRepoId: 2 });
    expect(first.nextPage).toBe(2);
    await adapter.listOpenPulls(repo, undefined, 2);
    expect(get).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer sensitive-token');
  });

  it('returns a prior matching snapshot on ETag 304', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(response([pull], 200, { etag: '"one"' }))
      .mockResolvedValueOnce(response(null, 304));
    const { adapter } = setup(fetcher);
    await adapter.listOpenPulls(repo);
    expect(await adapter.listOpenPulls(repo, '"one"')).toMatchObject({ notModified: true, items: [{ number: 4 }] });
    expect(fetcher.mock.calls[1][1].headers['If-None-Match']).toBe('"one"');
  });

  it.each([401, 403])('types authentication and scope errors for HTTP %i', async status => {
    const { adapter } = setup(jest.fn().mockResolvedValue(response({}, status)));
    await expect(adapter.getPull(repo, 4)).rejects.toMatchObject({
      code: status === 401 ? 'authentication' : 'permission',
    });
  });

  it('defers on rate limit with Retry-After', async () => {
    const { adapter } = setup(jest.fn().mockResolvedValue(response({}, 429, { 'retry-after': '2' })));
    await expect(adapter.getPull(repo, 4)).rejects.toMatchObject({ code: 'rate-limit', retryAt: expect.any(Date) });
  });

  it('rejects malformed JSON instead of returning empty results', async () => {
    const { adapter } = setup(jest.fn().mockResolvedValue(new Response('{broken', { status: 200 })));
    await expect(adapter.listOpenPulls(repo)).rejects.toMatchObject({ code: 'malformed-response' });
  });

  it('reads only bot-authored issue comments', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(response([
      { id: 1, body: 'ours', user: { login: 'bot' }, created_at: '2026-01-01T00:00:00Z' },
      { id: 2, body: 'other', user: { login: 'person' }, created_at: '2026-01-01T00:00:00Z' },
    ])).mockResolvedValueOnce(response({ login: 'bot' }));
    const { adapter } = setup(fetcher);
    expect((await adapter.listOwnIssueComments(repo, 4)).items.map(x => x.id)).toEqual([1]);
  });

  it('reads each comment page one time and attaches the bot replies to their thread', async () => {
    const comment = (id: number, login: string, extra: object = {}) => ({ id, pull_request_review_id: 9, path: 'src/a.ts', line: 3,
      original_line: 3, body: `body-${id}`, user: { login }, ...extra });
    const fetcher = jest.fn().mockResolvedValueOnce(response({ login: 'bot' }))
      .mockResolvedValueOnce(response([comment(1, 'bot'), comment(2, 'person', { in_reply_to_id: 1 })], 200, {
        link: '<https://api.github.com/repos/Hive-Academy/PtahCode/pulls/4/comments?page=2>; rel="next"' }))
      .mockResolvedValueOnce(response([comment(3, 'bot', { in_reply_to_id: 1 }), comment(4, 'person')]));
    const { adapter } = setup(fetcher);
    expect(await adapter.listFindingThreads(repo, 4)).toEqual({ complete: true,
      threads: [{ id: '1', path: 'src/a.ts', line: 3, body: 'body-1', resolved: false, replies: ['body-3'] }] });
    const urls = fetcher.mock.calls.map(call => String(call[0]));
    expect(urls.filter(url => url.includes('/comments?'))).toHaveLength(2);
    expect(urls.some(url => url.includes('/reviews'))).toBe(false);
  });

  it('reports an incomplete finding thread scan at the page limit', async () => {
    const fetcher = jest.fn(async (url: string) => String(url).endsWith('/user') ? response({ login: 'bot' })
      : response([], 200, { link: '<https://api.github.com/repos/Hive-Academy/PtahCode/pulls/4/comments?page=2>; rel="next"' }));
    const { adapter } = setup(fetcher as typeof fetch);
    expect(await adapter.listFindingThreads(repo, 4)).toEqual({ threads: [], complete: false });
    expect(fetcher).toHaveBeenCalledTimes(11);
  });

  it('reads diff and file metadata and marks omitted patches truncated', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(response(pull))
      .mockResolvedValueOnce(new Response('diff --git a/x b/x', { status: 200 }))
      .mockResolvedValueOnce(response([{ filename: 'x', status: 'modified', additions: 1, deletions: 1, changes: 2 }]));
    const { adapter } = setup(fetcher);
    expect(await adapter.getDiff(repo, 4, sha)).toMatchObject({ headSha: sha, baseSha: base, truncated: true });
  });

  it('does not mark binary files or pure renames without a patch truncated', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(response(pull))
      .mockResolvedValueOnce(new Response('diff --git a/x b/x', { status: 200 }))
      .mockResolvedValueOnce(response([
        { filename: 'logo.png', status: 'modified', additions: 0, deletions: 0, changes: 0 },
        { filename: 'src/moved.ts', previous_filename: 'src/old.ts', status: 'renamed', additions: 0, deletions: 0, changes: 0 }]));
    const { adapter } = setup(fetcher);
    expect(await adapter.getDiff(repo, 4, sha)).toMatchObject({ truncated: false });
  });

  describe('diff above the GitHub line limit', () => {
    const tooLarge = () => response({ message: 'Sorry, the diff exceeded the maximum number of lines (20000)',
      errors: [{ resource: 'PullRequest', field: 'diff', code: 'too_large' }], status: '406' }, 406);
    const file = (filename: string, extra: object = {}) => ({ filename, status: 'modified', additions: 1, deletions: 1, changes: 2,
      patch: '@@ -1 +1 @@\n-old\n+new', ...extra });
    const next = (page: number) => ({ link: `<https://api.github.com/repos/Hive-Academy/PtahCode/pulls/4/files?per_page=100&page=${page}>; rel="next"` });

    it('assembles the patch from every files page with git headers', async () => {
      const fetcher = jest.fn().mockResolvedValueOnce(response(pull)).mockResolvedValueOnce(tooLarge())
        .mockResolvedValueOnce(response([file('src/a.ts'), file('src/new.ts', { status: 'added', patch: '@@ -0,0 +1 @@\n+x\n' })], 200, next(2)))
        .mockResolvedValueOnce(response([file('src/gone.ts', { status: 'removed', patch: '@@ -1 +0,0 @@\n-x' }),
          file('src/moved.ts', { status: 'renamed', previous_filename: 'src/old.ts' })]));
      const { adapter } = setup(fetcher);
      const diff = await adapter.getDiff(repo, 4, sha);
      expect(diff).toMatchObject({ headSha: sha, baseSha: base, truncated: false });
      expect(diff.patch).toBe([
        'diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1 +1 @@', '-old', '+new',
        'diff --git a/src/new.ts b/src/new.ts', '--- /dev/null', '+++ b/src/new.ts', '@@ -0,0 +1 @@', '+x',
        'diff --git a/src/gone.ts b/src/gone.ts', '--- a/src/gone.ts', '+++ /dev/null', '@@ -1 +0,0 @@', '-x',
        'diff --git a/src/old.ts b/src/moved.ts', 'rename from src/old.ts', 'rename to src/moved.ts', '--- a/src/old.ts', '+++ b/src/moved.ts',
        '@@ -1 +1 @@', '-old', '+new', ''].join('\n'));
      const urls = fetcher.mock.calls.map(call => String(call[0]));
      expect(urls.slice(2)).toEqual(['https://api.github.com/repos/Hive-Academy/PtahCode/pulls/4/files?per_page=100&page=1',
        'https://api.github.com/repos/Hive-Academy/PtahCode/pulls/4/files?per_page=100&page=2']);
    });

    it('marks the assembled patch truncated when a changed file has no patch', async () => {
      const fetcher = jest.fn().mockResolvedValueOnce(response(pull)).mockResolvedValueOnce(tooLarge())
        .mockResolvedValueOnce(response([file('src/a.ts'), file('big.sql', { patch: undefined, changes: 40000 })]));
      const { adapter } = setup(fetcher);
      const diff = await adapter.getDiff(repo, 4, sha);
      expect(diff.truncated).toBe(true);
      expect(diff.patch).toContain('diff --git a/big.sql b/big.sql');
    });

    it('keeps binary files and pure renames without a patch complete, with their headers', async () => {
      const fetcher = jest.fn().mockResolvedValueOnce(response(pull)).mockResolvedValueOnce(tooLarge())
        .mockResolvedValueOnce(response([file('src/a.ts'),
          file('logo.png', { patch: undefined, changes: 0, additions: 0, deletions: 0 }),
          file('src/moved.ts', { status: 'renamed', previous_filename: 'src/old.ts', patch: undefined, changes: 0, additions: 0, deletions: 0 })]));
      const { adapter } = setup(fetcher);
      const diff = await adapter.getDiff(repo, 4, sha);
      expect(diff.truncated).toBe(false);
      expect(diff.patch).toContain('diff --git a/logo.png b/logo.png\n--- a/logo.png\n+++ b/logo.png\n');
      expect(diff.patch).toContain(['diff --git a/src/old.ts b/src/moved.ts', 'rename from src/old.ts', 'rename to src/moved.ts',
        '--- a/src/old.ts', '+++ b/src/moved.ts', ''].join('\n'));
    });

    it('applies the size cap to UTF-8 bytes, not string length', async () => {
      // Each section is about 3M characters but 6 MB in UTF-8: two fit by length, only one by bytes.
      const wide = (name: string) => file(name, { patch: `@@ -1 +1 @@\n+${'é'.repeat(3_000_000)}` });
      const fetcher = jest.fn().mockResolvedValueOnce(response(pull)).mockResolvedValueOnce(tooLarge())
        .mockResolvedValueOnce(response([wide('src/a.ts')], 200, next(2)))
        .mockResolvedValueOnce(response([wide('src/b.ts')]));
      const { adapter } = setup(fetcher);
      const diff = await adapter.getDiff(repo, 4, sha);
      expect(diff.truncated).toBe(true);
      expect(diff.patch).toContain('diff --git a/src/a.ts b/src/a.ts');
      expect(diff.patch).not.toContain('src/b.ts');
    });

    it('stops at the files page cap and marks the patch truncated', async () => {
      let pulls = 0;
      const fetcher = jest.fn(async (url: string) => {
        const target = String(url);
        if (target.endsWith('/pulls/4')) return ++pulls === 1 ? response(pull) : tooLarge();
        const page = Number(new URL(target).searchParams.get('page'));
        return response([file(`src/${page}.ts`)], 200, next(page + 1));
      });
      const { adapter } = setup(fetcher as typeof fetch);
      const diff = await adapter.getDiff(repo, 4, sha);
      expect(diff.truncated).toBe(true);
      expect(fetcher.mock.calls.filter(call => String(call[0]).includes('/files?'))).toHaveLength(30);
      expect(diff.patch).toContain('diff --git a/src/30.ts b/src/30.ts');
      expect(diff.patch).not.toContain('src/31.ts');
    });

    it('fails as diff-too-large when no file has a usable patch', async () => {
      const fetcher = jest.fn().mockResolvedValueOnce(response(pull)).mockResolvedValueOnce(tooLarge())
        .mockResolvedValueOnce(response([file('big.sql', { patch: undefined })]));
      const { adapter } = setup(fetcher);
      await expect(adapter.getDiff(repo, 4, sha)).rejects.toMatchObject({
        code: 'diff-too-large', message: "Diff exceeds GitHub's 20,000-line limit" });
    });

    it('keeps the GitHub reason of another 406 and does not fall back', async () => {
      const fetcher = jest.fn().mockResolvedValueOnce(response(pull)).mockResolvedValueOnce(response({
        message: 'Unsupported media type, see https://docs.github.com/rest?token=abc', errors: [{ code: 'invalid' }] }, 406));
      const { adapter } = setup(fetcher);
      const error = await adapter.getDiff(repo, 4, sha).catch((caught: unknown) => caught);
      expect(error).toMatchObject({ code: 'http', status: 406, reasons: ['invalid'],
        message: 'GitHub returned HTTP 406: Unsupported media type, see [url]' });
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });

  it('carries the GitHub message of a 4xx response and its status', async () => {
    const { adapter } = setup(jest.fn().mockResolvedValue(response({ message: 'Not Found' }, 404)));
    await expect(adapter.getPull(repo, 4)).rejects.toMatchObject({ code: 'http', status: 404, message: 'GitHub returned HTTP 404: Not Found' });
  });

  it('retries transient 5xx GET responses', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(response({}, 503)).mockResolvedValueOnce(response(pull));
    const { adapter } = setup(fetcher);
    expect((await adapter.getPull(repo, 4)).number).toBe(4);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('times out and keeps the token out of errors and logs', async () => {
    const fetcher = jest.fn((_url: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('sensitive-token')));
    }));
    const { adapter, logger } = setup(fetcher);
    jest.useFakeTimers();
    try {
      const pending = adapter.getPull(repo, 4);
      const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' });
      await jest.advanceTimersByTimeAsync(15_000);
      await assertion;
      expect(JSON.stringify(logger)).not.toContain('sensitive-token');
    } finally { jest.useRealTimers(); }
  });

  it('disables P1 publication with a typed error', async () => {
    const { adapter } = setup(jest.fn());
    await expect(adapter.upsertWalkthrough(repo, 4, 'x')).rejects.toBeInstanceOf(GitHubReviewError);
    await expect(adapter.upsertWalkthrough(repo, 4, 'x')).rejects.toMatchObject({ code: 'publication-unavailable' });
  });
});

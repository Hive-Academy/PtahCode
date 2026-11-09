import type { ISecretStorage } from '@ptah-extension/platform-core';
import type {
  GitHubIssueComment,
  GitHubReview,
  IGitHubReviewPort,
  RepoIdentity,
} from '@ptah-extension/review-contracts';
import {
  GithubReviewPublicationAdapter,
  rightAnchorKey,
} from './github-review-publication.adapter';

const repo: RepoIdentity = { owner: 'Hive-Academy', name: 'PtahCode' };
const headSha = 'a'.repeat(40);
const target = { repo, number: 4, headSha };
const stamp = '2026-01-01T00:00:00Z';
const reply = (
  value: object,
  status = 200,
  headers: Record<string, string> = {},
) => new Response(JSON.stringify(value), { status, headers });
const issue = (id: number, body: string): GitHubIssueComment => ({
  id,
  body,
  authorLogin: 'ptah-bot',
  createdAt: stamp,
});

function setup() {
  const writes: { method: string; body: Record<string, unknown> }[] = [];
  const comments: GitHubIssueComment[] = [];
  const reviews: GitHubReview[] = [];
  const secrets = { get: jest.fn().mockResolvedValue('secret-canary') } as Pick<
    ISecretStorage,
    'get'
  >;
  const guard = { mayPublish: jest.fn().mockResolvedValue(true) };
  const reader: IGitHubReviewPort = {
    listOpenPulls: jest.fn(),
    getDiff: jest.fn(),
    replyToFinding: jest.fn(),
    upsertWalkthrough: jest.fn(),
    createCommentReview: jest.fn(),
    getPull: jest
      .fn()
      .mockImplementation(async () => ({ state: 'open', headSha })),
    listOwnIssueComments: jest
      .fn()
      .mockImplementation(async () => ({
        items: comments,
        nextPage: null,
        etag: null,
        notModified: false,
      })),
    listOwnReviewsAndThreads: jest
      .fn()
      .mockImplementation(async () => ({
        items: reviews,
        nextPage: null,
        etag: null,
        notModified: false,
      })),
  };
  const fetcher = jest
    .fn()
    .mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      writes.push({ method: String(init.method), body });
      if (
        String(init.method) === 'PATCH' ||
        String(_url).includes('/issues/4/comments')
      ) {
        const id = 7;
        const posted = issue(id, String(body['body']));
        comments.splice(0, comments.length, posted);
        return reply({
          id,
          body: posted.body,
          user: { login: 'ptah-bot' },
          created_at: stamp,
        });
      }
      const review: GitHubReview = {
        id: 9,
        body: String(body['body']),
        submittedAt: stamp,
        threads: ((body['comments'] ?? []) as { body: string; path: string; line: number }[])
          .map((comment, index) => ({ id: String(index), path: comment.path, line: comment.line,
            body: comment.body, resolved: false })),
      };
      reviews.push(review);
      return reply({ id: 9, body: review.body, submitted_at: stamp });
    });
  const adapter = new GithubReviewPublicationAdapter(
    secrets as ISecretStorage,
    fetcher,
    reader,
    guard,
  );
  return { adapter, writes, comments, reviews, guard, reader, fetcher, secrets };
}

describe('GithubReviewPublicationAdapter', () => {
  it('rejects an escaped bot token before publishing', async () => {
    const env = setup();
    await expect(env.adapter.publish(target, 'secret\\-canary', 'Overview', [], new Set()))
      .rejects.toMatchObject({ code: 'publication-unavailable' });
    jest.mocked(env.secrets.get).mockResolvedValue('secret_name-canary');
    await expect(env.adapter.publish(target, 'secret\\_name\\-canary', 'Overview', [], new Set()))
      .rejects.toMatchObject({ code: 'publication-unavailable' });
    expect(env.writes).toHaveLength(0);
  });

  it('truncates a schema-sized inline finding and confirms its marker', async () => {
    const env = setup();
    const result = await env.adapter.publish(target, 'Walkthrough', 'Overview',
      [{ findingId: 'large', path: 'src/a.ts', line: 2,
        body: `### Major · Large finding\n\n**Impact:** broken\n\n${'x'.repeat(70_000)}` }],
      new Set([rightAnchorKey('src/a.ts', 2)]));
    const posted = (env.writes[1].body['comments'] as { body: string }[])[0].body;
    expect(posted).toContain('### Major · Large finding');
    expect(posted).toContain('**Impact:** broken');
    expect(posted).toContain('sections omitted');
    expect(posted).toContain('<!-- ptah-review:finding:large -->');
    expect(posted.length).toBeLessThanOrEqual(65_536);
    expect(result.publishedFindingIds).toContain('large');
  });
  it('bounds every outbound body and retains exact dedupe markers', async () => {
    const env = setup();
    await env.adapter.publish(target, `Walkthrough\n\n${'🐛'.repeat(20_000)}`,
      `Overview\n\n${'🐛'.repeat(20_000)}`,
      [{ findingId: 'root', path: 'src/a.ts', line: 2, body: `### Major\n\n**Impact:** broken\n\n${'🐛'.repeat(20_000)}` }],
      new Set([rightAnchorKey('src/a.ts', 2)]));
    const bodies = [String(env.writes[0].body['body']), String(env.writes[1].body['body']),
      ...((env.writes[1].body['comments'] as { body: string }[]).map(comment => comment.body))];
    expect(bodies.every(body => body.length <= 65_536)).toBe(true);
    expect(bodies[0]).toContain('<!-- ptah-review:walkthrough -->');
    expect(bodies[1]).toContain(`<!-- ptah-review:head:${headSha} -->`);
    expect(bodies[2]).toContain('<!-- ptah-review:finding:root -->');
  });
  it('posts an unposted finding even when a head review already exists', async () => {
    const env = setup();
    env.reviews.push({ id: 1, body: `Old overview\n<!-- ptah-review:head:${headSha} -->`, submittedAt: stamp, threads: [] });
    await env.adapter.publish(target, 'Walkthrough', 'Updated overview',
      [{ findingId: 'new-root', path: 'src/a.ts', line: 2, body: 'New verified finding' }],
      new Set([rightAnchorKey('src/a.ts', 2)]));
    expect(env.writes.filter(x => x.body['event'] === 'COMMENT')).toHaveLength(1);
    expect(JSON.stringify(env.writes[1].body)).toContain('ptah-review:finding:new-root');
  });
  it('upserts the walkthrough and creates one COMMENT review per head with ten RIGHT anchors', async () => {
    const env = setup();
    const candidates = Array.from({ length: 15 }, (_, i) => ({
      findingId: `root-${i}`,
      path: 'src/a.ts',
      line: i + 1,
      body: `Finding ${i}`,
    }));
    const anchors = new Set(
      candidates.map((x) => rightAnchorKey(x.path, x.line)),
    );
    const first = await env.adapter.publish(
      target,
      'Walkthrough',
      'Overview',
      candidates,
      anchors,
    );
    expect(first.deferred).toHaveLength(5);
    const reviewWrite = env.writes[1].body;
    expect(reviewWrite['event']).toBe('COMMENT');
    expect(reviewWrite['commit_id']).toBe(headSha);
    expect(reviewWrite['comments']).toHaveLength(10);
    expect(
      (reviewWrite['comments'] as { side: string }[]).every(
        (x) => x.side === 'RIGHT',
      ),
    ).toBe(true);
    expect(String(reviewWrite['body'])).toContain('Finding 14');
    expect(JSON.stringify(env.writes)).not.toContain('secret-canary');
    await env.adapter.publish(
      target,
      'Updated walkthrough',
      'Overview',
      candidates,
      anchors,
    );
    expect(env.writes.map((x) => x.method)).toEqual(['POST', 'POST', 'PATCH']);
    expect(env.guard.mayPublish).toHaveBeenCalledTimes(6);
    expect(env.reader.getPull).toHaveBeenCalledTimes(3);
  });

  it('moves invalid anchors to the review body and retries 422 with a fresh guard', async () => {
    const env = setup();
    const original = env.fetcher.getMockImplementation();
    let reviewCalls = 0;
    env.fetcher.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.includes('/reviews') && reviewCalls++ === 0)
        return reply({}, 422);
      return original?.(url, init);
    });
    await env.adapter.publish(
      target,
      'Walkthrough',
      'Overview',
      [
        {
          findingId: 'root',
          path: 'src/a.ts',
          line: 2,
          body: 'Verified finding',
        },
      ],
      new Set([rightAnchorKey('src/a.ts', 2)]),
    );
    expect(reviewCalls).toBe(2);
    expect(env.guard.mayPublish).toHaveBeenCalledTimes(6);
  });

  it('keeps fallback markers only with whole findings and retries omitted ids', async () => {
    const env = setup();
    const original = env.fetcher.getMockImplementation();
    let reviewCalls = 0;
    env.fetcher.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.includes('/reviews') && reviewCalls++ === 0) return reply({}, 422);
      return original?.(url, init);
    });
    const candidates = [
      { findingId: 'kept', path: 'src/a.ts', line: 2, body: 'Short finding' },
      { findingId: 'omitted', path: 'src/a.ts', line: 3, body: 'Huge finding ' + 'x'.repeat(65_480) },
    ];
    const anchors = new Set(candidates.map(x => rightAnchorKey(x.path, x.line)));
    const first = await env.adapter.publish(target, 'Walkthrough', 'Overview', candidates, anchors);
    const fallback = String(env.writes[1].body['body']);
    expect(fallback).toContain('Short finding\n<!-- ptah-review:finding:kept -->');
    expect(fallback).not.toContain('ptah-review:finding:omitted');
    expect(first.publishedFindingIds).toEqual(['kept']);
    const second = await env.adapter.publish(target, 'Walkthrough', 'Overview', candidates, anchors);
    expect(second.publishedFindingIds).toContain('omitted');
    expect(second.publishedFindingIds).not.toContain('kept');
  });

  it('truncates an oversized finding in a 422 body fallback', async () => {
    const env = setup();
    const original = env.fetcher.getMockImplementation();
    let reviewCalls = 0;
    env.fetcher.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.includes('/reviews') && reviewCalls++ === 0) return reply({}, 422);
      return original?.(url, init);
    });
    const result = await env.adapter.publish(target, 'Walkthrough', 'Overview',
      [{ findingId: 'large-fallback', path: 'src/a.ts', line: 2,
        body: `### Finding\n\n**Impact:** broken\n\n${'x'.repeat(70_000)}` }],
      new Set([rightAnchorKey('src/a.ts', 2)]));
    const body = String(env.writes[1].body['body']);
    expect(body).toContain('**Impact:** broken');
    expect(body).toContain('sections omitted');
    expect(body).toContain('<!-- ptah-review:finding:large-fallback -->');
    expect(result.publishedFindingIds).toContain('large-fallback');
    expect(body.length).toBeLessThanOrEqual(65_536);
  });

  it('blocks a mutation when the head or pause switch changes', async () => {
    const env = setup();
    env.guard.mayPublish.mockResolvedValue(false);
    await expect(
      env.adapter.publish(target, 'Walkthrough', 'Overview', [], new Set()),
    ).rejects.toMatchObject({ code: 'publication-unavailable' });
    expect(env.fetcher).not.toHaveBeenCalled();
    env.guard.mayPublish.mockResolvedValue(true);
    (env.reader.getPull as jest.Mock).mockResolvedValue({
      state: 'open',
      headSha: 'b'.repeat(40),
    });
    await expect(
      env.adapter.publish(target, 'Walkthrough', 'Overview', [], new Set()),
    ).rejects.toMatchObject({ code: 'publication-unavailable' });
    expect(env.fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'authentication'],
    [403, 'permission'],
    [429, 'rate-limit'],
  ])('types write failures for HTTP %i', async (status, code) => {
    const env = setup();
    env.fetcher.mockResolvedValue(reply({}, status));
    await expect(
      env.adapter.publish(target, 'Walkthrough', 'Overview', [], new Set()),
    ).rejects.toMatchObject({ code });
  });
});

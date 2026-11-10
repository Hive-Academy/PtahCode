import type { ISecretStorage } from '@ptah-extension/platform-core';
import type { ReviewStatusTarget } from '@ptah-extension/review-contracts';
import { GithubReviewStatusAdapter } from './github-review-status.adapter';

const target: ReviewStatusTarget = { repo: { owner: 'owner', name: 'repo' }, prNumber: 4,
  headSha: 'a'.repeat(40), attemptId: 'attempt-1', machineId: 'machine-1' };
const context = 'PtahCode Review';

describe('GithubReviewStatusAdapter', () => {
  const secrets = { get: jest.fn().mockResolvedValue('private-token') } as Pick<ISecretStorage, 'get'>;

  it('finds its own attempt among commit statuses', async () => {
    const fetcher = jest.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: 1, context: 'foreign', state: 'pending', description: 'other' },
      { id: 2, context, state: 'success', description: 'done' },
    ])));
    const adapter = new GithubReviewStatusAdapter(secrets as ISecretStorage, fetcher);
    expect(await adapter.findOwnStatus(target)).toEqual({ target, provider: 'commit_status', externalId: '2' });
    expect(String(fetcher.mock.calls[0][0])).toContain(`/statuses/${target.headSha}`);
  });

  it('posts live progress with a stable context and no summary body', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(new Response('[]')).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 3, context, state: 'pending', description: 'Reviewing (2/4 lenses)' })));
    const adapter = new GithubReviewStatusAdapter(secrets as ISecretStorage, fetcher);
    const receipt = await adapter.upsertStatus({ target, state: 'in_progress', description: 'Reviewing', summary: 'private summary',
      progress: { completedLenses: 2, totalLenses: 4, stage: 'lenses' } });
    expect(receipt.externalId).toBe('3');
    const payload = JSON.parse(String(fetcher.mock.calls[1][1].body));
    expect(payload).toEqual({ state: 'pending', context, description: 'Reviewing' });
  });

  it('maps completed failure and rejects an unrelated receipt', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify([
      { id: 2, context, state: 'pending', description: 'Reviewing' },
    ]))).mockResolvedValueOnce(new Response(JSON.stringify({ id: 4, context, state: 'failure', description: 'Major finding' })));
    const adapter = new GithubReviewStatusAdapter(secrets as ISecretStorage, fetcher);
    const receipt = { target, provider: 'commit_status' as const, externalId: '2' };
    await adapter.upsertStatus({ target, state: 'completed', conclusion: 'failure', description: 'Major finding', summary: '' }, receipt);
    expect(JSON.parse(String(fetcher.mock.calls[1][1].body)).state).toBe('failure');
    await expect(adapter.upsertStatus({ target, state: 'queued', description: 'Queued', summary: '' },
      { ...receipt, externalId: '2', target: { ...target, attemptId: 'other' } })).rejects.toMatchObject({ code: 'malformed-response' });
  });

  it('reuses a remotely completed status after an uncertain POST', async () => {
    const fetcher = jest.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: 9, context, state: 'success', description: 'Review complete' },
    ])));
    const adapter = new GithubReviewStatusAdapter(secrets as ISecretStorage, fetcher);
    const receipt = await adapter.upsertStatus({ target, state: 'completed', conclusion: 'success',
      description: 'Review complete', summary: '' });
    expect(receipt.externalId).toBe('9');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1].method).toBe('GET');
  });

  it.each([
    [401, {}, 'authentication'],
    [403, {}, 'permission'],
    [403, { 'x-ratelimit-remaining': '0' }, 'rate-limit'],
    [429, {}, 'rate-limit'],
    [503, {}, 'http'],
  ])('classifies HTTP %i with headers %p as %s', async (status, headers, code) => {
    const fetcher = jest.fn().mockResolvedValue(new Response('', { status, headers }));
    const adapter = new GithubReviewStatusAdapter(secrets as ISecretStorage, fetcher);
    await expect(adapter.findOwnStatus(target)).rejects.toMatchObject({ code });
  });

  it('rejects malformed JSON and bounds the posted description', async () => {
    const malformed = new GithubReviewStatusAdapter(secrets as ISecretStorage,
      jest.fn().mockResolvedValue(new Response('{invalid')));
    await expect(malformed.findOwnStatus(target)).rejects.toMatchObject({ code: 'malformed-response' });
    const fetcher = jest.fn().mockResolvedValueOnce(new Response('[]')).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 5, context, state: 'success', description: 'ok' })));
    const adapter = new GithubReviewStatusAdapter(secrets as ISecretStorage, fetcher);
    await adapter.upsertStatus({ target, state: 'completed', conclusion: 'success', description: 'a'.repeat(140), summary: '' });
    expect(JSON.parse(String(fetcher.mock.calls[1][1].body)).description).toHaveLength(140);
  });

  it('times out an unresponsive GitHub request', async () => {
    jest.useFakeTimers();
    try {
      const fetcher: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
      const adapter = new GithubReviewStatusAdapter(secrets as ISecretStorage, fetcher);
      const result = expect(adapter.findOwnStatus(target)).rejects.toMatchObject({ code: 'timeout' });
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(15_000);
      await result;
    } finally { jest.useRealTimers(); }
  });
});

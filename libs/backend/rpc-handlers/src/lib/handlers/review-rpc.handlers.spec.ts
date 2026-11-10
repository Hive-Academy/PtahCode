import 'reflect-metadata';
import type { RpcHandler, Logger } from '@ptah-extension/vscode-core';
import type {
  IReviewArtifactReader,
  IReviewQueryRepository,
  IReviewSecretPresence,
  IReviewSettingsStore,
  ReviewQueueService,
  ReviewOrchestratorService,
} from '@ptah-extension/review-core';
import type { IGitHubReviewPort } from '@ptah-extension/review-contracts';
import { publishedFindingTitle, ReviewPollDisabledError, ReviewRepositoryUnavailableError } from '@ptah-extension/review-core';
import { GitHubReviewError, type IGitHubFindingReplyPort, type IGitHubFindingThreadPort } from '@ptah-extension/review-github';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  ReviewPolicyService,
  type ReviewStageEnvironment,
} from '@ptah-extension/review-core';
import type { ISecretStorage, IWorkspaceProvider } from '@ptah-extension/platform-core';
import { ReviewRpcHandlers } from './review-rpc.handlers';

const settings = {
  repositories: [
    {
      owner: 'Hive-Academy',
      name: 'PtahCode',
      enabled: true,
      dryRun: true,
      publicationPaused: false,
    },
  ],
  maintainerLogins: ['maintainer'],
  pollMinutes: 30,
  globalPublicationPaused: true,
  laneCapPerPr: 6,
  confidenceFloor: 0.8,
  maxNewInline: 10,
  fallbackFamilies: [],
} as const;

const publishedFinding = {
  findingId: 'finding-1', path: 'src/save.ts', line: 3, title: 'Lost update in save.ts (retry-path)',
  publishedTitle: publishedFindingTitle('Lost update in save.ts (retry-path)', []),
};

function suite() {
  const rpc = { registerMethod: jest.fn() } as Pick<
    RpcHandler,
    'registerMethod'
  >;
  const logger = { info: jest.fn() } as Pick<Logger, 'info'>;
  const query = {
    listRuns: jest.fn().mockResolvedValue({ runs: [], nextCursor: null }),
    getRun: jest.fn().mockResolvedValue(null),
    listFindings: jest.fn().mockResolvedValue([]),
    listPublishedTitles: jest.fn().mockResolvedValue([publishedFinding]),
  } as IReviewQueryRepository;
  const store = {
    getSettings: jest.fn().mockResolvedValue(settings),
    updateSettings: jest.fn().mockResolvedValue(settings),
    listRepositories: jest.fn().mockResolvedValue(settings.repositories),
    setPublicationPause: jest.fn().mockResolvedValue(undefined),
    getLiveGate: jest.fn().mockResolvedValue(null),
    setLiveGate: jest.fn().mockResolvedValue(undefined),
  } as IReviewSettingsStore;
  const artifacts = { exportRun: jest.fn() } as IReviewArtifactReader;
  const secrets = {
    hasToken: jest.fn().mockResolvedValue(true),
  } as IReviewSecretPresence;
  const queue = { retry: jest.fn() } as Pick<ReviewQueueService, 'retry'>;
  const orchestrator = { pollAndRecord: jest.fn() } as Pick<
    ReviewOrchestratorService,
    'pollAndRecord'
  >;
  const github = { getPull: jest.fn() } as Pick<IGitHubReviewPort, 'getPull'>;
  const threads = { listFindingThreads: jest.fn() } as IGitHubFindingThreadPort;
  const replies = { replyToFinding: jest.fn() } as IGitHubFindingReplyPort;
  const workspace = { getWorkspaceFolders: jest.fn().mockReturnValue([]) } as Pick<IWorkspaceProvider, 'getWorkspaceFolders'>;
  const tokenStorage = {
    get: jest.fn().mockResolvedValue(undefined),
    store: jest.fn(),
    delete: jest.fn(),
  } as Pick<ISecretStorage, 'get' | 'store' | 'delete'>;
  const fetcher = jest.fn() as typeof fetch;
  const environment = {
    baseConfig: jest.fn().mockResolvedValue(null),
    resolve: jest.fn().mockRejectedValue(new ReviewRepositoryUnavailableError()),
  } as Pick<ReviewStageEnvironment, 'baseConfig' | 'resolve' | 'redactionSecrets' | 'checkoutRoot'>;
  new ReviewRpcHandlers(
    logger,
    rpc,
    query,
    store,
    artifacts,
    secrets,
    queue,
    orchestrator,
    github,
    tokenStorage as ISecretStorage,
    fetcher,
    new ReviewPolicyService(),
    environment as ReviewStageEnvironment,
    replies,
    workspace,
    threads,
  ).register();
  const calls = (rpc.registerMethod as jest.Mock).mock.calls as Array<
    [string, (params: unknown) => Promise<unknown>]
  >;
  const invoke = (name: string, params: unknown): Promise<unknown> => {
    const handler = calls.find(([method]) => method === name)?.[1];
    if (!handler) throw new Error(`Missing ${name}`);
    return handler(params);
  };
  return {
    invoke,
    calls,
    logger,
    query,
    store,
    artifacts,
    secrets,
    queue,
    github,
    threads,
    replies,
    workspace,
    environment,
    orchestrator,
    tokenStorage,
    fetcher,
  };
}

describe('ReviewRpcHandlers', () => {
  const finding = { attemptId: 'attempt-1', path: 'src/save.ts', line: 3, title: 'Lost update in save.ts (retry-path)' };
  const run = { repo: { owner: 'Hive-Academy', name: 'PtahCode' }, prNumber: 42, headSha: 'a'.repeat(40) };
  const thread = { id: 'thread-1', path: finding.path, line: finding.line, resolved: false, replies: [] as string[], body: '### 🟠 Major · Lost update in save\\.ts \\(retry\\-path\\)\n**Impact:** Data loss\n\n<!-- ptah-review:finding:finding-1 -->' };

  it.each([
    ['accept', undefined, '<!-- ptah-review-triage:accepted -->\nAccepted by the operator.'],
    ['dismiss', 'reason', '<!-- ptah-review-triage:dismissed -->\nDismissed by the operator.\n\nreason'],
    ['reply', 'a reply', 'a reply'],
  ])('posts %s to the matching thread', async (action, body, expected) => {
    const { invoke, query, threads, replies } = suite();
    (query.getRun as jest.Mock).mockResolvedValue(run);
    (threads.listFindingThreads as jest.Mock).mockResolvedValue({ threads: [thread], complete: true });
    expect(await invoke('review:respondToFinding', { ...finding, action, body })).toEqual({ ok: true, threadId: 'thread-1' });
    expect(replies.replyToFinding).toHaveBeenCalledWith({ repo: run.repo, number: 42, headSha: run.headSha }, 'thread-1', expected);
  });

  it('narrows multiple matching threads by title and reads the comments one time', async () => {
    const { invoke, query, threads } = suite();
    (query.getRun as jest.Mock).mockResolvedValue(run);
    (threads.listFindingThreads as jest.Mock)
      .mockResolvedValue({ threads: [{ ...thread, id: 'old', body: '### Other finding', resolved: true }, thread], complete: true });
    expect(await invoke('review:respondToFinding', { ...finding, action: 'accept' })).toEqual({ ok: true, threadId: 'thread-1' });
    expect(threads.listFindingThreads).toHaveBeenCalledTimes(1);
    expect(threads.listFindingThreads).toHaveBeenCalledWith(run.repo, 42);
  });

  it('does not guess when multiple threads remain ambiguous', async () => {
    const { invoke, query, threads, replies } = suite();
    (query.getRun as jest.Mock).mockResolvedValue(run);
    (threads.listFindingThreads as jest.Mock).mockResolvedValue({ threads: [thread, { ...thread, id: 'thread-2' }], complete: true });
    expect(await invoke('review:respondToFinding', { ...finding, action: 'accept' })).toEqual({
      ok: false, code: 'ambiguous-thread', error: 'Multiple GitHub threads match this finding',
    });
    expect(replies.replyToFinding).not.toHaveBeenCalled();
  });

  it('does not post to a path and line match that lacks the finding title', async () => {
    const { invoke, query, threads, replies } = suite();
    (query.getRun as jest.Mock).mockResolvedValue(run);
    (threads.listFindingThreads as jest.Mock).mockResolvedValue({ threads: [{ ...thread, body: `${thread.body.split('\n')[0]} again` }, { ...thread, id: 'thread-2', body: 'human note', resolved: true }], complete: true });
    expect(await invoke('review:respondToFinding', { ...finding, action: 'accept' })).toEqual({ ok: false, code: 'no-thread', error: 'No published GitHub thread for this finding' });
    expect(replies.replyToFinding).not.toHaveBeenCalled();
  });

  it('prefers the one unresolved thread among titled matches', async () => {
    const { invoke, query, threads } = suite();
    (query.getRun as jest.Mock).mockResolvedValue(run);
    (threads.listFindingThreads as jest.Mock).mockResolvedValue({ threads: [{ ...thread, id: 'old', resolved: true }, thread], complete: true });
    expect(await invoke('review:respondToFinding', { ...finding, action: 'accept' })).toEqual({ ok: true, threadId: 'thread-1' });
  });

  it('does not post when the comment scan is truncated', async () => {
    const { invoke, query, threads, replies } = suite();
    (query.getRun as jest.Mock).mockResolvedValue(run);
    (threads.listFindingThreads as jest.Mock).mockResolvedValue({ threads: [thread], complete: false });
    expect(await invoke('review:respondToFinding', { ...finding, action: 'accept' })).toEqual({
      ok: false, code: 'ambiguous-thread', error: 'Too many GitHub comments to identify the thread',
    });
    expect(threads.listFindingThreads).toHaveBeenCalledTimes(1);
    expect(replies.replyToFinding).not.toHaveBeenCalled();
  });

  it('reports an unpublished finding without posting', async () => {
    const { invoke, query, threads, replies } = suite();
    (query.getRun as jest.Mock).mockResolvedValue(run);
    (threads.listFindingThreads as jest.Mock).mockResolvedValue({ threads: [], complete: true });
    expect(await invoke('review:respondToFinding', { ...finding, action: 'accept' })).toEqual({ ok: false, code: 'no-thread', error: 'No published GitHub thread for this finding' });
    expect(replies.replyToFinding).not.toHaveBeenCalled();
  });

  it.each([
    ['accept', '<!-- ptah-review-triage:accepted -->\nAccepted by the operator.', 'accepted'],
    ['dismiss', '<!-- ptah-review-triage:accepted -->\nAccepted by the operator.', 'accepted'],
    ['accept', '<!-- ptah-review-triage:dismissed -->\nDismissed by the operator.\n\nreason', 'dismissed'],
  ])('does not post a second triage reply for %s when the thread has one', async (action, existing, triage) => {
    // The first call posted the reply, but its response did not reach the renderer. This is the retry.
    const { invoke, query, threads, replies } = suite();
    (query.getRun as jest.Mock).mockResolvedValue(run);
    (threads.listFindingThreads as jest.Mock).mockResolvedValue({ threads: [{ ...thread, replies: ['a note', existing] }], complete: true });
    expect(await invoke('review:respondToFinding', { ...finding, action })).toEqual({ ok: true, threadId: 'thread-1', triage });
    expect(replies.replyToFinding).not.toHaveBeenCalled();
  });

  it('posts a text reply to a thread that has a triage reply', async () => {
    const { invoke, query, threads, replies } = suite();
    (query.getRun as jest.Mock).mockResolvedValue(run);
    (threads.listFindingThreads as jest.Mock).mockResolvedValue({ threads: [{ ...thread, replies: ['<!-- ptah-review-triage:accepted -->\nAccepted by the operator.'] }], complete: true });
    expect(await invoke('review:respondToFinding', { ...finding, action: 'reply', body: 'more' })).toEqual({ ok: true, threadId: 'thread-1' });
    expect(replies.replyToFinding).toHaveBeenCalledTimes(1);
  });

  it('gives one result to two triage calls for the same finding that run at the same time', async () => {
    const { invoke, query, threads, replies } = suite();
    (query.getRun as jest.Mock).mockResolvedValue(run);
    (threads.listFindingThreads as jest.Mock).mockResolvedValue({ threads: [thread], complete: true });
    let release: () => void = () => undefined;
    (replies.replyToFinding as jest.Mock).mockReturnValue(new Promise<void>((resolve) => { release = resolve; }));
    const first = invoke('review:respondToFinding', { ...finding, action: 'accept' });
    // The renderer timed out and the operator selected Dismiss while the first post was not complete.
    const second = invoke('review:respondToFinding', { ...finding, action: 'dismiss' });
    await new Promise((resolve) => setImmediate(resolve));
    release();
    expect(await Promise.all([first, second])).toEqual([{ ok: true, threadId: 'thread-1' }, { ok: true, threadId: 'thread-1', triage: 'accepted' }]);
    expect(replies.replyToFinding).toHaveBeenCalledTimes(1);
    // The map entry is removed: a later call examines GitHub again.
    await invoke('review:respondToFinding', { ...finding, action: 'accept' });
    expect(threads.listFindingThreads).toHaveBeenCalledTimes(2);
  });

  it('reports a missing run without calling GitHub', async () => {
    const { invoke, threads } = suite();
    expect(await invoke('review:respondToFinding', { ...finding, action: 'accept' })).toEqual({ ok: false, code: 'run-not-found', error: 'Review run not found' });
    expect(threads.listFindingThreads).not.toHaveBeenCalled();
  });

  it('rejects a reply without a body', async () => {
    const { invoke, threads } = suite();
    await expect(invoke('review:respondToFinding', { ...finding, action: 'reply' })).rejects.toThrow('Invalid review request');
    expect(threads.listFindingThreads).not.toHaveBeenCalled();
  });

  it('sanitizes GitHub failures and logs an Error', async () => {
    const { invoke, query, threads, replies, logger } = suite();
    (query.getRun as jest.Mock).mockResolvedValue(run);
    (threads.listFindingThreads as jest.Mock).mockResolvedValue({ threads: [thread], complete: true });
    (replies.replyToFinding as jest.Mock).mockRejectedValue(new Error('ghp_secret'));
    expect(await invoke('review:respondToFinding', { ...finding, action: 'reply', body: 'hello' })).toEqual({ ok: false, code: 'github-error', error: 'GitHub rejected the reply' });
    const calls = (logger.info as jest.Mock).mock.calls;
    const logged = calls[calls.length - 1];
    expect(logged?.[1]).toBeInstanceOf(Error);
    expect(JSON.stringify(logged)).not.toContain('ghp_secret');
  });
  it('verifies a bot on a fresh install without adding a repository', async () => {
    const { invoke, store, tokenStorage, fetcher } = suite();
    (store.getSettings as jest.Mock).mockResolvedValue(null);
    (tokenStorage.get as jest.Mock).mockResolvedValue('secret');
    (fetcher as jest.Mock).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ login: 'ptah-bot' }),
      headers: { get: () => null },
    });
    expect(await invoke('review:getBotIdentity', {})).toMatchObject({
      login: 'ptah-bot',
    });
    expect(store.setLiveGate).not.toHaveBeenCalled();
  });

  it('verifies a saved OAuth bot with an empty maintainer allowlist', async () => {
    const { invoke, store, tokenStorage, fetcher } = suite();
    (store.getSettings as jest.Mock).mockResolvedValue({ ...settings, maintainerLogins: [] });
    (tokenStorage.get as jest.Mock).mockResolvedValue('gho_test_token');
    (fetcher as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ login: 'Ptah-Bot' }),
      headers: { get: () => 'repo' },
    });
    await expect(invoke('review:getBotIdentity', {})).resolves.toMatchObject({
      login: 'Ptah-Bot', scopes: ['repo'],
    });
    expect(store.setLiveGate).toHaveBeenCalledWith(expect.objectContaining({
      login: 'Ptah-Bot',
    }));
  });

  it.each([401, 403])('reports GitHub %i without exposing the bot token', async (status) => {
    const { invoke, tokenStorage, fetcher } = suite();
    (tokenStorage.get as jest.Mock).mockResolvedValue('gho_test_token');
    (fetcher as jest.Mock).mockResolvedValue({ ok: false, status });
    await expect(invoke('review:getBotIdentity', {})).rejects.toThrow('GitHub rejected the bot token');
  });

  it('reports a verification timeout safely', async () => {
    const { invoke, tokenStorage, fetcher } = suite();
    (tokenStorage.get as jest.Mock).mockResolvedValue('gho_test_token');
    (fetcher as jest.Mock).mockRejectedValue(Object.assign(new Error('secret'), { name: 'AbortError' }));
    await expect(invoke('review:getBotIdentity', {})).rejects.toThrow('GitHub bot verification timed out');
  });

  it('persists first live settings before recording attestation', async () => {
    const { invoke, store, tokenStorage, fetcher } = suite();
    const gate = {
      repo: { owner: 'Hive-Academy', name: 'PtahCode' },
      login: 'ptah-bot',
      connectedAt: '2026-11-04T00:00:00.000Z',
      verifiedAt: '2026-11-04T00:00:00.000Z',
      attestation: null,
    };
    (store.getSettings as jest.Mock).mockResolvedValue(null);
    (store.getLiveGate as jest.Mock).mockResolvedValue(gate);
    (tokenStorage.get as jest.Mock).mockResolvedValue('secret');
    (fetcher as jest.Mock).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ login: 'ptah-bot' }),
    });
    const live = {
      ...settings,
      globalPublicationPaused: false,
      repositories: [{ ...settings.repositories[0], dryRun: false }],
    };
    await invoke('review:updateSettings', {
      settings: live,
      attestation: {
        who: 'maintainer',
        permissions: [
          'Pull requests: Read and write',
          'Contents: Read',
          'Metadata: Read',
        ],
      },
    });
    expect(
      (store.updateSettings as jest.Mock).mock.invocationCallOrder[0],
    ).toBeLessThan(
      (store.setLiveGate as jest.Mock).mock.invocationCallOrder[0],
    );
    expect(store.setLiveGate).toHaveBeenCalledWith(
      expect.objectContaining({
        attestation: expect.objectContaining({ who: 'maintainer' }),
      }),
    );
  });
  it('creates a gate on first live enable and rebinds it for a new repository', async () => {
    const { invoke, store, tokenStorage, fetcher } = suite();
    (store.getSettings as jest.Mock).mockResolvedValue(null);
    (tokenStorage.get as jest.Mock).mockResolvedValue('token');
    (fetcher as jest.Mock).mockResolvedValue({ ok: true, text: async () => JSON.stringify({ login: 'review-bot' }) });
    const attestation = { who: 'maintainer', permissions: ['Pull requests: Read and write', 'Contents: Read', 'Metadata: Read'] };
    const first = { ...settings, repositories: [{ ...settings.repositories[0], dryRun: false }], globalPublicationPaused: false };
    await invoke('review:updateSettings', { settings: first, attestation });
    expect(store.setLiveGate).toHaveBeenCalledWith(expect.objectContaining({
      repo: { owner: 'Hive-Academy', name: 'PtahCode' },
      attestation: expect.objectContaining({ who: 'maintainer' }),
    }));
    const oldGate = (store.setLiveGate as jest.Mock).mock.calls[0][0];
    (store.getLiveGate as jest.Mock).mockResolvedValue(oldGate);
    const second = { ...first, repositories: [
      { ...first.repositories[0], dryRun: true },
      { owner: 'Other', name: 'Review', enabled: true, dryRun: false, publicationPaused: false },
    ] };
    await expect(invoke('review:updateSettings', { settings: second })).rejects.toThrow(
      'Permission attestation required for this repository',
    );
    await invoke('review:updateSettings', { settings: second, attestation });
    expect(store.setLiveGate).toHaveBeenLastCalledWith(expect.objectContaining({
      repo: { owner: 'Other', name: 'Review' },
    }));
  });
  it('reports a missing local checkout for the requested repository', async () => {
    const { invoke, orchestrator } = suite();
    (orchestrator.pollAndRecord as jest.Mock).mockRejectedValue(new ReviewRepositoryUnavailableError());
    await expect(invoke('review:refresh', { repo: { owner: 'Hive-Academy', name: 'PtahCode' } }))
      .resolves.toEqual({ ok: true });
  });

  it('clears a failed poll after successful Refresh', async () => {
    const { invoke, orchestrator } = suite();
    (orchestrator.pollAndRecord as jest.Mock)
      .mockRejectedValueOnce(new Error('secret remote error'))
      .mockResolvedValueOnce(0);
    const params = { repo: { owner: 'Hive-Academy', name: 'PtahCode' } };
    await expect(invoke('review:refresh', params)).resolves.toEqual({ ok: true });
    await Promise.resolve();
    expect(await invoke('review:refresh', params)).toEqual({ ok: true });
    expect(orchestrator.pollAndRecord).toHaveBeenCalledWith(params.repo);
  });

  it('rejects manual Refresh while disabled without changing poll state', async () => {
    const { invoke, orchestrator } = suite();
    (orchestrator.pollAndRecord as jest.Mock).mockRejectedValue(
      new ReviewPollDisabledError(),
    );
    await expect(
      invoke('review:refresh', {
        repo: { owner: 'Hive-Academy', name: 'PtahCode' },
      }),
    ).resolves.toEqual({ ok: true });
    expect(orchestrator.pollAndRecord).toHaveBeenCalledTimes(1);
  });
  it('returns the queued manual attempt id', async () => {
    const { invoke, github, queue } = suite();
    (github.getPull as jest.Mock).mockResolvedValue({
      headSha: 'a'.repeat(40),
    });
    const result = await invoke('review:retryHead', {
      repo: { owner: 'Hive-Academy', name: 'PtahCode' },
      prNumber: 1,
    });
    expect(result).toEqual({ ok: true, attemptId: expect.any(String) });
    expect(queue.retry).toHaveBeenCalledWith(
      expect.objectContaining({ headSha: 'a'.repeat(40) }),
      (result as { attemptId: string }).attemptId,
      true,
    );
  });
  it('uses current live settings for manual retry and fails closed when settings are missing', async () => {
    const { invoke, github, queue, store } = suite();
    (github.getPull as jest.Mock).mockResolvedValue({ headSha: 'a'.repeat(40) });
    (store.getSettings as jest.Mock).mockResolvedValueOnce({ ...settings, repositories: [{ ...settings.repositories[0], dryRun: false }] })
      .mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('settings unavailable'));
    await invoke('review:retryHead', { repo: { owner: 'Hive-Academy', name: 'PtahCode' }, prNumber: 1 });
    await invoke('review:retryHead', { repo: { owner: 'Hive-Academy', name: 'PtahCode' }, prNumber: 1 });
    await invoke('review:retryHead', { repo: { owner: 'Hive-Academy', name: 'PtahCode' }, prNumber: 1 });
    expect((queue.retry as jest.Mock).mock.calls.map((call: unknown[]) => call[2])).toEqual([false, true, true]);
  });
  it('registers exactly the review methods', () => {
    const { calls } = suite();
    expect(calls.map(([name]) => name)).toEqual([...ReviewRpcHandlers.METHODS]);
  });
  it('refuses live settings without a verified identity and attestation', async () => {
    const { invoke, store, tokenStorage, fetcher } = suite();
    const liveSettings = {
      settings: {
        ...settings,
        globalPublicationPaused: false,
        repositories: [{ ...settings.repositories[0], dryRun: false }],
      },
    };
    await expect(invoke('review:updateSettings', liveSettings)).rejects.toThrow(
      'Connect a bot token before enabling live publication',
    );
    (tokenStorage.get as jest.Mock).mockResolvedValue('token');
    (fetcher as jest.Mock).mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ login: 'review-bot' }),
    });
    await expect(invoke('review:updateSettings', liveSettings)).rejects.toThrow(
      'attestation required',
    );
    expect(store.updateSettings).not.toHaveBeenCalled();
  });

  it('clears the live gate when the token changes', async () => {
    const { invoke, store } = suite();
    await invoke('review:setBotToken', { token: 'new-secret' });
    expect(store.setLiveGate).toHaveBeenCalledWith(null);
    await invoke('review:clearBotToken', {});
    expect(store.setLiveGate).toHaveBeenCalledTimes(2);
  });

  it.each(ReviewRpcHandlers.METHODS)(
    '%s rejects invalid params at the boundary',
    async (method) => {
      const { invoke } = suite();
      await expect(invoke(method, { unexpected: 'secret' })).rejects.toThrow(
        'Invalid review request',
      );
    },
  );

  it('stores and removes a bot token without echoing it', async () => {
    const { invoke, tokenStorage, logger } = suite();
    expect(await invoke('review:setBotToken', { token: 'ghp_secret' })).toEqual(
      { ok: true },
    );
    expect(tokenStorage.store).toHaveBeenCalledWith(
      'ptah.review.githubToken',
      'ghp_secret',
    );
    expect(await invoke('review:clearBotToken', {})).toEqual({ ok: true });
    expect(tokenStorage.delete).toHaveBeenCalledWith('ptah.review.githubToken');
    expect(JSON.stringify((logger.info as jest.Mock).mock.calls)).not.toContain(
      'ghp_secret',
    );
  });

  it('blocks live rerun while publication is paused and does not queue', async () => {
    const { invoke, query, github, queue } = suite();
    (query.getRun as jest.Mock).mockResolvedValue({
      attemptId: 'prior',
      repo: { owner: 'Hive-Academy', name: 'PtahCode' },
      prNumber: 1,
      headSha: 'a'.repeat(40),
    });
    (github.getPull as jest.Mock).mockResolvedValue({
      headSha: 'a'.repeat(40),
      baseSha: 'b'.repeat(40),
      state: 'open',
      draft: false,
      authorLogin: 'maintainer',
      headIsFork: false,
      headRepoId: 1,
      baseRepoId: 1,
    });
    await expect(
      invoke('review:rerun', { attemptId: 'prior', dryRun: false }),
    ).rejects.toThrow('unavailable');
    expect(queue.retry).not.toHaveBeenCalled();
  });

  it('never returns or logs a token and rejects one in settings updates', async () => {
    const { invoke, logger, store } = suite();
    const result = await invoke('review:getSettings', {});
    expect(result).toEqual({
      settings,
      hasToken: true,
      tokenStorage: 'encrypted',
    });
    expect(JSON.stringify(result)).not.toContain('ghp_secret');
    await expect(
      invoke('review:updateSettings', { settings, token: 'ghp_secret' }),
    ).rejects.toThrow('Invalid review request');
    expect(store.updateSettings).not.toHaveBeenCalled();
    expect(JSON.stringify((logger.info as jest.Mock).mock.calls)).not.toContain(
      'ghp_secret',
    );
  });

  it('returns unconfigured settings so the first save can proceed', async () => {
    const { invoke, store } = suite();
    (store.getSettings as jest.Mock).mockResolvedValue(null);
    expect(await invoke('review:getSettings', {})).toEqual({
      settings: null,
      hasToken: true,
      tokenStorage: 'encrypted',
    });
  });

  it('matches a title that publication redacts to its published heading', async () => {
    const { invoke, query, threads, replies } = suite();
    const stored = 'Token ghp_abcdefgh1234 leaks (retry-path)';
    // The renderer sends the listFindings form of the title. It is not the published form.
    const wire = 'Token [secret] leaks (retry-path)';
    const published = publishedFindingTitle(stored, []);
    expect(published).toBe('Token \\[redacted\\] leaks \\(retry\\-path\\)');
    (query.getRun as jest.Mock).mockResolvedValue(run);
    (query.listPublishedTitles as jest.Mock).mockResolvedValue([{ findingId: 'finding-1', path: finding.path, line: finding.line, title: wire, publishedTitle: published }]);
    (threads.listFindingThreads as jest.Mock).mockResolvedValue({ threads: [{ ...thread, body: `### 🟠 Major · ${published}\n**Impact:** Leak\n\n<!-- ptah-review:finding:finding-1 -->` }], complete: true });
    expect(await invoke('review:respondToFinding', { ...finding, title: wire, action: 'accept' })).toEqual({ ok: true, threadId: 'thread-1' });
    expect(replies.replyToFinding).toHaveBeenCalledTimes(1);
  });

  it('reports no thread when the attempt has no finding with the sent identity', async () => {
    const { invoke, query, threads, replies } = suite();
    (query.getRun as jest.Mock).mockResolvedValue(run);
    (query.listPublishedTitles as jest.Mock).mockResolvedValue([{ ...publishedFinding, line: 9 }]);
    expect(await invoke('review:respondToFinding', { ...finding, action: 'accept' })).toEqual({ ok: false, code: 'no-thread', error: 'No published GitHub thread for this finding' });
    expect(threads.listFindingThreads).not.toHaveBeenCalled();
    expect(replies.replyToFinding).not.toHaveBeenCalled();
  });

  it('does not post to a thread with the same heading that has the marker of a different finding', async () => {
    const { invoke, query, threads, replies } = suite();
    (query.getRun as jest.Mock).mockResolvedValue(run);
    (threads.listFindingThreads as jest.Mock).mockResolvedValue({ threads: [{ ...thread, body: thread.body.replace('finding-1', 'finding-0') }, { ...thread, id: 'bare', body: thread.body.split('\n\n<!--')[0] }], complete: true });
    expect(await invoke('review:respondToFinding', { ...finding, action: 'accept' })).toEqual({ ok: false, code: 'no-thread', error: 'No published GitHub thread for this finding' });
    expect(replies.replyToFinding).not.toHaveBeenCalled();
  });

  it('applies the publication redaction to the operator text of a reply', async () => {
    const { invoke, query, threads, replies } = suite();
    (query.getRun as jest.Mock).mockResolvedValue(run);
    (threads.listFindingThreads as jest.Mock).mockResolvedValue({ threads: [thread], complete: true });
    await invoke('review:respondToFinding', { ...finding, action: 'reply', body: 'see ghp_abcdefgh1234 here' });
    await invoke('review:respondToFinding', { ...finding, action: 'dismiss', body: 'key sk-abcdefgh1234' });
    const bodies = (replies.replyToFinding as jest.Mock).mock.calls.map((call: unknown[]) => call[2]);
    expect(bodies).toEqual(['see [redacted] here', '<!-- ptah-review-triage:dismissed -->\nDismissed by the operator.\n\nkey [redacted]']);
  });

  it('reports a refusal of the publication guard with its own code', async () => {
    const { invoke, query, threads, replies } = suite();
    (query.getRun as jest.Mock).mockResolvedValue(run);
    (threads.listFindingThreads as jest.Mock).mockResolvedValue({ threads: [thread], complete: true });
    (replies.replyToFinding as jest.Mock).mockRejectedValue(new GitHubReviewError('publication-unavailable', 'Publication is unavailable'));
    expect(await invoke('review:respondToFinding', { ...finding, action: 'accept' })).toEqual({
      ok: false, code: 'publication-unavailable',
      error: 'GitHub publication is paused or the pull request head changed. The reply was not posted.',
    });
  });

  it('gives the configured secrets to the findings query before the fields leave the host', async () => {
    const { invoke, query, environment } = suite();
    (query.getRun as jest.Mock).mockResolvedValue(run);
    environment.redactionSecrets = jest.fn().mockResolvedValue(['plain-configured-secret']);
    await invoke('review:listFindings', { attemptId: 'attempt-1' });
    expect(query.listFindings).toHaveBeenCalledWith('attempt-1', ['plain-configured-secret']);
  });

  it('returns the registered workspace folder of the reviewed repository with the findings', async () => {
    const { invoke, query, environment, workspace } = suite();
    const folder = tmpdir();
    (query.getRun as jest.Mock).mockResolvedValue(run);
    (environment.resolve as jest.Mock).mockResolvedValue({ repoRoot: realpathSync(folder), attemptsRoot: folder });
    (workspace.getWorkspaceFolders as jest.Mock).mockReturnValue(['Z:/ptah-missing-folder', folder]);
    expect(await invoke('review:listFindings', { attemptId: 'attempt-1' })).toEqual({ findings: [], repositoryRoot: folder });
    expect(environment.resolve).toHaveBeenCalledWith(run.repo);
  });

  it('returns the repository root of an old run after its repository is disabled', async () => {
    const { invoke, query, environment, workspace } = suite();
    const folder = tmpdir();
    (query.getRun as jest.Mock).mockResolvedValue(run);
    // resolve() refuses a disabled repository. checkoutRoot() does not examine the settings.
    (environment.resolve as jest.Mock).mockRejectedValue(new ReviewRepositoryUnavailableError());
    environment.checkoutRoot = jest.fn().mockResolvedValue(realpathSync(folder));
    (workspace.getWorkspaceFolders as jest.Mock).mockReturnValue([folder]);
    expect(await invoke('review:listFindings', { attemptId: 'attempt-1' })).toEqual({ findings: [], repositoryRoot: folder });
    expect(environment.checkoutRoot).toHaveBeenCalledWith(run.repo);
    expect(environment.resolve).not.toHaveBeenCalled();
  });

  it('returns a null repository root when the reviewed repository is not open', async () => {
    const { invoke, query, workspace } = suite();
    (query.getRun as jest.Mock).mockResolvedValue(run);
    (workspace.getWorkspaceFolders as jest.Mock).mockReturnValue([tmpdir()]);
    expect(await invoke('review:listFindings', { attemptId: 'attempt-1' })).toEqual({ findings: [], repositoryRoot: null });
  });

  it('treats an unknown attempt safely', async () => {
    const { invoke, artifacts } = suite();
    expect(await invoke('review:getRun', { attemptId: 'missing' })).toBeNull();
    expect(
      await invoke('review:listFindings', { attemptId: 'missing' }),
    ).toEqual({ findings: [] });
    await expect(
      invoke('review:exportRun', { attemptId: 'missing' }),
    ).rejects.toThrow('Review run not found');
    expect(artifacts.exportRun).not.toHaveBeenCalled();
  });
});

describe('review repository settings RPC', () => {
  it('rejects live publication without a bot token', async () => {
    const { invoke, secrets, store } = suite();
    (secrets.hasToken as jest.Mock).mockResolvedValue(false);
    const live = {
      ...settings,
      repositories: [{ ...settings.repositories[0], dryRun: false }],
    };
    await expect(
      invoke('review:updateSettings', { settings: live }),
    ).rejects.toThrow('Connect a bot token');
    expect(store.updateSettings).not.toHaveBeenCalled();
  });
});

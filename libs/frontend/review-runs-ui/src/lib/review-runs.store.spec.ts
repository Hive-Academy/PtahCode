import { TestBed } from '@angular/core/testing';
import { ClaudeRpcService, LoggingService } from '@ptah-extension/core';
import type { ReviewFinding, ReviewRun } from '@ptah-extension/review-contracts';
import { ReviewRunsStore } from './review-runs.store';

const run: ReviewRun = {
  repo: { owner: 'Hive-Academy', name: 'PtahCode' },
  prNumber: 428,
  headSha: 'a'.repeat(40),
  attemptId: 'rvw-428-01',
  trigger: 'poll',
  configHash: 'b'.repeat(40),
  status: 'queued',
  createdAt: '2026-11-03T10:00:00.000Z',
  startedAt: null,
  completedAt: null,
  deadlineAt: '2026-11-03T11:00:00.000Z',
  coverage: [],
  stages: [],
};

const finding: ReviewFinding = {
  schemaVersion: 1,
  lens: 'security-privacy',
  title: 'Settings parsed without a schema',
  failureMode: 'A crafted settings file can change runtime behavior.',
  affectedBehavior: 'The settings loader accepts arbitrary keys.',
  scenario: 'A workspace contains a crafted settings file.',
  path: 'src/settings.ts',
  line: 42,
  evidence: [
    { path: 'src/settings.ts', line: 42, excerpt: 'const parsed = JSON.parse(raw);' },
  ],
  affectedCaller: 'loadSettings',
  severity: 'Major',
  category: 'security',
  confidence: 0.9,
  verification: 'cross-family',
  suggestedDiff: null,
  fixPrompt: 'Validate the parsed settings against a schema.',
};

/** Lets the fire-and-forget run and findings loads of selectRun settle. */
const settle = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

/** A pending `review:listFindings` reply a test settles by hand. */
interface PendingFindingsReply {
  resolve: (response: { isSuccess: () => boolean; data: unknown }) => void;
  reject: (reason?: unknown) => void;
}

describe('ReviewRunsStore', () => {
  const call = jest.fn();
  let store: ReviewRunsStore;

  beforeEach(() => {
    call.mockReset();
    TestBed.configureTestingModule({
      providers: [
        ReviewRunsStore,
        { provide: ClaudeRpcService, useValue: { call } },
      ],
    });
    store = TestBed.inject(ReviewRunsStore);
  });

  it('loads parsed data, filters states, and retains cache when refresh fails', async () => {
    call.mockImplementation((method: string) =>
      Promise.resolve({
        isSuccess: () => true,
        data:
          method === 'review:listRepositories'
            ? [
                {
                  owner: 'Hive-Academy',
                  name: 'PtahCode',
                  enabled: true,
                  dryRun: true,
                  publicationPaused: false,
                },
              ]
            : {
                runs: [run],
                nextCursor: null,
                poll: {
                  status: 'failed',
                  error: 'github-poll-failed',
                  lastSuccessAt: null,
                  lastErrorAt: '2026-11-03T10:00:00.000Z',
                },
              },
      }),
    );
    await store.load();
    expect(store.state()).toBe('ready');
    expect(store.queuedCount()).toBe(1);
    expect(store.poll()?.status).toBe('failed');
    store.setStateFilter('failed');
    expect(store.filteredRuns()).toEqual([]);
    store.clearFilters();
    expect(store.filteredRuns()).toHaveLength(1);
    call.mockRejectedValue(new Error('offline'));
    await store.load();
    expect(store.state()).toBe('offline');
    expect(store.runs()).toEqual([run]);
    expect(store.poll()?.error).toBe('github-poll-failed');
  });

  it('shows initial failure and explicit no-lanes state without a clean result', async () => {
    call.mockRejectedValue(new Error('unavailable'));
    await store.load();
    expect(store.state()).toBe('error');
    store.setNoLanesAvailable();
    expect(store.state()).toBe('no-lanes');
  });

  it('polls before reloading review runs and exposes a failed poll', async () => {
    const repositories = [
      {
        owner: 'Hive-Academy',
        name: 'PtahCode',
        enabled: true,
        dryRun: true,
        publicationPaused: false,
      },
    ];
    const list = {
      runs: [run],
      nextCursor: null,
      poll: {
        status: 'succeeded',
        error: null,
        lastSuccessAt: null,
        lastErrorAt: null,
      },
    };
    let refreshed = false;
    call.mockImplementation((method: string) =>
      Promise.resolve({
        isSuccess: () => true,
        data:
          method === 'review:listRepositories'
            ? repositories
            : method === 'review:listRuns'
              ? { ...list, poll: { ...list.poll, lastSuccessAt: refreshed ? '2026-11-03T10:00:00.000Z' : null } }
              : (refreshed = true, { ok: true }),
      }),
    );
    await store.load();
    call.mockClear();
    await store.refresh();
    expect(call.mock.calls.map(([method]) => method)).toEqual([
      'review:listRepositories', 'review:listRuns', 'review:refresh',
      'review:listRepositories', 'review:listRuns', 'review:listRuns',
    ]);
    expect(call).toHaveBeenCalledWith('review:listRuns',
      { repo: { owner: 'Hive-Academy', name: 'PtahCode' }, limit: 1 }, expect.anything());
    expect(call).toHaveBeenCalledWith(
      'review:refresh',
      { repo: { owner: 'Hive-Academy', name: 'PtahCode' } },
      { timeout: 120_000 },
    );
    expect(store.state()).toBe('ready');

    call.mockClear();
    call.mockImplementation((method: string) => Promise.resolve({
      isSuccess: () => method !== 'review:refresh',
      data: method === 'review:listRepositories' ? repositories : method === 'review:listRuns' ? list : null,
    }));
    await store.refresh();
    expect(call.mock.calls.map(([method]) => method)).toEqual([
      'review:listRepositories', 'review:listRuns', 'review:refresh',
      'review:listRepositories', 'review:listRuns',
    ]);
    expect(store.state()).toBe('ready');
    expect(store.refreshError()).toBe(true);
    expect(store.runs()).toEqual([run]);
    expect(store.isRefreshing()).toBe(false);
  });

  it('reloads again when a non-blocking refresh poll completes', async () => {
    jest.useFakeTimers();
    let listCalls = 0;
    call.mockImplementation((method: string) => Promise.resolve({
      isSuccess: () => true,
      data: method === 'review:listRepositories'
        ? [{ owner: 'Hive-Academy', name: 'PtahCode', enabled: true, dryRun: true, publicationPaused: false }]
        : method === 'review:refresh' ? { ok: true } : {
          runs: ++listCalls >= 3 ? [run] : [], nextCursor: null,
          poll: { status: 'succeeded', error: null,
            lastSuccessAt: listCalls >= 3 ? '2026-11-03T10:00:00.000Z' : null, lastErrorAt: null },
        },
    }));
    try {
      await store.load();
      const refresh = store.refresh();
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(1_000);
      await refresh;
      expect(store.runs()).toEqual([run]);
      expect(listCalls).toBe(4);
    } finally { jest.useRealTimers(); }
  });

  it('loads repositories before refreshing when the store has no repository cache', async () => {
    const repository = { owner: 'Hive-Academy', name: 'PtahCode', enabled: true, dryRun: true, publicationPaused: false };
    let refreshed = false;
    call.mockImplementation((method: string) => {
      if (method === 'review:refresh') refreshed = true;
      return Promise.resolve({ isSuccess: () => true, data: method === 'review:listRepositories' ? [repository]
        : method === 'review:refresh' ? { ok: true } : { runs: [], nextCursor: null, poll: {
          status: 'succeeded', error: null, lastSuccessAt: refreshed ? '2026-11-05T00:00:00.000Z' : null, lastErrorAt: null } } });
    });
    await store.refresh();
    expect(call.mock.calls.map(([method]) => method)).toEqual([
      'review:listRepositories', 'review:listRuns', 'review:refresh',
      'review:listRepositories', 'review:listRuns', 'review:listRuns',
    ]);
    expect(store.repositories()).toEqual([repository]);
    expect(store.refreshError()).toBe(false);
  });

  it('tracks the selected repository when another repository has a stale failure', async () => {
    const repositories = [
      { owner: 'One', name: 'Alpha', enabled: true, dryRun: true, publicationPaused: false },
      { owner: 'Two', name: 'Beta', enabled: true, dryRun: true, publicationPaused: false },
    ];
    let refreshed = false;
    call.mockImplementation((method: string, params: { repo?: { owner: string } }) => {
      if (method === 'review:refresh') refreshed = true;
      const selected = params?.repo?.owner === 'Two';
      return Promise.resolve({ isSuccess: () => true, data: method === 'review:listRepositories' ? repositories
        : method === 'review:refresh' ? { ok: true } : { runs: [], nextCursor: null, poll: selected
          ? { status: 'succeeded', error: null, lastSuccessAt: refreshed ? '2026-11-05T00:00:00.000Z' : null, lastErrorAt: null }
          : { status: 'failed', error: 'old Alpha failure', lastSuccessAt: null, lastErrorAt: '2026-11-04T00:00:00.000Z' } } });
    });
    await store.load();
    store.setRepoFilter('Two/Beta');
    await store.refresh();
    expect(store.refreshError()).toBe(false);
    expect(call).toHaveBeenCalledWith('review:refresh', { repo: { owner: 'Two', name: 'Beta' } }, { timeout: 120_000 });
  });

  it('waits for every enabled repository when refreshing all', async () => {
    jest.useFakeTimers();
    const repositories = [
      { owner: 'One', name: 'Alpha', enabled: true, dryRun: true, publicationPaused: false },
      { owner: 'Two', name: 'Beta', enabled: true, dryRun: true, publicationPaused: false },
    ];
    let refreshes = 0;
    let betaFinished = false;
    call.mockImplementation((method: string, params: { repo?: { owner: string } }) => {
      if (method === 'review:refresh') refreshes++;
      const completed = params?.repo?.owner === 'One' ? refreshes > 0 : betaFinished;
      return Promise.resolve({ isSuccess: () => true, data: method === 'review:listRepositories' ? repositories
        : method === 'review:refresh' ? { ok: true } : { runs: [], nextCursor: null, poll: {
          status: 'succeeded', error: null, lastSuccessAt: completed ? '2026-11-05T00:00:00.000Z' : null, lastErrorAt: null } } });
    });
    try {
      await store.load();
      const pending = store.refresh();
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(50);
      expect(store.isRefreshing()).toBe(true);
      betaFinished = true;
      await jest.advanceTimersByTimeAsync(1_000);
      await pending;
      expect(refreshes).toBe(2);
      expect(store.refreshError()).toBe(false);
    } finally { jest.useRealTimers(); }
  });

  it('reloads after a timed-out Refresh and keeps the failed poll visible', async () => {
    const poll = {
      status: 'failed',
      error: 'github-poll-failed',
      lastSuccessAt: null,
      lastErrorAt: null,
    };
    call.mockImplementation((method: string) =>
      Promise.resolve({
        isSuccess: () => true,
        data:
          method === 'review:listRepositories'
            ? [{ owner: 'Hive-Academy', name: 'PtahCode', enabled: true, dryRun: true, publicationPaused: false }]
            : { runs: [], nextCursor: null, poll },
      }),
    );
    await store.load();
    call.mockClear();
    call.mockImplementation((method: string) => method === 'review:refresh'
      ? Promise.reject(new Error('timeout')) : Promise.resolve({ isSuccess: () => true,
        data: method === 'review:listRepositories'
          ? [{ owner: 'Hive-Academy', name: 'PtahCode', enabled: true, dryRun: true, publicationPaused: false }]
          : { runs: [], nextCursor: null, poll } }));
    await store.refresh();
    expect(call.mock.calls.map(([method]) => method)).toEqual([
      'review:listRepositories', 'review:listRuns', 'review:refresh',
      'review:listRepositories', 'review:listRuns',
    ]);
    expect(store.poll()?.status).toBe('failed');
    expect(store.refreshError()).toBe(true);
    expect(store.state()).toBe('ready');
  });

  it('loads findings for the selected run through review:listFindings', async () => {
    call.mockImplementation((method: string) =>
      Promise.resolve({
        isSuccess: () => true,
        data: method === 'review:getRun' ? run : { findings: [finding] },
      }),
    );
    store.selectRun(run.attemptId);
    await settle();
    expect(call).toHaveBeenCalledWith(
      'review:listFindings',
      { attemptId: run.attemptId },
      { timeout: 5_000 },
    );
    expect(store.findingsState()).toBe('ready');
    expect(store.findings()).toEqual([finding]);
  });

  it('reports an empty findings list as ready', async () => {
    call.mockImplementation((method: string) =>
      Promise.resolve({
        isSuccess: () => true,
        data: method === 'review:getRun' ? run : { findings: [] },
      }),
    );
    store.selectRun(run.attemptId);
    await settle();
    expect(store.findingsState()).toBe('ready');
    expect(store.findings()).toEqual([]);
  });

  it('reloads findings when the selected run changes', async () => {
    const findingsFor = (attemptId: string): { findings: ReviewFinding[] } => ({
      findings: [
        {
          ...finding,
          path: `src/${attemptId}.ts`,
          evidence: [
            {
              path: `src/${attemptId}.ts`,
              line: 42,
              excerpt: 'const parsed = JSON.parse(raw);',
            },
          ],
        },
      ],
    });
    call.mockImplementation((method: string, params: { attemptId: string }) =>
      Promise.resolve({
        isSuccess: () => true,
        data:
          method === 'review:getRun'
            ? { ...run, attemptId: params.attemptId }
            : findingsFor(params.attemptId),
      }),
    );
    store.selectRun('rvw-428-a');
    await settle();
    expect(store.findings()).toEqual(findingsFor('rvw-428-a').findings);
    store.selectRun('rvw-428-b');
    await settle();
    expect(
      call.mock.calls
        .filter(([method]) => method === 'review:listFindings')
        .map(([, params]) => params),
    ).toEqual([{ attemptId: 'rvw-428-a' }, { attemptId: 'rvw-428-b' }]);
    expect(store.findings()).toEqual(findingsFor('rvw-428-b').findings);
  });

  it('ignores a late findings response for a previously selected run', async () => {
    const resolvers = new Map<
      string,
      (response: { isSuccess: () => boolean; data: unknown }) => void
    >();
    call.mockImplementation((method: string, params: { attemptId: string }) => {
      if (method === 'review:getRun')
        return Promise.resolve({
          isSuccess: () => true,
          data: { ...run, attemptId: params.attemptId },
        });
      return new Promise((resolve) => {
        resolvers.set(params.attemptId, resolve);
      });
    });
    store.selectRun('rvw-428-a');
    store.selectRun('rvw-428-b');
    await settle();
    const resolveLate = resolvers.get('rvw-428-a');
    const resolveCurrent = resolvers.get('rvw-428-b');
    expect(resolveLate).toBeInstanceOf(Function);
    expect(resolveCurrent).toBeInstanceOf(Function);
    const currentFinding: ReviewFinding = { ...finding, path: 'src/current.ts' };
    resolveCurrent?.({
      isSuccess: () => true,
      data: { findings: [currentFinding] },
    });
    await settle();
    expect(store.findings()).toEqual([currentFinding]);
    resolveLate?.({ isSuccess: () => true, data: { findings: [finding] } });
    await settle();
    expect(store.findings()).toEqual([currentFinding]);
    expect(store.findingsState()).toBe('ready');
  });

  it('keeps the run detail ready and reports a findings failure', async () => {
    call.mockImplementation((method: string) =>
      method === 'review:getRun'
        ? Promise.resolve({ isSuccess: () => true, data: run })
        : Promise.reject(new Error('offline with host secret')),
    );
    store.selectRun(run.attemptId);
    await settle();
    expect(store.detailState()).toBe('ready');
    expect(store.findingsState()).toBe('error');
    expect(store.findings()).toEqual([]);
  });

  it('ignores an older same-attempt findings reply that settles after a newer success', async () => {
    const resolvers: PendingFindingsReply[] = [];
    call.mockImplementation((method: string) =>
      method === 'review:getRun'
        ? Promise.resolve({ isSuccess: () => true, data: run })
        : new Promise((resolve, reject) => {
            resolvers.push({ resolve, reject });
          }),
    );
    store.selectRun(run.attemptId);
    store.reloadFindings();
    expect(resolvers).toHaveLength(2);
    const newerFinding: ReviewFinding = { ...finding, path: 'src/newer.ts' };
    resolvers[1].resolve({
      isSuccess: () => true,
      data: { findings: [newerFinding] },
    });
    await settle();
    expect(store.findings()).toEqual([newerFinding]);
    resolvers[0].resolve({ isSuccess: () => true, data: { findings: [finding] } });
    await settle();
    expect(store.findings()).toEqual([newerFinding]);
    expect(store.findingsState()).toBe('ready');
  });

  it('ignores an older same-attempt findings rejection that settles after a newer success', async () => {
    const resolvers: PendingFindingsReply[] = [];
    call.mockImplementation((method: string) =>
      method === 'review:getRun'
        ? Promise.resolve({ isSuccess: () => true, data: run })
        : new Promise((resolve, reject) => {
            resolvers.push({ resolve, reject });
          }),
    );
    store.selectRun(run.attemptId);
    store.reloadFindings();
    const newerFinding: ReviewFinding = { ...finding, path: 'src/newer.ts' };
    resolvers[1].resolve({
      isSuccess: () => true,
      data: { findings: [newerFinding] },
    });
    await settle();
    resolvers[0].reject(new Error('older findings request failed'));
    await settle();
    expect(store.findings()).toEqual([newerFinding]);
    expect(store.findingsState()).toBe('ready');
  });

  it('ignores findings replies from before the run closed and reloads on reopen', async () => {
    const resolvers: PendingFindingsReply[] = [];
    call.mockImplementation((method: string) =>
      method === 'review:getRun'
        ? Promise.resolve({ isSuccess: () => true, data: run })
        : new Promise((resolve, reject) => {
            resolvers.push({ resolve, reject });
          }),
    );
    store.selectRun(run.attemptId);
    store.closeRun();
    call.mockClear();
    store.reloadFindings();
    expect(call).not.toHaveBeenCalled();
    resolvers[0].resolve({ isSuccess: () => true, data: { findings: [finding] } });
    await settle();
    expect(store.findings()).toEqual([]);
    expect(store.findingsState()).toBe('ready');
    store.selectRun(run.attemptId);
    expect(resolvers).toHaveLength(2);
    resolvers[1].resolve({ isSuccess: () => true, data: { findings: [finding] } });
    await settle();
    expect(store.findings()).toEqual([finding]);
    expect(store.findingsState()).toBe('ready');
  });

  it('shows a safe error when bot verification fails', async () => {
    call.mockResolvedValue({ isSuccess: () => false, errorCode: 'REVIEW_DISABLED', error: 'secret token' });
    await store.loadBotIdentity();
    expect(store.botIdentity()).toBeNull();
    expect(store.botIdentityError()).toContain('Could not verify the bot token:');
    expect(store.botIdentityError()).not.toContain('secret token');
  });

  it('shows a repository-specific checkout error after Refresh', async () => {
    const repository = { owner: 'Hive-Academy', name: 'PtahCode', enabled: true, dryRun: true, publicationPaused: false };
    let refreshed = false;
    call.mockImplementation((method: string) => {
      if (method === 'review:refresh') refreshed = true;
      return Promise.resolve({
      isSuccess: () => true,
      data: method === 'review:listRepositories' ? [repository]
        : method === 'review:listRuns' ? { runs: [], nextCursor: null, poll: {
          status: 'failed', error: 'No local checkout of Hive-Academy/PtahCode is open in Ptah. Add its folder as a workspace.',
          lastSuccessAt: null, lastErrorAt: refreshed ? '2026-11-05T00:00:00.000Z' : '2026-11-04T00:00:00.000Z',
        } } : { ok: true },
      });
    });
    await store.load();
    await store.refresh();
    expect(store.refreshErrorMessage()).toContain('No local checkout of Hive-Academy/PtahCode');
    expect(store.refreshError()).toBe(true);
  });

  it('reads settings from the token-presence response without exposing a credential', async () => {
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
    };
    call.mockResolvedValue({
      isSuccess: () => true,
      data: { settings, hasToken: true, tokenStorage: 'encrypted' },
    });
    await store.loadSettings();
    expect(store.settingsState()).toBe('ready');
    expect(store.settings()).toEqual(settings);
  });

  it('saves global publication pause and reflects the persisted state', async () => {
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
      globalPublicationPaused: false,
      laneCapPerPr: 6,
      confidenceFloor: 0.8,
      maxNewInline: 10,
      fallbackFamilies: [],
    };
    call
      .mockResolvedValueOnce({
        isSuccess: () => true,
        data: { settings, hasToken: true, tokenStorage: 'encrypted' },
      })
      .mockResolvedValueOnce({ isSuccess: () => true, data: null })
      .mockResolvedValueOnce({ isSuccess: () => true, data: { ok: true } });
    await store.loadSettings();
    await store.setPublicationPause(true);
    expect(call).toHaveBeenLastCalledWith(
      'review:setPublicationPause',
      { paused: true },
      { timeout: 5_000 },
    );
    expect(store.settings()?.globalPublicationPaused).toBe(true);
    expect(store.pauseError()).toBe(false);
  });

  it('keeps the old pause state and exposes a failed save', async () => {
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
      globalPublicationPaused: false,
      laneCapPerPr: 6,
      confidenceFloor: 0.8,
      maxNewInline: 10,
      fallbackFamilies: [],
    };
    const logger = TestBed.inject(LoggingService);
    const logged = jest
      .spyOn(logger, 'error')
      .mockImplementation(() => undefined);
    call
      .mockResolvedValueOnce({
        isSuccess: () => true,
        data: { settings, hasToken: true, tokenStorage: 'encrypted' },
      })
      .mockResolvedValueOnce({ isSuccess: () => true, data: null })
      .mockRejectedValueOnce(new Error('offline'));
    await store.loadSettings();
    await store.setPublicationPause(true);
    expect(store.settings()?.globalPublicationPaused).toBe(false);
    expect(store.pauseError()).toBe(true);
    expect(logged).toHaveBeenCalledWith(
      'ReviewRunsStore',
      'Publication pause update failed',
      expect.any(Error),
    );
  });
  it('sends only repository identity for a publication pause', async () => {
    const repo = { owner: 'Hive-Academy', name: 'PtahCode', enabled: true, dryRun: true, publicationPaused: false };
    const settings = { repositories: [repo], maintainerLogins: ['maintainer'], pollMinutes: 30,
      globalPublicationPaused: false, laneCapPerPr: 6, confidenceFloor: 0.8,
      maxNewInline: 10, fallbackFamilies: [] };
    call.mockResolvedValueOnce({ isSuccess: () => true,
      data: { settings, hasToken: true, tokenStorage: 'encrypted' } })
      .mockResolvedValueOnce({ isSuccess: () => true, data: null })
      .mockResolvedValueOnce({ isSuccess: () => true, data: { ok: true } });
    await store.loadSettings();
    await store.setPublicationPause(true, true, repo);
    expect(call).toHaveBeenLastCalledWith('review:setPublicationPause',
      { paused: true, repo: { owner: repo.owner, name: repo.name } }, { timeout: 5_000 });
    expect(store.settings()?.repositories[0].publicationPaused).toBe(true);
  });
  it('does not turn publication pause off without explicit confirmation', async () => {
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
    };
    call
      .mockResolvedValueOnce({
        isSuccess: () => true,
        data: { settings, hasToken: true, tokenStorage: 'encrypted' },
      })
      .mockResolvedValueOnce({ isSuccess: () => true, data: null })
      .mockResolvedValueOnce({ isSuccess: () => true, data: { ok: true } });
    await store.loadSettings();
    call.mockClear();
    await store.setPublicationPause(false);
    expect(call).not.toHaveBeenCalled();
    expect(store.settings()?.globalPublicationPaused).toBe(true);
    await store.setPublicationPause(false, true);
    expect(call).toHaveBeenCalledWith(
      'review:setPublicationPause',
      { paused: false },
      { timeout: 5_000 },
    );
    expect(store.settings()?.globalPublicationPaused).toBe(false);
  });
  it('saves first-run settings without sending a token', async () => {
    call.mockResolvedValueOnce({
      isSuccess: () => true,
      data: { settings: null, hasToken: false, tokenStorage: 'encrypted' },
    });
    await store.loadSettings();
    expect(store.settingsState()).toBe('ready');
    expect(store.hasToken()).toBe(false);
    store.updateDraft({ maintainerLogins: ['maintainer'] });
    expect(store.draftSettings().repositories).toEqual([]);
    const saved = store.draftSettings();
    call.mockResolvedValueOnce({ isSuccess: () => true, data: saved });
    await store.saveSettings();
    expect(call).toHaveBeenLastCalledWith(
      'review:updateSettings',
      { settings: saved },
      { timeout: 5_000 },
    );
    expect(store.settings()).toEqual(saved);
    expect(JSON.stringify(call.mock.calls)).not.toContain('token');
  });
  it('sends a token only to the write RPC and keeps it out of read state', async () => {
    call
      .mockResolvedValueOnce({ isSuccess: () => true, data: { ok: true } })
      .mockResolvedValueOnce({
        isSuccess: () => true,
        data: {
          login: 'ptah-bot',
          scopes: ['pull_requests:read', 'issues:write'],
          connectedAt: '2026-11-04T00:00:00Z',
          verifiedAt: null,
          tokenStorage: 'encrypted',
        },
      });
    expect(await store.setBotToken('secret-token')).toBe(true);
    expect(call.mock.calls[0][0]).toBe('review:setBotToken');
    expect(call.mock.calls[0][1]).toEqual({ token: 'secret-token' });
    expect(store.botIdentity()?.login).toBe('ptah-bot');
    expect(
      JSON.stringify({
        identity: store.botIdentity(),
        settings: store.settings(),
      }),
    ).not.toContain('secret-token');
  });
  it('requests a rerun with an explicit dry-run choice', async () => {
    call
      .mockResolvedValueOnce({
        isSuccess: () => true,
        data: { attemptId: 'next-attempt' },
      })
      .mockRejectedValueOnce(new Error('offline'));
    await store.rerun('old-attempt', false);
    expect(call.mock.calls[0][0]).toBe('review:rerun');
    expect(call.mock.calls[0][1]).toEqual({
      attemptId: 'old-attempt',
      dryRun: false,
    });
  });
});

describe('review settings defaults', () => {
  it('does not invent a repository and blocks live saves without a bot', async () => {
    const call = jest.fn();
    TestBed.configureTestingModule({
      providers: [
        ReviewRunsStore,
        { provide: ClaudeRpcService, useValue: { call } },
        { provide: LoggingService, useValue: { error: jest.fn() } },
      ],
    });
    const store = TestBed.inject(ReviewRunsStore);
    expect(store.draftSettings().repositories).toEqual([]);
    store.updateDraft({
      repositories: [
        {
          owner: 'Acme',
          name: 'Widget',
          enabled: false,
          dryRun: false,
          publicationPaused: false,
        },
      ],
    });
    await store.saveSettings();
    expect(call).not.toHaveBeenCalled();
    expect(store.settingsSaveError()).toContain('bot token');
  });
});

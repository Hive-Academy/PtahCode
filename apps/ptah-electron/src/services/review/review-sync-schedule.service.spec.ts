import type { JobHandler } from '@ptah-extension/cron-scheduler';
import {
  LEGACY_REVIEW_DISCOVERY_JOB_ID,
  REVIEW_SYNC_HANDLER,
  REVIEW_SYNC_JOB_ID,
  ReviewSyncScheduleService,
  type ReviewSyncHooks,
  type ReviewSyncScheduleDeps,
} from './review-sync-schedule.service';

type Settings = Awaited<ReturnType<ReviewSyncScheduleDeps['settings']['getSettings']>>;

function settingsWith(repos: Array<{ owner: string; name: string; enabled: boolean }>, pollMinutes = 10): Settings {
  // Only the fields the schedule reads; the strict store schema is covered in review-core.
  return { repositories: repos, pollMinutes } as Settings;
}

function fixture(overrides: { settings?: Settings; hooks?: ReviewSyncHooks; withCron?: boolean; lastPollAt?: number | null } = {}) {
  const handlers = new Map<string, JobHandler>();
  const jobs = new Map<string, unknown>([[LEGACY_REVIEW_DISCOVERY_JOB_ID, { id: LEGACY_REVIEW_DISCOVERY_JOB_ID }]]);
  const orchestrator = {
    lastPollAt: jest.fn(async () => overrides.lastPollAt ?? null),
    pollAndRecord: jest.fn(async () => 1),
    reconcileStartup: jest.fn(async () => 0),
    startupPoll: jest.fn(async () => 0),
  };
  const jobStore = {
    upsert: jest.fn((input: { id: string }) => { jobs.set(input.id, input); return input; }),
    get: jest.fn((id: string) => jobs.get(id) ?? null),
    delete: jest.fn((id: string) => jobs.delete(id)),
  };
  const registry = {
    has: jest.fn((name: string) => handlers.has(name)),
    register: jest.fn((name: string, handler: JobHandler) => { handlers.set(name, handler); }),
    unregister: jest.fn((name: string) => { handlers.delete(name); }),
  };
  const logger = { error: jest.fn() };
  const withCron = overrides.withCron ?? true;
  const deps: ReviewSyncScheduleDeps = {
    orchestrator,
    settings: { getSettings: jest.fn(async () => overrides.settings ?? null) },
    jobs: withCron ? jobStore : null,
    registry: withCron ? registry : null,
    hooks: overrides.hooks ?? {},
    logger,
    now: () => 1_000_000_000,
  };
  return { service: new ReviewSyncScheduleService(deps), orchestrator, jobStore, registry, handlers, jobs, logger };
}

const live = (): AbortSignal => new AbortController().signal;

describe('ReviewSyncScheduleService', () => {
  it('upserts one deterministic job, binds its handler and removes the legacy job', () => {
    const { service, jobStore, handlers, jobs } = fixture();
    const first = service.register();
    expect(first.scheduled).toBe(true);
    expect(jobStore.upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: REVIEW_SYNC_JOB_ID, prompt: `handler:${REVIEW_SYNC_HANDLER}`, enabled: true, timezone: 'UTC' }));
    expect(handlers.has(REVIEW_SYNC_HANDLER)).toBe(true);
    expect(jobs.has(LEGACY_REVIEW_DISCOVERY_JOB_ID)).toBe(false);
    // A second registration (duplicate start) reuses the same row and does not steal the handler.
    const second = service.register();
    expect(jobStore.upsert).toHaveBeenCalledTimes(2);
    expect([...jobs.keys()]).toEqual([REVIEW_SYNC_JOB_ID]);
    second.dispose();
    expect(handlers.has(REVIEW_SYNC_HANDLER)).toBe(true);
    first.dispose();
    first.dispose();
    expect(handlers.has(REVIEW_SYNC_HANDLER)).toBe(false);
  });

  it('reports an unavailable scheduler without throwing', () => {
    const { service, logger } = fixture({ withCron: false });
    const registration = service.register();
    expect(registration.scheduled).toBe(false);
    expect(() => registration.dispose()).not.toThrow();
    expect(logger.error).toHaveBeenCalledWith('Review sync schedule unavailable', expect.any(Error));
  });

  it('releases the handler when the job store fails', () => {
    const { service, jobStore, handlers, logger } = fixture();
    jobStore.upsert.mockImplementation(() => { throw new Error('ghp_secret_store'); });
    expect(service.register().scheduled).toBe(false);
    expect(handlers.has(REVIEW_SYNC_HANDLER)).toBe(false);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('ghp_secret');
  });

  it('skips a tick when review is disabled or the run is aborted', async () => {
    const { service, orchestrator } = fixture({ settings: settingsWith([{ owner: 'a', name: 'b', enabled: false }]) });
    await expect(service.handle({ signal: live() })).resolves.toEqual({ outcome: 'skipped', reason: 'review-disabled' });
    const aborted = new AbortController();
    aborted.abort();
    await expect(service.handle({ signal: aborted.signal })).resolves.toEqual({ outcome: 'skipped', reason: 'aborted' });
    expect(orchestrator.pollAndRecord).not.toHaveBeenCalled();
  });

  it('discovers due repositories and syncs threads for each, isolating failures', async () => {
    const syncThreads = jest.fn(async (repo: { owner: string }) => {
      if (repo.owner === 'One') throw new Error('ghp_secret_graphql');
      return 3;
    });
    const { service, orchestrator, logger } = fixture({
      settings: settingsWith([{ owner: 'One', name: 'Alpha', enabled: true }, { owner: 'Two', name: 'Beta', enabled: true }]),
      hooks: { syncThreads },
    });
    orchestrator.pollAndRecord.mockImplementationOnce(async () => { throw new Error('ghp_secret_poll'); });
    const result = await service.handle({ signal: live() });
    expect(result).toEqual({ summary: 'Review sync started' });
    await new Promise((resolve) => setImmediate(resolve));
    // Strict identities only, never the settings entry.
    expect(orchestrator.pollAndRecord).toHaveBeenCalledWith({ owner: 'One', name: 'Alpha' });
    expect(syncThreads).toHaveBeenCalledWith({ owner: 'Two', name: 'Beta' }, expect.any(Object));
    expect(syncThreads).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith('Review poll failed', new Error('Review poll failed'));
    expect(logger.error).toHaveBeenCalledWith('Review thread sync failed', new Error('Review thread sync failed'));
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('ghp_secret');
  });

  it('does not poll a repository before its poll interval and still syncs threads', async () => {
    const syncThreads = jest.fn(async () => 0);
    const { service, orchestrator } = fixture({
      settings: settingsWith([{ owner: 'One', name: 'Alpha', enabled: true }], 10),
      hooks: { syncThreads }, lastPollAt: 1_000_000_000 - 60_000,
    });
    await service.handle({ signal: live() });
    await new Promise((resolve) => setImmediate(resolve));
    expect(orchestrator.pollAndRecord).not.toHaveBeenCalled();
    expect(syncThreads).toHaveBeenCalledTimes(1);
  });

  it('skips an overlapped tick while one is still running', async () => {
    let release!: () => void;
    const syncThreads = jest.fn(() => new Promise<number>((resolve) => { release = () => resolve(0); }));
    const { service } = fixture({ settings: settingsWith([{ owner: 'One', name: 'Alpha', enabled: true }]), hooks: { syncThreads } });
    const first = service.handle({ signal: live() });
    await new Promise((resolve) => setImmediate(resolve));
    await expect(first).resolves.toEqual({ summary: 'Review sync started' });
    await expect(service.handle({ signal: live() })).resolves.toEqual({ outcome: 'skipped', reason: 'sync-in-progress' });
    release();
    await new Promise((resolve) => setImmediate(resolve));
    expect(syncThreads).toHaveBeenCalledTimes(1);
  });

  it('recovers startup in order: leases, own statuses, then startup polls', async () => {
    const recoverStatuses = jest.fn(async () => 2);
    const { service, orchestrator } = fixture({
      settings: settingsWith([{ owner: 'Hive-Academy', name: 'PtahCode', enabled: true }]), hooks: { recoverStatuses },
    });
    await service.recoverStartup(live());
    expect(orchestrator.reconcileStartup.mock.invocationCallOrder[0]).toBeLessThan(recoverStatuses.mock.invocationCallOrder[0]);
    expect(recoverStatuses.mock.invocationCallOrder[0]).toBeLessThan(orchestrator.startupPoll.mock.invocationCallOrder[0]);
    expect(orchestrator.startupPoll).toHaveBeenCalledWith(null, { owner: 'Hive-Academy', name: 'PtahCode' });
  });

  it('never throws from startup recovery and logs fixed messages', async () => {
    const { service, orchestrator, logger } = fixture({
      settings: settingsWith([{ owner: 'One', name: 'Alpha', enabled: true }]),
      hooks: { recoverStatuses: async () => { throw new Error('ghp_secret_status'); } },
    });
    orchestrator.reconcileStartup.mockRejectedValue(new Error('ghp_secret_lease'));
    orchestrator.startupPoll.mockRejectedValue(new Error('ghp_secret_startup'));
    await expect(service.recoverStartup(live())).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith('Review startup reconcile failed', expect.any(Error));
    expect(logger.error).toHaveBeenCalledWith('Review status recovery failed', expect.any(Error));
    expect(logger.error).toHaveBeenCalledWith('Review startup poll failed', expect.any(Error));
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('ghp_secret');
  });

  it('stops startup recovery after an abort', async () => {
    const recoverStatuses = jest.fn(async () => 0);
    const { service, orchestrator } = fixture({
      settings: settingsWith([{ owner: 'One', name: 'Alpha', enabled: true }]), hooks: { recoverStatuses },
    });
    const controller = new AbortController();
    orchestrator.reconcileStartup.mockImplementation(async () => { controller.abort(); return 0; });
    await service.recoverStartup(controller.signal);
    expect(recoverStatuses).not.toHaveBeenCalled();
    expect(orchestrator.startupPoll).not.toHaveBeenCalled();
  });
});

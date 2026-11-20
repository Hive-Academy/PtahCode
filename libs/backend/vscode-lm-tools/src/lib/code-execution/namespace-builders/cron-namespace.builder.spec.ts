// The cron-scheduler barrel loads tsyringe, which needs the reflect polyfill.
import 'reflect-metadata';

import {
  CronJobValidationError,
  CronSchedulerError,
  type CronJobService,
} from '@ptah-extension/cron-scheduler';
import type { JobRunDto, ScheduledJobDto } from '@ptah-extension/shared';

import {
  buildCronNamespace,
  readOnlyCronNamespace,
  type CronCreateArgs,
  type CronNamespace,
} from './cron-namespace.builder';

type ServiceFake = jest.Mocked<
  Pick<
    CronJobService,
    | 'list'
    | 'get'
    | 'create'
    | 'update'
    | 'toggle'
    | 'delete'
    | 'runNow'
    | 'runs'
    | 'nextFire'
    | 'previewNextFire'
  >
>;

const NEXT_RUN_AT = Date.UTC(2026, 0, 2, 9, 0, 0);
const NEXT_RUN_ISO = '2026-01-02T09:00:00.000Z';
const LAST_RUN_AT = Date.UTC(2026, 0, 1, 9, 0, 0);
const LAST_RUN_ISO = '2026-01-01T09:00:00.000Z';

const UNAVAILABLE_REASON = 'not available on this host';

function createServiceFake(): ServiceFake {
  return {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    toggle: jest.fn(),
    delete: jest.fn(),
    runNow: jest.fn(),
    runs: jest.fn(),
    nextFire: jest.fn(),
    previewNextFire: jest.fn(),
  };
}

/** The one place the fake is widened to the full service type. */
function asCronJobService(fake: ServiceFake): CronJobService {
  return fake as unknown as CronJobService;
}

function makeJob(overrides: Partial<ScheduledJobDto> = {}): ScheduledJobDto {
  return {
    id: 'job-1',
    name: 'Morning report',
    cronExpr: '0 9 * * *',
    timezone: 'UTC',
    prompt: 'Write the morning report.',
    workspaceRoot: '/ws/a',
    enabled: true,
    createdAt: LAST_RUN_AT,
    updatedAt: LAST_RUN_AT,
    lastRunAt: null,
    nextRunAt: NEXT_RUN_AT,
    createdBy: { kind: 'user' },
    lastRunStatus: null,
    ...overrides,
  };
}

function makeRun(overrides: Partial<JobRunDto> = {}): JobRunDto {
  return {
    id: 'run-1',
    jobId: 'job-1',
    scheduledFor: LAST_RUN_AT,
    startedAt: LAST_RUN_AT,
    endedAt: null,
    status: 'succeeded',
    resultSummary: 'Report written.',
    errorMessage: null,
    sessionId: 'sdk-session-1',
    ...overrides,
  };
}

const CREATE_ARGS: CronCreateArgs = {
  name: 'Morning report',
  cronExpression: '0 9 * * *',
  prompt: 'Write the morning report.',
};

describe('buildCronNamespace', () => {
  let service: ServiceFake;
  let available: boolean;
  let sessionId: string | undefined;
  let workspaceRoot: string | undefined;
  let cron: CronNamespace;

  beforeEach(() => {
    service = createServiceFake();
    available = true;
    sessionId = 'session-1';
    workspaceRoot = '/ws/current';
    cron = buildCronNamespace({
      getService: () => (available ? asCronJobService(service) : undefined),
      getSessionId: () => sessionId,
      getWorkspaceRoot: () => workspaceRoot,
    });
  });

  describe('host without a scheduler', () => {
    const calls: Array<[string, (ns: CronNamespace) => Promise<unknown>]> = [
      ['list', (ns) => ns.list()],
      ['get', (ns) => ns.get({ id: 'job-1' })],
      ['create', (ns) => ns.create(CREATE_ARGS)],
      ['update', (ns) => ns.update({ id: 'job-1', name: 'x' })],
      ['toggle', (ns) => ns.toggle({ id: 'job-1', enabled: false })],
      ['delete', (ns) => ns.delete({ id: 'job-1' })],
      ['runNow', (ns) => ns.runNow({ id: 'job-1' })],
      ['runs', (ns) => ns.runs({ id: 'job-1' })],
      ['nextFire', (ns) => ns.nextFire({ id: 'job-1' })],
    ];

    it.each(calls)('%s is refused', async (_method, call) => {
      available = false;

      await expect(call(cron)).resolves.toEqual({
        status: 'refused',
        reason: expect.stringContaining(UNAVAILABLE_REASON),
      });
    });

    it('resolves the service on every call, not once at build time', async () => {
      service.list.mockReturnValue([]);
      available = false;
      await expect(cron.list()).resolves.toMatchObject({ status: 'refused' });

      available = true;
      await expect(cron.list()).resolves.toEqual({ status: 'ok', jobs: [] });
    });
  });

  describe('list', () => {
    it('maps a job to the agent view', async () => {
      service.list.mockReturnValue([
        makeJob({
          lastRunAt: LAST_RUN_AT,
          lastRunStatus: 'succeeded',
          createdBy: { kind: 'session', sessionId: 'session-9' },
        }),
      ]);

      const result = await cron.list({
        workspaceRoot: '/ws/a',
        enabledOnly: true,
      });

      expect(service.list).toHaveBeenCalledWith({
        enabledOnly: true,
        workspaceRoot: '/ws/a',
      });
      expect(result).toStrictEqual({
        status: 'ok',
        jobs: [
          {
            id: 'job-1',
            name: 'Morning report',
            cronExpression: '0 9 * * *',
            timezone: 'UTC',
            enabled: true,
            workspaceRoot: '/ws/a',
            prompt: 'Write the morning report.',
            promptTruncated: false,
            nextFire: NEXT_RUN_ISO,
            lastRunAt: LAST_RUN_ISO,
            lastRunStatus: 'succeeded',
            createdBy: { kind: 'session', sessionId: 'session-9' },
          },
        ],
      });
    });

    it('truncates a prompt longer than 200 characters', async () => {
      service.list.mockReturnValue([makeJob({ prompt: 'x'.repeat(201) })]);

      const result = await cron.list();

      expect(result).toMatchObject({
        status: 'ok',
        jobs: [{ prompt: `${'x'.repeat(200)}…`, promptTruncated: true }],
      });
    });

    it('keeps a prompt of exactly 200 characters whole', async () => {
      const prompt = 'x'.repeat(200);
      service.list.mockReturnValue([makeJob({ prompt })]);

      const result = await cron.list();

      expect(result).toMatchObject({
        status: 'ok',
        jobs: [{ prompt, promptTruncated: false }],
      });
    });

    it('gives nextFire null for a disabled job', async () => {
      service.list.mockReturnValue([
        makeJob({ enabled: false, nextRunAt: NEXT_RUN_AT }),
      ]);

      const result = await cron.list();

      expect(result).toMatchObject({
        status: 'ok',
        jobs: [{ enabled: false, nextFire: null }],
      });
    });
  });

  describe('get', () => {
    it('returns the full prompt', async () => {
      const prompt = 'y'.repeat(500);
      service.get.mockReturnValue(makeJob({ prompt }));

      const result = await cron.get({ id: 'job-1' });

      expect(service.get).toHaveBeenCalledWith('job-1');
      expect(result).toMatchObject({
        status: 'ok',
        job: { id: 'job-1', prompt, promptTruncated: false },
      });
    });

    it('refuses an unknown id', async () => {
      service.get.mockReturnValue(null);

      const result = await cron.get({ id: 'missing' });

      expect(result).toEqual({
        status: 'refused',
        reason: expect.stringContaining('"missing"'),
        field: 'id',
      });
    });
  });

  describe('create', () => {
    beforeEach(() => {
      service.create.mockReturnValue(makeJob());
    });

    it('passes the calling session as the creator', async () => {
      await cron.create(CREATE_ARGS);

      expect(service.create).toHaveBeenCalledWith(expect.anything(), {
        kind: 'session',
        sessionId: 'session-1',
      });
    });

    it('refuses with no session, so a job is never recorded as user-created', async () => {
      sessionId = undefined;

      const result = await cron.create(CREATE_ARGS);

      expect(result).toMatchObject({ status: 'refused' });
      expect(service.create).not.toHaveBeenCalled();
    });

    it('refuses an expression with a seconds field', async () => {
      const result = await cron.create({
        ...CREATE_ARGS,
        cronExpression: '* * * * * *',
      });

      expect(result).toMatchObject({
        status: 'refused',
        field: 'cronExpression',
      });
      expect(service.create).not.toHaveBeenCalled();
    });

    it('maps the tool input to the service input', async () => {
      await cron.create({
        ...CREATE_ARGS,
        timezone: 'Europe/Berlin',
        enabled: false,
      });

      expect(service.create).toHaveBeenCalledWith(
        {
          name: 'Morning report',
          cronExpr: '0 9 * * *',
          prompt: 'Write the morning report.',
          timezone: 'Europe/Berlin',
          workspaceRoot: '/ws/current',
          enabled: false,
        },
        expect.anything(),
      );
    });

    it('uses the workspace of the calling session by default', async () => {
      await cron.create(CREATE_ARGS);

      expect(service.create.mock.calls[0][0].workspaceRoot).toBe('/ws/current');
    });

    it('uses the workspace the caller names', async () => {
      await cron.create({ ...CREATE_ARGS, workspaceRoot: '/ws/other' });

      expect(service.create.mock.calls[0][0].workspaceRoot).toBe('/ws/other');
    });

    it('uses null when neither the caller nor the session has a workspace', async () => {
      workspaceRoot = undefined;

      await cron.create(CREATE_ARGS);

      expect(service.create.mock.calls[0][0].workspaceRoot).toBeNull();
    });

    it('returns the id, the next fire time and the job', async () => {
      const result = await cron.create(CREATE_ARGS);

      expect(result).toStrictEqual({
        status: 'ok',
        id: 'job-1',
        nextFire: NEXT_RUN_ISO,
        job: {
          id: 'job-1',
          name: 'Morning report',
          cronExpression: '0 9 * * *',
          timezone: 'UTC',
          enabled: true,
          workspaceRoot: '/ws/a',
          prompt: 'Write the morning report.',
          promptTruncated: false,
          nextFire: NEXT_RUN_ISO,
          lastRunAt: null,
          lastRunStatus: null,
          createdBy: { kind: 'user' },
        },
      });
    });

    it('does not truncate a long prompt in the returned job', async () => {
      const prompt = 'z'.repeat(300);
      service.create.mockReturnValue(makeJob({ prompt }));

      const result = await cron.create({ ...CREATE_ARGS, prompt });

      expect(result).toMatchObject({
        job: { prompt, promptTruncated: false },
      });
    });
  });

  describe('scheduler errors', () => {
    it('turns a validation error on cronExpr into a refusal on cronExpression', async () => {
      service.create.mockImplementation(() => {
        throw new CronJobValidationError('cronExpr', 'msg');
      });

      await expect(cron.create(CREATE_ARGS)).resolves.toStrictEqual({
        status: 'refused',
        reason: 'msg',
        field: 'cronExpression',
      });
    });

    it('keeps the name of any other validated field', async () => {
      service.create.mockImplementation(() => {
        throw new CronJobValidationError('timezone', 'Unknown timezone.');
      });

      await expect(cron.create(CREATE_ARGS)).resolves.toStrictEqual({
        status: 'refused',
        reason: 'Unknown timezone.',
        field: 'timezone',
      });
    });

    it('turns another scheduler error into a refusal without a field', async () => {
      service.get.mockReturnValue(makeJob());
      service.toggle.mockImplementation(() => {
        throw new CronSchedulerError('Job not found: job-1');
      });

      await expect(
        cron.toggle({ id: 'job-1', enabled: false }),
      ).resolves.toStrictEqual({
        status: 'refused',
        reason: 'Job not found: job-1',
      });
    });

    it('rejects on a plain Error from the service', async () => {
      service.create.mockImplementation(() => {
        throw new Error('database is closed');
      });

      await expect(cron.create(CREATE_ARGS)).rejects.toThrow(
        'database is closed',
      );
    });

    it('rejects on a plain Error from an asynchronous service call', async () => {
      service.get.mockReturnValue(makeJob());
      service.runNow.mockRejectedValue(new Error('runner crashed'));

      await expect(cron.runNow({ id: 'job-1' })).rejects.toThrow(
        'runner crashed',
      );
    });
  });

  describe('update', () => {
    beforeEach(() => {
      service.get.mockReturnValue(makeJob());
      service.update.mockReturnValue(makeJob({ name: 'Renamed' }));
    });

    it('leaves workspaceRoot out of the patch when the caller did not send it', async () => {
      const result = await cron.update({
        id: 'job-1',
        name: 'Renamed',
        cronExpression: '*/5 * * * *',
      });

      const [id, patch] = service.update.mock.calls[0];
      expect(id).toBe('job-1');
      expect(Object.keys(patch)).not.toContain('workspaceRoot');
      expect(patch).toMatchObject({
        name: 'Renamed',
        cronExpr: '*/5 * * * *',
      });
      expect(result).toMatchObject({
        status: 'ok',
        job: { id: 'job-1', name: 'Renamed' },
      });
    });

    it('passes a workspaceRoot the caller sent', async () => {
      await cron.update({ id: 'job-1', workspaceRoot: '/ws/other' });

      expect(service.update.mock.calls[0][1]).toHaveProperty(
        'workspaceRoot',
        '/ws/other',
      );
    });

    it('passes workspaceRoot null to remove the workspace', async () => {
      await cron.update({ id: 'job-1', workspaceRoot: null });

      expect(service.update.mock.calls[0][1]).toHaveProperty(
        'workspaceRoot',
        null,
      );
    });

    it('refuses an unknown id without an update', async () => {
      service.get.mockReturnValue(null);

      const result = await cron.update({ id: 'missing', name: 'x' });

      expect(result).toMatchObject({ status: 'refused', field: 'id' });
      expect(service.update).not.toHaveBeenCalled();
    });
  });

  describe('toggle', () => {
    it('toggles a known job', async () => {
      service.get.mockReturnValue(makeJob());
      service.toggle.mockReturnValue(makeJob({ enabled: false }));

      const result = await cron.toggle({ id: 'job-1', enabled: false });

      expect(service.toggle).toHaveBeenCalledWith('job-1', false);
      expect(result).toMatchObject({
        status: 'ok',
        job: { id: 'job-1', enabled: false, nextFire: null },
      });
    });

    it('refuses to enable a job whose stored expression has six fields', async () => {
      service.get.mockReturnValue(
        makeJob({ enabled: false, cronExpr: '*/10 * * * * *' }),
      );

      const result = await cron.toggle({ id: 'job-1', enabled: true });

      expect(result).toMatchObject({
        status: 'refused',
        field: 'cronExpression',
      });
      expect(service.toggle).not.toHaveBeenCalled();

      // A disable call and an update that does not enable stay possible.
      service.toggle.mockReturnValue(makeJob({ enabled: false }));
      await expect(
        cron.toggle({ id: 'job-1', enabled: false }),
      ).resolves.toMatchObject({ status: 'ok' });
      service.update.mockReturnValue(makeJob({ enabled: false }));
      await expect(
        cron.update({ id: 'job-1', name: 'Renamed' }),
      ).resolves.toMatchObject({ status: 'ok' });
      await expect(
        cron.update({ id: 'job-1', enabled: true }),
      ).resolves.toMatchObject({ status: 'refused', field: 'cronExpression' });
      // A five-field expression in the same call makes the enable valid.
      await expect(
        cron.update({
          id: 'job-1',
          enabled: true,
          cronExpression: '*/10 * * * *',
        }),
      ).resolves.toMatchObject({ status: 'ok' });
    });

    it('refuses an unknown id without a toggle', async () => {
      service.get.mockReturnValue(null);

      const result = await cron.toggle({ id: 'missing', enabled: true });

      expect(result).toMatchObject({ status: 'refused', field: 'id' });
      expect(service.toggle).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('reports a deleted job', async () => {
      service.delete.mockReturnValue(true);

      const result = await cron.delete({ id: 'job-1' });

      expect(service.delete).toHaveBeenCalledWith('job-1');
      expect(result).toStrictEqual({
        status: 'ok',
        deleted: true,
        id: 'job-1',
      });
    });

    it('refuses when the service deleted nothing', async () => {
      service.delete.mockReturnValue(false);

      const result = await cron.delete({ id: 'missing' });

      expect(result).toMatchObject({ status: 'refused', field: 'id' });
    });
  });

  describe('runNow', () => {
    it('returns the run with its session id', async () => {
      service.get.mockReturnValue(makeJob());
      service.runNow.mockResolvedValue(makeRun());

      const result = await cron.runNow({ id: 'job-1' });

      expect(service.runNow).toHaveBeenCalledWith('job-1');
      expect(result).toStrictEqual({
        status: 'ok',
        run: {
          id: 'run-1',
          status: 'succeeded',
          scheduledFor: LAST_RUN_ISO,
          startedAt: LAST_RUN_ISO,
          endedAt: null,
          resultSummary: 'Report written.',
          errorMessage: null,
          sessionId: 'sdk-session-1',
        },
      });
    });

    it('refuses when the service has no such job', async () => {
      service.get.mockReturnValue(null);

      const result = await cron.runNow({ id: 'missing' });

      expect(result).toMatchObject({ status: 'refused', field: 'id' });
      expect(service.runNow).not.toHaveBeenCalled();
    });

    it('does not report an existing job as missing when no run starts', async () => {
      service.get.mockReturnValue(makeJob());
      service.runNow.mockResolvedValue(null);

      const result = await cron.runNow({ id: 'job-1' });

      expect(result).toMatchObject({ status: 'refused' });
      expect(result).not.toHaveProperty('field');
    });
  });

  describe('readOnlyCronNamespace (the execute_code view)', () => {
    it('passes reads through and refuses every write', async () => {
      service.list.mockReturnValue([]);
      const view = readOnlyCronNamespace(cron);

      await expect(view.list()).resolves.toMatchObject({ status: 'ok' });
      const writes = await Promise.all([
        view.create(CREATE_ARGS),
        view.update({ id: 'job-1', name: 'x' }),
        view.toggle({ id: 'job-1', enabled: false }),
        view.delete({ id: 'job-1' }),
        view.runNow({ id: 'job-1' }),
      ]);

      for (const result of writes) {
        expect(result).toMatchObject({ status: 'refused' });
      }
      expect(service.create).not.toHaveBeenCalled();
      expect(service.update).not.toHaveBeenCalled();
      expect(service.toggle).not.toHaveBeenCalled();
      expect(service.delete).not.toHaveBeenCalled();
      expect(service.runNow).not.toHaveBeenCalled();
    });
  });

  describe('runs', () => {
    beforeEach(() => {
      service.get.mockReturnValue(makeJob());
      service.runs.mockReturnValue([]);
    });

    it.each<[number | undefined, number]>([
      [undefined, 20],
      [0, 1],
      [-5, 1],
      [1, 1],
      [50, 50],
      [7.9, 7],
      [100, 100],
      [101, 100],
    ])('asks the service for limit %p as %p', async (limit, expected) => {
      await cron.runs({ id: 'job-1', limit });

      expect(service.runs).toHaveBeenCalledWith('job-1', { limit: expected });
    });

    it('maps each run to the agent view', async () => {
      service.runs.mockReturnValue([
        makeRun(),
        makeRun({ id: 'run-2', sessionId: null, startedAt: null }),
      ]);

      const result = await cron.runs({ id: 'job-1' });

      expect(result).toMatchObject({
        status: 'ok',
        runs: [
          { id: 'run-1', sessionId: 'sdk-session-1', startedAt: LAST_RUN_ISO },
          { id: 'run-2', sessionId: null, startedAt: null },
        ],
      });
    });

    it('refuses an unknown id without a query for runs', async () => {
      service.get.mockReturnValue(null);

      const result = await cron.runs({ id: 'missing' });

      expect(result).toMatchObject({ status: 'refused', field: 'id' });
      expect(service.runs).not.toHaveBeenCalled();
    });
  });

  describe('nextFire', () => {
    it('returns one ISO time for a saved job', async () => {
      service.get.mockReturnValue(makeJob());
      service.nextFire.mockReturnValue(NEXT_RUN_AT);

      const result = await cron.nextFire({ id: 'job-1' });

      expect(service.nextFire).toHaveBeenCalledWith('job-1');
      expect(result).toStrictEqual({ status: 'ok', nextFire: [NEXT_RUN_ISO] });
    });

    it('returns an empty list for a saved job that will not fire', async () => {
      service.get.mockReturnValue(makeJob({ enabled: false }));
      service.nextFire.mockReturnValue(null);

      const result = await cron.nextFire({ id: 'job-1' });

      expect(result).toStrictEqual({ status: 'ok', nextFire: [] });
    });

    it('refuses an unknown id', async () => {
      service.get.mockReturnValue(null);

      const result = await cron.nextFire({ id: 'missing' });

      expect(result).toMatchObject({ status: 'refused', field: 'id' });
      expect(service.nextFire).not.toHaveBeenCalled();
    });

    it('previews an expression that is not saved', async () => {
      service.previewNextFire.mockReturnValue([
        NEXT_RUN_AT,
        NEXT_RUN_AT + 5 * 60_000,
      ]);

      const result = await cron.nextFire({
        cronExpression: '*/5 * * * *',
        timezone: 'Europe/Berlin',
        count: 2,
      });

      expect(service.previewNextFire).toHaveBeenCalledWith(
        '*/5 * * * *',
        'Europe/Berlin',
        2,
      );
      expect(service.get).not.toHaveBeenCalled();
      expect(result).toStrictEqual({
        status: 'ok',
        nextFire: [NEXT_RUN_ISO, '2026-01-02T09:05:00.000Z'],
      });
    });

    it('turns an invalid preview expression into a refusal on cronExpression', async () => {
      service.previewNextFire.mockImplementation(() => {
        throw new CronJobValidationError('cronExpr', 'Invalid expression.');
      });

      await expect(
        cron.nextFire({ cronExpression: 'not a cron' }),
      ).resolves.toStrictEqual({
        status: 'refused',
        reason: 'Invalid expression.',
        field: 'cronExpression',
      });
    });

    it('is refused with neither an id nor an expression', async () => {
      const result = await cron.nextFire({});

      expect(result).toStrictEqual({
        status: 'refused',
        reason: expect.stringContaining('cronExpression'),
      });
      expect(service.previewNextFire).not.toHaveBeenCalled();
      expect(service.nextFire).not.toHaveBeenCalled();
    });
  });
});

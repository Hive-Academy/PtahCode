import 'reflect-metadata';
import * as path from 'node:path';
import type { Logger } from '@ptah-extension/vscode-core';
import { JobId } from '@ptah-extension/shared';
import { createMockLogger } from '@ptah-extension/shared/testing';
import { CronJobService } from './cron-job.service';
import type { CronScheduler } from './cron-scheduler';
import { CronJobValidationError, type CronJobValidationField } from './errors';
import type { JobRun, ScheduledJob } from './types';

const JOB_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const RUN_ID = '01BX5ZZKBKACTAV9WEVGEMMVRZ';
const BAD_ID = 'not-a-ulid';

type SchedulerFake = jest.Mocked<
  Pick<
    CronScheduler,
    | 'list'
    | 'get'
    | 'create'
    | 'update'
    | 'toggle'
    | 'delete'
    | 'runNow'
    | 'listRuns'
    | 'nextFire'
  >
>;

function createSchedulerFake(): SchedulerFake {
  return {
    list: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    toggle: jest.fn(),
    delete: jest.fn(),
    runNow: jest.fn(),
    listRuns: jest.fn(),
    nextFire: jest.fn(),
  };
}

function makeJob(overrides: Partial<ScheduledJob> = {}): ScheduledJob {
  return {
    id: JobId.from(JOB_ID),
    name: 'Nightly report',
    cronExpr: '0 9 * * *',
    timezone: 'UTC',
    prompt: 'Summarise the open pull requests',
    workspaceRoot: null,
    enabled: true,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_500,
    lastRunAt: null,
    nextRunAt: 1_700_000_600_000,
    createdBy: { kind: 'user' },
    lastRunStatus: null,
    ...overrides,
  };
}

function makeRun(overrides: Partial<JobRun> = {}): JobRun {
  return {
    id: RUN_ID as JobRun['id'],
    jobId: JobId.from(JOB_ID),
    scheduledFor: 1_700_000_600_000,
    startedAt: 1_700_000_600_010,
    endedAt: 1_700_000_601_000,
    status: 'succeeded',
    resultSummary: 'done',
    errorMessage: null,
    sessionId: 'session-abc',
    ...overrides,
  };
}

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error: unknown) {
    return error;
  }
  return undefined;
}

function expectValidationError(
  fn: () => unknown,
  field: CronJobValidationField,
): void {
  const error = captureError(fn);
  expect(error).toBeInstanceOf(CronJobValidationError);
  expect((error as CronJobValidationError).field).toBe(field);
}

describe('CronJobService', () => {
  let scheduler: SchedulerFake;
  let logger: ReturnType<typeof createMockLogger>;
  let service: CronJobService;

  const validInput = {
    name: 'Nightly report',
    cronExpr: '0 9 * * *',
    prompt: 'Summarise the open pull requests',
  };

  beforeEach(() => {
    scheduler = createSchedulerFake();
    logger = createMockLogger();
    service = new CronJobService(
      scheduler as unknown as CronScheduler,
      logger as unknown as Logger,
    );
  });

  describe('create', () => {
    it("passes a 'user' creator through and returns the job DTO", () => {
      const job = makeJob({ lastRunStatus: 'succeeded' });
      scheduler.create.mockReturnValue(job);

      const dto = service.create(validInput, { kind: 'user' });

      expect(scheduler.create).toHaveBeenCalledTimes(1);
      expect(scheduler.create).toHaveBeenCalledWith({
        name: validInput.name,
        cronExpr: validInput.cronExpr,
        timezone: 'UTC',
        prompt: validInput.prompt,
        workspaceRoot: null,
        enabled: undefined,
        createdBy: { kind: 'user' },
      });
      expect(dto).toEqual({
        id: JOB_ID,
        name: job.name,
        cronExpr: job.cronExpr,
        timezone: job.timezone,
        prompt: job.prompt,
        workspaceRoot: null,
        enabled: true,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        lastRunAt: null,
        nextRunAt: job.nextRunAt,
        createdBy: { kind: 'user' },
        lastRunStatus: 'succeeded',
      });
    });

    it("passes a 'session' creator through with its sessionId", () => {
      const creator = { kind: 'session', sessionId: 'session-42' } as const;
      const workspaceRoot = path.resolve('/home/user/project');
      scheduler.create.mockReturnValue(
        makeJob({ createdBy: creator, workspaceRoot, lastRunStatus: 'failed' }),
      );

      const dto = service.create(
        {
          ...validInput,
          timezone: 'America/New_York',
          workspaceRoot,
          enabled: false,
        },
        creator,
      );

      expect(scheduler.create).toHaveBeenCalledWith(
        expect.objectContaining({
          timezone: 'America/New_York',
          workspaceRoot,
          enabled: false,
          createdBy: { kind: 'session', sessionId: 'session-42' },
        }),
      );
      expect(dto.createdBy).toEqual({
        kind: 'session',
        sessionId: 'session-42',
      });
      expect(dto.lastRunStatus).toBe('failed');
      expect(dto.workspaceRoot).toBe(workspaceRoot);
    });

    it('rejects a bad cron expression and does not call the scheduler', () => {
      expectValidationError(
        () =>
          service.create(
            { ...validInput, cronExpr: 'not a cron' },
            { kind: 'user' },
          ),
        'cronExpr',
      );
      expect(scheduler.create).not.toHaveBeenCalled();
    });

    it('rejects a bad timezone and does not call the scheduler', () => {
      expectValidationError(
        () =>
          service.create(
            { ...validInput, timezone: 'Mars/Olympus' },
            { kind: 'user' },
          ),
        'timezone',
      );
      expect(scheduler.create).not.toHaveBeenCalled();
    });

    it('rejects a relative workspaceRoot and does not call the scheduler', () => {
      expectValidationError(
        () =>
          service.create(
            { ...validInput, workspaceRoot: 'relative/project' },
            { kind: 'user' },
          ),
        'workspaceRoot',
      );
      expect(scheduler.create).not.toHaveBeenCalled();
    });

    it("rejects a workspaceRoot with a '..' segment and does not call the scheduler", () => {
      expectValidationError(
        () =>
          service.create(
            { ...validInput, workspaceRoot: '/home/user/../etc' },
            { kind: 'user' },
          ),
        'workspaceRoot',
      );
      expect(scheduler.create).not.toHaveBeenCalled();
    });

    it.each([
      ['an empty name', { name: '   ' }, 'name'],
      ['a non-string name', { name: 42 as unknown as string }, 'name'],
      ['a name above the limit', { name: 'n'.repeat(201) }, 'name'],
      ['an empty prompt', { prompt: '' }, 'prompt'],
      ['a non-string prompt', { prompt: {} as unknown as string }, 'prompt'],
      ['a prompt above the limit', { prompt: 'p'.repeat(20_001) }, 'prompt'],
    ] as const)('rejects %s', (_label, override, field) => {
      expectValidationError(
        () => service.create({ ...validInput, ...override }, { kind: 'user' }),
        field,
      );
      expect(scheduler.create).not.toHaveBeenCalled();
    });

    it("rejects a 'handler:' prompt and does not call the scheduler", () => {
      expectValidationError(
        () =>
          service.create(
            { ...validInput, prompt: '  Handler:memory:decay' },
            { kind: 'session', sessionId: 'session-42' },
          ),
        'prompt',
      );
      expect(scheduler.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('validates a new expression against the stored timezone and delegates', () => {
      scheduler.get.mockReturnValue(makeJob({ timezone: 'Europe/Berlin' }));
      scheduler.update.mockReturnValue(makeJob({ cronExpr: '*/10 * * * *' }));

      const dto = service.update(JOB_ID, { cronExpr: '*/10 * * * *' });

      expect(scheduler.get).toHaveBeenCalledWith(JOB_ID);
      expect(scheduler.update).toHaveBeenCalledWith(JOB_ID, {
        cronExpr: '*/10 * * * *',
      });
      expect(dto.cronExpr).toBe('*/10 * * * *');
    });

    it('rejects a bad expression merged with the stored timezone', () => {
      scheduler.get.mockReturnValue(makeJob());

      expectValidationError(
        () => service.update(JOB_ID, { cronExpr: 'not a cron' }),
        'cronExpr',
      );
      expect(scheduler.update).not.toHaveBeenCalled();
    });

    it('rejects a bad timezone merged with the stored expression', () => {
      scheduler.get.mockReturnValue(makeJob());

      expectValidationError(
        () => service.update(JOB_ID, { timezone: 'Mars/Olympus' }),
        'timezone',
      );
      expect(scheduler.update).not.toHaveBeenCalled();
    });

    it('rejects an empty name and a prompt above the limit', () => {
      expectValidationError(
        () => service.update(JOB_ID, { name: ' ' }),
        'name',
      );
      expectValidationError(
        () => service.update(JOB_ID, { prompt: 'p'.repeat(20_001) }),
        'prompt',
      );
      expect(scheduler.update).not.toHaveBeenCalled();
    });

    it("rejects a 'handler:' prompt", () => {
      expectValidationError(
        () => service.update(JOB_ID, { prompt: 'handler:memory:decay' }),
        'prompt',
      );
      expect(scheduler.get).not.toHaveBeenCalled();
      expect(scheduler.update).not.toHaveBeenCalled();
    });

    it('rejects a malformed id without calling the scheduler', () => {
      expectValidationError(
        () => service.update(BAD_ID, { name: 'renamed' }),
        'id',
      );
      expect(scheduler.update).not.toHaveBeenCalled();
    });
  });

  it('toggle delegates to the scheduler and rejects a malformed id', () => {
    scheduler.toggle.mockReturnValue(makeJob({ enabled: false }));

    const dto = service.toggle(JOB_ID, false);

    expect(scheduler.toggle).toHaveBeenCalledWith(JOB_ID, false);
    expect(dto.enabled).toBe(false);

    expectValidationError(() => service.toggle(BAD_ID, true), 'id');
    expect(scheduler.toggle).toHaveBeenCalledTimes(1);
  });

  it('delete delegates to the scheduler and returns false for a malformed id', () => {
    scheduler.delete.mockReturnValue(true);

    expect(service.delete(JOB_ID)).toBe(true);
    expect(scheduler.delete).toHaveBeenCalledWith(JOB_ID);

    expect(service.delete(BAD_ID)).toBe(false);
    expect(scheduler.delete).toHaveBeenCalledTimes(1);
  });

  it('get returns the job DTO, and null for an unknown or malformed id', () => {
    scheduler.get.mockReturnValueOnce(makeJob());

    expect(service.get(JOB_ID)).toEqual(
      expect.objectContaining({ id: JOB_ID, createdBy: { kind: 'user' } }),
    );
    expect(scheduler.get).toHaveBeenCalledWith(JOB_ID);

    scheduler.get.mockReturnValueOnce(null);
    expect(service.get(JOB_ID)).toBeNull();

    expect(service.get(BAD_ID)).toBeNull();
    expect(scheduler.get).toHaveBeenCalledTimes(2);
  });

  it('reads a system job by its deterministic id, and keeps writes to ULIDs', () => {
    const SYSTEM_ID = '@ptah/daily-backup';
    scheduler.get.mockReturnValueOnce(makeJob());
    scheduler.listRuns.mockReturnValueOnce([]);
    scheduler.nextFire.mockReturnValueOnce(123);

    expect(service.get(SYSTEM_ID)).not.toBeNull();
    expect(scheduler.get).toHaveBeenCalledWith(SYSTEM_ID);
    expect(service.runs(SYSTEM_ID)).toEqual([]);
    expect(scheduler.listRuns).toHaveBeenCalledWith(SYSTEM_ID, {
      limit: undefined,
      offset: undefined,
    });
    expect(service.nextFire(SYSTEM_ID)).toBe(123);

    expect(service.delete(SYSTEM_ID)).toBe(false);
    expect(scheduler.delete).not.toHaveBeenCalled();

    // Other stored system ids are readable too; a plain word is not an id.
    scheduler.get.mockReturnValueOnce(makeJob());
    expect(service.get('@ptah/daily_backup')).not.toBeNull();
    expect(scheduler.get).toHaveBeenCalledWith('@ptah/daily_backup');
    expect(service.get('@ptah/with space')).toBeNull();
    expect(service.get('@')).toBeNull();
  });

  it('runs delegates with the paging options and returns [] for a malformed id', () => {
    scheduler.listRuns.mockReturnValue([makeRun()]);

    const runs = service.runs(JOB_ID, { limit: 5, offset: 10 });

    expect(scheduler.listRuns).toHaveBeenCalledWith(JOB_ID, {
      limit: 5,
      offset: 10,
    });
    expect(runs).toHaveLength(1);

    expect(service.runs(BAD_ID)).toEqual([]);
    expect(scheduler.listRuns).toHaveBeenCalledTimes(1);
  });

  it('runs returns run DTOs that carry sessionId', () => {
    scheduler.listRuns.mockReturnValue([
      makeRun(),
      makeRun({ sessionId: null, status: 'failed', errorMessage: 'boom' }),
    ]);

    const runs = service.runs(JOB_ID);

    expect(runs[0]).toEqual({
      id: RUN_ID,
      jobId: JOB_ID,
      scheduledFor: 1_700_000_600_000,
      startedAt: 1_700_000_600_010,
      endedAt: 1_700_000_601_000,
      status: 'succeeded',
      resultSummary: 'done',
      errorMessage: null,
      sessionId: 'session-abc',
    });
    expect(runs[1].sessionId).toBeNull();
    expect(runs[1].errorMessage).toBe('boom');
  });

  it('nextFire delegates to the scheduler and returns null for a malformed id', () => {
    scheduler.nextFire.mockReturnValue(1_700_000_600_000);

    expect(service.nextFire(JOB_ID)).toBe(1_700_000_600_000);
    expect(scheduler.nextFire).toHaveBeenCalledWith(JOB_ID);

    expect(service.nextFire(BAD_ID)).toBeNull();
    expect(scheduler.nextFire).toHaveBeenCalledTimes(1);
  });

  describe('previewNextFire', () => {
    it('returns the requested number of increasing epoch-ms fire times', () => {
      const times = service.previewNextFire('*/5 * * * *', 'UTC', 3);

      expect(times).toHaveLength(3);
      for (const time of times) {
        expect(typeof time).toBe('number');
        expect(Number.isInteger(time)).toBe(true);
      }
      expect(times[0]).toBeGreaterThan(Date.now() - 1000);
      expect(times[1]).toBeGreaterThan(times[0]);
      expect(times[2]).toBeGreaterThan(times[1]);
    });

    it('rejects a bad expression', () => {
      expectValidationError(
        () => service.previewNextFire('not a cron', 'UTC', 3),
        'cronExpr',
      );
    });
  });
});

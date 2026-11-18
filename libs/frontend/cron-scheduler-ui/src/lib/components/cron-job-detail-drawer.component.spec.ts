import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { JobRunDto, ScheduledJobDto } from '@ptah-extension/shared';

import { CronJobDetailDrawerComponent } from './cron-job-detail-drawer.component';

const NOW = Date.UTC(2026, 10, 18, 12, 0, 0);

function makeJob(overrides: Partial<ScheduledJobDto> = {}): ScheduledJobDto {
  return {
    id: 'job-1',
    name: 'Nightly dependency audit',
    cronExpr: '0 3 * * *',
    timezone: 'Europe/Berlin',
    prompt: 'Audit the dependencies and report outdated packages.',
    workspaceRoot: '/home/dev/project',
    enabled: true,
    createdAt: NOW - 86_400_000,
    updatedAt: NOW - 3_600_000,
    lastRunAt: NOW - 3_600_000,
    nextRunAt: NOW + 3_600_000,
    createdBy: { kind: 'user' },
    lastRunStatus: 'succeeded',
    ...overrides,
  } as ScheduledJobDto;
}

function makeRun(overrides: Partial<JobRunDto> = {}): JobRunDto {
  return {
    id: 'run-1',
    jobId: 'job-1',
    scheduledFor: NOW - 3_600_000,
    startedAt: NOW - 3_600_000,
    endedAt: NOW - 3_500_000,
    status: 'succeeded',
    resultSummary: 'All packages are current.',
    errorMessage: null,
    sessionId: 'session-run-1',
    ...overrides,
  } as JobRunDto;
}

describe('CronJobDetailDrawerComponent', () => {
  let fixture: ComponentFixture<CronJobDetailDrawerComponent>;

  /**
   * The drawer may render through a native `<dialog>` or an overlay, so the
   * queries cover the whole document and not only the fixture host.
   */
  function query<T extends HTMLElement = HTMLElement>(
    selector: string,
  ): T | null {
    return document.body.querySelector<T>(selector);
  }

  function queryAll(selector: string): HTMLElement[] {
    return Array.from(document.body.querySelectorAll<HTMLElement>(selector));
  }

  function byTestId<T extends HTMLElement = HTMLElement>(id: string): T | null {
    return query<T>(`[data-testid="${id}"]`);
  }

  async function render(
    inputs: {
      job?: ScheduledJobDto | null;
      runs?: readonly JobRunDto[];
      description?: string;
    } = {},
  ): Promise<void> {
    fixture = TestBed.createComponent(CronJobDetailDrawerComponent);
    if ('job' in inputs) fixture.componentRef.setInput('job', inputs.job);
    if ('runs' in inputs) fixture.componentRef.setInput('runs', inputs.runs);
    if ('description' in inputs) {
      fixture.componentRef.setInput('description', inputs.description);
    }
    await settle();
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function click(id: string): Promise<void> {
    const element = byTestId<HTMLButtonElement>(id);
    if (element === null) {
      throw new Error(`No element with data-testid="${id}"`);
    }
    element.click();
    await settle();
  }

  /** Confirm button of the inline delete confirmation, once it is showing. */
  function confirmButton(): HTMLButtonElement | null {
    const tagged = byTestId<HTMLButtonElement>('cron-drawer-delete-confirm');
    if (tagged !== null) return tagged;
    const buttons = queryAll('ptah-inline-confirm button');
    const match = buttons.find(
      (button) => button.textContent?.trim() === 'Delete',
    );
    return (match as HTMLButtonElement | undefined) ?? null;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CronJobDetailDrawerComponent],
    }).compileComponents();
  });

  describe('without a job', () => {
    it('shows no job content', async () => {
      await render({ job: null });

      expect(byTestId('cron-drawer-run-now')).toBeNull();
      expect(byTestId('cron-drawer-edit')).toBeNull();
      expect(byTestId('cron-drawer-toggle')).toBeNull();
      expect(byTestId('cron-drawer-delete')).toBeNull();
      expect(byTestId('cron-drawer-prompt')).toBeNull();
      expect(query('ptah-cron-run-history')).toBeNull();
    });
  });

  describe('with a job', () => {
    it('shows the name, the prompt and the four actions', async () => {
      const job = makeJob();
      await render({ job, description: 'Every day at 03:00' });

      expect(query('h2')?.textContent).toContain(job.name);
      expect(byTestId('cron-drawer-prompt')?.textContent).toContain(job.prompt);
      expect(byTestId('cron-drawer-run-now')).not.toBeNull();
      expect(byTestId('cron-drawer-edit')).not.toBeNull();
      expect(byTestId('cron-drawer-toggle')).not.toBeNull();
      expect(byTestId('cron-drawer-delete')).not.toBeNull();
    });

    it('shows the schedule description beside the cron expression', async () => {
      const job = makeJob();
      await render({ job, description: 'Every day at 03:00' });

      const schedule = byTestId('cron-drawer-schedule')?.textContent ?? '';
      expect(schedule).toContain('Every day at 03:00');
      expect(schedule).toContain(job.cronExpr);
    });

    it('labels the toggle by the current state of the job', async () => {
      await render({ job: makeJob({ enabled: true }) });
      expect(byTestId('cron-drawer-toggle')?.textContent).toContain('Disable');

      fixture.componentRef.setInput('job', makeJob({ enabled: false }));
      await settle();
      expect(byTestId('cron-drawer-toggle')?.textContent).toContain('Enable');
      expect(byTestId('cron-drawer-next-run')?.textContent).toContain('Paused');
    });

    it('says "Created by you" for a job the user created', async () => {
      await render({ job: makeJob({ createdBy: { kind: 'user' } }) });

      const creator = byTestId('cron-drawer-creator')?.textContent ?? '';
      expect(creator).toContain('Created by you');
      expect(creator).not.toContain('agent session');
    });

    it('shows the session id for a job an agent session created', async () => {
      await render({
        job: makeJob({
          createdBy: { kind: 'session', sessionId: 'sess-abc-123' },
        }),
      });

      const creator = byTestId('cron-drawer-creator')?.textContent ?? '';
      expect(creator).toContain('sess-abc-123');
      expect(creator).not.toContain('Created by you');
    });

    it('renders the run history with one row per run', async () => {
      const runs = [
        makeRun({ id: 'run-3', status: 'failed', errorMessage: 'Timed out' }),
        makeRun({ id: 'run-2' }),
        makeRun({ id: 'run-1' }),
      ];
      await render({ job: makeJob(), runs });

      expect(query('ptah-cron-run-history')).not.toBeNull();
      expect(queryAll('[data-testid="cron-run-row"]')).toHaveLength(
        runs.length,
      );
    });

    it('emits runNow, edit and toggled from their buttons', async () => {
      await render({ job: makeJob() });
      const runNow = jest.fn();
      const edit = jest.fn();
      const toggled = jest.fn();
      fixture.componentInstance.runNow.subscribe(runNow);
      fixture.componentInstance.edit.subscribe(edit);
      fixture.componentInstance.toggled.subscribe(toggled);

      await click('cron-drawer-run-now');
      expect(runNow).toHaveBeenCalledTimes(1);
      expect(edit).not.toHaveBeenCalled();
      expect(toggled).not.toHaveBeenCalled();

      await click('cron-drawer-edit');
      expect(edit).toHaveBeenCalledTimes(1);

      await click('cron-drawer-toggle');
      expect(toggled).toHaveBeenCalledTimes(1);
      expect(runNow).toHaveBeenCalledTimes(1);
    });

    it('does not emit removed on the first delete press', async () => {
      await render({ job: makeJob() });
      const removed = jest.fn();
      fixture.componentInstance.removed.subscribe(removed);

      await click('cron-drawer-delete');

      expect(removed).not.toHaveBeenCalled();
      expect(confirmButton()).not.toBeNull();
      expect(byTestId('cron-drawer-delete')).toBeNull();
    });

    it('emits removed after the inline confirm is accepted', async () => {
      await render({ job: makeJob() });
      const removed = jest.fn();
      fixture.componentInstance.removed.subscribe(removed);

      await click('cron-drawer-delete');
      const confirm = confirmButton();
      expect(confirm).not.toBeNull();
      confirm?.click();
      await settle();

      expect(removed).toHaveBeenCalledTimes(1);
      expect(byTestId('cron-drawer-delete')).not.toBeNull();
    });

    it('does not emit removed when the inline confirm is cancelled', async () => {
      await render({ job: makeJob() });
      const removed = jest.fn();
      fixture.componentInstance.removed.subscribe(removed);

      await click('cron-drawer-delete');
      await click('cron-drawer-delete-cancel');

      expect(removed).not.toHaveBeenCalled();
      expect(confirmButton()).toBeNull();
      expect(byTestId('cron-drawer-delete')).not.toBeNull();
    });

    it('drops a pending delete confirmation when another job is selected', async () => {
      await render({ job: makeJob({ id: 'job-1' }) });
      await click('cron-drawer-delete');
      expect(confirmButton()).not.toBeNull();

      fixture.componentRef.setInput(
        'job',
        makeJob({ id: 'job-2', name: 'Weekly report' }),
      );
      await settle();

      expect(confirmButton()).toBeNull();
      expect(byTestId('cron-drawer-delete')).not.toBeNull();
    });
  });
});

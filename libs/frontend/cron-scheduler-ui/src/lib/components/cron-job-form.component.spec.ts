import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import type { ScheduledJobDto } from '@ptah-extension/shared';

import { CronStateService } from '../services/cron-state.service';
import { CronJobFormComponent } from './cron-job-form.component';

function makeJob(overrides: Partial<ScheduledJobDto> = {}): ScheduledJobDto {
  return {
    id: 'job-1',
    name: 'Nightly digest',
    cronExpr: '0 3 * * *',
    timezone: 'Pacific/Auckland',
    prompt: 'Summarise the open pull requests',
    workspaceRoot: '/repos/app',
    enabled: false,
    createdAt: 1,
    updatedAt: 1,
    lastRunAt: null,
    nextRunAt: null,
    createdBy: { kind: 'user' },
    lastRunStatus: null,
    ...overrides,
  };
}

describe('CronJobFormComponent', () => {
  let fixture: ComponentFixture<CronJobFormComponent>;
  let stateMock: {
    create: jest.Mock;
    update: jest.Mock;
    error: ReturnType<typeof signal<string | null>>;
    loading: ReturnType<typeof signal<boolean>>;
  };
  let saved: jest.Mock;
  let cancelled: jest.Mock;

  function setup(
    inputs: {
      job?: ScheduledJobDto | null;
      defaultWorkspaceRoot?: string | null;
      open?: boolean;
    } = {},
  ): void {
    fixture = TestBed.createComponent(CronJobFormComponent);
    fixture.componentRef.setInput('open', inputs.open ?? true);
    fixture.componentRef.setInput('job', inputs.job ?? null);
    fixture.componentRef.setInput(
      'defaultWorkspaceRoot',
      inputs.defaultWorkspaceRoot ?? null,
    );
    saved = jest.fn();
    cancelled = jest.fn();
    fixture.componentInstance.saved.subscribe(saved);
    fixture.componentInstance.cancelled.subscribe(cancelled);
    fixture.detectChanges();
  }

  function query<T extends HTMLElement>(testId: string): T | null {
    return (fixture.nativeElement as HTMLElement).querySelector<T>(
      `[data-testid="${testId}"]`,
    );
  }

  function control(testId: string): HTMLInputElement | HTMLTextAreaElement {
    const el = query<HTMLInputElement | HTMLTextAreaElement>(testId);
    if (!el) throw new Error(`missing control ${testId}`);
    return el;
  }

  function type(testId: string, value: string): void {
    const el = control(testId);
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  }

  async function submit(): Promise<void> {
    control('cron-form-submit').click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function fillValidForm(): void {
    type('cron-form-name', 'Every five');
    type('cron-form-expr', '*/5 * * * *');
    type('cron-form-prompt', 'Check the build');
  }

  beforeEach(() => {
    stateMock = {
      create: jest.fn().mockResolvedValue(makeJob({ id: 'created' })),
      update: jest.fn().mockResolvedValue(makeJob()),
      error: signal<string | null>(null),
      loading: signal(false),
    };
    TestBed.configureTestingModule({
      imports: [CronJobFormComponent],
      providers: [{ provide: CronStateService, useValue: stateMock }],
    });
  });

  it('creates a job with the default workspace and emits saved', async () => {
    setup({ defaultWorkspaceRoot: '/repos/default' });

    expect(control('cron-form-submit').textContent?.trim()).toBe('Create job');
    expect(control('cron-form-workspace').value).toBe('/repos/default');

    fillValidForm();
    await submit();

    expect(stateMock.create).toHaveBeenCalledTimes(1);
    expect(stateMock.create).toHaveBeenCalledWith({
      name: 'Every five',
      cronExpr: '*/5 * * * *',
      prompt: 'Check the build',
      workspaceRoot: '/repos/default',
      timezone: expect.any(String),
      enabled: true,
    });
    expect(stateMock.update).not.toHaveBeenCalled();
    expect(saved).toHaveBeenCalledTimes(1);
  });

  it('sends a null workspace root when the field is empty', async () => {
    setup({ defaultWorkspaceRoot: '/repos/default' });

    fillValidForm();
    type('cron-form-workspace', '   ');
    await submit();

    expect(stateMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceRoot: null }),
    );
  });

  it('prefills the fields of an edited job and updates it by id', async () => {
    const job = makeJob();
    setup({ job, defaultWorkspaceRoot: '/repos/default' });

    expect(control('cron-form-submit').textContent?.trim()).toBe(
      'Save changes',
    );
    expect(control('cron-form-name').value).toBe('Nightly digest');
    expect(control('cron-form-expr').value).toBe('0 3 * * *');
    expect(control('cron-form-prompt').value).toBe(
      'Summarise the open pull requests',
    );
    expect(control('cron-form-workspace').value).toBe('/repos/app');
    expect((control('cron-form-enabled') as HTMLInputElement).checked).toBe(
      false,
    );

    type('cron-form-name', 'Morning digest');
    await submit();

    expect(stateMock.update).toHaveBeenCalledTimes(1);
    expect(stateMock.update).toHaveBeenCalledWith('job-1', {
      name: 'Morning digest',
      cronExpr: '0 3 * * *',
      prompt: 'Summarise the open pull requests',
      workspaceRoot: '/repos/app',
      // The job's own timezone is kept even though it is not a suggested one.
      timezone: 'Pacific/Auckland',
      enabled: false,
    });
    expect(stateMock.create).not.toHaveBeenCalled();
    expect(saved).toHaveBeenCalledTimes(1);
  });

  it('keeps typed values when a list refresh replaces the job object', () => {
    setup({ job: makeJob() });

    type('cron-form-name', 'Edited name');
    fixture.componentRef.setInput(
      'job',
      makeJob({ updatedAt: 2, name: 'Server name' }),
    );
    fixture.detectChanges();

    expect(control('cron-form-name').value).toBe('Edited name');
  });

  it('blocks the save on an invalid expression and reports the field count', async () => {
    setup();

    type('cron-form-name', 'Broken');
    type('cron-form-expr', 'not a cron');
    type('cron-form-prompt', 'Check the build');
    await submit();

    expect(stateMock.create).not.toHaveBeenCalled();
    expect(saved).not.toHaveBeenCalled();
    expect(query('cron-form-invalid-summary')?.textContent).toContain(
      'Fix 1 field before you save.',
    );
    expect(document.activeElement).toBe(control('cron-form-expr'));
  });

  it('counts every invalid field and focuses the first one', async () => {
    setup();

    await submit();

    expect(stateMock.create).not.toHaveBeenCalled();
    expect(query('cron-form-invalid-summary')?.textContent).toContain(
      'Fix 3 fields before you save.',
    );
    expect(document.activeElement).toBe(control('cron-form-name'));
  });

  it('rejects a prompt that names a reserved internal handler', async () => {
    setup();

    type('cron-form-name', 'Internal');
    type('cron-form-expr', '*/5 * * * *');
    type('cron-form-prompt', '  Handler:memory:decay');
    await submit();

    expect(stateMock.create).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'reserved for internal jobs',
    );
  });

  it('stays open and shows the service error when the save returns null', async () => {
    stateMock.create.mockImplementation(async () => {
      stateMock.error.set('cron:create failed: unknown timezone');
      return null;
    });
    setup();

    fillValidForm();
    await submit();

    expect(stateMock.create).toHaveBeenCalledTimes(1);
    expect(saved).not.toHaveBeenCalled();
    expect(query('cron-form-save-error')?.textContent).toContain(
      'cron:create failed: unknown timezone',
    );
    expect(control('cron-form-name').value).toBe('Every five');
    expect(control('cron-form-submit').hasAttribute('disabled')).toBe(false);
  });

  it('emits cancelled without saving', () => {
    setup();

    type('cron-form-name', 'Discard me');
    control('cron-form-cancel').click();
    fixture.detectChanges();

    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(saved).not.toHaveBeenCalled();
    expect(stateMock.create).not.toHaveBeenCalled();
    expect(control('cron-form-name').value).toBe('');
  });

  it('sets the expression from a preset and marks it selected', () => {
    setup();

    control('cron-form-preset-daily').click();
    fixture.detectChanges();

    expect(control('cron-form-expr').value).toBe('0 9 * * *');
    expect(control('cron-form-preset-daily').getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(document.activeElement).toBe(control('cron-form-expr'));
  });

  it('renders the Enabled toggle inside ptah-setting-row', () => {
    setup();

    expect(
      query('cron-form-enabled')?.closest('ptah-setting-row'),
    ).not.toBeNull();
  });

  it('starts empty when the drawer is opened a second time for a new job', () => {
    setup();
    type('cron-form-name', 'First job');

    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    expect(query('cron-form-name')).toBeNull();

    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    expect(control('cron-form-name').value).toBe('');
  });
});

import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { ScheduledJobDto } from '@ptah-extension/shared';

import { CRON_JOB_LIST_ID } from './cron-header-band.component';
import { CronJobCardComponent } from './cron-job-card.component';
import {
  CRON_JOB_SEARCH_THRESHOLD,
  CronJobListComponent,
} from './cron-job-list.component';

function makeJob(overrides: Partial<ScheduledJobDto> = {}): ScheduledJobDto {
  return {
    id: 'job-1',
    name: 'Nightly build',
    cronExpr: '0 2 * * *',
    timezone: 'UTC',
    prompt: 'Run the nightly build',
    workspaceRoot: null,
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
    lastRunAt: null,
    nextRunAt: null,
    createdBy: { kind: 'user' },
    lastRunStatus: null,
    ...overrides,
  };
}

function makeJobs(count: number): ScheduledJobDto[] {
  return Array.from({ length: count }, (_, index) =>
    makeJob({ id: `job-${index + 1}`, name: `Routine ${index + 1}` }),
  );
}

describe('CronJobListComponent', () => {
  function render(
    jobs: readonly ScheduledJobDto[],
    loading = false,
    selectedJobId: string | null = null,
  ): ComponentFixture<CronJobListComponent> {
    TestBed.configureTestingModule({ imports: [CronJobListComponent] });
    const fixture = TestBed.createComponent(CronJobListComponent);
    fixture.componentRef.setInput('jobs', jobs);
    fixture.componentRef.setInput('loading', loading);
    fixture.componentRef.setInput('selectedJobId', selectedJobId);
    fixture.detectChanges();
    return fixture;
  }

  function byTestId(
    fixture: ComponentFixture<CronJobListComponent>,
    id: string,
  ): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(
      `[data-testid="${id}"]`,
    );
  }

  function cards(
    fixture: ComponentFixture<CronJobListComponent>,
  ): CronJobCardComponent[] {
    return fixture.debugElement
      .queryAll(By.directive(CronJobCardComponent))
      .map((card) => card.componentInstance as CronJobCardComponent);
  }

  function search(
    fixture: ComponentFixture<CronJobListComponent>,
    text: string,
  ): void {
    const field = (fixture.nativeElement as HTMLElement).querySelector(
      'input[type="search"]',
    ) as HTMLInputElement;
    field.value = text;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('heads the region and exposes the id the instrument band targets', () => {
    const fixture = render(makeJobs(2));
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector(`#${CRON_JOB_LIST_ID}`)).not.toBeNull();
    expect(root.querySelector('h2')?.textContent?.trim()).toBe(
      'Scheduled jobs',
    );
  });

  it('wraps the rows in one surface list with a count badge', () => {
    const fixture = render(makeJobs(5));
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('ul > li ptah-cron-job-card')).toHaveLength(5);
    expect(byTestId(fixture, 'cron-job-count')?.textContent?.trim()).toBe(
      '5 jobs',
    );
    expect(root.textContent).toContain('Select a job to see runs');
    TestBed.resetTestingModule();

    const single = render(makeJobs(1));
    expect(byTestId(single, 'cron-job-count')?.textContent?.trim()).toBe(
      '1 job',
    );
  });

  it('renders one card per job with the described schedule and the selection', () => {
    const fixture = render(
      [
        makeJob({ id: 'a', cronExpr: '*/5 * * * *' }),
        makeJob({ id: 'b', name: 'Weekly digest' }),
      ],
      false,
      'b',
    );
    const rendered = cards(fixture);
    expect(rendered).toHaveLength(2);
    expect(rendered[0].description()).toBe('Every 5 minutes');
    expect(rendered[0].selected()).toBe(false);
    expect(rendered[1].selected()).toBe(true);
  });

  it('hides the search field up to the threshold and shows it above', () => {
    const atThreshold = render(makeJobs(CRON_JOB_SEARCH_THRESHOLD));
    expect(byTestId(atThreshold, 'cron-job-search')).toBeNull();
    TestBed.resetTestingModule();

    const above = render(makeJobs(CRON_JOB_SEARCH_THRESHOLD + 1));
    expect(byTestId(above, 'cron-job-search')).not.toBeNull();
    expect(cards(above)).toHaveLength(CRON_JOB_SEARCH_THRESHOLD + 1);
  });

  it('filters by name, expression and prompt', () => {
    const jobs = [
      ...makeJobs(5),
      makeJob({ id: 'by-name', name: 'Weekly digest' }),
      makeJob({ id: 'by-expr', cronExpr: '15 9 * * 1' }),
      makeJob({ id: 'by-prompt', prompt: 'Summarise open pull requests' }),
    ];
    const fixture = render(jobs);
    const ids = () => cards(fixture).map((card) => card.job().id);

    search(fixture, 'DIGEST');
    expect(ids()).toEqual(['by-name']);

    search(fixture, '15 9');
    expect(ids()).toEqual(['by-expr']);

    search(fixture, 'pull requests');
    expect(ids()).toEqual(['by-prompt']);

    search(fixture, '   ');
    expect(ids()).toHaveLength(jobs.length);
  });

  it('says so when no job matches the search', () => {
    const fixture = render(makeJobs(7));
    search(fixture, 'zzz');
    expect(cards(fixture)).toHaveLength(0);
    expect(byTestId(fixture, 'cron-no-matches')?.textContent).toContain(
      'No jobs match',
    );
    expect(byTestId(fixture, 'cron-empty-state')).toBeNull();
  });

  it('drops a hidden query when the list shrinks under the threshold', () => {
    const fixture = render(makeJobs(7));
    search(fixture, 'Routine 7');
    expect(cards(fixture)).toHaveLength(1);

    fixture.componentRef.setInput('jobs', makeJobs(3));
    fixture.detectChanges();
    expect(byTestId(fixture, 'cron-job-search')).toBeNull();
    expect(cards(fixture)).toHaveLength(3);
  });

  it('shows skeleton rows while the first load is pending', () => {
    const fixture = render([], true);
    const skeletons = byTestId(fixture, 'cron-job-skeletons');
    expect(skeletons?.querySelectorAll('ptah-skeleton')).toHaveLength(3);
    expect(skeletons?.textContent).toContain('Loading scheduled jobs');
    expect(byTestId(fixture, 'cron-empty-state')).toBeNull();
  });

  it('offers one action in the empty state and emits newJob from it', () => {
    const fixture = render([]);
    let requested = 0;
    fixture.componentInstance.newJob.subscribe(() => requested++);

    const empty = byTestId(fixture, 'cron-empty-state');
    expect(empty?.textContent).toContain('No scheduled jobs yet');
    const actions = empty?.querySelectorAll('button') ?? [];
    expect(actions).toHaveLength(1);
    expect(actions[0].textContent?.trim()).toBe('New job');

    actions[0].click();
    expect(requested).toBe(1);
  });

  it('re-emits each card action with the job or its id', () => {
    const job = makeJob({ id: 'job-9' });
    const fixture = render([job]);
    const list = fixture.componentInstance;
    const events: unknown[] = [];
    list.opened.subscribe((id) => events.push(['opened', id]));
    list.runNow.subscribe((id) => events.push(['runNow', id]));
    list.edit.subscribe((value) => events.push(['edit', value]));
    list.toggled.subscribe((value) => events.push(['toggled', value]));
    list.removed.subscribe((id) => events.push(['removed', id]));

    const card = cards(fixture)[0];
    card.opened.emit();
    card.runNow.emit();
    card.edit.emit();
    card.toggled.emit();
    card.removed.emit();

    expect(events).toEqual([
      ['opened', 'job-9'],
      ['runNow', 'job-9'],
      ['edit', job],
      ['toggled', job],
      ['removed', 'job-9'],
    ]);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { ScheduledJobDto } from '@ptah-extension/shared';

import { CronJobCardComponent } from './cron-job-card.component';

const SESSION_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeJob(overrides: Partial<ScheduledJobDto> = {}): ScheduledJobDto {
  return {
    id: 'job-1',
    name: 'Nightly digest',
    cronExpr: '0 9 * * 1-5',
    timezone: 'UTC',
    prompt: 'Summarise the open pull requests',
    workspaceRoot: '/work/repo',
    enabled: true,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    lastRunAt: null,
    nextRunAt: null,
    createdBy: { kind: 'user' },
    lastRunStatus: null,
    ...overrides,
  };
}

describe('CronJobCardComponent', () => {
  let fixture: ComponentFixture<CronJobCardComponent>;
  let host: HTMLElement;

  function render(job: ScheduledJobDto): void {
    fixture = TestBed.createComponent(CronJobCardComponent);
    fixture.componentRef.setInput('job', job);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
  }

  function byTestId(testId: string): HTMLElement | null {
    return host.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  }

  function textOf(testId: string): string {
    return (byTestId(testId)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  function buttonByLabel(label: string): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    );
    if (!button) throw new Error(`No button with aria-label "${label}"`);
    return button;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CronJobCardComponent],
    }).compileComponents();
  });

  describe('rendering', () => {
    it('renders the card with the job name and the cron expression', () => {
      render(makeJob());

      const card = byTestId('cron-job-card');
      expect(card).not.toBeNull();
      expect(card?.textContent).toContain('Nightly digest');
      expect(textOf('cron-job-schedule')).toContain('0 9 * * 1-5');
    });

    it('says "Created by you" for a job the user created', () => {
      render(makeJob({ createdBy: { kind: 'user' } }));

      expect(textOf('cron-job-creator')).toBe('Created by you');
    });

    it('names the agent session and shows the first 8 characters of its id', () => {
      render(
        makeJob({ createdBy: { kind: 'session', sessionId: SESSION_ID } }),
      );

      const creator = textOf('cron-job-creator');
      expect(creator).toContain('Created by agent session');
      expect(creator).toContain('a1b2c3d4');
      expect(creator).not.toContain(SESSION_ID);
      expect(creator).not.toContain('Created by you');
    });

    it('shows "Failed" when the last run failed', () => {
      render(
        makeJob({ lastRunStatus: 'failed', lastRunAt: 1_700_000_100_000 }),
      );

      expect(byTestId('cron-job-last-status')).not.toBeNull();
      expect(textOf('cron-job-last-run')).toContain('Failed');
      expect(textOf('cron-job-last-run')).not.toContain('No runs yet');
    });

    it('shows "No runs yet" when the job never ran', () => {
      render(makeJob({ lastRunStatus: null, lastRunAt: null }));

      expect(byTestId('cron-job-last-status')).toBeNull();
      // The small "Last" label is part of the cell below `lg`.
      expect(textOf('cron-job-last-run')).toBe('LastNo runs yet');
    });

    it('shows "Paused" for a disabled job and not for an enabled one', () => {
      render(makeJob({ enabled: false }));
      expect(textOf('cron-job-paused')).toBe('Paused');

      render(makeJob({ enabled: true }));
      expect(byTestId('cron-job-paused')).toBeNull();
    });
  });

  describe('actions', () => {
    function runNowButton(): HTMLButtonElement {
      const button = Array.from(host.querySelectorAll('button')).find((b) =>
        (b.textContent ?? '').includes('Run now'),
      );
      if (!button) throw new Error('No "Run now" button');
      return button;
    }

    it('emits runNow without opening the row when "Run now" is pressed', () => {
      render(makeJob());
      const runNow = jest.fn();
      const opened = jest.fn();
      fixture.componentInstance.runNow.subscribe(runNow);
      fixture.componentInstance.opened.subscribe(opened);

      runNowButton().click();

      expect(runNow).toHaveBeenCalledTimes(1);
      expect(opened).not.toHaveBeenCalled();
    });

    it('renders no Edit button in the row', () => {
      render(makeJob());

      expect(host.querySelector('button[aria-label="Edit job"]')).toBeNull();
    });

    it('does not make the row root a focusable control', () => {
      render(makeJob());
      const row = byTestId('cron-job-card') as HTMLElement;

      expect(row.hasAttribute('role')).toBe(false);
      expect(row.hasAttribute('tabindex')).toBe(false);
      expect(row.classList.contains('relative')).toBe(true);
    });

    it('opens details from a native button that holds no action button', () => {
      render(makeJob());
      const open = byTestId('cron-job-open') as HTMLElement;

      expect(open.tagName).toBe('BUTTON');
      expect(open.getAttribute('type')).toBe('button');
      expect(open.getAttribute('aria-label')).toBe(
        'Open details for Nightly digest',
      );
      expect(open.textContent?.trim()).toBe('Nightly digest');
      expect(open.querySelector('button')).toBeNull();
      const actions = host.querySelectorAll('[data-row-actions] button');
      expect(actions.length).toBeGreaterThan(0);
      for (const action of Array.from(actions)) {
        expect(open.contains(action)).toBe(false);
      }
    });

    it('emits opened exactly once when the open button is clicked', () => {
      render(makeJob());
      const opened = jest.fn();
      fixture.componentInstance.opened.subscribe(opened);

      (byTestId('cron-job-open') as HTMLElement).click();

      expect(opened).toHaveBeenCalledTimes(1);
    });

    it('marks the selected row with aria-current', () => {
      render(makeJob());
      expect(byTestId('cron-job-card')?.hasAttribute('aria-current')).toBe(
        false,
      );
      fixture.componentRef.setInput('selected', true);
      fixture.detectChanges();
      expect(byTestId('cron-job-card')?.getAttribute('aria-current')).toBe(
        'true',
      );
    });

    it('emits toggled when "Pause job" is pressed', () => {
      render(makeJob({ enabled: true }));
      const toggled = jest.fn();
      fixture.componentInstance.toggled.subscribe(toggled);

      buttonByLabel('Pause job').click();

      expect(toggled).toHaveBeenCalledTimes(1);
    });

    it('offers "Resume job" for a paused job', () => {
      render(makeJob({ enabled: false }));

      expect(buttonByLabel('Resume job')).not.toBeNull();
    });

    it('replaces the actions with the confirm and cancels back to them', () => {
      render(makeJob());
      buttonByLabel('Delete job').click();
      fixture.detectChanges();
      expect(host.querySelector('button[aria-label="Pause job"]')).toBeNull();

      host
        .querySelector<HTMLButtonElement>(
          'button[data-testid="cron-job-delete-cancel"]',
        )
        ?.click();
      fixture.detectChanges();

      expect(host.querySelector('ptah-inline-confirm')).toBeNull();
      expect(buttonByLabel('Pause job')).not.toBeNull();
    });

    it('asks for confirmation before it emits removed', () => {
      render(makeJob());
      const removed = jest.fn();
      fixture.componentInstance.removed.subscribe(removed);
      expect(host.querySelector('ptah-inline-confirm')).toBeNull();

      buttonByLabel('Delete job').click();
      fixture.detectChanges();

      expect(removed).not.toHaveBeenCalled();
      const confirm = host.querySelector('ptah-inline-confirm');
      expect(confirm).not.toBeNull();
      expect(confirm?.textContent).toContain('Delete Nightly digest?');

      const confirmButton = confirm?.querySelector<HTMLButtonElement>(
        'button[data-testid="cron-job-delete-confirm"]',
      );
      expect(confirmButton).not.toBeNull();
      confirmButton?.click();
      fixture.detectChanges();

      expect(removed).toHaveBeenCalledTimes(1);
      expect(host.querySelector('ptah-inline-confirm')).toBeNull();
    });
  });
});

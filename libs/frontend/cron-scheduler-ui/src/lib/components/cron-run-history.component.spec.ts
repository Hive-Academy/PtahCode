import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { JobRunDto } from '@ptah-extension/shared';

import {
  COPY_FEEDBACK_MS,
  CronRunHistoryComponent,
} from './cron-run-history.component';

const SCHEDULED_FOR = Date.UTC(2026, 0, 15, 9, 0, 0);

function makeRun(overrides: Partial<JobRunDto> = {}): JobRunDto {
  return {
    id: 'run-1',
    jobId: 'job-1',
    scheduledFor: SCHEDULED_FOR,
    startedAt: SCHEDULED_FOR + 1_000,
    endedAt: SCHEDULED_FOR + 61_000,
    status: 'succeeded',
    resultSummary: null,
    errorMessage: null,
    sessionId: null,
    ...overrides,
  };
}

/** Lets the awaited clipboard write and the code after it run. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe('CronRunHistoryComponent', () => {
  let fixture: ComponentFixture<CronRunHistoryComponent>;
  let host: HTMLElement;
  let writeText: jest.Mock;

  function render(runs: readonly JobRunDto[]): void {
    fixture.componentRef.setInput('runs', runs);
    fixture.detectChanges();
  }

  function rows(): HTMLElement[] {
    return Array.from(
      host.querySelectorAll<HTMLElement>('[data-testid="cron-run-row"]'),
    );
  }

  function copyButtons(): HTMLButtonElement[] {
    return Array.from(
      host.querySelectorAll<HTMLButtonElement>(
        '[data-testid="cron-run-copy-session"]',
      ),
    );
  }

  function text(element: Element | null): string {
    return (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  beforeEach(async () => {
    writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    await TestBed.configureTestingModule({
      imports: [CronRunHistoryComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CronRunHistoryComponent);
    host = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    fixture.destroy();
    jest.restoreAllMocks();
    jest.useRealTimers();
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  describe('empty state', () => {
    it('shows the empty text and no row when there are no runs', () => {
      render([]);

      expect(text(host.querySelector('[data-testid="cron-run-empty"]'))).toBe(
        'No runs recorded yet.',
      );
      expect(rows()).toHaveLength(0);
    });

    it('does not call an open or failed request an empty history', () => {
      fixture.componentRef.setInput('state', 'loading');
      render([]);
      expect(host.querySelector('[data-testid="cron-run-empty"]')).toBeNull();
      expect(
        host.querySelector('[data-testid="cron-run-loading"]'),
      ).not.toBeNull();

      fixture.componentRef.setInput('state', 'error');
      fixture.detectChanges();
      expect(host.querySelector('[data-testid="cron-run-empty"]')).toBeNull();
      expect(
        host
          .querySelector('[data-testid="cron-run-error"]')
          ?.getAttribute('role'),
      ).toBe('alert');
    });

    it('reports a failed request above the runs it already shows', () => {
      fixture.componentRef.setInput('state', 'error');
      render([makeRun()]);
      const alert = host.querySelector('[data-testid="cron-run-error"]');
      expect(alert?.getAttribute('role')).toBe('alert');
      expect(alert?.textContent).toContain('did not update');
      expect(host.querySelectorAll('li').length).toBe(1);
    });

    it('shows that a refresh of listed runs is in progress', () => {
      fixture.componentRef.setInput('state', 'loading');
      render([makeRun()]);
      expect(
        host
          .querySelector('[data-testid="cron-run-updating"]')
          ?.getAttribute('role'),
      ).toBe('status');
      expect(host.querySelector('[data-testid="cron-run-loading"]')).toBeNull();
      expect(host.querySelectorAll('li').length).toBe(1);
    });

    it('hides the empty text when a run exists', () => {
      render([makeRun()]);

      expect(host.querySelector('[data-testid="cron-run-empty"]')).toBeNull();
    });
  });

  describe('rows', () => {
    it('renders one row per run', () => {
      render([
        makeRun({ id: 'run-1' }),
        makeRun({ id: 'run-2', status: 'failed' }),
        makeRun({ id: 'run-3', status: 'running', endedAt: null }),
      ]);

      expect(rows()).toHaveLength(3);
    });

    it.each([
      ['succeeded', 'Succeeded'],
      ['failed', 'Failed'],
      ['running', 'Running'],
      ['skipped', 'Skipped'],
      ['pending', 'Pending'],
    ] as const)('shows the label of a %s run', (status, label) => {
      render([makeRun({ status })]);

      expect(text(rows()[0])).toContain(label);
    });

    it('shows the status label of each run in its own row', () => {
      render([
        makeRun({ id: 'run-1', status: 'succeeded' }),
        makeRun({ id: 'run-2', status: 'failed' }),
      ]);

      const [first, second] = rows();
      expect(text(first)).toContain('Succeeded');
      expect(text(first)).not.toContain('Failed');
      expect(text(second)).toContain('Failed');
      expect(text(second)).not.toContain('Succeeded');
    });

    it('shows the error message of a failed run', () => {
      render([
        makeRun({
          status: 'failed',
          errorMessage: 'Agent exited with code 1',
        }),
      ]);

      expect(
        text(rows()[0].querySelector('[data-testid="cron-run-detail"]')),
      ).toBe('Agent exited with code 1');
    });

    it('shows the result summary of a succeeded run', () => {
      render([
        makeRun({ status: 'succeeded', resultSummary: 'Opened 2 issues' }),
      ]);

      expect(
        text(rows()[0].querySelector('[data-testid="cron-run-detail"]')),
      ).toBe('Opened 2 issues');
    });

    it('renders no detail line when a run has no summary and no error', () => {
      render([makeRun()]);

      expect(
        rows()[0].querySelector('[data-testid="cron-run-detail"]'),
      ).toBeNull();
    });

    it('says a run that never started was not started', () => {
      render([makeRun({ status: 'pending', startedAt: null, endedAt: null })]);

      expect(
        text(rows()[0].querySelector('[data-testid="cron-run-timing"]')),
      ).toBe('Not started');
    });
  });

  describe('session id', () => {
    it('shows the session id and a copy button when the run has one', () => {
      render([makeRun({ sessionId: 'sess-abc-123' })]);

      const row = rows()[0];
      expect(text(row.querySelector('[data-testid="cron-run-session"]'))).toBe(
        'sess-abc-123',
      );
      const button = row.querySelector<HTMLButtonElement>(
        '[data-testid="cron-run-copy-session"]',
      );
      expect(button).not.toBeNull();
      expect(button?.getAttribute('aria-label')).toBe(
        'Copy session id sess-abc-123',
      );
      expect(button?.getAttribute('type')).toBe('button');
    });

    it('shows no session id and no copy button when the run has none', () => {
      render([makeRun({ sessionId: null })]);

      const row = rows()[0];
      expect(row.querySelector('[data-testid="cron-run-session"]')).toBeNull();
      expect(copyButtons()).toHaveLength(0);
    });

    it('renders a copy button only in the rows that have a session id', () => {
      render([
        makeRun({ id: 'run-1', sessionId: 'sess-1' }),
        makeRun({ id: 'run-2', sessionId: null }),
        makeRun({ id: 'run-3', sessionId: 'sess-3' }),
      ]);

      expect(copyButtons()).toHaveLength(2);
      expect(
        rows()[1].querySelector('[data-testid="cron-run-copy-session"]'),
      ).toBeNull();
    });
  });

  describe('copy', () => {
    beforeEach(() => {
      // The component starts one feedback timer after each copy attempt.
      jest.useFakeTimers();
    });

    it('writes the session id of the clicked row to the clipboard', async () => {
      render([
        makeRun({ id: 'run-1', sessionId: 'sess-1' }),
        makeRun({ id: 'run-2', sessionId: 'sess-2' }),
      ]);

      copyButtons()[1].click();
      await flushMicrotasks();

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(writeText).toHaveBeenCalledWith('sess-2');
    });

    it('confirms the copy on the clicked row only, then resets', async () => {
      render([
        makeRun({ id: 'run-1', sessionId: 'sess-1' }),
        makeRun({ id: 'run-2', sessionId: 'sess-2' }),
      ]);

      copyButtons()[0].click();
      await flushMicrotasks();
      fixture.detectChanges();

      expect(text(copyButtons()[0])).toBe('Copied');
      expect(text(copyButtons()[1])).toBe('Copy');
      expect(
        text(host.querySelector('[data-testid="cron-run-copy-status"]')),
      ).toBe('Session id copied');

      jest.advanceTimersByTime(COPY_FEEDBACK_MS);
      fixture.detectChanges();

      expect(text(copyButtons()[0])).toBe('Copy');
      expect(
        text(host.querySelector('[data-testid="cron-run-copy-status"]')),
      ).toBe('');
    });

    it('reports a failed copy instead of claiming success', async () => {
      writeText.mockRejectedValueOnce(new Error('denied'));
      render([makeRun({ sessionId: 'sess-1' })]);

      copyButtons()[0].click();
      await flushMicrotasks();
      fixture.detectChanges();

      expect(text(copyButtons()[0])).toBe('Copy failed');
      expect(
        text(host.querySelector('[data-testid="cron-run-copy-status"]')),
      ).toBe('Could not copy the session id');
    });

    it('keeps the newer row feedback when an older write settles last', async () => {
      let settleFirst: () => void = () => undefined;
      writeText
        .mockImplementationOnce(
          () => new Promise<void>((resolve) => (settleFirst = resolve)),
        )
        .mockResolvedValueOnce(undefined);
      render([
        makeRun({ id: 'run-1', sessionId: 'sess-1' }),
        makeRun({ id: 'run-2', sessionId: 'sess-2' }),
      ]);

      copyButtons()[0].click();
      copyButtons()[1].click();
      await flushMicrotasks();
      settleFirst();
      await flushMicrotasks();
      fixture.detectChanges();

      expect(text(copyButtons()[1])).toBe('Copied');
      expect(text(copyButtons()[0])).toBe('Copy');
    });

    it('clears its feedback timer when the component is destroyed', async () => {
      // The framework keeps timers of its own, so the timer count is not a
      // usable signal: the test follows the handle of the feedback timer.
      const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
      const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
      render([makeRun({ sessionId: 'sess-1' })]);

      copyButtons()[0].click();
      await flushMicrotasks();

      const feedbackCall = setTimeoutSpy.mock.calls.findIndex(
        ([, delay]) => delay === COPY_FEEDBACK_MS,
      );
      expect(feedbackCall).toBeGreaterThanOrEqual(0);
      const handle: unknown = setTimeoutSpy.mock.results[feedbackCall].value;

      fixture.destroy();

      expect(clearTimeoutSpy).toHaveBeenCalledWith(handle);
    });
  });
});

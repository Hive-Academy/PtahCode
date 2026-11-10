import { TestBed } from '@angular/core/testing';
import { ClaudeRpcService } from '@ptah-extension/core';
import type { ReviewFinding, ReviewRun } from '@ptah-extension/review-contracts';
import { ReviewRunsStore } from '../review-runs.store';
import { ReviewRunsPageComponent } from './review-runs-page.component';

const run: ReviewRun = {
  repo: { owner: 'Hive-Academy', name: 'PtahCode' }, prNumber: 428,
  headSha: 'a'.repeat(40), attemptId: 'rvw-428', trigger: 'poll', configHash: 'b'.repeat(40),
  status: 'succeeded', createdAt: '2026-11-03T10:00:00.000Z', startedAt: '2026-11-03T10:00:01.000Z',
  completedAt: '2026-11-03T10:05:00.000Z', deadlineAt: '2026-11-03T11:00:00.000Z',
  coverage: [], stages: [],
};

const secondRun: ReviewRun = {
  repo: { owner: 'Hive-Academy', name: 'PtahCode' }, prNumber: 429,
  headSha: 'c'.repeat(40), attemptId: 'rvw-429', trigger: 'poll', configHash: 'b'.repeat(40),
  status: 'queued', createdAt: '2026-11-03T11:00:00.000Z', startedAt: null,
  completedAt: null, deadlineAt: '2026-11-03T12:00:00.000Z', coverage: [], stages: [],
};

const finding: ReviewFinding = {
  schemaVersion: 1, lens: 'security-privacy', title: 'Settings parsed without a schema',
  failureMode: 'A crafted settings file can change runtime behavior.',
  affectedBehavior: 'The settings loader accepts arbitrary keys.',
  scenario: 'A workspace contains a crafted settings file.', path: 'src/settings.ts', line: 42,
  evidence: [{ path: 'src/settings.ts', line: 42, excerpt: 'const parsed = JSON.parse(raw);' }],
  affectedCaller: 'loadSettings', severity: 'Major', category: 'security', confidence: 0.9,
  verification: 'cross-family', suggestedDiff: null,
  fixPrompt: 'Validate the parsed settings against a schema.',
};

/** Row buttons of the runs pane, excluding the repositories pane rows. */
function runRows(element: HTMLElement): NodeListOf<HTMLButtonElement> {
  return element.querySelectorAll('[aria-label="Review runs"] button');
}

describe('ReviewRunsPageComponent', () => {
  it('filters the visible list through the selects and the search box', async () => {
    const call = jest.fn().mockImplementation((method: string) => Promise.resolve({
      isSuccess: () => true,
      data: method === 'review:listRepositories'
        ? [{ owner: 'Hive-Academy', name: 'PtahCode', enabled: true, dryRun: true, publicationPaused: false }]
        : { runs: [{
            repo: { owner: 'Hive-Academy', name: 'PtahCode' }, prNumber: 428,
            headSha: 'a'.repeat(40), attemptId: 'rvw-428', trigger: 'poll', configHash: 'b'.repeat(40),
            status: 'queued', createdAt: '2026-11-03T10:00:00.000Z', startedAt: null,
            completedAt: null, deadlineAt: '2026-11-03T11:00:00.000Z', coverage: [], stages: [],
          }], nextCursor: null, poll: { status: null, error: null, lastSuccessAt: null, lastErrorAt: null } },
    }));
    TestBed.configureTestingModule({ imports: [ReviewRunsPageComponent], providers: [{ provide: ClaudeRpcService, useValue: { call } }] });
    const fixture = TestBed.createComponent(ReviewRunsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(runRows(fixture.nativeElement)).toHaveLength(1);
    const stateFilter = fixture.nativeElement.querySelector('#review-state-filter') as HTMLSelectElement;
    stateFilter.value = 'failed';
    stateFilter.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No matching runs');
    const clear = () => Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find((button) => button.textContent?.includes('Clear filters'));
    clear()?.click();
    fixture.detectChanges();
    expect(runRows(fixture.nativeElement)).toHaveLength(1);
    const search = fixture.nativeElement.querySelector('[aria-label="Search runs"]') as HTMLInputElement;
    search.value = '999';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No matching runs');
    clear()?.click();
    fixture.detectChanges();
    expect(runRows(fixture.nativeElement)).toHaveLength(1);
  });

  it('appends the next runs page through Load more until the cursor ends', async () => {
    const call = jest.fn().mockImplementation((method: string, params: { cursor?: string }) => Promise.resolve({
      isSuccess: () => true,
      data: method === 'review:listRepositories'
        ? [{ owner: 'Hive-Academy', name: 'PtahCode', enabled: true, dryRun: true, publicationPaused: false }]
        : method === 'review:listRuns'
          ? params?.cursor
            ? { runs: [secondRun], nextCursor: null, poll: { status: null, error: null, lastSuccessAt: null, lastErrorAt: null } }
            : { runs: [run], nextCursor: 'cursor-1', poll: { status: null, error: null, lastSuccessAt: null, lastErrorAt: null } }
          : { settings: null, hasToken: false },
    }));
    TestBed.configureTestingModule({ imports: [ReviewRunsPageComponent], providers: [{ provide: ClaudeRpcService, useValue: { call } }] });
    const fixture = TestBed.createComponent(ReviewRunsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(runRows(fixture.nativeElement)).toHaveLength(1);
    call.mockClear();
    (Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((button) => button.textContent?.includes('Load more')) as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(call).toHaveBeenCalledWith('review:listRuns', { limit: 100, cursor: 'cursor-1' }, expect.anything());
    expect(runRows(fixture.nativeElement)).toHaveLength(2);
    expect(fixture.nativeElement.textContent).not.toContain('Load more');
  });

  it('uses the header Refresh action to retry a failed poll', async () => {
    // The refreshed poll records a new error time, which ends the store's wait for the poll result.
    let refreshed = false;
    const call = jest.fn().mockImplementation((method: string) => {
      if (method === 'review:refresh') refreshed = true;
      return Promise.resolve({
        isSuccess: () => true,
        data: method === 'review:listRepositories'
          ? [{ owner: 'Hive-Academy', name: 'PtahCode', enabled: true, dryRun: true, publicationPaused: false }]
          : method === 'review:listRuns'
            ? { runs: [], nextCursor: null, poll: { status: 'failed', error: 'poll failed', lastSuccessAt: null,
              lastErrorAt: refreshed ? '2026-11-05T00:00:00.000Z' : null } }
            : method === 'review:refresh' ? { ok: true } : { settings: null, hasToken: false },
      });
    });
    TestBed.configureTestingModule({ imports: [ReviewRunsPageComponent], providers: [{ provide: ClaudeRpcService, useValue: { call } }] });
    const fixture = TestBed.createComponent(ReviewRunsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Retry with Refresh');
    call.mockClear();
    (fixture.nativeElement.querySelector('[aria-label="Refresh review runs"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(call.mock.calls.map(([method]) => method)).toEqual([
      'review:listRepositories', 'review:listRuns', 'review:refresh',
      'review:listRepositories', 'review:listRuns', 'review:listRuns',
    ]);
    expect(call).toHaveBeenCalledWith('review:listRuns',
      { repo: { owner: 'Hive-Academy', name: 'PtahCode' }, limit: 1 }, expect.anything());
  });

  it('routes failed-poll Retry to refresh and history-error Retry to load', async () => {
    const call = jest.fn().mockImplementation((method: string) => Promise.resolve({ isSuccess: () => true,
      data: method === 'review:listRepositories' ? [] : method === 'review:listRuns'
        ? { runs: [], nextCursor: null, poll: { status: 'failed', error: 'github-poll-failed', lastSuccessAt: null, lastErrorAt: null } }
        : { settings: null, hasToken: false } }));
    TestBed.configureTestingModule({ imports: [ReviewRunsPageComponent], providers: [{ provide: ClaudeRpcService, useValue: { call } }] });
    const fixture = TestBed.createComponent(ReviewRunsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const store = TestBed.inject(ReviewRunsStore);
    const refresh = jest.spyOn(store, 'refresh').mockResolvedValue();
    const load = jest.spyOn(store, 'load').mockResolvedValue();
    fixture.detectChanges();
    const buttons = () => Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>);
    buttons().find((button) => button.textContent?.includes('Retry with Refresh'))?.click();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(load).not.toHaveBeenCalled();
    store.poll.set(null);
    store.state.set('error');
    fixture.detectChanges();
    buttons().find((button) => button.textContent?.trim() === 'Retry')?.click();
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('pauses directly and confirms before resuming publication', async () => {
    const call = jest.fn().mockImplementation((method: string) => Promise.resolve({ isSuccess: () => true,
      data: method === 'review:listRepositories' ? [] : method === 'review:listRuns'
        ? { runs: [], nextCursor: null, poll: { status: null, error: null, lastSuccessAt: null, lastErrorAt: null } }
        : method === 'review:setPublicationPause' ? { ok: true } : { settings: null, hasToken: false } }));
    TestBed.configureTestingModule({ imports: [ReviewRunsPageComponent], providers: [{ provide: ClaudeRpcService, useValue: { call } }] });
    const fixture = TestBed.createComponent(ReviewRunsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const store = TestBed.inject(ReviewRunsStore);
    const pauseButton = () => Array.from(fixture.nativeElement.querySelectorAll('header button') as NodeListOf<HTMLButtonElement>)
      .find((button) => button.textContent?.trim() === 'Pause' || button.textContent?.trim() === 'Resume') as HTMLButtonElement;
    // Settings are not loaded yet: the pause action stays disabled.
    expect(pauseButton().textContent?.trim()).toBe('Pause');
    expect(pauseButton().disabled).toBe(true);
    store.settings.set({ repositories: [], maintainerLogins: ['maintainer'], pollMinutes: 10,
      globalPublicationPaused: true, laneCapPerPr: 6, confidenceFloor: 0.8, maxNewInline: 10, fallbackFamilies: [] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Publishing paused');
    expect(pauseButton().textContent?.trim()).toBe('Resume');
    expect(pauseButton().disabled).toBe(false);
    call.mockClear();
    pauseButton().click();
    fixture.detectChanges();
    expect(call).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Resume live publication?');
    fixture.nativeElement.querySelector('#review-page-resume-confirm')?.parentElement?.querySelectorAll('button')[0]?.click();
    fixture.detectChanges();
    expect(call).not.toHaveBeenCalled();
    pauseButton().click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('#review-page-resume-confirm')?.parentElement?.querySelectorAll('button')[1]?.click();
    await fixture.whenStable();
    expect(call).toHaveBeenCalledWith('review:setPublicationPause', { paused: false }, { timeout: 5_000 });
    store.settings.set({ repositories: [], maintainerLogins: ['maintainer'], pollMinutes: 10,
      globalPublicationPaused: false, laneCapPerPr: 6, confidenceFloor: 0.8, maxNewInline: 10, fallbackFamilies: [] });
    fixture.detectChanges();
    call.mockClear();
    pauseButton().click();
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).not.toContain('Resume live publication?');
    expect(call).toHaveBeenCalledWith('review:setPublicationPause', { paused: true }, { timeout: 5_000 });
  });

  it('loads and renders findings for the run opened from the list', async () => {
    const call = jest.fn().mockImplementation((method: string) => Promise.resolve({
      isSuccess: () => true,
      data: method === 'review:listRepositories'
        ? [{ owner: 'Hive-Academy', name: 'PtahCode', enabled: true, dryRun: true, publicationPaused: false }]
        : method === 'review:listRuns'
          ? { runs: [run], nextCursor: null, poll: { status: null, error: null, lastSuccessAt: null, lastErrorAt: null } }
          : method === 'review:getRun' ? run
            : method === 'review:listFindings' ? { findings: [finding] }
              : method === 'review:getSettings' ? { settings: null, hasToken: false, tokenStorage: 'encrypted' }
                : null,
    }));
    TestBed.configureTestingModule({ imports: [ReviewRunsPageComponent], providers: [{ provide: ClaudeRpcService, useValue: { call } }] });
    const fixture = TestBed.createComponent(ReviewRunsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Select a run to see its findings.');
    (runRows(fixture.nativeElement)[0] as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(call).toHaveBeenCalledWith('review:listFindings', { attemptId: run.attemptId }, { timeout: 5_000 });
    expect(fixture.nativeElement.textContent).toContain('src/settings.ts:42');
    expect(fixture.nativeElement.textContent).toContain('Major');
  });

  it('retries the findings load from the drawer error state', async () => {
    let findingsFail = true;
    const call = jest.fn().mockImplementation((method: string) => {
      if (method === 'review:listFindings')
        return findingsFail
          ? Promise.reject(new Error('offline'))
          : Promise.resolve({ isSuccess: () => true, data: { findings: [finding] } });
      return Promise.resolve({
        isSuccess: () => true,
        data: method === 'review:listRepositories'
          ? [{ owner: 'Hive-Academy', name: 'PtahCode', enabled: true, dryRun: true, publicationPaused: false }]
          : method === 'review:listRuns'
            ? { runs: [run], nextCursor: null, poll: { status: null, error: null, lastSuccessAt: null, lastErrorAt: null } }
            : method === 'review:getRun' ? run
              : method === 'review:getSettings' ? { settings: null, hasToken: false, tokenStorage: 'encrypted' }
                : null,
      });
    });
    TestBed.configureTestingModule({ imports: [ReviewRunsPageComponent], providers: [{ provide: ClaudeRpcService, useValue: { call } }] });
    const fixture = TestBed.createComponent(ReviewRunsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    (runRows(fixture.nativeElement)[0] as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Findings are unavailable.');
    findingsFail = false;
    const retry = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((button) => button.textContent?.trim() === 'Retry');
    expect(retry).toBeInstanceOf(HTMLButtonElement);
    retry?.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const findingsCalls = call.mock.calls.filter(([method]) => method === 'review:listFindings');
    expect(findingsCalls).toHaveLength(2);
    expect(findingsCalls[1][1]).toEqual({ attemptId: run.attemptId });
    expect(fixture.nativeElement.textContent).toContain('src/settings.ts:42');
  });
});

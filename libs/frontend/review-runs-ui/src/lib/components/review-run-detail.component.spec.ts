import { signal } from '@angular/core';
import { ReviewRunsStore } from '../review-runs.store';
import { TestBed } from '@angular/core/testing';
import type { ReviewFinding, ReviewRun } from '@ptah-extension/review-contracts';
import { ReviewRunDetailComponent } from './review-run-detail.component';
import { ReviewFindingsStore } from '../findings/review-findings.store';

const run: ReviewRun = {
  repo: { owner: 'Hive-Academy', name: 'PtahCode' }, prNumber: 428, headSha: 'a'.repeat(40),
  attemptId: 'attempt-1', trigger: 'poll', configHash: 'b'.repeat(40), status: 'partial',
  createdAt: '2026-11-03T10:00:00.000Z', startedAt: null, completedAt: null, deadlineAt: '2026-11-03T11:00:00.000Z',
  coverage: ['High-risk paths sampled'], stages: [
    { name: 'lenses', status: 'partial', family: 'Codex', scope: null, durationMs: 1000, error: null, artifactPath: null },
    { name: 'verification', status: 'succeeded', family: 'Codex', scope: null, durationMs: 300, error: null, artifactPath: null },
  ],
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

describe('ReviewRunDetailComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [{ provide: ReviewFindingsStore, useValue: {
    triage: signal({}), openError: signal(null), copyError: signal(null), copied: signal(false),
    openEvidence: jest.fn(), respond: jest.fn(), sendToLane: jest.fn(),
  } }] }));
  it('labels partial coverage and same-family verification, and closes on Escape', () => {
    TestBed.configureTestingModule({ imports: [ReviewRunDetailComponent], providers: [{ provide: ReviewRunsStore, useValue: { rerunState: signal('idle'), hasToken: signal(false), settings: signal(null), rerun: jest.fn() } }] });
    const fixture = TestBed.createComponent(ReviewRunDetailComponent);
    fixture.componentRef.setInput('run', run);
    const close = jest.fn(); fixture.componentInstance.closed.subscribe(close);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Coverage limited');
    expect(fixture.nativeElement.textContent).toContain('Weaker evidence');
    fixture.nativeElement.querySelector('[role="region"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('returns focus to the run row after the layout update that follows its removal', async () => {
    TestBed.configureTestingModule({ imports: [ReviewRunDetailComponent], providers: [{ provide: ReviewRunsStore, useValue: { rerunState: signal('idle'), hasToken: signal(false), settings: signal(null), rerun: jest.fn() } }] });
    const row = document.createElement('button');
    document.body.append(row);
    row.focus();
    const fixture = TestBed.createComponent(ReviewRunDetailComponent);
    fixture.componentRef.setInput('run', run);
    fixture.detectChanges();
    // Below 768 px the list pane is hidden while the detail is open.
    row.hidden = true;
    row.blur();
    fixture.destroy();
    expect(document.activeElement).not.toBe(row);
    row.hidden = false;
    await Promise.resolve();
    expect(document.activeElement).toBe(row);
    row.remove();
  });
  it('shows each lens outcome and sanitized reason', () => {
    TestBed.configureTestingModule({ imports: [ReviewRunDetailComponent], providers: [{ provide: ReviewRunsStore, useValue: {
      rerunState: signal('idle'), hasToken: signal(false), settings: signal(null), rerun: jest.fn(),
    } }] });
    const fixture = TestBed.createComponent(ReviewRunDetailComponent);
    fixture.componentRef.setInput('run', { ...run, stages: [
      { name: 'lenses', status: 'partial', family: null, scope: 'correctness-lifecycle', durationMs: 1000,
        error: 'lane-failed: codex; exit 1', artifactPath: null },
      { name: 'lenses', status: 'succeeded', family: 'codex', scope: 'security-privacy', durationMs: 2000,
        error: 'Ran without a limit check', artifactPath: null },
    ] });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('correctness-lifecycle');
    expect(fixture.nativeElement.textContent).toContain('lane-failed: codex; exit 1');
    expect(fixture.nativeElement.textContent).toContain('security-privacy');
    expect(fixture.nativeElement.textContent).toContain('Ran without a limit check');
  });
  it('counts lenses from the lens records and shows coverage as notes', () => {
    TestBed.configureTestingModule({ imports: [ReviewRunDetailComponent], providers: [{ provide: ReviewRunsStore, useValue: {
      rerunState: signal('idle'), hasToken: signal(false), settings: signal(null), rerun: jest.fn(),
    } }] });
    const fixture = TestBed.createComponent(ReviewRunDetailComponent);
    const host: HTMLElement = fixture.nativeElement;
    const text = (id: string): string => host.querySelector(`[data-testid="${id}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    // A normal run: three scope notes from the context stage, two lens records.
    fixture.componentRef.setInput('run', { ...run, coverage: ['diff-complete', 'dependencies:passed', 'lint:passed'], stages: [
      { name: 'context', status: 'succeeded', family: null, scope: null, durationMs: 500, error: null, artifactPath: null },
      { name: 'lenses', status: 'succeeded', family: 'codex', scope: 'security-privacy', durationMs: 2000, error: null, artifactPath: null },
      { name: 'lenses', status: 'failed', family: 'claude', scope: 'correctness-lifecycle', durationMs: 1000, error: 'lane-failed', artifactPath: null },
      { name: 'verification', status: 'succeeded', family: 'gemini', scope: null, durationMs: 300, error: null, artifactPath: null },
    ] });
    fixture.detectChanges();
    expect(text('review-detail-lens-count')).toBe('1 of 2 lenses completed');
    expect(host.querySelector('progress')?.getAttribute('max')).toBe('2');
    const notes = Array.from(host.querySelectorAll('[data-testid="review-detail-coverage-notes"] li')).map(item => item.textContent?.trim());
    expect(notes).toEqual(['diff-complete', 'dependencies:passed', 'lint:passed']);
    expect(text('review-detail-coverage')).toContain('Coverage notes');
    const cards = Array.from(host.querySelectorAll('[data-testid="review-detail-lenses"] li')).map(item => item.textContent?.replace(/\s+/g, ' ').trim() ?? '');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toContain('security-privacy');
    expect(cards[0]).toContain('Family: codex · Verifier family: gemini');
    expect(cards[1]).toContain('correctness-lifecycle');
    expect(cards[1]).toContain('Family: claude');
    expect(cards.join(' ')).not.toContain('diff-complete');
    // The lens records are not repeated in the stage grid.
    expect(host.querySelectorAll('[data-testid="review-detail-stages"] li')).toHaveLength(2);
    expect(host.textContent).not.toContain('Weaker evidence');
  });
  it('shows no lens count when the run has no lens record', () => {
    TestBed.configureTestingModule({ imports: [ReviewRunDetailComponent], providers: [{ provide: ReviewRunsStore, useValue: {
      rerunState: signal('idle'), hasToken: signal(false), settings: signal(null), rerun: jest.fn(),
    } }] });
    const fixture = TestBed.createComponent(ReviewRunDetailComponent);
    const host: HTMLElement = fixture.nativeElement;
    fixture.componentRef.setInput('run', { ...run, coverage: ['diff-truncated', 'dependencies:failed'], stages: [] });
    fixture.detectChanges();
    expect(host.querySelector('[data-testid="review-detail-lens-count"]')).toBeNull();
    expect(host.querySelector('progress')).toBeNull();
    expect(host.querySelector('[data-testid="review-detail-lenses"]')).toBeNull();
    expect(host.textContent).toContain('Lens count unavailable');
    expect(host.textContent).toContain('Lens records unavailable.');
    expect(host.textContent).not.toMatch(/\d+ of \d+ lenses/);
    expect(host.querySelectorAll('[data-testid="review-detail-coverage-notes"] li')).toHaveLength(2);
  });
  it('renders the findings loaded for the selected run', () => {
    TestBed.configureTestingModule({ imports: [ReviewRunDetailComponent], providers: [{ provide: ReviewRunsStore, useValue: {
      rerunState: signal('idle'), hasToken: signal(false), settings: signal(null), rerun: jest.fn(),
    } }] });
    const fixture = TestBed.createComponent(ReviewRunDetailComponent);
    fixture.componentRef.setInput('run', run);
    fixture.componentRef.setInput('findings', [finding]);
    fixture.detectChanges();
    const rendered = fixture.nativeElement.textContent;
    expect(rendered).toContain('Major');
    expect(rendered).toContain('src/settings.ts:42');
    expect(rendered).toContain(finding.title);
    expect(rendered).toContain(finding.failureMode);
    expect(rendered).toContain('90%');
    expect(fixture.nativeElement.querySelector('ptah-review-findings-panel')).not.toBeNull();
  });
  it('shows findings loading and error states without raw errors', () => {
    TestBed.configureTestingModule({ imports: [ReviewRunDetailComponent], providers: [{ provide: ReviewRunsStore, useValue: {
      rerunState: signal('idle'), hasToken: signal(false), settings: signal(null), rerun: jest.fn(),
    } }] });
    const fixture = TestBed.createComponent(ReviewRunDetailComponent);
    fixture.componentRef.setInput('run', run);
    fixture.componentRef.setInput('findings', [finding]);
    fixture.componentRef.setInput('findingsState', 'loading');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Loading findings');
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
    fixture.componentRef.setInput('findingsState', 'error');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Findings are unavailable.');
    expect(fixture.nativeElement.textContent).not.toContain('offline');
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
  });
  it('emits retryFindings from the findings error Retry button', () => {
    TestBed.configureTestingModule({ imports: [ReviewRunDetailComponent], providers: [{ provide: ReviewRunsStore, useValue: {
      rerunState: signal('idle'), hasToken: signal(false), settings: signal(null), rerun: jest.fn(),
    } }] });
    const fixture = TestBed.createComponent(ReviewRunDetailComponent);
    fixture.componentRef.setInput('run', run);
    fixture.componentRef.setInput('findingsState', 'error');
    const retryFindings = jest.fn();
    fixture.componentInstance.retryFindings.subscribe(retryFindings);
    fixture.detectChanges();
    const retry = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((button) => button.textContent?.trim() === 'Retry');
    expect(retry).toBeInstanceOf(HTMLButtonElement);
    retry?.click();
    expect(retryFindings).toHaveBeenCalledTimes(1);
  });
  it('asks before starting a live rerun', () => {
    TestBed.configureTestingModule({ imports: [ReviewRunDetailComponent], providers: [{ provide: ReviewRunsStore, useValue: {
      rerunState: signal('idle'), hasToken: signal(true), settings: signal({ globalPublicationPaused: false }), rerun: jest.fn(),
    } }] });
    const fixture = TestBed.createComponent(ReviewRunDetailComponent);
    fixture.componentRef.setInput('run', run);
    fixture.detectChanges();
    const store = TestBed.inject(ReviewRunsStore);
    const live = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.includes('Rerun live'));
    live?.click(); fixture.detectChanges();
    expect(store.rerun).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Start live rerun?');
    const acknowledgement = fixture.nativeElement.querySelector('#review-live-rerun-confirm')?.parentElement?.querySelector('input[type="checkbox"]') as HTMLInputElement;
    acknowledgement.click(); fixture.detectChanges();
    fixture.nativeElement.querySelector('#review-live-rerun-confirm')?.parentElement?.querySelectorAll('button')[1]?.click();
    expect(store.rerun).toHaveBeenCalledWith(run.attemptId, false);
  });
});

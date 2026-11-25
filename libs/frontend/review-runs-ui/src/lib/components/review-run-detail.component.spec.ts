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
    fixture.componentRef.setInput('findings', [{ ...finding, verification: 'same-family-weaker' }]);
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
    const meter = host.querySelector('ptah-meter [role="progressbar"]');
    expect(meter?.getAttribute('aria-label')).toBe('Completed lenses');
    expect(meter?.getAttribute('aria-valuenow')).toBe('1');
    expect(meter?.getAttribute('aria-valuemax')).toBe('2');
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
    expect(host.querySelector('ptah-meter')).toBeNull();
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
  describe('lane lines (Req 4.7, 4.8)', () => {
    const storeStub = () => ({ provide: ReviewRunsStore, useValue: { rerunState: signal('idle'), hasToken: signal(false), settings: signal(null), rerun: jest.fn() } });
    const render = (value: ReviewRun, findings: readonly ReviewFinding[] = []) => {
      TestBed.configureTestingModule({ imports: [ReviewRunDetailComponent], providers: [storeStub()] });
      const fixture = TestBed.createComponent(ReviewRunDetailComponent);
      fixture.componentRef.setInput('run', value);
      fixture.componentRef.setInput('findings', findings);
      fixture.detectChanges();
      const host: HTMLElement = fixture.nativeElement;
      const cards = (id: string): string[] => Array.from(host.querySelectorAll(`[data-testid="${id}"] li`)).map(item => item.textContent?.replace(/\s+/g, ' ').trim() ?? '');
      return { host, stages: cards('review-detail-stages'), lenses: cards('review-detail-lenses') };
    };

    it('shows lane, model, triage family and fallback notes on a run recorded after lane pools', () => {
      const { host, stages, lenses } = render({ ...run, stages: [
        { name: 'discovery', status: 'succeeded', family: null, scope: null, durationMs: 100, error: null, artifactPath: null, lane: null, model: null, fallback: null },
        { name: 'triage', status: 'succeeded', family: 'claude', scope: null, durationMs: 900, error: null, artifactPath: null, lane: 'claude', model: 'claude-sonnet-4-5', fallback: [
          { source: 'pin', lane: 'gemini', model: 'gemini-2.5-pro', reason: 'model-blocked' },
        ] },
        { name: 'lenses', status: 'succeeded', family: 'codex', scope: 'security-privacy', durationMs: 2000, error: null, artifactPath: null, lane: 'codex', model: null, fallback: [
          { source: 'pool', lane: 'copilot', model: null, reason: 'at-limit' },
        ] },
        { name: 'verification', status: 'succeeded', family: 'gemini', scope: null, durationMs: 300, error: null, artifactPath: null, lane: 'gemini', model: 'gemini-2.5-flash', fallback: null },
      ] });
      expect(stages[0]).toBe('DiscoveryCompleted · 0s');
      expect(stages[1]).toContain('claude · claude-sonnet-4-5 · family claude');
      expect(stages[1]).toContain('Fallback: pinned gemini / gemini-2.5-pro was unavailable (model blocked). Ran on claude.');
      expect(stages[2]).toContain('gemini · gemini-2.5-flash · family gemini');
      expect(lenses[0]).toContain('codex · lane default');
      expect(lenses[0]).not.toContain('family codex');
      expect(lenses[0]).toContain('Family: codex · Verifier family: gemini');
      expect(lenses[0]).toContain('Fallback: pool entry copilot skipped (at limit). Ran on codex.');
      expect(host.querySelectorAll('[data-testid="review-stage-lane"]')).toHaveLength(3);
      expect(host.querySelectorAll('[data-testid="review-stage-fallback"]')).toHaveLength(2);
      expect(host.querySelector('[data-testid="review-stage-lane"] .font-mono')?.textContent).toBe('claude');
    });

    it('renders a run recorded before lane pools with the family only', () => {
      const { host, stages, lenses } = render({ ...run, stages: [
        { name: 'triage', status: 'succeeded', family: 'claude', scope: null, durationMs: 900, error: null, artifactPath: null },
        { name: 'lenses', status: 'succeeded', family: 'codex', scope: 'security-privacy', durationMs: 2000, error: null, artifactPath: null, lane: null, model: null, fallback: null },
        { name: 'verification', status: 'succeeded', family: 'gemini', scope: null, durationMs: 300, error: null, artifactPath: null, lane: null, model: null, fallback: null },
      ] });
      expect(stages[0]).toContain('Family: claude');
      expect(stages[1]).toContain('Family: gemini');
      expect(lenses[0]).toContain('Family: codex · Verifier family: gemini');
      expect(host.querySelector('[data-testid="review-stage-lane"]')).toBeNull();
      expect(host.querySelector('[data-testid="review-stage-fallback"]')).toBeNull();
    });

    it('adds nothing to stages that run no lane', () => {
      const { host, stages } = render({ ...run, stages: [
        { name: 'context', status: 'succeeded', family: null, scope: null, durationMs: 500, error: null, artifactPath: null },
        { name: 'publication', status: 'succeeded', family: null, scope: null, durationMs: 200, error: null, artifactPath: null, lane: null, model: null, fallback: null },
      ] });
      expect(stages).toEqual(['ContextCompleted · 1s', 'PublicationCompleted · 0s']);
      expect(host.querySelector('[data-testid="review-stage-family"]')).toBeNull();
    });
  });

  describe('same-family verification badge (D14)', () => {
    const sameFamilyRun: ReviewRun = { ...run, stages: [
      { name: 'lenses', status: 'succeeded', family: 'codex', scope: 'security-privacy', durationMs: 2000, error: null, artifactPath: null },
      { name: 'verification', status: 'succeeded', family: 'codex', scope: null, durationMs: 300, error: null, artifactPath: null },
    ] };
    const render = (findings: readonly ReviewFinding[]): string => {
      TestBed.configureTestingModule({ imports: [ReviewRunDetailComponent], providers: [{ provide: ReviewRunsStore, useValue: { rerunState: signal('idle'), hasToken: signal(false), settings: signal(null), rerun: jest.fn() } }] });
      const fixture = TestBed.createComponent(ReviewRunDetailComponent);
      fixture.componentRef.setInput('run', sameFamilyRun);
      fixture.componentRef.setInput('findings', findings);
      fixture.detectChanges();
      return fixture.nativeElement.textContent;
    };

    it('shows the badge when one finding is marked same-family-weaker', () => {
      expect(render([finding, { ...finding, title: 'Second', verification: 'same-family-weaker' }])).toContain('Weaker evidence · same-family verification');
    });

    it('hides the badge when the verifier family equals a lens family but no finding is same-family-weaker', () => {
      expect(render([finding])).not.toContain('Weaker evidence');
    });

    it('hides the badge when the run has no findings', () => {
      expect(render([])).not.toContain('Weaker evidence');
    });
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
  describe('usage', () => {
    const total = (overrides: Partial<NonNullable<ReviewRun['usage']>>): NonNullable<ReviewRun['usage']> => ({
      inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 1500,
      costUsd: 0.0123, tokensPartial: false, costPartial: false, runs: 1, ...overrides,
    });
    const render = (value: ReviewRun): HTMLElement => {
      TestBed.configureTestingModule({ imports: [ReviewRunDetailComponent], providers: [{ provide: ReviewRunsStore, useValue: {
        rerunState: signal('idle'), hasToken: signal(false), settings: signal(null), rerun: jest.fn(),
      } }] });
      const fixture = TestBed.createComponent(ReviewRunDetailComponent);
      fixture.componentRef.setInput('run', value);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    };
    /** The text a sighted reader sees: the line without its screen-reader-only spans. */
    const visible = (element: Element | null): string => {
      const copy = element?.cloneNode(true) as Element | undefined;
      copy?.querySelectorAll('.sr-only').forEach((node) => node.remove());
      return (copy?.textContent ?? '').replace(/\s+/g, ' ').trim();
    };

    it('shows the run total in the coverage section and each stage and lens usage', () => {
      const element = render({ ...run, usage: total({ totalTokens: 12345, costUsd: 1.5, runs: 3 }), stages: [
        { name: 'triage', status: 'succeeded', family: 'codex', scope: null, durationMs: 100, error: null, artifactPath: null,
          usage: total({ totalTokens: 2000, costUsd: 0.25, runs: 1 }) },
        { name: 'lenses', status: 'succeeded', family: 'codex', scope: 'security-privacy', durationMs: 100, error: null, artifactPath: null,
          usage: total({ totalTokens: 10345, costUsd: 1.25, runs: 2 }) },
      ] });
      expect(visible(element.querySelector('[data-testid="review-detail-usage"]'))).toBe('Usage: 12,345 tokens · $1.50');
      const stages = Array.from(element.querySelectorAll('[data-testid="review-stage-usage"]')).map(visible);
      expect(stages).toEqual(['2,000 tokens · $0.2500', '10,345 tokens · $1.25 · 2 runs']);
    });

    it('marks a partial cost beside an exact token total, with a title and a screen reader sentence', () => {
      const element = render({ ...run, usage: total({ totalTokens: 1500, costUsd: 2, costPartial: true }) });
      const line = element.querySelector('[data-testid="review-detail-usage"]');
      expect(line?.textContent).toContain('1,500 tokens');
      expect(line?.textContent).not.toContain('≥ 1,500');
      expect(line?.textContent).toContain('≥ $2.00');
      expect(line?.querySelector('[title="At least $2.00; some costs were not reported"]')).not.toBeNull();
      expect(line?.querySelector('.sr-only')?.textContent).toBe('At least $2.00; some costs were not reported');
    });

    it('shows unknown values as a dash, never 0', () => {
      const element = render({ ...run, usage: total({ totalTokens: null, costUsd: null }) });
      const line = element.querySelector('[data-testid="review-detail-usage"]');
      expect(visible(line)).toBe('Usage: — · —');
      expect(line?.textContent).not.toContain('$0');
      expect(Array.from(line?.querySelectorAll('.sr-only') ?? []).map((node) => node.textContent)).toEqual(['Token usage unknown', 'Cost unknown']);
    });

    it('renders an older run without usage: a dash total and no stage usage lines', () => {
      const element = render(run);
      const line = element.querySelector('[data-testid="review-detail-usage"]');
      expect(visible(line)).toBe('Usage: —');
      expect(line?.querySelector('.sr-only')?.textContent).toBe('unknown');
      expect(element.querySelector('[data-testid="review-stage-usage"]')).toBeNull();
    });
  });
});

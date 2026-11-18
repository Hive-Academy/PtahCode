import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import type {
  CronAggregateStats,
  CronScopeFilter,
} from '../services/cron-state.service';
import { formatRelative, formatTime } from './cron-format';
import { CronHeaderBandComponent } from './cron-header-band.component';

describe('CronHeaderBandComponent', () => {
  const NEXT_RUN_AT = Date.UTC(2031, 0, 15, 9, 30);

  function render(
    inputs: {
      stats?: CronAggregateStats;
      scope?: CronScopeFilter;
      loading?: boolean;
      reviewAvailable?: boolean;
    } = {},
  ): ComponentFixture<CronHeaderBandComponent> {
    TestBed.configureTestingModule({
      imports: [CronHeaderBandComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CronHeaderBandComponent);
    fixture.componentRef.setInput(
      'stats',
      inputs.stats ?? { total: 0, enabled: 0, disabled: 0, nextRunAt: null },
    );
    fixture.componentRef.setInput('scope', inputs.scope ?? 'workspace');
    fixture.componentRef.setInput('loading', inputs.loading ?? false);
    fixture.componentRef.setInput(
      'reviewAvailable',
      inputs.reviewAvailable ?? false,
    );
    fixture.detectChanges();
    return fixture;
  }

  function byTestId(
    fixture: ComponentFixture<CronHeaderBandComponent>,
    id: string,
  ): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(
      `[data-testid="${id}"]`,
    );
  }

  function segmentTexts(
    fixture: ComponentFixture<CronHeaderBandComponent>,
  ): string[] {
    const band = byTestId(fixture, 'cron-instrument-band');
    return Array.from(band?.querySelectorAll('li') ?? []).map((item) =>
      (item.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders the title as the page heading', () => {
    const fixture = render();
    const heading = (fixture.nativeElement as HTMLElement).querySelector('h1');
    expect(heading?.textContent?.trim()).toBe('Schedules');
  });

  it('shows total, enabled, paused and next run in a four-segment instrument band', () => {
    const fixture = render({
      stats: { total: 5, enabled: 3, disabled: 2, nextRunAt: NEXT_RUN_AT },
      scope: 'all',
    });

    const band = byTestId(fixture, 'cron-instrument-band');
    expect(band?.tagName.toLowerCase()).toBe('ptah-instrument-band');
    expect(band?.querySelector('nav')?.getAttribute('aria-label')).toBe(
      'Cron statistics',
    );

    const segments = segmentTexts(fixture);
    expect(segments).toHaveLength(4);
    expect(segments[0]).toContain('Jobs');
    expect(segments[0]).toContain('5');
    expect(segments[0]).toContain('Across all workspaces');
    expect(segments[1]).toContain('Enabled');
    expect(segments[1]).toContain('3');
    expect(segments[2]).toContain('Paused');
    expect(segments[2]).toContain('2');
    expect(segments[3]).toContain('Next run');
    expect(segments[3]).toContain(formatTime(NEXT_RUN_AT));
    expect(segments[3]).toContain(formatRelative(NEXT_RUN_AT));
  });

  it('shows a placeholder when no run is scheduled', () => {
    const fixture = render({
      stats: { total: 1, enabled: 0, disabled: 1, nextRunAt: null },
    });
    const segments = segmentTexts(fixture);
    expect(segments[3]).toContain(formatTime(null));
    expect(segments[3]).toContain('No upcoming run');
    expect(segments[0]).toContain('In this workspace');
  });

  it('replaces the retired statistics tiles', () => {
    const fixture = render();
    for (const id of [
      'cron-stat-total',
      'cron-stat-enabled',
      'cron-stat-disabled',
      'cron-stat-next-run',
    ]) {
      expect(byTestId(fixture, id)).toBeNull();
    }
  });

  it('marks the active scope and emits a scope change', () => {
    const fixture = render({ scope: 'workspace' });
    const emitted: CronScopeFilter[] = [];
    fixture.componentInstance.scopeChange.subscribe((scope) =>
      emitted.push(scope),
    );

    const group = (fixture.nativeElement as HTMLElement).querySelector(
      '[role="group"]',
    );
    expect(group?.getAttribute('aria-label')).toBe('Schedule workspace scope');
    const workspace = byTestId(fixture, 'cron-scope-workspace');
    const all = byTestId(fixture, 'cron-scope-all');
    // A two-way filter, not a tab set: no tabpanel exists for these buttons.
    expect(workspace?.hasAttribute('role')).toBe(false);
    expect(workspace?.getAttribute('aria-pressed')).toBe('true');
    expect(all?.getAttribute('aria-pressed')).toBe('false');

    all?.click();
    expect(emitted).toEqual(['all']);
  });

  it('emits refresh from the labelled icon button and disables it while loading', () => {
    const fixture = render();
    let refreshed = 0;
    fixture.componentInstance.refresh.subscribe(() => refreshed++);

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button[aria-label="Refresh jobs"]',
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.click();
    expect(refreshed).toBe(1);

    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
  });

  it('keeps "New job" as the only primary action', () => {
    const fixture = render({ reviewAvailable: true });
    let requested = 0;
    fixture.componentInstance.newJob.subscribe(() => requested++);

    const primary = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.btn-primary',
    );
    expect(primary).toHaveLength(1);
    expect(primary[0].getAttribute('data-testid')).toBe('cron-new-job-btn');

    (primary[0] as HTMLButtonElement).click();
    expect(requested).toBe(1);
  });

  it('shows the review-runs link only when the review surface is available', () => {
    expect(byTestId(render(), 'cron-review-runs-link')).toBeNull();
    TestBed.resetTestingModule();

    const link = byTestId(
      render({ reviewAvailable: true }),
      'cron-review-runs-link',
    );
    expect(link?.getAttribute('aria-label')).toBe('Open review runs');
    expect(link?.getAttribute('href')).toBe('/review-runs');
  });
});

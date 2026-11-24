import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TestBed } from '@angular/core/testing';
import type { MonitoredAgent } from '@ptah-extension/chat-streaming';
import type { EffectiveLaneCapabilities } from '@ptah-extension/shared';
import { CliLaneUsageSummaryComponent } from './cli-lane-usage-summary.component';

function agent(usageTotals?: MonitoredAgent['usageTotals']): MonitoredAgent {
  return {
    agentId: 'lane-1',
    cli: 'codex',
    task: 'Task',
    status: 'running',
    startedAt: 0,
    stdout: '',
    stderr: '',
    expanded: true,
    segments: [],
    streamEvents: [],
    streamRevision: 0,
    permissionQueue: [],
    usageTotals,
  };
}

describe('CliLaneUsageSummaryComponent', () => {
  it('renders cache usage reported by a CLI', () => {
    TestBed.configureTestingModule({ imports: [CliLaneUsageSummaryComponent] });
    const fixture = TestBed.createComponent(CliLaneUsageSummaryComponent);
    fixture.componentRef.setInput(
      'agent',
      agent({
        inputTokens: 1200,
        outputTokens: 80,
        contextTokens: 2000,
        cacheReadTokens: 900,
        cacheWriteTokens: 300,
        costUsd: 0.0123,
      }),
    );
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('in 1.2k');
    expect(text).toContain('ctx 2.0k');
    expect(text).toContain('cache read 900');
    expect(text).toContain('cache write 300');
    expect(text).toContain('~$0.01 est.');
    expect(text).not.toContain('4m 2s');
    expect(text).toContain('1.3k tok');
    const labels = fixture.nativeElement.querySelectorAll(
      '[role="group"] > span:not([data-testid="lane-usage-figure"])',
    );
    expect(labels).toHaveLength(6);
    for (const label of labels) {
      expect(label.classList.contains('text-base-content-muted')).toBe(true);
      expect(label.className).not.toMatch(/text-(?:info|accent|warning)\/70/);
    }
  });

  it('omits token labels that the provider did not report', () => {
    TestBed.configureTestingModule({ imports: [CliLaneUsageSummaryComponent] });
    const fixture = TestBed.createComponent(CliLaneUsageSummaryComponent);
    fixture.componentRef.setInput('agent', agent(null));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('cache read');
    expect(fixture.nativeElement.textContent).not.toContain('cache write');
    expect(fixture.nativeElement.textContent).not.toContain('in ');
    expect(fixture.nativeElement.textContent).toContain('ctx —');
    expect(fixture.nativeElement.textContent).toContain('—');
  });

  it('shows "- tok" with an unknown-usage tooltip while no usage is known', () => {
    const el = render(agent(null));
    const total = el.querySelector('[data-testid="lane-usage-total"]');
    expect(total?.textContent?.trim()).toBe('- tok');
    expect(total?.getAttribute('title')).toBe('Usage is unknown until the lane reports again.');
    expect(el.querySelector('[data-testid="lane-usage-partial"]')).toBeNull();
    expect(el.querySelector('[data-testid="lane-usage-turn-end"]')).toBeNull();
  });

  it('marks retained and live segment usage as partial when restored structured totals stay null', () => {
    const lane = agent(null);
    lane.segments = [
      { type: 'info', content: '', usage: { inputTokens: 11_900, outputTokens: 56, costUsd: 0.15 } },
      { type: 'info', content: '', usage: { inputTokens: 5, outputTokens: 1 } },
    ];
    TestBed.configureTestingModule({ imports: [CliLaneUsageSummaryComponent] });
    const fixture = TestBed.createComponent(CliLaneUsageSummaryComponent);
    fixture.componentRef.setInput('agent', lane);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('in ≥ 11.9k');
    expect(fixture.nativeElement.textContent).toContain('out ≥ 57');
    expect(fixture.nativeElement.textContent).toContain('≥ ~$0.15 est.');
    expect(fixture.nativeElement.textContent).toContain('ctx —');
    expect(fixture.nativeElement.textContent).not.toContain('cache read');
    expect(fixture.nativeElement.textContent).not.toContain('cache write');
    expect(fixture.nativeElement.querySelector('[role="group"]')?.getAttribute('title')).toBe('From retained output, may be partial');
    const badge = fixture.nativeElement.querySelector('[data-testid="lane-usage-partial"]');
    expect(badge?.textContent?.trim()).toBe('partial');
    expect(badge?.getAttribute('data-tone')).toBe('warn');
    expect(fixture.nativeElement.querySelector('[data-testid="lane-usage-total"]')?.textContent?.trim()).toBe('12.0k tok');
  });

  it('prefers structured totals to usage segments', () => {
    const lane = agent({ inputTokens: 3, outputTokens: 4 });
    lane.segments = [{ type: 'info', content: '', usage: { inputTokens: 11_900, outputTokens: 56 } }];
    TestBed.configureTestingModule({ imports: [CliLaneUsageSummaryComponent] });
    const fixture = TestBed.createComponent(CliLaneUsageSummaryComponent);
    fixture.componentRef.setInput('agent', lane);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('in 3');
    expect(fixture.nativeElement.textContent).toContain('out 4');
    expect(fixture.nativeElement.textContent).not.toContain('11.9k');
    expect(fixture.nativeElement.textContent).not.toContain('≥');
    expect(fixture.nativeElement.querySelector('[role="group"]')?.getAttribute('title')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="lane-usage-partial"]')).toBeNull();
  });

  describe('usage timing', () => {
    const withTiming = (usage: EffectiveLaneCapabilities['usage']): MonitoredAgent => ({
      ...agent({ inputTokens: 9_000, outputTokens: 100 }),
      effectiveCapabilities: { usage } as unknown as EffectiveLaneCapabilities,
    });

    it('shows a clock with the statement reason for a turn-end lane', () => {
      const el = render(withTiming({ timing: 'turn-end', reason: 'Cursor reports usage once, when the turn ends.' }));
      const clock = el.querySelector('[data-testid="lane-usage-turn-end"]');
      expect(clock?.getAttribute('role')).toBe('img');
      expect(clock?.getAttribute('aria-label')).toBe('Cursor reports usage once, when the turn ends.');
      expect(el.querySelector('[data-testid="lane-usage-total"]')?.getAttribute('title'))
        .toBe('Cursor reports usage once, when the turn ends.');
    });

    it('falls back to a generic reason when the statement gives none', () => {
      const el = render(withTiming({ timing: 'turn-end' }));
      expect(el.querySelector('[data-testid="lane-usage-turn-end"]')?.getAttribute('title'))
        .toBe('This CLI reports usage once, when the turn ends.');
    });

    it('shows no clock for a live lane or one without a usage statement', () => {
      const live = render(withTiming({ timing: 'live' }));
      expect(live.querySelector('[data-testid="lane-usage-turn-end"]')).toBeNull();
      expect(live.querySelector('[data-testid="lane-usage-total"]')?.getAttribute('title'))
        .toBe('Tokens this run, updated as the provider reports them');
      const none = render(agent({ inputTokens: 1 }));
      expect(none.querySelector('[data-testid="lane-usage-turn-end"]')).toBeNull();
    });
  });

  describe('change highlight', () => {
    it('does not highlight the first value, then restarts the 900 ms fade on each change', () => {
      TestBed.configureTestingModule({ imports: [CliLaneUsageSummaryComponent] });
      const fixture = TestBed.createComponent(CliLaneUsageSummaryComponent);
      const el = fixture.nativeElement as HTMLElement;
      const flash = () => el.querySelector('[data-testid="lane-usage-flash"]');
      fixture.componentRef.setInput('agent', agent({ inputTokens: 100, outputTokens: 1 }));
      fixture.detectChanges();
      expect(flash()).toBeNull();

      fixture.componentRef.setInput('agent', agent({ inputTokens: 100, outputTokens: 1, costUsd: 0.1 }));
      fixture.detectChanges();
      expect(flash()).toBeNull();

      fixture.componentRef.setInput('agent', agent({ inputTokens: 200, outputTokens: 1 }));
      fixture.detectChanges();
      const first = flash();
      expect(first?.classList.contains('lane-usage-flash')).toBe(true);
      expect(first?.getAttribute('aria-hidden')).toBe('true');

      fixture.componentRef.setInput('agent', agent({ inputTokens: 300, outputTokens: 1 }));
      fixture.detectChanges();
      expect(flash()).not.toBeNull();
      expect(flash()).not.toBe(first);
      expect(el.querySelector('[data-testid="lane-usage-total"]')?.textContent?.trim()).toBe('301 tok');
    });

    it('does not flash when the card is reused for another lane (M5)', () => {
      TestBed.configureTestingModule({ imports: [CliLaneUsageSummaryComponent] });
      const fixture = TestBed.createComponent(CliLaneUsageSummaryComponent);
      const el = fixture.nativeElement as HTMLElement;
      const flash = () => el.querySelector('[data-testid="lane-usage-flash"]');
      fixture.componentRef.setInput('agent', agent({ inputTokens: 100, outputTokens: 1 }));
      fixture.detectChanges();

      fixture.componentRef.setInput('agent', { ...agent({ inputTokens: 900, outputTokens: 1 }), agentId: 'lane-2' });
      fixture.detectChanges();
      expect(flash()).toBeNull();

      fixture.componentRef.setInput('agent', { ...agent({ inputTokens: 950, outputTokens: 1 }), agentId: 'lane-2' });
      fixture.detectChanges();
      expect(flash()).not.toBeNull();
    });

    it('animates only opacity and turns the fade off under reduced motion', () => {
      const source = readFileSync(join(__dirname, 'cli-lane-usage-summary.component.ts'), 'utf8');
      expect(source).toMatch(/\.lane-usage-flash\s*\{[^}]*animation:\s*lane-usage-flash 900ms/);
      const keyframes = /@keyframes lane-usage-flash\s*\{([\s\S]*?)\n {6}\}/.exec(source)?.[1] ?? '';
      const properties = [...keyframes.matchAll(/([a-z-]+)\s*:/g)].map((match) => match[1]);
      expect(properties.length).toBeGreaterThan(0);
      expect(properties.every((name) => name === 'opacity')).toBe(true);
      expect(source).toMatch(
        /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.lane-usage-flash\s*\{\s*animation:\s*none/,
      );
    });
  });
});

function render(lane: MonitoredAgent): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [CliLaneUsageSummaryComponent] });
  const fixture = TestBed.createComponent(CliLaneUsageSummaryComponent);
  fixture.componentRef.setInput('agent', lane);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

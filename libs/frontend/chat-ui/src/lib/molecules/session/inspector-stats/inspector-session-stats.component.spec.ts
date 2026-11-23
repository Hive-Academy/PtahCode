import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ModelStateService } from '@ptah-extension/core';
import type { SessionBudgetState, SessionStatsEntry } from '@ptah-extension/shared';
import { PTAH_CLOCK, type PtahClock } from '@ptah-extension/ui';
import type { SessionStatsInputs } from '../session-stats-view';
import { cliContribution, sdkContribution, sessionTotal } from '../session-usage-totals';
import { InspectorSessionStatsComponent } from './inspector-session-stats.component';

const snapshot: SessionStatsEntry = {
  sessionId: 'first', model: 'opus', totalCost: 17.54, knownCost: 17.54,
  tokenCount: 23_500_000, messageCount: 24, agentSessionCount: 2, turnCount: 24,
  tokens: { input: 23_000_000, output: 300_000, cacheRead: 100_000, cacheCreation: 100_000 },
  status: 'ok', pricingCoverage: 'full', scope: 'session', revision: 1,
};

const stats: SessionStatsInputs = {
  sessionId: 'first', snapshot, liveModelStats: null,
  compactionCount: 0, limits: null, budget: null,
  context: { hasLive: false, known: false, percent: null, label: '—', usedTokens: null },
  limitSummary: { state: 'none', text: null, extra: 0, source: null, fullText: null },
};

const budget: SessionBudgetState = {
  sessionId: 'first', stage: 'normal', unit: 'cost', measure: 'cost',
  used: 17.54, limit: 30, percent: 58.46, lowerBound: false, revision: null,
  compactions: 0, autoHandoff: false,
};

function required<T>(value: T | null): T {
  if (value === null) throw new Error('Expected element or usage contribution');
  return value;
}

describe(InspectorSessionStatsComponent.name, () => {
  function render(overrides: Partial<SessionStatsInputs> = {}) {
    TestBed.configureTestingModule({
      imports: [InspectorSessionStatsComponent],
      providers: [
        { provide: ModelStateService, useValue: { availableModels: signal([{ id: 'opus', name: 'Opus 4.7' }]) } },
        { provide: PTAH_CLOCK, useValue: { now: signal(0), acquire: () => jest.fn() } satisfies PtahClock },
      ],
    });
    const fixture = TestBed.createComponent(InspectorSessionStatsComponent);
    fixture.componentRef.setInput('stats', { ...stats, ...overrides });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const tile = (key: string) => required(root.querySelector<HTMLElement>(`[data-testid="session-${key}"]`));
    const models = required(root.querySelector<HTMLButtonElement>('ptah-disclosure button'));
    return { fixture, root, tile, models };
  }

  it('reads whole-session tiles from supplied S1 totals and never adds the model breakdown again', () => {
    const { fixture, tile, models, root } = render({
      snapshot: { ...snapshot, tokenCount: 1, totalCost: 100 },
    });
    const lane = required(cliContribution({
      kind: 'cli', id: 'codex', label: 'Codex',
      usage: { inputTokens: 2_000_000, outputTokens: 400_000 },
      cost: 0.008, costEstimated: true,
    }));
    const unpriced = required(cliContribution({
      kind: 'cli', id: 'antigravity', label: 'Antigravity',
      usage: { inputTokens: 1, outputTokens: 0 },
    }));
    const contributions = [sdkContribution(snapshot), lane, unpriced];
    const coverage = { complete: true, causes: [] };
    fixture.componentRef.setInput('cliContributions', [lane, unpriced]);
    fixture.componentRef.setInput('totals', {
      tokens: sessionTotal(contributions, coverage, 'tokens'),
      cost: sessionTotal(contributions, coverage, 'cost'),
    });
    fixture.detectChanges();

    expect(tile('tokens').textContent).toContain('25.9M');
    expect(tile('tokens').getAttribute('aria-label')).toContain('25,900,001 tokens');
    expect(tile('tokens').getAttribute('aria-label')).not.toContain('at least');
    expect(tile('cost').textContent).toContain('≥~$17.54');
    expect(tile('cost').getAttribute('aria-label')).toContain('at least about $17.548');
    const sourceText = tile('cost').querySelector('[role="meter"]')?.getAttribute('aria-valuetext');
    expect(sourceText).toContain('1 of 2 lanes report no cost');
    expect(root.querySelector('[data-testid="session-source-legend"]')?.textContent).toContain('1 unreported (cost)');
    expect(tile('cost').querySelector('.ptah-meter-unreported')).toBeTruthy();
    expect(tile('tokens').querySelector('.ptah-meter-unreported')).toBeNull();
    expect(root.querySelector('[data-testid="session-accuracy-key"]')?.textContent).toMatch(/~ = estimate.*≥ = lower bound/);

    models.click();
    fixture.detectChanges();
    const detail = root.querySelector('ptah-session-model-breakdown')?.textContent ?? '';
    expect(detail).toContain(sourceText);
    expect(detail).toMatch(/Lanes with tokens\s*2\/2/);
    expect(detail).toMatch(/Lanes with cost\s*1\/2/);
  });

  it('mutes unknown amounts and keeps the unavailable cause on the Cost tooltip', () => {
    const { fixture, tile } = render({
      snapshot: { ...snapshot, tokenCount: undefined, totalCost: null, pricingCoverage: 'none',
        costUnavailableReason: 'rate-missing' },
    });
    for (const key of ['tokens', 'cost']) {
      expect(tile(key).querySelector('.tabular-nums.text-base-content-muted')?.textContent).toBe('—');
      expect(tile(key).tabIndex).toBe(0);
    }
    tile('cost').dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    const tooltip = tile('cost').querySelector<HTMLElement>('[role="tooltip"]');
    expect(tooltip?.hidden).toBe(false);
    expect(tooltip?.textContent).toContain('Not priced');
  });

  it.each([undefined, null, 0, Infinity])('shows muted --:-- with known turns for duration %p', (durationMs) => {
    const { tile } = render({ snapshot: { ...snapshot, durationMs } });
    const time = tile('time');
    const output = time.querySelector('time');
    expect(output?.textContent).toBe('--:--');
    expect(output?.classList.contains('text-base-content-muted')).toBe(true);
    expect(time.getAttribute('aria-label')).toContain('Duration not recorded');
    expect(time.textContent).toContain('24 turns');
    expect(time.tabIndex).toBe(0);
  });

  it('shows a known duration without a start, and a known start in focus detail', () => {
    const { fixture, tile } = render({ snapshot: { ...snapshot, durationMs: 65_000, turnCount: 0 } });
    const time = tile('time');
    expect(time.querySelector('time')?.textContent).toBe('1:05');
    expect(time.textContent).toContain('0 turns');
    expect(time.getAttribute('aria-label')).toContain('1 minute 5 seconds');
    fixture.componentRef.setInput('startedAt', new Date(0));
    time.dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();
    const tooltip = time.querySelector<HTMLElement>('[role="tooltip"]');
    expect(tooltip?.hidden).toBe(false);
    expect(tooltip?.textContent).toContain('Started');
  });

  it('preserves the single-model name and SDK scope, and restores each session disclosure independently', () => {
    const { fixture, models, root } = render();
    expect(root.querySelector('h3')?.textContent).toBe('Session');
    expect(models.textContent).toMatch(/Models\s*1\s*Opus 4.7/);
    expect(models.tabIndex).toBe(0);
    const panel = () => root.querySelector<HTMLElement>(`#${models.getAttribute('aria-controls')}`);
    expect(panel()?.hidden).toBe(true);
    models.click();
    fixture.detectChanges();
    expect(models.getAttribute('aria-expanded')).toBe('true');
    expect(panel()?.hidden).toBe(false);
    expect(panel()?.textContent).toContain('SDK scope — orchestrator and SDK subagents, no CLI lanes');
    expect(panel()?.textContent).not.toMatch(/Lanes with tokens/);
    fixture.componentRef.setInput('stats', { ...stats, sessionId: 'second' });
    fixture.detectChanges();
    expect(panel()?.hidden).toBe(true);
    fixture.componentRef.setInput('stats', stats);
    fixture.detectChanges();
    expect(panel()?.hidden).toBe(false);
    models.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(models.getAttribute('aria-expanded')).toBe('false');
    expect(panel()?.hidden).toBe(true);
    expect(document.activeElement).toBe(models);
  });

  it('keeps the model count and real model category rows when multiple models are present', () => {
    const { fixture, models, root } = render({ snapshot: {
      ...snapshot, modelUsageList: [
        { model: 'opus', inputTokens: 1, outputTokens: 2, cacheRead: 300, cacheCreation: 40, costUSD: null },
        { model: 'sonnet', inputTokens: 3, outputTokens: 4, cacheRead: 50, cacheCreation: 600, costUSD: 0 },
      ],
    } });
    expect(models.textContent).toMatch(/Models\s*2\s*Opus 4.7 \+1/);
    models.click();
    fixture.detectChanges();
    const rows = root.querySelectorAll('[data-testid="model-usage-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toMatch(/Cache read\s*300.*Cache creation\s*40/);
    expect(rows[0].textContent).toContain('—');
  });

  it.each([
    [null, 'weighted-fallback', 'normal', 6_298_000, 9_000_000, '6.3M / 9.0M', 'Weighted tokens in place of cost', 'bg-[var(--ptah-gold)]'],
    [17.54, 'weighted-fallback', 'handoff', 6_298_000, 9_000_000, '6.3M / 9.0M', 'Weighted tokens in place of cost', 'bg-state-need'],
    [17.54, 'cost', 'limit', 12.349, 25, '≥$12.34 / $25', 'Cost budget', 'bg-state-err'],
    [17.54, 'weighted-tokens', 'tighten', 1_299, 2_000, '≥1.2k / 2.0k', 'Weighted session tokens', 'bg-state-need'],
  ] as const)('shows the SDK budget (%p, %s, %s) in its own units', (totalCost, measure, stage, used, limit, figures, label, ink) => {
    const lowerBound = measure !== 'weighted-fallback';
    const { tile } = render({
      snapshot: { ...snapshot, totalCost },
      budget: { ...budget, measure, stage, used, limit, lowerBound, percent: 55.9 },
    });
    const cell = tile('budget');
    expect(cell.textContent).toContain(figures);
    expect(cell.getAttribute('aria-label')).toContain(label);
    expect(cell.getAttribute('aria-label')).toContain('SDK usage only, CLI lanes are not counted');
    expect(cell.textContent).toContain(lowerBound ? '≥55%' : '55%');
    expect(cell.querySelector('[role="meter"]')?.firstElementChild?.classList.contains(ink)).toBe(true);
    if (stage !== 'normal') expect(cell.textContent).toContain(stage);
  });

  it('shows the agents count only when the whole roster supplies it', () => {
    const { fixture, root } = render();
    expect(root.querySelector('[aria-label="Agents unavailable"]')?.textContent).toContain('—');
    fixture.componentRef.setInput('agentCount', 4);
    fixture.componentRef.setInput('liveAgentCount', 1);
    fixture.detectChanges();
    expect(root.querySelector('[aria-label="Agents: 4, 1 live"]')?.textContent).toContain('1 live');
  });

  it('omits the budget tile and leaves cache and context to Orchestrator detail', () => {
    const { root } = render({ compactionCount: 3, cache: { ttl: '5m', lastRequestAt: 0, expiresAt: 300_000 } });
    expect(root.querySelector('[data-testid="session-budget"]')).toBeNull();
    expect(root.querySelector('ptah-disclosure')?.classList.contains('models-wide')).toBe(true);
    expect(root.querySelector('ptah-inspector-cache-tile')).toBeNull();
    expect(root.textContent).not.toContain('compactions');
  });
});

import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { UsageKpiStripComponent } from './usage-kpi-strip.component';
import type { UsageKpis } from './usage-summary.view-model';

const kpis = (overrides: Partial<UsageKpis> = {}): UsageKpis => ({
  sessionCount: 1,
  messageCount: 2,
  subagentCount: 0,
  processedTokens: 1000,
  processedPerActiveDay: 1000,
  activeDayCount: 1,
  cachedInputTokens: 0,
  cachedShareOfInput: null,
  uncachedInputTokens: 1000,
  cacheWriteTokens: 0,
  outputTokens: 0,
  cacheSavingsUsd: null,
  cacheSavingsUnknownFactCount: 0,
  savingsMultiple: null,
  ...overrides,
});

describe('UsageKpiStripComponent', () => {
  let fixture: ComponentFixture<UsageKpiStripComponent>;

  const render = (inputs: Record<string, unknown>): void => {
    fixture = TestBed.createComponent(UsageKpiStripComponent);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
  };
  const total = (): HTMLElement =>
    fixture.nativeElement.querySelector('[data-testid="usage-total-cost"]') as HTMLElement;

  it('shows a sub-cent raw cost and savings with the table money format, not $0.00', () => {
    render({ kpis: kpis({ cacheSavingsUsd: 0.0012 }), totalCostUsd: 0.0034 });
    expect(total().textContent?.trim()).toBe('$0.0034');
    expect(total().getAttribute('title')).toBe('Cache savings $0.0012');
  });

  it('keeps the lower-bound prefix on cost and savings', () => {
    render({
      kpis: kpis({ cacheSavingsUsd: 0.0012, cacheSavingsUnknownFactCount: 1 }),
      totalCostUsd: 0.0034,
      totalUnpricedFactCount: 2,
      totalUnpricedTokens: 500,
    });
    expect(total().textContent?.trim()).toBe('≥ $0.0034');
    expect(total().getAttribute('title')).toBe('2 facts unpriced, 500 tokens. Cache savings ≥ $0.0012');
  });

  it('keeps "Unknown" for an unpriced total and two-decimal dollars above a cent', () => {
    render({ kpis: kpis(), totalCostUsd: null });
    expect(total().textContent?.trim()).toBe('Unknown');
    expect(total().getAttribute('title')).toBe('No savings data');

    render({ kpis: kpis({ cacheSavingsUsd: 2.4 }), totalCostUsd: 6 });
    expect(total().textContent?.trim()).toBe('$6.00');
    expect(total().getAttribute('title')).toBe('Cache savings $2.40');
  });
});

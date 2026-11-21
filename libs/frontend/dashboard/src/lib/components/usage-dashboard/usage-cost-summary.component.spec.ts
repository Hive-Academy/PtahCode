import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { UsageCostSummaryComponent } from './usage-cost-summary.component';
import type { ProviderUsageRow } from './usage-summary.view-model';

const row = (providerId: string, costUsd: number | null, shareOfCost: number | null): ProviderUsageRow => ({
  providerId,
  displayName: providerId,
  costUsd,
  shareOfCost,
  tokens: 1000,
  accent: '#888',
  hasUnpricedFacts: false,
  unpricedFactCount: 0,
  unpricedTokens: 0,
  cacheSavingsUsd: null,
  savingsUnknownFactCount: 0,
});

describe('UsageCostSummaryComponent', () => {
  let fixture: ComponentFixture<UsageCostSummaryComponent>;

  const render = (providers: readonly ProviderUsageRow[]): HTMLElement[] => {
    fixture = TestBed.createComponent(UsageCostSummaryComponent);
    fixture.componentRef.setInput('providers', providers);
    fixture.detectChanges();
    return Array.from(fixture.nativeElement.querySelectorAll('[data-testid="usage-provider-row"]'));
  };
  const bar = (li: HTMLElement): HTMLElement | null => li.querySelector('[aria-hidden="true"] > span');

  it('draws each bar at the share of cost its caption states', () => {
    const [first, second] = render([row('anthropic', 60, 0.6), row('openai', 40, 0.4)]);
    expect(first.textContent).toContain('60% of cost');
    expect(bar(first)?.style.width).toBe('60%');
    expect(second.textContent).toContain('40% of cost');
    expect(bar(second)?.style.width).toBe('40%');
  });

  it('keeps a 2% sliver for a tiny share and no width for a zero or unknown share', () => {
    const [tiny, zero, unknown] = render([row('a', 0.01, 0.0001), row('b', 0, 0), row('c', 5, null)]);
    expect(bar(tiny)?.style.width).toBe('2%');
    expect(bar(zero)?.style.width).toBe('0%');
    expect(bar(unknown)?.style.width).toBe('0%');
  });
});

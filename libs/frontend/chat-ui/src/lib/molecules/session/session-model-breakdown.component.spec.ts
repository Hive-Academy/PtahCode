import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ModelStateService } from '@ptah-extension/core';
import type { SessionStatsEntry } from '@ptah-extension/shared';
import { SessionModelBreakdownComponent } from './session-model-breakdown.component';

const SNAPSHOT: SessionStatsEntry = {
  sessionId: 'session-1',
  model: 'claude-opus-4-7',
  totalCost: 38.18,
  knownCost: 38.18,
  tokens: {
    input: 15_200,
    output: 396_700,
    cacheRead: 14_388_100,
    cacheCreation: 100_000,
  },
  tokenCount: 14_900_000,
  messageCount: 0,
  agentSessionCount: 9,
  modelUsageList: [
    {
      model: 'claude-opus-4-7',
      inputTokens: 15_000,
      outputTokens: 396_000,
      cacheRead: 14_000_000,
      cacheCreation: 90_000,
      costUSD: 38,
    },
    {
      model: 'claude-haiku-4-5',
      inputTokens: 200,
      outputTokens: 700,
      cacheRead: 388_100,
      cacheCreation: 10_000,
      costUSD: 0.18,
    },
  ],
  status: 'ok',
  pricingCoverage: 'full',
  scope: 'session',
  revision: 4,
};

describe('SessionModelBreakdownComponent', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders the named per-model table with its snapshot rows and totals', () => {
    TestBed.configureTestingModule({
      imports: [SessionModelBreakdownComponent],
      providers: [
        {
          provide: ModelStateService,
          useValue: {
            availableModels: signal([
              { id: 'claude-opus-4-7', name: 'Opus 4.7' },
              { id: 'claude-haiku-4-5', name: 'Haiku 4.5' },
            ]),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(SessionModelBreakdownComponent);
    fixture.componentRef.setInput('snapshot', SNAPSHOT);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const table = root.querySelector<HTMLElement>(
      '[data-testid="model-usage-table"]',
    );
    const rows = root.querySelectorAll('[data-testid="model-usage-row"]');

    expect(table?.getAttribute('aria-label')).toBe('Per-model usage');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Opus 4.7');
    expect(rows[1].textContent).toContain('Haiku 4.5');
    expect(
      root.querySelector('[data-testid="model-usage-total"]')?.textContent,
    ).toContain('$38.18');
  });

  function mountBreakdown(snapshot: SessionStatsEntry) {
    TestBed.configureTestingModule({
      imports: [SessionModelBreakdownComponent],
      providers: [
        { provide: ModelStateService, useValue: { availableModels: signal([]) } },
      ],
    });
    const fixture = TestBed.createComponent(SessionModelBreakdownComponent);
    fixture.componentRef.setInput('snapshot', snapshot);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const costCell = (row: Element) =>
      row.querySelector('[role="cell"]:last-child') as HTMLElement;
    return {
      cells: [...root.querySelectorAll('[data-testid="model-usage-row"]')].map(costCell),
      total: costCell(root.querySelector('[data-testid="model-usage-total"]') as Element),
    };
  }

  it('labels rows "Not priced" when the session names a missing rate', () => {
    const { cells, total } = mountBreakdown({
      ...SNAPSHOT,
      totalCost: null,
      knownCost: null,
      pricingCoverage: 'none',
      costUnavailableReason: 'rate-missing',
      modelUsageList: SNAPSHOT.modelUsageList?.map((row) => ({ ...row, costUSD: null })),
    });
    for (const cell of cells) {
      expect(cell.textContent?.trim()).toBe('Not priced');
      expect(cell.classList.contains('text-success')).toBe(false);
    }
    expect(total.textContent?.trim()).toBe('Not priced');
  });

  it('keeps "—" for a partly priced row and labels the known subtotal Total', () => {
    const rows = SNAPSHOT.modelUsageList ?? [];
    const { cells, total } = mountBreakdown({
      ...SNAPSHOT,
      totalCost: null,
      knownCost: 38,
      pricingCoverage: 'partial',
      modelUsageList: [rows[0], { ...rows[1], costUSD: null }],
    });
    expect(cells[0].textContent?.trim()).toBe('$38.00');
    expect(cells[0].classList.contains('text-success')).toBe(true);
    expect(cells[1].textContent?.trim()).toBe('—');
    expect(cells[1].getAttribute('title')).toBe('not reported');
    expect(cells[1].classList.contains('text-success')).toBe(false);
    expect(total.textContent?.trim()).toBe('known subtotal $38.00');
    expect(total.classList.contains('text-success')).toBe(false);
  });

  it('does not colour an absent (undefined) row cost as priced', () => {
    const rows = SNAPSHOT.modelUsageList ?? [];
    const { cells } = mountBreakdown({
      ...SNAPSHOT,
      modelUsageList: [
        rows[0],
        { ...rows[1], costUSD: undefined as unknown as number | null },
      ],
    });
    expect(cells[1].textContent?.trim()).toBe('—');
    expect(cells[1].classList.contains('text-success')).toBe(false);
    expect(cells[0].textContent?.trim()).toBe('$38.00');
  });
});

describe('SESSION model scope', () => {
  it.each([
    [{}, 'Reported'],
    [{ costBasis: 'estimated' }, 'Estimated'],
    [{ costBasis: 'covered-by-subscription' }, 'Covered by subscription'],
    [{ pricingCoverage: 'partial' }, 'Partial pricing'],
    [{ totalCost: null, costUnavailableReason: 'rate-missing' }, 'Not priced'],
  ] satisfies Array<[Partial<SessionStatsEntry>, string]>)('names the SDK cost basis for %j', (patch, label) => {
    TestBed.configureTestingModule({
      imports: [SessionModelBreakdownComponent],
      providers: [{ provide: ModelStateService, useValue: { availableModels: signal([]) } }],
    });
    const fixture = TestBed.createComponent(SessionModelBreakdownComponent);
    fixture.componentRef.setInput('snapshot', { ...SNAPSHOT, ...patch, modelUsageList: [] });
    const tokens = {
      id: 'tokens', sdkLabel: '14.9M', cliLabel: '—', sourceText: 'SDK subtotal: 14,900,000 tokens',
      reported: 0, laneCount: 0,
    };
    fixture.componentRef.setInput('sources', [tokens, { ...tokens, id: 'cost', sdkLabel: '$38.18' }]);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('SDK scope — orchestrator and SDK subagents, no CLI lanes');
    expect(root.textContent).toContain('SDK subtotal');
    expect(root.textContent).toMatch(/Cost basis\s*/);
    expect(root.querySelector('dl > div:last-child dd')?.textContent?.trim()).toBe(label);
    expect(root.querySelector('[data-testid="model-usage-total"]')?.classList.contains('sr-only')).toBe(true);
    expect(root.querySelector('[data-testid="model-usage-total"]')?.textContent).toContain('Cache read');
  });
});

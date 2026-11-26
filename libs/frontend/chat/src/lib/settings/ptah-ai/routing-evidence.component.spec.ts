import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ClaudeRpcService } from '@ptah-extension/core';
import { rpcError, rpcSuccess } from '@ptah-extension/core/testing';
import type {
  AgentGetRoutingEvidenceResult,
  AgentRoutingEvidenceKey,
  AgentRoutingEvidenceLane,
  AgentRoutingFunnel,
} from '@ptah-extension/shared';
import { RoutingEvidenceComponent } from './routing-evidence.component';

const NOW = Date.parse('2026-11-25T12:00:00Z');
const FUNNEL: AgentRoutingFunnel = {
  spawned: 10,
  completed: 9,
  delivered: 8,
  reviewed: 7,
  approved: 6,
  capacityDropped: 1,
  unverified: 1,
  noDeliverable: 1,
  failed: 0,
  rejected: 0,
  unresolvedRevise: 1,
  reviseRounds: 3,
};
const KEY: AgentRoutingEvidenceKey = {
  taskKind: 'implement',
  effort: 'high',
  funnel: FUNNEL,
  effortNotSent: 2,
  durationMs: { total: 500, count: 10 },
  inputTokens: { total: 0, count: 0 },
  outputTokens: { total: 0, count: 0 },
  costUsd: { total: 0, count: 0 },
  score: 74,
  sampleCount: 10,
  asOf: '2026-11-24T12:00:00Z',
  stale: true,
};
const EMPTY_KEY: AgentRoutingEvidenceKey = {
  ...KEY,
  effort: '*',
  score: null,
  sampleCount: 0,
  asOf: null,
  stale: false,
};
const LANE: AgentRoutingEvidenceLane = {
  laneId: 'test-lane',
  family: 'test',
  catalog: {
    status: 'timeout',
    fetchedAt: NOW - 10 * 60_000,
    lastOkAt: NOW - 2 * 86_400_000,
    modelCount: 3,
  },
  models: [
    {
      model: 'native-model',
      inCatalog: true,
      efforts: {
        provenance: 'native',
        supported: ['vendor-low', 'high'],
        default: 'vendor-low',
      },
      keys: [KEY, EMPTY_KEY],
    },
    {
      model: 'fallback-model',
      inCatalog: true,
      efforts: { provenance: 'ptah-fallback', supported: ['low'], default: null },
      keys: [EMPTY_KEY],
    },
    {
      model: 'unknown-model',
      inCatalog: true,
      efforts: { provenance: 'unknown' },
      keys: [],
    },
  ],
};
const EVIDENCE: AgentGetRoutingEvidenceResult = {
  windowDays: 30,
  performanceRouting: true,
  lanes: [LANE],
  decisionModels: [
    {
      decisionModel: 'router-model',
      proposals: 10,
      accepted: 7,
      meanConfidence: 0.8,
      funnel: FUNNEL,
    },
  ],
};

describe('RoutingEvidenceComponent', () => {
  let fixture: ComponentFixture<RoutingEvidenceComponent>;
  const call = jest.fn();
  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const cards = (): HTMLElement[] =>
    Array.from(root().querySelectorAll<HTMLElement>('[data-testid="routing-model-card"]'));

  beforeEach(() => {
    call.mockReset();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    TestBed.configureTestingModule({
      imports: [RoutingEvidenceComponent],
      providers: [{ provide: ClaudeRpcService, useValue: { call } }],
    });
  });

  afterEach(() => jest.restoreAllMocks());

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function create(): Promise<void> {
    fixture = TestBed.createComponent(RoutingEvidenceComponent);
    fixture.detectChanges();
    await settle();
  }

  it('shows a compact measured-model card and hides zero-sample combinations', async () => {
    call.mockResolvedValueOnce(rpcSuccess(EVIDENCE));

    await create();

    expect(call).toHaveBeenCalledWith('agent:getRoutingEvidence', {}, { timeout: 5_000 });
    expect(root().textContent).toContain('Catalog: Timed out');
    expect(root().textContent).toContain('Last successful fetch: 2 days ago');
    expect(root().textContent).toContain('Last attempt: 10 min ago');
    expect(root().textContent).toContain('1 measured model');
    expect(root().textContent).toContain('1 sampled cell');
    expect(cards().map((card) => card.dataset['model'])).toEqual(['native-model']);

    const card = cards()[0];
    expect(card.textContent).toContain('Native');
    expect(card.textContent).toContain('Default: vendor-low');
    expect(card.textContent).toContain('10 total samples');
    expect(card.textContent).toContain('Score 74');
    expect(card.textContent).toContain('10 samples');
    expect(card.textContent).toContain('Stale');
    expect(
      Array.from(
        card.querySelectorAll('[data-testid="routing-supported-effort"]'),
        (chip) => chip.textContent?.trim(),
      ),
    ).toEqual(['vendor-low', 'high']);

    const cells = root().querySelectorAll('[data-testid="routing-evidence-cell"]');
    expect(cells).toHaveLength(1);
    expect(cells[0]?.getAttribute('data-task-kind')).toBe('implement');
    expect(cells[0]?.getAttribute('data-effort')).toBe('high');
    expect(root().textContent).not.toContain('no samples');

    const catalogOnly = root().querySelector('[data-testid="routing-catalog-models"]');
    expect(catalogOnly?.textContent).toContain('Catalog models without evidence (2)');
    expect(catalogOnly?.textContent).toContain('fallback-model');
    expect(catalogOnly?.textContent).toContain('Ptah fallback');
    expect(catalogOnly?.textContent).toContain('unknown-model');
    expect(catalogOnly?.textContent).toContain('not reported');
  });

  it('expands model details and keeps separate decision model outcomes', async () => {
    call.mockResolvedValueOnce(rpcSuccess(EVIDENCE));

    await create();

    const details = root().querySelector<HTMLDetailsElement>(
      '[data-testid="routing-model-details"]',
    );
    const summary = details?.querySelector<HTMLElement>('summary');
    expect(summary?.textContent).toContain('Outcome details (1)');
    summary?.click();
    expect(details?.open).toBe(true);
    expect(details?.textContent).toContain('implement');
    expect(details?.textContent).toContain('high');
    expect(details?.textContent).toContain('Measured 1 day ago');
    expect(details?.textContent).toContain('Effort not sent: 2');
    expect(details?.querySelector('dt')?.textContent).toBe('Spawned');
    expect(details?.querySelector('dd')?.textContent).toBe('10');
    expect(details?.textContent).toContain('Capacity drop-outs');

    const decision = root().querySelector('table[aria-label="Decision model outcomes"] tbody tr');
    expect(decision?.querySelector('th')?.textContent).toBe('router-model');
    expect(
      Array.from(decision?.querySelectorAll('td') ?? [])
        .slice(0, 3)
        .map((cell) => cell.textContent?.trim()),
    ).toEqual(['10', '7', '80%']);
    expect(decision?.querySelector('details')?.textContent).toContain('Approved');
  });

  it('keeps family-default, historical, and unknown-score evidence visible', async () => {
    call.mockResolvedValueOnce(
      rpcSuccess({
        ...EVIDENCE,
        lanes: [
          {
            ...LANE,
            models: [
              {
                model: '*',
                inCatalog: false,
                efforts: { provenance: 'unknown' },
                keys: [KEY],
              },
              {
                model: 'historical-model',
                inCatalog: false,
                efforts: { provenance: 'unknown' },
                keys: [{ ...KEY, taskKind: 'review', score: null, sampleCount: 2 }],
              },
            ],
          },
        ],
      }),
    );

    await create();

    expect(cards().map((card) => card.dataset['model'])).toEqual(['*', 'historical-model']);
    expect(cards()[0]?.querySelector('h4')?.textContent?.trim()).toBe('Family default');
    expect(cards()[0]?.textContent).not.toContain('Outside current catalog');
    expect(cards()[1]?.textContent).toContain('Outside current catalog');
    expect(cards()[1]?.textContent).toContain('Score not reported');
    expect(cards()[1]?.textContent).toContain('2 total samples');
  });

  it('does not add overlapping wildcard and effort-specific sample totals', async () => {
    call.mockResolvedValueOnce(
      rpcSuccess({
        ...EVIDENCE,
        lanes: [
          {
            ...LANE,
            models: [
              {
                ...LANE.models[0],
                keys: [
                  { ...KEY, effort: '*', sampleCount: 10 },
                  { ...KEY, effort: 'high', sampleCount: 4 },
                ],
              },
            ],
          },
        ],
      }),
    );

    await create();

    expect(root().querySelectorAll('[data-testid="routing-evidence-cell"]')).toHaveLength(2);
    expect(root().querySelector('[data-testid="routing-model-sample-total"]')?.textContent).toContain(
      'Sample totals overlap',
    );
    expect(root().textContent).not.toContain('14 total samples');
    expect(root().querySelector('[data-testid="routing-model-details"]')?.textContent).toContain(
      'Wildcard and effort-specific samples are not added together.',
    );
  });

  it('shows one empty state per CLI and collapses catalog-only models', async () => {
    call.mockResolvedValueOnce(
      rpcSuccess({
        ...EVIDENCE,
        lanes: [
          { ...LANE, laneId: 'empty-lane', models: [] },
          { ...LANE, laneId: 'catalog-lane', models: LANE.models.slice(1) },
        ],
        decisionModels: [],
      }),
    );

    await create();

    const emptyStates = Array.from(
      root().querySelectorAll<HTMLElement>('[data-testid="routing-lane-empty"]'),
    );
    expect(emptyStates.map((state) => state.textContent?.trim())).toEqual([
      'No models or measured outcomes yet.',
      'No measured outcomes in this window.',
    ]);
    expect(cards()).toHaveLength(0);
    expect(root().querySelectorAll('[data-testid="routing-evidence-cell"]')).toHaveLength(0);
    expect(root().textContent).toContain('Catalog models without evidence (2)');
    expect(root().textContent).toContain('No decision model outcomes yet.');
  });

  it('shows loading while the request is pending', async () => {
    let resolve: ((value: ReturnType<typeof rpcSuccess<AgentGetRoutingEvidenceResult>>) => void) | undefined;
    call.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    fixture = TestBed.createComponent(RoutingEvidenceComponent);

    fixture.detectChanges();

    expect(root().querySelector('ptah-skeleton')).not.toBeNull();
    expect(root().textContent).toContain('Loading routing evidence…');
    resolve?.(rpcSuccess({ ...EVIDENCE, lanes: [], decisionModels: [] }));
    await settle();
    expect(root().textContent).toContain('No lane evidence yet.');
  });

  it('reports RPC failure and retries into an empty state', async () => {
    call
      .mockResolvedValueOnce(rpcError('host unavailable'))
      .mockResolvedValueOnce(rpcSuccess({ ...EVIDENCE, lanes: [], decisionModels: [] }));

    await create();

    expect(root().textContent).toContain('Routing evidence could not be loaded.');
    root().querySelector<HTMLButtonElement>('ptah-alert button')?.click();
    await settle();
    expect(call).toHaveBeenCalledTimes(2);
    expect(root().textContent).toContain('No lane evidence yet.');
    expect(root().textContent).toContain('No decision model outcomes yet.');
  });
});

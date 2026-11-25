import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ClaudeRpcService } from '@ptah-extension/core';
import { rpcError, rpcSuccess } from '@ptah-extension/core/testing';
import type {
  AgentGetRoutingEvidenceResult,
  AgentRoutingEvidenceKey,
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
const EVIDENCE: AgentGetRoutingEvidenceResult = {
  windowDays: 30,
  performanceRouting: true,
  lanes: [
    {
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
          efforts: { provenance: 'native', supported: ['vendor-low', 'high'], default: 'vendor-low' },
          keys: [KEY],
        },
        {
          model: 'fallback-model',
          inCatalog: true,
          efforts: { provenance: 'ptah-fallback', supported: ['low'], default: null },
          keys: [{ ...KEY, effort: '*', score: null, sampleCount: 0, asOf: null, stale: false }],
        },
        {
          model: 'unknown-model',
          inCatalog: true,
          efforts: { provenance: 'unknown' },
          keys: [],
        },
      ],
    },
  ],
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

  it('shows catalog status and age, model scores, and efforts with their provenance', async () => {
    call.mockResolvedValueOnce(rpcSuccess(EVIDENCE));

    await create();

    expect(call).toHaveBeenCalledWith('agent:getRoutingEvidence', {}, { timeout: 5_000 });
    expect(root().textContent).toContain('Timed out');
    expect(root().textContent).toContain('Last successful fetch: 2 days ago');
    expect(root().textContent).toContain('Last attempt: 10 min ago');
    const rows = root().querySelectorAll('table[aria-label="Model evidence for test-lane"] tbody tr');
    expect(Array.from(rows, (row) => row.querySelector('th')?.textContent?.trim())).toEqual([
      'native-model', 'fallback-model', 'unknown-model',
    ]);
    expect(rows[0].querySelector('[data-ptah-badge]')?.textContent?.trim()).toBe('Native');
    expect(rows[0].textContent).toContain('vendor-low, high');
    expect(rows[0].textContent).toContain('Default: vendor-low');
    expect(rows[0].textContent).toContain('Score 74');
    expect(rows[0].textContent).toContain('10 samples');
    expect(rows[0].textContent).toContain('1 day ago');
    expect(rows[0].textContent).toContain('Stale');
    expect(rows[1].querySelector('[data-ptah-badge]')?.textContent?.trim()).toBe('Ptah fallback');
    expect(rows[1].textContent).toContain('low');
    expect(rows[1].textContent).toContain('no samples');
    expect(rows[1].textContent).not.toContain('Score');
    expect(rows[2].querySelector('[data-ptah-badge]')?.textContent?.trim()).toBe('not reported');
  });

  it('renders the key funnel and a separate decision model outcome table', async () => {
    call.mockResolvedValueOnce(rpcSuccess(EVIDENCE));

    await create();

    const key = root().querySelector('table[aria-label="Model evidence for test-lane"] details');
    expect(key?.querySelector('summary')?.textContent).toMatch(/implement\s*·\s*high/);
    expect(key?.querySelector('dt')?.textContent).toBe('Spawned');
    expect(key?.querySelector('dd')?.textContent).toBe('10');
    expect(key?.textContent).toContain('Capacity drop-outs');
    expect(key?.textContent).toContain('Effort not sent: 2');
    const decision = root().querySelector('table[aria-label="Decision model outcomes"] tbody tr');
    expect(decision?.querySelector('th')?.textContent).toBe('router-model');
    expect(Array.from(decision?.querySelectorAll('td') ?? []).slice(0, 3).map(
      (cell) => cell.textContent?.trim(),
    )).toEqual(['10', '7', '80%']);
    expect(decision?.querySelector('details')?.textContent).toContain('Approved');
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

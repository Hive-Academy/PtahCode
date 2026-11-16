import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import {
  ClaudeRpcService,
  ProvidersSettingsStateService,
} from '@ptah-extension/core';
import { rpcError, rpcSuccess } from '@ptah-extension/core/testing';
import type { AgentGetCapabilityMatrixResult } from '@ptah-extension/shared';
import { CapabilityMatrixSettingComponent } from './capability-matrix-setting.component';

const UNKNOWN = { kind: 'unknown' as const };
const value = (score: number) => ({
  kind: 'value' as const,
  score,
  source: 'local' as const,
  sourceRef: null,
  asOf: '2026-11-01',
  stale: true,
  sampleCount: 2,
});
const profile = (model: string, score: number | null) => ({
  family: 'sample',
  model,
  cells: {
    plan: UNKNOWN,
    implement: score === null ? UNKNOWN : value(score),
    review: UNKNOWN,
    research: UNKNOWN,
    tests: UNKNOWN,
    docs: UNKNOWN,
  },
});
const result: AgentGetCapabilityMatrixResult = {
  profiles: [
    profile('model-a', null),
    profile('model-b', 20),
    profile('*', 55),
    profile('model-c', 80),
  ],
  lastPicksUnavailable: true,
};

describe('CapabilityMatrixSettingComponent', () => {
  let fixture: ComponentFixture<CapabilityMatrixSettingComponent>;
  let call: jest.Mock;
  const root = () => fixture.nativeElement as HTMLElement;
  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }
  beforeEach(() => {
    call = jest.fn();
    TestBed.configureTestingModule({
      imports: [CapabilityMatrixSettingComponent],
      providers: [
        { provide: ClaudeRpcService, useValue: { call } },
        {
          provide: ProvidersSettingsStateService,
          useValue: {
            cliAgents: signal({ status: 'ready', data: [] }),
            cliModels: signal({ status: 'ready', data: {} }),
          },
        },
      ],
    });
  });
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });
  it('shows family defaults, unknown cells and per-cell provenance', async () => {
    call.mockResolvedValue(rpcSuccess(result));
    fixture = TestBed.createComponent(CapabilityMatrixSettingComponent);
    fixture.detectChanges();
    await settle();
    expect(call).toHaveBeenCalledWith(
      'agent:getCapabilityMatrix',
      {},
      { timeout: 5_000 },
    );
    expect(
      root().querySelector('[data-testid="matrix-row-sample-*-plan"]')
        ?.textContent,
    ).toContain('Unrated');
    expect(
      root().querySelector('[data-testid="matrix-row-sample-*-implement"]')
        ?.textContent,
    ).toContain('55');
    expect(root().textContent).toContain('Family default');
    expect(root().textContent).toContain('Recent picks are unavailable');
    expect(root().querySelectorAll('thead th')).toHaveLength(7);
    expect(root().querySelector('ptah-table-row-expander')).toBeNull();
    expect(root().querySelector('tr.ptah-table-detail-row')).toBeNull();
    expect(
      root()
        .querySelector('[data-testid="matrix-row-sample-*-implement"] button')
        ?.getAttribute('aria-label'),
    ).toBe('Details for Implement for Family default');
    (
      root().querySelector(
        '[data-testid="matrix-row-sample-*-implement"] button',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(root().textContent).toContain('Samples: 2');
    expect(root().textContent).toContain('Source: local');
    expect(root().querySelector('#capability-matrix-heading')?.tagName).toBe(
      'H3',
    );
  });
  it('keeps colliding names and punctuation distinct across popovers', async () => {
    const profiles = [
      { ...profile('c', 20), family: 'a-b' },
      { ...profile('b-c', 30), family: 'a' },
      { ...profile('model !? /', 40), family: 'family !? /' },
    ];
    call.mockResolvedValue(rpcSuccess({ profiles }));
    fixture = TestBed.createComponent(CapabilityMatrixSettingComponent);
    fixture.detectChanges();
    await settle();
    const triggers = [
      ...root().querySelectorAll<HTMLButtonElement>(
        'button[aria-controls^="detail-"]',
      ),
    ];
    const ids = triggers.map((button) => button.getAttribute('aria-controls'));
    expect(triggers).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(
      root().querySelectorAll('[data-testid="matrix-row-a-b-c-implement"]'),
    ).toHaveLength(2);
    triggers[0].click();
    fixture.detectChanges();
    expect(
      triggers.filter(
        (button) => button.getAttribute('aria-expanded') === 'true',
      ),
    ).toHaveLength(1);
    expect(root().querySelectorAll('[id^="detail-"]')).toHaveLength(1);
    expect(root().querySelector(`[id="${ids[0]}"]`)).not.toBeNull();
  });
  it('connects collapsed detail triggers to their content', async () => {
    const original = globalThis.ResizeObserver;
    let resize!: ResizeObserverCallback;
    class MockResizeObserver implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resize = callback;
      }
      observe(): void {
        resize([{ contentRect: { width: 500 } } as ResizeObserverEntry], this);
      }
      unobserve(): void {
        /* No observed nodes to release. */
      }
      disconnect(): void {
        /* No observed nodes to release. */
      }
    }
    globalThis.ResizeObserver = MockResizeObserver;
    try {
      call.mockResolvedValue(rpcSuccess(result));
      fixture = TestBed.createComponent(CapabilityMatrixSettingComponent);
      fixture.detectChanges();
      await settle();
      fixture.detectChanges();
      const expander = root().querySelector(
        'ptah-table-row-expander button',
      ) as HTMLButtonElement;
      expander.click();
      fixture.detectChanges();
      const trigger = root().querySelector(
        'tr.ptah-table-detail-row button[aria-label="Details for Implement for Family default"]',
      ) as HTMLButtonElement;
      const id = trigger.getAttribute('aria-controls');
      expect(id).toMatch(/^detail-/);
      trigger.click();
      fixture.detectChanges();
      expect(root().querySelector(`[id="${id}"]`)).not.toBeNull();
    } finally {
      globalThis.ResizeObserver = original;
    }
  });
  it('shows error and retries', async () => {
    call
      .mockResolvedValueOnce(rpcError('unavailable'))
      .mockResolvedValueOnce(rpcSuccess(result));
    fixture = TestBed.createComponent(CapabilityMatrixSettingComponent);
    fixture.detectChanges();
    await settle();
    expect(
      root().querySelector('[data-testid="capability-matrix-error"]'),
    ).not.toBeNull();
    expect(root().querySelectorAll('button')).toHaveLength(1);
    expect(root().querySelector('button')?.textContent?.trim()).toBe('Retry');
    // The one real Retry button keeps the main-branch hook.
    expect(root().querySelector('button')?.getAttribute('data-testid')).toBe(
      'capability-matrix-retry',
    );
    (
      root().querySelector(
        '[data-testid="capability-matrix-retry"]',
      ) as HTMLButtonElement
    ).click();
    await settle();
    expect(call).toHaveBeenCalledTimes(2);
  });
  it('puts unknown ratings last in both sort directions and keeps the family default first', async () => {
    call.mockResolvedValue(rpcSuccess(result));
    fixture = TestBed.createComponent(CapabilityMatrixSettingComponent);
    fixture.componentRef.setInput('sortKind', 'implement');
    fixture.componentRef.setInput('sortDescending', true);
    fixture.detectChanges();
    await settle();
    const labels = () =>
      [...root().querySelectorAll('tbody th[scope="row"]')].map((th) =>
        th.firstChild?.textContent?.trim(),
      );
    expect(labels()).toEqual([
      'Family default',
      'model-c',
      'model-b',
      'model-a',
    ]);
    fixture.componentRef.setInput('sortDescending', false);
    fixture.detectChanges();
    expect(labels()).toEqual([
      'Family default',
      'model-b',
      'model-c',
      'model-a',
    ]);
  });
  it('marks the real loading and empty state elements without duplicate text', async () => {
    let resolve!: (value: unknown) => void;
    call.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    fixture = TestBed.createComponent(CapabilityMatrixSettingComponent);
    fixture.detectChanges();
    expect(
      root().querySelector(
        '[data-testid="capability-matrix-loading"] [role="status"]',
      ),
    ).not.toBeNull();
    resolve(rpcSuccess({ profiles: [] }));
    await settle();
    expect(
      root().querySelector(
        '[data-testid="capability-matrix-empty"] ptah-state-panel',
      ),
    ).not.toBeNull();
    expect(root().querySelectorAll('button')).toHaveLength(0);
  });
  it('shows a filtered empty message when profiles exist but none match', async () => {
    call.mockResolvedValue(rpcSuccess(result));
    fixture = TestBed.createComponent(CapabilityMatrixSettingComponent);
    fixture.componentRef.setInput('familyFilter', 'missing');
    fixture.detectChanges();
    await settle();
    expect(root().querySelector('[data-testid="capability-matrix-empty"]')).toBeNull();
    expect(root().querySelector('[data-testid="capability-matrix-table"]')).not.toBeNull();
    expect(root().querySelector('[data-testid="capability-matrix-filtered-empty"]')?.textContent).toContain('No models match the filters.');
  });
  it('ignores an older request that resolves after a newer reload', async () => {
    let resolveFirst!: (value: unknown) => void;
    call.mockImplementationOnce(() => new Promise((done) => { resolveFirst = done; }))
      .mockResolvedValueOnce(rpcSuccess(result));
    fixture = TestBed.createComponent(CapabilityMatrixSettingComponent);
    const emitted: (AgentGetCapabilityMatrixResult | null)[] = [];
    fixture.componentInstance.resultChange.subscribe((value) => emitted.push(value));
    fixture.detectChanges();
    await fixture.componentInstance.reload();
    await settle();
    resolveFirst(rpcError('old failure'));
    await settle();
    expect(emitted).toEqual([result]);
    expect(root().querySelector('[data-testid="capability-matrix-error"]')).toBeNull();
    expect(root().querySelector('[data-testid="matrix-row-sample-*-implement"]')).not.toBeNull();
  });
});

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import {
  ClaudeRpcService,
  ProvidersSettingsStateService,
} from '@ptah-extension/core';
import { rpcError, rpcSuccess } from '@ptah-extension/core/testing';
import { DecisionMatrixPageComponent } from './decision-matrix-page.component';

describe('DecisionMatrixPageComponent', () => {
  it('shows the page header and RPC-backed band', async () => {
    const call = jest
      .fn()
      .mockResolvedValue(
        rpcSuccess({ profiles: [], lastPicksUnavailable: false }),
      );
    TestBed.configureTestingModule({
      imports: [DecisionMatrixPageComponent],
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
    const fixture = TestBed.createComponent(DecisionMatrixPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('Decision matrix');
    expect(root.textContent).toContain('No ratings yet.');
    expect(root.textContent).toContain('Families');
    expect(root.querySelector('#capability-matrix-heading')?.tagName).toBe(
      'H2',
    );
    const refresh = root.querySelector(
      'button[aria-label="Refresh ratings"]',
    ) as HTMLButtonElement;
    expect(refresh.querySelector('lucide-angular')).not.toBeNull();
    expect(refresh.textContent).not.toContain('?');
    expect(call).toHaveBeenCalledTimes(1);
    fixture.destroy();
    TestBed.resetTestingModule();
  });
  it('ends refresh busy state and announces an RPC error once', async () => {
    let fail!: (value: unknown) => void;
    const call = jest
      .fn()
      .mockResolvedValueOnce(rpcSuccess({ profiles: [] }))
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            fail = done;
          }),
      );
    TestBed.configureTestingModule({
      imports: [DecisionMatrixPageComponent],
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
    const fixture = TestBed.createComponent(DecisionMatrixPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const refresh = root.querySelector(
      'button[aria-label="Refresh ratings"]',
    ) as HTMLButtonElement;
    refresh.click();
    fixture.detectChanges();
    expect(refresh.getAttribute('aria-busy')).toBe('true');
    refresh.click();
    expect(call).toHaveBeenCalledTimes(2);
    fail(rpcError('unavailable'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(refresh.getAttribute('aria-busy')).not.toBe('true');
    expect(root.querySelectorAll('button').length).toBeGreaterThan(0);
    expect(root.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(root.querySelector('[aria-live="polite"]')?.textContent).toContain(
      'Ratings could not be loaded.',
    );
    fixture.destroy();
    TestBed.resetTestingModule();
  });
  it('counts only distinct models with a value rating and uses one ready announcement', async () => {
    const unknown = { kind: 'unknown' as const };
    const emptyCells = {
      plan: unknown,
      implement: unknown,
      review: unknown,
      research: unknown,
      tests: unknown,
      docs: unknown,
    };
    const ratedCells = {
      ...emptyCells,
      plan: {
        kind: 'value' as const,
        score: 70,
        source: 'local' as const,
        sourceRef: null,
        asOf: '2026-11-01',
        stale: false,
        sampleCount: 1,
      },
    };
    const profiles = [
      { family: 'one', model: '*', cells: ratedCells },
      { family: 'one', model: 'unknown-only', cells: emptyCells },
      { family: 'one', model: 'rated', cells: ratedCells },
      { family: 'two', model: 'rated', cells: ratedCells },
    ];
    const call = jest.fn().mockResolvedValue(rpcSuccess({ profiles }));
    TestBed.configureTestingModule({
      imports: [DecisionMatrixPageComponent],
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
    const fixture = TestBed.createComponent(DecisionMatrixPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(
      root.querySelector(
        'ptah-instrument-band button[aria-label="Families 2"]',
      ),
    ).not.toBeNull();
    expect(
      root.querySelector(
        'ptah-instrument-band button[aria-label="Models rated 1"]',
      ),
    ).not.toBeNull();
    expect(root.querySelector('#capability-matrix-heading')?.tagName).toBe(
      'H2',
    );
    expect(root.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(root.querySelector('[aria-live="polite"]')?.textContent).toContain(
      '4 ratings loaded.',
    );
    fixture.destroy();
    TestBed.resetTestingModule();
  });
});

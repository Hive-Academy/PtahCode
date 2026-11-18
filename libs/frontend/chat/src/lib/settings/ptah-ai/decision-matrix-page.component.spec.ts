import { TestBed } from '@angular/core/testing';
import {
  ChangeDetectionStrategy,
  Component,
  signal,
  output,
} from '@angular/core';
import {
  ClaudeRpcService,
  ProvidersSettingsStateService,
} from '@ptah-extension/core';
import { rpcError, rpcSuccess } from '@ptah-extension/core/testing';
import { By } from '@angular/platform-browser';
import { PtahRichSelectComponent } from '@ptah-extension/ui';
import { DecisionMatrixPageComponent } from './decision-matrix-page.component';
import { HostRoutingSettingComponent } from './host-routing-setting.component';
import { LaneRotationSettingComponent } from './lane-rotation-setting.component';
@Component({
  selector: 'ptah-host-routing-setting',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class HostRoutingStubComponent {
  readonly modelConfiguredChange = output<boolean | null>();
}
@Component({
  selector: 'ptah-lane-rotation-setting',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class LaneRotationStubComponent {}

describe('DecisionMatrixPageComponent', () => {
  beforeEach(() =>
    TestBed.overrideComponent(DecisionMatrixPageComponent, {
      remove: {
        imports: [HostRoutingSettingComponent, LaneRotationSettingComponent],
      },
      add: { imports: [HostRoutingStubComponent, LaneRotationStubComponent] },
    }),
  );
  it('shows the back action and RPC-backed band', async () => {
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
    expect(root.querySelector('ptah-page-header')).toBeNull();
    expect(root.querySelectorAll('h1')).toHaveLength(0);
    expect(
      root.querySelector('button[aria-label="Context management"]'),
    ).not.toBeNull();
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
    expect(root.querySelector('ptah-host-routing-setting')).not.toBeNull();
    expect(root.querySelector('ptah-lane-rotation-setting')).not.toBeNull();
    expect(root.textContent).toContain('Needs a model');
    const routing = fixture.debugElement.query(
      By.directive(HostRoutingStubComponent),
    ).componentInstance as HostRoutingStubComponent;
    routing.modelConfiguredChange.emit(true);
    fixture.detectChanges();
    expect(
      root.querySelector(
        'ptah-instrument-band button[aria-label="Routing model On"]',
      ),
    ).not.toBeNull();
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
    expect(
      root.querySelector('[data-testid="capability-matrix-error"]'),
    ).not.toBeNull();
    expect(
      root.querySelector('[data-testid="capability-matrix-retry"]'),
    ).not.toBeNull();
    expect(root.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(root.querySelector('[aria-live="polite"]')?.textContent).toContain(
      'Ratings could not be loaded.',
    );
    fixture.destroy();
    TestBed.resetTestingModule();
  });
  it('shows page busy state while the table Retry request is pending', async () => {
    let resolveRetry!: (value: unknown) => void;
    const call = jest
      .fn()
      .mockResolvedValueOnce(rpcError('unavailable'))
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolveRetry = done;
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
    (
      root.querySelector(
        '[data-testid="capability-matrix-retry"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(refresh.getAttribute('aria-busy')).toBe('true');
    expect(root.querySelector('ptah-instrument-band .skeleton')).not.toBeNull();
    resolveRetry(rpcSuccess({ profiles: [] }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(refresh.getAttribute('aria-busy')).not.toBe('true');
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
    expect(root.textContent).toContain('3 results');
    const familyFilter = fixture.debugElement.queryAll(
      By.directive(PtahRichSelectComponent),
    )[0].componentInstance as PtahRichSelectComponent<string>;
    familyFilter.value.set('one');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.textContent).toContain('2 results');
    fixture.destroy();
    TestBed.resetTestingModule();
  });
});

import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ClaudeRpcService, ProvidersSettingsStateService } from '@ptah-extension/core';
import { rpcError, rpcSuccess } from '@ptah-extension/core/testing';
import { PTAH_CLOCK, type PtahClock } from '@ptah-extension/ui';
import { evidence, ratings } from './decision-matrix-dashboard.fixtures';
import { DecisionMatrixPageComponent } from './decision-matrix-page.component';
import { HostRoutingSettingComponent } from './host-routing-setting.component';
import { SettingsSaveFeedbackService } from '../feedback/settings-save-feedback.service';
import { PerformanceRoutingSettingComponent } from './performance-routing-setting.component';

@Component({
  selector: 'ptah-host-routing-setting',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class HostRoutingStub {
  readonly modelConfiguredChange = output<boolean | null>();
}
@Component({
  selector: 'ptah-performance-routing-setting',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
})
class PerformanceStub {}

describe('DecisionMatrixPageComponent', () => {
  let fixture: ComponentFixture<DecisionMatrixPageComponent>;
  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const call = jest.fn((method: string) => Promise.resolve(
    method === 'agent:getRoutingEvidence' ? rpcSuccess(evidence) : rpcSuccess(ratings),
  ));

  beforeEach(async () => {
    call.mockClear();
    await TestBed.configureTestingModule({
      imports: [DecisionMatrixPageComponent],
      providers: [
        {
          provide: ClaudeRpcService,
          useValue: { call: (method: string) => method === 'settings:get'
            ? Promise.resolve(rpcSuccess({ success: true, value: true }))
            : call(method) },
        },
        SettingsSaveFeedbackService,
        { provide: PTAH_CLOCK, useValue: { now: signal(Date.now()), acquire: () => () => undefined } satisfies PtahClock },
        {
          provide: ProvidersSettingsStateService,
          useValue: {
            commit: signal({ status: 'idle' }),
            cliAgents: signal({ status: 'ready', data: [] }),
            cliModels: signal({ status: 'ready', data: {} }),
          },
        },
      ],
    }).overrideComponent(DecisionMatrixPageComponent, {
      remove: { imports: [HostRoutingSettingComponent, PerformanceRoutingSettingComponent] },
      add: { imports: [HostRoutingStub, PerformanceStub] },
    }).compileComponents();
    fixture = TestBed.createComponent(DecisionMatrixPageComponent);
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function click(text: string): void {
    const button = Array.from(root().querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.trim() === text || candidate.getAttribute('aria-label') === text,
    );
    if (!button) throw new Error(`Missing button: ${text}`);
    button.click();
    fixture.detectChanges();
  }

  it('renders four KPIs, three charts, picks, catalog ages and one controls card', async () => {
    await settle();

    expect(root().getAttribute('role')).toBe('region');
    expect(root().getAttribute('aria-label')).toBe('Decision matrix dashboard');
    expect(root().querySelector('h1')).toBeNull();
    expect(root().textContent).not.toContain('How Ptah picks a lane, model and effort for each task.');
    const toolbar = root().querySelector('header');
    expect(toolbar?.querySelector('button[aria-label="Context management"]')).not.toBeNull();
    expect(toolbar?.querySelector('button[aria-label="Refresh decision matrix"]')).not.toBeNull();
    expect(toolbar?.textContent).toContain('Routing model: Unknown');
    expect(toolbar?.textContent).toContain('Updated');
    const rings = root().querySelectorAll('[data-testid="decision-matrix-kpis"] ptah-ring');
    expect(Array.from(rings, (ring) => ring.textContent?.trim())).toEqual(['67%', '70%', '17%', '100%']);
    const decisions = root().querySelector('details:has(> summary)');
    expect(decisions?.querySelector('summary')?.textContent).toBe('Decision models');
    expect(decisions?.hasAttribute('open')).toBe(false);
    expect(decisions?.textContent).toContain('Mean confidence');
    expect(decisions?.textContent).toContain('Approved');
    expect(root().querySelectorAll('[data-testid="decision-matrix-chart"]')).toHaveLength(3);
    expect(root().querySelector('ptah-donut')).not.toBeNull();
    expect(root().querySelector('[aria-label="Catalog health"]')?.textContent).toContain('Ready');
    expect(root().textContent).toContain('Rotates with Beta');
    expect(root().textContent).toContain('No evidence yet — falls back to lane order');
    expect(root().querySelector('[aria-labelledby="routing-controls-heading"] ptah-host-routing-setting + ptah-performance-routing-setting + ptah-lane-rotation-setting')).not.toBeNull();
    const host = fixture.debugElement.query(By.directive(HostRoutingStub)).injector.get(HostRoutingStub);
    host.modelConfiguredChange.emit(false);
    fixture.detectChanges();
    expect(root().textContent).toContain('Routing model: Off');
    host.modelConfiguredChange.emit(true);
    fixture.detectChanges();
    expect(root().textContent).toContain('Routing model: On');
    const back = jest.fn();
    fixture.componentInstance.back.subscribe(back);
    click('Context management');
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('keeps selection and provenance accessible across score sources', async () => {
    await settle();
    const selector = 'button[aria-label^="Alpha model-a implement"]';
    root().querySelector<HTMLButtonElement>(selector)?.click();
    fixture.detectChanges();

    expect(root().querySelector(selector)?.getAttribute('aria-pressed')).toBe('true');
    const content = () => root().querySelector('[aria-label="Selected cell detail"]')?.textContent;
    expect(content()).toContain('10 runs');
    expect(content()).toContain('Effort split');
    expect(content()).toContain('Reported by lane');
    expect(content()).toContain('high · 7 runs');
    expect(content()).toContain('80 / 100');
    const aside = root().querySelector('[aria-label="Selected cell detail"]');
    expect(aside?.hasAttribute('aria-live')).toBe(false);
    expect(root().querySelector('#matrix-heading')?.closest('section')?.querySelector('p[aria-live="polite"]')?.textContent)
      .toContain('Alpha model-a implement');
    expect(content()).toContain('Capacity drop-outs');
    expect(content()).toContain('Stale');
    expect(content()).toContain('Measured vs model rating');
    click('Model ratings');
    expect(root().querySelector(selector)?.getAttribute('aria-pressed')).toBe('true');
    expect(content()).toContain('72');
    expect(content()).toContain('seed');
    expect(content()).toContain('benchmark-v2');
    expect(content()).toContain('Catalog benchmark');
    expect(content()).toContain('Not counted');
    expect(content()).toContain('StaleYes');
    expect(root().textContent).toContain('Unrated');
  });

  it('renders loading and a retryable evidence error, then shows empty evidence', async () => {
    call.mockResolvedValueOnce(rpcError('Unable to load'));
    call.mockResolvedValueOnce(rpcSuccess(ratings));
    call.mockResolvedValueOnce(rpcSuccess({ ...evidence, lanes: [], laneFunnels: [] }));
    fixture.detectChanges();
    expect(root().textContent).toContain('Loading routing evidence');
    await settle();
    expect(root().textContent).toContain('Routing evidence could not be loaded.');
    click('Retry');
    await settle();
    expect(root().textContent).toContain('No lane evidence yet.');
    expect(root().textContent).toContain('No runs to show.');
    const rings = root().querySelectorAll('[data-testid="decision-matrix-kpis"] ptah-ring');
    expect(Array.from(rings, (ring) => ring.textContent?.trim())).toEqual(['—', '—', '—', '—']);
  });

  it('retries ratings independently and refreshes both datasets from the header', async () => {
    call.mockResolvedValueOnce(rpcSuccess(evidence));
    call.mockResolvedValueOnce(rpcError('Unable to load'));
    await settle();
    click('Model ratings');
    expect(root().textContent).toContain('Ratings could not be loaded.');
    click('Retry');
    await settle();
    expect(root().querySelector('table')).not.toBeNull();
    expect(call.mock.calls.map(([method]) => method)).toEqual([
      'agent:getRoutingEvidence', 'agent:getCapabilityMatrix', 'agent:getCapabilityMatrix',
    ]);
    click('Refresh decision matrix');
    await settle();
    expect(call.mock.calls.slice(3).map(([method]) => method)).toEqual([
      'agent:getRoutingEvidence', 'agent:getCapabilityMatrix',
    ]);
    expect(root().textContent).toContain('Updated');
  });

  it('shares one capability request with rotation and refreshes its chips even when evidence fails', async () => {
    call.mockResolvedValueOnce(rpcSuccess(evidence));
    call.mockResolvedValueOnce(rpcSuccess({
      ...ratings, lastPicks: [{ key: 'plan|plan', candidateId: 'alpha' }],
    }));
    await settle();

    const picks = () => root().querySelector('[data-testid="lane-rotation-last-picks"]')?.textContent;
    expect(picks()).toContain('Plan: Alpha');
    expect(call.mock.calls.map(([method]) => method)).toEqual([
      'agent:getRoutingEvidence', 'agent:getCapabilityMatrix',
    ]);
    call.mockResolvedValueOnce(rpcError('Unable to refresh evidence'));
    call.mockResolvedValueOnce(rpcSuccess({
      ...ratings, lastPicks: [{ key: 'plan|plan', candidateId: 'beta' }],
    }));
    click('Refresh decision matrix');
    await settle();

    expect(picks()).toContain('Plan: Beta');
    expect(root().textContent).not.toContain('Updated');
  });
});

import {
  ChangeDetectionStrategy,
  Component,
  input,
  signal,
} from '@angular/core';
import {
  DeferBlockState,
  TestBed,
  type ComponentFixture,
} from '@angular/core/testing';
import {
  ProvidersSettingsStateService,
  ClaudeRpcService,
  VSCodeService,
  type ProvidersSettingsCommit,
} from '@ptah-extension/core';
import { rpcSuccess, rpcError } from '@ptah-extension/core/testing';
import { By } from '@angular/platform-browser';
import { PtahInstrumentBandComponent } from '@ptah-extension/ui';
import { OrchestrationSettingsComponent } from './orchestration-settings.component';
import { SubagentCacheTtlSettingComponent } from './subagent-cache-ttl-setting.component';
import { SessionBudgetSettingsComponent } from './session-budget-settings.component';
import { LaneGuardsSettingsComponent } from './lane-guards-settings.component';
import { HostRoutingSettingComponent } from './host-routing-setting.component';
import { LaneRotationSettingComponent } from './lane-rotation-setting.component';
import { CapabilityMatrixSettingComponent } from './capability-matrix-setting.component';
import { AdvancedSettingsGroupComponent } from '../advanced/advanced-settings-group.component';

@Component({
  selector: 'ptah-subagent-cache-ttl-setting',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<section data-testid="subagent-cache-ttl-setting">TTL</section>',
})
class SubagentCacheTtlStub {}

@Component({
  selector: 'ptah-session-budget-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<section data-testid="session-budget-settings">Budget</section>',
})
class SessionBudgetStub {}

@Component({
  selector: 'ptah-lane-guards-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<section data-testid="lane-guards-settings">Guards</section>',
})
class LaneGuardsStub {}

@Component({
  selector: 'ptah-host-routing-setting',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<section data-testid="host-routing-setting">Routing</section>',
})
class HostRoutingStub {}

@Component({
  selector: 'ptah-lane-rotation-setting',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<section data-testid="lane-rotation-setting">Rotation</section>',
})
class LaneRotationStub {}

@Component({
  selector: 'ptah-capability-matrix-setting',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<section data-testid="capability-matrix-setting">Matrix</section>',
})
class CapabilityMatrixStub {}

@Component({
  selector: 'ptah-advanced-settings-group',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<section [attr.data-testid]="\'group-\' + groupId()"></section>',
})
class AdvancedGroupStub {
  readonly groupId = input.required<string>();
}

const idle: ProvidersSettingsCommit = {
  status: 'idle',
  saved: [],
  unsaved: [],
  unconfirmed: [],
  refreshFailed: false,
  message: null,
};

/** The container's own reads (its children are stubs). */
class StateStub {
  readonly orchestration = signal({
    status: 'ready',
    data: {
      subagentPromptCacheTtl: '5m',
      subagentPromptCacheTtlEnvOverride: '1h',
    },
  });
  readonly commit = signal<ProvidersSettingsCommit>(idle);
  readonly open = jest.fn(async () => undefined);
}

/** Context Management tab (tab id `orchestration`). */
describe('OrchestrationSettingsComponent', () => {
  let fixture: ComponentFixture<OrchestrationSettingsComponent>;
  let element: HTMLElement;
  let state: StateStub;
  let call: jest.Mock;

  async function setup(isElectron: boolean): Promise<void> {
    state = new StateStub();
    call = jest.fn(async (method: string, params?: { key: string }) => {
      if (method === 'agent:getConfig')
        return rpcSuccess({ laneRepeatCallStopAt: 8 });
      const values: Record<string, unknown> = {
        'sessionBudget.enabled': true,
        'sessionBudget.unit': 'tokens',
        'sessionBudget.tokens': 4_000_000,
        'sessionBudget.handoffPercent': 85,
        'agentOrchestration.hostRouting': false,
        'agentOrchestration.laneRotation': true,
      };
      return rpcSuccess({ success: true, value: values[params?.key ?? ''] });
    });
    await TestBed.configureTestingModule({
      imports: [OrchestrationSettingsComponent],
      providers: [
        { provide: ProvidersSettingsStateService, useValue: state },
        { provide: ClaudeRpcService, useValue: { call } },
        { provide: VSCodeService, useValue: { isElectron } },
      ],
    })
      .overrideComponent(OrchestrationSettingsComponent, {
        remove: {
          imports: [
            SubagentCacheTtlSettingComponent,
            SessionBudgetSettingsComponent,
            LaneGuardsSettingsComponent,
            HostRoutingSettingComponent,
            LaneRotationSettingComponent,
            CapabilityMatrixSettingComponent,
            AdvancedSettingsGroupComponent,
          ],
        },
        add: {
          imports: [
            SubagentCacheTtlStub,
            SessionBudgetStub,
            LaneGuardsStub,
            HostRoutingStub,
            LaneRotationStub,
            CapabilityMatrixStub,
            AdvancedGroupStub,
          ],
        },
      })
      .compileComponents();
    fixture = TestBed.createComponent(OrchestrationSettingsComponent);
    element = fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await setup(true);
  });
  afterEach(() => {
    fixture.destroy();
    TestBed.resetTestingModule();
  });

  async function render() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('opens the shared state once when mounted alone (a user can land here first)', async () => {
    await render();
    await render();
    expect(state.open).toHaveBeenCalledTimes(1);
  });

  it('renders six summaries from real sources above the deferred sections', async () => {
    await render();
    const band = fixture.debugElement.query(
      By.directive(PtahInstrumentBandComponent),
    ).componentInstance as PtahInstrumentBandComponent;
    expect(band.loading()).toBe(false);
    expect(band.segments()).toEqual([
      expect.objectContaining({
        id: 'prompt-cache',
        label: 'Prompt cache',
        value: '1 hour',
        meta: 'From environment',
      }),
      expect.objectContaining({
        id: 'session-budget',
        label: 'Session budget',
        value: 'On',
        meta: '4,000,000 tokens',
      }),
      expect.objectContaining({
        id: 'lane-guards',
        label: 'Lane guards',
        value: 'Handoff at 8',
      }),
      expect.objectContaining({
        id: 'routing',
        label: 'Routing',
        value: 'Off',
      }),
      expect.objectContaining({
        id: 'close-rotation',
        label: 'Close rotation',
        value: 'On',
      }),
      expect.objectContaining({ id: 'limits', label: 'Limits', value: '85%' }),
    ]);
    expect(element.querySelectorAll('ptah-instrument-band li')).toHaveLength(6);
    expect(
      element
        .querySelector('ptah-instrument-band')
        ?.compareDocumentPosition(
          element.querySelector('[data-testid="lane-guards-settings"]') as Node,
        ),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(element.querySelector('ptah-subagent-cache-ttl-setting')).toBeNull();
    expect(call).toHaveBeenCalledWith(
      'settings:get',
      { key: 'sessionBudget.tokens' },
      { timeout: 10_000 },
    );
  });

  it('shows cost units and an off budget from saved replies', async () => {
    call.mockImplementation(async (method: string, params?: { key: string }) =>
      method === 'agent:getConfig'
        ? rpcSuccess({})
        : rpcSuccess({
            success: true,
            value: (
              {
                'sessionBudget.enabled': false,
                'sessionBudget.unit': 'cost',
                'sessionBudget.usd': 12.5,
              } as Record<string, unknown>
            )[params?.key ?? ''],
          }),
    );
    await render();
    expect(
      element.querySelector('ptah-instrument-band')?.textContent,
    ).toContain('12.5 USD');
    const band = fixture.debugElement.query(
      By.directive(PtahInstrumentBandComponent),
    ).componentInstance as PtahInstrumentBandComponent;
    expect(band.segments()[1].value).toBe('Off');
    expect(band.segments()[2].value).toBe('Handoff at 20');
  });

  it('uses warning segments when RPC reads fail', async () => {
    call.mockResolvedValue(rpcError('Unavailable'));
    await render();
    const band = fixture.debugElement.query(
      By.directive(PtahInstrumentBandComponent),
    ).componentInstance as PtahInstrumentBandComponent;
    expect(band.loading()).toBe(false);
    expect(band.segments().slice(1)).toEqual(
      Array.from({ length: 5 }, () =>
        expect.objectContaining({ value: 'Unavailable', tone: 'warn' }),
      ),
    );
  });

  it('shows loading until page reads settle and warns on a rejected read', async () => {
    let reject!: (reason: Error) => void;
    // Only one pending operation: the others fail immediately.
    call.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    call.mockResolvedValue(rpcError('Unavailable'));
    fixture.detectChanges();
    const band = fixture.debugElement.query(
      By.directive(PtahInstrumentBandComponent),
    ).componentInstance as PtahInstrumentBandComponent;
    expect(band.loading()).toBe(true);
    reject(new Error('offline'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(band.loading()).toBe(false);
    expect(band.segments()[1]).toEqual(
      expect.objectContaining({ value: 'Unavailable', tone: 'warn' }),
    );
  });

  it('follows shared cache state and warns when its read fails', async () => {
    await render();
    state.orchestration.set({
      status: 'error',
      data: state.orchestration().data,
    });
    fixture.detectChanges();
    const band = fixture.debugElement.query(
      By.directive(PtahInstrumentBandComponent),
    ).componentInstance as PtahInstrumentBandComponent;
    expect(band.segments()[0]).toEqual(
      expect.objectContaining({ value: 'Unavailable', tone: 'warn' }),
    );
  });

  // The CLI matrix and the background roles moved to the Providers tab (AgentsRoutingSettingsComponent).
  it('holds no CLI matrix, no background roles and no deep-link focus section', async () => {
    await render();
    expect(element.querySelector('ptah-cli-orchestration-matrix')).toBeNull();
    expect(
      element.querySelector('[data-testid="cli-matrix-placeholder"]'),
    ).toBeNull();
    expect(
      element.querySelector('ptah-provider-consumer-assignments'),
    ).toBeNull();
    expect(
      element.querySelector('[data-testid="background-roles-details"]'),
    ).toBeNull();
    expect(element.querySelector('[data-focus]')).toBeNull();
  });

  it('defers the subagent cache TTL card behind a placeholder, first on the tab', async () => {
    await render();
    const ttl = () =>
      element.querySelector('[data-testid="subagent-cache-ttl-setting"]');
    const blocks = await fixture.getDeferBlocks();
    const block = blocks[0];
    await block.render(DeferBlockState.Placeholder);
    expect(
      element.querySelector('[data-testid="subagent-cache-ttl-placeholder"]'),
    ).not.toBeNull();
    expect(ttl()).toBeNull();
    await block.render(DeferBlockState.Complete);
    expect(ttl()).not.toBeNull();
  });

  it('keeps Lane guards independent from the viewport-deferred session budget card', async () => {
    await render();
    const budget = () =>
      element.querySelector('[data-testid="session-budget-settings"]');
    const blocks = await fixture.getDeferBlocks();
    expect(blocks).toHaveLength(3);
    const block = blocks[1];
    await block.render(DeferBlockState.Placeholder);
    expect(
      element.querySelector('[data-testid="session-budget-placeholder"]'),
    ).not.toBeNull();
    expect(budget()).toBeNull();
    // Lane guards is intentionally direct: it must not depend on a viewport/defer trigger.
    expect(
      element.querySelector('[data-testid="lane-guards-settings"]'),
    ).not.toBeNull();
    await block.render(DeferBlockState.Complete);
    await blocks[0].render(DeferBlockState.Complete);
    const ttl = element.querySelector(
      '[data-testid="subagent-cache-ttl-setting"]',
    );
    expect(ttl?.compareDocumentPosition(budget() as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    const guards = element.querySelector(
      '[data-testid="lane-guards-settings"]',
    );
    expect(budget()?.compareDocumentPosition(guards as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('defers the advanced orchestration groups behind a one-row placeholder, after the session budget and Lane guards (TASK_2026_658)', async () => {
    await render();
    const groupIds = () =>
      Array.from(
        element.querySelectorAll<HTMLElement>('[data-testid^="group-"]'),
      ).map((node) => node.dataset['testid']);
    const blocks = await fixture.getDeferBlocks();
    const block = blocks[2];
    await block.render(DeferBlockState.Placeholder);
    expect(
      element.querySelector(
        '[data-testid="orchestration-advanced-placeholder"]',
      ),
    ).not.toBeNull();
    expect(groupIds()).toEqual([]);

    await block.render(DeferBlockState.Complete);
    await blocks[1].render(DeferBlockState.Complete);
    expect(groupIds()).toEqual([
      'group-context-budgets',
      'group-background-queries',
    ]);
    const first = element.querySelector(
      '[data-testid="group-context-budgets"]',
    ) as Node;
    for (const before of [
      '[data-testid="session-budget-settings"]',
      '[data-testid="lane-guards-settings"]',
    ]) {
      expect(
        element.querySelector(before)?.compareDocumentPosition(first),
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
  });

  it('keeps Codex controls out of Context management while preserving background queries', async () => {
    await render();
    const sandbox = () =>
      element.querySelector('[data-testid="codex-sandbox-setting"]');
    const blocks = await fixture.getDeferBlocks();
    expect(blocks).toHaveLength(3);
    await blocks[2].render(DeferBlockState.Placeholder);
    expect(sandbox()).toBeNull();

    await blocks[2].render(DeferBlockState.Complete);
    const backgroundQueries = element.querySelector(
      '[data-testid="group-background-queries"]',
    );
    expect(sandbox()).toBeNull();
    expect(
      element.querySelector('[data-testid="group-codex-agents"]'),
    ).toBeNull();
    expect(backgroundQueries).not.toBeNull();
  });

  it('mounts neither routing suggestions nor lane rotation in Context, in Electron and outside it', async () => {
    for (const electron of [true, false]) {
      fixture.destroy();
      TestBed.resetTestingModule();
      await setup(electron);
      await render();
      for (const block of await fixture.getDeferBlocks())
        await block.render(DeferBlockState.Complete);
      expect(element.querySelector('ptah-host-routing-setting')).toBeNull();
      expect(element.querySelector('ptah-lane-rotation-setting')).toBeNull();
      expect(
        element.querySelector('[data-testid="lane-guards-settings"]'),
      ).not.toBeNull();
    }
  });

  it('shows no inline commit panel: the TTL save reports through the page toast', async () => {
    state.commit.set({
      ...idle,
      status: 'unconfirmed',
      saved: ['CLI instance'],
      unsaved: ['Tier'],
      unconfirmed: ['Key'],
    });
    await render();
    expect(
      element.querySelector('[data-testid="providers-commit-feedback"]'),
    ).toBeNull();
  });
});

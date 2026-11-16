import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Component, input, output } from '@angular/core';
import { By } from '@angular/platform-browser';
import { PtahTableComponent, PtahTableOrderButtonsComponent } from '@ptah-extension/ui';
import { CliModelEffortPopoverComponent } from './cli-model-effort-popover.component';
import type { CliMatrixCellField, CliMatrixRow } from './cli-matrix-rows';
import {
  LanesTableComponent,
  type LaneTableRow,
} from './lanes-table.component';

@Component({
  selector: 'ptah-cli-model-effort-popover',
  standalone: true,
  template: '',
})
class StubModelEffortPopoverComponent {
  readonly row = input.required<CliMatrixRow>();
  readonly field = input.required<CliMatrixCellField>();
  readonly closed = output<void>();
}

const instance = (
  id: string,
  patch: Partial<Extract<LaneTableRow, { kind: 'instance' }>> = {},
): LaneTableRow => ({
  kind: 'instance',
  id,
  name: `Lane ${id}`,
  status: { kind: 'ready', label: 'Ready', tone: 'success' },
  enabled: true,
  interactive: true,
  permission: { label: 'Ask', detail: 'Ask before edits' },
  runtimeStatus: null,
  providerId: 'local',
  provider: 'Local',
  keyStatus: { kind: 'keyless', label: 'No key needed' },
  tiers: [],
  selectedModel: null,
  effort: '',
  lastTest: null,
  ...patch,
});

const system = (
  id: 'codex' | 'copilot',
  patch: Partial<Extract<LaneTableRow, { kind: 'system' }>> = {},
): LaneTableRow => ({
  kind: 'system',
  id,
  name: id === 'codex' ? 'Codex' : 'Copilot',
  status: { kind: 'ready', label: 'Ready', tone: 'success' },
  enabled: true,
  interactive: true,
  permission: { label: 'Ask', detail: 'Ask before edits' },
  cli: id,
  installed: true,
  version: '1.2.3',
  versionLabel: 'v1.2.3',
  codexStatusLine: null,
  provider: null,
  model: { key: 'codexModel', value: '' },
  effort: null,
  credentialAction: false,
  ...patch,
});

const uninstalled = (id: 'codex' | 'copilot'): LaneTableRow =>
  system(id, {
    installed: false,
    enabled: false,
    interactive: false,
    version: null,
    versionLabel: null,
    status: { kind: 'not-installed', label: 'Not installed', tone: 'neutral' },
  });

async function mount(
  rows: readonly LaneTableRow[],
  orderMode = false,
): Promise<{
  fixture: ComponentFixture<LanesTableComponent>;
  host: HTMLElement;
}> {
  await TestBed.configureTestingModule({
    imports: [LanesTableComponent],
  })
    .overrideComponent(LanesTableComponent, {
      remove: { imports: [CliModelEffortPopoverComponent] },
      add: { imports: [StubModelEffortPopoverComponent] },
    })
    .compileComponents();
  const fixture = TestBed.createComponent(LanesTableComponent);
  fixture.componentRef.setInput('rows', rows);
  fixture.componentRef.setInput('orderMode', orderMode);
  fixture.detectChanges();
  return { fixture, host: fixture.nativeElement as HTMLElement };
}

const q = (host: HTMLElement, sel: string): HTMLElement | null =>
  host.querySelector<HTMLElement>(sel);

function narrow(fixture: ComponentFixture<LanesTableComponent>): void {
  const table = fixture.debugElement.query(By.directive(PtahTableComponent))
    .componentInstance as PtahTableComponent;
  Object.defineProperty(table, 'collapsed', { value: () => true });
  fixture.detectChanges();
}

describe('LanesTableComponent', () => {
  it('opens Model for the selected row and closes from the popover', async () => {
    const row = system('codex');
    const { fixture, host } = await mount([row]);
    const trigger = q(
      host,
      '[aria-label="Model default for Codex"]',
    ) as HTMLButtonElement;
    expect(trigger.disabled).toBe(false);
    trigger.click();
    fixture.detectChanges();
    const popovers = fixture.debugElement.queryAll(
      By.directive(StubModelEffortPopoverComponent),
    );
    expect(popovers).toHaveLength(1);
    const popover = popovers[0]
      .componentInstance as StubModelEffortPopoverComponent;
    expect(popover.row()).toBe(row);
    expect(popover.field()).toBe('model');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    popover.closed.emit();
    fixture.detectChanges();
    expect(
      fixture.debugElement.queryAll(
        By.directive(StubModelEffortPopoverComponent),
      ),
    ).toHaveLength(0);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens exactly one Model editor from the detail row', async () => {
    const row = system('codex');
    const { fixture, host } = await mount([row]);
    narrow(fixture);
    (q(host, 'ptah-table-row-expander button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const detail = q(host, '#lane-detail-codex') as HTMLElement;
    const trigger = detail.querySelector<HTMLButtonElement>(
      '[aria-label="Model default for Codex"]',
    ) as HTMLButtonElement;
    expect(trigger).not.toBeNull();
    trigger.click();
    fixture.detectChanges();
    const popovers = fixture.debugElement.queryAll(
      By.directive(StubModelEffortPopoverComponent),
    );
    expect(popovers).toHaveLength(1);
    expect(
      (
        popovers[0].componentInstance as StubModelEffortPopoverComponent
      ).field(),
    ).toBe('model');
    expect(
      (popovers[0].componentInstance as StubModelEffortPopoverComponent).row(),
    ).toBe(row);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(
      host.querySelectorAll('[data-testid="cli-matrix-model"]'),
    ).toHaveLength(1);
  });

  it('switches from the detail Model editor to the cell editor without duplication', async () => {
    const { fixture, host } = await mount([system('codex')]);
    narrow(fixture);
    (q(host, 'ptah-table-row-expander button') as HTMLButtonElement).click();
    fixture.detectChanges();
    const detailTrigger = q(
      host,
      '#lane-detail-codex [aria-label="Model default for Codex"]',
    ) as HTMLButtonElement;
    const cellTrigger = q(
      host,
      '[data-testid="cli-matrix-model"] [aria-label="Model default for Codex"]',
    ) as HTMLButtonElement;
    detailTrigger.click();
    fixture.detectChanges();
    expect(detailTrigger.getAttribute('aria-expanded')).toBe('true');
    cellTrigger.click();
    fixture.detectChanges();
    expect(
      fixture.debugElement.queryAll(
        By.directive(StubModelEffortPopoverComponent),
      ),
    ).toHaveLength(1);
    expect(detailTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(cellTrigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('opens Effort for a supported system row and only one popover at a time', async () => {
    const codex = system('codex', {
      effort: { key: 'codexReasoningEffort', value: 'high' },
    });
    const copilot = system('copilot', {
      effort: { key: 'copilotReasoningEffort', value: '' },
    });
    const { fixture, host } = await mount([codex, copilot]);
    const codexEffort = q(
      host,
      '[aria-label="Effort default for Codex"]',
    ) as HTMLButtonElement;
    expect(codexEffort.textContent?.trim()).toBe('high');
    codexEffort.click();
    fixture.detectChanges();
    let popovers = fixture.debugElement.queryAll(
      By.directive(StubModelEffortPopoverComponent),
    );
    expect(popovers).toHaveLength(1);
    expect(
      (
        popovers[0].componentInstance as StubModelEffortPopoverComponent
      ).field(),
    ).toBe('effort');
    expect(
      (popovers[0].componentInstance as StubModelEffortPopoverComponent).row(),
    ).toBe(codex);
    (
      q(host, '[aria-label="Model default for Copilot"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    popovers = fixture.debugElement.queryAll(
      By.directive(StubModelEffortPopoverComponent),
    );
    expect(popovers).toHaveLength(1);
    expect(
      (popovers[0].componentInstance as StubModelEffortPopoverComponent).row(),
    ).toBe(copilot);
    expect(codexEffort.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps noninteractive Model and Effort disabled and omits unsupported Effort', async () => {
    const { host } = await mount([
      uninstalled('codex'),
      instance('off', { interactive: false, selectedModel: '' }),
      system('copilot'),
    ]);
    expect(
      (q(host, '[aria-label="Model default for Codex"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        q(
          host,
          '[aria-label="Model default for Lane off"]',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        q(
          host,
          '[aria-label="Effort default for Lane off"]',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(q(host, '[aria-label="Effort default for Copilot"]')).toBeNull();
  });

  it('opens the instance Model and Effort editors', async () => {
    const row = instance('a', { selectedModel: 'local/model' });
    const { fixture, host } = await mount([row]);
    for (const field of ['model', 'effort'] as const) {
      (
        q(
          host,
          `[aria-label="${field === 'model' ? 'Model' : 'Effort'} default for Lane a"]`,
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      const popovers = fixture.debugElement.queryAll(
        By.directive(StubModelEffortPopoverComponent),
      );
      expect(popovers).toHaveLength(1);
      expect(
        (
          popovers[0].componentInstance as StubModelEffortPopoverComponent
        ).field(),
      ).toBe(field);
      expect(
        (
          popovers[0].componentInstance as StubModelEffortPopoverComponent
        ).row(),
      ).toBe(row);
    }
  });

  it('does not open an editor while busy or before an instance model loads', async () => {
    const { fixture, host } = await mount([
      system('codex'),
      instance('loading'),
    ]);
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    const trigger = q(
      host,
      '[aria-label="Model default for Codex"]',
    ) as HTMLButtonElement;
    expect(trigger.getAttribute('aria-busy')).toBe('true');
    trigger.click();
    fixture.detectChanges();
    expect(
      fixture.debugElement.queryAll(
        By.directive(StubModelEffortPopoverComponent),
      ),
    ).toHaveLength(0);
    expect(q(host, '[aria-label="Model default for Lane loading"]')).toBeNull();
    expect(
      q(host, '[aria-label="Effort default for Lane loading"]'),
    ).not.toBeNull();
  });
  it('keeps instance row hooks and emits toggle and actions', async () => {
    const row = instance('local-one', { name: 'Local one' });
    const { fixture, host } = await mount([row]);
    const toggled = jest.fn();
    const tested = jest.fn();
    fixture.componentInstance.toggled.subscribe(toggled);
    fixture.componentInstance.test.subscribe(tested);

    expect(q(host, '[data-testid="cli-matrix-row-local-one"]')).not.toBeNull();
    q(host, '[aria-label="Local one enabled"]')?.click();
    expect(toggled).toHaveBeenCalledWith(expect.objectContaining({ row }));

    q(host, '[aria-label="More actions for Local one"]')?.click();
    fixture.detectChanges();
    q(host, '[data-testid="cli-matrix-test-local-one"]')?.click();
    expect(tested).toHaveBeenCalledWith(row);
  });

  it('emits edit, delete and capabilities from the actions menu', async () => {
    const row = instance('a');
    const { fixture, host } = await mount([row]);
    const edit = jest.fn();
    const del = jest.fn();
    const caps = jest.fn();
    fixture.componentInstance.edit.subscribe(edit);
    fixture.componentInstance.delete.subscribe(del);
    fixture.componentInstance.capabilities.subscribe(caps);

    const open = () => {
      const trigger = q(
        host,
        '[aria-label="More actions for Lane a"]',
      ) as HTMLButtonElement;
      trigger.click();
      fixture.detectChanges();
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(q(host, 'ptah-table-row-actions [role="menu"]')).not.toBeNull();
    };
    open();
    expect(q(host, '[data-testid="cli-matrix-edit-a"]')).not.toBeNull();
    fixture.detectChanges();
    q(host, '[data-testid="cli-matrix-edit-a"]')?.click();
    open();
    q(host, '[data-testid="cli-matrix-delete-a"]')?.click();
    fixture.detectChanges();
    expect(q(host, 'ptah-inline-confirm')).not.toBeNull();
    const confirm = q(host, 'ptah-inline-confirm button') as HTMLButtonElement;
    confirm.click();
    fixture.detectChanges();
    open();
    const all = Array.from(host.querySelectorAll<HTMLElement>('button')).find(
      (b) => b.textContent?.trim() === 'All capabilities',
    );
    all?.click();

    expect(edit).toHaveBeenCalledWith(row);
    expect(del).toHaveBeenCalledWith(row);
    expect(caps).toHaveBeenCalledWith(row);
  });

  it('cancels Delete and returns focus to the row actions trigger', async () => {
    const row = instance('a');
    const { fixture, host } = await mount([row]);
    const deleted = jest.fn();
    fixture.componentInstance.delete.subscribe(deleted);
    const trigger = q(
      host,
      '[aria-label="More actions for Lane a"]',
    ) as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    (
      q(host, '[data-testid="cli-matrix-delete-a"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(q(host, 'ptah-inline-confirm')).not.toBeNull();
    expect(document.activeElement?.textContent?.trim()).toBe('Cancel');
    const cancel = Array.from(
      host.querySelectorAll('ptah-inline-confirm button'),
    ).find(
      (button) => button.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    cancel.click();
    fixture.detectChanges();
    await Promise.resolve();
    expect(q(host, 'ptah-inline-confirm')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(deleted).not.toHaveBeenCalled();
  });

  it('focuses the next row actions trigger when Confirm removes the deleted row', async () => {
    const rows = [instance('a'), instance('b')];
    const { fixture, host } = await mount(rows);
    let completeDelete: (() => void) | undefined;
    const deleted = jest.fn((row: LaneTableRow) => {
      completeDelete = () => fixture.componentRef.setInput('rows', rows.filter((item) => item !== row));
    });
    fixture.componentInstance.delete.subscribe(deleted);
    const original = q(host, '[aria-label="More actions for Lane a"]') as HTMLButtonElement;
    original.click();
    fixture.detectChanges();
    (q(host, '[data-testid="cli-matrix-delete-a"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (q(host, 'ptah-inline-confirm button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(original);
    completeDelete?.();
    fixture.detectChanges();
    await Promise.resolve();
    expect(deleted).toHaveBeenCalledWith(rows[0]);
    expect(q(host, '[data-testid="cli-matrix-row-a"]')).toBeNull();
    expect(document.activeElement).toBe(q(host, '[aria-label="More actions for Lane b"]'));
  });

  it('keeps the delete focus fallback while the row stays, then focuses it on removal', async () => {
    const rows = [instance('a'), instance('b')];
    const { fixture, host } = await mount(rows);
    (q(host, '[aria-label="More actions for Lane a"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (q(host, '[data-testid="cli-matrix-delete-a"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (q(host, 'ptah-inline-confirm button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentRef.setInput('rows', [...rows]);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.componentRef.setInput('rows', [rows[1]]);
    fixture.detectChanges();
    await Promise.resolve();
    expect(q(host, '[data-testid="cli-matrix-row-a"]')).toBeNull();
    expect(document.activeElement).toBe(q(host, '[aria-label="More actions for Lane b"]'));
  });

  it('focuses the next row actions trigger when Confirm removes the row synchronously', async () => {
    const rows = [instance('a'), instance('b')];
    const { fixture, host } = await mount(rows);
    fixture.componentInstance.delete.subscribe((row) => {
      fixture.componentRef.setInput('rows', rows.filter((item) => item !== row));
    });
    (q(host, '[aria-label="More actions for Lane a"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (q(host, '[data-testid="cli-matrix-delete-a"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    (q(host, 'ptah-inline-confirm button') as HTMLButtonElement).click();
    fixture.detectChanges();
    await Promise.resolve();
    expect(document.activeElement).toBe(q(host, '[aria-label="More actions for Lane b"]'));
  });

  describe('order', () => {
    it('blocks moves while busy or without write permission', async () => {
      const a = instance('a');
      const b = instance('b');
      const { fixture, host } = await mount([a, b], true);
      const moved = jest.fn();
      fixture.componentInstance.moved.subscribe(moved);
      const button = q(host, '[data-testid="cli-matrix-row-a"] [data-order-down]') as HTMLButtonElement;
      const order = fixture.debugElement.queryAll(By.directive(PtahTableOrderButtonsComponent))[0]
        .componentInstance as PtahTableOrderButtonsComponent;
      for (const blocked of [{ busy: true }, { busyRows: { a: true } }, { canWrite: false }]) {
        fixture.componentRef.setInput('busy', false);
        fixture.componentRef.setInput('busyRows', {});
        fixture.componentRef.setInput('canWrite', true);
        for (const [key, value] of Object.entries(blocked)) fixture.componentRef.setInput(key, value);
        fixture.detectChanges();
        expect(button.matches(':disabled')).toBe(true);
        button.click();
        order.moveDown.emit();
        expect(moved).not.toHaveBeenCalled();
      }
    });
    it('emits moved up and down and disables the ends', async () => {
      const a = instance('a');
      const b = instance('b');
      const { fixture, host } = await mount([a, b], true);
      const moved = jest.fn();
      fixture.componentInstance.moved.subscribe(moved);
      const rowA = q(host, '[data-testid="cli-matrix-row-a"]') as HTMLElement;
      const rowB = q(host, '[data-testid="cli-matrix-row-b"]') as HTMLElement;
      const btn = (r: HTMLElement, dir: 'up' | 'down') =>
        r.querySelector<HTMLButtonElement>(
          `[data-order-${dir}]`,
        ) as HTMLButtonElement;

      expect(btn(rowA, 'up').disabled).toBe(true);
      expect(btn(rowA, 'down').disabled).toBe(false);
      expect(btn(rowB, 'up').disabled).toBe(false);
      expect(btn(rowB, 'down').disabled).toBe(true);

      btn(rowA, 'down').click();
      btn(rowB, 'up').click();
      expect(moved).toHaveBeenNthCalledWith(1, { row: a, direction: 1 });
      expect(moved).toHaveBeenNthCalledWith(2, { row: b, direction: -1 });
    });

    it('counts positioned rows only, so the last one before an uninstalled row cannot move down', async () => {
      const { host } = await mount(
        [instance('a'), instance('b'), uninstalled('copilot')],
        true,
      );
      const rowB = q(host, '[data-testid="cli-matrix-row-b"]') as HTMLElement;
      const rowA = q(host, '[data-testid="cli-matrix-row-a"]') as HTMLElement;
      expect(
        (rowB.querySelector('[data-order-down]') as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(
        (rowA.querySelector('[data-order-down]') as HTMLButtonElement).disabled,
      ).toBe(false);
    });

    it('skips an uninstalled row in the middle when indexing', async () => {
      const { host } = await mount(
        [instance('a'), uninstalled('copilot'), instance('b')],
        true,
      );
      const rowA = q(host, '[data-testid="cli-matrix-row-a"]') as HTMLElement;
      const rowB = q(host, '[data-testid="cli-matrix-row-b"]') as HTMLElement;
      expect(
        (rowA.querySelector('[data-order-down]') as HTMLButtonElement).disabled,
      ).toBe(false);
      expect(
        (rowB.querySelector('[data-order-up]') as HTMLButtonElement).disabled,
      ).toBe(false);
      expect(
        (rowB.querySelector('[data-order-down]') as HTMLButtonElement).disabled,
      ).toBe(true);
    });

    it('shows the rank when order mode is off', async () => {
      const { host } = await mount([
        instance('a', {}),
        { ...instance('b'), order: 7 },
      ]);
      expect(host.querySelector('[data-order-up]')).toBeNull();
      const cells = (id: string) =>
        q(host, `[data-testid="cli-matrix-row-${id}"] td`)?.textContent?.trim();
      expect(cells('a')).toBe('1');
      expect(cells('b')).toBe('7');
    });
  });

  describe('uninstalled system row', () => {
    it('is muted, shows a dash, no order buttons and a disabled toggle', async () => {
      const { fixture, host } = await mount([uninstalled('copilot')], true);
      const attention = jest.fn();
      fixture.componentInstance.installGuide.subscribe(attention);
      const row = q(host, '[data-testid="cli-provider-card-copilot"]');
      expect(row?.getAttribute('data-state')).toBe('muted');
      expect(row?.querySelector('td')?.textContent?.trim()).toBe('—');
      expect(row?.querySelector('[data-order-up]')).toBeNull();
      expect(
        (q(host, '[aria-label="Copilot enabled"]') as HTMLInputElement)
          .disabled,
      ).toBe(true);
      const guide = Array.from(host.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Install guide',
      );
      guide?.click();
      expect(attention).toHaveBeenCalledTimes(1);
    });
  });

  describe('system row', () => {
    it('has card and version hooks and a clean model label', async () => {
      const { host } = await mount([
        system('codex', {
          model: { key: 'codexModel', value: 'gpt-5\tGPT 5' },
        }),
      ]);
      expect(q(host, '[data-testid="cli-provider-card-codex"]')).not.toBeNull();
      const version = q(host, '[data-testid="cli-matrix-version"]');
      expect(version?.textContent).toContain('v1.2.3');
      expect(version?.getAttribute('title')).toBe('v1.2.3');
      const model = q(host, '[data-testid="cli-matrix-model"]');
      expect(model?.textContent?.trim()).toBe('gpt-5');
      expect(model?.getAttribute('title')).toBe('gpt-5 (GPT 5)');
    });

    it('shows CLI default for an empty model', async () => {
      const { host } = await mount([system('codex')]);
      expect(
        q(host, '[data-testid="cli-matrix-model"]')?.textContent?.trim(),
      ).toBe('CLI default');
    });
  });

  describe('instance status', () => {
    it('shows Sign in for needs-key and emits attention', async () => {
      const row = instance('a', {
        status: { kind: 'needs-key', label: 'Needs API key', tone: 'warning' },
      });
      const { fixture, host } = await mount([row]);
      const attention = jest.fn();
      fixture.componentInstance.signIn.subscribe(attention);
      const signIn = Array.from(host.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Sign in',
      );
      expect(signIn).toBeDefined();
      signIn?.click();
      expect(attention).toHaveBeenCalledWith(row);
      expect(
        q(host, '[data-testid="cli-matrix-status"]')?.getAttribute('data-tone'),
      ).toBe('warn');
    });

    it('shows the runtime status and a missing key', async () => {
      const { host } = await mount([
        instance('a', {
          runtimeStatus: 'Error',
          keyStatus: { kind: 'missing', label: 'Key missing' },
        }),
      ]);
      expect(
        q(
          host,
          '[data-testid="cli-matrix-runtime-status"]',
        )?.textContent?.trim(),
      ).toBe('Error');
      expect(
        q(host, '[data-testid="cli-matrix-key-status"]')?.textContent?.trim(),
      ).toBe('Key missing');
    });

    it('hides the key badge when a key is set or not needed', async () => {
      const { host } = await mount([instance('a')]);
      expect(q(host, '[data-testid="cli-matrix-key-status"]')).toBeNull();
      expect(q(host, '[data-testid="cli-matrix-runtime-status"]')).toBeNull();
    });

    it('tells a loaded empty model from a model that is not loaded', async () => {
      const { host } = await mount([
        instance('a', { selectedModel: '' }),
        instance('b', { selectedModel: null }),
      ]);
      const model = (id: string) =>
        q(
          host,
          `[data-testid="cli-matrix-row-${id}"] [data-testid="cli-matrix-model"]`,
        )?.textContent?.trim();
      expect(model('a')).toContain('provider default');
      expect(model('b')).toContain('—');
    });
  });

  it('does not show a config hint without a source', async () => {
    const { host } = await mount([instance('a')]);
    expect(q(host, '[role="img"]')).toBeNull();
  });

  it('shows the empty state in a message cell', async () => {
    const { host } = await mount([]);
    const cell = q(host, 'td.ptah-table-message-cell');
    expect(cell?.textContent).toContain('No lanes available.');
    expect(cell?.getAttribute('colspan')).toBe('9');
  });

  it('distinguishes loading and error from an empty result and retries', async () => {
    const { fixture, host } = await mount([]);
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    expect(host.textContent).toContain('Loading lanes');
    expect(host.textContent).not.toContain('No lanes available');
    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('error', 'Could not load lanes');
    fixture.detectChanges();
    const retry = jest.fn();
    fixture.componentInstance.retry.subscribe(retry);
    expect(host.textContent).toContain('Could not load lanes');
    Array.from(host.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Retry')
      ?.click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('clears the editor when its row is removed and reinserted', async () => {
    const row = system('codex');
    const { fixture, host } = await mount([row]);
    (
      q(host, '[aria-label="Model default for Codex"]') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(
      fixture.debugElement.queryAll(
        By.directive(StubModelEffortPopoverComponent),
      ),
    ).toHaveLength(1);
    fixture.componentRef.setInput('rows', []);
    fixture.detectChanges();
    fixture.componentRef.setInput('rows', [row]);
    fixture.detectChanges();
    expect(
      fixture.debugElement.queryAll(
        By.directive(StubModelEffortPopoverComponent),
      ),
    ).toHaveLength(0);
  });

  it('guards writes and announces test progress once', async () => {
    const row = instance('a');
    const { fixture, host } = await mount([row]);
    fixture.componentRef.setInput('canWrite', false);
    fixture.componentRef.setInput('testingRows', { a: true });
    fixture.detectChanges();
    const toggle = q(
      host,
      '[data-testid="cli-matrix-toggle-a"]',
    ) as HTMLInputElement;
    expect(toggle.disabled).toBe(true);
    toggle.checked = false;
    toggle.dispatchEvent(new Event('change'));
    expect(toggle.checked).toBe(true);
    q(host, '[aria-label="More actions for Lane a"]')?.click();
    fixture.detectChanges();
    expect(
      (q(host, '[data-testid="cli-matrix-test-a"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(host.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    await Promise.resolve();
    fixture.detectChanges();
    expect(q(host, '[aria-live="polite"]')?.textContent).toContain(
      'Running test for Lane a',
    );
  });

  it('disables Test for uninstalled and busy rows and displays a result', async () => {
    const { fixture, host } = await mount([
      uninstalled('copilot'),
      instance('a'),
    ]);
    fixture.componentRef.setInput('busyRows', { a: true });
    fixture.componentRef.setInput('testResults', { a: 'Answered in 1.4 s' });
    fixture.detectChanges();
    for (const name of ['Copilot', 'Lane a']) {
      q(host, `[aria-label="More actions for ${name}"]`)?.click();
      fixture.detectChanges();
      const row = q(
        host,
        name === 'Copilot'
          ? '[data-testid="cli-provider-card-copilot"]'
          : '[data-testid="cli-matrix-row-a"]',
      );
      expect(
        (row?.querySelector('[role="menuitem"]') as HTMLButtonElement).disabled,
      ).toBe(true);
    }
    expect(host.textContent).toContain('Answered in 1.4 s');
  });

  it('toggles the detail row through the expander', async () => {
    const { fixture, host } = await mount([instance('a')]);
    const detail = q(host, '#lane-detail-a') as HTMLElement;
    expect(detail).not.toBeNull();
    expect(detail.hidden).toBe(true);
    const button = q(
      host,
      'ptah-table-row-expander button',
    ) as HTMLButtonElement;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBe('lane-detail-a');
  });
});
